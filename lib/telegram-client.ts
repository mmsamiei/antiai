import { sessionRequest } from "./client-session";

// Unmodified official https://telegram.org/js/telegram-web-app.js.
// SHA-256: 124bdff7ba3fe86c8ba5143467afec21e020405e74abdb92cfdda6c0ee3b5908.
export const TELEGRAM_SDK_PATH = "/vendor/telegram-web-app.124bdff7ba3f.js";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export type TelegramLoginErrorCode = "ACCOUNT_SUSPENDED" | "SDK_LOAD_FAILED" | "MISSING_LAUNCH_DATA" | "INVALID_SESSION" | "NETWORK_ERROR" | "SERVER_ERROR";
const messages: Record<TelegramLoginErrorCode, string> = {
  ACCOUNT_SUSPENDED: "دسترسی این حساب موقتاً تعلیق شده است.",
  SDK_LOAD_FAILED: "فایل موردنیاز بازی دریافت نشد. اتصال اینترنتت را بررسی کن و دوباره تلاش کن.",
  MISSING_LAUNCH_DATA: "اطلاعات ورود تلگرام دریافت نشد. بازی را ببند و از دکمهٔ بازی داخل تلگرام دوباره باز کن.",
  INVALID_SESSION: "اطلاعات ورود تلگرام معتبر نیست یا مهلت آن گذشته است. بازی را ببند و از داخل تلگرام دوباره باز کن.",
  NETWORK_ERROR: "ارتباط با سرور بازی برقرار نشد. اتصال اینترنتت را بررسی کن و دوباره تلاش کن.",
  SERVER_ERROR: "سرور بازی موقتاً نتوانست ورود را انجام دهد. کمی بعد دوباره تلاش کن.",
};
export class TelegramLoginError extends Error {
  constructor(public code: TelegramLoginErrorCode) { super(messages[code]); }
}
type TelegramApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
};
function telegramApp() {
  return (globalThis as typeof globalThis & { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;
}
function abortError() { return new DOMException("Aborted", "AbortError"); }
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
let sdkLoading: Promise<void> | null = null;
export function loadTelegramSdk(signal: AbortSignal): Promise<void> {
  if (!sdkLoading) {
    sdkLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = BASE_PATH + TELEGRAM_SDK_PATH;
      script.async = true;
      const finish = (failed: boolean) => {
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        if (failed || !telegramApp()) {
          script.remove();
          reject(new TelegramLoginError("SDK_LOAD_FAILED"));
        } else resolve();
      };
      const timer = setTimeout(() => finish(true), 10_000);
      script.onload = () => finish(false);
      script.onerror = () => finish(true);
      document.head.appendChild(script);
    }).catch(error => { sdkLoading = null; throw error; });
  }
  // React effect cleanup must not cancel a script shared with the next mount.
  return withAbort(sdkLoading, signal);
}
export function waitForTelegramInitData(signal: AbortSignal, timeoutMs = 3_000): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + timeoutMs;
    const finish = (value: string | null, aborted = false) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (aborted) reject(abortError()); else resolve(value);
    };
    const abort = () => finish(null, true);
    const check = () => {
      if (signal.aborted) { abort(); return; }
      const data = telegramApp()?.initData;
      if (typeof data === "string" && data.length) { finish(data); return; }
      if (Date.now() >= deadline) { finish(null); return; }
      timer = setTimeout(check, 100);
    };
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}
export async function authenticateTelegram(signal: AbortSignal): Promise<{ user: any; session: string }> {
  await loadTelegramSdk(signal);
  const tg = telegramApp();
  tg?.ready?.();
  tg?.expand?.();
  tg?.setHeaderColor?.("#080b17");
  tg?.setBackgroundColor?.("#080b17");
  const initData = await waitForTelegramInitData(signal);
  if (!initData && process.env.NODE_ENV === "production") throw new TelegramLoginError("MISSING_LAUNCH_DATA");

  const request = new AbortController();
  const abort = () => request.abort();
  if (signal.aborted) throw abortError();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await fetch(BASE_PATH + (initData ? "/api/auth/telegram" : "/api/auth/demo"), sessionRequest({
      method: "POST", signal: request.signal,
      headers: { "Content-Type": "application/json" },
      ...(initData ? { body: JSON.stringify({ initData }) } : {}),
    }));
    const data = await response.json().catch(() => null);
    if (!response.ok && data?.code === "ACCOUNT_SUSPENDED") throw new TelegramLoginError("ACCOUNT_SUSPENDED");
    if (!response.ok) throw new TelegramLoginError(response.status === 401 || response.status === 400 ? "INVALID_SESSION" : "SERVER_ERROR");
    if (!data?.user?.id || typeof data.session !== "string" || !data.session) throw new TelegramLoginError("SERVER_ERROR");
    return data;
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (error instanceof TelegramLoginError) throw error;
    throw new TelegramLoginError("NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
