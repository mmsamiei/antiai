ALTER TABLE "PhraseHuntChallenge" ADD COLUMN "judgeModel" TEXT NOT NULL DEFAULT 'typesafe/jev-1.13';
ALTER TABLE "PhraseHuntJudgment" ADD COLUMN "model" TEXT NOT NULL DEFAULT 'typesafe/jev-1.13';
DROP INDEX "PhraseHuntJudgment_targetId_phrase_judgeVersion_key";
CREATE UNIQUE INDEX "PhraseHuntJudgment_targetId_phrase_judgeVersion_model_key" ON "PhraseHuntJudgment"("targetId", "phrase", "judgeVersion", "model");
