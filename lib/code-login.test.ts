import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tx: vi.fn(), find: vi.fn(), create: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn(), user: vi.fn(), raw: vi.fn(), suspended: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { $transaction: mocks.tx } }));
vi.mock("./account-suspensions", () => ({ isAccountSuspended: mocks.suspended }));
import { createCodeLoginRequest, issueLoginCode, verifyLoginCode, normalizeLoginCode, CODE_LIFETIME_MS, MAX_CODE_ATTEMPTS } from "./code-login";
const db = { $queryRaw: mocks.raw, codeLoginRequest: { findUnique: mocks.find, create: mocks.create, count: mocks.count, update: mocks.update, deleteMany: mocks.delete }, user: { upsert: mocks.upsert, findUniqueOrThrow: mocks.user } };
let row: any;
let pending: { id: string; secret: string; expiresAt: number };
beforeEach(async () => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z")); vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-secret");
  mocks.suspended.mockReturnValue(false); mocks.count.mockResolvedValue(0); mocks.raw.mockResolvedValue([]);
  mocks.tx.mockImplementation(async fn => fn(db));
  mocks.create.mockImplementation(async ({ data }) => { row = { ...data, attempts: 0 }; return row; });
  mocks.find.mockImplementation(async () => row);
  mocks.update.mockImplementation(async ({ data }) => { row = { ...row, ...data, attempts: typeof data.attempts === "object" ? row.attempts + data.attempts.increment : row.attempts }; return row; });
  mocks.user.mockResolvedValue({ id: "42", firstName: "آزمایش", lastName: null, username: "test", photoUrl: null });
  pending = await createCodeLoginRequest("127.0.0.1");
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const sender = { id: 42, first_name: "آزمایش" };
describe("browser-bound Telegram code login", () => {
  it("stores only hashes and consumes the code exactly once", async () => {
    const issued = await issueLoginCode(pending.id, sender);
    expect(issued.code).toMatch(/^\d{6}$/); expect(row.browserHash).not.toBe(pending.secret); expect(row.codeHash).not.toBe(issued.code);
    const result = await verifyLoginCode(pending.id, pending.secret, issued.code);
    expect(result.user.id).toBe("42"); expect(result.expiresAt).toBe(Date.now() + 12 * 3600_000);
    expect(row.codeHash).toBeNull();
    await expect(verifyLoginCode(pending.id, pending.secret, issued.code)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects a different browser without exhausting the owner's code attempts", async () => {
    const issued = await issueLoginCode(pending.id, sender);
    await expect(verifyLoginCode(pending.id, "0".repeat(64), issued.code)).rejects.toMatchObject({ status: 400 });
    expect(row.attempts).toBe(0);
    expect((await verifyLoginCode(pending.id, pending.secret, issued.code)).user.id).toBe("42");
  });
  it("persists five failed guesses and rejects the correct code afterward", async () => {
    const issued = await issueLoginCode(pending.id, sender);
    const wrong = issued.code === "000000" ? "000001" : "000000";
    for (let n = 0; n < MAX_CODE_ATTEMPTS; n++) await expect(verifyLoginCode(pending.id, pending.secret, wrong)).rejects.toMatchObject({ status: 400 });
    expect(row.attempts).toBe(5);
    await expect(verifyLoginCode(pending.id, pending.secret, issued.code)).rejects.toMatchObject({ status: 400 });
    vi.advanceTimersByTime(60_000);
    await expect(issueLoginCode(pending.id, sender)).rejects.toMatchObject({ status: 429 });
  });
  it("expires the code at two minutes and the request after ten minutes", async () => {
    const issued = await issueLoginCode(pending.id, sender);
    vi.advanceTimersByTime(CODE_LIFETIME_MS);
    await expect(verifyLoginCode(pending.id, pending.secret, issued.code)).rejects.toMatchObject({ status: 400 });
    vi.setSystemTime(pending.expiresAt);
    await expect(issueLoginCode(pending.id, sender)).rejects.toMatchObject({ status: 400 });
  });
  it("binds the request to the first Telegram account and throttles resends", async () => {
    await issueLoginCode(pending.id, sender);
    await expect(issueLoginCode(pending.id, { id: 43 })).rejects.toMatchObject({ status: 400 });
    await expect(issueLoginCode(pending.id, sender)).rejects.toMatchObject({ status: 429 });
  });
  it("invalidates the old code when a new code is issued", async () => {
    vi.spyOn(crypto, "randomInt").mockReturnValueOnce(123456 as never).mockReturnValueOnce(654321 as never);
    const first = await issueLoginCode(pending.id, sender);
    vi.advanceTimersByTime(60_000);
    const second = await issueLoginCode(pending.id, sender);
    await expect(verifyLoginCode(pending.id, pending.secret, first.code)).rejects.toMatchObject({ status: 400 });
    expect((await verifyLoginCode(pending.id, pending.secret, second.code)).user.id).toBe("42");
  });
  it("rejects a suspended account at both issuance and verification", async () => {
    mocks.suspended.mockReturnValue(true);
    await expect(issueLoginCode(pending.id, sender)).rejects.toMatchObject({ status: 403 });
    mocks.suspended.mockReturnValue(false); const issued = await issueLoginCode(pending.id, sender);
    mocks.suspended.mockReturnValue(true);
    await expect(verifyLoginCode(pending.id, pending.secret, issued.code)).rejects.toMatchObject({ status: 400 });
  });
  it("limits creation per address and issuance across requests", async () => {
    mocks.count.mockResolvedValue(30);
    await expect(createCodeLoginRequest("127.0.0.1")).rejects.toMatchObject({ status: 429 });
    mocks.count.mockResolvedValue(1);
    await expect(issueLoginCode(pending.id, sender)).rejects.toMatchObject({ status: 429 });
  });
  it("accepts Persian and Arabic code digits", () => { expect(normalizeLoginCode(" ۱۲٣۴۵۶ ")).toBe("123456"); });
});
