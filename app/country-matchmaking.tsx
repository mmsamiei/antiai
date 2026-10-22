"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionRequest } from "@/lib/client-session";
import { Player, PlayerAvatar, playerName } from "./players";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Offer = { id: string; expiresAt: string; sender: Player };
export type MatchState = {
  search: null | { id: string; status: string; createdAt: string; offer: null | { id: string; status: string; expiresAt: string; recipient: Player } };
  incoming: Offer | null;
  roomId: string | null;
  serverNow: string;
};
export function useCountryMatchmaking({ userId, onError, onMatch }: { userId: string | null; onError: (message: string) => void; onMatch: (roomId: string) => void }) {
  const [state, setState] = useState<MatchState | null>(null), [busy, setBusy] = useState(false);
  const polling = useRef(false), actionBusy = useRef(false), sequence = useRef(0), applied = useRef(0);
  const latestError = useRef(onError); latestError.current = onError;
  const latestMatch = useRef(onMatch); latestMatch.current = onMatch;
  const joinedRoom = useRef<string | null>(null);
  const receive = useCallback((data: MatchState, version: number) => {
    if (version < applied.current) return;
    applied.current = version; setState(data);
    if (data.roomId && joinedRoom.current !== data.roomId) {
      joinedRoom.current = data.roomId; latestMatch.current(data.roomId);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (polling.current || actionBusy.current) return;
    polling.current = true; const version = ++sequence.current;
    try {
      const response = await fetch(base + "/api/country-matchmaking", sessionRequest());
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "وضعیت جست‌وجو دریافت نشد");
      receive(data, version);
    } finally { polling.current = false; }
  }, [receive]);
  const watchingMatch = state?.search?.status === "ACTIVE" || Boolean(state?.incoming);
  useEffect(() => {
    if (!userId) { setState(null); return; }
    let stopped = false;
    const poll = () => { if (!stopped && document.visibilityState === "visible") void refresh().catch(() => undefined); };
    poll(); const timer = window.setInterval(poll, watchingMatch ? 1_000 : 2_000); document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [userId, refresh, watchingMatch]);
  const action = useCallback(async (action: "start" | "cancel" | "accept" | "reject", offerId?: string) => {
    if (actionBusy.current) return false;
    actionBusy.current = true; setBusy(true);
    const version = ++sequence.current;
    try {
      const response = await fetch(base + "/api/country-matchmaking", sessionRequest({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(offerId ? { offerId } : {}) }) }));
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "عملیات مچینگ انجام نشد"); receive(data, version);
      return true;
    } catch (error) { latestError.current(error instanceof Error ? error.message : "عملیات مچینگ انجام نشد"); await refresh().catch(() => undefined); return false; }
    finally { actionBusy.current = false; setBusy(false); }
  }, [refresh, receive]);
  return { state, busy, action };
}

function Remaining({ expiresAt, serverNow }: { expiresAt: string; serverNow: string }) {
  const [now, setNow] = useState(Date.now()), [offset, setOffset] = useState(Date.parse(serverNow) - Date.now());
  useEffect(() => { setOffset(Date.parse(serverNow) - Date.now()); }, [serverNow]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now - offset) / 1000));
  return <small>{seconds.toLocaleString("fa-IR")} ثانیه برای پاسخ</small>;
}

type MatchAction = (action: "start" | "cancel" | "accept" | "reject", offerId?: string) => Promise<boolean>;

export function CountryMatchBanner({ state, busy, action }: { state: MatchState | null; busy: boolean; action: MatchAction }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const incoming = state?.incoming;
  if (!state || !incoming || incoming.id === dismissed) return null;
  return <div className="game-invite-backdrop country-match-dialog" onClick={() => setDismissed(incoming.id)}>
    <section className="game-invite-picker country-match-offer" role="dialog" aria-modal="true" aria-label="پیشنهاد بازی کشورجو" onClick={e => e.stopPropagation()}>
      <button className="invite-dismiss" aria-label="بستن اعلان" onClick={() => setDismissed(incoming.id)}>×</button>
      <div className="player-identity"><PlayerAvatar player={incoming.sender} online/><div><b>{playerName(incoming.sender)}</b><p>حاضری با {playerName(incoming.sender)} کشورجو بازی کنی؟</p></div></div>
      <small className="players-hint">پیشنهاد سیستم · یک کشور مشترک، حداکثر ۲۰۰ ثانیه</small>
      <Remaining expiresAt={incoming.expiresAt} serverNow={state.serverNow}/>
      <div className="invite-actions"><button className="primary" disabled={busy} onClick={() => void action("accept", incoming.id)}>{busy ? "…" : "قبول و رفتن به بازی"}</button><button className="secondary" disabled={busy} onClick={() => void action("reject", incoming.id)}>رد</button></div>
    </section>
  </div>;
}

export function CountryMatchWaiting({ state, busy, action, onBack }: { state: MatchState | null; busy: boolean; action: MatchAction; onBack: () => void }) {
  const search = state?.search;
  const pending = search?.status === "ACTIVE" && search.offer?.status === "PENDING" ? search.offer : null;
  const active = search?.status === "ACTIVE";
  return <section className="country-wait-screen">
    <div className="play-heading"><button className="icon-button" aria-label="بازگشت" onClick={onBack}>→</button><div><h1>🌍 پیدا کردن حریف</h1></div></div>
    <div className="country-wait-card">
      <div className="country-wait-orbit" aria-hidden="true"><span>🌍</span></div>
      <h2>{state?.roomId ? "حریف پیدا شد!" : pending ? "منتظر پاسخ حریف" : active || busy ? "دنبال یک هم‌بازی می‌گردیم" : "جست‌وجو پایان یافته است"}</h2>
      {pending ? <><PlayerAvatar player={pending.recipient} online/><b>{playerName(pending.recipient)}</b><Remaining expiresAt={pending.expiresAt} serverNow={state!.serverNow}/><p>اگر پاسخ ندهد، جست‌وجو با بازیکن دیگری ادامه پیدا می‌کند.</p></> : <p>{state?.roomId ? "در حال ورود به اتاق مشترک…" : active || busy ? "بازیکن‌های منتظر و آنلاین را بررسی می‌کنیم. می‌توانی در بخش‌های دیگر اپ هم بگردی؛ جست‌وجو ادامه دارد." : "برای پیدا کردن هم‌بازی، دوباره جست‌وجو را شروع کن."}</p>}
      {active ? <><button className="secondary" onClick={onBack}>ادامهٔ جست‌وجو در پس‌زمینه</button><button className="country-wait-cancel" disabled={busy} onClick={async () => { if (await action("cancel")) onBack(); }}>لغو جست‌وجو</button></> : !state?.roomId && <button className="primary" disabled={busy} onClick={() => void action("start")}>{busy ? "در حال شروع…" : "شروع دوباره"}</button>}
    </div>
  </section>;
}
