import { describe, expect, it } from "vitest";
import { serializeGame } from "./game-service";
const game: Parameters<typeof serializeGame>[0] = {
  id: "game", userId: "owner", type: "PHRASE_HUNT", status: "ACTIVE", targetId: "ph-001",
  phraseChallengeId: "2026-10-16T08:30:00.000Z", datasetVersion: "daily-v1", guessesCount: 1,
  startedAt: new Date(), finishedAt: null, semantrisState: null, letterDuelRoundId: null,
  duelOwnScore: null, duelOpponentScore: null, guesses: [],
  phraseGuesses: [{ id: "guess", phrase: "نسیم لطیف", score: 76.38, createdAt: new Date() }],
};
describe("public phrase challenge", () => {
  it("exposes schedule and best score without the active target, aliases, or judge state", () => {
    const result = serializeGame(game);
    expect(result).toMatchObject({ target: null, bestScore: 76.38, challenge: { id: game.phraseChallengeId, timeZone: "Asia/Tehran" } });
    const text = JSON.stringify(result);
    for (const secret of ["هوای پاک", "هوای تمیز", "targetId", "judgeVersion"]) expect(text).not.toContain(secret);
  });
  it.each(["WON", "SURRENDERED"] as const)("reveals the completed %s challenge on resume", status => {
    expect(serializeGame({ ...game, status })).toMatchObject({ target: { name: "هوای پاک" } });
  });
});
