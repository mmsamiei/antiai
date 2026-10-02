UPDATE "GameSession"
SET "status" = 'SURRENDERED', "finishedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'ADJECTIVE' AND "status" = 'ACTIVE';
