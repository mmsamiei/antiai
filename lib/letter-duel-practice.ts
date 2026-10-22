import type { LetterDuelPracticeRound } from "@prisma/client";
import { prisma } from "./prisma";
import { inviteTransaction, lockPlayers } from "./duel-invites";
import { cancelMatchingForUser } from "./country-matchmaking";
import { findDuelExample, isLocalDuelWord, randomPracticeLetters, validateLetterWord } from "./letter-duel";

function publicRound(round: LetterDuelPracticeRound) {
  return {
    id: round.id,
    letters: round.letters,
    acceptedWord: round.acceptedWord,
    surrenderedAt: round.surrenderedAt,
    exampleWord: round.surrenderedAt ? findDuelExample(round.letters[0], round.letters[1]) : null,
  };
}
export async function readLetterPractice(userId: string, previousRoundId?: string) {
  const round = await inviteTransaction(async tx => {
    await lockPlayers(tx, [userId]);
    await cancelMatchingForUser(tx, userId, "وارد تمرین دوحرف شدی");
    const current = await tx.letterDuelPracticeRound.findUnique({ where: { userId } });
    if (current && (!previousRoundId || previousRoundId !== current.id)) {
      // Old external verdicts must not keep showing an unsupported word as solved.
      if (current.acceptedWord && !isLocalDuelWord(current.acceptedWord)) return tx.letterDuelPracticeRound.update({ where: { id: current.id }, data: { acceptedWord: null } });
      return current;
    }
    if (current) await tx.letterDuelPracticeRound.delete({ where: { id: current.id } });
    return tx.letterDuelPracticeRound.create({ data: { userId, letters: randomPracticeLetters() } });
  });
  return publicRound(round);
}
export async function submitLetterPractice(userId: string, roundId: string, raw: string) {
  const round = await prisma.letterDuelPracticeRound.findFirst({ where: { id: roundId, userId } });
  if (!round) throw new Error("PRACTICE_ROUND_CHANGED");
  if (round.acceptedWord || round.surrenderedAt) return { round: publicRound(round), verdict: { accepted: false, reason: "این تمرین تمام شده است؛ دو حرف تازه بگیر." } };
  const checked = validateLetterWord(raw, round.letters);
  if (!checked.valid) return { round: publicRound(round), verdict: { accepted: false, reason: checked.reason } };
  // Practice uses the known word bank, never permissive external/cached verdicts.
  const accepted = isLocalDuelWord(checked.word);
  const verdict = { accepted, reason: accepted ? "واژه در واژه‌نامه ثبت شده است." : "این واژه در واژه‌نامهٔ تمرین ثبت نشده است؛ واژهٔ دیگری امتحان کن." };
  if (accepted) await prisma.letterDuelPracticeRound.updateMany({ where: { id: roundId, userId, acceptedWord: null, surrenderedAt: null }, data: { acceptedWord: checked.word } });
  const current = await prisma.letterDuelPracticeRound.findFirst({ where: { id: roundId, userId } });
  if (!current) throw new Error("PRACTICE_ROUND_CHANGED");
  if (current.surrenderedAt || (current.acceptedWord && current.acceptedWord !== checked.word)) return { round: publicRound(current), verdict: { accepted: false, reason: "این تمرین تمام شده است؛ دو حرف تازه بگیر." } };
  return { round: publicRound(current), verdict };
}
export async function surrenderLetterPractice(userId: string, roundId: string) {
  const round = await inviteTransaction(async tx => {
    await lockPlayers(tx, [userId]);
    const current = await tx.letterDuelPracticeRound.findFirst({ where: { id: roundId, userId } });
    if (!current) throw new Error("PRACTICE_ROUND_CHANGED");
    if (current.acceptedWord || current.surrenderedAt) return current;
    await tx.letterDuelPracticeRound.updateMany({ where: { id: roundId, userId, acceptedWord: null, surrenderedAt: null }, data: { surrenderedAt: new Date() } });
    return tx.letterDuelPracticeRound.findFirstOrThrow({ where: { id: roundId, userId } });
  });
  return { round: publicRound(round) };
}
