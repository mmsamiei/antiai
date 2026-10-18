DO $$
BEGIN
  -- Never move a future challenge that has already been played. The current
  -- challenge keeps its ID and sessions; only its deadline is shortened.
  IF EXISTS (
    SELECT 1 FROM "GameSession" game
    JOIN "PhraseHuntChallenge" challenge ON challenge.id = game."phraseChallengeId"
    WHERE challenge."startsAt" >= TIMESTAMP '2026-10-17 20:30:00'
      AND EXTRACT(HOUR FROM challenge."startsAt") IN (8, 20)
      AND EXTRACT(MINUTE FROM challenge."startsAt") = 30
  ) THEN
    RAISE EXCEPTION 'Cannot reschedule a future PHRASE_HUNT challenge with existing games';
  END IF;

  UPDATE "PhraseHuntChallenge"
  SET "endsAt" = TIMESTAMP '2026-10-17 18:30:00'
  WHERE id = '2026-10-17T08:30:00.000Z'
    AND "endsAt" = TIMESTAMP '2026-10-17 20:30:00';

  -- Preserve target order and pinned judge settings. Referencing foreign keys
  -- use ON UPDATE CASCADE; historical rows and announcements are untouched.
  UPDATE "PhraseHuntChallenge"
  SET id = to_char("startsAt" - INTERVAL '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      "startsAt" = "startsAt" - INTERVAL '2 hours',
      "endsAt" = "endsAt" - INTERVAL '2 hours'
  WHERE "startsAt" >= TIMESTAMP '2026-10-17 20:30:00'
    AND EXTRACT(HOUR FROM "startsAt") IN (8, 20)
    AND EXTRACT(MINUTE FROM "startsAt") = 30;
END $$;
