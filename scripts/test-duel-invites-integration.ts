/** Run against a disposable database whose name contains "test"; never production. */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { actOnInvite, readInvites, sendInvite, setInvitePreference } from "../lib/duel-invites";
import { createPrivateDuel, joinPrivateDuel, joinRandomDuel, serializeDuel } from "../lib/letter-duel";
const url = new URL(process.env.DATABASE_URL || "");
if (!url.pathname.includes("test")) throw new Error("A disposable test database is required");
const ids = ["invite-test-a", "invite-test-b", "invite-test-c", "invite-test-d"];
let checks = 0;
async function check(name: string, run: () => Promise<void>) {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.createMany({ data: ids.map((id, i) => ({ id, username: `test_${i}`, firstName: `آزمایش ${i}` })) });
  await prisma.onlinePresence.createMany({ data: ids.map(userId => ({ userId })) });
  await run(); console.log("PASS", name); checks++;
}
async function reject(run: () => Promise<unknown>, text?: RegExp) { if (text) await assert.rejects(run, text); else await assert.rejects(run); }
async function main() {
  const [a,b,c,d] = ids;
  await check("acceptance waits for both clients; duplicate accepts/readiness create one room", async () => {
    const invite = await sendInvite(a,b);
    assert.equal(invite.sender.id,a); assert.equal(invite.recipient.id,b);
    assert.equal((await readInvites(c)).invites.length,0);
    await reject(() => actOnInvite(a,invite.id,"accept"));
    await reject(() => actOnInvite(c,invite.id,"ready"));
    const accepted = await actOnInvite(b,invite.id,"accept");
    await actOnInvite(b,invite.id,"accept");
    assert.equal(await prisma.letterDuelConnection.count({ where: { id: accepted.connectionId! } }),1);
    assert.equal((await serializeDuel(a,accepted.connectionId))!.status,"WAITING");
    assert.equal(await prisma.letterDuelRound.count({ where: { connectionId: accepted.connectionId! } }),0);
    await actOnInvite(b,invite.id,"ready");
    assert.equal((await serializeDuel(b,accepted.connectionId))!.status,"WAITING");
    await actOnInvite(a,invite.id,"ready");
    await Promise.all([serializeDuel(a,accepted.connectionId),serializeDuel(b,accepted.connectionId)]);
    assert.equal(await prisma.letterDuelRound.count({ where: { connectionId: accepted.connectionId! } }),1);
    await actOnInvite(a,invite.id,"ready");
    assert.equal((await serializeDuel(b,accepted.connectionId))!.status,"ACTIVE");
    assert.equal((await serializeDuel(c,accepted.connectionId)),null);
  });
  await check("single outgoing invitation and pair cooldown; recipient ownership", async () => {
    const invite = await sendInvite(a,b);
    await reject(() => sendInvite(a,c));
    await reject(() => actOnInvite(a,invite.id,"reject"));
    await reject(() => actOnInvite(b,invite.id,"cancel"));
    await reject(() => actOnInvite(c,invite.id,"cancel"));
    await actOnInvite(a,invite.id,"cancel");
    await reject(() => sendInvite(a,b), /دو دقیقه/);
    await sendInvite(a,c);
    await reject(() => sendInvite(d,d));
  });
  await check("recipient disables invitations; existing received invitations cancel", async () => {
    const i = await sendInvite(a,b);
    await setInvitePreference(b,false);
    assert.equal((await readInvites(a)).invites[0].status,"CANCELLED");
    await reject(() => sendInvite(c,b));
    await reject(() => actOnInvite(b,i.id,"accept"));
    await setInvitePreference(b,true); await sendInvite(c,b);
  });
  await check("expiration is committed even when a late acceptance fails", async () => {
    const i = await sendInvite(a,b);
    await prisma.duelInvite.update({ where: { id: i.id }, data: { expiresAt: new Date(Date.now()-1) } });
    await reject(() => actOnInvite(b,i.id,"accept"));
    assert.equal((await readInvites(a)).invites[0].status,"EXPIRED");
    assert.equal(await prisma.letterDuelConnection.count({ where: { playerOneId: a, status: "WAITING" } }),0);
  });
  await check("either participant going offline cancels invitations", async () => {
    const i = await sendInvite(a,b);
    await prisma.onlinePresence.update({ where: { userId:a }, data: { lastSeenAt: new Date(Date.now()-21000) } });
    assert.equal((await readInvites(b)).invites[0].status,"CANCELLED");
    await reject(() => actOnInvite(b,i.id,"accept"));
    await reject(() => sendInvite(c,a));
  });
  await check("readiness deadline ends the reserved room and explains cancellation", async () => {
    const i = await sendInvite(a,b); const accepted = await actOnInvite(b,i.id,"accept");
    await actOnInvite(a,i.id,"ready");
    await prisma.duelInvite.update({ where: { id:i.id }, data: { startDeadline: new Date(Date.now()-1) } });
    const room = await serializeDuel(b,accepted.connectionId);
    assert.equal(room!.status,"ENDED"); assert.match(room!.directInvite!.reason!,/به‌موقع/);
    await reject(() => actOnInvite(b,i.id,"ready"));
  });
  await check("parallel invitations from the same sender yield only one pending invitation", async () => {
    const results = await Promise.allSettled([sendInvite(a,b),sendInvite(a,c)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length,1);
    assert.equal(await prisma.duelInvite.count({ where: { senderId:a,status:"PENDING" } }),1);
  });
  await check("simultaneous accepts cannot allocate two rooms", async () => {
    const i = await sendInvite(a,b), j = await sendInvite(c,b);
    const results = await Promise.allSettled([actOnInvite(b,i.id,"accept"),actOnInvite(b,j.id,"accept")]);
    assert.equal(results.filter(r => r.status === "fulfilled").length,1);
    assert.equal(await prisma.letterDuelConnection.count({ where: { playerTwoId:b,status:"WAITING" } }),1);
    assert.equal(await prisma.duelInvite.count({ where: { recipientId:b,status:"CANCELLED" } }),1);
  });
  await check("legacy create racing acceptance cannot allocate a second active room", async () => {
    const i = await sendInvite(a,b);
    await Promise.allSettled([actOnInvite(b,i.id,"accept"),createPrivateDuel(a)]);
    assert.equal(await prisma.letterDuelConnection.count({ where: { status:{in:["WAITING","ACTIVE"]},OR:[{playerOneId:a},{playerTwoId:a}] } }),1);
  });
  await check("a player in a duel can receive an invitation; acceptance requires leaving", async () => {
    await createPrivateDuel(b);
    const i = await sendInvite(a,b);
    await reject(() => actOnInvite(b,i.id,"accept"));
    assert.equal((await readInvites(a)).invites.find(x=>x.id===i.id)!.status,"PENDING");
  });
  await check("starting a different duel invalidates an outgoing invitation", async () => {
    const i = await sendInvite(a,b); await createPrivateDuel(a);
    assert.equal((await readInvites(b)).invites.find(x=>x.id===i.id)!.status,"CANCELLED");
  });
  await check("private links and random matchmaking still work", async () => {
    const room = await createPrivateDuel(a);
    await joinPrivateDuel(b,room.inviteToken!);
    assert.equal((await serializeDuel(a,room.id))!.status,"ACTIVE");
    const waiting = await joinRandomDuel(c); const match = await joinRandomDuel(d);
    assert.equal(match.id,waiting.id); assert.equal(match.status,"ACTIVE");
  });
  await check("stale legacy private room does not block a new invitation", async () => {
    const old = await createPrivateDuel(a);
    await prisma.letterDuelConnection.update({where:{id:old.id},data:{playerOneHeartbeat:new Date(Date.now()-31000)}});
    await sendInvite(a,b);
    assert.equal((await prisma.letterDuelConnection.findUniqueOrThrow({where:{id:old.id}})).status,"ENDED");
  });
  await check("pending invitations and reserved rooms remain visible beyond the history limit", async () => {
    const invite = await sendInvite(a,b);
    await prisma.duelInvite.createMany({ data: Array.from({length:110}, (_,i) => ({
      senderId:c, recipientId:b, status:"REJECTED", expiresAt:new Date(Date.now()+120000), createdAt:new Date(+invite.createdAt+i+1)
    })) });
    assert.equal((await readInvites(b)).invites.find(i=>i.id===invite.id)!.status,"PENDING");
    await actOnInvite(b,invite.id,"accept");
    assert.equal((await readInvites(b)).invites.find(i=>i.id===invite.id)!.connection!.status,"WAITING");
  });
  console.log(`${checks} integration scenarios passed`);
}
main().finally(async () => { await prisma.user.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect(); }).catch(e => { console.error(e); process.exitCode=1; });
