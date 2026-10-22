import { prisma } from "./prisma";
import { readInvites } from "./duel-invites";
import { readCountryMatch } from "./country-matchmaking";
export async function readSocialStatus(userId: string) {
  const rows = await prisma.$queryRaw<{ acceptsGameInvites: boolean; hasInvitations: boolean; hasMatching: boolean }[]>`
    SELECT u."acceptsGameInvites",
      (EXISTS (SELECT 1 FROM "DuelInvite" i WHERE i."senderId"=u.id OR i."recipientId"=u.id)
       OR EXISTS (SELECT 1 FROM "CountryRace" r WHERE (r."playerOneId"=u.id OR r."playerTwoId"=u.id) AND r.status IN ('WAITING','ACTIVE'))
       OR EXISTS (SELECT 1 FROM "LetterDuelConnection" r WHERE (r."playerOneId"=u.id OR r."playerTwoId"=u.id) AND r.status IN ('WAITING','ACTIVE'))) AS "hasInvitations",
      (EXISTS (SELECT 1 FROM "CountryMatchSearch" s WHERE s."userId"=u.id)
       OR EXISTS (SELECT 1 FROM "CountryMatchOffer" o WHERE o."recipientId"=u.id OR o."senderId"=u.id)) AS "hasMatching"
    FROM "User" u WHERE u.id=${userId}
  `;
  const user = rows[0];
  if (!user) throw new Error("USER_NOT_FOUND");
  const serverNow = new Date();
  const invitations = user.hasInvitations ? await readInvites(userId) : { acceptsGameInvites: user.acceptsGameInvites, invites: [], serverNow };
  const matching = user.hasMatching ? await readCountryMatch(userId) : { search: null, incoming: null, roomId: null, roomGameKind: null, serverNow };
  return { invitations, matching };
}
