UPDATE "GameSession"
SET "status" = 'SURRENDERED', "finishedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'ADJECTIVE_RAIN' AND "status" = 'ACTIVE';
