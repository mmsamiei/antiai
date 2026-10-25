import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), set: vi.fn() }));
vi.mock("./telegram-client", () => ({ authenticateTelegram: mocks.auth, TelegramLoginError: class extends Error { constructor(public code: string) { super(code); } } }));
vi.mock("./client-session", () => ({ setClientSessionToken: mocks.set }));
import { authenticateGame, rememberCodeLogin } from "./code-login-client";
import { TelegramLoginError } from "./telegram-client";
let stored: Record<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); stored = {};
  vi.stubGlobal("localStorage", { getItem: (key: string) => stored[key] || null, setItem: (key: string, value: string) => { stored[key] = value; }, removeItem: (key: string) => { delete stored[key]; } });
  vi.stubGlobal("Telegram", undefined);
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
});
it("resumes the same saved browser session without issuing or requesting another code", async () => {
  const data = { user: { id: "42" }, session: "otp:saved", expiresAt: Date.now() + 3600_000 };
  rememberCodeLogin(data);
  mocks.auth.mockRejectedValue(new TelegramLoginError("MISSING_LAUNCH_DATA"));
  fetchMock.mockResolvedValue({ ok: true, json: async () => data });
  expect(await authenticateGame(new AbortController().signal)).toEqual(data);
  expect(fetchMock.mock.calls[0][0]).toContain("/api/auth/code/session");
  expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer otp:saved");
});
it("prefers signed Telegram identity and clears the saved code session", async () => {
  stored["anti-ai-code-session"] = "old";
  const data = { user: { id: 99 }, session: "signed" }; mocks.auth.mockResolvedValue(data);
  expect(await authenticateGame(new AbortController().signal)).toEqual(data);
  expect(stored["anti-ai-code-session"]).toBeUndefined(); expect(fetchMock).not.toHaveBeenCalled();
});
it("does not switch silently to a saved user when a Telegram launch is present", async () => {
  vi.stubGlobal("Telegram", { WebApp: { initData: "signed-data" } });
  mocks.auth.mockRejectedValue(new TelegramLoginError("NETWORK_ERROR"));
  await expect(authenticateGame(new AbortController().signal)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not bypass suspension with a saved session", async () => {
  mocks.auth.mockRejectedValue(new TelegramLoginError("ACCOUNT_SUSPENDED"));
  await expect(authenticateGame(new AbortController().signal)).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" }); expect(fetchMock).not.toHaveBeenCalled();
});
it("discards a server-expired session and keeps the login error visible", async () => {
  rememberCodeLogin({ user: { id: 42 }, session: "otp:saved", expiresAt: Date.now() + 3600_000 });
  mocks.auth.mockRejectedValue(new TelegramLoginError("MISSING_LAUNCH_DATA"));
  fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "expired" }) });
  await expect(authenticateGame(new AbortController().signal)).rejects.toMatchObject({ code: "MISSING_LAUNCH_DATA" });
  expect(stored["anti-ai-code-session"]).toBeUndefined();
});
