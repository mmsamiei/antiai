import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { readSocialStatus } from "../lib/social-status";
import { countryChallengeLeaderboard } from "../lib/country-challenge";
import { leaderboardCache } from "../lib/leaderboard-cache";
import { datasetFor } from "../lib/geo";
if (!process.env.DATABASE_URL?.includes("anti_ai_invites_test")) throw Error("Disposable test database required");
const ids = ["cache-social-one", "cache-social-two"], challengeId = "cache-social-ended";
async function main() {
  try {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.countryChallenge.deleteMany({ where: { id: challengeId } });
    await prisma.user.createMany({ data: ids.map(id => ({ id, firstName: "آزمون", username: id })) });
    const search = await prisma.countryMatchSearch.create({ data: { userId: ids[0], status: "CANCELLED" } });
    assert.equal((await readSocialStatus(ids[0])).matching.search, null);
    const race = await prisma.countryRace.create({ data: { playerOneId: ids[0], playerTwoId: ids[1], targetId: datasetFor("COUNTRY")[0].id } });
    await prisma.countryMatchSearch.update({ where: { id: search.id }, data: { status: "MATCHED", matchedRaceId: race.id } });
    assert.equal((await readSocialStatus(ids[1])).matching.roomId, race.id);
    await prisma.countryRace.update({ where: { id: race.id }, data: { status: "ENDED" } });
    assert.equal((await readSocialStatus(ids[1])).matching.roomId, null);
    assert.equal((await readSocialStatus(ids[0])).matching.search, null);

    await prisma.countryChallenge.create({ data: { id: challengeId, gameType: "COUNTRY", startsAt: new Date("2000-01-02T00:00:00Z"), endsAt: new Date("2000-01-02T12:00:00Z"), targetId: datasetFor("COUNTRY")[0].id } });
    const entry = await prisma.countryChallengeEntry.create({ data: { challengeId, userId: ids[0], bestRank: 2, guessCount: 3, guesses: { create: { userId: ids[0], itemId: datasetFor("COUNTRY")[1].id, rank: 2 } } } });
    const first = await countryChallengeLeaderboard(ids[0], challengeId);
    assert.equal(first?.me?.guessCount, 3); assert(first?.me?.bestGuess); assert(first?.challenge.target);
    await prisma.countryChallengeEntry.update({ where: { id: entry.id }, data: { guessCount: 80 } });
    await prisma.user.update({ where: { id: ids[0] }, data: { firstName: "", lastName: "", username: "private-hidden", showUsername: false } });
    const cached = await countryChallengeLeaderboard(ids[1], challengeId);
    assert.equal(cached?.me, null); assert.equal(cached?.rows[0].guessCount, 3); assert.equal(cached?.rows[0].displayName, "بازیکن"); assert.equal(cached?.rows[0].isMe, false);
    leaderboardCache.clear();
    assert.equal((await countryChallengeLeaderboard(ids[0], challengeId))?.me?.guessCount, 80);
    console.log("PASS historical matchmaking skipped; matched recipient resumes room; ended board cached; identity and privacy fresh; correction invalidation works");
  } finally {
    leaderboardCache.clear();
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.countryChallenge.deleteMany({ where: { id: challengeId } });
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
