/** Uses real transactions in a disposable test database; never production. */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { advanceLetterDuel, heartbeatDuel, leaveDuel, rematchDuel, serializeDuel, submitDuelWord } from "../lib/letter-duel";
import { actOnInvite, readInvites } from "../lib/duel-invites";
if (!new URL(process.env.DATABASE_URL || "").pathname.includes("test")) throw new Error("A disposable test database is required");
const ids = ["match-test-a", "match-test-b", "match-test-c"];
const [a,b,c] = ids;
let checks = 0;
async function check(name: string, run: () => Promise<void>) {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.createMany({ data: ids.map(id => ({ id, firstName: id })) });
  await prisma.onlinePresence.createMany({ data: ids.map(userId => ({ userId })) });
  await run(); console.log("PASS", name); checks++;
}
async function room() {
  return prisma.letterDuelConnection.create({ data: { mode: "PRIVATE", status: "ACTIVE", playerOneId: a, playerTwoId: b, playerTwoHeartbeat: new Date(), startedAt: new Date() } });
}
async function seedRounds(connectionId: string, wins: number, draws = 0) {
  for (let i=1;i<=wins+draws;i++) {
    const win = i<=wins;
    const r = await prisma.letterDuelRound.create({ data: { connectionId, number:i, status:"RESOLVED", pickDeadline:new Date(), resolvedAt:new Date(0), winnerUserId:win?a:null } });
    await prisma.gameSession.createMany({ data: [a,b].map(userId => ({ userId, type:"LETTER_DUEL" as const, targetId:r.id, datasetVersion:"test", letterDuelRoundId:r.id, status:win?(userId===a?"WON" as const:"LOST" as const):"DRAW" as const, finishedAt:new Date() })) });
  }
}
async function main() {
  await check("pending judgments hide examples; rejected guesses allow timeout examples", async () => {
    const r = await room();
    const round = await prisma.letterDuelRound.create({ data: { connectionId: r.id, number: 1, status: "ANSWERING", pickDeadline: new Date(), playerOneLetter: "ک", playerTwoLetter: "ب", answerDeadline: new Date(Date.now() - 1000) } });
    const submission = await prisma.letterDuelSubmission.create({ data: { roundId: round.id, userId: a, word: "کبکبکبکب" } });
    const pending = await serializeDuel(b, r.id);
    assert.equal(pending!.round!.status, "JUDGING");
    assert.equal(pending!.round!.exampleWord, null);
    await prisma.letterDuelSubmission.update({ where: { id: submission.id }, data: { status: "REJECTED", judgedAt: new Date() } });
    assert.ok((await serializeDuel(b, r.id))!.round!.exampleWord);
  });
  await check("timeout examples are shared, hidden before resolution, and readable before the next round", async () => {
    const r = await room();
    const round = await prisma.letterDuelRound.create({ data: { connectionId: r.id, number: 1, status: "ANSWERING", pickDeadline: new Date(), playerOneLetter: "ک", playerTwoLetter: "ب", answerDeadline: new Date(Date.now() + 15000) } });
    assert.equal((await serializeDuel(a, r.id))!.round!.exampleWord, null);
    await prisma.letterDuelRound.update({ where: { id: round.id }, data: { answerDeadline: new Date(Date.now() - 1000) } });
    const one = await serializeDuel(a, r.id), two = await serializeDuel(b, r.id);
    assert.equal(one!.round!.status, "RESOLVED");
    assert.ok(one!.round!.exampleWord);
    assert.equal(one!.round!.exampleWord, two!.round!.exampleWord);
    assert.equal(one!.round!.winningWord, null);
    assert.equal(one!.round!.winnerUserId, null);
    await prisma.letterDuelRound.update({ where: { id: round.id }, data: { resolvedAt: new Date(Date.now() - 3500) } });
    await advanceLetterDuel(r.id);
    assert.equal(await prisma.letterDuelRound.count({ where: { connectionId: r.id } }), 1);
    await prisma.letterDuelRound.update({ where: { id: round.id }, data: { resolvedAt: new Date(Date.now() - 6500) } });
    await advanceLetterDuel(r.id);
    assert.equal(await prisma.letterDuelRound.count({ where: { connectionId: r.id } }), 2);
  });
  await check("timeouts without dictionary matches show no example", async () => {
    const r = await room();
    await prisma.letterDuelRound.create({ data: { connectionId: r.id, number: 1, status: "ANSWERING", pickDeadline: new Date(), playerOneLetter: "ث", playerTwoLetter: "چ", answerDeadline: new Date(Date.now() - 1000) } });
    const state = await serializeDuel(a, r.id);
    assert.equal(state!.round!.status, "RESOLVED");
    assert.equal(state!.round!.exampleWord, null);
  });
  await check("winning rounds never reveal timeout examples", async () => {
    const r = await room();
    await prisma.letterDuelRound.create({ data: { connectionId: r.id, number: 1, status: "RESOLVED", pickDeadline: new Date(), playerOneLetter: "ک", playerTwoLetter: "ب", winnerUserId: a, winningWord: "کتاب", resolvedAt: new Date() } });
    assert.equal((await serializeDuel(b, r.id))!.round!.exampleWord, null);
  });
  await check("the tenth win ends exactly once under concurrent submissions; no extra round; final result survives refresh", async () => {
    const r=await room(); await seedRounds(r.id,9,2);
    await advanceLetterDuel(r.id);
    const round=await prisma.letterDuelRound.findFirstOrThrow({where:{connectionId:r.id,status:"PICKING"}});
    await prisma.letterDuelRound.update({where:{id:round.id},data:{status:"ANSWERING",playerOneLetter:"ک",playerTwoLetter:"ب",answerDeadline:new Date(Date.now()+15000)}});
    await Promise.allSettled([submitDuelWord(a,r.id,"کتاب"),submitDuelWord(a,r.id,"کتاب")]);
    const state=await serializeDuel(a,r.id);
    assert.equal(state!.status,"ENDED"); assert.equal(state!.endReason,"TEN_WINS"); assert.equal(state!.matchWinnerUserId,a);
    assert.equal(state!.myScore,10); assert.equal(state!.opponentScore,0);
    await Promise.all([advanceLetterDuel(r.id),advanceLetterDuel(r.id),heartbeatDuel(a,r.id)]);
    assert.equal(await prisma.letterDuelRound.count({where:{connectionId:r.id}}),12);
    assert.equal((await serializeDuel(a))!.id,r.id);
    assert.equal(await serializeDuel(c,r.id),null);
    await assert.rejects(()=>submitDuelWord(b,r.id,"کتاب"));
    const losing=await prisma.gameSession.findFirstOrThrow({where:{letterDuelRoundId:round.id,userId:b}});
    assert.equal(losing.duelOpponentScore,10);
  });
  await check("draws do not count as wins and rounds continue below ten", async()=>{
    const r=await room(); await seedRounds(r.id,9,3); await advanceLetterDuel(r.id);
    assert.equal((await serializeDuel(a,r.id))!.status,"ACTIVE");
    assert.equal((await serializeDuel(a,r.id))!.myScore,9);
    assert.equal(await prisma.letterDuelRound.count({where:{connectionId:r.id}}),13);
  });
  await check("forfeit records the winner separately without changing prior round wins",async()=>{
    const r=await room(); await seedRounds(r.id,2); await advanceLetterDuel(r.id);
    await assert.rejects(()=>leaveDuel(c,r.id));
    await leaveDuel(a,r.id);
    const state=await serializeDuel(b,r.id);
    assert.equal(state!.endReason,"FORFEIT");assert.equal(state!.matchWinnerUserId,b);
    assert.equal(state!.myScore,0);assert.equal(state!.opponentScore,2);
    assert.equal(await prisma.gameSession.count({where:{letterDuelRound:{connectionId:r.id},status:"WON"}}),2);
  });
  await check("refresh within grace resumes; late heartbeat cannot revive an expired match",async()=>{
    const r=await room(); await advanceLetterDuel(r.id);
    await prisma.letterDuelConnection.update({where:{id:r.id},data:{playerTwoHeartbeat:new Date(Date.now()-15000)}});
    await heartbeatDuel(b,r.id); assert.equal((await serializeDuel(b,r.id))!.status,"ACTIVE");
    await prisma.letterDuelConnection.update({where:{id:r.id},data:{playerTwoHeartbeat:new Date(Date.now()-31000)}});
    await heartbeatDuel(b,r.id);
    const state=await serializeDuel(a,r.id);assert.equal(state!.endReason,"DISCONNECTED");assert.equal(state!.matchWinnerUserId,a);
  });
  await check("global invite reconciliation preserves disconnect outcome; both absent gives no winner",async()=>{
    const r=await room(); await advanceLetterDuel(r.id);
    await prisma.letterDuelConnection.update({where:{id:r.id},data:{playerTwoHeartbeat:new Date(Date.now()-31000)}});
    await readInvites(a);
    assert.equal((await serializeDuel(a,r.id))!.matchWinnerUserId,a);
    const other=await room();await prisma.letterDuelConnection.update({where:{id:other.id},data:{playerOneHeartbeat:new Date(0),playerTwoHeartbeat:new Date(0)}});
    assert.equal((await serializeDuel(a,other.id))!.matchWinnerUserId,null);
  });
  await check("rematch needs both consents; simultaneous retries make one fresh room with zero wins",async()=>{
    const r=await room(); await seedRounds(r.id,3);await leaveDuel(a,r.id);
    await assert.rejects(()=>rematchDuel(c,r.id));
    await rematchDuel(a,r.id);assert.equal((await serializeDuel(b,r.id))!.opponentRematchPending,true);
    assert.equal(await prisma.letterDuelConnection.count({where:{status:"ACTIVE",playerOneId:a}}),0);
    const next=await rematchDuel(b,r.id);
    const again=await Promise.all([rematchDuel(a,r.id),rematchDuel(b,r.id)]);
    assert.ok(again.every(x=>x.id===next.id));
    assert.equal(await prisma.letterDuelRound.count({where:{connectionId:next.id}}),0);
    const invite=await prisma.duelInvite.findUniqueOrThrow({where:{connectionId:next.id}});
    await actOnInvite(a,invite.id,"ready");
    assert.equal((await serializeDuel(a,next.id))!.status,"WAITING");
    await actOnInvite(b,invite.id,"ready");
    const state=await serializeDuel(a,next.id);assert.equal(state!.status,"ACTIVE");assert.equal(state!.myScore,0);assert.equal(state!.opponentScore,0);
    await Promise.all([serializeDuel(a,next.id),serializeDuel(b,next.id)]);
    assert.equal(await prisma.letterDuelRound.count({where:{connectionId:next.id}}),1);
    assert.equal((await serializeDuel(b,r.id))!.rematchConnectionId,next.id);
  });
  await check("cancelled or expired rematch consent cannot start a room",async()=>{
    const r=await room();await leaveDuel(a,r.id);await rematchDuel(a,r.id);await rematchDuel(a,r.id,true);
    await rematchDuel(b,r.id);assert.equal((await serializeDuel(a,r.id))!.rematchConnectionId,null);
    await prisma.letterDuelConnection.update({where:{id:r.id},data:{rematchTwoAt:new Date(Date.now()-121000)}});
    await rematchDuel(a,r.id);assert.equal((await serializeDuel(a,r.id))!.rematchConnectionId,null);
  });
  await check("a player busy in another match blocks rematch",async()=>{
    const r=await room();await leaveDuel(a,r.id);await room();await assert.rejects(()=>rematchDuel(b,r.id),/REMATCH_UNAVAILABLE/);
  });
  console.log(`${checks} match integration checks passed`);
}
main().finally(async()=>{await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();}).catch(error=>{console.error(error);process.exitCode=1;});
