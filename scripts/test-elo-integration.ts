import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { rateMatch, competitiveLeaderboard } from "../lib/competitive-rating";
import { inviteTransaction } from "../lib/duel-invites";
import { endDuelMatch } from "../lib/letter-duel-match";
import { actCountryRace } from "../lib/country-race";
import { advanceCountryRace } from "../lib/country-race-state";
import { datasetFor } from "../lib/geo";
if (!process.env.DATABASE_URL?.includes("anti_ai_invites_test")) throw new Error("Test database required");
const ids = ["elo-test-a", "elo-test-b"];
async function main() {
 try {
  await prisma.user.createMany({ data: ids.map(id => ({ id, firstName: "نام عمومی", username: "secret", showUsername: false })), skipDuplicates: true });
  const rate = (key: string, type = "COUNTRY", winner: string | null = ids[0]) => inviteTransaction(tx => rateMatch(tx, key, type, ids[0], ids[1], winner));
  await Promise.all([rate("elo-test-duplicate"), rate("elo-test-duplicate")]);
  let rows = await prisma.competitiveRating.findMany({ where: { userId: { in: ids }, gameType: "COUNTRY" } });
  assert.equal(rows.find(r => r.userId === ids[0])?.rating, 1016); assert(rows.every(r => r.games === 1));
  await rate("elo-test-second"); await rate("elo-test-city", "IRAN_CITY", null);
  const board = await competitiveLeaderboard(ids[0], "COUNTRY"); assert.equal(board.me?.games, 2); assert.equal(board.me?.displayName, "نام عمومی"); assert(!JSON.stringify(board).includes("secret"));
  const cancelled = await prisma.letterDuelConnection.create({ data: { playerOneId: ids[0], playerTwoId: ids[1], mode: "PRIVATE", inviteToken: "elo-test-token" } });
  await inviteTransaction(tx => endDuelMatch(tx, cancelled.id, null, "CANCELLED"));
  assert.equal(await prisma.competitiveResult.count({ where: { matchKey: `duel:${cancelled.id}` } }), 0);
  const duel = await prisma.letterDuelConnection.create({ data: { playerOneId: ids[0], playerTwoId: ids[1], mode: "PRIVATE", status: "ACTIVE", inviteToken: "elo-test-token2" } });
  await inviteTransaction(tx => endDuelMatch(tx, duel.id, ids[1], "FORFEIT"));
  await inviteTransaction(tx => endDuelMatch(tx, duel.id, ids[1], "FORFEIT"));
  assert.equal(await prisma.competitiveResult.count({ where: { matchKey: `duel:${duel.id}` } }), 1);
  const race = await prisma.countryRace.create({ data: { playerOneId: ids[0], playerTwoId: ids[1], targetId: datasetFor("COUNTRY")[0].id, status: "ACTIVE", deadline: new Date(Date.now()+200000) } });
  const result = await actCountryRace(ids[0], race.id, "guess", race.targetId);
  assert(result.ratingChange); assert(result.ratingChange.delta > 0);
  const waiting = await prisma.countryRace.create({ data: { playerOneId: ids[0], playerTwoId: ids[1], targetId: race.targetId } });
  await actCountryRace(ids[0], waiting.id, "leave");
  assert.equal(await prisma.competitiveResult.count({ where: { matchKey: `race:${waiting.id}` } }), 0);
  const forfeited = await prisma.countryRace.create({ data: { playerOneId: ids[0], playerTwoId: ids[1], targetId: race.targetId, status: "ACTIVE", deadline: new Date(Date.now()+200000) } });
  const lost = await actCountryRace(ids[0], forfeited.id, "leave");
  assert(lost.ratingChange); assert(lost.ratingChange.delta < 0);
  assert.equal(await prisma.competitiveResult.count({ where: { matchKey: `race:${race.id}` } }), 1);
  const city = await prisma.countryRace.create({ data: { gameType: "IRAN_CITY", playerOneId: ids[0], playerTwoId: ids[1], targetId: datasetFor("IRAN_CITY")[0].id, status: "ACTIVE", deadline: new Date(Date.now()-1000) } });
  await inviteTransaction(tx => advanceCountryRace(tx, city));
  assert.equal((await prisma.competitiveResult.findUniqueOrThrow({ where: { matchKey: `race:${city.id}` } })).winnerUserId, null);
  console.log("PASS Elo: idempotent concurrent scoring, every repeated match, game separation, hidden username, cancellation, duel forfeit, geo win and timeout draw");
 } finally {
  await prisma.competitiveResult.deleteMany({ where: { playerOneId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect();
 }
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
