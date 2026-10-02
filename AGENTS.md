# AGENTS.md

## Project overview

Anti AI Games is a Persian, RTL Telegram Mini App built with Next.js 14, React,
TypeScript, Prisma, and PostgreSQL. It currently exposes three playable games:

- `IRAN_CITY`: guess a hidden Iranian city.
- `COUNTRY`: guess a hidden country using capital-to-capital proximity.
- `ADJECTIVE_RAIN`: submit three valid Persian synonyms within 30 seconds.

The application is deployed below a configurable base path and is designed to
run inside Telegram. Development mode provides a local demo login.

## Important commands

```bash
npm install
docker compose up -d postgres
npx prisma migrate dev
npm run dev
```

Before handing off a change, run the checks relevant to it. For normal code
changes, run all three:

```bash
npm run typecheck
npm test
npm run build
```

Use `npm run db:generate` after changing the Prisma schema and add a migration
for database changes. Do not edit an already-applied migration unless the task
explicitly requires repairing deployment history.

## Repository map

- `app/anti-ai-games-app.tsx`: main client UI and screen-level state.
- `app/api/`: authentication, games, search, presence, profile, and leaderboard
  endpoints.
- `lib/game-service.ts`: game creation and public serialization.
- `lib/geo.ts`: Persian normalization, search, distance, and proximity ranking.
- `lib/adjective-judge.ts`: synonym validation and cached JEV judgments.
- `lib/data/`: generated runtime datasets. Treat large generated files with care.
- `prisma/schema.prisma`: database schema.
- `prisma/migrations/`: production migration history.
- `scripts/`: Telegram bot setup, dataset generation, and word-bank audits.
- `deploy/`: systemd and nginx examples.

## Architecture and data flow

The client authenticates with `/api/auth/telegram` using Telegram `initData`.
The server validates its signature, upserts the Telegram user, and issues an
HTTP-only signed session cookie. Never accept a user ID supplied by the client
as proof of identity.

Game API routes derive the current user from that cookie. A user can have one
active session per game type in normal operation. API responses must use
`serializeGame`; do not expose `targetId` or the hidden target while a game is
active.

Geographic games store stable dataset item IDs. Their displayed rank is based
on Haversine distance to the target. The exact target has rank `0`; rank `1`
means the nearest *other* item. Preserve this convention in API and UI changes.

`ADJECTIVE_RAIN` stores the prompt ID in `GameSession.targetId`. Seeded examples
are judged locally; other submissions are sent to JEV and cached in
`AdjectiveJudgment`. Keep the judge strict: topical associations, antonyms, a
different part of speech, and the target word itself are not synonyms.

## Development rules

- Preserve Persian copy, RTL layout, and Persian-number formatting unless the
  requested change explicitly alters the product language.
- Keep server-only secrets and Prisma access out of client components.
- Validate all untrusted request bodies. Authentication alone is not input
  validation.
- Scope game mutations by both `gameId` and the authenticated `userId`.
- Keep guess updates transactional. Consider concurrent duplicate submissions
  and Prisma unique constraints when modifying guess behavior.
- Use `normalizePersian` for user-entered Persian words and search terms rather
  than introducing a second normalization scheme.
- Respect `NEXT_PUBLIC_BASE_PATH` for browser requests and shared app URLs.
- Do not enable the demo authentication route in production.
- Avoid committing `.env` files, bot tokens, database URLs, or JEV credentials.
- Do not manually rewrite generated city/country datasets. Update their source
  or canonical audit data and use the relevant generator under `scripts/`.

## Database changes

Schema changes must include a Prisma migration and regenerated client where
needed. Prefer additive, deployment-safe migrations. Existing rows may contain
retired `ADJECTIVE` sessions even though that type is no longer playable, so do
not assume every stored enum value appears in `GAME_TYPES`.

The application uses PostgreSQL and some leaderboard queries aggregate large
sets of completed games. Add indexes deliberately when introducing new query
patterns.

## Testing guidance

- Add focused Vitest coverage for pure logic, especially normalization,
  geographic ranking, time boundaries, and serialization rules.
- For API changes, verify unauthorized access, malformed input, ownership, and
  duplicate submissions in addition to the successful path.
- For `ADJECTIVE_RAIN`, test the 30-second boundary and behavior when JEV is
  unavailable without making tests depend on the live external service.
- For UI changes, check the Telegram viewport as well as a normal mobile
  browser, including RTL alignment and the configured base path.

## Product invariants

- Hidden answers remain server-side until a win or surrender.
- A geographic answer is correct only when item IDs match, not merely names.
- A word game is won after three accepted guesses within the time limit.
- Previously submitted items cannot be counted twice in one game.
- Starting a game resumes the current active session before creating another.
- New targets should avoid a user's previously seen targets until the available
  pool is exhausted.

If a requested change conflicts with one of these invariants, call out the
conflict before changing behavior.
