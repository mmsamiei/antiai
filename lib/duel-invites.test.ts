import { describe, expect, it } from "vitest";
import { INVITE_MS, pendingInvalidReason } from "./duel-invites";
describe("invite validity boundaries", () => {
  it("allows sixty seconds to respond", () => expect(INVITE_MS).toBe(60_000));
  const now = new Date("2026-10-21T10:00:00Z");
  it("keeps a live invitation valid before its deadline", () => {
    expect(pendingInvalidReason(new Date(+now + 1), now, true, true, false)).toBeNull();
  });
  it("expires at the exact deadline regardless of presence", () => {
    expect(pendingInvalidReason(now, now, true, true, false)).toBe("مهلت دعوت تمام شد");
  });
  it.each([[false, true], [true, false], [false, false]])("cancels when a participant is offline (%s/%s)", (sender, recipient) => {
    expect(pendingInvalidReason(new Date(+now + INVITE_MS), now, sender, recipient, false)).toBe("یکی از بازیکن‌ها دیگر آنلاین نیست");
  });
  it("cancels an invitation superseded by a duel", () => {
    expect(pendingInvalidReason(new Date(+now + INVITE_MS), now, true, true, true)).toBe("یکی از بازیکن‌ها وارد بازی دونفرهٔ دیگری شده است");
  });
});
