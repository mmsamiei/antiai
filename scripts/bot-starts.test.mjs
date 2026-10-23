import { describe, expect, it, vi } from "vitest";
import { parseStartCommand, recordStartCommand } from "./bot-starts.mjs";

describe("Telegram /start tracking", () => {
  it("recognizes plain and deep-linked start commands without retaining the raw payload", () => {
    expect(parseStartCommand("/start")).toEqual({ payload: "", payloadKind: "PLAIN" });
    expect(parseStartCommand("/start@ood_antiai_bot phrase_hunt")).toEqual({ payload: "phrase_hunt", payloadKind: "PHRASE_HUNT" });
    expect(parseStartCommand("/start duel_privateSecret")).toEqual({ payload: "duel_privateSecret", payloadKind: "DUEL_INVITE" });
    expect(parseStartCommand("/play")).toBeNull();
  });

  it("persists a Telegram start with update idempotency and the Telegram message time", async () => {
    const upsert = vi.fn();
    const prisma = { telegramStartEvent: { upsert } };
    const update = {
      update_id: 123,
      message: {
        text: "/start duel_superSecret",
        date: 1_797_900_000,
        from: { id: 99887766, username: "player", first_name: "Player", last_name: "One" },
      },
    };

    await expect(recordStartCommand(prisma, update)).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      where: { updateId: 123n },
      create: {
        updateId: 123n,
        telegramUserId: "99887766",
        username: "player",
        firstName: "Player",
        lastName: "One",
        payloadKind: "DUEL_INVITE",
        messageAt: new Date(1_797_900_000 * 1000),
      },
      update: {},
    });
    expect(upsert.mock.calls[0][0].create).not.toHaveProperty("startPayload");
  });

  it("ignores non-start commands and bot senders", async () => {
    const upsert = vi.fn();
    const prisma = { telegramStartEvent: { upsert } };
    await expect(recordStartCommand(prisma, { update_id: 1, message: { text: "/play", from: { id: 1 }, date: 1 } })).resolves.toBe(false);
    await expect(recordStartCommand(prisma, { update_id: 2, message: { text: "/start", from: { id: 1, is_bot: true }, date: 1 } })).resolves.toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});
