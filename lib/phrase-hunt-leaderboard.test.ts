import { leaderboardCache } from "./leaderboard-cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ current: vi.fn(), challenges: vi.fn(), query: vi.fn(), users: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { phraseHuntChallenge: { findMany: mocks.challenges }, $queryRaw: mocks.query, user: { findMany: mocks.users } } }));
vi.mock("./phrase-hunt-challenge", () => ({ currentPhraseChallenge: mocks.current }));
import { phraseChallengeLeaderboard } from "./phrase-hunt-leaderboard";
const old = { id: "old", startsAt: new Date("2026-10-18T06:30Z"), endsAt: new Date("2026-10-18T19:23Z"), targetId: "ph-105" };
const current = { id: "current", startsAt: old.endsAt, endsAt: new Date("2026-10-19T06:30Z"), targetId: "ph-106" };
beforeEach(() => {
  leaderboardCache.clear();
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-18T21:00Z"));
  mocks.current.mockResolvedValue(current); mocks.challenges.mockResolvedValue([current, old]);
  mocks.users.mockResolvedValue([{ id: "me", username: "player" }]);
  mocks.query.mockResolvedValue([{ userId: "me", score: 80, phrase: "حدس مخفی", achievedAt: new Date("2026-10-18T20:00Z"), guessCount: 5 }]);
});
afterEach(() => vi.useRealTimers());
it("defaults to current and never reveals active guesses or target, including me and selector", async () => {
  const result = await phraseChallengeLeaderboard("me", null);
  expect(result).toMatchObject({ challenge: { id: "current", ended: false }, me: { totalScore: 80, guessCount: 5 } });
  expect(JSON.stringify(result)).not.toContain("حدس مخفی");
  expect(JSON.stringify(result)).not.toContain("جنگ روانی");
  expect(result?.challenges[0]).not.toHaveProperty("target");
  expect(result?.challenges[1]).toHaveProperty("target", "راز باغ انار");
});
it("reveals best guesses and target only after the end boundary", async () => {
  const result = await phraseChallengeLeaderboard("me", "old");
  expect(result).toMatchObject({ challenge: { ended: true, target: "راز باغ انار" }, rows: [{ bestGuess: "حدس مخفی" }] });
  vi.setSystemTime(current.endsAt);
  expect(await phraseChallengeLeaderboard("me", "current")).toMatchObject({ challenge: { ended: true }, rows: [{ bestGuess: "حدس مخفی" }] });
});
it("rejects unknown or future challenges instead of falling back or leaking data", async () => {
  expect(await phraseChallengeLeaderboard("me", "future")).toBeNull();
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.challenges.mock.calls[0][0].where.startsAt.lte).toEqual(new Date());
});
it("scopes best-guess selection and orders equal scores by earliest achievement", async () => {
  await phraseChallengeLeaderboard("me", "old");
  const sql = mocks.query.mock.calls[0][0];
  expect(sql.values).toEqual(["old"]);
  expect(sql.strings.join("?")).toContain('pg.score DESC, pg."createdAt" ASC');
  expect(sql.strings.join("?")).toContain('ORDER BY score DESC, "achievedAt" ASC');
});
it("preserves the current user's rank outside the first fifty", async () => {
  mocks.query.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ userId: i === 50 ? "me" : `u${i}`, score: 90-i, phrase: "hidden", achievedAt: new Date(), guessCount: 1 })));
  const result = await phraseChallengeLeaderboard("me", null);
  expect(result?.rows).toHaveLength(50);
  expect(result?.me).toMatchObject({ rank: 51, userId: "me" });
  expect(mocks.users.mock.calls[0][0].where.id.in).toContain("me");
});
