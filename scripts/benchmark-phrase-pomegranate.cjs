// Read-only database sampling and live judging. Never writes game or cache rows.
require('dotenv').config({quiet:true});
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const dir=path.resolve(__dirname,'../benchmarks/phrase-hunt-pomegranate');
const phrases=['باغ','باغ میوه','باغ انار','انارستان','باغ انارستان','باغات انار','بوستان انار','بستان انار','باغچه','باغچه انار','درخت','درخت انار','میوه','انار','انار سرخ','انار ترش','باغ انار قرمز','باغ انار شیرین','باغ انار ساوه','باغ انار شیراز','راز','باغ راز','راز جنگل','رازآلود','باغ سیب','باغ آلبالو','رمان','کتاب','garden of pomegranates','کامپیوتر'];
(async()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../lib/phrase-hunt-judge.ts'),'utf8');
 const criteria=[...source.match(/const scoreLevels = \[([\s\S]*?)\];/)[1].matchAll(/"(?:[^"\\]|\\.)*"/g)].map(x=>JSON.parse(x[0]));
 const line=source.split('\n').find(x=>x.includes('instructions: "Score the semantic closeness'));const parts=[...line.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(x=>JSON.parse(x[0]));const instructions=parts[0]+parts.at(-1);
 const samples=[];
 for(const phrase of phrases){const rows=await p.phraseHuntGuess.findMany({where:{phrase,game:{targetId:'ph-105'}},select:{score:true}}); if(!rows.length)throw Error('Not a user guess: '+phrase); samples.push({phrase,submissionCount:rows.length,storedScores:[...new Set(rows.map(x=>x.score))]});}
 const result={target:'راز باغ انار',targetId:'ph-105',evaluatedAt:new Date().toISOString(),model:'typesafe/jev-1.13',judgeVersion:5,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),instructions,criteria,selection:'Purposive diagnostic sample of 30 distinct real user phrases; not a random or representative sample. No user identifiers.',repetitions:2,samples,runs:[]};
 fs.writeFileSync(path.join(dir,'samples.json'),JSON.stringify(result,null,2)+'\n');
 for(let run=1;run<=2;run++){
  let next=0;const order=run===1?samples:[...samples].reverse();
  async function worker(){while(next<order.length){const {phrase}=order[next++];const start=Date.now();try{const r=await fetch(process.env.JEV_API_URL||'https://openrouter.ai/api/alpha/decisions',{method:'POST',headers:{Authorization:`Bearer ${process.env.JEV_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:result.model,state:{target_phrase:result.target,submitted_phrase:phrase,language:'Persian'},questions:{score:{type:'score',instructions,criteria}}}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();const a=data.answers?.score;if(typeof a?.score!=='number'||a.score<0||a.score>4)throw Error('Invalid score');result.runs.push({run,phrase,rawScore:a.score,score:Math.round(a.score/4*99*100)/100,probabilities:a.probabilities,confidence:a.confidence,servedModel:data.model,elapsedMs:Date.now()-start});}catch(e){result.runs.push({run,phrase,error:e.message});}fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(`${result.runs.length}/60`);}}
  await Promise.all([worker(),worker(),worker()]);
 }
 console.log(JSON.stringify(samples.map(s=>({...s,fresh:result.runs.filter(r=>r.phrase===s.phrase).map(r=>r.error||r.score)})),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
