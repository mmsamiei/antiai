import 'dotenv/config';
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { readCountryChallenge, startCountryChallenge, submitCountryChallengeGuess, surrenderCountryChallenge, countryChallengeLeaderboard } from '../lib/country-challenge';
import { datasetFor } from '../lib/geo';
async function main() {
 const id = 'country-daily-check-' + Date.now();
 await prisma.user.create({data:{id,firstName:'بررسی موقت'}});
 try {
  const current = await readCountryChallenge(id); assert(current); assert.equal(current.challenge.target,null);
  const started = await startCountryChallenge(id); assert(started.entry);
  const resumed = await startCountryChallenge(id); assert.equal(resumed.entry?.id,started.entry.id);
  const target = await prisma.countryChallenge.findUniqueOrThrow({where:{id:current.challenge.id}});
  assert(datasetFor('COUNTRY').some(x=>x.id===target.targetId));
  const item = datasetFor('COUNTRY').find(x=>x.id!==target.targetId)!;
  const guessed = await submitCountryChallengeGuess(id,item.id); assert.equal(guessed.entry?.guessCount,1);
  const duplicate = await submitCountryChallengeGuess(id,item.id); assert.equal(duplicate.entry?.guessCount,1);
  const board = await countryChallengeLeaderboard(id); assert.equal(board?.challenge.target,null); assert.equal(board?.me?.bestGuess,undefined);
  const ended = await surrenderCountryChallenge(id); assert.equal(ended.entry?.status,'SURRENDERED'); assert(ended.entry.target);
  await assert.rejects(()=>submitCountryChallengeGuess(id,item.id),/CHALLENGE_ENTRY_CLOSED/);
  console.log('PASS: random target exists; start/resume/guess/duplicate/surrender and hidden leaderboard verified.');
  console.log('Current challenge:', current.challenge.id, 'ends:',current.challenge.endsAt);
 } finally {await prisma.user.delete({where:{id}}); await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
