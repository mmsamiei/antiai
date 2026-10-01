"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type GameType = "IRAN_CITY" | "COUNTRY";
type PublicItem = { id: string; name: string; emoji?: string; detail?: string };
type Guess = PublicItem & { rank: number; createdAt: string };
type Game = {
  id: string;
  type: GameType;
  status: "ACTIVE" | "WON" | "SURRENDERED";
  guessesCount: number;
  totalItems: number;
  guesses: Guess[];
  target: PublicItem | null;
};
type Stats = { total: number; wins: number; surrendered: number; averageGuesses: number; bestGame: number };
type LeaderRow = { rank: number; userId: string; displayName: string; photoUrl?: string; wins: number; averageGuesses: number; bestGame: number; isMe: boolean };
type Screen = "home" | "play" | "leaderboard" | "profile";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const gameMeta: Record<GameType, { title: string; icon: string; description: string; hint: string }> = {
  IRAN_CITY: { title: "شهرجو", icon: "🇮🇷", description: "شهر پنهان ایران را پیدا کن", hint: "نام یک شهر ایران را بنویس…" },
  COUNTRY: { title: "کشورجو", icon: "🌍", description: "کشور پنهان را روی نقشه ذهنی‌ات پیدا کن", hint: "نام یک کشور را بنویس…" }
};

function telegram() { return (globalThis as typeof globalThis & { Telegram?: { WebApp?: any } }).Telegram?.WebApp; }

function rankColor(rank: number, total: number) {
  const ratio = rank / total;
  if (rank === 1) return "perfect";
  if (ratio <= 0.05) return "hot";
  if (ratio <= 0.2) return "warm";
  if (ratio <= 0.5) return "mild";
  return "cold";
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url.startsWith("/") ? BASE_PATH + url : url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد");
  return data;
}

export default function AntiAiGamesApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<Stats>({ total: 0, wins: 0, surrendered: 0, averageGuesses: 0, bestGame: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    const data = await jsonFetch<{ user: any; stats: Stats; recent: any[] }>("/api/profile");
    setUser((current: any) => current || data.user);
    setStats(data.stats);
    setRecent(data.recent);
  }, []);

  useEffect(() => {
    const tg = telegram();
    tg?.ready();
    tg?.expand();
    tg?.setHeaderColor?.("#080b17");
    tg?.setBackgroundColor?.("#080b17");
    const initData = tg?.initData;
    const auth = initData
      ? jsonFetch<{ user: any }>("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) })
      : jsonFetch<{ user: any }>("/api/auth/demo", { method: "POST" });
    auth.then(({ user }) => { setUser(tg?.initDataUnsafe?.user || user); return loadProfile(); })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [loadProfile]);

  const startGame = async (type: GameType) => {
    setBusy(true); setError("");
    try {
      const data = await jsonFetch<{ game: Game }>("/api/game/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type })
      });
      setGame(data.game); setScreen("play");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "بازی شروع نشد"); }
    finally { setBusy(false); }
  };

  const exitGame = () => { setScreen("home"); setGame(null); loadProfile().catch(() => undefined); };

  if (loading) return <div className="loading-screen"><div className="brand-mark">A</div><strong>ANTI AI GAMES</strong><span>داریم مغزت را گرم می‌کنیم…</span></div>;

  return <main className="shell">
    <Header user={user} onHome={exitGame} />
    {error && <div className="toast" onClick={() => setError("")}>{error}<button>×</button></div>}
    {screen === "home" && <Home stats={stats} busy={busy} onStart={startGame} />}
    {screen === "play" && game && <Play game={game} setGame={setGame} busy={busy} setBusy={setBusy} setError={setError} onNew={() => startGame(game.type)} onExit={exitGame} />}
    {screen === "leaderboard" && <Leaderboard />}
    {screen === "profile" && <Profile stats={stats} recent={recent} />}
    {screen !== "play" && <BottomNav active={screen} onChange={setScreen} />}
  </main>;
}

function Header({ user, onHome }: { user: any; onHome: () => void }) {
  const photo = user?.photo_url || user?.photoUrl;
  return <header className="topbar">
    <button className="brand" onClick={onHome} aria-label="خانه">
      <span className="brand-mark">A</span>
      <span><small>مغزت را پس بگیر</small><b>ANTI AI GAMES</b></span>
    </button>
    {photo ? <img className="avatar" src={photo} alt="" /> : <div className="avatar avatar-fallback">👤</div>}
  </header>;
}

function Home({ stats, busy, onStart }: { stats: Stats; busy: boolean; onStart: (type: GameType) => void }) {
  return <>
    <section className="hero">
      <span className="hero-chip">بدون کمک AI</span>
      <h1>هنوز خودت فکر می‌کنی؟</h1>
      <p>یکی از بازی‌ها را انتخاب کن و نقشه‌ای را که در ذهنت ساخته‌ای به چالش بکش.</p>
    </section>
    <section className="game-grid">
      {(Object.keys(gameMeta) as GameType[]).map((type) => <button className={`game-card ${type === "IRAN_CITY" ? "iran" : "world"}`} key={type} disabled={busy} onClick={() => onStart(type)}>
        <span className="game-icon">{gameMeta[type].icon}</span>
        <span className="game-copy"><b>{gameMeta[type].title}</b><small>{gameMeta[type].description}</small></span>
        <span className="game-arrow">←</span>
      </button>)}
    </section>
    <section className="stats-card">
      <div><strong>{stats.wins.toLocaleString("fa-IR")}</strong><span>برد</span></div>
      <div><strong>{stats.averageGuesses.toLocaleString("fa-IR")}</strong><span>میانگین حدس</span></div>
      <div><strong>{stats.bestGame ? stats.bestGame.toLocaleString("fa-IR") : "—"}</strong><span>بهترین بازی</span></div>
    </section>
    <p className="manifesto">همه‌چیز را نده AI انجام بده.</p>
  </>;
}

function Play({ game, setGame, busy, setBusy, setError, onNew, onExit }: {
  game: Game; setGame: (game: Game) => void; busy: boolean; setBusy: (busy: boolean) => void;
  setError: (error: string) => void; onNew: () => void; onExit: () => void;
}) {
  const meta = gameMeta[game.type];
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PublicItem[]>([]);
  const [selected, setSelected] = useState<PublicItem | null>(null);
  const sortedGuesses = useMemo(() => [...game.guesses].sort((a, b) => a.rank - b.rank), [game.guesses]);

  useEffect(() => {
    if (query.trim().length < 1 || selected?.name === query || game.status !== "ACTIVE") { setSuggestions([]); return; }
    const timer = setTimeout(() => {
      jsonFetch<{ items: PublicItem[] }>(`/api/search?type=${game.type}&q=${encodeURIComponent(query)}`)
        .then(({ items }) => setSuggestions(items.filter((item) => !game.guesses.some((guess) => guess.id === item.id))))
        .catch(() => setSuggestions([]));
    }, 140);
    return () => clearTimeout(timer);
  }, [query, selected, game.type, game.status, game.guesses]);

  const submitGuess = async () => {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const data = await jsonFetch<{ game: Game }>("/api/game/guess", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: game.id, itemId: selected.id })
      });
      setGame(data.game); setQuery(""); setSelected(null); setSuggestions([]);
      telegram()?.HapticFeedback?.notificationOccurred(data.game.status === "WON" ? "success" : "warning");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "حدس ثبت نشد"); }
    finally { setBusy(false); }
  };

  const surrender = async () => {
    const confirmed = globalThis.confirm("تسلیم می‌شوی؟ پاسخ نمایش داده می‌شود و بازی تمام خواهد شد.");
    if (!confirmed) return;
    setBusy(true);
    try {
      const data = await jsonFetch<{ game: Game }>("/api/game/surrender", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: game.id })
      });
      setGame(data.game);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "عملیات انجام نشد"); }
    finally { setBusy(false); }
  };

  const share = () => {
    const blocks = game.guesses.map((guess) => guess.rank === 1 ? "🎯" : guess.rank / game.totalItems < .05 ? "🟩" : guess.rank / game.totalItems < .2 ? "🟨" : guess.rank / game.totalItems < .5 ? "🟧" : "🟥").join("");
    const text = `${meta.title} در Anti AI Games\n${blocks}\n${game.guessesCount.toLocaleString("fa-IR")} حدس`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(`${location.origin}${BASE_PATH}`)}&text=${encodeURIComponent(text)}`;
    telegram()?.openTelegramLink ? telegram().openTelegramLink(url) : window.open(url, "_blank");
  };

  return <section className="play-screen">
    <div className="play-heading"><button className="icon-button" onClick={onExit}>→</button><div><small>{meta.icon} {meta.title}</small><h1>پاسخ پنهان را پیدا کن</h1></div><span className="guess-count">{game.guessesCount.toLocaleString("fa-IR")} حدس</span></div>
    {game.status === "ACTIVE" ? <div className="search-box">
      <div className="search-row"><input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder={meta.hint} autoComplete="off" /><button disabled={!selected || busy} onClick={submitGuess}>{busy ? "…" : "حدس"}</button></div>
      {suggestions.length > 0 && <div className="suggestions">{suggestions.map((item) => <button key={item.id} onClick={() => { setSelected(item); setQuery(item.name); setSuggestions([]); }}><span>{item.emoji} {item.name}</span>{item.detail && <small>{item.detail}</small>}</button>)}</div>}
    </div> : <div className={`finish-card ${game.status === "WON" ? "won" : "gave-up"}`}>
      <span className="finish-icon">{game.status === "WON" ? "🎯" : "🏳️"}</span>
      <h2>{game.status === "WON" ? "پیداش کردی!" : "پاسخ این بود:"}</h2>
      <strong>{game.target?.emoji} {game.target?.name}</strong>
      <p>{game.status === "WON" ? `با ${game.guessesCount.toLocaleString("fa-IR")} حدس به جواب رسیدی.` : "بازی بعدی را از نو شروع کن."}</p>
      <div className="finish-actions"><button className="primary" onClick={onNew}>بازی بعدی</button>{game.status === "WON" && <button className="secondary" onClick={share}>اشتراک نتیجه</button>}</div>
    </div>}
    <div className="guess-head"><b>حدس‌ها</b>{game.status === "ACTIVE" && <button onClick={surrender} disabled={busy}>تسلیم می‌شوم</button>}</div>
    {sortedGuesses.length === 0 ? <div className="empty-state"><span>⌁</span><p>اولین حدس را بزن. هرچه رتبه کمتر باشد، نزدیک‌تری.</p></div> : <div className="guess-list">{sortedGuesses.map((guess) => <div className={`guess-row ${rankColor(guess.rank, game.totalItems)}`} key={guess.id}><div className="guess-name"><span>{guess.emoji}</span><b>{guess.name}</b></div><div className="rank-copy"><small>رتبه</small><strong>{guess.rank.toLocaleString("fa-IR")}</strong><span>از {game.totalItems.toLocaleString("fa-IR")}</span></div><div className="rank-bar"><i style={{ width: `${Math.max(4, 100 - ((guess.rank - 1) / (game.totalItems - 1)) * 100)}%` }} /></div></div>)}</div>}
  </section>;
}

function Leaderboard() {
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [mode, setMode] = useState<"effort" | "skill">("effort");
  const [type, setType] = useState<"ALL" | GameType>("ALL");
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [me, setMe] = useState<LeaderRow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); jsonFetch<{ rows: LeaderRow[]; me: LeaderRow | null }>(`/api/leaderboard?period=${period}&type=${type}&mode=${mode}`).then((data) => { setRows(data.rows); setMe(data.me); }).finally(() => setLoading(false)); }, [period, type, mode]);
  return <section><div className="section-heading"><div><small>رقابت واقعی</small><h1>لیدربورد</h1></div><span>🏆</span></div>
    <div className="board-modes"><button className={mode === "effort" ? "active" : ""} onClick={() => setMode("effort")}><b>پرتلاش‌ترین‌ها</b><small>بیشترین تعداد برد</small></button><button className={mode === "skill" ? "active" : ""} onClick={() => setMode("skill")}><b>ماهرترین‌ها</b><small>کمترین میانگین حدس</small></button></div>
    <div className="segmented"><button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>این هفته</button><button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>همه دوران</button></div>
    <div className="filter-chips"><button className={type === "ALL" ? "active" : ""} onClick={() => setType("ALL")}>مجموع</button><button className={type === "IRAN_CITY" ? "active" : ""} onClick={() => setType("IRAN_CITY")}>شهرجو</button><button className={type === "COUNTRY" ? "active" : ""} onClick={() => setType("COUNTRY")}>کشورجو</button></div>
    {mode === "skill" && <p className="board-note">امتیاز مهارت = مجموع حدس‌های بازی‌های تمام‌شده ÷ تعداد بردها · حداقل ۳ برد</p>}
    {loading ? <div className="empty-state">در حال محاسبه رتبه‌ها…</div> : rows.length === 0 ? <div className="empty-state">{mode === "skill" ? "هنوز کسی در این جدول به ۳ برد نرسیده." : "هنوز بردی ثبت نشده؛ اولین نفر باش!"}</div> : <div className="leader-list">{rows.map((row) => <LeaderRowView key={row.userId} row={row} mode={mode} />)}</div>}
    {me && me.rank > 50 && <div className="my-rank"><small>جایگاه تو</small><LeaderRowView row={me} mode={mode} /></div>}
  </section>;
}

function LeaderRowView({ row, mode = "effort" }: { row: LeaderRow; mode?: "effort" | "skill" }) {
  return <div className={`leader-row ${row.isMe ? "me" : ""}`}><span className="leader-rank">{row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : row.rank.toLocaleString("fa-IR")}</span>{row.photoUrl ? <img src={row.photoUrl} alt="" /> : <span className="mini-avatar">👤</span>}<div className="leader-name"><b>{row.displayName}</b><small>{mode === "skill" ? row.wins.toLocaleString("fa-IR") + " برد" : "میانگین " + row.averageGuesses.toLocaleString("fa-IR") + " حدس"}</small></div><div className="leader-wins"><strong>{mode === "skill" ? row.averageGuesses.toLocaleString("fa-IR") : row.wins.toLocaleString("fa-IR")}</strong><small>{mode === "skill" ? "میانگین حدس" : "برد"}</small></div></div>;
}

function Profile({ stats, recent }: { stats: Stats; recent: any[] }) {
  return <section><div className="section-heading"><div><small>کارنامه ذهنی</small><h1>آمار من</h1></div><span>🧠</span></div>
    <div className="profile-grid"><div><strong>{stats.total.toLocaleString("fa-IR")}</strong><span>کل بازی‌ها</span></div><div><strong>{stats.wins.toLocaleString("fa-IR")}</strong><span>بردها</span></div><div><strong>{stats.averageGuesses.toLocaleString("fa-IR")}</strong><span>میانگین حدس</span></div><div><strong>{stats.bestGame ? stats.bestGame.toLocaleString("fa-IR") : "—"}</strong><span>بهترین بازی</span></div></div>
    <div className="card recent"><h2>بازی‌های اخیر</h2>{recent.length === 0 ? <div className="empty-state">هنوز بازی تمام‌شده‌ای نداری.</div> : recent.map((item) => <div className="recent-row" key={item.id}><span>{item.type === "IRAN_CITY" ? "🇮🇷" : "🌍"}</span><div><b>{gameMeta[item.type as GameType].title}</b><small>{item.status === "WON" ? `${item.guessesCount.toLocaleString("fa-IR")} حدس` : "تسلیم"}</small></div><strong className={item.status === "WON" ? "success" : "muted"}>{item.status === "WON" ? "برد" : "ناتمام"}</strong></div>)}</div>
  </section>;
}

function BottomNav({ active, onChange }: { active: Screen; onChange: (screen: Screen) => void }) {
  return <nav className="bottom-nav"><button className={active === "home" ? "active" : ""} onClick={() => onChange("home")}><span>⌂</span>بازی‌ها</button><button className={active === "leaderboard" ? "active" : ""} onClick={() => onChange("leaderboard")}><span>♛</span>رتبه‌ها</button><button className={active === "profile" ? "active" : ""} onClick={() => onChange("profile")}><span>◉</span>آمار من</button></nav>;
}
