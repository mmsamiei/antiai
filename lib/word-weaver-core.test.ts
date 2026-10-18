import { describe, expect, it } from "vitest";
import { chooseRandomWord, finalWordWeaverScore, pickTiedWinner, validateWordWeaverNextWord, validateWordWeaverText } from "./word-weaver-core";

describe("word-weaver rules", () => {
  it("accepts short metaphoric phrases and complete sentences", () => {
    expect(validateWordWeaverText("طلای سیاه").valid).toBe(true);
    expect(validateWordWeaverText("نفت، چراغ خانه را روشن کرد.").valid).toBe(true);
  });

  it("enforces entry length by Unicode characters", () => {
    expect(validateWordWeaverText("x").valid).toBe(false);
    expect(validateWordWeaverText("ا".repeat(201)).valid).toBe(false);
  });

  it("validates Persian single-word choices and allows zero-width non-joiner", () => {
    expect(validateWordWeaverNextWord("چراغ‌قرمز", "نفت").valid).toBe(true);
    expect(validateWordWeaverNextWord("hello world", "نفت").valid).toBe(false);
    expect(validateWordWeaverNextWord("نفت", "نفْت").valid).toBe(false);
  });

  it("converts three 0–4 scores to hundredths on a 0–100 scale", () => {
    expect(finalWordWeaverScore(4, 3, 2)).toBe(7500);
    expect(() => finalWordWeaverScore(5, 0, 0)).toThrow("JEV_RESPONSE_INVALID");
  });

  it("chooses a random tied winner once and avoids recent random words", () => {
    expect(pickTiedWinner(["a", "b"], () => 1)).toBe("b");
    expect(chooseRandomWord(["باران", "دریا"], ["باران"], () => 0)).toBe("دریا");
    expect(chooseRandomWord(["باران"], ["باران"], () => 0)).toBe("باران");
  });
});
