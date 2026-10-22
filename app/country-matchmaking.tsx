"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionRequest } from "@/lib/client-session";
import { Player, PlayerAvatar, playerName } from "./players";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Offer = { id: string; expiresAt: string; sender: Player };
export type MatchState = {
  search: null | { id: string; status: string; createdAt: string; offer: null | { id: string; status: string; expiresAt: string; recipient: Player } };
  incoming: Offer | null;
  serverNow: string;
};
export function useCountryMatchmaking({ userId, onError }: { userId: string | null; onError: (message: string) => void }) {
  const [state, setState] = useState<MatchState | null>(null), [busy, setBusy] = useState(false);
  const polling = useRef(false), actionBusy = useRef(false), sequence = useRef(0), applied = useRef(0);
  const latestError = useRef(onError); latestError.current = onError;
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true; const version = ++sequence.current;
    try {
      const response = await fetch(base + "/api/country-matchmaking", sessionRequest());
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "وضعیت جست‌وجو دریافت نشد");
      if (version >= applied.current) { applied.current = version; setState(data); }
    } finally { polling.current = false; }
  }, []);
  useEffect(() => {
    if (!userId) { setState(null); return; }
    let stopped = false;
    const poll = () => { if (!stopped && document.visibilityState === "visible") void refresh().catch(() => undefined); };
    poll(); const timer = window.setInterval(poll, 2_000); document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [userId, refresh]);
  const action = useCallback(async (action: "start" | "cancel" | "accept" | "reject", offerId?: string) => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusy(true);
    try {
      const response = await fetch(base + "/api/country-matchmaking", sessionRequest({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(offerId ? { offerId } : {}) }) }));
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "عملیات مچینگ انجام نشد"); setState(data);
    } catch (error) { latestError.current(error instanceof Error ? error.message : "عملیات مچینگ انجام نشد"); await refresh().catch(() => undefined); }
    finally { actionBusy.current = false; setBusy(false); }
  }, [refresh]);
  return { state, busy, action };
}

function Remaining({ expiresAt, serverNow }: { expiresAt: string; serverNow: string }) {
  const [now, setNow] = useState(Date.now()), [offset, setOffset] = useState(Date.parse(serverNow) - Date.now());
  useEffect(() => { setOffset(Date.parse(serverNow) - Date.now()); }, [serverNow]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now + offset) / 1000));
  return <small>{seconds.toLocaleString("fa-IR")} ثانیه برای پاسخ</small>;
}

export function CountryMatchBanner({ state, busy, action }: { state: MatchState | null; busy: boolean; action: (action: "start" | "cancel" | "accept" | "reject", offerId?: string) => Promise<void> }) {
  if (!state) return null;
  const incoming = state.incoming;
  const search = state.search?.status === "ACTIVE" ? state.search : null;
  return <>
    {incoming && <aside className="country-match-banner" aria-live="polite"><PlayerAvatar player={incoming.sender} online/><div className="country-match-copy"><b>سیستم پیشنهاد می‌دهد با {playerName(incoming.sender)} کشورجو بازی کنی.</b><Remaining expiresAt={incoming.expiresAt} serverNow={state.serverNow}/></div><button className="primary" disabled={busy} onClick={() => void action("accept", incoming.id)}>قبول</button><button className="secondary" disabled={busy} onClick={() => void action("reject", incoming.id)}>رد</button></aside>}
    {search && <aside className="country-match-search" aria-live="polite"><span className="country-match-pulse"/><span>{search.offer?.status === "PENDING" ? <>پیشنهاد برای {playerName(search.offer.recipient)} فرستاده شد؛ <Remaining expiresAt={search.offer.expiresAt} serverNow={state.serverNow}/></> : "در حال پیدا کردن حریف کشورجو…"}</span><button className="secondary" disabled={busy} onClick={() => void action("cancel")}>لغو جست‌وجو</button></aside>}
    {state.search?.status === "MATCHED" && <aside className="country-match-search" aria-live="polite">حریف پیدا شد؛ در حال ورود به اتاق…</aside>}
  </>;
}
