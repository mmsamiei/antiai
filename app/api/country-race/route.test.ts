import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUserId: vi.fn(), readCountryRace: vi.fn(), actCountryRace: vi.fn(), rematchCountryRace: vi.fn(), actOnInvite: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUserId: mocks.currentUserId }));
vi.mock("@/lib/country-race", () => mocks);
vi.mock("@/lib/duel-invites", async () => ({ ...await vi.importActual("@/lib/duel-invites"), actOnInvite: mocks.actOnInvite }));
import { GET, POST } from "./route";
import { InviteError } from "@/lib/duel-invites";
const request = (body: unknown) => new Request("https://example.test/api/country-race", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.currentUserId.mockReturnValue("me"); mocks.readCountryRace.mockResolvedValue({ id: "race", invite: { id: "invite" } }); });
describe("country race authenticated API", () => {
  it("rejects anonymous reads and mutations", async () => {
    mocks.currentUserId.mockReturnValue(null);
    expect((await GET(new Request("https://example.test/api/country-race?id=race"))).status).toBe(401);
    expect((await POST(request({ action: "guess", id: "race", itemId: "IR" }))).status).toBe(401);
    expect(mocks.actCountryRace).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { action: "guess", id: "race" }, { action: "ready", id: "race", inviteId: [] }, { action: "create", id: "race" }])("rejects malformed input and direct creation %j", async body => {
    expect((await POST(request(body))).status).toBe(400); expect(mocks.actCountryRace).not.toHaveBeenCalled();
  });
  it("derives guess ownership from the session", async () => {
    expect((await POST(request({ action: "guess", id: "race", itemId: "IR", userId: "forged" }))).status).toBe(200);
    expect(mocks.actCountryRace).toHaveBeenCalledWith("me", "race", "guess", "IR");
  });
  it("authenticates animal choices and ignores a forged selector", async () => {
    expect((await POST(request({ action: "choose", id: "race", itemId: "ott563151", userId: "forged" }))).status).toBe(200);
    expect(mocks.actCountryRace).toHaveBeenCalledWith("me", "race", "choose", "ott563151");
    expect((await POST(request({ action: "choose", id: "race" }))).status).toBe(400);
    mocks.currentUserId.mockReturnValue(null);
    expect((await POST(request({ action: "choose", id: "race", itemId: "ott563151" }))).status).toBe(401);
  });
  it("requires readiness to belong to this race", async () => {
    expect((await POST(request({ action: "ready", id: "race", inviteId: "other" }))).status).toBe(404);
    expect(mocks.actOnInvite).not.toHaveBeenCalled();
  });
  it("returns an ownership failure without exposing another race", async () => {
    mocks.readCountryRace.mockRejectedValue(new InviteError("مسابقه پیدا نشد", 404));
    expect((await GET(new Request("https://example.test/api/country-race?id=other"))).status).toBe(404);
  });
});
