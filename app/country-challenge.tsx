"use client";
import { useCallback, useEffect, useState } from "react";
import { sessionRequest } from "@/lib/client-session";

const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Guess = { id: string; name: string; emoji?: string; detail?: string; rank: number; createdAt: string };
type State = {
  challenge: { id: string; startsAt: string; endsAt: string; serverNow: string; ended: boolean; target: { id: string; name: string; emoji?: string; description?: string } | null };
  entry: { id: string; status: "ACTIVE" | "WON" | "SURRENDERED" | "EXPIRED"; guessCount: number; bestRank: number | null; guesses: Guess[]; target: { name: string; emoji?: string; description?: string } | null } | null;
  totalItems: number;
};
async function request(url: string, body?: unknown) {
  const response = await fetch(base + url, sessionRequest(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ارتباط با چالش برقرار نشد");
  return data as State;
}
export default function CountryChallenge({ onBack, onLeaderboard, setError }: { onBack: () => void; onLeaderboard: () => void; setError: (message: string) => void }) {
  const [state, setState] = useState<State | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [serverOffset, setServerOffset] = useState(0);
  const [query, setQuery] = useState(""), [items, setItems] = useState<Guess[]>([]), [selected, setSelected] = useState<Guess | null>(null), [now, setNow] = useState(Date.now());
  const acceptState = useCallback((value: State) => { setServerOffset(Date.parse(value.challenge.serverNow) - Date.now()); setState(value); }, []);
  useEffect(() => {
    let stopped = false, polling = false, opened = false;
    const poll = async () => { if (polling || document.visibilityState !== "visible") return; polling = true; try { let data = await request("/api/country-challenge", opened ? undefined : { action: "start" }); opened = true; if (!stopped && !data.entry && !data.challenge.ended) data = await request("/api/country-challenge", { action: "start" }); if (!stopped) acceptState(data); } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "چالش بارگذاری نشد"); } finally { polling = false; if (!stopped) setLoading(false); } };
    void poll(); const timer = setInterval(poll, 10_000); document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [setError, acceptState]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (selected || query.trim().length < 1) { setItems([]); return; }
      try { const response = await fetch(base + "/api/search?type=COUNTRY&q=" + encodeURIComponent(query), sessionRequest({ signal: controller.signal })); const data = await response.json(); if (response.ok && !controller.signal.aborted) setItems(data.items || []); }
      catch { if (!controller.signal.aborted) setItems([]); }
    }, 140);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, selected]);
  const act = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try { acceptState(await request("/api/country-challenge", payload)); setQuery(""); setSelected(null); setItems([]); }
    catch (e) { setError(e instanceof Error ? e.message : "عملیات انجام نشد"); }
    finally { setBusy(false); }
  };
  const seconds = state ? Math.max(0, Math.ceil((Date.parse(state.challenge.endsAt) - now - serverOffset) / 1000)) : 0;
  const locked = !state || state.challenge.ended || !state.entry || state.entry.status !== "ACTIVE";
  return <section className="country-daily">
    <div className="section-heading"><button className="icon-button" onClick={onBack} aria-label="بازگشت">→</button><div><small>کشورجو · چالش مشترک</small><h1>چالش امروز</h1></div><span>🌍</span></div>
    {loading && !state && <div className="empty-state">در حال بارگذاری چالش کشورجو…</div>}
    {state && <div className="phrase-challenge-info country-daily-clock"><div><b>چالش مشترک کشورجو</b><span>تعویض کشور: ۹ صبح و ۹ شب · به وقت تهران</span></div>{!state.challenge.ended && <strong dir="ltr">{Math.floor(seconds / 3600).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}:{Math.floor(seconds / 60 % 60).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}:{(seconds % 60).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}</strong>}{!state.challenge.ended && <small>تا چالش بعدی</small>}<button className="secondary" onClick={onLeaderboard}>جدول رتبه‌بندی</button></div>}
    {state?.entry && <>
      <div className="country-daily-stats"><span>{state.entry.guessCount.toLocaleString("fa-IR")} حدس</span><span>بهترین رتبه: {state.entry.bestRank === null ? "—" : state.entry.bestRank.toLocaleString("fa-IR")}</span></div>
      {state.entry.status === "WON" && <div className="country-daily-result won"><b>آفرین! کشور را پیدا کردی.</b><span>{state.entry.guessCount.toLocaleString("fa-IR")} حدس</span></div>}
      {state.entry.status === "SURRENDERED" && <div className="country-daily-result"><b>پاسخ را دیدی؛ نتیجه در جدول ثبت است.</b></div>}
      {state.entry.status === "EXPIRED" && <div className="country-daily-result"><b>زمان چالش تمام شد.</b></div>}
      {!state.challenge.ended && state.entry.status === "ACTIVE" && <>
        <p className="players-hint">کشور پنهان را پیدا کن؛ رتبهٔ کمتر یعنی نزدیک‌تر.</p>
        <div className="search-box"><div className="search-row"><input aria-label="جست‌وجوی کشور" placeholder="نام یک کشور را جست‌وجو کن…" autoComplete="off" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && selected && !busy) void act({ action: "guess", itemId: selected.id }); }} /><button disabled={!selected || busy} onClick={() => selected && void act({ action: "guess", itemId: selected.id })}>{busy ? "…" : "حدس"}</button></div>{items.length > 0 && <div className="suggestions">{items.map(item => <button key={item.id} onClick={() => { setSelected(item); setQuery(item.name); setItems([]); }}><span>{item.emoji} {item.name}</span>{item.detail && <small>{item.detail}</small>}</button>)}</div>}</div>
        <button className="secondary country-daily-surrender" disabled={busy} onClick={() => { if (window.confirm("با تسلیم، پاسخ برایت آشکار می‌شود و دیگر نمی‌توانی در این چالش حدس بزنی. ادامه می‌دهی؟")) void act({ action: "surrender" }); }}>دیدن پاسخ و پایان‌دادن</button>
      </>}
      {state.entry.target && <div className="country-daily-target"><small>کشور هدف</small><b>{state.entry.target.emoji} {state.entry.target.name}</b>{state.entry.target.description && <span>{state.entry.target.description}</span>}</div>}
      <section className="country-daily-guesses"><div className="guess-head"><h2>حدس‌های تو</h2><span>{state.entry.guesses.length.toLocaleString("fa-IR")}</span></div>{!state.entry.guesses.length ? <p>هنوز حدسی ثبت نکرده‌ای.</p> : [...state.entry.guesses].sort((a, b) => a.rank - b.rank).map(guess => <div className="country-daily-guess" key={guess.id}><span>{guess.emoji} {guess.name}</span><b>{guess.rank === 0 ? "✓" : guess.rank.toLocaleString("fa-IR")}</b></div>)}</section>
    </>}
    <button className="secondary" onClick={onLeaderboard}>دیدن جدول چالش‌ها</button>
    {locked && state?.challenge.target && <small className="country-daily-target-note">پاسخ چالش: {state.challenge.target.name}</small>}
  </section>;
}
