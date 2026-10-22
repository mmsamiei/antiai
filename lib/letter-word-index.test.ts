import { describe, expect, it } from "vitest";
import { LetterWordIndex } from "./letter-word-index";

describe("letter word inverted index", () => {
  it("intersects letter postings regardless of letter order", () => {
    const index = new LetterWordIndex(["خانه", "کتاب", "کباب", "نیما"]);
    expect(index.find("ک", "ب")).toBe("کتاب");
    expect(index.find("ب", "ک")).toBe("کتاب");
    expect(index.find("ژ", "چ")).toBeNull();
    expect(index.find("خ", "ب")).toBeNull();
  });
  it("requires two occurrences for repeated letters", () => {
    const index = new LetterWordIndex(["بار", "باب", "کباب"]);
    expect(index.find("ب", "ب")).toBe("باب");
    expect(index.find("ر", "ر")).toBeNull();
  });
  it("never suggests short, long or multiword entries", () => {
    const index = new LetterWordIndex(["آب", "ب ب", "ب".repeat(33), "باب"]);
    expect(index.find("آ", "ب")).toBeNull();
    expect(index.find("ب", "ب")).toBe("باب");
  });
});
