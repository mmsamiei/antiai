import { readFileSync } from "fs";
import { join } from "path";

/** Server-owned runtime list: suspension follows Telegram ID, never username. */
export function isAccountSuspended(userId: string): boolean {
  const file = process.env.ACCOUNT_SUSPENSIONS_FILE || join(process.cwd(), ".runtime", "suspended-users.json");
  try {
    const entries = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(entries, userId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
