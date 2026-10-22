"use client";
import { useCallback, useEffect, useState } from "react";
import { geoRaceConfig, type GeoRaceType } from "@/lib/geo-race-config";
import { sessionRequest } from "@/lib/client-session";

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Guess = { id: string; name: string; emoji?: string; detail?: string; provinceName?: string; rank: number; createdAt: string };
type State = {
  challenge: { id: string; startsAt: string; endsAt: string; serverNow: string; ended: boolean; target: { id: string; name: string; emoji?: string; provinceName?: string; description?: string } | null };
  entry: { id: string; status: "ACTIVE" | "WON" | "SURRENDERED" | "EXPIRED"; guessCount: number; bestRank: number | null; guesses: Guess[]; target: { name: string; emoji?: string; provinceName?: string; description?: string } | null } | null;
  totalItems: number;
};
async function request(url: string, body?: unknown) {
  const response = await fetch(base + url, sessionRequest(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ارتباط با چالش برقرار نشد");
  return data as State;
}
export default function CountryChallenge({ gameType = "COUNTRY", onBack, onLeaderboard, setError }: { gameType?: GeoRaceType; onBack: () => void; onLeaderboard: () => void; setError: (message: string) => void }) {
  const config = geoRaceConfig[gameType], name = gameType === "COUNTRY" ? "کشورجو" : "شهرجو";
  const url = "/api/country-challenge?type=" + gameType;
  const [state, setState] = useState<State | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [serverOffset, setServerOffset] = useState(0);
  const [query, setQuery] = useState(""), [items, setItems] = useState<Guess[]>([]), [selected, setSelected] = useState<Guess | null>(null), [now, setNow] = useState(Date.now());
  const acceptState = useCallback((value: State) => { setServerOffset(Date.parse(value.challenge.serverNow) - Date.now()); setState(value); }, []);
  useEffect(() => {
    let stopped = false, polling = false, opened = false;
    const poll = async () => { if (polling || document.visibilityState !== "visible") return; polling = true; try { let data = await request(url, opened ? undefined : { action: "start" }); opened = true; if (!stopped && !data.entry && !data.challenge.ended) data = await request(url, { action: "start" }); if (!stopped) acceptState(data); } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "چالش بارگذاری نشد"); } finally { polling = false; if (!stopped) setLoading(false); } };
    void poll(); const timer = setInterval(poll, 10_000); document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [setError, acceptState, url]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (selected || query.trim().length < 1) { setItems([]); return; }
      try { const response = await fetch(base + "/api/search?type=" + gameType + "&q=" + encodeURIComponent(query), sessionRequest({ signal: controller.signal })); const data = await response.json(); if (response.ok && !controller.signal.aborted) setItems(data.items || []); }
      catch { if (!controller.signal.aborted) setItems([]); }
    }, 140);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, selected, gameType]);
  const act = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try { acceptState(await request(url, payload)); setQuery(""); setSelected(null); setItems([]); }
    catch (e) { setError(e instanceof Error ? e.message : "عملیات انجام نشد"); }
    finally { setBusy(false); }
  };
  const seconds = state ? Math.max(0, Math.ceil((Date.parse(state.challenge.endsAt) - now - serverOffset) / 1000)) : 0;
  const active = Boolean(state?.entry && state.entry.status === "ACTIVE" && !state.challenge.ended);
  const surrender = () => {
    if (window.confirm("با تسلیم، پاسخ برایت آشکار می‌شود و دیگر نمی‌توانی در این چالش حدس بزنی. ادامه می‌دهی؟")) void act({ action: "surrender" });
  };
  return <section className="play-screen">
    <div className="play-heading">
      <button className="icon-button" onClick={onBack} aria-label="بازگشت">→</button>
      <div><h1><span aria-hidden="true">{gameType === "COUNTRY" ? "🌍" : "📍"}</span> {name}</h1></div>
      <div className="play-actions"><span className="guess-count">{(state?.entry?.guessCount || 0).toLocaleString("fa-IR")} حدس</span></div>
    </div>
    {state && <div className="country-daily-deadline">
      <button onClick={onLeaderboard} title="جدول رتبه‌بندی چالش">چالش روزانه <span>←</span></button>
      <div><small>تا چالش بعدی</small><strong dir="ltr">{[Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => value.toLocaleString("fa-IR", { minimumIntegerDigits: 2 })).join(":")}</strong></div>
    </div>}
    {loading && !state && <div className="empty-state">در حال بارگذاری چالش…</div>}
    {active && <div className="search-box">
      <div className="search-row">
        <input aria-label={`جست‌وجوی ${config.noun}`} placeholder={config.hint} autoComplete="off" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && selected && !busy) { e.preventDefault(); void act({ action: "guess", itemId: selected.id }); } }} />
        <button disabled={!selected || busy} onClick={() => selected && void act({ action: "guess", itemId: selected.id })}>{busy ? "…" : "حدس"}</button>
      </div>
      {items.length > 0 && <div className="suggestions">{items.map(item => <button key={item.id} onClick={() => { setSelected(item); setQuery(item.name); setItems([]); }}><span>{item.emoji} {item.name}</span>{(item.provinceName || item.detail) && <small>{item.provinceName || item.detail}</small>}</button>)}</div>}
    </div>}
    {state?.entry && !active && <div className={`finish-card ${state.entry.status === "WON" ? "won" : "gave-up"}`}>
      <span className="finish-icon">{state.entry.status === "WON" ? "🎯" : "🏳️"}</span>
      <h2>{state.entry.status === "WON" ? "پیداش کردی!" : state.entry.status === "EXPIRED" ? "زمان چالش تمام شد" : "پاسخ این بود:"}</h2>
      {state.entry.target && <><strong>{state.entry.target.emoji} {state.entry.target.name}{state.entry.target.provinceName && <small> — {state.entry.target.provinceName}</small>}</strong>{state.entry.target.description && <p className="country-description">{state.entry.target.description}</p>}</>}
      <p>{state.entry.status === "WON" ? `با ${state.entry.guessCount.toLocaleString("fa-IR")} حدس به جواب رسیدی.` : "نتیجهٔ تو ثبت شد؛ چالش بعدی با یک پاسخ تازه شروع می‌شود."}</p>
      <div className="finish-actions"><button className="secondary" onClick={onLeaderboard}>جدول چالش‌ها</button></div>
    </div>}
    {state?.entry && <>
      <div className="guess-head"><b>حدس‌ها</b>{active && <button onClick={surrender} disabled={busy}>تسلیم می‌شوم</button>}</div>
      {!state.entry.guesses.length ? <div className="empty-state"><span>⌁</span><p>اولین حدس را بزن.</p></div> : <div className="guess-list">
        {[...state.entry.guesses].sort((a, b) => a.rank - b.rank).map(guess => <div className={`guess-row ${rankColor(guess.rank, state.totalItems)}`} key={guess.id}>
          <div className="guess-name"><span>{guess.emoji}</span><b>{guess.name}{guess.provinceName ? `، ${guess.provinceName}` : ""}</b></div>
          <div className="rank-copy"><small>رتبه</small><strong>{guess.rank === 0 ? "✓" : guess.rank.toLocaleString("fa-IR")}</strong><span>{guess.rank === 0 ? "پاسخ درست" : `از ${state.totalItems.toLocaleString("fa-IR")}`}</span></div>
          <div className="rank-bar"><i style={{ width: `${guess.rank === 0 ? 100 : Math.max(4, 100 - ((guess.rank - 2) / Math.max(1, state.totalItems - 2)) * 100)}%` }} /></div>
        </div>)}
      </div>}
    </>}
  </section>;
}

function rankColor(rank: number, total: number) {
  if (rank === 0) return "perfect";
  if (rank / total <= .05) return "hot";
  if (rank / total <= .2) return "warm";
  if (rank / total <= .5) return "mild";
  return "cold";
}
