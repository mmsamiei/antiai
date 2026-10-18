// Tests the running application with disposable accounts; all fixtures are removed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
require('tsx/cjs');
const { phraseChallengeWindow, phraseWeekStart } = require('../lib/phrase-hunt-schedule.ts');
const accounts = ['a','b'].map(suffix=>'phrase-challenge-check-'+randomUUID()+'-'+suffix);
const createdChallenges = [];
const base = 'http://127.0.0.1:3001'+(process.env.NEXT_PUBLIC_BASE_PATH||'');
const hours = 60*60*1000;
async function call(userId,route,body) {
  const token=userId+'.'+createHmac('sha256',process.env.TELEGRAM_BOT_TOKEN).update(userId).digest('hex');
  const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return { status:response.status, body:await response.json() };
}
async function historicalChallenge(start) {
  const window=phraseChallengeWindow(start);
  const id=window.id;
  let challenge=await prisma.phraseHuntChallenge.findUnique({where:{id}});
  if (!challenge) {
    challenge=await prisma.phraseHuntChallenge.create({data:{...window,targetId:'ph-001',judgeVersion:3,judgeModel:process.env.JEV_MODEL||'typesafe/jev-1.13'}});
    createdChallenges.push(id);
  }
  return challenge;
}
async function addGame(userId,challenge,scores) {
  const game=await prisma.gameSession.create({data:{userId,type:'PHRASE_HUNT',status:'ACTIVE',targetId:challenge.targetId,phraseChallengeId:challenge.id,datasetVersion:'integration-fixture',guessesCount:scores.length}});
  await prisma.phraseHuntGuess.createMany({data:scores.map((score,index)=>({gameId:game.id,phrase:'آزمون '+index,normalized:'آزمون '+index,score}))});
  return game;
}
async function main() {
  assert.ok(process.env.TELEGRAM_BOT_TOKEN,'Missing session key');
  await prisma.user.createMany({data:accounts.map(id=>({id,firstName:'Disposable challenge check'}))});
  const [a,b,bAgain]=await Promise.all([call(accounts[0],'/api/game/start',{type:'PHRASE_HUNT'}),call(accounts[1],'/api/game/start',{type:'PHRASE_HUNT'}),call(accounts[1],'/api/game/start',{type:'PHRASE_HUNT'})]);
  for(const result of [a,b,bAgain]) assert.equal(result.status,200);
  assert.equal(a.body.onboardingRequired,true); assert.equal(b.body.onboardingRequired,true);
  assert.equal(a.body.game.challenge.id,b.body.game.challenge.id);
  assert.equal(b.body.game.id,bAgain.body.game.id);
  const [gameA,gameB]=await Promise.all([prisma.gameSession.findUniqueOrThrow({where:{id:a.body.game.id}}),prisma.gameSession.findUniqueOrThrow({where:{id:b.body.game.id}})]);
  assert.equal(gameA.targetId,gameB.targetId);
  assert.equal(await prisma.gameSession.count({where:{userId:accounts[1],phraseChallengeId:gameB.phraseChallengeId}}),1);
  assert.equal(a.body.game.target,null); assert.ok(!('targetId' in a.body.game));
  const bank=fs.readFileSync(path.join(__dirname,'../lib/data/phrase-hunt-targets.ts'),'utf8');
  const target=JSON.parse(bank.match(new RegExp('id: "'+gameA.targetId+'", phrase: ("(?:[^"\\\\]|\\\\.)*")'))[1]);
  assert.ok(!JSON.stringify(a.body.game).includes(target));
  assert.equal((await call(accounts[0],'/api/phrase-hunt/onboarding',{userId:accounts[1]})).status,200);
  assert.equal((await call(accounts[0],'/api/game/start',{type:'PHRASE_HUNT'})).body.onboardingRequired,false);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:accounts[1]}})).phraseHuntOnboardedAt,null);
  const livePhrase='یک دفتر حسابداری قدیمی روی میز';
  const judged=await call(accounts[0],'/api/phrase-hunt/guess',{gameId:gameA.id,phrase:livePhrase});
  assert.equal(judged.status,200);assert.equal(judged.body.game.target,null);
  assert.ok(judged.body.score>=0&&judged.body.score<=99);
  const pinned=await prisma.phraseHuntChallenge.findUniqueOrThrow({where:{id:gameA.phraseChallengeId}});
  const cached=await prisma.phraseHuntJudgment.findUniqueOrThrow({where:{targetId_phrase_judgeVersion_model:{targetId:gameA.targetId,phrase:livePhrase,judgeVersion:pinned.judgeVersion,model:pinned.judgeModel}}});
  assert.equal(cached.score,judged.body.score);
  const won=await call(accounts[0],'/api/phrase-hunt/guess',{gameId:gameA.id,phrase:target});
  assert.equal(won.status,200); assert.equal(won.body.score,100);
  const afterWin=await call(accounts[0],'/api/game/start',{type:'PHRASE_HUNT'});
  assert.equal(afterWin.body.game.id,gameA.id);assert.equal(afterWin.body.game.status,'WON');assert.equal(afterWin.body.game.target.name,target);
  await prisma.phraseHuntGuess.createMany({data:[50.25,80].map((score,index)=>({gameId:gameB.id,phrase:'آزمون '+index,normalized:'آزمون '+index,score}))});
  const currentStart=new Date(a.body.game.challenge.startsAt);
  const previous=await historicalChallenge(new Date(+currentStart-1));
  const older=await historicalChallenge(new Date(+currentStart-8*24*hours));
  const previousGame=await addGame(accounts[1],previous,[20,35]);
  await addGame(accounts[1],older,[55]);
  const legacy=await prisma.gameSession.create({data:{userId:accounts[1],type:'PHRASE_HUNT',status:'WON',targetId:'ph-001',datasetVersion:'legacy-fixture'}});
  await prisma.phraseHuntGuess.create({data:{gameId:legacy.id,phrase:'legacy',normalized:'legacy',score:100}});
  assert.equal((await call(accounts[1],'/api/phrase-hunt/guess',{gameId:previousGame.id,phrase:'آزمون تازه'})).status,409);
  assert.equal((await call(accounts[0],'/api/phrase-hunt/guess',{gameId:gameB.id,phrase:'آزمون مالکیت'})).status,409);
  const all=await call(accounts[1],'/api/leaderboard?type=PHRASE_HUNT&period=all&mode=skill');
  assert.equal(all.status,200);assert.equal(all.body.mode,'total');assert.equal(all.body.me.totalScore,170);assert.equal(all.body.me.games,3);
  const weekStart=+phraseWeekStart();
  const weekly=await call(accounts[1],'/api/leaderboard?type=PHRASE_HUNT&period=week');
  const expectedWeek=80+(+previous.startsAt>=weekStart?35:0);
  assert.equal(weekly.body.me.totalScore,expectedWeek);
  assert.equal((await call(accounts[1],'/api/game/surrender',{gameId:gameB.id})).status,200);
  const afterSurrender=await call(accounts[1],'/api/game/start',{type:'PHRASE_HUNT'});
  assert.equal(afterSurrender.body.game.id,gameB.id);assert.equal(afterSurrender.body.game.status,'SURRENDERED');
  console.log(JSON.stringify({sharedTarget:true,concurrentStartUnique:true,hiddenTargetProtected:true,onboardingPersistentAndScoped:true,noRerollAfterWinOrSurrender:true,expiredGuessRejected:true,ownershipEnforced:true,weeklyTotal:expectedWeek,allTimeTotal:170,legacyExcluded:true,pinnedModelCacheAndLiveJev:true}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1}).finally(async()=>{
  await prisma.user.deleteMany({where:{id:{in:accounts}}});
  if(createdChallenges.length) await prisma.phraseHuntChallenge.deleteMany({where:{id:{in:createdChallenges},games:{none:{}}}});
  await prisma.$disconnect();
  console.log('disposable_accounts_and_fixtures_removed');
});
