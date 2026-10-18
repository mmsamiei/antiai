import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

// Exercise the real worker and migrations in a disposable schema, with mocked AI.
// No production users, rounds, or API credentials are sent to external services.
async function main() {
  const originalUrl = process.env.DATABASE_URL;
  if (!originalUrl) throw new Error("DATABASE_URL is required");
  const schema = `word_weaver_smoke_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: originalUrl });
  let database: PrismaClient | undefined;
  let created = false;
  const shutdown = new AbortController();
  let worker: Promise<void> | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    const url = new URL(originalUrl);
    url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString();
    const migrate = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: process.env, encoding: "utf8", timeout: 60000 });
    if (migrate.status !== 0) throw new Error(`Isolated migration failed: ${migrate.stderr || migrate.stdout}`);
    process.env.OPENROUTER_API_KEY = "integration-test-key";
    process.env.JEV_API_KEY = "integration-test-key";
    let generated = 0;
    let judged = 0;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (body.messages) {
        assert.equal(body.model, "openai/gpt-6-luna");
        assert.deepEqual(Object.keys(JSON.parse(body.messages[1].content)), ["word"]);
        generated++;
        const text = body.messages[0].content.includes("آلبر کامو") ? "پنجره باز بود؛ جهان هنوز دور بود." : "پنجره را باز کردیم؛ صدای کوچه ریخت توی اتاق.";
        return Response.json({ choices: [{ finish_reason: "stop", message: { content: text } }] });
      }
      assert.deepEqual(Object.keys(body.state).sort(), ["entry", "language", "seedWord"]);
      judged++;
      const score = body.state.entry.includes("انسان") ? 2 : body.state.entry.includes("کوچه") ? 3.9 : 3.5;
      return Response.json({ answers: Object.fromEntries(["relevance", "originality", "expression"].map(key => [key, { type: "score", score }])) });
    };
    const { prisma } = await import("../lib/prisma");
    database = prisma;
    const service = await import("../lib/word-weaver");
    const bots = await import("../lib/word-weaver-bots");
    await prisma.user.create({ data: { id: "integration-human", firstName: "بازیکن آزمایشی" } });
    await service.joinWordWeaver("integration-human", "integration-client");
    const { runWordWeaverWorker } = await import("../lib/word-weaver-worker");
    worker = runWordWeaverWorker(shutdown.signal);
    const waitFor = async <T>(read: () => Promise<T>, ready: (value: T) => boolean): Promise<T> => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const value = await read();
        if (ready(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error("Integration timeout");
    };
    // Both bot texts must already be public before the human submits anything.
    const live = await waitFor(() => service.getWordWeaverState("integration-human"), state => state.round?.submittedEntries.length === 2);
    assert.equal(live.round?.status, "WRITING");
    assert.equal(live.round?.myEntry, null);
    assert.ok(live.round?.submittedEntries.every(entry => entry.user.isBot && !("score" in entry)));
    await service.submitWordWeaverEntry("integration-human", "نوشتهٔ آزمایشی انسان");
    const result = await waitFor(() => service.getWordWeaverState("integration-human"), state => state.round?.status === "RESULTS");
    assert.equal(result.latestResult?.winner?.isBot, true);
    assert.equal(result.playersCount, 1);
    const round = await prisma.wordWeaverRound.findUniqueOrThrow({ where: { id: result.round!.id } });
    assert.ok(round.judgeStartedAt! < round.writeDeadline);
    const summary = await service.getWordWeaverResults(round.id, "integration-human");
    assert.equal(summary.results.length, 3);
    assert.equal(summary.results.find(entry => entry.isMe)?.rank, 3);
    assert.equal(summary.results.filter(entry => entry.user.isBot).length, 2);
    assert.ok(summary.results.every(entry => entry.score !== null));
    assert.equal(await prisma.user.count(), 1);
    assert.equal(await prisma.wordWeaverBotTurn.count({ where: { status: "SUBMITTED" } }), 2);
    assert.equal(generated, 2);
    assert.equal(judged, 3);
    // Reclaim a crashed job; an old token must never publish over its replacement.
    const recoveryRound = await prisma.wordWeaverRound.create({ data: { word: "دریا", writeDeadline: new Date(Date.now() + 30000), judgeModel: "test", rubricVersion: "1" } });
    const abandoned = await prisma.wordWeaverBotTurn.create({ data: { roundId: recoveryRound.id, personaId: "jalal", model: "openai/gpt-6-luna", status: "GENERATING", attempts: 1, leaseToken: "old-token", leaseUntil: new Date(0) } });
    const claimed = await bots.claimWordWeaverBotTurn(recoveryRound.id);
    assert.ok(claimed);
    assert.equal(await bots.submitWordWeaverBotText({ ...abandoned, leaseToken: "old-token" }, "پاسخ قدیمی"), false);
    assert.equal(await bots.submitWordWeaverBotText(claimed!, "دریا آرام نبود"), true);
    assert.equal(await prisma.wordWeaverEntry.count({ where: { roundId: recoveryRound.id } }), 1);

    await prisma.wordWeaverPresence.deleteMany();
    await prisma.wordWeaverRound.update({ where: { id: round.id }, data: { revealUntil: new Date(0) } });
    await waitFor(() => prisma.wordWeaverRoom.findUniqueOrThrow({ where: { id: "public" } }), room => room.currentRoundId === null);
    console.log("PASS: migrations, live bot texts before human submission, real score persistence, early judging, human next-word choice, bot identity/ranking, crash recovery and empty-room pause.");
  } finally {
    shutdown.abort();
    await worker;
    await database?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().then(() => process.exit(0), error => { console.error(error instanceof Error ? error.message : "Integration failed"); process.exit(1); });
