import { describe, expect, it } from "vitest";
import { phraseHuntAnchors } from "./phrase-hunt-anchors";

describe("October 24 morning phrase challenge anchors", () => {
  it("keeps the twenty calibrated guesses for پرنیان", () => {
    const anchors = phraseHuntAnchors["2026-10-24T06:30:00.000Z"];
    expect(anchors).toHaveLength(20);
    expect(anchors[0]).toEqual({ guess: "پرنیان", score_out_of_100: 100 });
    expect(anchors.filter(anchor => anchor.score_out_of_100 < 52)).toHaveLength(5);
    expect(new Set(anchors.map(anchor => anchor.guess)).size).toBe(20);
    expect(anchors.map(anchor => anchor.score_out_of_100)).toEqual(
      [...anchors.map(anchor => anchor.score_out_of_100)].sort((a, b) => b - a),
    );
  });
});
