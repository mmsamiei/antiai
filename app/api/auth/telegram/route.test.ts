import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), session: vi.fn(), suspended: vi.fn() }));
vi.mock("@/lib/account-suspensions", () => ({ isAccountSuspended: mocks.suspended }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { upsert: mocks.upsert } } }));
vi.mock("@/lib/auth", () => ({ createSessionValue: mocks.session, SESSION_COOKIE: "anti_ai_user_id" }));
import { POST } from "./route";
const token = "test-bot-token";
function signedData(user: unknown = { id: 123, first_name: "آزمایشی" }, date = Math.floor(Date.now()/1000)) {
  const params = new URLSearchParams({ user: JSON.stringify(user), auth_date: String(date), query_id: "test-launch" });
  const data = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256","WebAppData").update(token).digest();
  params.set("hash",crypto.createHmac("sha256",secret).update(data).digest("hex")); return params.toString();
}
const request = (body: unknown) => new Request("https://example.test/api/auth/telegram", { method:"POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.suspended.mockReturnValue(false); vi.stubEnv("TELEGRAM_BOT_TOKEN",token); vi.stubEnv("NODE_ENV","production");
  mocks.upsert.mockResolvedValue({ id:"123" }); mocks.session.mockReturnValue("signed-session");
  vi.spyOn(console,"warn").mockImplementation(() => {}); vi.spyOn(console,"error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("verified Telegram login", () => {
  it("rejects a verified but suspended account without issuing another session", async () => {
    mocks.suspended.mockReturnValue(true);
    const response = await POST(request({ initData: signedData() }));
    expect(response.status).toBe(403); expect((await response.json()).code).toBe("ACCOUNT_SUSPENDED");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("verifies the signature before creating a session", async () => {
    const response = await POST(request({initData:signedData(), userId:"forged-user"}));
    expect(response.status).toBe(200); expect(mocks.upsert.mock.calls[0][0].where).toEqual({id:"123"});
    expect(mocks.session).toHaveBeenCalledWith("123");
    expect(await response.json()).toMatchObject({user:{id:123},session:"signed-session"});
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
  it.each([null,{}, {initData:42},{initData:""},{initData:"x".repeat(16385)}])("rejects malformed input without accessing the database", async body => {
    expect((await POST(request(body))).status).toBe(400); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON", async () => {
    expect((await POST(new Request("https://example.test",{method:"POST",body:"{"}))).status).toBe(400);
  });
  it("rejects tampered identity data", async () => {
    const params = new URLSearchParams(signedData()); params.set("user",JSON.stringify({id:456}));
    const response = await POST(request({initData:params.toString()}));
    expect(response.status).toBe(401); expect((await response.json()).code).toBe("INVALID_TELEGRAM_SESSION");
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([-86401,600])("rejects expired or future launch data (%s seconds)", async offset => {
    expect((await POST(request({initData:signedData(undefined,Math.floor(Date.now()/1000)+offset)}))).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([null, {id:"123"}, {id:-1}, {id:1.5}])("rejects malformed signed users %j", async user => {
    expect((await POST(request({initData:signedData(user)}))).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("distinguishes server failure from invalid credentials", async () => {
    mocks.upsert.mockRejectedValue(new Error("database offline"));
    const response = await POST(request({initData:signedData()}));
    expect(response.status).toBe(503); expect((await response.json()).code).toBe("AUTH_UNAVAILABLE");
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not misreport missing server configuration as invalid credentials", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN","");
    expect((await POST(request({initData:signedData()}))).status).toBe(503);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
