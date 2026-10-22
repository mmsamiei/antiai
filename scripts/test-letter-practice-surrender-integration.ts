import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { readLetterPractice, submitLetterPractice, surrenderLetterPractice } from "../lib/letter-duel-practice";
import { validateLetterWord } from "../lib/letter-duel";
if (!new URL(process.env.DATABASE_URL || "").pathname.includes("test")) throw new Error("Use a disposable test database");
const a = "practice-fix-a", b = "practice-fix-b";
async function pair(letters = ["ک", "ب"]) {
  const previous = await readLetterPractice(a);
  const round = await readLetterPractice(a, previous.id);
  await prisma.letterDuelPracticeRound.update({ where: { id: round.id }, data: { letters } });
  return round.id;
}
async function main() {
  await prisma.user.deleteMany({ where: { id: { in: [a,b] } } });
  await prisma.user.createMany({ data: [{ id: a }, { id: b }] });
  let id = await pair(["خ", "ی"]);
  // Even a previously accepted external judgment cannot admit this word in practice.
  await prisma.letterDuelWordJudgment.upsert({ where: { word: "خیا" }, create: { word: "خیا", accepted: true }, update: { accepted: true } });
  assert.equal((await submitLetterPractice(a, id, "خیا")).verdict.accepted, false);
  assert.equal((await readLetterPractice(a)).acceptedWord, null);
  await prisma.letterDuelPracticeRound.update({ where: { id }, data: { acceptedWord: "خیا" } });
  assert.equal((await readLetterPractice(a)).acceptedWord, null);
  console.log("PASS rejects خیا despite accepted cache and repairs legacy practice verdicts");
  id = await pair();
  assert.equal((await readLetterPractice(a)).exampleWord, null);
  for (const word of ["کب", "خانه", "کبکبکبکبکب"]) assert.equal((await submitLetterPractice(a, id, word)).verdict.accepted, false);
  assert.equal((await submitLetterPractice(a, id, "کتاب")).verdict.accepted, true);
  assert.equal((await submitLetterPractice(a, id, "هرچیزی")).verdict.accepted, false);
  assert.equal((await surrenderLetterPractice(a, id)).round.surrenderedAt, null);
  console.log("PASS length, required letters, gibberish, valid word and closed-round validation");
  id = await pair();
  await assert.rejects(() => surrenderLetterPractice(b, id), /PRACTICE_ROUND_CHANGED/);
  const results = await Promise.all([surrenderLetterPractice(a,id), surrenderLetterPractice(a,id)]);
  assert.ok(results[0].round.surrenderedAt);
  assert.equal(results[0].round.exampleWord,results[1].round.exampleWord);
  const resumed = await readLetterPractice(a);
  assert.ok(resumed.surrenderedAt);
  assert.equal(validateLetterWord(resumed.exampleWord!, resumed.letters).valid, true);
  assert.equal((await submitLetterPractice(a,id,"کتاب")).verdict.accepted,false);
  assert.equal((await readLetterPractice(a,id)).surrenderedAt,null);
  console.log("PASS surrender ownership, repeat requests, refresh, sample and next round");
  id = await pair(["ظ","ظ"]);
  const repeated = (await surrenderLetterPractice(a,id)).round;
  assert.equal(validateLetterWord(repeated.exampleWord!,repeated.letters).valid,true);
  id = await pair(["ث","چ"]);
  assert.equal((await surrenderLetterPractice(a,id)).round.exampleWord,null);
  console.log("PASS repeated letters and missing dictionary sample");
  for(let i=0;i<5;i++) {
    id=await pair();
    await Promise.all([submitLetterPractice(a,id,"کتاب"),surrenderLetterPractice(a,id)]);
    const final=await readLetterPractice(a);
    assert.equal(Boolean(final.acceptedWord)&&Boolean(final.surrenderedAt),false);
    assert.equal(Boolean(final.acceptedWord)||Boolean(final.surrenderedAt),true);
  }
  console.log("PASS concurrent guess/surrender always has exactly one outcome");
}
main().finally(async()=>{await prisma.user.deleteMany({where:{id:{in:[a,b]}}});await prisma.$disconnect();}).catch(e=>{console.error(e);process.exitCode=1;});
