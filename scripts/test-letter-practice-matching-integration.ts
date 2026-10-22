import "dotenv/config";
import assert from "node:assert/strict";
import {prisma} from "../lib/prisma";
import {readLetterPractice,submitLetterPractice} from "../lib/letter-duel-practice";
import {startCountryMatch,readCountryMatch,respondToCountryMatch,processCountryMatchTick} from "../lib/country-matchmaking";
import {actOnInvite,sendInvite} from "../lib/duel-invites";
import {chooseDuelLetter,serializeDuel,submitDuelWord} from "../lib/letter-duel";
if(!new URL(process.env.DATABASE_URL||"").pathname.includes("test"))throw new Error("Use a disposable test database");
const ids=["letter-feature-a","letter-feature-b","letter-feature-c"],[a,b,c]=ids;
async function setup(){await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.user.createMany({data:ids.map(id=>({id,firstName:id}))});await prisma.onlinePresence.createMany({data:ids.map(userId=>({userId,lastSeenAt:new Date()}))});await prisma.appPresence.createMany({data:ids.map(userId=>({userId,clientId:"test-client",context:userId===c?"GAME":"MENU",lastSeenAt:new Date()}))});}
async function main(){try{
 await setup();const first=await readLetterPractice(a);assert.equal((await readLetterPractice(a)).id,first.id);await prisma.letterDuelPracticeRound.update({where:{id:first.id},data:{letters:["ک","ب"]}});
 assert.equal((await submitLetterPractice(a,first.id,"کب")).verdict.accepted,false);assert.equal((await submitLetterPractice(a,first.id,"کتاب")).verdict.accepted,true);assert.equal((await readLetterPractice(a)).acceptedWord,"کتاب");await assert.rejects(()=>submitLetterPractice(b,first.id,"کتاب"),/PRACTICE_ROUND_CHANGED/);
 const next=await Promise.all([readLetterPractice(a,first.id),readLetterPractice(a,first.id)]);assert.equal(next[0].id,next[1].id);assert.notEqual(next[0].id,first.id);assert.equal(next[0].acceptedWord,null);assert.equal(await prisma.gameSession.count({where:{userId:a}}),0);
 console.log("PASS practice: stable pair, minimum length, real word, ownership, idempotent next pair, no ranking statistics");
 await setup();await startCountryMatch(a,"LETTER_DUEL");await startCountryMatch(b,"LETTER_DUEL");await processCountryMatchTick();const one=await readCountryMatch(a),two=await readCountryMatch(b);assert(one.roomId);assert.equal(one.roomId,two.roomId);assert.equal(one.roomGameKind,"LETTER_DUEL");
 const invite=await prisma.duelInvite.findUniqueOrThrow({where:{connectionId:one.roomId}});assert.equal(invite.source,"MATCHING");assert.equal((await prisma.letterDuelConnection.findUniqueOrThrow({where:{id:one.roomId}})).status,"WAITING");await actOnInvite(a,invite.id,"ready");await actOnInvite(b,invite.id,"ready");let state=await serializeDuel(a,one.roomId);assert.equal(state?.targetWins,10);assert(state?.round);
 await prisma.letterDuelRound.update({where:{id:state.round.id},data:{pickDeadline:new Date(Date.now()+30000)}});await chooseDuelLetter(a,one.roomId,"ک");await chooseDuelLetter(b,one.roomId,"ب");assert.equal((await submitDuelWord(a,one.roomId,"کب")).accepted,false);assert.equal((await submitDuelWord(a,one.roomId,"کتاب")).accepted,true);state=await serializeDuel(a,one.roomId);assert.equal(state?.myScore,1);
 console.log("PASS queued duel: shared room, readiness, existing ten-win engine and three-letter enforcement");
 await setup();await startCountryMatch(a,"LETTER_DUEL");await processCountryMatchTick();const incoming=(await readCountryMatch(b)).incoming;assert(incoming);assert.equal(incoming.gameType,"LETTER_DUEL");await respondToCountryMatch(b,incoming.id,"accept");assert.equal((await readCountryMatch(b)).roomGameKind,"LETTER_DUEL");console.log("PASS duel system offer identifies game and immediately returns joined room");
 await setup();await startCountryMatch(a,"LETTER_DUEL");await startCountryMatch(b,"COUNTRY");await processCountryMatchTick();assert.equal((await readCountryMatch(a)).roomId,null);assert.equal((await readCountryMatch(b)).roomId,null);console.log("PASS duel and geographic queues remain separate");
 await setup();await startCountryMatch(a,"LETTER_DUEL");await processCountryMatchTick();const offer=(await readCountryMatch(b)).incoming!;const direct=await sendInvite(c,b,"CITY_RACE");await Promise.allSettled([respondToCountryMatch(b,offer.id,"accept"),actOnInvite(b,direct.id,"accept")]);const duels=await prisma.letterDuelConnection.count({where:{status:{in:["WAITING","ACTIVE"]},OR:[{playerOneId:b},{playerTwoId:b}]}}),races=await prisma.countryRace.count({where:{status:{in:["WAITING","ACTIVE"]},OR:[{playerOneId:b},{playerTwoId:b}]}});assert.equal(duels+races,1);console.log("PASS simultaneous direct and matching accepts reserve only one room across games");
}finally{await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();}}
void main().catch(e=>{console.error(e);process.exitCode=1});
