"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { geoRaceConfig, geoRaceType, type GeoRaceType } from "@/lib/geo-race-config";
import { RaceCountdown } from "@/lib/race-countdown";
import { useGeographySearch } from "@/lib/use-geography-search";
import type { GeographySuggestion } from "@/lib/geography-search-client";
import { sessionRequest } from "@/lib/client-session";
import { useOnlineUsers } from "@/lib/use-online-users";
import { useBackHandler } from "./back-navigation";
import { Player, PlayerAvatar, playerName } from "./players";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Guess = { id: string; name: string; emoji?: string; rank: number; detail?: string; provinceName?: string };
type Race = { ratingChange?: { before: number; after: number; delta: number } | null; id: string; gameType: GeoRaceType; totalItems: number; status: string; deadline: string | null; serverNow: string; me: Player; opponent: Player; myBestRank: number | null; opponentBestRank: number | null; opponentConnected: boolean; reconnectDeadline: string; guesses: Guess[]; opponentGuesses?: Guess[]; target?: { name: string; emoji?: string; description?: string }; winnerUserId: string | null; endReason: string | null; invite: { id: string; reason: string | null } | null };
const rankText = (rank: number | null) => rank === null ? "—" : rank === 0 ? "پیدا شد!" : rank.toLocaleString("fa-IR");
async function request(url: string, body?: unknown) {
  const response = await fetch(base + url, sessionRequest(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined));
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد"); return data;
}
export default function CountryRace({ id, onExit, setError, onProfile, registerLeave }: { id: string; onExit: () => void; setError: (message: string) => void; onProfile: (id: string) => void; registerLeave: (handler: (() => Promise<void>) | null) => void }) {
  const [race, setRace] = useState<Race | null>(null), [query, setQuery] = useState(""), [items, setItems] = useState<GeographySuggestion[]>([]), [selected, setSelected] = useState<GeographySuggestion | null>(null), [busy, setBusy] = useState(false), [invited, setInvited] = useState(false), [now, setNow] = useState(0);
  const gameType = geoRaceType(race?.gameType), config = geoRaceConfig[gameType];
  const offset = useRef(0), submitting = useRef(false);
  const countdown = useRef(new RaceCountdown()), latestServerTime = useRef(0), latestStatus = useRef("");
  const online = useOnlineUsers([race?.me.id, race?.opponent.id]);
  const receive = useCallback((value: Race, sentAt: number) => {
    const serverTime = Date.parse(value.serverNow), receivedAt = performance.now();
    if (serverTime < latestServerTime.current || latestStatus.current === "ENDED" && value.status !== "ENDED" || latestStatus.current === "ACTIVE" && value.status === "WAITING") return;
    latestServerTime.current = serverTime; latestStatus.current = value.status;
    offset.current = serverTime - Date.now();
    countdown.current.sync(value.deadline, value.serverNow, receivedAt, receivedAt - sentAt);
    setNow(receivedAt); setRace(value);
  }, []);
  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const sentAt = performance.now();
    const data = await request("/api/country-race", { action, id, ...extra });
    receive(data.race, sentAt); return data;
  }, [id, receive]);
  useEffect(() => {
    let stopped = false, polling = false;
    const poll = async () => {
      if (polling || document.visibilityState !== "visible") return;
      polling = true;
      try { const sentAt = performance.now(); const data = await request("/api/country-race?id=" + encodeURIComponent(id)); if (!stopped) receive(data.race, sentAt); }
      catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "مسابقه پیدا نشد"); }
      finally { polling = false; }
    };
    void poll(); const timer = setInterval(poll, 1000); document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [id, receive, setError]);
  useEffect(() => {
    if (!race || race.status === "ENDED") return;
    const tick = () => { if (document.visibilityState !== "visible") return;
      void act(race.status === "WAITING" ? "ready" : "heartbeat", race.status === "WAITING" ? { inviteId: race.invite?.id } : {}).catch(e => setError(e instanceof Error ? e.message : "اتصال مسابقه برقرار نشد"));
    };
    tick(); const timer = setInterval(tick, race.status === "WAITING" ? 3000 : 5000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [race?.status, race?.invite?.id, act, setError]);
  useEffect(() => { const timer = setInterval(() => setNow(performance.now()), 200); return () => clearInterval(timer); }, []);
  useGeographySearch({ type: gameType, query, selected: Boolean(selected), enabled: race?.status === "ACTIVE", onResults: setItems });

  const leave = async (confirm = true) => {
    if (confirm && race?.status === "ACTIVE" && !window.confirm("با خروج، مسابقه را به حریف واگذار می‌کنی. خارج می‌شوی؟")) return;
    try { if (race && race.status !== "ENDED") await act("leave"); onExit(); }
    catch (e) { setError(e instanceof Error ? e.message : "خروج انجام نشد"); }
  };
  useBackHandler(() => leave());
  useEffect(() => { registerLeave(() => leave(false)); return () => registerLeave(null); });
  const guess = async (itemId: string) => {
    if (submitting.current) return; submitting.current = true; setBusy(true);
    try { await act("guess", { itemId }); setQuery(""); setSelected(null); setItems([]); }
    catch (e) { setError(e instanceof Error ? e.message : "حدس ثبت نشد"); }
    finally { submitting.current = false; setBusy(false); }
  };
  const seconds = countdown.current.seconds(now);
  const ended = race?.status === "ENDED", won = ended && race.winnerUserId === race.me.id;
  return <section className="country-race-screen duel-screen">
    <div className="play-heading"><button className="icon-button" aria-label="بازگشت" onClick={() => void leave()}>→</button><div><small>رقابت دو نفره</small><h1>{config.name}</h1></div>{race?.status === "ACTIVE" && <button className="duel-leave" onClick={() => void leave()}>تسلیم</button>}</div>
    {!race ? <div className="empty-state">در حال بازیابی مسابقه…</div> : <>
      <div className="duel-score race-score">{[race.me, race.opponent].map((p, index) => <div key={p.id}>
        <button className="duel-profile-trigger" onClick={() => onProfile(p.id)}><PlayerAvatar player={p} online={online.has(p.id)} /><b>{playerName(p)}</b></button>
        <small>{index === 0 ? "بهترین رتبهٔ تو" : "بهترین رتبهٔ حریف"}</small><strong key={index === 0 ? race.myBestRank : race.opponentBestRank}>{rankText(index === 0 ? race.myBestRank : race.opponentBestRank)}</strong>
      </div>)}</div>
      {race.status === "WAITING" && <div className="empty-state">منتظر آماده‌شدن هر دو بازیکن…</div>}
      {race.status === "ACTIVE" && <>
        <div className={"race-timer" + (seconds <= 20 ? " urgent" : "")} role="timer">{seconds.toLocaleString("fa-IR")} <small>ثانیه باقی مانده</small></div>
        <p className="players-hint">{config.noun} پنهان را پیدا کن؛ رتبهٔ کمتر یعنی نزدیک‌تر.</p>
        {!race.opponentConnected && <p className="duel-disconnected">منتظر بازگشت حریف؛ {Math.max(0, Math.ceil((Date.parse(race.reconnectDeadline) - Date.now() - offset.current) / 1000)).toLocaleString("fa-IR")} ثانیه فرصت دارد.</p>}
        <div className="search-box">
          <div className="search-row">
            <input aria-label={`جست‌وجوی ${config.noun}`} placeholder={config.hint} autoComplete="off" value={query} maxLength={80}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (selected && !busy && seconds > 0) void guess(selected.id); } }} />
            <button disabled={!selected || busy || seconds <= 0} onClick={() => selected && void guess(selected.id)}>{busy ? "…" : "حدس"}</button>
          </div>
          {items.length > 0 && <div className="suggestions">{items.map(item => <button key={item.id} onClick={() => { setSelected(item); setQuery(item.name); setItems([]); }}><span>{item.emoji} {item.name}</span>{(item.provinceName || item.detail) && <small>{item.provinceName || item.detail}</small>}</button>)}</div>}
        </div>
      </>}
      {ended && <div className={"duel-result " + (race.winnerUserId ? won ? "won" : "lost" : "draw")}>
        <span>{race.winnerUserId ? won ? "🏆" : "◌" : "🤝"}</span><h2>{race.winnerUserId ? won ? "مسابقه را بردی!" : "حریف مسابقه را برد" : race.endReason === "CANCELLED" ? "شروع مسابقه لغو شد" : "مسابقه مساوی شد"}</h2>
        <p>{race.endReason === "FOUND" ? `${config.noun} هدف پیدا شد.` : race.endReason === "TIMEOUT" ? `${config.durationText} تمام شد؛ نتیجه بر اساس بهترین رتبهٔ هر نفر است.` : race.endReason === "FORFEIT" ? "مسابقه با واگذاری پایان یافت." : race.endReason === "DISCONNECTED" ? "مهلت بازگشت به مسابقه تمام شد." : race.invite?.reason}</p>
        {race.ratingChange && <p>امتیاز رقابتی: <b dir="ltr">{race.ratingChange.before.toLocaleString("fa-IR")} → {race.ratingChange.after.toLocaleString("fa-IR")} ({race.ratingChange.delta > 0 ? "+" : ""}{race.ratingChange.delta.toLocaleString("fa-IR")})</b></p>}
        {race.target && <><strong>{race.target.emoji} {race.target.name}</strong><p>{race.target.description}</p></>}
        <div className="duel-rematch"><button className="primary" disabled={busy || invited} onClick={async () => { setBusy(true); try { await act("rematch"); setInvited(true); } catch (e) { setError(e instanceof Error ? e.message : "دعوت ارسال نشد"); } finally { setBusy(false); } }}>{invited ? "دعوت فرستاده شد؛ منتظر پاسخ حریف" : "بازی مجدد با همین حریف"}</button><button className="secondary" onClick={onExit}>بازگشت به بازیکن‌ها</button></div>
      </div>}
      <RaceGuesses title="حدس‌های تو" guesses={race.guesses} total={race.totalItems} />
      {ended && <RaceGuesses title="حدس‌های حریف" guesses={race.opponentGuesses || []} total={race.totalItems} />}
    </>}
  </section>;
}
function RaceGuesses({ title, guesses, total }: { title: string; guesses: Guess[]; total: number }) {
  return <section className="race-guesses"><div className="guess-head"><h2>{title}</h2><span>{guesses.length.toLocaleString("fa-IR")} حدس</span></div>{!guesses.length ? <p>هنوز حدسی ثبت نشده</p> : <div className="guess-list">{[...guesses].sort((a, b) => a.rank - b.rank).map(g => <div className={`guess-row ${rankColor(g.rank, total)}`} key={g.id}>
    <div className="guess-name"><span>{g.emoji}</span><b>{g.name}</b></div>
    <div className="rank-copy"><small>رتبه</small><strong>{g.rank === 0 ? "✓" : g.rank.toLocaleString("fa-IR")}</strong><span>{g.rank === 0 ? "پاسخ درست" : `از ${total.toLocaleString("fa-IR")}`}</span></div>
    <div className="rank-bar"><i style={{ width: `${g.rank === 0 ? 100 : Math.max(4, 100 - ((g.rank - 2) / Math.max(1, total - 2)) * 100)}%` }} /></div>
  </div>)}</div>}</section>;
}
function rankColor(rank: number, total: number) {
  if (rank === 0) return "perfect";
  if (rank / total <= .05) return "hot";
  if (rank / total <= .2) return "warm";
  if (rank / total <= .5) return "mild";
  return "cold";
}
