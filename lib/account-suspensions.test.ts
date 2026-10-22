import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAccountSuspended } from "./account-suspensions";
const dir = mkdtempSync(join(tmpdir(), "antiai-suspensions-"));
afterEach(() => { vi.unstubAllEnvs(); rmSync(join(dir, "accounts.json"), { force: true }); });
describe("runtime account suspension", () => {
  it("uses Telegram IDs and picks up suspension and reinstatement without restarting", () => {
    const file = join(dir, "accounts.json"); vi.stubEnv("ACCOUNT_SUSPENSIONS_FILE", file);
    expect(isAccountSuspended("123")).toBe(false);
    writeFileSync(file, JSON.stringify({ "123": { username: "old_name" } }));
    expect(isAccountSuspended("123")).toBe(true); expect(isAccountSuspended("old_name")).toBe(false); expect(isAccountSuspended("456")).toBe(false);
    writeFileSync(file, "{}"); expect(isAccountSuspended("123")).toBe(false);
  });
  it("fails closed on an unreadable or malformed suspension list", () => {
    const file = join(dir, "accounts.json"); vi.stubEnv("ACCOUNT_SUSPENSIONS_FILE", file);
    writeFileSync(file, "broken json"); expect(() => isAccountSuspended("123")).toThrow();
  });
});
