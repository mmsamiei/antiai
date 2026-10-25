/** Disposable database only; never runs against production. */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { datasetFor, findItem, proximityRank } from "../lib/geo";
import { activeOrNewGame, serializeGame } from "../lib/game-service";
import { sendInvite, actOnInvite } from "../lib/duel-invites";
import { actCountryRace, readCountryRace } from "../lib/country-race";
import { startCountryChallenge, submitCountryChallengeGuess, surrenderCountryChallenge, countryChallengeLeaderboard } from "../lib/country-challenge";
import { startCountryMatch, processCountryMatchTick, readCountryMatch } from "../lib/country-matchmaking";

if (new URL(process.env.DATABASE_URL || "").pathname !== "/anti_ai_animals_test_20261025") throw new Error("Dedicated animal test database required");
const ids = ["animal-test-a", "animal-test-b", "animal-test-c"], [a, b, c] = ids;
const animals = datasetFor("ANIMAL");
async function setup() {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.createMany({ data: ids.map(id => ({ id, firstName: id })) });
  await prisma.onlinePresence.createMany({ data: ids.map(userId => ({ userId })) });
  await prisma.appPresence.createMany({ data: ids.map(userId => ({ userId, clientId: "animal-test", context: userId === c ? "GAME" : "MENU" })) });
}
async function start() {
  const invitation = await sendInvite(a, b, "ANIMAL_RACE");
  const accepted = await actOnInvite(b, invitation.id, "accept");
  const id = accepted.countryRaceId!;
  assert.equal((await readCountryRace(a, id)).status, "WAITING");
  await actOnInvite(a, invitation.id, "ready");
  assert.equal((await readCountryRace(b, id)).status, "WAITING");
  await actOnInvite(b, invitation.id, "ready");
  return { id, invitation };
}
async function main() {
  try {
    await setup();
    const practice = await activeOrNewGame(a, "ANIMAL");
    assert(findItem("ANIMAL", practice.targetId));
    assert.equal((await activeOrNewGame(a, "ANIMAL")).id, practice.id);
    assert.equal(serializeGame(practice).target, null);
    await prisma.gameSession.update({ where: { id: practice.id }, data: { status: "SURRENDERED" } });
    console.log("PASS practice: valid target, resume, target hidden");

    const daily = await startCountryChallenge(a, "ANIMAL");
    const other = await startCountryChallenge(b, "ANIMAL");
    assert.equal(daily.challenge.id, other.challenge.id);
    assert.equal(daily.challenge.target, null);
    assert.equal((await startCountryChallenge(a, "ANIMAL")).entry!.id, daily.entry!.id);
    const challenge = await prisma.countryChallenge.findUniqueOrThrow({ where: { id: daily.challenge.id } });
    const wrong = animals.find(x => x.id !== challenge.targetId)!;
    await submitCountryChallengeGuess(a, wrong.id, "ANIMAL");
    const duplicate = await submitCountryChallengeGuess(a, wrong.id, "ANIMAL");
    assert.equal(duplicate.entry!.guessCount, 1);
    await assert.rejects(() => submitCountryChallengeGuess(a, "IR", "ANIMAL"));
    const solved = await submitCountryChallengeGuess(a, challenge.targetId, "ANIMAL");
    assert.equal(solved.entry!.status, "WON");
    assert.equal(solved.entry!.target!.id, challenge.targetId);
    const board = await countryChallengeLeaderboard(b, daily.challenge.id, "ANIMAL");
    assert.equal(board!.challenge.target, null);
    assert(board!.rows.every(x => x.bestGuess === undefined));
    const surrendered = await surrenderCountryChallenge(b, "ANIMAL");
    assert.equal(surrendered.entry!.target!.id, challenge.targetId);
    await assert.rejects(() => submitCountryChallengeGuess(b, challenge.targetId, "ANIMAL"));
    console.log("PASS daily: shared target, single entry, duplicate, invalid guess, solve, surrender, board privacy");

    await setup();
    const { id, invitation } = await start();
    const selecting = await readCountryRace(a, id);
    assert.equal(selecting.phase, "SELECTING"); assert.equal(selecting.deadline, null);
    const initial = await prisma.countryRace.findUniqueOrThrow({ where: { id } });
    assert.equal(+initial.selectionDeadline! - +initial.startedAt!, 20_000);
    await assert.rejects(() => actCountryRace(a, id, "guess", animals[0].id));
    await assert.rejects(() => actCountryRace(c, id, "choose", animals[0].id));
    await assert.rejects(() => actCountryRace(a, id, "choose", "IR"));
    await Promise.all([actCountryRace(a, id, "choose", animals[0].id), actCountryRace(a, id, "choose", animals[0].id)]);
    await assert.rejects(() => actCountryRace(a, id, "choose", animals[2].id));
    assert.equal((await readCountryRace(b, id)).opponentHasSelected, true);
    await actCountryRace(b, id, "choose", animals[1].id);
    const room = await prisma.countryRace.findUniqueOrThrow({ where: { id } });
    assert.equal(room.playerOneTargetId, animals[1].id);
    assert.equal(room.playerTwoTargetId, animals[0].id);
    assert.equal(+room.deadline! - +room.startedAt!, 200_000);
    const own = await readCountryRace(a, id);
    assert.equal(own.phase, "GUESSING");
    assert.equal(own.selectedForOpponent!.id, animals[0].id);
    assert.equal("target" in own, false);
    assert.equal("playerOneTargetId" in own, false);
    assert.equal("opponentGuesses" in own, false);
    await actOnInvite(a, invitation.id, "ready");
    assert.equal(+(await prisma.countryRace.findUniqueOrThrow({ where: { id } })).deadline!, +room.deadline!);
    await actCountryRace(a, id, "guess", animals[0].id);
    assert.equal((await readCountryRace(a, id)).status, "ACTIVE");
    const won = await actCountryRace(a, id, "guess", animals[1].id);
    assert.equal(won.status, "ENDED"); assert.equal(won.winnerUserId, a);
    assert.equal(won.target!.id, animals[1].id);
    assert.equal(won.opponentTarget!.id, animals[0].id);
    assert.equal(await prisma.competitiveResult.count({ where: { matchKey: `race:${id}`, gameType: "ANIMAL" } }), 1);
    console.log("PASS race: readiness, 20s selection, immutable choices, ownership, target privacy, different targets, 200s clock, Elo");

    await setup();
    const fallback = await start();
    await actCountryRace(a, fallback.id, "choose", animals[0].id);
    const selectionEnd = new Date(Date.now() - 10);
    await prisma.countryRace.update({ where: { id: fallback.id }, data: { selectionDeadline: selectionEnd } });
    const automatic = await readCountryRace(a, fallback.id);
    assert.equal(automatic.phase, "GUESSING");
    const auto = await prisma.countryRace.findUniqueOrThrow({ where: { id: fallback.id } });
    assert(findItem("ANIMAL", auto.playerOneTargetId!));
    assert.equal(auto.playerTwoTargetId, animals[0].id);
    assert.equal(+auto.deadline! - +selectionEnd, 200_000);
    assert.equal((await prisma.countryRace.findUniqueOrThrow({ where: { id: fallback.id } })).playerOneTargetId, auto.playerOneTargetId);
    await assert.rejects(() => actCountryRace(b, fallback.id, "choose", animals.find(x => x.id !== auto.playerOneTargetId)!.id));
    const ga = animals.find(x => x.id !== auto.playerOneTargetId)!, gb = animals.find(x => x.id !== auto.playerTwoTargetId)!;
    const aState = await actCountryRace(a, fallback.id, "guess", ga.id);
    const bState = await actCountryRace(b, fallback.id, "guess", gb.id);
    assert.equal(aState.myBestRank, proximityRank("ANIMAL", ga, findItem("ANIMAL", auto.playerOneTargetId!)!) + 1);
    await prisma.countryRace.update({ where: { id: fallback.id }, data: { deadline: new Date(Date.now() - 1) } });
    const ended = await readCountryRace(a, fallback.id);
    const ar = aState.myBestRank!, br = bState.myBestRank!;
    assert.equal(ended.winnerUserId, ar === br ? null : ar < br ? a : b);
    assert.equal(ended.endReason, "TIMEOUT");
    console.log("PASS fallback: preserves chosen target, fills missing target once, starts at deadline, timeout compares own ranks");

    await setup();
    await startCountryMatch(a, "ANIMAL"); await startCountryMatch(b, "ANIMAL"); await processCountryMatchTick();
    const queued = await readCountryMatch(a), paired = await readCountryMatch(b);
    assert(queued.roomId); assert.equal(queued.roomId, paired.roomId); assert.equal(queued.roomGameKind, "ANIMAL_RACE");
    const queueRoom = await readCountryRace(a, queued.roomId);
    await actOnInvite(a, queueRoom.invite!.id, "ready"); await actOnInvite(b, queueRoom.invite!.id, "ready");
    assert.equal((await readCountryRace(a, queued.roomId)).phase, "SELECTING");
    console.log("PASS matchmaking: shared animal room uses the same selection phase");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
