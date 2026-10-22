import { describe, expect, it } from "vitest";
import { duelWinRate, isLocalDuelWord, PERSIAN_LETTERS, randomPersianLetter, validateLetterWord, randomPracticeLetters } from "./letter-duel";
describe("letter duel rules", () => {
  it("normalizes Persian forms and accepts a single word containing both letters", () => { expect(validateLetterWord("کتاب", ["ک", "ب"])).toMatchObject({ word: "کتاب", valid: true }); expect(validateLetterWord("كتاب", ["ک", "ب"])).toMatchObject({ word: "کتاب", valid: true }); });
  it("requires a repeated letter when both players choose it", () => { expect(validateLetterWord("بار", ["ب", "ب"]).valid).toBe(false); expect(validateLetterWord("باب", ["ب", "ب"]).valid).toBe(true); });
  it("rejects phrases, missing letters, punctuation-only and overlong words", () => { expect(validateLetterWord("کتاب خوب", ["ک", "ب"]).valid).toBe(false); expect(validateLetterWord("کتاب", ["ژ", "ب"]).valid).toBe(false); expect(validateLetterWord("!!!", ["ب", "ا"]).valid).toBe(false); expect(validateLetterWord("ا".repeat(33), ["ا", "ا"]).valid).toBe(false); });
  it("rejects even real two-letter words before dictionary or cached judging",()=>{expect(validateLetterWord("قو",["ق","و"])).toMatchObject({valid:false,reason:"واژه باید دست‌کم سه حرف داشته باشد."});expect(validateLetterWord("قُو",["ق","و"]).valid).toBe(false);expect(validateLetterWord("آب",["آ","ب"]).valid).toBe(false);expect(validateLetterWord("باب",["ب","ب"]).valid).toBe(true);});
  it("generates supported practice letters",()=>{for(let i=0;i<30;i++){const pair=randomPracticeLetters();expect(pair).toHaveLength(2);expect(pair.every(letter=>PERSIAN_LETTERS.includes(letter))).toBe(true);}});
  it("selects random letters only from the supported alphabet", () => { expect(randomPersianLetter(() => 0)).toBe(PERSIAN_LETTERS[0]); expect(randomPersianLetter(() => .999999)).toBe(PERSIAN_LETTERS.at(-1)); });
  it("accepts common words and proper names from the local lexicon", () => { expect(isLocalDuelWord("قو")).toBe(true); expect(isLocalDuelWord("نیما")).toBe(true); expect(isLocalDuelWord("کاظم")).toBe(true); });
  it("calculates the leaderboard ratio including losses and draws", () => { expect(duelWinRate(6, 10)).toBe(.6); expect(duelWinRate(0, 0)).toBe(0); });
});
