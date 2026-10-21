import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { inviteTransaction } from "./duel-invites";

afterEach(() => vi.restoreAllMocks());
describe("duel transaction contention", () => {
  it.each(["40001", "40P01"])("retries raw row-lock conflicts (%s)", async code => {
    const conflict = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2010", clientVersion: "test", meta: { code } });
    const transaction = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(conflict).mockResolvedValueOnce("room");
    expect(await inviteTransaction(async () => "room")).toBe("room");
    expect(transaction).toHaveBeenCalledTimes(2);
  });
  it("bounds retries and does not retry unrelated database errors", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
    const transaction = vi.spyOn(prisma, "$transaction").mockRejectedValue(conflict);
    await expect(inviteTransaction(async () => null)).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(4);
    transaction.mockReset().mockRejectedValue(new Error("unrelated"));
    await expect(inviteTransaction(async () => null)).rejects.toThrow("unrelated");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
