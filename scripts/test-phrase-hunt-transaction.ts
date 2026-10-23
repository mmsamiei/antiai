import assert from "node:assert/strict";
import { phraseHuntTransaction } from "../lib/phrase-hunt-transaction";
import { prisma } from "../lib/prisma";

// Run only against a disposable, migrated database, with no provider credentials.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!url.pathname.startsWith("/antiai_phrase_commit_test_") || !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("A dedicated local antiai_phrase_commit_test_ database is required");
}

async function main() {
  const prefix = `commit-${Date.now()}`;
  const ids = Array.from({ length: 150 }, (_, i) => `${prefix}-${i}`);
  try {
    await prisma.user.createMany({ data: ids.map(id => ({ id })) });
    await prisma.gameSession.createMany({ data: ids.map(id => ({ id, userId: id, type: "PHRASE_HUNT", targetId: "test", datasetVersion: "test" })) });
    const submit = (id: string, phrase: string, limit = 30) => phraseHuntTransaction(id, async tx => {
      const game = await tx.gameSession.findFirst({ where: { id, userId: id, status: "ACTIVE" } });
      assert.ok(game);
      const duplicate = await tx.phraseHuntGuess.findUnique({ where: { gameId_normalized: { gameId: id, normalized: phrase } } });
      if (duplicate) return "duplicate";
      const count = await tx.phraseHuntGuess.count({ where: { game: { userId: id }, createdAt: { gte: new Date(Date.now() - 60_000) } } });
      if (count >= limit) return "limited";
      await tx.phraseHuntGuess.create({ data: { gameId: id, phrase, normalized: phrase, score: 42 } });
      await tx.gameSession.update({ where: { id }, data: { guessesCount: { increment: 1 } } });
      return "saved";
    });
    for (const group of [ids.slice(0, 50), ids.slice(50)]) {
      const start = Date.now();
      const results = await Promise.allSettled(group.map(id => submit(id, "first")));
      assert.deepEqual(results, group.map(() => ({ status: "fulfilled", value: "saved" })));
      console.log(`${group.length} independent players: all saved in ${Date.now() - start}ms`);
    }
    const repeated = await Promise.all(Array.from({ length: 20 }, () => submit(ids[0], "same")));
    assert.equal(repeated.filter(value => value === "saved").length, 1);
    assert.equal(repeated.filter(value => value === "duplicate").length, 19);
    const limited = await Promise.all(Array.from({ length: 40 }, (_, i) => submit(ids[1], `burst-${i}`)));
    assert.equal(limited.filter(value => value === "saved").length, 29);
    assert.equal(limited.filter(value => value === "limited").length, 11);
    for (const id of ids) {
      const game = await prisma.gameSession.findUniqueOrThrow({ where: { id } });
      assert.equal(game.guessesCount, await prisma.phraseHuntGuess.count({ where: { gameId: id } }));
    }
    await assert.rejects(phraseHuntTransaction(ids[2], async tx => {
      await tx.gameSession.update({ where: { id: ids[2] }, data: { guessesCount: { increment: 1 } } });
      throw new Error("rollback-test");
    }), /rollback-test/);
    assert.equal((await prisma.gameSession.findUniqueOrThrow({ where: { id: ids[2] } })).guessesCount, 1);
    console.log("Duplicate, per-player limit, counters and rollback: passed");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
