import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { ensureCountryChallengeAt } from "../lib/country-challenge";
import { countryChallengeWindow } from "../lib/country-challenge-schedule";
if(!process.env.DATABASE_URL?.includes("anti_ai_invites_test"))throw Error("Disposable test database required");
const now=new Date("2026-11-11T10:00:00Z");
const ids=[countryChallengeWindow(now,"COUNTRY").id,"IRAN_CITY:"+countryChallengeWindow(now,"IRAN_CITY").id];
async function main(){try{
 await prisma.countryChallenge.deleteMany({where:{id:{in:ids}}});
 const rows=await Promise.all(Array.from({length:24},(_,i)=>ensureCountryChallengeAt(now,i%2?"IRAN_CITY":"COUNTRY")));
 assert.equal(new Set(rows.filter(r=>r.gameType==="COUNTRY").map(r=>r.id)).size,1);assert.equal(new Set(rows.filter(r=>r.gameType==="IRAN_CITY").map(r=>r.id)).size,1);
 assert.equal(new Set(rows.filter(r=>r.gameType==="COUNTRY").map(r=>r.targetId)).size,1);assert.equal(new Set(rows.filter(r=>r.gameType==="IRAN_CITY").map(r=>r.targetId)).size,1);
 assert.equal(await prisma.countryChallenge.count({where:{id:{in:ids}}}),2);
 console.log("PASS 24 simultaneous challenge ensures: one target per game, independent schedules, no duplicate challenge");
}finally{await prisma.countryChallenge.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();}}
void main().catch(e=>{console.error(e);process.exitCode=1});
