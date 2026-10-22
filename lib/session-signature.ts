import crypto from "crypto";
export function sessionUserId(value: string | undefined, key: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const userId = value.slice(0, separator);
  const actual = Buffer.from(value.slice(separator + 1), "hex");
  const expected = crypto.createHmac("sha256", key).update(userId).digest();
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected) ? userId : null;
}
