import 'dotenv/config';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { readCountryChallenge, startCountryChallenge, submitCountryChallengeGuess, surrenderCountryChallenge, countryChallengeLeaderboard } from '../lib/country-challenge';
import { datasetFor } from '../lib/geo';
if (!new URL(process.env.DATABASE_URL || "").pathname.includes("test")) throw new Error("Use a disposable test database");
const gameType = process.argv.includes("--city") ? "IRAN_CITY" : "COUNTRY";
const otherType = gameType === "IRAN_CITY" ? "COUNTRY" : "IRAN_CITY";
async function main() {
 const id = 'country-daily-check-' + Date.now();
 await prisma.user.create({data:{id,firstName:'بررسی موقت'}});
 try {
  const [one,two] = await Promise.all([readCountryChallenge(id,undefined,gameType),readCountryChallenge(id,undefined,gameType)]);
  assert.equal(one?.challenge.id,two?.challenge.id);
  const current = await readCountryChallenge(id,undefined,gameType); assert(current); assert.equal(current.challenge.target,null);
  const started = await startCountryChallenge(id,gameType); assert(started.entry);
  const resumed = await startCountryChallenge(id,gameType); assert.equal(resumed.entry?.id,started.entry.id);
  const other = await startCountryChallenge(id,otherType);
  assert.notEqual(other.challenge.id,current.challenge.id); assert.equal(other.challenge.startsAt.getTime(),current.challenge.startsAt.getTime());
  assert.equal((await readCountryChallenge(id,other.challenge.id,gameType)),null);
  const target = await prisma.countryChallenge.findUniqueOrThrow({where:{id:current.challenge.id}});
  assert(datasetFor(gameType).some(x=>x.id===target.targetId));
  const item = datasetFor(gameType).find(x=>x.id!==target.targetId)!;
  const guessed = await submitCountryChallengeGuess(id,item.id,gameType); assert.equal(guessed.entry?.guessCount,1);
  const duplicate = await submitCountryChallengeGuess(id,item.id,gameType); assert.equal(duplicate.entry?.guessCount,1);
  assert.equal((await readCountryChallenge(id,undefined,otherType))?.entry?.guessCount,0);
  assert.equal(await prisma.gameSession.count({where:{userId:id}}),0);
  const board = await countryChallengeLeaderboard(id,undefined,gameType); assert.equal(board?.challenge.target,null); assert.equal(board?.me?.bestGuess,undefined);
  const ended = await surrenderCountryChallenge(id,gameType); assert.equal(ended.entry?.status,'SURRENDERED'); assert(ended.entry.target);
  await assert.rejects(()=>submitCountryChallengeGuess(id,item.id,gameType),/CHALLENGE_ENTRY_CLOSED/);
  console.log('PASS: random target exists; start/resume/guess/duplicate/surrender and hidden leaderboard verified.');
  console.log('Current challenge:', current.challenge.id, 'ends:',current.challenge.endsAt);
 } finally {await prisma.user.delete({where:{id}}); await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
