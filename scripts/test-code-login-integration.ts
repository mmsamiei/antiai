import "dotenv/config";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { createCodeLoginRequest, issueLoginCode, verifyLoginCode } from "../lib/code-login";
import { sessionUserId } from "../lib/session-signature";
const userId = String(800000000000000 + crypto.randomInt(1_000_000));
const ids: string[] = [];
let ownsUser = false;
async function pending() {
  const request = await createCodeLoginRequest(`integration:${crypto.randomBytes(16).toString("hex")}`);
  ids.push(request.id);
  return request;
}
async function main() {
try {
  assert.equal(await prisma.user.findUnique({ where: { id: userId } }), null);
  const request = await pending();
  const issued = await issueLoginCode(request.id, { id: Number(userId), first_name: "Login integration test" });
  ownsUser = true;
  await assert.rejects(verifyLoginCode(request.id, "0".repeat(64), issued.code));
  const attempts = await prisma.codeLoginRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(attempts.attempts, 0);
  const results = await Promise.allSettled([verifyLoginCode(request.id, request.secret, issued.code), verifyLoginCode(request.id, request.secret, issued.code)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const success = results.find(r => r.status === "fulfilled");
  assert(success?.status === "fulfilled");
  assert.equal(sessionUserId(success.value.session, process.env.TELEGRAM_BOT_TOKEN!), userId);
  assert(Math.abs(success.value.expiresAt - Date.now() - 12 * 3600_000) < 2000);
  // Move issuance outside the cooldown for this isolated synthetic account.
  await prisma.codeLoginRequest.update({ where: { id: request.id }, data: { issuedAt: new Date(Date.now() - 120_000) } });
  const blocked = await pending();
  const next = await issueLoginCode(blocked.id, { id: Number(userId) });
  const wrong = next.code === "000000" ? "000001" : "000000";
  const bad = await Promise.allSettled(Array.from({ length: 5 }, () => verifyLoginCode(blocked.id, blocked.secret, wrong)));
  assert(bad.every(r => r.status === "rejected"));
  assert.equal((await prisma.codeLoginRequest.findUniqueOrThrow({ where: { id: blocked.id } })).attempts, 5);
  await assert.rejects(verifyLoginCode(blocked.id, blocked.secret, next.code));
  await prisma.codeLoginRequest.update({ where: { id: blocked.id }, data: { issuedAt: new Date(Date.now() - 120_000) } });
  const expired = await pending();
  const last = await issueLoginCode(expired.id, { id: Number(userId) });
  await prisma.codeLoginRequest.update({ where: { id: expired.id }, data: { codeExpiresAt: new Date(Date.now() - 1) } });
  await assert.rejects(verifyLoginCode(expired.id, expired.secret, last.code));
  console.log("PASS real database: browser binding, atomic single-use under concurrent verification, five committed failed attempts, expired code, signed 12-hour session. No Telegram messages sent.");
} finally {
  await prisma.codeLoginRequest.deleteMany({ where: { id: { in: ids } } });
  if (ownsUser) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}

}
main().catch(error => { console.error(error instanceof Error ? error.message : "Integration failed"); process.exitCode = 1; });
