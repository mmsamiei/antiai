import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { readPhraseHuntGuessState } from "../lib/phrase-hunt-guess-state";
import { phraseHuntTransaction } from "../lib/phrase-hunt-transaction";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "3814" ||
    !(url.pathname.startsWith("/antiai_phrase_state_test_") || url.pathname === "/antiai_perf_opt")) {
  throw new Error("A dedicated local phrase-state test database on port 3814 is required");
}

async function main() {
  const userId = `perf-state-${Date.now()}`;
  await prisma.user.create({ data: { id: userId } });
  try {
    const games = await Promise.all([15, 14].map(guessesCount => prisma.gameSession.create({
      data: { userId, type: "PHRASE_HUNT", targetId: "test", datasetVersion: "test", guessesCount },
    })));
    for (const game of games) {
      await prisma.phraseHuntGuess.createMany({ data: Array.from({ length: game.guessesCount }, (_, i) => ({
        gameId: game.id, phrase: `seed${i}`, normalized: `seed${i}`, score: 42,
      })) });
    }
    const gameId = games[0].id;
    const state = await readPhraseHuntGuessState(prisma, gameId, userId, "seed0");
    assert.equal(state?.duplicate, true);
    assert.equal(state?.recentCount, 29); // Includes the other session.
    assert.equal(await readPhraseHuntGuessState(prisma, gameId, "wrong-user", "seed0"), null);

    const submit = () => phraseHuntTransaction(userId, async tx => {
      const current = await readPhraseHuntGuessState(tx, gameId, userId, "same");
      assert.ok(current);
      if (current.duplicate) return "duplicate";
      if (current.recentCount >= 30) return "limited";
      await tx.phraseHuntGuess.create({ data: { gameId, phrase: "same", normalized: "same", score: 42 } });
      await tx.gameSession.update({ where: { id: gameId }, data: { guessesCount: { increment: 1 } } });
      return "saved";
    });
    const results = await Promise.all(Array.from({ length: 20 }, submit));
    assert.equal(results.filter(value => value === "saved").length, 1);
    assert.equal(results.filter(value => value === "duplicate").length, 19);
    const after = await readPhraseHuntGuessState(prisma, gameId, userId, "fresh");
    assert.equal(after?.recentCount, 30);
    assert.equal(after?.duplicate, false);
    assert.equal((await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).guessesCount, 16);
    await prisma.gameSession.update({ where: { id: gameId }, data: { status: "SURRENDERED" } });
    assert.equal(await readPhraseHuntGuessState(prisma, gameId, userId, "fresh"), null);
    console.log("PASS ownership, cross-session rolling limit, duplicates, 20 concurrent submissions, counters and inactive game");
  } finally {
    await prisma.user.delete({ where: { id: userId } });
  }
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
