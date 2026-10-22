/** Disposable database only; never sends Telegram messages. */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { sendInvite, readInvites, actOnInvite } from "../lib/duel-invites";
import { serializeDuel, leaveDuel } from "../lib/letter-duel";
import { readCountryRace, actCountryRace } from "../lib/country-race";
import { wordWeaverActor } from "../lib/word-weaver-personas";
import { publicDisplayName } from "../lib/public-identity";
import { renderPhraseHuntAnnouncement, selectTopPhraseHuntWinners, refreshAnnouncementNames } from "../lib/phrase-hunt-announcements";
if (!new URL(process.env.DATABASE_URL || "").pathname.includes("test")) throw new Error("Use a disposable test database");
const ids=["privacy-test-a","privacy-test-b"], [a,b]=ids;
async function main() {
  await prisma.user.deleteMany({where:{id:{in:ids}}});
  await prisma.user.createMany({data:ids.map((id,i)=>({id,firstName:i?"یاسمن":"علی",username:i?"privacy_visible_b":"privacy_secret_a"}))});
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a}})).showUsername,true);
  await prisma.user.update({where:{id:a},data:{showUsername:false}});
  await prisma.onlinePresence.createMany({data:ids.map(userId=>({userId}))});
  const invite=await sendInvite(a,b);assert.equal(invite.sender.username,null);
  const incoming=(await readInvites(b)).invites[0];assert.equal(incoming.sender.username,null);assert.equal(incoming.recipient.username,"privacy_visible_b");
  console.log("PASS default visible; opt-out redacts both outgoing and incoming invitation identities");
  const accepted=await actOnInvite(b,invite.id,"accept");await actOnInvite(a,invite.id,"ready");await actOnInvite(b,invite.id,"ready");
  const duel=await serializeDuel(b,accepted.connectionId);assert.equal(duel!.opponent!.username,null);assert.equal(duel!.opponent!.name,"علی");
  assert.ok(!JSON.stringify(duel).includes("privacy_secret_a"));console.log("PASS letter duel preserves play while hiding username and name fallback");
  await leaveDuel(a,accepted.connectionId!);
  await prisma.duelInvite.updateMany({where:{senderId:a},data:{createdAt:new Date(Date.now()-121000)}});
  await prisma.onlinePresence.updateMany({where:{userId:{in:ids}},data:{lastSeenAt:new Date()}});
  const next=await sendInvite(a,b,"COUNTRY_RACE"), room=await actOnInvite(b,next.id,"accept");await actOnInvite(a,next.id,"ready");await actOnInvite(b,next.id,"ready");
  assert.equal((await readCountryRace(b,room.countryRaceId!)).opponent.username,null);assert.equal((await readCountryRace(a,room.countryRaceId!)).me.username,null);
  console.log("PASS country race redacts both player payloads");await actCountryRace(a,room.countryRaceId!,"leave");
  const user=await prisma.user.update({where:{id:a},data:{username:"privacy_changed_a"}});assert.equal(user.showUsername,false);
  assert.equal(wordWeaverActor({user}).username,null);assert.equal(publicDisplayName(user,true),"علی");console.log("PASS privacy survives Telegram username changes and applies to writing actors");
  const winners=selectTopPhraseHuntWinners([{id:"guess",userId:a,username:user.username,showUsername:user.showUsername,firstName:user.firstName,lastName:user.lastName,phrase:"رخنه",score:100,createdAt:new Date()}]);
  assert.ok(!renderPhraseHuntAnnouncement("رخنه",winners).includes(user.username!));
  const queued=refreshAnnouncementNames("🥇 <b>@privacy_secret_a</b> — «رخنه» <code>۱۰۰ از ۱۰۰</code>",[publicDisplayName(user,true)]);
  assert.ok(queued.includes("<b>علی</b>"));assert.ok(!queued.includes("privacy_secret_a"));console.log("PASS newly rendered and queued bot result names honor opt-out without sending messages");
  await prisma.user.update({where:{id:a},data:{showUsername:true}});assert.equal(publicDisplayName(await prisma.user.findUniqueOrThrow({where:{id:a}}),true),"@privacy_changed_a");console.log("PASS user can restore username visibility");
}
main().finally(async()=>{await prisma.user.deleteMany({where:{id:{in:ids}}});await prisma.$disconnect();}).catch(e=>{console.error(e);process.exitCode=1;});
