"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import LetterDuel from "./letter-duel";
import { sessionRequest, setClientSessionToken } from "@/lib/client-session";

type GameType =
  | "IRAN_CITY"
  | "COUNTRY"
  | "ADJECTIVE"
  | "ADJECTIVE_RAIN"
  | "SEMANTRIS"
  | "LETTER_DUEL";
type PublicItem = { id: string; name: string; emoji?: string; detail?: string; provinceName?: string; description?: string };
type Guess = PublicItem & { rank: number; createdAt: string };
type Game = {
  id: string;
  type: GameType;
  status: "ACTIVE" | "WON" | "SURRENDERED";
  guessesCount: number;
  totalItems: number;
  guesses: Guess[];
  target: PublicItem | null;
  startedAt: string;
  prompt?: {
    id: string;
    name: string;
    emoji: string;
    examples: string[];
    partOfSpeech?: string;
  } | null;
  acceptedCount?: number;
  semantris?: {
    words: string[];
    targetWord: string;
    score: number;
    cleared: number;
    moves: number;
    combo: number;
    gameOver: boolean;
    lastDropAt: string;
    correctHits: number;
    clues: {
      word: string;
      targetWord: string;
      targetRank: number;
      removed: number;
      createdAt: string;
    }[];
  };
};
type LeaderRow = {
  rank: number;
  userId: string;
  displayName: string;
  photoUrl?: string;
  wins: number;
  averageGuesses: number;
  bestGame: number;
  totalScore?: number;
  bestScore?: number;
  rounds?: number;
  losses?: number;
  draws?: number;
  winRate?: number;
  isMe: boolean;
};
type Screen = "home" | "play" | "duel" | "leaderboard";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";

const gameMeta: Record<
  GameType,
  { title: string; icon: string; description: string; hint: string }
> = {
  IRAN_CITY: {
    title: "شهرجو",
    icon: "🇮🇷",
    description: "شهر پنهان ایران را پیدا کن",
    hint: "نام یک شهر ایران را بنویس…",
  },
  COUNTRY: {
    title: "کشورجو",
    icon: "🌍",
    description: "کشور پنهان را با فاصلهٔ پایتخت‌ها پیدا کن",
    hint: "نام یک کشور را بنویس…",
  },
  ADJECTIVE: {
    title: "واژه‌جو قدیمی",
    icon: "✦",
    description: "نسخهٔ قدیمی",
    hint: "یک واژهٔ فارسی بنویس…",
  },
  ADJECTIVE_RAIN: {
    title: "واژه‌جو",
    icon: "✦",
    description: "برای یک واژه، هم‌معنی پیدا کن",
    hint: "یک هم‌معنی فارسی بنویس…",
  },
  LETTER_DUEL: {
    title: "دوحرف",
    icon: "ح‌ح",
    description: "با یک حریف، از دو حرف واژه بساز",
    hint: "یک واژهٔ فارسی بنویس…",
  },
  SEMANTRIS: {
    title: "معناتریس",
    icon: "▦",
    description: "با سرنخ‌های معنایی واژه‌ها را پایین بیاور",
    hint: "یک سرنخ مرتبط بنویس…",
  },
};
const playableTypes: GameType[] = [
  "COUNTRY",
  "IRAN_CITY",
  "SEMANTRIS",
  "LETTER_DUEL",
];

function telegram() {
  return (globalThis as typeof globalThis & { Telegram?: { WebApp?: any } })
    .Telegram?.WebApp;
}

function rankColor(rank: number, total: number) {
  const ratio = rank / total;
  if (rank === 0) return "perfect";
  if (ratio <= 0.05) return "hot";
  if (ratio <= 0.2) return "warm";
  if (ratio <= 0.5) return "mild";
  return "cold";
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(
    url.startsWith("/") ? BASE_PATH + url : url,
    sessionRequest(init),
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد");
  return data;
}

export default function AntiAiGamesApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [user, setUser] = useState<any>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [randomDuelWaiting, setRandomDuelWaiting] = useState(false);

  useEffect(() => {
    const tg = telegram();
    tg?.ready();
    tg?.expand();
    tg?.setHeaderColor?.("#080b17");
    tg?.setBackgroundColor?.("#080b17");
    const initData = tg?.initData;
    const auth = initData
      ? jsonFetch<{ user: any; session: string }>("/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        })
      : jsonFetch<{ user: any; session: string }>("/api/auth/demo", { method: "POST" });
    auth
      .then(({ user, session }) => {
        setClientSessionToken(session);
        setUser(tg?.initDataUnsafe?.user || user);
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    const isPlaying = screen === "play" && game?.status === "ACTIVE";
    const heartbeat = () => {
      jsonFetch<{ onlineCount: number; randomDuelWaiting: boolean }>("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPlaying }),
      })
        .then(({ onlineCount, randomDuelWaiting }) => { setOnlineCount(onlineCount); setRandomDuelWaiting(randomDuelWaiting); })
        .catch(() => setRandomDuelWaiting(false));
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 20_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, screen, game?.status]);

  const startGame = async (type: GameType) => {
    setBusy(true);
    setError("");
    try {
      const data = await jsonFetch<{ game: Game }>("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      setGame(data.game);
      setScreen("play");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "بازی شروع نشد");
    } finally {
      setBusy(false);
    }
  };

  const exitGame = () => {
    setScreen("home");
    setGame(null);
  };
  useEffect(() => {
    if (
      user &&
      (new URLSearchParams(location.search).get("duel") ||
        telegram()?.initDataUnsafe?.start_param?.startsWith("duel_"))
    )
      setScreen("duel");
  }, [user]);

  if (loading)
    return (
      <div className="loading-screen">
        <div className="brand-mark">A</div>
        <strong>ANTI AI GAMES</strong>
        <span>داریم مغزت را گرم می‌کنیم…</span>
      </div>
    );

  if (!user)
    return (
      <div className="loading-screen">
        <div className="brand-mark">!</div>
        <strong>ورود به بازی کامل نشد</strong>
        <span>{error || "مینی‌اپ را از داخل تلگرام باز کن و دوباره تلاش کن."}</span>
        <button className="primary" onClick={() => location.reload()}>تلاش دوباره</button>
      </div>
    );

  return (
    <main className="shell">
      {screen !== "play" && screen !== "duel" && (
        <Header user={user} onHome={exitGame} />
      )}
      {error && (
        <div className="toast" onClick={() => setError("")}>
          {error}
          <button>×</button>
        </div>
      )}
      {screen === "home" && (
        <Home
          onlineCount={onlineCount}
          randomDuelWaiting={randomDuelWaiting}
          busy={busy}
          onStart={startGame}
          onDuel={() => setScreen("duel")}
        />
      )}
      {screen === "duel" && (
        <LetterDuel onExit={exitGame} setError={setError} />
      )}
      {screen === "play" && game && (
        <Play
          game={game}
          setGame={setGame}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          onNew={() => startGame(game.type)}
          onExit={exitGame}
        />
      )}
      {screen === "leaderboard" && <Leaderboard />}
      {screen !== "play" && screen !== "duel" && (
        <BottomNav active={screen} onChange={setScreen} />
      )}
    </main>
  );
}

function Header({ user, onHome }: { user: any; onHome: () => void }) {
  const photo = user?.photo_url || user?.photoUrl;
  return (
    <header className="topbar">
      <button className="brand" onClick={onHome} aria-label="خانه">
        <span className="brand-mark">A</span>
        <span>
          <small>مغزت را پس بگیر</small>
          <b>ANTI AI GAMES</b>
        </span>
      </button>
      {photo ? (
        <img className="avatar" src={photo} alt="" />
      ) : (
        <div className="avatar avatar-fallback">👤</div>
      )}
    </header>
  );
}

function Home({
  onlineCount,
  randomDuelWaiting,
  busy,
  onStart,
  onDuel,
}: {
  onlineCount: number | null;
  randomDuelWaiting: boolean;
  busy: boolean;
  onStart: (type: GameType) => void;
  onDuel: () => void;
}) {
  return (
    <>
      <section className="hero">
        <span className="hero-chip">بدون کمک AI</span>
        <h1>هنوز خودت فکر می‌کنی؟</h1>
        <p>
          یکی از بازی‌ها را انتخاب کن و نقشه‌ای را که در ذهنت ساخته‌ای به چالش
          بکش.
        </p>
        <div className="live-count">
          <i />
          {onlineCount === null ? (
            "در حال شمارش بازیکن‌ها…"
          ) : (
            <>
              <b>{onlineCount.toLocaleString("fa-IR")}</b> نفر همین حالا در حال
              بازی‌اند
            </>
          )}
        </div>
      </section>
      <section className="game-grid">
        {playableTypes.map((type) => (
          <button
            className={`game-card ${type === "IRAN_CITY" ? "iran" : type === "COUNTRY" ? "world" : type === "SEMANTRIS" ? "semantris" : type === "LETTER_DUEL" ? "duel" : "words"}`}
            key={type}
            disabled={busy}
            onClick={() => (type === "LETTER_DUEL" ? onDuel() : onStart(type))}
          >
            <span className="game-icon">{gameMeta[type].icon}</span>
            <span className="game-copy">
              <b>{gameMeta[type].title}</b>
              <small>{gameMeta[type].description}</small>
            {type === "LETTER_DUEL" && randomDuelWaiting && <small className="duel-waiting">حریف تصادفی منتظر است</small>}
            </span>
            <span className="game-arrow">←</span>
          </button>
        ))}
      </section>
      <p className="manifesto">همه‌چیز را نده AI انجام بده.</p>
    </>
  );
}

function Play({
  game,
  setGame,
  busy,
  setBusy,
  setError,
  onNew,
  onExit,
}: {
  game: Game;
  setGame: (game: Game) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
  onNew: () => void;
  onExit: () => void;
}) {
  const meta = gameMeta[game.type];
  const isAdjectiveRain = game.type === "ADJECTIVE_RAIN";
  const isSemantris = game.type === "SEMANTRIS";
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PublicItem[]>([]);
  const [selected, setSelected] = useState<PublicItem | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [dropSeconds, setDropSeconds] = useState(10);
  const [showHelp, setShowHelp] = useState(false);
  const [semantrisPreview, setSemantrisPreview] = useState<{
    words: string[];
    targetWord: string;
    removeStartIndex: number | null;
    removeEndIndex: number | null;
    phase: "sorting" | "removing";
  } | null>(null);
  const expirySent = useRef<string | null>(null);
  const lastTickSent = useRef<string | null>(null);
  const clueInputRef = useRef<HTMLInputElement | null>(null);
  const sortedGuesses = useMemo(
    () => [...game.guesses].sort((a, b) => a.rank - b.rank),
    [game.guesses],
  );

  useEffect(() => {
    const state = game.semantris;
    if (!isSemantris || game.status !== "ACTIVE" || !state) return;
    const update = () => {
      const remaining = Math.max(
        0,
        10_000 - (Date.now() - new Date(state.lastDropAt).getTime()),
      );
      setDropSeconds(Math.ceil(remaining / 1000));
      if (
        remaining > 0 ||
        busy ||
        document.visibilityState !== "visible" ||
        lastTickSent.current === state.lastDropAt
      )
        return;
      lastTickSent.current = state.lastDropAt;
      jsonFetch<{ game: Game }>("/api/game/semantris/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      })
        .then(({ game: updated }) => {
          setGame(updated);
          telegram()?.HapticFeedback?.impactOccurred?.("light");
        })
        .catch((cause) =>
          setError(
            cause instanceof Error ? cause.message : "واژهٔ تازه اضافه نشد",
          ),
        );
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [
    busy,
    game.id,
    game.semantris,
    game.status,
    isSemantris,
    setError,
    setGame,
  ]);

  useEffect(() => {
    if (
      isAdjectiveRain ||
      query.trim().length < 1 ||
      selected?.name === query ||
      game.status !== "ACTIVE"
    ) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      jsonFetch<{ items: PublicItem[] }>(
        `/api/search?type=${game.type}&q=${encodeURIComponent(query)}`,
      )
        .then(({ items }) =>
          setSuggestions(
            items.filter(
              (item) => !game.guesses.some((guess) => guess.id === item.id),
            ),
          ),
        )
        .catch(() => setSuggestions([]));
    }, 140);
    return () => clearTimeout(timer);
  }, [query, selected, game.type, game.status, game.guesses, isAdjectiveRain]);

  const submitGuess = async () => {
    if (
      (!isAdjectiveRain && !isSemantris && !selected) ||
      ((isAdjectiveRain || isSemantris) && !query.trim()) ||
      busy
    )
      return;
    setBusy(true);
    setError("");
    try {
      const data = await jsonFetch<{
        game: Game;
        semantris?: {
          hit: boolean;
          removed: number;
          targetRank: number;
          rankedWords: string[];
          targetWord: string;
          removeStartIndex: number | null;
          removeEndIndex: number | null;
        };
      }>("/api/game/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSemantris
            ? { gameId: game.id, clue: query }
            : isAdjectiveRain
              ? { gameId: game.id, word: query }
              : { gameId: game.id, itemId: selected!.id },
        ),
      });
      setQuery("");
      setSelected(null);
      setSuggestions([]);
      if (isSemantris && data.semantris) {
        setSemantrisPreview({
          words: data.semantris.rankedWords,
          targetWord: data.semantris.targetWord,
          removeStartIndex: null,
          removeEndIndex: null,
          phase: "sorting",
        });
        await new Promise((resolve) => window.setTimeout(resolve, 850));
        if (
          data.semantris.removeStartIndex !== null &&
          data.semantris.removeEndIndex !== null
        ) {
          setSemantrisPreview({
            words: data.semantris.rankedWords,
            targetWord: data.semantris.targetWord,
            removeStartIndex: data.semantris.removeStartIndex,
            removeEndIndex: data.semantris.removeEndIndex,
            phase: "removing",
          });
          telegram()?.HapticFeedback?.notificationOccurred("success");
          await new Promise((resolve) => window.setTimeout(resolve, 650));
        } else telegram()?.HapticFeedback?.notificationOccurred("warning");
        setGame(data.game);
        setSemantrisPreview(null);
        window.requestAnimationFrame(() => clueInputRef.current?.focus());
      } else {
        setGame(data.game);
        telegram()?.HapticFeedback?.notificationOccurred(
          data.game.status === "WON" ? "success" : "warning",
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حدس ثبت نشد");
    } finally {
      setBusy(false);
    }
  };

  const surrender = async (expired = false) => {
    if (!expired) {
      const confirmed = globalThis.confirm(
        "تسلیم می‌شوی؟ پاسخ نمایش داده می‌شود و بازی تمام خواهد شد.",
      );
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      const data = await jsonFetch<{ game: Game }>("/api/game/surrender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
      setGame(data.game);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "عملیات انجام نشد");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isAdjectiveRain || game.status !== "ACTIVE") return;
    const update = () =>
      setSecondsLeft(
        Math.max(
          0,
          30 -
            Math.floor(
              (Date.now() - new Date(game.startedAt).getTime()) / 1000,
            ),
        ),
      );
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [game.id, game.startedAt, game.status, isAdjectiveRain]);

  useEffect(() => {
    if (
      !isAdjectiveRain ||
      game.status !== "ACTIVE" ||
      Date.now() - new Date(game.startedAt).getTime() < 30_000 ||
      busy ||
      expirySent.current === game.id
    )
      return;
    expirySent.current = game.id;
    surrender(true);
  }, [busy, game.id, game.status, isAdjectiveRain, secondsLeft]);

  const share = () => {
    const botUsername = TELEGRAM_BOT_USERNAME.replace(/^@/, "");
    if (!botUsername) {
      setError("لینک مینی‌اپ تلگرام تنظیم نشده است.");
      return;
    }
    const blocks = game.guesses
      .map((guess) =>
        guess.rank === 0
          ? "🎯"
          : guess.rank / game.totalItems < 0.05
            ? "🟩"
            : guess.rank / game.totalItems < 0.2
              ? "🟨"
              : guess.rank / game.totalItems < 0.5
                ? "🟧"
                : "🟥",
      )
      .map((mark, index) => {
        const guess = game.guesses[index];
        const location = game.type === "IRAN_CITY" && guess.provinceName ? `، ${guess.provinceName}` : "";
        return `${mark} ${guess.name}${location}${guess.rank ? ` (رتبهٔ ${guess.rank.toLocaleString("fa-IR")})` : " (پاسخ درست)"}`;
      });
    const targetName = game.type === "IRAN_CITY" && game.target?.provinceName ? `${game.target.name}، ${game.target.provinceName}` : game.target?.name;
    const text = `${meta.title} در Anti AI Games\n${game.guessesCount.toLocaleString("fa-IR")} حدس\n${blocks.join("\n")}\n\nپاسخ نهایی: ${game.target?.emoji || ""} ${targetName || ""}`;
    const miniAppLink = `https://t.me/${botUsername}?startapp`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(miniAppLink)}&text=${encodeURIComponent(text)}`;
    telegram()?.openTelegramLink
      ? telegram().openTelegramLink(url)
      : window.open(url, "_blank");
  };
  const help = isSemantris
    ? {
        title: "راهنمای معناتریس",
        steps: [
          "واژهٔ آبی، هدف این دور است؛ یک سرنخ مرتبط با آن بنویس.",
          "JEV همهٔ واژه‌ها را بر اساس ارتباط با سرنخ مرتب می‌کند؛ مرتبط‌ترین‌ها پایین می‌روند.",
          "هدف را وارد چهار ردیف پایین کن تا خودش و واژه‌های زیرش پاک شوند؛ نگذار فهرست به بالا برسد.",
          "واژه‌ای که روی بورد است یا قبلاً به‌عنوان سرنخ نوشته‌ای، پذیرفته نمی‌شود.",
        ],
      }
    : isAdjectiveRain
      ? {
          title: "راهنمای واژه‌جو",
          steps: [
            "واژهٔ نمایش‌داده‌شده را ببین.",
            "تا ۳۰ ثانیه، ۳ هم‌معنیِ دقیق برایش بنویس.",
            "واژه‌های پذیرفته‌شده سبز یا زرد می‌شوند؛ واژه‌های نامرتبط پذیرفته نمی‌شوند.",
          ],
        }
      : game.type === "IRAN_CITY"
        ? {
            title: "راهنمای شهرجو",
            steps: [
              "نام یک شهر ایران را تایپ و از پیشنهادها انتخاب کن.",
              "هر حدس یک رتبه می‌گیرد؛ هرچه رتبه کمتر باشد، به شهر پنهان نزدیک‌تری.",
              "رتبهٔ ۲ نزدیک‌ترین شهرِ دیگر است؛ فقط علامت ✓ یعنی پاسخ را پیدا کرده‌ای.",
            ],
          }
        : {
            title: "راهنمای کشورجو",
            steps: [
              "نام یک کشور را تایپ و از پیشنهادها انتخاب کن.",
              "هر حدس یک رتبه می‌گیرد؛ هرچه رتبه کمتر باشد، به کشور پنهان نزدیک‌تری.",
              "رتبهٔ ۲ نزدیک‌ترین کشورِ دیگر است؛ فقط علامت ✓ یعنی پاسخ را پیدا کرده‌ای.",
            ],
          };

  return (
    <section className={`play-screen ${isSemantris ? "semantris-mode" : ""}`}>
      <div className="play-heading">
        <button className="icon-button" onClick={onExit}>
          →
        </button>
        <div>
          <h1>
            <span aria-hidden="true">{meta.icon}</span> {meta.title}
          </h1>
        </div>
        <div className="play-actions">
          <button
            className="help-button"
            onClick={() => setShowHelp(true)}
            aria-label={`راهنمای ${meta.title}`}
          >
            ?
          </button>
          {isSemantris && (
            <button
              className="semantris-surrender"
              onClick={() => surrender()}
              disabled={busy}
            >
              تسلیم
            </button>
          )}
          <span
            className={`guess-count ${isAdjectiveRain && secondsLeft <= 10 ? "urgent" : ""}`}
          >
            {isAdjectiveRain
              ? `${secondsLeft.toLocaleString("fa-IR")} ثانیه`
              : `${game.guessesCount.toLocaleString("fa-IR")} حدس`}
          </span>
        </div>
      </div>
      {showHelp && (
        <div className="help-backdrop" onClick={() => setShowHelp(false)}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label={help.title}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="help-close" onClick={() => setShowHelp(false)}>
              ×
            </button>
            <span>{meta.icon}</span>
            <h2>{help.title}</h2>
            <ol>
              {help.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <button
              className="primary help-done"
              onClick={() => setShowHelp(false)}
            >
              فهمیدم
            </button>
          </div>
        </div>
      )}
      {isAdjectiveRain && game.prompt && (
        <div className="adjective-prompt">
          <span>{game.prompt.emoji}</span>
          <small>
            {game.prompt.partOfSpeech || "صفت"} · تا تمام‌شدن زمان، ۳ هم‌معنی
            دقیق بنویس
          </small>
          <strong>{game.prompt.name}</strong>
          <p>فقط هم‌معنی یا نزدیک‌معنی واقعی پذیرفته می‌شود.</p>
        </div>
      )}
      {isSemantris && game.semantris && (
        <SemantrisBoard
          dropSeconds={dropSeconds}
          state={
            semantrisPreview
              ? {
                  ...game.semantris,
                  words: semantrisPreview.words,
                  targetWord: semantrisPreview.targetWord,
                }
              : game.semantris
          }
          removingRange={
            semantrisPreview?.phase === "removing" &&
            semantrisPreview.removeStartIndex !== null &&
            semantrisPreview.removeEndIndex !== null
              ? [
                  semantrisPreview.removeStartIndex,
                  semantrisPreview.removeEndIndex,
                ]
              : null
          }
        />
      )}
      {game.status === "ACTIVE" ? (
        <div className={`search-box ${isSemantris ? "semantris-input" : ""}`}>
          <div className="search-row">
            <input
              ref={isSemantris ? clueInputRef : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submitGuess();
                }
              }}
              placeholder={meta.hint}
              autoComplete="off"
            />
            <button
              disabled={
                (!isAdjectiveRain && !isSemantris && !selected) ||
                ((isAdjectiveRain || isSemantris) && !query.trim()) ||
                busy
              }
              onClick={submitGuess}
            >
              {busy
                ? "…"
                : isSemantris
                  ? "بزن"
                  : isAdjectiveRain
                    ? "ثبت"
                    : "حدس"}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelected(item);
                    setQuery(item.name);
                    setSuggestions([]);
                  }}
                >
                  <span>
                    {item.emoji} {item.name}
                  </span>
                  {(item.provinceName || item.detail) && <small>{item.provinceName || item.detail}</small>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`finish-card ${game.status === "WON" ? "won" : "gave-up"}`}
        >
          <span className="finish-icon">
            {game.status === "WON" ? "🎯" : "🏳️"}
          </span>
          <h2>
            {isSemantris
              ? "فهرست به بالای صفحه رسید"
              : game.status === "WON"
                ? isAdjectiveRain
                  ? "سه هم‌معنی پیدا کردی!"
                  : "پیداش کردی!"
                : isAdjectiveRain
                  ? "هم‌معنی‌های دیگر:"
                  : "پاسخ این بود:"}
          </h2>
          <strong>
            {isSemantris ? (
              `${game.semantris?.score.toLocaleString("fa-IR")} امتیاز`
            ) : isAdjectiveRain ? (
              game.prompt?.examples.join(" · ")
            ) : (
              <>
                {game.target?.emoji} {game.target?.name}
                {game.type === "IRAN_CITY" && game.target?.provinceName && <small> — {game.target.provinceName}</small>}
              </>
            )}
          </strong>
          {game.type === "COUNTRY" && game.target?.description && (
            <p className="country-description">{game.target.description}</p>
          )}
          <p>
            {game.status === "WON"
              ? isAdjectiveRain
                ? `با ${game.guessesCount.toLocaleString("fa-IR")} تلاش به هدف رسیدی.`
                : `با ${game.guessesCount.toLocaleString("fa-IR")} حدس به جواب رسیدی.`
              : "بازی بعدی را از نو شروع کن."}
          </p>
          <div className="finish-actions">
            <button className="primary" onClick={onNew}>
              بازی بعدی
            </button>
            {game.status === "WON" && (
              <button className="secondary" onClick={share}>
                اشتراک نتیجه
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`guess-head ${isSemantris ? "semantris-extra" : ""}`}>
        <b>
          {isSemantris
            ? "سرنخ‌های اخیر"
            : isAdjectiveRain
              ? "واژه‌های تو"
              : "حدس‌ها"}
        </b>
        {game.status === "ACTIVE" && (
          <button onClick={() => surrender()} disabled={busy}>
            تسلیم می‌شوم
          </button>
        )}
      </div>
      {isSemantris && game.semantris ? (
        <div className="semantris-history semantris-extra">
          {game.semantris.clues.length ? (
            game.semantris.clues
              .slice()
              .reverse()
              .map((item) => (
                <div key={item.createdAt}>
                  <b>{item.word}</b>
                  <span>
                    هدف «{item.targetWord}» · رتبهٔ{" "}
                    {item.targetRank.toLocaleString("fa-IR")}{" "}
                    {item.removed
                      ? `· ${item.removed.toLocaleString("fa-IR")} پاک شد`
                      : ""}
                  </span>
                </div>
              ))
          ) : (
            <div className="empty-state">
              برای واژهٔ آبی یک سرنخ بنویس؛ JEV کل فهرست را مرتب می‌کند.
            </div>
          )}
        </div>
      ) : sortedGuesses.length === 0 ? (
        <div className="empty-state">
          <span>⌁</span>
          <p>
            {isAdjectiveRain
              ? "اولین هم‌معنی‌ای را که به ذهنت می‌رسد بنویس."
              : "اولین حدس را بزن."}
          </p>
        </div>
      ) : isAdjectiveRain ? (
        <div className="guess-list">
          {game.guesses.map((guess) => (
            <div
              className={`word-row ${guess.rank > 1 ? "direct" : guess.rank > 0 ? "accepted" : "rejected"}`}
              key={guess.id}
            >
              <b>{guess.name}{game.type === "IRAN_CITY" && guess.provinceName ? `، ${guess.provinceName}` : ""}</b>
              <span>
                {guess.rank > 1
                  ? "عالی"
                  : guess.rank > 0
                    ? "پذیرفته شد"
                    : "هم‌معنی نیست"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="guess-list">
          {sortedGuesses.map((guess) => (
            <div
              className={`guess-row ${rankColor(guess.rank, game.totalItems)}`}
              key={guess.id}
            >
              <div className="guess-name">
                <span>{guess.emoji}</span>
                <b>{guess.name}</b>
              </div>
              <div className="rank-copy">
                <small>رتبه</small>
                <strong>
                  {guess.rank === 0 ? "✓" : guess.rank.toLocaleString("fa-IR")}
                </strong>
                <span>
                  {guess.rank === 0
                    ? "پاسخ درست"
                    : `از ${(game.totalItems).toLocaleString("fa-IR")}`}
                </span>
              </div>
              <div className="rank-bar">
                <i
                  style={{
                    width: `${guess.rank === 0 ? 100 : Math.max(4, 100 - ((guess.rank - 2) / Math.max(1, game.totalItems - 2)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SemantrisBoard({
  state,
  removingRange,
  dropSeconds,
}: {
  state: NonNullable<Game["semantris"]>;
  removingRange: [number, number] | null;
  dropSeconds: number;
}) {
  const onboardingRemaining = Math.max(0, 3 - state.correctHits);
  const dangerStart = Math.max(0, state.words.length - 4);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const previousRects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const current = new Map<string, DOMRect>();
    refs.current.forEach((element, word) =>
      current.set(word, element.getBoundingClientRect()),
    );
    current.forEach((rect, word) => {
      const previous = previousRects.current.get(word);
      const element = refs.current.get(word);
      if (previous && element) {
        const dy = previous.top - rect.top;
        if (Math.abs(dy) > 1)
          element.animate(
            [
              { transform: `translateY(${dy}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" },
          );
      }
    });
    previousRects.current = current;
  }, [state.words.join("|")]);
  return (
    <div className="semantris-board">
      <div className="semantris-score">
        <span>
          امتیاز <b>{state.score.toLocaleString("fa-IR")}</b>
        </span>
        <span className="semantris-drop">
          {onboardingRemaining ? (
            <>
              ورود خودکار پس از{" "}
              <b>{onboardingRemaining.toLocaleString("fa-IR")}</b> موفقیت
            </>
          ) : (
            <>
              واژهٔ بعدی <b>{dropSeconds.toLocaleString("fa-IR")}</b> ثانیه
            </>
          )}
        </span>
        <span>{state.cleared.toLocaleString("fa-IR")} پاک‌شده</span>
      </div>
      <div className="semantris-playfield">
        <div className="semantris-list">
          {state.words.map((word, index) => (
            <div
              ref={(element) => {
                if (element) refs.current.set(word, element);
                else refs.current.delete(word);
              }}
              key={word}
              className={`semantris-word ${word === state.targetWord ? "target" : ""} ${index >= dangerStart ? "danger" : ""} ${index === dangerStart ? "danger-start" : ""} ${removingRange !== null && index >= removingRange[0] && index <= removingRange[1] ? "removing" : ""}`}
            >
              <i>{word === state.targetWord ? "▶" : ""}</i>
              <span>{word}</span>
              {index === dangerStart && <small>ناحیهٔ حذف</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaderboard() {
  const [period, setPeriod] = useState<"week" | "all">("week"),
    [mode, setMode] = useState<"effort" | "skill">("effort"),
    [type, setType] = useState<GameType>("IRAN_CITY");
  const [rows, setRows] = useState<LeaderRow[]>([]),
    [me, setMe] = useState<LeaderRow | null>(null),
    [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const isSemantris = type === "SEMANTRIS",
    isDuel = type === "LETTER_DUEL";
  useEffect(() => {
    let active = true;
    const load = () => {
      const id = ++requestId.current;
      jsonFetch<{ rows: LeaderRow[]; me: LeaderRow | null }>(
        `/api/leaderboard?period=${period}&type=${type}&mode=${mode}`,
      )
        .then((data) => {
          if (!active || id !== requestId.current) return;
          setRows(data.rows);
          setMe(data.me);
        })
        .finally(() => { if (active && id === requestId.current) setLoading(false); });
    };
    setLoading(true);
    load();
    const timer = type === "SEMANTRIS" ? window.setInterval(load, 20_000) : null;
    const onVisibility = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [period, type, mode]);
  return (
    <section>
      <div className="section-heading">
        <div>
          <small>رقابت واقعی</small>
          <h1>لیدربورد</h1>
        </div>
        <span>🏆</span>
      </div>
      <div className="leader-controls">
        <div className="leader-filter-group">
          <span className="leader-filter-label">بازی</span>
          <div className="leader-games">
            <button
              className={type === "IRAN_CITY" ? "active" : ""}
              onClick={() => setType("IRAN_CITY")}
            >
              شهرجو
            </button>
            <button
              className={type === "COUNTRY" ? "active" : ""}
              onClick={() => setType("COUNTRY")}
            >
              کشورجو
            </button>
            <button
              className={isSemantris ? "active" : ""}
              onClick={() => setType("SEMANTRIS")}
            >
              معناتریس
            </button>
            <button
              className={isDuel ? "active" : ""}
              onClick={() => setType("LETTER_DUEL")}
            >
              دوحرف
            </button>
          </div>
        </div>
        <div className="leader-filter-group">
          <span className="leader-filter-label">رتبه‌بندی</span>
          <div className="leader-toggle">
            <button
              className={mode === "effort" ? "active" : ""}
              onClick={() => setMode("effort")}
            >
              {isSemantris ? "پرامتیازترین‌ها" : "پرتلاش‌ترین‌ها"}
            </button>
            <button
              className={mode === "skill" ? "active" : ""}
              onClick={() => setMode("skill")}
            >
              ماهرترین‌ها
            </button>
          </div>
        </div>
        <div className="leader-filter-group">
          <span className="leader-filter-label">بازهٔ زمانی</span>
          <div className="leader-toggle">
            <button
              className={period === "week" ? "active" : ""}
              onClick={() => setPeriod("week")}
            >
              این هفته
            </button>
            <button
              className={period === "all" ? "active" : ""}
              onClick={() => setPeriod("all")}
            >
              همهٔ دوران
            </button>
          </div>
        </div>
      </div>
      {mode === "skill" && (
        <p className="board-note">
          {isDuel
            ? "نرخ برد = دورهای برده ÷ همهٔ دورها · حداقل ۱۰ دور"
            : isSemantris
              ? "امتیاز مهارت = بالاترین امتیاز ثبت‌شده در یک بازی."
              : "امتیاز مهارت = مجموع حدس‌های بازی‌های تمام‌شده ÷ تعداد بردها · حداقل ۳ برد"}
        </p>
      )}
      {loading ? (
        <div className="empty-state">در حال محاسبه رتبه‌ها…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          {isDuel && mode === "skill"
            ? "هنوز کسی در این بازه به ۱۰ دور نرسیده."
            : "هنوز نتیجه‌ای برای این جدول ثبت نشده."}
        </div>
      ) : (
        <div className="leader-list">
          {rows.map((row) => (
            <LeaderRowView
              key={row.userId}
              row={row}
              mode={mode}
              semantris={isSemantris}
              duel={isDuel}
            />
          ))}
        </div>
      )}
      {me && me.rank > 50 && (
        <div className="my-rank">
          <small>جایگاه تو</small>
          <LeaderRowView
            row={me}
            mode={mode}
            semantris={isSemantris}
            duel={isDuel}
          />
        </div>
      )}
    </section>
  );
}
function LeaderRowView({
  row,
  mode = "effort",
  semantris = false,
  duel = false,
}: {
  row: LeaderRow;
  mode?: "effort" | "skill";
  semantris?: boolean;
  duel?: boolean;
}) {
  const score = duel
    ? mode === "effort"
      ? row.rounds || 0
      : (row.winRate || 0) * 100
    : mode === "effort"
      ? (row.totalScore ?? row.averageGuesses)
      : (row.bestScore ?? row.averageGuesses);
  const detail = duel
    ? `${row.wins.toLocaleString("fa-IR")} برد · ${(row.losses || 0).toLocaleString("fa-IR")} باخت · ${(row.draws || 0).toLocaleString("fa-IR")} مساوی`
    : semantris
      ? mode === "effort"
        ? row.wins.toLocaleString("fa-IR") + " بازی"
        : "مجموع " + (row.totalScore || 0).toLocaleString("fa-IR") + " امتیاز"
      : mode === "skill"
        ? row.wins.toLocaleString("fa-IR") + " برد"
        : "میانگین " + row.averageGuesses.toLocaleString("fa-IR") + " حدس";
  const value = duel
    ? mode === "skill"
      ? score.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + "٪"
      : score.toLocaleString("fa-IR")
    : semantris
      ? score.toLocaleString("fa-IR")
      : mode === "skill"
        ? row.averageGuesses.toLocaleString("fa-IR")
        : row.wins.toLocaleString("fa-IR");
  return (
    <div className={`leader-row ${row.isMe ? "me" : ""}`}>
      <span className="leader-rank">
        {row.rank <= 3
          ? ["🥇", "🥈", "🥉"][row.rank - 1]
          : row.rank.toLocaleString("fa-IR")}
      </span>
      {row.photoUrl ? (
        <img src={row.photoUrl} alt="" />
      ) : (
        <span className="mini-avatar">👤</span>
      )}
      <div className="leader-name">
        <b>{row.displayName}</b>
        <small>{detail}</small>
      </div>
      <div className="leader-wins">
        <strong>{value}</strong>
        <small>
          {duel
            ? mode === "skill"
              ? "نرخ برد"
              : "دور"
            : semantris
              ? "امتیاز"
              : mode === "skill"
                ? "میانگین حدس"
                : "برد"}
        </small>
      </div>
    </div>
  );
}
function BottomNav({
  active,
  onChange,
}: {
  active: Screen;
  onChange: (screen: Screen) => void;
}) {
  return (
    <nav className="bottom-nav">
      <button
        className={active === "home" ? "active" : ""}
        onClick={() => onChange("home")}
      >
        <span>⌂</span>بازی‌ها
      </button>
      <button
        className={active === "leaderboard" ? "active" : ""}
        onClick={() => onChange("leaderboard")}
      >
        <span>♛</span>رتبه‌ها
      </button>
    </nav>
  );
}
