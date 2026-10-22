/** Real transactions against a disposable test database only. */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { sendInvite, actOnInvite, readInvites } from "../lib/duel-invites";
import { actCountryRace, readCountryRace, rematchCountryRace } from "../lib/country-race";
import { createPrivateDuel, joinRandomDuel } from "../lib/letter-duel";
import { datasetFor, findItem, proximityRank } from "../lib/geo";
if (!new URL(process.env.DATABASE_URL || "").pathname.includes("test")) throw new Error("Use a disposable test database");
const city = process.argv.includes("--city");
const gameType = city ? "IRAN_CITY" : "COUNTRY";
const kind = city ? "CITY_RACE" : "COUNTRY_RACE";
const duration = city ? 300000 : 200000;
const items = datasetFor(gameType);
const ids=["race-test-a","race-test-b","race-test-c"], [a,b,c]=ids;let checks=0;
async function check(name: string, run:()=>Promise<void>) {
  await prisma.user.deleteMany({where:{id:{in:ids}}});
  await prisma.user.createMany({data:ids.map(id=>({id,firstName:id}))});
  await prisma.onlinePresence.createMany({data:ids.map(userId=>({userId}))});
  await run();console.log("PASS",name);checks++;
}
async function start() {
  await prisma.onlinePresence.updateMany({where:{userId:{in:ids}},data:{lastSeenAt:new Date()}});
  const i=await sendInvite(a,b,kind);const accepted=await actOnInvite(b,i.id,"accept");
  await actOnInvite(a,i.id,"ready");await actOnInvite(b,i.id,"ready");
  return prisma.countryRace.findUniqueOrThrow({where:{id:accepted.countryRaceId!}});
}
async function expire(id:string) { await prisma.countryRace.update({where:{id},data:{deadline:new Date(Date.now()-1),playerOneHeartbeat:new Date(),playerTwoHeartbeat:new Date()}}); }
async function main() {
  await check("country invitation reserves one room, waits for both clients, then starts exactly 200 seconds",async()=>{
    const i=await sendInvite(a,b,kind);assert.equal(i.gameKind,kind);
    const accepts=await Promise.all([actOnInvite(b,i.id,"accept"),actOnInvite(b,i.id,"accept")]);
    assert.equal(accepts[0].countryRaceId,accepts[1].countryRaceId);const id=accepts[0].countryRaceId!;
    assert.equal((await readCountryRace(a,id)).deadline,null);
    await assert.rejects(()=>actCountryRace(a,id,"guess","IR"));
    await actOnInvite(a,i.id,"ready");assert.equal((await readCountryRace(a,id)).status,"WAITING");
    await actOnInvite(b,i.id,"ready");
    const room=await prisma.countryRace.findUniqueOrThrow({where:{id}});assert.equal(room.gameType,gameType);assert.equal(+room.deadline!-+room.startedAt!,duration);
    await actOnInvite(a,i.id,"ready");assert.equal(+(await prisma.countryRace.findUniqueOrThrow({where:{id}})).deadline!,+room.deadline!);
    assert.equal((await readInvites(a)).invites.find(x=>x.id===i.id)!.countryRace!.status,"ACTIVE");
    assert.equal(await prisma.gameSession.count({where:{userId:{in:ids}}}),0);
  });
  await check("only best public rank is visible; target and opponent countries stay hidden; duplicates count once",async()=>{
    const r=await start();const country=findItem(gameType,"IR") ? "IR" : "country-ir";
    const all=items;const guess=all.find(x=>x.id!==r.targetId)!;
    await Promise.all([actCountryRace(a,r.id,"guess",guess.id),actCountryRace(a,r.id,"guess",guess.id)]);
    const state=await readCountryRace(b,r.id);
    assert.equal(state.opponentBestRank,proximityRank(gameType,guess,findItem(gameType,r.targetId)!)+1);
    assert.equal(state.guesses.length,0);assert.equal("target" in state,false);assert.equal("opponentGuesses" in state,false);
    assert.equal(await prisma.countryRaceGuess.count({where:{raceId:r.id}}),1);
    await assert.rejects(()=>readCountryRace(c,r.id));await assert.rejects(()=>actCountryRace(c,r.id,"guess",country));
    await assert.rejects(()=>actCountryRace(a,r.id,"guess","invalid-country"));
  });
  await check("first correct submission ends immediately and concurrent answers cannot produce two winners",async()=>{
    const r=await start();const results=await Promise.allSettled([actCountryRace(a,r.id,"guess",r.targetId),actCountryRace(b,r.id,"guess",r.targetId)]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    const state=await readCountryRace(a,r.id);assert.equal(state.status,"ENDED");assert.equal(state.endReason,"FOUND");assert.ok([a,b].includes(state.winnerUserId!));assert.equal(state.target!.id,r.targetId);
    assert.equal(await prisma.countryRaceGuess.count({where:{raceId:r.id,rank:0}}),1);
    assert.equal((await readCountryRace(b,r.id)).target!.id,r.targetId);
  });
  await check("timeout awards lower best rank and rejects late correct answers without rolling back completion",async()=>{
    const r=await start();await prisma.countryRaceGuess.createMany({data:[{raceId:r.id,userId:a,itemId:"seed-one",rank:5},{raceId:r.id,userId:b,itemId:"seed-two",rank:12}]});
    // Use actual countries for serialization.
    const all=items;
    await prisma.countryRaceGuess.updateMany({where:{raceId:r.id,userId:a},data:{itemId:all[0].id}});await prisma.countryRaceGuess.updateMany({where:{raceId:r.id,userId:b},data:{itemId:all[1].id}});
    await expire(r.id);await assert.rejects(()=>actCountryRace(b,r.id,"guess",r.targetId));
    const state=await readCountryRace(a,r.id);assert.equal(state.winnerUserId,a);assert.equal(state.endReason,"TIMEOUT");assert.equal(state.opponentGuesses!.length,1);
  });
  await check("equal ranks draw; no guesses draw; one valid guess beats none",async()=>{
    for(const ranks of [[8,8],[null,null],[8,null]] as const){
      const r=await start();const all=items;
      for(let n=0;n<2;n++)if(ranks[n]!==null)await prisma.countryRaceGuess.create({data:{raceId:r.id,userId:ids[n],itemId:all[n].id,rank:ranks[n]!}});
      await expire(r.id);assert.equal((await readCountryRace(a,r.id)).winnerUserId,ranks[0]===ranks[1]?null:a);
      await prisma.duelInvite.deleteMany({where:{senderId:a}});
    }
  });
  await check("race and letter-duel acceptance racing for one recipient cannot reserve two games",async()=>{
    const i=await sendInvite(a,b,kind),j=await sendInvite(c,b);
    const results=await Promise.allSettled([actOnInvite(b,i.id,"accept"),actOnInvite(b,j.id,"accept")]);assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(await prisma.countryRace.count({where:{status:"WAITING"}})+await prisma.letterDuelConnection.count({where:{status:"WAITING",OR:[{playerOneId:{in:ids}},{playerTwoId:{in:ids}}]}}),1);
  });
  await check("legacy duel creation/random matchmaking cannot bypass an active country race",async()=>{
    await start();await assert.rejects(()=>createPrivateDuel(a));await assert.rejects(()=>joinRandomDuel(b));await assert.rejects(()=>sendInvite(a,c));
  });
  await check("forfeit and disconnect award opponent; expired heartbeat cannot revive game",async()=>{
    const r=await start();await actCountryRace(a,r.id,"leave");assert.equal((await readCountryRace(b,r.id)).winnerUserId,b);
    await prisma.duelInvite.deleteMany({where:{senderId:a}});const next=await start();
    await prisma.countryRace.update({where:{id:next.id},data:{playerOneHeartbeat:new Date(Date.now()-31000)}});
    await actCountryRace(a,next.id,"heartbeat");const state=await readCountryRace(b,next.id);assert.equal(state.endReason,"DISCONNECTED");assert.equal(state.winnerUserId,b);
  });
  await check("missing readiness cancels at fifteen seconds and does not start timer",async()=>{
    const i=await sendInvite(a,b,kind),accepted=await actOnInvite(b,i.id,"accept");await actOnInvite(a,i.id,"ready");
    await prisma.duelInvite.update({where:{id:i.id},data:{startDeadline:new Date(Date.now()-1)}});
    await readInvites(b);assert.equal((await readCountryRace(a,accepted.countryRaceId!)).endReason,"CANCELLED");await assert.rejects(()=>actOnInvite(b,i.id,"ready"));
  });
  await check("rematch sends a fresh country invitation even after a quick win, requiring acceptance",async()=>{
    const r=await start();await actCountryRace(a,r.id,"guess",r.targetId);
    const i=await rematchCountryRace(a,r.id);assert.equal(i.gameKind,kind);assert.equal(i.status,"PENDING");
    const accepted=await actOnInvite(b,i.id,"accept");assert.notEqual(accepted.countryRaceId,r.id);assert.equal((await readCountryRace(a,accepted.countryRaceId!)).status,"WAITING");
  });
  await check("country and city invitations share exclusivity and never accept guesses from the other dataset", async () => {
    const r=await start();
    const foreign=datasetFor(city ? "COUNTRY" : "IRAN_CITY")[0];
    await assert.rejects(()=>actCountryRace(a,r.id,"guess",foreign.id));
    await assert.rejects(()=>sendInvite(a,c,city ? "COUNTRY_RACE" : "CITY_RACE"));
    assert.equal((await readCountryRace(a,r.id)).gameType,gameType);
    assert.equal((await readCountryRace(a,r.id)).totalItems,items.length);
  });
  console.log(`${checks} ${gameType} race integration scenarios passed`);
}
main().finally(async()=>{await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();}).catch(e=>{console.error(e);process.exitCode=1;});
