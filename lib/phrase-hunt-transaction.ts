import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const MAX_RETRIES = 3;

// Retry only the rolled-back database work; judging stays outside this callback.
export async function phraseHuntTransaction<T>(userId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Coordinate this player's submissions across web processes and tabs.
        // Wait before reading state so a queued request sees the previous commit.
        const users = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE
        `;
        if (!users.length) throw new Error("GAME_NOT_ACTIVE");
        return work(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000 });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= MAX_RETRIES) throw error;
      const delay = 100 * 2 ** attempt;
      await new Promise<void>((resolve) => setTimeout(resolve, delay + Math.floor(Math.random() * delay)));
    }
  }
}
