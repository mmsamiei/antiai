import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeScript = { src: string; async: boolean; onload: null | (() => void); onerror: null | (() => void); remove: ReturnType<typeof vi.fn> };
let scripts: FakeScript[];
let fetchMock: ReturnType<typeof vi.fn>;
let client: typeof import("./telegram-client");
function app(initData = "signed-launch-data") { vi.stubGlobal("Telegram", { WebApp: { initData, ready: vi.fn(), expand: vi.fn() } }); }
async function loadedAuth(signal = new AbortController().signal) {
  const promise = client.authenticateTelegram(signal);
  app(); scripts[0].onload!();
  return promise;
}
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  scripts = [];
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 42 }, session: "signed-session" }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Telegram", undefined);
  vi.stubGlobal("document", {
    createElement: () => ({ src: "", async: false, onload: null, onerror: null, remove: vi.fn() }),
    head: { appendChild: (script: FakeScript) => scripts.push(script) },
  });
  client = await import("./telegram-client");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Telegram startup and retry", () => {
  it("loads the local SDK before sending the signed launch data", async () => {
    const promise = client.authenticateTelegram(new AbortController().signal);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scripts[0].src).toBe((process.env.NEXT_PUBLIC_BASE_PATH || "") + client.TELEGRAM_SDK_PATH);
    expect(scripts[0].src).not.toContain("https://");
    app(); scripts[0].onload!();
    expect(await promise).toMatchObject({ user: { id: 42 }, session: "signed-session" });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe((process.env.NEXT_PUBLIC_BASE_PATH || "") + "/api/auth/telegram");
    expect(JSON.parse(request.body)).toEqual({ initData: "signed-launch-data" });
  });
  it("can download the SDK again after an initial failure", async () => {
    const first = client.loadTelegramSdk(new AbortController().signal);
    const rejected = expect(first).rejects.toMatchObject({ code: "SDK_LOAD_FAILED" });
    scripts[0].onerror!(); await rejected;
    expect(scripts[0].remove).toHaveBeenCalled();
    const second = client.loadTelegramSdk(new AbortController().signal);
    expect(scripts).toHaveLength(2);
    app(); scripts[1].onload!(); await second;
  });
  it("keeps a shared SDK download alive when the first React effect is cleaned up", async () => {
    const controller = new AbortController();
    const first = client.loadTelegramSdk(controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    const second = client.loadTelegramSdk(new AbortController().signal);
    expect(scripts).toHaveLength(1);
    app(); scripts[0].onload!(); await rejected; await second;
  });
  it("waits for launch data that becomes available slightly later", async () => {
    vi.useFakeTimers(); app("");
    const promise = client.waitForTelegramInitData(new AbortController().signal);
    setTimeout(() => app("late-launch-data"), 700);
    await vi.advanceTimersByTimeAsync(800);
    expect(await promise).toBe("late-launch-data");
  });
  it("never calls demo login in production when launch data is absent", async () => {
    vi.useFakeTimers();
    const promise = client.authenticateTelegram(new AbortController().signal);
    const rejected = expect(promise).rejects.toMatchObject({ code: "MISSING_LAUNCH_DATA" });
    app(""); scripts[0].onload!(); await vi.advanceTimersByTimeAsync(3100); await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("times out an SDK request and lets the next attempt try again", async () => {
    vi.useFakeTimers();
    const promise = client.loadTelegramSdk(new AbortController().signal);
    const rejected = expect(promise).rejects.toMatchObject({ code: "SDK_LOAD_FAILED" });
    await vi.advanceTimersByTimeAsync(10000); await rejected;
    const retry = client.loadTelegramSdk(new AbortController().signal);
    app(); scripts[1].onload!(); await retry;
  });
  it("stops waiting when the app unmounts", async () => {
    app(""); const controller = new AbortController();
    const promise = client.waitForTelegramInitData(controller.signal);
    const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejected;
  });
});
describe("login failure classification", () => {
  it.each([[401,"INVALID_SESSION"],[400,"INVALID_SESSION"],[503,"SERVER_ERROR"],[502,"SERVER_ERROR"]])("classifies HTTP %s as %s", async (status, code) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ error: "error" }) });
    await expect(loadedAuth()).rejects.toMatchObject({ code });
  });
  it("reports network errors and succeeds on retry without downloading the SDK again", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(loadedAuth()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(await client.authenticateTelegram(new AbortController().signal)).toMatchObject({ user: { id: 42 } });
    expect(scripts).toHaveLength(1);
  });
  it("rejects a malformed successful response", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user: { id: 42 } }) });
    await expect(loadedAuth()).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });
  it("limits a hung auth request without calling it an invalid Telegram session", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, request: RequestInit) => new Promise((_resolve, reject) => request.signal!.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")))));
    const rejected = expect(loadedAuth()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    await vi.advanceTimersByTimeAsync(15000); await rejected;
  });
});
