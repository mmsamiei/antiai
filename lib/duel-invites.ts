import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const INVITE_MS = 120_000;
export const ONLINE_MS = 20_000;
export const READY_MS = 15_000;
export const publicPlayerSelect = { id: true, firstName: true, lastName: true, username: true, photoUrl: true } as const;
export const inviteInclude = { sender: { select: publicPlayerSelect }, recipient: { select: publicPlayerSelect }, connection: { select: { status: true } } } as const;
type Tx = Prisma.TransactionClient;
export class InviteError extends Error { constructor(message: string, public status = 409) { super(message); } }
export async function inviteTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034" && attempt < 3) continue; throw e; }
  }
}
export async function lockPlayers(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
}
export function pendingInvalidReason(expiresAt: Date, now: Date, senderOnline: boolean, recipientOnline: boolean, busy: boolean) {
  if (expiresAt <= now) return "مهلت دعوت تمام شد";
  if (!senderOnline || !recipientOnline) return "یکی از بازیکن‌ها دیگر آنلاین نیست";
  if (busy) return "یکی از بازیکن‌ها وارد دوحرف دیگری شده است";
  return null;
}
// Expiry is enforced on reads and writes, never trusted to a browser timer.
export async function reconcileInvites(tx: Tx, userId: string, now = new Date()) {
  // Release abandoned legacy rooms as well; otherwise an old WAITING room blocks invitations forever.
  const stale = await tx.letterDuelConnection.findMany({ where: {
    status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }],
    AND: [{ OR: [{ playerOneHeartbeat: { lt: new Date(now.getTime() - 30_000) } }, { playerTwoId: { not: null }, playerTwoHeartbeat: { lt: new Date(now.getTime() - 30_000) } }] }],
    NOT: { directInvite: { is: { status: "ACCEPTED" } }, status: "WAITING" }
  }, select: { id: true } });
  for (const room of stale) {
    await tx.gameSession.updateMany({ where: { status: "ACTIVE", letterDuelRound: { connectionId: room.id } }, data: { status: "SURRENDERED", finishedAt: now } });
    await tx.letterDuelRound.updateMany({ where: { connectionId: room.id, status: { in: ["PICKING", "ANSWERING", "JUDGING"] } }, data: { status: "CANCELLED", resolvedAt: now } });
    await tx.letterDuelConnection.updateMany({ where: { id: room.id, status: { in: ["WAITING", "ACTIVE"] } }, data: { status: "ENDED", endedAt: now } });
  }
  const invites = await tx.duelInvite.findMany({ where: { AND: [{ OR: [{ senderId: userId }, { recipientId: userId }] }, { OR: [{ status: "PENDING" }, { status: "ACCEPTED", OR: [{ connection: { is: { status: "WAITING" } } }, { senderReadyAt: null }, { recipientReadyAt: null }] }] }] }, include: { connection: true } });
  const ids = [...new Set(invites.flatMap(i => [i.senderId, i.recipientId]))];
  const online = new Set((await tx.onlinePresence.findMany({ where: { userId: { in: ids }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } }, select: { userId: true } })).map(p => p.userId));
  const busy = await tx.letterDuelConnection.findMany({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] }, select: { id: true, playerOneId: true, playerTwoId: true, createdAt: true } });
  for (const invite of invites) {
    let reason: string | null = null;
    if (invite.status === "PENDING") reason = pendingInvalidReason(invite.expiresAt, now, online.has(invite.senderId), online.has(invite.recipientId), busy.some(c => c.playerOneId === invite.senderId || c.playerTwoId === invite.senderId || c.createdAt > invite.createdAt && (c.playerOneId === invite.recipientId || c.playerTwoId === invite.recipientId)));
    else if (invite.connection?.status === "WAITING" && invite.startDeadline && invite.startDeadline <= now) reason = "هر دو بازیکن به‌موقع وارد اتاق نشدند";
    else if (invite.connection?.status === "ENDED" && (!invite.senderReadyAt || !invite.recipientReadyAt)) reason = "شروع بازی لغو شد";
    if (!reason) continue;
    const changed = await tx.duelInvite.updateMany({ where: { id: invite.id, status: invite.status }, data: { status: invite.status === "PENDING" && invite.expiresAt <= now ? "EXPIRED" : "CANCELLED", reason, respondedAt: now } });
    if (changed.count && invite.connectionId) await tx.letterDuelConnection.updateMany({ where: { id: invite.connectionId, status: "WAITING" }, data: { status: "ENDED", endedAt: now } });
  }
}
export async function readInvites(userId: string) {
  return inviteTransaction(async tx => {
    await reconcileInvites(tx, userId);
    const participants = { OR: [{ senderId: userId }, { recipientId: userId }] };
    const [user, active, recent] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { acceptsGameInvites: true } }),
      tx.duelInvite.findMany({ where: { ...participants, AND: [{ OR: [{ status: "PENDING" }, { status: "ACCEPTED", connection: { is: { status: { in: ["WAITING", "ACTIVE"] } } } }] }] }, include: inviteInclude }),
      tx.duelInvite.findMany({ where: participants, include: inviteInclude, orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    // Never truncate a pending invitation or the active room behind older history.
    const invites = [...new Map([...recent, ...active].map(i => [i.id, i])).values()].sort((a, b) => +b.createdAt - +a.createdAt);
    return { ...user, invites, serverNow: new Date() };
  });
}
export async function sendInvite(senderId: string, recipientId: string) {
  if (senderId === recipientId) throw new InviteError("نمی‌توانی خودت را دعوت کنی", 400);
  await inviteTransaction(async tx => { await reconcileInvites(tx, senderId); await reconcileInvites(tx, recipientId); });
  return inviteTransaction(async tx => {
    await lockPlayers(tx, [senderId, recipientId]);
    await reconcileInvites(tx, senderId); await reconcileInvites(tx, recipientId);
    const recipient = await tx.user.findUnique({ where: { id: recipientId } });
    if (!recipient) throw new InviteError("بازیکن پیدا نشد", 404);
    if (!recipient.acceptsGameInvites) throw new InviteError("این بازیکن دریافت دعوت را خاموش کرده است");
    const now = new Date();
    const online = await tx.onlinePresence.count({ where: { userId: { in: [senderId, recipientId] }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } });
    if (online !== 2) throw new InviteError("برای دعوت، هر دو بازیکن باید آنلاین باشند");
    if (await tx.letterDuelConnection.count({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: senderId }, { playerTwoId: senderId }] } })) throw new InviteError("یکی از بازیکن‌ها در دوحرف دیگری است");
    if (await tx.duelInvite.count({ where: { senderId, status: "PENDING" } })) throw new InviteError("ابتدا دعوت قبلی را لغو کن");
    if (await tx.duelInvite.count({ where: { senderId, recipientId, createdAt: { gt: new Date(now.getTime() - INVITE_MS) } } })) throw new InviteError("برای دعوت دوباره به این بازیکن دو دقیقه صبر کن", 429);
    return tx.duelInvite.create({ data: { senderId, recipientId, expiresAt: new Date(now.getTime() + INVITE_MS) }, include: inviteInclude });
  });
}
export async function actOnInvite(userId: string, id: string, action: "accept" | "reject" | "cancel" | "ready") {
  // Commit reconciliation separately so failed/stale actions cannot roll expiry back.
  await inviteTransaction(tx => reconcileInvites(tx, userId));
  return inviteTransaction(async tx => {
    const initial = await tx.duelInvite.findUnique({ where: { id } });
    if (!initial || ![initial.senderId, initial.recipientId].includes(userId)) throw new InviteError("دعوت پیدا نشد", 404);
    await lockPlayers(tx, [initial.senderId, initial.recipientId]);
    const invite = await tx.duelInvite.findUniqueOrThrow({ where: { id }, include: { connection: true } });
    const now = new Date();
    if (action === "ready") {
      if (invite.status !== "ACCEPTED" || !invite.connectionId || !invite.startDeadline || (invite.connection?.status !== "ACTIVE" && invite.startDeadline <= now)) throw new InviteError("این دعوت دیگر آمادهٔ شروع نیست");
      if (invite.connection?.status === "ENDED") throw new InviteError("بازی تمام شده است");
      if (await tx.onlinePresence.count({ where: { userId: { in: [invite.senderId, invite.recipientId] }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } }) !== 2) throw new InviteError("یکی از بازیکن‌ها دیگر آنلاین نیست");
      const ready = await tx.duelInvite.update({ where: { id }, data: invite.senderId === userId ? { senderReadyAt: now } : { recipientReadyAt: now } });
      if (ready.senderReadyAt && ready.recipientReadyAt && invite.connection?.status === "WAITING") {
        await tx.letterDuelConnection.update({ where: { id: invite.connectionId }, data: { status: "ACTIVE", startedAt: now, playerOneHeartbeat: now, playerTwoHeartbeat: now } });
      }
      return ready;
    }
    if (action === "accept" && invite.recipientId !== userId || action === "reject" && invite.recipientId !== userId || action === "cancel" && invite.senderId !== userId) throw new InviteError("اجازهٔ این عملیات را نداری", 403);
    if (action === "accept" && invite.status === "ACCEPTED" && invite.connection?.status !== "ENDED") return invite;
    if (invite.status !== "PENDING" || invite.expiresAt <= now) throw new InviteError(invite.reason || "این دعوت دیگر معتبر نیست");
    if (action !== "accept") return tx.duelInvite.update({ where: { id }, data: { status: action === "reject" ? "REJECTED" : "CANCELLED", reason: action === "reject" ? "دعوت رد شد" : "فرستنده دعوت را لغو کرد", respondedAt: now } });
    const online = await tx.onlinePresence.count({ where: { userId: { in: [invite.senderId, invite.recipientId] }, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) } } });
    if (online !== 2) throw new InviteError("یکی از بازیکن‌ها دیگر آنلاین نیست");
    const recipient = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!recipient.acceptsGameInvites) throw new InviteError("دریافت دعوت خاموش است");
    const ids = [invite.senderId, invite.recipientId];
    if (await tx.letterDuelConnection.count({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] } })) throw new InviteError("یکی از بازیکن‌ها در دوحرف دیگری است");
    const connection = await tx.letterDuelConnection.create({ data: { mode: "PRIVATE", status: "WAITING", playerOneId: invite.senderId, playerTwoId: invite.recipientId } });
    await tx.duelInvite.updateMany({ where: { id: { not: id }, status: "PENDING", OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] }, data: { status: "CANCELLED", reason: "یکی از بازیکن‌ها دعوت دیگری را پذیرفت", respondedAt: now } });
    return tx.duelInvite.update({ where: { id }, data: { status: "ACCEPTED", respondedAt: now, connectionId: connection.id, startDeadline: new Date(now.getTime() + READY_MS) } });
  });
}
export async function setInvitePreference(userId: string, enabled: boolean) {
  return inviteTransaction(async tx => {
    await lockPlayers(tx, [userId]);
    await tx.user.update({ where: { id: userId }, data: { acceptsGameInvites: enabled } });
    if (!enabled) await tx.duelInvite.updateMany({ where: { recipientId: userId, status: "PENDING" }, data: { status: "CANCELLED", reason: "دریافت دعوت خاموش شد", respondedAt: new Date() } });
  });
}
