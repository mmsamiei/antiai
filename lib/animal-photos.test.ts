import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { animalRecords } from "./data/animals";
import { animalPhotos, animalPhotoCredits } from "./data/animal-photos";
import { datasetFor, publicItem, searchItems } from "./geo";
import { serializeGame } from "./game-service";

describe("animal photos", () => {
  it("has a local thumbnail, portrait, and attribution for every animal", () => {
    expect(Object.keys(animalPhotos).sort()).toEqual(animalRecords.map(a => a.id).sort());
    expect(animalPhotoCredits).toHaveLength(animalRecords.length);
    for (const animal of animalRecords) {
      const photo = animalPhotos[animal.id], credit = animalPhotoCredits.find(p => p.animalId === animal.id)!;
      expect(credit.scientific).toBe(animal.scientific);
      expect(credit.artist.trim()).not.toBe("");
      expect(credit.sourceUrl.startsWith("https://commons.wikimedia.org/")).toBe(true);
      expect(credit.license).toMatch(/^(CC BY|CC0|Public domain)/);
      for (const src of [photo.src, photo.largeSrc]) {
        expect(src).toMatch(/^\/animals\/[a-z0-9-]+\.(jpg|png|webp)$/);
        expect(existsSync(new URL("../public" + src, import.meta.url))).toBe(true);
      }
      expect(credit.small.bytes).toBeLessThan(100_000);
      expect(credit.large.bytes).toBeLessThan(1_000_000);
    }
  });
  it("returns photos for animal search and guesses without adding photos to geographic games", () => {
    const lion = searchItems("ANIMAL", "شیر").find(a => a.name === "شیر")!;
    expect(publicItem(lion).photo).toEqual(animalPhotos[lion.id]);
    expect(publicItem(datasetFor("COUNTRY")[0])).not.toHaveProperty("photo");
  });
  it("never reveals the hidden answer or its photo in an active practice response", () => {
    const [target, guess] = datasetFor("ANIMAL");
    const game: Parameters<typeof serializeGame>[0] = { id: "photo-test", userId: "owner", type: "ANIMAL", targetId: target.id,
      datasetVersion: "test", status: "ACTIVE", guessesCount: 1, startedAt: new Date(),
      finishedAt: null, guesses: [{ id: "guess", gameId: "photo-test", itemId: guess.id, rank: 4, createdAt: new Date() }],
      semantrisState: null, letterDuelRoundId: null, duelOwnScore: null, duelOpponentScore: null, phraseChallengeId: null };
    const active = serializeGame(game);
    expect(active.target).toBeNull();
    expect(JSON.stringify(active)).not.toContain(animalPhotos[target.id].largeSrc);
    expect(JSON.stringify(active)).toContain(animalPhotos[guess.id].src);
    expect(JSON.stringify(serializeGame(game, true))).toContain(animalPhotos[target.id].largeSrc);
  });
});
