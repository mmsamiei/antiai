import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isAccountSuspended } from "./account-suspensions";
import { createCodeSession } from "./session-signature";

export const CODE_LIFETIME_MS = 2 * 60 * 1000;
export const REQUEST_LIFETIME_MS = 10 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const REQUEST_ID = /^[a-f0-9]{32}$/;
export const BROWSER_SECRET = /^[a-f0-9]{64}$/;
export class CodeLoginError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function key() {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error("Login signing key missing");
  return value;
}
function hash(value: string) { return crypto.createHmac("sha256", key()).update(value).digest("hex"); }
function matches(a: string, b: string) {
  const left = Buffer.from(a, "hex"), right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
export function normalizeLoginCode(code: string) {
  return code.replace(/[۰-۹]/g, c => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).trim();
}
async function lockRequest(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CodeLoginRequest" WHERE "id" = ${id} FOR UPDATE`);
  return tx.codeLoginRequest.findUnique({ where: { id } });
}
export async function createCodeLoginRequest(address: string) {
  const now = new Date();
  const id = crypto.randomBytes(16).toString("hex"), secret = crypto.randomBytes(32).toString("hex");
  const addressHash = hash(`address:${address}`);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`code-login:${addressHash}`}))::text`);
    const count = await tx.codeLoginRequest.count({ where: { addressHash, createdAt: { gt: new Date(now.getTime() - REQUEST_LIFETIME_MS) } } });
    if (count >= 30) throw new CodeLoginError(429, "درخواست‌های ورود زیاد شده؛ چند دقیقه بعد دوباره تلاش کن.");
    await tx.codeLoginRequest.create({ data: { id, browserHash: hash(`browser:${secret}`), addressHash, expiresAt: new Date(now.getTime() + REQUEST_LIFETIME_MS) } });
    // Expired codes and browser hashes are not needed for history or analytics.
    await tx.codeLoginRequest.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
  });
  return { id, secret, expiresAt: now.getTime() + REQUEST_LIFETIME_MS };
}
export async function codeLoginRequestAvailable(id: string) {
  if (!REQUEST_ID.test(id)) return false;
  const row = await prisma.codeLoginRequest.findUnique({ where: { id } });
  return Boolean(row && row.expiresAt > new Date() && !row.consumedAt);
}
export type LoginSender = { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
export async function issueLoginCode(id: string, sender: LoginSender) {
  if (!REQUEST_ID.test(id) || !Number.isSafeInteger(sender.id) || sender.id <= 0 || sender.is_bot) throw new CodeLoginError(400, "درخواست ورود معتبر نیست.");
  const userId = String(sender.id);
  if (isAccountSuspended(userId)) throw new CodeLoginError(403, "دسترسی این حساب موقتاً تعلیق شده است.");
  return prisma.$transaction(async tx => {
    // Serialize issuance per Telegram account, including requests on other devices.
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`code-login-user:${userId}`}))::text`);
    const row = await lockRequest(tx, id);
    const now = new Date();
    if (!row || row.expiresAt <= now || row.consumedAt || (row.userId && row.userId !== userId)) throw new CodeLoginError(400, "این درخواست معتبر نیست یا منقضی شده؛ از صفحهٔ ورود درخواست تازه بساز.");
    if (row.attempts >= MAX_CODE_ATTEMPTS) throw new CodeLoginError(429, "تعداد تلاش‌های این درخواست تمام شده؛ از صفحهٔ ورود درخواست تازه بساز.");
    if (row.issuedAt && now.getTime() - row.issuedAt.getTime() < 60_000) throw new CodeLoginError(429, "برای دریافت دوبارهٔ کد، یک دقیقه صبر کن.");
    const recent = await tx.codeLoginRequest.count({ where: { userId, issuedAt: { gt: new Date(now.getTime() - 60_000) } } });
    if (recent) throw new CodeLoginError(429, "برای دریافت دوبارهٔ کد، یک دقیقه صبر کن.");
    const issued = await tx.codeLoginRequest.count({ where: { userId, issuedAt: { gt: new Date(now.getTime() - 10 * 60_000) } } });
    if (issued >= 5) throw new CodeLoginError(429, "درخواست کد زیاد شده؛ چند دقیقه بعد دوباره تلاش کن.");
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = hash(`code:${id}:${code}`);
    await tx.user.upsert({ where: { id: userId }, create: { id: userId, firstName: sender.first_name, lastName: sender.last_name, username: sender.username }, update: { firstName: sender.first_name, lastName: sender.last_name, username: sender.username } });
    await tx.codeLoginRequest.update({ where: { id }, data: { userId, codeHash, issuedAt: now, codeExpiresAt: new Date(Math.min(now.getTime() + CODE_LIFETIME_MS, row.expiresAt.getTime())) } });
    return { code, codeHash };
  });
}
export async function invalidateUndeliveredCode(id: string, codeHash: string) {
  await prisma.codeLoginRequest.updateMany({ where: { id, codeHash, consumedAt: null }, data: { codeHash: null, codeExpiresAt: null } });
}
export async function verifyLoginCode(id: string, secret: string, code: string) {
  const result = await prisma.$transaction(async tx => {
    const row = await lockRequest(tx, id);
    const now = new Date();
    if (!row || !matches(row.browserHash, hash(`browser:${secret}`))) return null;
    if (row.consumedAt || row.expiresAt <= now || !row.codeHash || !row.codeExpiresAt || row.codeExpiresAt <= now || !row.userId || row.attempts >= MAX_CODE_ATTEMPTS) return null;
    if (isAccountSuspended(row.userId)) return null;
    if (!matches(row.codeHash, hash(`code:${id}:${code}`))) {
      // Return rather than throw so a failed attempt is committed.
      await tx.codeLoginRequest.update({ where: { id }, data: { attempts: { increment: 1 } } });
      return null;
    }
    await tx.codeLoginRequest.update({ where: { id }, data: { consumedAt: now, codeHash: null } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId }, select: { id: true, firstName: true, lastName: true, username: true, photoUrl: true } });
    return { user: loginUser(user), ...createCodeSession(user.id, key()) };
  });
  if (!result) throw new CodeLoginError(400, "کد معتبر نیست، منقضی شده یا تعداد تلاش‌ها تمام شده است. کد را در همان صفحه‌ای وارد کن که درخواستش را ساختی.");
  return result;
}
export function loginUser(user: { id: string; firstName: string | null; lastName: string | null; username: string | null; photoUrl: string | null }) {
  return { id: user.id, first_name: user.firstName, last_name: user.lastName, username: user.username, photo_url: user.photoUrl };
}
