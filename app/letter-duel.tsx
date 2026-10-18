"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionRequest } from "@/lib/client-session";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";
type DuelUser = {
  id: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
};
type DuelState = {
  id: string;
  mode: "PRIVATE" | "RANDOM";
  status: "WAITING" | "ACTIVE" | "ENDED";
  inviteToken: string | null;
  me: DuelUser | null;
  opponent: DuelUser | null;
  myScore: number;
  opponentScore: number;
  opponentConnected: boolean;
  round: null | {
    id: string;
    number: number;
    status: "PICKING" | "ANSWERING" | "JUDGING" | "RESOLVED" | "CANCELLED";
    deadline: string | null;
    myLetterChosen: boolean;
    letters: [string, string] | null;
    winnerUserId: string | null;
    winningWord: string | null;
    lastSubmission: { word: string; status: string; reason?: string } | null;
  };
};
const LETTERS = [..."ابتثجچحخدذرزژسشصضطظعغفقکگلمنوهی"];
function telegram() {
  return (globalThis as typeof globalThis & { Telegram?: { WebApp?: any } })
    .Telegram?.WebApp;
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE_PATH + url, sessionRequest(init));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد");
  return data;
}
export default function LetterDuel({
  onExit,
  setError,
  onOpenProfile,
}: {
  onExit: () => void;
  setError: (message: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const [duel, setDuel] = useState<DuelState | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [word, setWord] = useState(""),
    [now, setNow] = useState(Date.now());
  const joined = useRef<string | null>(null);
  const post = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const data = await request<{ duel: DuelState | null }>(
        "/api/letter-duel",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        },
      );
      setDuel(data.duel);
      return data;
    },
    [],
  );
  useEffect(() => {
    let stopped = false;
    const startParam = telegram()?.initDataUnsafe?.start_param as
      string | undefined;
    const token =
      new URLSearchParams(location.search).get("duel") ||
      (startParam?.startsWith("duel_") ? startParam.slice(5) : null);
    (async () => {
      try {
        if (token && joined.current !== token) {
          joined.current = token;
          await post("join-private", { token });
          history.replaceState({}, "", location.pathname);
        } else {
          const data = await request<{ duel: DuelState | null }>(
            "/api/letter-duel",
          );
          if (!stopped) setDuel(data.duel);
        }
      } catch (error) {
        if (!stopped)
          setError(error instanceof Error ? error.message : "بازی پیدا نشد");
      } finally {
        if (!stopped) setLoading(false);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [post, setError]);
  useEffect(() => {
    if (!duel || duel.status === "ENDED") return;
    const poll = window.setInterval(
      () =>
        request<{ duel: DuelState | null }>("/api/letter-duel?id=" + duel.id)
          .then((data) => setDuel(data.duel))
          .catch(() => undefined),
      750,
    );
    const heartbeat = window.setInterval(
      () => post("heartbeat", { connectionId: duel.id }).catch(() => undefined),
      5000,
    );
    return () => {
      clearInterval(poll);
      clearInterval(heartbeat);
    };
  }, [duel?.id, duel?.status, post]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!duel?.round || duel.round.status !== "ANSWERING") setWord("");
  }, [duel?.round?.id, duel?.round?.status]);
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await post(action, extra);
    } catch (error) {
      setError(error instanceof Error ? error.message : "عملیات انجام نشد");
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    if (duel && duel.status !== "ENDED")
      await act("leave", { connectionId: duel.id });
    onExit();
  };
  const seconds = duel?.round?.deadline
    ? Math.max(
        0,
        Math.ceil((new Date(duel.round.deadline).getTime() - now) / 1000),
      )
    : 0;
  const share = () => {
    if (!duel?.inviteToken) return;
    const link = BOT_USERNAME
      ? "https://t.me/" +
        BOT_USERNAME.replace(/^@/, "") +
        "?startapp=duel_" +
        duel.inviteToken
      : location.origin +
        BASE_PATH +
        "?duel=" +
        encodeURIComponent(duel.inviteToken);
    const url =
      "https://t.me/share/url?url=" +
      encodeURIComponent(link) +
      "&text=" +
      encodeURIComponent("بیا با هم دوحرف بازی کنیم!");
    telegram()?.openTelegramLink
      ? telegram().openTelegramLink(url)
      : navigator.clipboard?.writeText(link);
  };
  if (loading)
    return (
      <section className="duel-screen">
        <div className="empty-state">در حال بازیابی دوحرف…</div>
      </section>
    );
  if (!duel)
    return (
      <section className="duel-screen">
        <Heading
          onBack={onExit}
          title="حریفت را انتخاب کن"
        />
        <div className="duel-entry">
          <button
            className="primary"
            disabled={busy}
            onClick={() => act("create-private")}
          >
            بازی با دوست
          </button>
          <small>یک لینک خصوصی بساز و برای دوستت بفرست.</small>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => act("join-random")}
          >
            حریف تصادفی
          </button>
          <small>با اولین بازیکن منتظر وصل شو.</small>
        </div>
      </section>
    );
  if (duel.status === "WAITING")
    return (
      <section className="duel-screen">
        <Heading
          onBack={leave}
          title={
            duel.mode === "PRIVATE"
              ? "منتظر دوستت هستیم"
              : "دنبال حریف می‌گردیم"
          }
        />
        <div className="duel-wait">
          <span className="duel-loader">ح‌ح</span>
          <p>
            {duel.mode === "PRIVATE"
              ? "لینک را بفرست؛ با ورود نفر دوم بازی شروع می‌شود."
              : "اولین بازیکن آزاد به تو وصل می‌شود."}
          </p>
          {duel.mode === "PRIVATE" && (
            <button className="primary" onClick={share}>
              اشتراک لینک دعوت
            </button>
          )}
          <button className="secondary" onClick={leave}>
            لغو
          </button>
        </div>
      </section>
    );
  if (duel.status === "ENDED")
    return (
      <section className="duel-screen">
        <Heading onBack={onExit} title="بازی تمام شد" />
        <div className="duel-result draw">
          <h2>اتصال بازی بسته شد</h2>
          <p>می‌توانی با همین دوست یا یک حریف تازه دوباره بازی کنی.</p>
          <button className="primary" onClick={onExit}>
            بازگشت
          </button>
        </div>
      </section>
    );
  const round = duel.round,
    result = round?.status === "RESOLVED",
    won = result && round.winnerUserId === duel.me?.id;
  const submit = () => {
    if (!word.trim() || !duel) return;
    act("submit-word", { connectionId: duel.id, word });
    setWord("");
  };
  return (
    <section className="duel-screen">
      <div className="play-heading">
        <button className="icon-button" onClick={leave}>
          →
        </button>
        <div>
          <small>دور {(round?.number || 0).toLocaleString("fa-IR")}</small>
          <h1>دوحرف</h1>
        </div>
        <button className="duel-leave" onClick={leave}>
          تسلیم
        </button>
      </div>
      <div className="duel-score">
        <DuelPlayer
          user={duel.me}
          score={duel.myScore}
          onOpenProfile={onOpenProfile}
        />
        <b>—</b>
        <DuelPlayer
          user={duel.opponent}
          score={duel.opponentScore}
          disconnected={!duel.opponentConnected}
          onOpenProfile={onOpenProfile}
        />
      </div>
      {!duel.opponentConnected && (
        <div className="duel-disconnected">
          ارتباط حریف قطع شده؛ ۳۰ ثانیه برای بازگشت فرصت دارد.
        </div>
      )}
      {round?.status === "PICKING" && (
        <>
          <div className="duel-stage">
            <small>{seconds.toLocaleString("fa-IR")} ثانیه</small>
            <h2>
              {round.myLetterChosen ? "منتظر انتخاب حریف…" : "یک حرف انتخاب کن"}
            </h2>
            <p>انتخاب تو تا پایان مرحله مخفی می‌ماند.</p>
          </div>
          <div className="letter-grid">
            {LETTERS.map((letter) => (
              <button
                disabled={busy || round.myLetterChosen}
                onClick={() =>
                  act("choose-letter", { connectionId: duel.id, letter })
                }
                key={letter}
              >
                {letter}
              </button>
            ))}
          </div>
        </>
      )}
      {round && ["ANSWERING", "JUDGING"].includes(round.status) && (
        <>
          <div className="duel-stage">
            <small>
              {round.status === "JUDGING"
                ? "در حال داوری"
                : seconds.toLocaleString("fa-IR") + " ثانیه"}
            </small>
            <div className="duel-letters">
              <b>{round.letters?.[0]}</b>
              <b>{round.letters?.[1]}</b>
            </div>
            <p>
              {round.letters?.[0] === round.letters?.[1]
                ? "این حرف باید دو بار در واژه باشد."
                : "واژه‌ای بساز که هر دو حرف را داشته باشد."}
            </p>
          </div>
          <div className="search-box">
            <div className="search-row">
              <input
                value={word}
                onChange={(event) => setWord(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                placeholder="یک واژهٔ فارسی…"
                disabled={round.status === "JUDGING"}
              />
              <button
                disabled={busy || !word.trim() || round.status === "JUDGING"}
                onClick={submit}
              >
                {busy ? "…" : "ثبت"}
              </button>
            </div>
          </div>
          {round.lastSubmission && (
            <div
              className={
                "duel-verdict " + round.lastSubmission.status.toLowerCase()
              }
            >
              <b>{round.lastSubmission.word}</b>
              <span>{round.lastSubmission.reason || "در حال بررسی…"}</span>
            </div>
          )}
        </>
      )}
      {result && (
        <div
          className={
            "duel-result " +
            (won ? "won" : round.winnerUserId ? "lost" : "draw")
          }
        >
          <span>{won ? "🏆" : round.winnerUserId ? "◌" : "🤝"}</span>
          <h2>
            {won
              ? "این دور را بردی!"
              : round.winnerUserId
                ? "این دور را حریف برد"
                : "این دور مساوی شد"}
          </h2>
          {round.winningWord && <strong>{round.winningWord}</strong>}
          <p>دور بعدی تا چند لحظهٔ دیگر شروع می‌شود…</p>
        </div>
      )}
    </section>
  );
}
function Heading({
  onBack,
  title,
}: {
  onBack: () => void;
  title: string;
}) {
  return (
    <div className="play-heading">
      <button className="icon-button" onClick={onBack}>
        →
      </button>
      <div>
        <h1>{title}</h1>
      </div>
    </div>
  );
}
function DuelPlayer({
  user,
  score,
  disconnected = false,
  onOpenProfile,
}: {
  user: DuelUser | null;
  score: number;
  disconnected?: boolean;
  onOpenProfile: (userId: string) => void;
}) {
  return (
    <div className={disconnected ? "offline" : ""}>
      {user ? (
        <button
          className="duel-profile-trigger"
          onClick={() => onOpenProfile(user.id)}
          aria-label={`نمایش پروفایل ${user.name}`}
        >
          {user.photoUrl ? <img src={user.photoUrl} alt="" /> : <span>👤</span>}
          <b>{user.name}</b>
          {user.username && <small>@{user.username}</small>}
        </button>
      ) : (
        <><span>👤</span><b>منتظر…</b></>
      )}
      <strong>{score.toLocaleString("fa-IR")}</strong>
    </div>
  );
}
