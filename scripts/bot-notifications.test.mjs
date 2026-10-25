import { describe, expect, it, vi } from "vitest";
import { handleAnnouncementUpdate } from "./bot-notifications.mjs";
describe("bot announcement settings", () => {
  it.each(["off", "on"])("persists explicit %s and offers reversal", async action => {
    const db = { user: { upsert: vi.fn() } }; const call = vi.fn();
    await handleAnnouncementUpdate(db, call, { callback_query: { id: "q", data: `announcements:${action}`, from: { id: 42 }, message: { chat: { type: "private", id: 42 } } } });
    expect(db.user.upsert).toHaveBeenCalledWith({ where: { id: "42" }, create: { id: "42", announcementsEnabled: action === "on" }, update: { announcementsEnabled: action === "on" } });
    expect(call).toHaveBeenCalledWith("sendMessage", expect.objectContaining({ reply_markup: { inline_keyboard: [[expect.objectContaining({ callback_data: action === "on" ? "announcements:off" : "announcements:on" })]] } }));
  });
  it("rejects settings changes outside the user's private chat", async () => {
    const db = { user: { upsert: vi.fn() } }; const call = vi.fn();
    await handleAnnouncementUpdate(db, call, { callback_query: { id: "q", data: "announcements:off", from: { id: 42 }, message: { chat: { type: "group", id: -1 } } } });
    expect(db.user.upsert).not.toHaveBeenCalled();
  });
});
