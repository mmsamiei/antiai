"use client";
import { setClientSessionToken } from "./client-session";
import { authenticateTelegram, TelegramLoginError } from "./telegram-client";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const STORAGE_KEY = "anti-ai-code-session";
export type CodeLoginResult = { user: any; session: string; expiresAt: number };
export function rememberCodeLogin(data: CodeLoginResult) {
  setClientSessionToken(data.session);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ session: data.session, expiresAt: data.expiresAt })); } catch {}
}
export async function authenticateGame(signal: AbortSignal) {
  try {
    const data = await authenticateTelegram(signal);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return data;
  } catch (error) {
    if (signal.aborted || (error instanceof TelegramLoginError && error.code === "ACCOUNT_SUSPENDED")) throw error;
    // A signed Telegram launch always takes priority over a saved browser identity.
    const tg = (globalThis as typeof globalThis & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
    if (tg?.initData) throw error;
    let saved: { session?: string; expiresAt?: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch {}
    const headers = new Headers();
    if (saved?.session?.startsWith("otp:") && typeof saved.expiresAt === "number" && saved.expiresAt > Date.now()) headers.set("Authorization", `Bearer ${saved.session}`);
    try {
      const response = await fetch(BASE_PATH + "/api/auth/code/session", { credentials: "include", headers, signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.user?.id || !data?.session) {
        if (response.status === 401) { try { localStorage.removeItem(STORAGE_KEY); } catch {} }
        throw error;
      }
      rememberCodeLogin(data);
      return data as CodeLoginResult;
    } catch { throw error; }
  }
}
