import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { lockPlayers } from "./duel-invites";
import { normalizePersian } from "./geo";
import { publicDisplayName, publicUsername } from "./public-identity";
import { feedbackInput, feedbackReview, feedbackPoints, FEEDBACK_POINTS } from "./feedback-config";

// Read committed ensures reads after a waited row lock see the latest submission.
function feedbackTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export function isFeedbackAdmin(userId: string) {
  return (process.env.FEEDBACK_ADMIN_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean).includes(userId);
}
export function requireFeedbackAdmin(userId: string) { if (!isFeedbackAdmin(userId)) throw new Error("FEEDBACK_FORBIDDEN"); }
export async function createFeedback(userId: string, input: z.infer<typeof feedbackInput>) {
  const data = feedbackInput.parse(input);
  const fingerprint = createHash("sha256").update(normalizePersian(data.title + " " + data.body)).digest("hex");
  return feedbackTransaction(async tx => {
    await lockPlayers(tx, [userId]);
    const existing = await tx.feedback.findFirst({ where: { userId, OR: [{ requestId: data.requestId }, { fingerprint }] } });
    if (existing) return { feedback: { ...existing, points: feedbackPoints(existing.status) }, duplicate: true };
    const recent = await tx.feedback.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (recent >= 5) throw new Error("FEEDBACK_LIMIT");
    const feedback = await tx.feedback.create({ data: { ...data, userId, fingerprint } });
    return { feedback: { ...feedback, points: 0 }, duplicate: false };
  });
}
export async function reviewFeedback(userId: string, input: z.infer<typeof feedbackReview>) {
  requireFeedbackAdmin(userId);
  const data = feedbackReview.parse(input);
  return feedbackTransaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Feedback" WHERE "id" = ${data.id} FOR UPDATE`;
    const current = await tx.feedback.findUnique({ where: { id: data.id } });
    if (!current) throw new Error("FEEDBACK_NOT_FOUND");
    const now = new Date();
    const feedback = await tx.feedback.update({ where: { id: current.id }, data: {
      status: data.status, reply: data.reply, reviewedBy: userId, reviewedAt: now,
      approvedAt: feedbackPoints(data.status) ? current.approvedAt || now : current.approvedAt,
    } });
    return { feedback: { ...feedback, points: feedbackPoints(feedback.status) } };
  });
}
const identitySelect = { id: true, firstName: true, lastName: true, username: true, showUsername: true, photoUrl: true } as const;
export async function readFeedback(userId: string, view: "mine" | "leaderboard" | "review", page: number, status: keyof typeof import("./feedback-config").feedbackStatuses = "PENDING") {
  const offset = (page - 1) * 20;
  const canReview = isFeedbackAdmin(userId);
  if (view === "leaderboard") {
    const groups = await prisma.feedback.groupBy({ by: ["userId"], where: { status: { in: ["ACCEPTED", "IMPLEMENTED"] } }, _count: { id: true }, _min: { approvedAt: true }, orderBy: [{ _count: { id: "desc" } }, { _min: { approvedAt: "asc" } }, { userId: "asc" }] });
    const slice = groups.slice(offset, offset + 20);
    const users = await prisma.user.findMany({ where: { id: { in: slice.map(row => row.userId) } }, select: identitySelect });
    const rows = slice.flatMap((row, i) => {
      const user = users.find(user => user.id === row.userId);
      return user ? [{ userId: user.id, name: publicDisplayName(user), username: publicUsername(user), photoUrl: user.photoUrl, rank: offset + i + 1, accepted: row._count.id, points: row._count.id * FEEDBACK_POINTS }] : [];
    });
    const meIndex = groups.findIndex(row => row.userId === userId);
    return { canReview, rows, page, hasMore: offset + 20 < groups.length, me: meIndex < 0 ? null : { rank: meIndex + 1, points: groups[meIndex]._count.id * FEEDBACK_POINTS } };
  }
  if (view === "review") requireFeedbackAdmin(userId);
  const rows = await prisma.feedback.findMany({ where: view === "mine" ? { userId } : { status }, orderBy: [{ createdAt: view === "review" ? "asc" : "desc" }, { id: "asc" }], skip: offset, take: 21, ...(view === "review" ? { include: { user: { select: identitySelect } } } : {}) });
  const items = rows.slice(0, 20).map(row => {
    const { fingerprint: _fingerprint, requestId: _requestId, reviewedBy: _reviewer, ...item } = row;
    // Never pass raw User objects (including a hidden username) to the client.
    const user = "user" in item ? item.user as { id: string; firstName: string | null; lastName: string | null; username: string | null; showUsername: boolean; photoUrl: string | null } : null;
    return { ...item, ...(user ? { user: { id: user.id, name: publicDisplayName(user), username: publicUsername(user), photoUrl: user.photoUrl } } : {}), points: feedbackPoints(row.status) };
  });
  return { canReview, items, page, hasMore: rows.length > 20 };
}
