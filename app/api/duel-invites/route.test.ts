import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUserId: vi.fn(), readInvites: vi.fn(), sendInvite: vi.fn(), actOnInvite: vi.fn(), setInvitePreference: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("@/lib/duel-invites", async () => ({ ...await vi.importActual("@/lib/duel-invites"), ...mocks }));
import { GET, POST } from "./route";
const request = (body: unknown) => new Request("https://example.test/api/duel-invites", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.currentUserId.mockReturnValue("me"); mocks.readInvites.mockResolvedValue({ invites: [], acceptsGameInvites: true }); });
describe("private invite API", () => {
  it("accepts the animal game invitation kind", async () => {
    expect((await POST(request({ action: "send", recipientId: "other", gameKind: "ANIMAL_RACE" }))).status).toBe(200);
    expect(mocks.sendInvite).toHaveBeenCalledWith("me", "other", "ANIMAL_RACE");
  });
  it("rejects anonymous reads and writes", async () => {
    mocks.currentUserId.mockReturnValue(null);
    expect((await GET()).status).toBe(401); expect((await POST(request({ action: "send", recipientId: "other" }))).status).toBe(401);
    expect(mocks.readInvites).not.toHaveBeenCalled(); expect(mocks.sendInvite).not.toHaveBeenCalled();
  });
  it.each([{}, { action: "send", recipientId: "" }, { action: "accept", id: [] }, { action: "preference", enabled: "true" }, { action: "ready", id: "x/y" }])("rejects malformed input %j", async body => {
    expect((await POST(request(body))).status).toBe(400); expect(mocks.actOnInvite).not.toHaveBeenCalled();
  });
  it("derives the sender from authentication", async () => {
    expect((await POST(request({ action: "send", recipientId: "other", senderId: "forged" }))).status).toBe(200);
    expect(mocks.sendInvite).toHaveBeenCalledWith("me", "other"); expect(mocks.readInvites).toHaveBeenCalledWith("me");
  });
  it("passes the selected game and rejects unknown games", async () => {
    await POST(request({ action: "send", recipientId: "other", gameKind: "COUNTRY_RACE" }));
    expect(mocks.sendInvite).toHaveBeenCalledWith("me", "other", "COUNTRY_RACE");
    await POST(request({ action: "send", recipientId: "other", gameKind: "CITY_RACE" }));
    expect(mocks.sendInvite).toHaveBeenCalledWith("me", "other", "CITY_RACE");
    expect((await POST(request({ action: "send", recipientId: "other", gameKind: "UNKNOWN" }))).status).toBe(400);
  });
  it("passes authenticated ownership to acceptance", async () => {
    await POST(request({ action: "accept", id: "invitation" }));
    expect(mocks.actOnInvite).toHaveBeenCalledWith("me", "invitation", "accept");
  });
  it("updates only the authenticated user's preference", async () => {
    await POST(request({ action: "preference", enabled: false, userId: "other" }));
    expect(mocks.setInvitePreference).toHaveBeenCalledWith("me", false);
  });
});
