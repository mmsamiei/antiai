"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchGameConfig, type MatchGameType } from "@/lib/match-game-config";
import type { InviteGame } from "./players";
import { sessionRequest } from "@/lib/client-session";
import { Player, PlayerAvatar, playerName } from "./players";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Offer = { gameType: MatchGameType; id: string; expiresAt: string; sender: Player };
export type MatchState = {
  search: null | { gameType: MatchGameType; id: string; status: string; createdAt: string; offer: null | { id: string; status: string; expiresAt: string; recipient: Player } };
  incoming: Offer | null;
  roomId: string | null;
  roomGameKind: InviteGame | null;
  serverNow: string;
};
export function useCountryMatchmaking({ userId, onError, onMatch }: { userId: string | null; onError: (message: string) => void; onMatch: (roomId: string, gameKind: InviteGame) => void }) {
  const [state, setState] = useState<MatchState | null>(null), [busy, setBusy] = useState(false);
  const polling = useRef(false), actionBusy = useRef(false), sequence = useRef(0), applied = useRef(0);
  const latestError = useRef(onError); latestError.current = onError;
  const latestMatch = useRef(onMatch); latestMatch.current = onMatch;
  const joinedRoom = useRef<string | null>(null);
  const receive = useCallback((data: MatchState, version: number) => {
    if (version < applied.current) return;
    applied.current = version; setState(data);
    if (data.roomId && joinedRoom.current !== data.roomId) {
      joinedRoom.current = data.roomId; latestMatch.current(data.roomId, data.roomGameKind || "COUNTRY_RACE");
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
  const action = useCallback(async (action: "start" | "cancel" | "accept" | "reject", offerId?: string, gameType?: MatchGameType) => {
    if (actionBusy.current) return false;
    actionBusy.current = true; setBusy(true);
    const version = ++sequence.current;
    try {
      const response = await fetch(base + "/api/country-matchmaking", sessionRequest({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(gameType ? { gameType } : {}), ...(offerId ? { offerId } : {}) }) }));
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
  if (!state) return null;
  const search = state.search?.status === "ACTIVE" ? state.search : null;
  const name = matchGameConfig[search?.gameType || "COUNTRY"].name;
  const incomingName = matchGameConfig[incoming?.gameType || "COUNTRY"].name;
  const incomingConfig = matchGameConfig[incoming?.gameType || "COUNTRY"];
  const pending = search?.offer?.status === "PENDING" ? search.offer : null;
  return <>
    {search && <aside className="outgoing-invitation" aria-live="polite">
      <span>{pending ? <>پیشنهاد {name} برای {playerName(pending.recipient)} فرستاده شد؛ در انتظار پاسخ<Remaining expiresAt={pending.expiresAt} serverNow={state.serverNow}/></> : <>در حال پیدا کردن حریف {name}…<small>بازیکن‌های منتظر و آنلاین را بررسی می‌کنیم.</small></>}</span>
      <button className="secondary" disabled={busy} onClick={() => void action("cancel")}>لغو جست‌وجو</button>
    </aside>}
    {incoming && incoming.id !== dismissed && <div className="game-invite-backdrop country-match-dialog" onClick={() => setDismissed(incoming.id)}>
    <section className="game-invite-picker country-match-offer" role="dialog" aria-modal="true" aria-label={`پیشنهاد بازی ${incomingName}`} onClick={e => e.stopPropagation()}>
      <button className="invite-dismiss" aria-label="بستن اعلان" onClick={() => setDismissed(incoming.id)}>×</button>
      <div className="player-identity"><PlayerAvatar player={incoming.sender} online/><div><b>{playerName(incoming.sender)}</b><p>حاضری با {playerName(incoming.sender)} {incomingName} بازی کنی؟</p></div></div>
      <small className="players-hint">پیشنهاد سیستم · {incomingConfig.description}</small>
      <Remaining expiresAt={incoming.expiresAt} serverNow={state.serverNow}/>
      <div className="invite-actions"><button className="primary" disabled={busy} onClick={() => void action("accept", incoming.id)}>{busy ? "…" : "قبول و رفتن به بازی"}</button><button className="secondary" disabled={busy} onClick={() => void action("reject", incoming.id)}>رد</button></div>
    </section>
  </div>}
  </>;
}
