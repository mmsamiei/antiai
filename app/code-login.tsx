"use client";
import { useEffect, useState } from "react";
import { codeLoginReference } from "@/lib/code-login-reference";
import { rememberCodeLogin, type CodeLoginResult } from "@/lib/code-login-client";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const PENDING_KEY = "anti-ai-pending-code-login";
type Pending = { id: string; secret: string; expiresAt: number; botUrl: string };
async function post(path: string, body?: unknown) {
  const response = await fetch(BASE_PATH + path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "ارتباط با سرور بازی برقرار نشد؛ دوباره تلاش کن.");
  return data;
}
export default function CodeLogin({ onLogin }: { onLogin: (data: CodeLoginResult) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || localStorage.getItem(PENDING_KEY) || "null");
      if (saved?.expiresAt > Date.now() && /^[a-f0-9]{32}$/.test(saved.id) && /^[a-f0-9]{64}$/.test(saved.secret) && /^https:\/\/t\.me\/[a-zA-Z0-9_]+\?start=login_[a-f0-9]{32}$/.test(saved.botUrl)) { setPending(saved); setOpen(true); }
    } catch {}
  }, []);
  useEffect(() => { if (!pending) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [pending]);
  const expired = Boolean(pending && pending.expiresAt <= now);
  const request = async () => {
    setBusy(true); setError("");
    try {
      const data: Pending = await post("/api/auth/code/request");
      setPending(data); setCode(""); setNow(Date.now());
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(data)); localStorage.setItem(PENDING_KEY, JSON.stringify(data)); } catch {}
    } catch (cause) { setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "ارتباط با سرور بازی برقرار نشد؛ دوباره تلاش کن."); }
    finally { setBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!pending || expired) return;
    setBusy(true); setError("");
    try {
      const data: CodeLoginResult = await post("/api/auth/code/verify", { id: pending.id, secret: pending.secret, code });
      rememberCodeLogin(data);
      try { sessionStorage.removeItem(PENDING_KEY);
        if (JSON.parse(localStorage.getItem(PENDING_KEY) || "null")?.id === pending.id) localStorage.removeItem(PENDING_KEY); } catch {}
      onLogin(data);
    } catch (cause) { setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "ارتباط با سرور بازی برقرار نشد؛ دوباره تلاش کن."); }
    finally { setBusy(false); }
  };
  if (!open) return <button className="secondary" onClick={() => setOpen(true)}>ورود با کد تلگرام</button>;
  return <section className="code-login" dir="rtl" aria-label="ورود با کد تلگرام">
    <strong>ورود با کد تلگرام</strong>
    <p>از بات کد بگیر، سپس به همین صفحه برگرد و کد را وارد کن. روی همین دستگاه ۱۲ ساعت وارد می‌مانی.</p>
    {!pending ? <button className="primary" disabled={busy} onClick={request}>{busy ? "در حال ساخت درخواست…" : "دریافت کد از بات"}</button> : <>
      {expired ? <p role="status">مهلت این درخواست تمام شده؛ درخواست تازه بساز.</p> : <>
        <p>شناسهٔ درخواست: <bdi className="code-login-reference">{codeLoginReference(pending.id)}</bdi></p>
        <a className="primary code-login-link" href={pending.botUrl} target="_blank" rel="noopener noreferrer">باز کردن بات و دریافت کد</a>
        <p>در تلگرام اگر Start / شروع دیدی، آن را بزن. شناسهٔ پیام بات را با شناسهٔ بالا مقایسه کن؛ اگر یکسان بود، دکمهٔ «درخواست ورود مال من است؛ دریافت کد» زیر همان پیام را بزن. این جمله را تایپ نکن.</p>
        <form onSubmit={submit}>
          <label htmlFor="code-login-input">کد شش‌رقمی ورود</label>
          <input id="code-login-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={event => setCode(event.target.value.replace(/[۰-۹]/g, c => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, ""))} placeholder="۱۲۳۴۵۶" />
          <button className="primary" disabled={busy || code.length !== 6}>{busy ? "در حال بررسی…" : "ورود به بازی"}</button>
        </form>
      </>}
      <button className="secondary" disabled={busy} onClick={request}>ساخت درخواست تازه</button>
    </>}
    {error && <p role="alert">{error}</p>}
    <small>کد حداکثر ۲ دقیقه اعتبار دارد. برای کد مجدد، پس از یک دقیقه همان دکمهٔ تأیید را در بات بزن. کد را فقط در همین صفحه وارد کن و برای کسی نفرست. برای این روش هم ارتباط با سرور بازی باید برقرار باشد.</small>
  </section>;
}
