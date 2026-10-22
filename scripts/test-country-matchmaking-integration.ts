/** Real matchmaking transactions; only run against a disposable test database. */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { startCountryMatch, readCountryMatch, processCountryMatchTick, respondToCountryMatch } from "../lib/country-matchmaking";
import { sendInvite, actOnInvite } from "../lib/duel-invites";
import { readCountryRace } from "../lib/country-race";
if (!new URL(process.env.DATABASE_URL || "").pathname.includes("test")) throw new Error("Use a disposable test database");
const gameType = process.argv.includes("--city") ? "IRAN_CITY" : "COUNTRY";
const kind = gameType === "IRAN_CITY" ? "CITY_RACE" : "COUNTRY_RACE";
const duration = gameType === "IRAN_CITY" ? 300000 : 200000;
const ids = ["match-check-a", "match-check-b", "match-check-c"], [a,b,c] = ids;
async function setup() {
  await prisma.user.deleteMany({where:{id:{in:ids}}});
  await prisma.user.createMany({data:ids.map(id=>({id,firstName:id}))});
  await prisma.onlinePresence.createMany({data:ids.map(userId=>({userId,lastSeenAt:new Date()}))});
  await prisma.appPresence.createMany({data:ids.map(userId=>({userId,clientId:"test-client",context:userId===c?"GAME":"MENU",lastSeenAt:new Date()}))});
}
async function offer() {
  await startCountryMatch(a,gameType); await processCountryMatchTick();
  const incoming = (await readCountryMatch(b)).incoming; assert(incoming); return incoming;
}
async function main() {
  try {
    await setup();
    await startCountryMatch(a,"COUNTRY"); await startCountryMatch(b,"IRAN_CITY"); await processCountryMatchTick();
    assert.equal((await readCountryMatch(a)).roomId,null); assert.equal((await readCountryMatch(b)).roomId,null);
    assert.equal(await prisma.countryRace.count({where:{OR:[{playerOneId:{in:ids}},{playerTwoId:{in:ids}}]}}),0);
    console.log("PASS country and city searches never pair with each other");
    await setup();
    await startCountryMatch(a,gameType); await startCountryMatch(b,gameType); await processCountryMatchTick();
    const first = await readCountryMatch(a), second = await readCountryMatch(b);
    assert(first.roomId); assert.equal(first.roomId,second.roomId); assert.equal(first.search?.status,"MATCHED"); assert.equal(second.search?.status,"MATCHED");
    const room = await readCountryRace(a,first.roomId); assert.equal(room.status,"WAITING"); assert.equal(room.deadline,null); assert(room.invite);
    await actOnInvite(a,room.invite.id,"ready"); await actOnInvite(b,room.invite.id,"ready");
    const started = await prisma.countryRace.findUniqueOrThrow({where:{id:first.roomId}});
    assert.equal(started.gameType,gameType); assert.equal(started.status,"ACTIVE"); assert.equal(+started.deadline!-+started.startedAt!,duration);
    console.log("PASS queue pair: one shared room, both clients ready, shared race engine");

    await setup(); const incoming=await offer();
    await respondToCountryMatch(b,incoming.id,"accept");
    assert((await readCountryMatch(b)).roomId); assert.equal((await readCountryMatch(a)).roomId,(await readCountryMatch(b)).roomId);
    console.log("PASS offer acceptance: room returned immediately to both participants");

    await setup(); const rejected=await offer(); await respondToCountryMatch(b,rejected.id,"reject"); await processCountryMatchTick();
    assert.equal((await readCountryMatch(a)).search?.status,"ACTIVE"); assert.equal((await readCountryMatch(b)).incoming,null);
    assert((await prisma.countryMatchState.findUniqueOrThrow({where:{userId:b}})).cooldownUntil! > new Date());
    await prisma.appPresence.updateMany({where:{userId:c},data:{context:"MENU",lastSeenAt:new Date()}}); await processCountryMatchTick();
    assert((await readCountryMatch(c)).incoming); assert.equal(await prisma.countryMatchOffer.count({where:{senderId:a,recipientId:b}}),1);
    console.log("PASS rejection: cooldown, sequential next recipient, no repeated recipient");

    await setup(); const expiring=await offer();
    await prisma.countryMatchOffer.update({where:{id:expiring.id},data:{expiresAt:new Date(Date.now()-1)}}); await processCountryMatchTick();
    assert.equal((await prisma.countryMatchOffer.findUniqueOrThrow({where:{id:expiring.id}})).status,"EXPIRED"); assert.equal((await readCountryMatch(a)).search?.status,"ACTIVE");
    console.log("PASS expiry: offer closes while search continues");

    await setup(); const conflict=await offer(); const direct=await sendInvite(c,b,kind);
    await actOnInvite(b,direct.id,"accept");
    assert.equal((await prisma.countryMatchOffer.findUniqueOrThrow({where:{id:conflict.id}})).status,"CANCELLED");
    assert.equal((await readCountryMatch(a)).search?.status,"ACTIVE");
    console.log("PASS direct invitation remains independent and resumes original sender search");

    await setup(); const concurrent=await offer(); const other=await sendInvite(c,b,kind);
    await Promise.allSettled([respondToCountryMatch(b,concurrent.id,"accept"),actOnInvite(b,other.id,"accept")]);
    assert.equal(await prisma.countryRace.count({where:{status:{in:["WAITING","ACTIVE"]},OR:[{playerOneId:b},{playerTwoId:b}]}}),1);
    console.log("PASS concurrent direct/matching accepts reserve only one active room");
  } finally { await prisma.user.deleteMany({where:{id:{in:ids}}}); await prisma.$disconnect(); }
}
void main().catch(error=>{console.error(error);process.exitCode=1});
