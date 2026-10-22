import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { sharedJudgment } from "../lib/shared-judgment";
if (!process.env.DATABASE_URL?.includes("anti_ai_invites_test")) throw Error("Disposable test database required");
const fixture = "shared-judgment-capacity-fixture";
const key = createHash("sha256").update(JSON.stringify([fixture])).digest("hex");
const where = { targetId_phrase_judgeVersion_model: { targetId: fixture, phrase: "test", judgeVersion: 6, model: "local-test" } };
async function read() { return (await prisma.phraseHuntJudgment.findUnique({ where }))?.score ?? null; }
async function main() {
  if (process.argv.includes("--child")) {
    await fetch(process.env.SHARED_TEST_PROVIDER! + "/ready");
    const score = await sharedJudgment([fixture], read, async () => {
      const response = await fetch(process.env.SHARED_TEST_PROVIDER!);
      const data = await response.json() as { score: number };
      return (await prisma.phraseHuntJudgment.create({ data: { ...where.targetId_phrase_judgeVersion_model, score: data.score } })).score;
    });
    console.log(JSON.stringify({ score })); return;
  }
  let calls = 0;
  const ready: import("node:http").ServerResponse[] = [];
  const server = createServer((request, response) => { if (request.url === "/ready") { ready.push(response); if (ready.length === 2) ready.forEach(r => r.end("ready")); return; } calls++; setTimeout(() => { response.setHeader("Content-Type", "application/json"); response.end('{"score":42}'); }, 250); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await prisma.phraseHuntJudgment.deleteMany({ where: { targetId: fixture } });
    await prisma.phraseHuntJudgmentLease.deleteMany({ where: { key } });
    const run = () => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [...process.execArgv, __filename, "--child"], { env: { ...process.env, SHARED_TEST_PROVIDER: `http://127.0.0.1:${port}` }, stdio: ["ignore", "pipe", "pipe"] });
      let text = ""; child.stdout.on("data", chunk => text += chunk); child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve(text) : reject(Error("Child failed: " + code)));
    });
    const scores = await Promise.all([run(), run()]);
    assert(scores.every(text => text.includes('"score":42'))); assert.equal(calls, 1);
    assert.equal(await prisma.phraseHuntJudgmentLease.count({ where: { key } }), 0);
    await assert.rejects(sharedJudgment([fixture], async () => null, async () => { throw Error("upstream failed"); }), /upstream failed/);
    assert.equal(await prisma.phraseHuntJudgmentLease.count({ where: { key } }), 0);
    await prisma.phraseHuntJudgmentLease.create({ data: { key, owner: "crashed", expiresAt: new Date(0) } });
    assert.equal(await sharedJudgment([fixture], async () => null, async () => 7), 7);
    await sharedJudgment([fixture], async () => null, async () => { await prisma.phraseHuntJudgmentLease.update({ where: { key }, data: { owner: "replacement" } }); return 8; });
    assert.equal((await prisma.phraseHuntJudgmentLease.findUniqueOrThrow({ where: { key } })).owner, "replacement");
    console.log("PASS two independent processes: one provider call, shared score, failure cleanup, expired lease recovery, ownership-safe cleanup");
  } finally {
    await prisma.phraseHuntJudgment.deleteMany({ where: { targetId: fixture } });
    await prisma.phraseHuntJudgmentLease.deleteMany({ where: { key } });
    server.close(); server.closeAllConnections();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
