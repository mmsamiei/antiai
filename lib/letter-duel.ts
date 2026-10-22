import crypto from "crypto";
import { publicDisplayName, publicUsername } from "./public-identity";
import { countryRaceBusy } from "./country-race-state";
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "./prisma";
import { DUEL_TARGET_WINS, DUEL_RECONNECT_MS, DUEL_REMATCH_MS, disconnectedDuelWinner, endDuelMatch } from "./letter-duel-match";
import { inviteTransaction, lockPlayers, reconcileInvites, READY_MS } from "./duel-invites";
import { normalizePersian } from "./geo";
import { wordPrompts } from "./data/adjective-prompts";
import { semantrisCategories } from "./data/semantris-categories";

export const PERSIAN_LETTERS = [..."ابتثجچحخدذرزژسشصضطظعغفقکگلمنوهی"];
export const PICK_MS = 5_000;
export const ANSWER_MS = 15_000;
export const RECONNECT_MS = DUEL_RECONNECT_MS;
export const RESULT_MS = 2_500;
const lexiconFile = readFileSync(join(process.cwd(), "lib/data/letter-duel-lexicon.txt"), "utf8");
const localWords = new Set([...lexiconFile.split(/\r?\n/), ...wordPrompts.flatMap((p) => [p.name, ...p.examples]), ...semantrisCategories.flatMap((c) => c.words)].map(normalizePersian).filter((w) => w && !w.includes(" ") && !w.startsWith("#")));
const JUDGE_VERSION = 2;

export function randomPersianLetter(random = Math.random) { return PERSIAN_LETTERS[Math.floor(random() * PERSIAN_LETTERS.length)]; }
export function validateLetterWord(raw: string, letters: string[]) {
  const word = normalizePersian(raw);
  if (word.length < 3) return { word, valid: false, reason: "واژه باید دست‌کم سه حرف داشته باشد." };
  if (!word || word.length < 3 || word.length > 32 || word.includes(" ") || !/^[\u0600-\u06ff]+$/u.test(word)) return { word, valid: false, reason: "یک واژهٔ فارسی و تک‌کلمه‌ای بنویس." };
  const needed = new Map<string, number>();
  for (const letter of letters) needed.set(letter, (needed.get(letter) || 0) + 1);
  for (const [letter, count] of needed) if ([...word].filter((item) => item === letter).length < count) return { word, valid: false, reason: `واژه باید حرف «${letter}» را${count > 1 ? ` ${count.toLocaleString("fa-IR")} بار` : ""} داشته باشد.` };
  return { word, valid: true, reason: "" };
}
const practiceWords = [...localWords].filter(word => word.length >= 3 && word.length <= 32 && [...word].every(letter => PERSIAN_LETTERS.includes(letter)));
export function randomPracticeLetters(): [string, string] {
  const letters = [...practiceWords[crypto.randomInt(practiceWords.length)]];
  const first = crypto.randomInt(letters.length);
  const second = (first + 1 + crypto.randomInt(letters.length - 1)) % letters.length;
  return [letters[first], letters[second]];
}
export function duelWinRate(wins: number, total: number) { return total ? wins / total : 0; }
export function isLocalDuelWord(raw: string) { return localWords.has(normalizePersian(raw)); }

function userPublic(user: { id: string; firstName: string | null; lastName: string | null; username: string | null; showUsername?: boolean; photoUrl: string | null } | null) {
  return user ? { id: user.id, name: publicDisplayName(user), username: publicUsername(user), photoUrl: user.photoUrl } : null;
}
async function activeConnection(userId: string) {
  return prisma.letterDuelConnection.findFirst({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }] }, orderBy: { createdAt: "desc" } });
}
async function createRound(connectionId: string, number: number, playerOneId: string, playerTwoId: string, now = new Date()) {
  return inviteTransaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "LetterDuelConnection" WHERE "id" = ${connectionId} FOR UPDATE`;
    const connection = await tx.letterDuelConnection.findUnique({ where: { id: connectionId } });
    if (connection?.status !== "ACTIVE") return null;
    const wins = await tx.letterDuelRound.groupBy({ by: ["winnerUserId"], where: { connectionId, status: "RESOLVED", winnerUserId: { not: null } }, _count: { _all: true } });
    const winner = wins.find(row => row._count._all >= DUEL_TARGET_WINS);
    if (winner) { await endDuelMatch(tx, connectionId, winner.winnerUserId, "TEN_WINS", now); return null; }
    const existing = await tx.letterDuelRound.findUnique({ where: { connectionId_number: { connectionId, number } } });
    if (existing) return existing;
    const round = await tx.letterDuelRound.create({ data: { connectionId, number, pickDeadline: new Date(now.getTime() + PICK_MS) } });
    await tx.gameSession.createMany({ data: [
      { userId: playerOneId, type: "LETTER_DUEL", targetId: round.id, datasetVersion: "2026-10-03-letter-duel-v1", letterDuelRoundId: round.id },
      { userId: playerTwoId, type: "LETTER_DUEL", targetId: round.id, datasetVersion: "2026-10-03-letter-duel-v1", letterDuelRoundId: round.id }
    ] });
    await tx.letterDuelConnection.update({ where: { id: connectionId }, data: { stateVersion: { increment: 1 } } });
    return round;
  });
}
async function resolveRound(roundId: string, winnerUserId: string | null, word: string | null, reason: string) {
  await inviteTransaction(async (tx) => {
    const initial = await tx.letterDuelRound.findUnique({ where: { id: roundId }, select: { connectionId: true } });
    if (!initial) return;
    await tx.$queryRaw`SELECT "id" FROM "LetterDuelConnection" WHERE "id" = ${initial.connectionId} FOR UPDATE`;
    const round = await tx.letterDuelRound.findUnique({ where: { id: roundId }, include: { connection: true } });
    if (!round || round.connection.status !== "ACTIVE" || round.status === "RESOLVED" || round.status === "CANCELLED") return;
    const users = [round.connection.playerOneId, round.connection.playerTwoId].filter(Boolean) as string[];
    const currentScores = await tx.gameSession.groupBy({ by: ["userId"], where: { userId: { in: users }, status: "WON", letterDuelRound: { connectionId: round.connectionId } }, _count: { _all: true } });
    const scores = new Map(currentScores.map((row) => [row.userId, row._count._all]));
    for (const userId of users) {
      const opponentId = users.find((id) => id !== userId)!;
      const status = winnerUserId ? (userId === winnerUserId ? "WON" : "LOST") : "DRAW";
      const own = (scores.get(userId) || 0) + (status === "WON" ? 1 : 0);
      await tx.gameSession.updateMany({ where: { letterDuelRoundId: round.id, userId, status: "ACTIVE" }, data: { status, finishedAt: new Date(), duelOwnScore: own, duelOpponentScore: (scores.get(opponentId) || 0) + (winnerUserId === opponentId ? 1 : 0) } });
    }
    await tx.letterDuelRound.update({ where: { id: round.id }, data: { status: "RESOLVED", winnerUserId, winningWord: word, resultReason: reason, resolvedAt: new Date() } });
    await tx.letterDuelConnection.update({ where: { id: round.connectionId }, data: { stateVersion: { increment: 1 } } });
    if (winnerUserId && (scores.get(winnerUserId) || 0) + 1 >= DUEL_TARGET_WINS) await endDuelMatch(tx, round.connectionId, winnerUserId, "TEN_WINS");
  });
}
async function finalizeJudgments(roundId: string) {
  const submissions = await prisma.letterDuelSubmission.findMany({ where: { roundId }, orderBy: { receivedAt: "asc" } });
  const firstAccepted = submissions.find((s) => s.status === "ACCEPTED");
  if (firstAccepted && !submissions.some((s) => s.receivedAt < firstAccepted.receivedAt && s.status === "PENDING")) return resolveRound(roundId, firstAccepted.userId, firstAccepted.word, "اولین واژهٔ معتبر");
  const round = await prisma.letterDuelRound.findUnique({ where: { id: roundId } });
  if (round?.answerDeadline && round.answerDeadline <= new Date() && !submissions.some((s) => s.status === "PENDING")) return resolveRound(roundId, null, null, "زمان تمام شد");
}
export async function judgeWord(word: string) {
  if (isLocalDuelWord(word)) return { accepted: true, reason: "واژه در واژه‌نامه ثبت شده است." };
  const cached = await prisma.letterDuelWordJudgment.findUnique({ where: { word } });
  if (cached && (cached.accepted || cached.judgeVersion === JUDGE_VERSION)) return { accepted: cached.accepted, reason: cached.reason || "" };
  const key = process.env.JEV_API_KEY;
  if (!key) throw new Error("JEV_UNAVAILABLE");
  const response = await fetch(process.env.JEV_API_URL || "https://openrouter.ai/api/alpha/decisions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.JEV_MODEL || "typesafe/jev-1.13", state: { word, language: "Persian" }, questions: { verdict: { type: "choice", instructions: "Judge whether word is a real, meaningful, standalone Persian word. Accept standard inflected forms and proper names commonly used in Persian, including Persian and Arabic-origin given names. Reject only gibberish, multi-word phrases, or invalid foreign transliterations.", criteria: { ACCEPT: "A real meaningful Persian word or a valid proper name in Persian.", REJECT: "Not a real standalone Persian word or proper name." } } } }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("JEV_UNAVAILABLE");
  const payload = await response.json() as { answers?: { verdict?: { choice?: string } } };
  const accepted = payload.answers?.verdict?.choice === "ACCEPT";
  const reason = accepted ? "واژهٔ معتبر فارسی است." : "این مورد یک واژهٔ معتبر فارسی نیست.";
  await prisma.letterDuelWordJudgment.upsert({ where: { word }, create: { word, accepted, reason, judgeVersion: JUDGE_VERSION }, update: { accepted, reason, judgeVersion: JUDGE_VERSION } });
  return { accepted, reason };
}

export async function advanceLetterDuel(connectionId: string) {
  const connection = await prisma.letterDuelConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.status !== "ACTIVE" || !connection.playerTwoId) return;
  const now = new Date();
  if (now.getTime() - connection.playerOneHeartbeat.getTime() > RECONNECT_MS || !connection.playerTwoHeartbeat || now.getTime() - connection.playerTwoHeartbeat.getTime() > RECONNECT_MS) return inviteTransaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "LetterDuelConnection" WHERE "id" = ${connectionId} FOR UPDATE`;
    const fresh = await tx.letterDuelConnection.findUnique({ where: { id: connectionId } });
    if (fresh?.status === "ACTIVE" && (now.getTime() - fresh.playerOneHeartbeat.getTime() > RECONNECT_MS || !fresh.playerTwoHeartbeat || now.getTime() - fresh.playerTwoHeartbeat.getTime() > RECONNECT_MS)) await endDuelMatch(tx, connectionId, disconnectedDuelWinner(fresh, now), "DISCONNECTED", now);
  });
  const round = await prisma.letterDuelRound.findFirst({ where: { connectionId, status: { in: ["PICKING", "ANSWERING", "JUDGING", "RESOLVED"] } }, orderBy: { number: "desc" } });
  if (!round) return createRound(connection.id, 1, connection.playerOneId, connection.playerTwoId, now);
  if (round.status === "PICKING" && (round.pickDeadline <= now || (round.playerOneLetter && round.playerTwoLetter))) {
    await inviteTransaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "LetterDuelConnection" WHERE "id" = ${connectionId} FOR UPDATE`;
      const active = await tx.letterDuelConnection.findUnique({ where: { id: connectionId } });
      const picking = await tx.letterDuelRound.findUnique({ where: { id: round.id } });
      if (active?.status !== "ACTIVE" || picking?.status !== "PICKING") return;
      if (picking.pickDeadline > now && (!picking.playerOneLetter || !picking.playerTwoLetter)) return;
      await tx.letterDuelRound.update({ where: { id: round.id }, data: { playerOneLetter: picking.playerOneLetter || randomPersianLetter(), playerTwoLetter: picking.playerTwoLetter || randomPersianLetter(), status: "ANSWERING", answerDeadline: new Date(now.getTime() + ANSWER_MS) } });
      await tx.letterDuelConnection.update({ where: { id: connectionId }, data: { stateVersion: { increment: 1 } } });
    });
  } else if ((round.status === "ANSWERING" || round.status === "JUDGING") && round.answerDeadline && round.answerDeadline <= now) {
    const pending = await prisma.letterDuelSubmission.count({ where: { roundId: round.id, status: "PENDING" } });
    if (pending) await prisma.letterDuelRound.update({ where: { id: round.id }, data: { status: "JUDGING" } }); else await finalizeJudgments(round.id);
  } else if (round.status === "RESOLVED" && round.resolvedAt && now.getTime() - round.resolvedAt.getTime() >= RESULT_MS) {
    await createRound(connection.id, round.number + 1, connection.playerOneId, connection.playerTwoId, now).catch(() => undefined);
  }
}

export async function createPrivateDuel(userId: string) {
  return inviteTransaction(async tx => {
    await lockPlayers(tx, [userId]);
    await reconcileInvites(tx, userId);
    if (await countryRaceBusy(tx, [userId])) throw new Error("ROOM_UNAVAILABLE");
    const existing = await tx.letterDuelConnection.findFirst({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
    if (existing) return existing;
    return tx.letterDuelConnection.create({ data: { mode: "PRIVATE", playerOneId: userId, inviteToken: crypto.randomBytes(18).toString("base64url") } });
  });
}
export async function joinPrivateDuel(userId: string, token: string) {
  const result = await inviteTransaction(async tx => {
    const room = await tx.letterDuelConnection.findUnique({ where: { inviteToken: token } });
    if (!room) throw new Error("ROOM_UNAVAILABLE");
    await lockPlayers(tx, [userId, room.playerOneId]);
    await reconcileInvites(tx, userId);
    if (await countryRaceBusy(tx, [userId])) throw new Error("ROOM_UNAVAILABLE");
    await reconcileInvites(tx, room.playerOneId);
    const existing = await tx.letterDuelConnection.findFirst({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
    if (existing) return existing;
    if (room.status !== "WAITING" || room.playerTwoId || Date.now() - room.playerOneHeartbeat.getTime() > RECONNECT_MS) throw new Error("ROOM_UNAVAILABLE");
    if (room.playerOneId === userId) throw new Error("SELF_JOIN");
    return tx.letterDuelConnection.update({ where: { id: room.id }, data: { playerTwoId: userId, playerTwoHeartbeat: new Date(), status: "ACTIVE", startedAt: new Date(), stateVersion: { increment: 1 } } });
  });
  await advanceLetterDuel(result.id); return result;
}
export async function joinRandomDuel(userId: string) {
  const result = await inviteTransaction(async tx => {
    const cutoff = new Date(Date.now() - RECONNECT_MS);
    const waiting = await tx.letterDuelConnection.findFirst({ where: { mode: "RANDOM", status: "WAITING", playerOneId: { not: userId }, playerTwoId: null, playerOneHeartbeat: { gte: cutoff } }, orderBy: { playerOneHeartbeat: "asc" } });
    await lockPlayers(tx, waiting ? [userId, waiting.playerOneId] : [userId]);
    await reconcileInvites(tx, userId);
    if (await countryRaceBusy(tx, [userId])) throw new Error("ROOM_UNAVAILABLE");
    const existing = await tx.letterDuelConnection.findFirst({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
    if (existing) return tx.letterDuelConnection.update({ where: { id: existing.id }, data: existing.playerOneId === userId ? { playerOneHeartbeat: new Date() } : { playerTwoHeartbeat: new Date() } });
    if (!waiting) return tx.letterDuelConnection.create({ data: { mode: "RANDOM", playerOneId: userId } });
    return tx.letterDuelConnection.update({ where: { id: waiting.id }, data: { playerTwoId: userId, playerTwoHeartbeat: new Date(), status: "ACTIVE", startedAt: new Date(), stateVersion: { increment: 1 } } });
  });
  if (result.status === "ACTIVE") await advanceLetterDuel(result.id); return result;
}
export async function heartbeatDuel(userId: string, connectionId: string) {
  if (!await prisma.letterDuelConnection.findFirst({ where: { id: connectionId, OR: [{ playerOneId: userId }, { playerTwoId: userId }] }, select: { id: true } })) throw new Error("CONNECTION_NOT_FOUND");
  await advanceLetterDuel(connectionId);
  await inviteTransaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "LetterDuelConnection" WHERE "id" = ${connectionId} FOR UPDATE`;
    const room = await tx.letterDuelConnection.findFirst({ where: { id: connectionId, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
    if (!room) throw new Error("CONNECTION_NOT_FOUND");
    await tx.letterDuelConnection.update({ where: { id: room.id }, data: room.playerOneId === userId ? { playerOneHeartbeat: new Date() } : { playerTwoHeartbeat: new Date() } });
  });
  await advanceLetterDuel(connectionId);
}
export async function chooseDuelLetter(userId: string, connectionId: string, raw: string) {
  const room = await prisma.letterDuelConnection.findFirst({ where: { id: connectionId, status: "ACTIVE", OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
  const letter = normalizePersian(raw); if (!room || !PERSIAN_LETTERS.includes(letter) || [...letter].length !== 1) throw new Error("LETTER_INVALID");
  const round = await prisma.letterDuelRound.findFirst({ where: { connectionId, status: "PICKING" }, orderBy: { number: "desc" } });
  if (!round || round.pickDeadline <= new Date()) throw new Error("ROUND_CHANGED");
  const data = room.playerOneId === userId ? { playerOneLetter: letter } : { playerTwoLetter: letter };
  await prisma.$transaction([prisma.letterDuelRound.update({ where: { id: round.id }, data }), prisma.letterDuelConnection.update({ where: { id: room.id }, data: { stateVersion: { increment: 1 } } })]);
  await advanceLetterDuel(room.id);
}
export async function submitDuelWord(userId: string, connectionId: string, raw: string) {
  const room = await prisma.letterDuelConnection.findFirst({ where: { id: connectionId, status: "ACTIVE", OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
  if (!room) throw new Error("CONNECTION_NOT_FOUND");
  const round = await prisma.letterDuelRound.findFirst({ where: { connectionId, status: "ANSWERING" }, orderBy: { number: "desc" } });
  if (!round?.answerDeadline || round.answerDeadline <= new Date() || !round.playerOneLetter || !round.playerTwoLetter) throw new Error("ROUND_CHANGED");
  const check = validateLetterWord(raw, [round.playerOneLetter, round.playerTwoLetter]);
  const submission = await prisma.letterDuelSubmission.create({ data: { roundId: round.id, userId, word: check.word, ...(!check.valid ? { status: "REJECTED", reason: check.reason, judgedAt: new Date() } : {}) } });
  if (!check.valid) return { accepted: false, reason: check.reason };
  try {
    const verdict = await judgeWord(check.word);
    await prisma.letterDuelSubmission.update({ where: { id: submission.id }, data: { status: verdict.accepted ? "ACCEPTED" : "REJECTED", reason: verdict.reason, judgedAt: new Date() } });
    await finalizeJudgments(round.id);
    return verdict;
  } catch {
    await prisma.letterDuelSubmission.update({ where: { id: submission.id }, data: { status: "ERROR", reason: "داور موقتاً در دسترس نیست.", judgedAt: new Date() } });
    await finalizeJudgments(round.id);
    throw new Error("JEV_UNAVAILABLE");
  }
}
export async function leaveDuel(userId: string, connectionId: string) {
  const room = await prisma.letterDuelConnection.findFirst({ where: { id: connectionId, status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
  if (!room) throw new Error("CONNECTION_NOT_FOUND");
  await inviteTransaction(tx => endDuelMatch(tx, room.id, room.status === "ACTIVE" ? (room.playerOneId === userId ? room.playerTwoId : room.playerOneId) : null, room.status === "ACTIVE" ? "FORFEIT" : "CANCELLED"));
}
export async function rematchDuel(userId: string, connectionId: string, cancel = false) {
  return inviteTransaction(async tx => {
    const initial = await tx.letterDuelConnection.findFirst({ where: { id: connectionId, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } });
    if (!initial?.playerTwoId || initial.status !== "ENDED") throw new Error("REMATCH_UNAVAILABLE");
    await lockPlayers(tx, [initial.playerOneId, initial.playerTwoId]);
    await tx.$queryRaw`SELECT "id" FROM "LetterDuelConnection" WHERE "id" = ${connectionId} FOR UPDATE`;
    const room = await tx.letterDuelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    if (room.rematchConnectionId) return tx.letterDuelConnection.findUniqueOrThrow({ where: { id: room.rematchConnectionId } });
    const one = room.playerOneId === userId;
    if (cancel) return tx.letterDuelConnection.update({ where: { id: room.id }, data: one ? { rematchOneAt: null } : { rematchTwoAt: null } });
    const ids = [room.playerOneId, room.playerTwoId!];
    await reconcileInvites(tx, ids[0]); await reconcileInvites(tx, ids[1]);
    if (await countryRaceBusy(tx, ids)) throw new Error("REMATCH_UNAVAILABLE");
    if (await tx.letterDuelConnection.count({ where: { status: { in: ["WAITING", "ACTIVE"] }, OR: [{ playerOneId: { in: ids } }, { playerTwoId: { in: ids } }] } })) throw new Error("REMATCH_UNAVAILABLE");
    const now = new Date();
    const otherAt = one ? room.rematchTwoAt : room.rematchOneAt;
    const otherHeartbeat = one ? room.playerTwoHeartbeat : room.playerOneHeartbeat;
    if (otherAt && now.getTime() - otherAt.getTime() < DUEL_REMATCH_MS && otherHeartbeat && now.getTime() - otherHeartbeat.getTime() < RECONNECT_MS) {
      const next = await tx.letterDuelConnection.create({ data: { mode: room.mode, status: "WAITING", playerOneId: room.playerOneId, playerTwoId: room.playerTwoId, playerOneHeartbeat: now, playerTwoHeartbeat: now } });
      // Reuse the existing two-client readiness gate and 15-second start deadline.
      await tx.duelInvite.create({ data: { senderId: room.playerOneId, recipientId: room.playerTwoId!, status: "ACCEPTED", respondedAt: now, expiresAt: new Date(now.getTime() + DUEL_REMATCH_MS), startDeadline: new Date(now.getTime() + READY_MS), connectionId: next.id } });
      await tx.letterDuelConnection.update({ where: { id: room.id }, data: { rematchConnectionId: next.id, ...(one ? { rematchOneAt: now } : { rematchTwoAt: now }) } });
      await tx.duelInvite.updateMany({ where: { status: "PENDING", OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] }, data: { status: "CANCELLED", reason: "یکی از بازیکن‌ها وارد دوحرف دیگری شده است", respondedAt: now } });
      return next;
    }
    return tx.letterDuelConnection.update({ where: { id: room.id }, data: one ? { rematchOneAt: now } : { rematchTwoAt: now } });
  });
}
export async function serializeDuel(userId: string, requestedId?: string | null) {
  const room = requestedId ? await prisma.letterDuelConnection.findFirst({ where: { id: requestedId, OR: [{ playerOneId: userId }, { playerTwoId: userId }] } }) : await activeConnection(userId) || await prisma.letterDuelConnection.findFirst({ where: { status: "ENDED", endReason: { in: ["TEN_WINS", "FORFEIT", "DISCONNECTED"] }, OR: [{ playerOneId: userId }, { playerTwoId: userId }] }, orderBy: { endedAt: "desc" } });
  if (!room) return null;
  if (room.status === "WAITING" && room.playerTwoId) await inviteTransaction(tx => reconcileInvites(tx, userId));
  await advanceLetterDuel(room.id);
  const fresh = await prisma.letterDuelConnection.findUnique({ where: { id: room.id }, include: { directInvite: { select: { id: true, reason: true, startDeadline: true } }, playerOne: true, playerTwo: true, rounds: { orderBy: { number: "desc" }, take: 1, include: { submissions: { where: { userId }, orderBy: { receivedAt: "desc" }, take: 1 } } } } });
  if (!fresh) return null;
  const round = fresh.rounds[0] || null; const isOne = fresh.playerOneId === userId; const opponent = isOne ? fresh.playerTwo : fresh.playerOne;
  const scores = await prisma.gameSession.groupBy({ by: ["userId"], where: { userId: { in: [fresh.playerOneId, fresh.playerTwoId || ""] }, status: "WON", letterDuelRound: { connectionId: fresh.id } }, _count: { _all: true } });
  const score = new Map(scores.map((s) => [s.userId, s._count._all]));
  const reveal = round && ["ANSWERING", "JUDGING", "RESOLVED"].includes(round.status);
  return { targetWins: DUEL_TARGET_WINS, matchWinnerUserId: fresh.matchWinnerUserId, endReason: fresh.endReason, rematchConnectionId: fresh.rematchConnectionId,
    myRematchPending: Boolean((isOne ? fresh.rematchOneAt : fresh.rematchTwoAt) && Date.now() - (isOne ? fresh.rematchOneAt! : fresh.rematchTwoAt!).getTime() < DUEL_REMATCH_MS),
    opponentRematchPending: Boolean((isOne ? fresh.rematchTwoAt : fresh.rematchOneAt) && Date.now() - (isOne ? fresh.rematchTwoAt! : fresh.rematchOneAt!).getTime() < DUEL_REMATCH_MS),
    directInvite: fresh.directInvite, id: fresh.id, mode: fresh.mode, status: fresh.status, inviteToken: isOne ? fresh.inviteToken : null, stateVersion: fresh.stateVersion, me: userPublic(isOne ? fresh.playerOne : fresh.playerTwo), opponent: userPublic(opponent), myScore: score.get(userId) || 0, opponentScore: score.get(opponent?.id || "") || 0, opponentConnected: !opponent ? false : new Date().getTime() - (isOne ? fresh.playerTwoHeartbeat?.getTime() || 0 : fresh.playerOneHeartbeat.getTime()) < 10_000, reconnectDeadline: opponent ? new Date((isOne ? fresh.playerTwoHeartbeat?.getTime() || 0 : fresh.playerOneHeartbeat.getTime()) + RECONNECT_MS) : null, serverNow: new Date(), round: round ? { id: round.id, number: round.number, status: round.status, deadline: (round.status === "PICKING" ? round.pickDeadline : round.answerDeadline), myLetterChosen: Boolean(isOne ? round.playerOneLetter : round.playerTwoLetter), letters: reveal ? [round.playerOneLetter, round.playerTwoLetter] : null, winnerUserId: round.status === "RESOLVED" ? round.winnerUserId : null, winningWord: round.status === "RESOLVED" ? round.winningWord : null, resultReason: round.status === "RESOLVED" ? round.resultReason : null, lastSubmission: round.submissions[0] || null } : null };
}
