import crypto from "crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400): TelegramUser {
  if (!botToken) throw new Error("Telegram bot token is missing");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!hash || !authDate || age < 0 || age > maxAgeSeconds) throw new Error("Invalid Telegram session");
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const actualBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Invalid Telegram signature");
  }
  const rawUser = params.get("user");
  if (!rawUser) throw new Error("Telegram user missing");
  return JSON.parse(rawUser) as TelegramUser;
}
