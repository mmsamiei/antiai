import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { queueGeographyChallengeAnnouncements } from "../lib/geography-challenge-announcements";
if (!process.env.DATABASE_URL?.includes("anti_ai_invites_test")) throw Error("Disposable test database required");
async function reset() {
 await prisma.phraseHuntAnnouncement.deleteMany({ where: { geoChallengeId: { not: null } } });
 await prisma.geoChallengeNotificationConfig.deleteMany();
}
async function main(){try{
 await reset();
 await prisma.geoChallengeNotificationConfig.createMany({ data: ["COUNTRY", "IRAN_CITY"].map(gameType=>({gameType,enabledAt:new Date("2026-10-22T16:00Z")})) });
 await queueGeographyChallengeAnnouncements(new Date("2026-10-22T16:29:59Z"));
 assert.equal(await prisma.phraseHuntAnnouncement.count({where:{geoChallengeId:{not:null}}}),0);
 await queueGeographyChallengeAnnouncements(new Date("2026-10-22T16:30Z"));
 const first=await prisma.phraseHuntAnnouncement.findFirstOrThrow({where:{geoChallengeId:"2026-10-22T16:30:00.000Z"}});assert(first.messageText.includes("کشورجو"));
 await queueGeographyChallengeAnnouncements(new Date("2026-10-22T16:30Z"));
 assert.equal(await prisma.phraseHuntAnnouncement.count({where:{geoChallengeId:{not:null}}}),1);
 await queueGeographyChallengeAnnouncements(new Date("2026-10-22T17:30Z"));
 assert.equal(await prisma.phraseHuntAnnouncement.count({where:{geoChallengeId:{not:null}}}),2);
 await queueGeographyChallengeAnnouncements(new Date("2026-10-23T04:30Z"));
 assert.equal(await prisma.phraseHuntAnnouncement.count({where:{geoChallengeId:{not:null}}}),3);
 assert.equal(await prisma.phraseHuntAnnouncementDelivery.count({where:{announcement:{geoChallengeId:{not:null}},status:"SENT"}}),0);
 const config=await prisma.geoChallengeNotificationConfig.findUniqueOrThrow({where:{gameType:"COUNTRY"}});assert.equal(config.lastQueuedStart?.toISOString(),"2026-10-23T04:30:00.000Z");
 console.log("PASS geographic outbox: no old broadcasts, country 20/08 and city 21 boundaries, restart idempotency, persisted cursor, no actual Telegram sends");
}finally{await reset();await prisma.$disconnect();}}
void main().catch(e=>{console.error(e);process.exitCode=1});
