import { expect, it } from "vitest";
import { renderGeographyAnnouncement } from "./geography-challenge-announcements";
it("announces each game's own schedule without revealing the new answer", () => {
  expect(renderGeographyAnnouncement("COUNTRY", null, [])).toContain("۸ صبح و ۸ شب");
  expect(renderGeographyAnnouncement("IRAN_CITY", null, [])).toContain("۹ صبح و ۹ شب");
  expect(renderGeographyAnnouncement("COUNTRY", null, [])).not.toContain("پاسخ چالش قبلی");
});
it("escapes identities and the old answer and distinguishes solved from closest attempts", () => {
  const text = renderGeographyAnnouncement("COUNTRY", "<old>", [
    { userId: "a", displayName: "<name>", challengeSolved: true, guessCount: 3, bestScore: 0 },
    { userId: "b", displayName: "B", challengeSolved: false, guessCount: 5, bestScore: 7 },
  ]);
  expect(text).toContain("&lt;old&gt;"); expect(text).toContain("&lt;name&gt;");
  expect(text).toContain("حل با ۳ حدس"); expect(text).toContain("بهترین رتبه: ۷");
});
