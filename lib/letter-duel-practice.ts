import { prisma } from "./prisma";
import { inviteTransaction, lockPlayers } from "./duel-invites";
import { cancelMatchingForUser } from "./country-matchmaking";
import { judgeWord, randomPracticeLetters, validateLetterWord } from "./letter-duel";
export async function readLetterPractice(userId: string, previousRoundId?: string) {
  return inviteTransaction(async tx => {
    await lockPlayers(tx, [userId]);
    await cancelMatchingForUser(tx, userId, "وارد تمرین دوحرف شدی");
    const current = await tx.letterDuelPracticeRound.findUnique({where:{userId}});
    if (current && (!previousRoundId || previousRoundId !== current.id)) return current;
    if (current) await tx.letterDuelPracticeRound.delete({where:{id:current.id}});
    return tx.letterDuelPracticeRound.create({data:{userId,letters:randomPracticeLetters()}});
  });
}
export async function submitLetterPractice(userId: string, roundId: string, raw: string) {
  const round = await prisma.letterDuelPracticeRound.findFirst({where:{id:roundId,userId}});
  if (!round) throw new Error("PRACTICE_ROUND_CHANGED");
  if (round.acceptedWord) return { round, verdict: { accepted: true, reason: "این تمرین را حل کرده‌ای." } };
  const checked = validateLetterWord(raw,round.letters);
  if (!checked.valid) return {round,verdict:{accepted:false,reason:checked.reason}};
  const verdict = await judgeWord(checked.word);
  if (verdict.accepted) await prisma.letterDuelPracticeRound.updateMany({where:{id:roundId,userId,acceptedWord:null},data:{acceptedWord:checked.word}});
  const current = await prisma.letterDuelPracticeRound.findFirst({where:{id:roundId,userId}});
  if (!current) throw new Error("PRACTICE_ROUND_CHANGED");
  return { round: current, verdict };
}
