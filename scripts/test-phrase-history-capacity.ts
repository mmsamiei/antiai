import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { loadPhraseHuntHistory } from "../lib/phrase-hunt-history-store";

if (!process.env.DATABASE_URL?.includes("anti_ai_invites_test")) throw Error("Disposable test database required");
const challengeId = "capacity-history-fixture";
const userIds = ["capacity-history-owner", "capacity-history-other"];
async function main() {
  try {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.phraseHuntChallenge.deleteMany({ where: { id: challengeId } });
    await prisma.user.createMany({ data: userIds.map(id => ({ id, firstName: "آزمون" })) });
    await prisma.phraseHuntChallenge.create({ data: { id: challengeId, startsAt: new Date("2090-01-01T00:00:00Z"), endsAt: new Date("2090-01-01T12:00:00Z"), targetId: "fixture", judgeVersion: 6 } });
    for (const [index, userId] of userIds.entries()) {
      const game = await prisma.gameSession.create({ data: { userId, type: "PHRASE_HUNT", targetId: "fixture", phraseChallengeId: challengeId, datasetVersion: "test" } });
      await prisma.phraseHuntGuess.createMany({ data: Array.from({ length: 220 }, (_, n) => ({ gameId: game.id, phrase: `واژه ${index} ${n}`, normalized: `واژه ${index} ${n}`, score: (n % 100) + 0.5 })) });
    }
    const result = await loadPhraseHuntHistory(challengeId, userIds[0], "واژه 0 219");
    assert.equal(result.previousGuesses.length, 200);
    assert(!result.previousGuesses.some(row => row.guess === "واژه 0 219"));
    assert(result.counts.randomOthers <= 50);
    assert(result.counts.globalTop <= 50);
    assert(result.counts.userTop <= 100);
    assert.equal(new Set(result.previousGuesses.map(row => row.guess)).size, 200);
    assert(!JSON.stringify(result).includes("capacity-history-owner"));
    console.log("PASS PostgreSQL history sampling: 200 unique words, quotas, exclusion and no identities");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.phraseHuntChallenge.deleteMany({ where: { id: challengeId } });
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
