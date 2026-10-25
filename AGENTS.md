# AGENTS.md

## Project overview

Anti AI Games is a Persian, RTL Telegram Mini App built with Next.js 14, React,
TypeScript, Prisma, and PostgreSQL. It currently exposes four playable games:

- `IRAN_CITY`: guess a hidden Iranian city.
- `COUNTRY`: guess a hidden country using capital-to-capital proximity.
- `SEMANTRIS`: rank words using semantic clues.
- `LETTER_DUEL`: compete with another player to make a valid Persian word.

`ADJECTIVE_RAIN` and legacy `ADJECTIVE` are retired: do not allow starting,
resuming, guessing, or surrendering these games. Preserve their code, database
rows, profile history, and historical leaderboard access.

Country Race (کشورجوی سرعتی) is invitation-only, stored separately from GameSession, and does not contribute to existing leaderboards. Both clients must be ready before its 200-second deadline starts. Opponents see only the best public COUNTRY rank until the match ends.

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

Geographic games store stable dataset item IDs and rank guesses by Haversine
distance. Exact targets have stored rank `0`; non-winning public ranks start at
`2` so rank `1` cannot be mistaken for a win. Preserve this convention in API
and UI changes.

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
- `ADJECTIVE_RAIN` is won after three accepted guesses within its time limit.
- `PHRASE_HUNT` is won only by the target phrase or a curated normalized alias;
  JEV scores semantic proximity but never decides whether a guess wins.
- Previously submitted items cannot be counted twice in one game.
- Starting a game resumes the current active session before creating another.
  PHRASE_HUNT instead returns the single session for the current shared Tehran
  10:00/22:00 Tehran challenge, including a completed session; never reroll it.
- Personal targets avoid a user's previously seen targets until the pool is
  exhausted. Shared PHRASE_HUNT targets instead avoid recently used challenge
  targets globally. Its leaderboard sums one maximum per challenge and includes
  the active challenge; personal legacy games are excluded.

If a requested change conflicts with one of these invariants, call out the
conflict before changing behavior.

Username visibility defaults to true. All public identities and bot result announcements must honor User.showUsername, including search, name fallbacks, and queued result deliveries. Use lib/public-identity.ts; never expose hidden usernames in API payloads.

City Race (شهرجوی سرعتی) reuses the geographic race engine with gameType IRAN_CITY and a 300-second limit. CountryRace rows without a new type remain COUNTRY (200 seconds). Both are invitation-only and excluded from existing leaderboards.

All general Telegram broadcasts and challenge announcements must respect User.announcementsEnabled both when selecting recipients and immediately before every send/retry, including saved recipient lists. New users default to opted out. Provide announcements:off callback buttons on broadcast messages. User-requested command replies and match messages are separate from general announcements.

Fallback Telegram code login uses browser-bound CodeLoginRequest records, explicit private-bot confirmation, a 2-minute single-use code, at most 5 failed attempts, and a signed fixed 12-hour otp: session. Never put browser secrets or codes in links or logs, reset failed-attempt counters on resend, or extend the signed deadline when resuming. Keep lib/session-signature.ts compatible with both ordinary Telegram sessions and expiring code sessions, including the separate social-status server. A valid Telegram launch takes precedence over saved browser identity.

The /login command guides the user to a browser-specific request; never select the last request/device implicitly. Display codeLoginReference(requestId) consistently in the browser, confirmation prompt and code message. This public label is not a secret or proof of authentication. Typed confirmation text must not issue a code.

Animal game (`ANIMAL`) uses the shared practice/challenge/race engines and the generated Open Tree dataset under `scripts/data/animals-v1.json`; it currently contains 283 selectable taxa. Regenerate runtime data via `node scripts/generate-animals.mjs`. The original 263-animal set and its 166-species popularity-based expansion are documented in `scripts/data/animal-wikipedia-popular-v1.json`; its OneZoom source is a popularity index based on English Wikipedia page views and page size, not raw page-view counts. The 20 familiar additions and their image sources are listed in `scripts/data/animal-curated-additions-v1.json`. Animal guesses and targets must be dataset entries. Rank tied MRCA clade sizes equally; exact matches are 0, public nonwinning ranks start at 2. Challenges switch at 09:00/21:00 Tehran. Animal races have separate hidden targets: `playerOneTargetId` is chosen by player two, and vice versa. After both clients are ready, allow 20 seconds of selection; then fill missing targets randomly server-side and start the 200-second guessing deadline. Keep selecting races ACTIVE for existing presence/busy logic, but reject guesses until the deadline exists. Never serialize the player's own hidden target during either live phase. The selecting player may see their own choice for the opponent. Country/city races keep their existing shared-target behavior.
