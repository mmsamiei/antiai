"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionRequest } from "@/lib/client-session";
import { useOnlineUsers } from "@/lib/use-online-users";
import OnlineAvatar from "./online-avatar";
import { avatarImageUrl } from "@/lib/avatar-url";
import { useBackHandler } from "./back-navigation";
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
  targetWins: number;
  matchWinnerUserId: string | null;
  endReason: string | null;
  rematchConnectionId: string | null;
  myRematchPending: boolean;
  opponentRematchPending: boolean;
  inviteToken: string | null;
  directInvite: { id: string; reason: string | null; startDeadline: string | null } | null;
  me: DuelUser | null;
  opponent: DuelUser | null;
  myScore: number;
  opponentScore: number;
  opponentConnected: boolean;
  reconnectDeadline: string | null;
  serverNow: string;
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
  connectionId,
  registerLeave,
  setError,
  onOpenProfile,
}: {
  onExit: () => void;
  connectionId?: string | null;
  registerLeave?: (handler: (() => Promise<void>) | null) => void;
  setError: (message: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const [duel, setDuel] = useState<DuelState | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [word, setWord] = useState(""),
    [now, setNow] = useState(Date.now());
  const joined = useRef<string | null>(null);
  const serverOffset = useRef(0);
  const onlineIds = useOnlineUsers([duel?.me?.id, duel?.opponent?.id]);
  const applyDuel = useCallback(async (next: DuelState | null) => {
    // A rematch is a fresh room; both participants follow the server-owned link.
    const visited = new Set<string>();
    while (next?.rematchConnectionId && !visited.has(next.id)) {
      visited.add(next.id);
      const data: { duel: DuelState | null } = await request("/api/letter-duel?id=" + encodeURIComponent(next.rematchConnectionId));
      next = data.duel;
    }
    if (next?.serverNow) serverOffset.current = new Date(next.serverNow).getTime() - Date.now();
    setDuel(next);
  }, []);
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
      await applyDuel(data.duel);
      return data;
    },
    [applyDuel],
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
        if (connectionId) {
          const data = await request<{ duel: DuelState | null }>("/api/letter-duel?id=" + encodeURIComponent(connectionId));
          if (!stopped) await applyDuel(data.duel);
        } else if (token && joined.current !== token) {
          joined.current = token;
          await post("join-private", { token });
          history.replaceState({}, "", location.pathname);
        } else {
          const data = await request<{ duel: DuelState | null }>(
            "/api/letter-duel",
          );
          if (!stopped) await applyDuel(data.duel);
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
  }, [connectionId, post, setError]);
  useEffect(() => {
    if (!duel?.directInvite || duel.status !== "WAITING") return;
    let stopped = false;
    const ready = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await request("/api/duel-invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ready", id: duel.directInvite!.id }) });
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "شروع بازی انجام نشد"); }
    };
    void ready();
    const retry = window.setInterval(ready, 3000);
    document.addEventListener("visibilitychange", ready);
    return () => { stopped = true; clearInterval(retry); document.removeEventListener("visibilitychange", ready); };
  }, [duel?.directInvite?.id, duel?.status]);
  useEffect(() => {
    if (!duel) return;
    let stopped = false;
    let polling = false;
    const poll = async () => {
      if (polling || document.visibilityState !== "visible") return;
      polling = true;
      try {
        const data = await request<{ duel: DuelState | null }>("/api/letter-duel?id=" + encodeURIComponent(duel.id));
        if (!stopped) await applyDuel(data.duel);
      } catch {} finally { polling = false; }
    };
    const heartbeat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await request<{ duel: DuelState | null }>("/api/letter-duel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "heartbeat", connectionId: duel.id }) });
        if (!stopped) await applyDuel(data.duel);
      } catch {}
    };
    void heartbeat();
    const pollTimer = window.setInterval(poll, duel.status === "ENDED" ? 2000 : 750);
    const heartbeatTimer = window.setInterval(heartbeat, 5000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [duel?.id, duel?.status, applyDuel]);

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
    if (duel?.status === "ACTIVE" && !window.confirm("با خروج، مسابقه را به حریف واگذار می‌کنی. خارج می‌شوی؟")) return;
    try {
      if (duel && duel.status !== "ENDED") await post("leave", { connectionId: duel.id });
      if (duel?.status === "ENDED" && duel.myRematchPending) await post("cancel-rematch", { connectionId: duel.id });
      onExit();
    } catch (error) { setError(error instanceof Error ? error.message : "خروج انجام نشد"); }
  };
  useEffect(() => {
    // Callers already ask for confirmation before switching multiplayer games.
    registerLeave?.(async () => {
      if (duel && duel.status !== "ENDED") await post("leave", { connectionId: duel.id });
      if (duel?.status === "ENDED" && duel.myRematchPending) await post("cancel-rematch", { connectionId: duel.id });
      onExit();
    });
    return () => registerLeave?.(null);
  });
  useBackHandler(leave);
  const seconds = duel?.round?.deadline
    ? Math.max(
        0,
        Math.ceil((new Date(duel.round.deadline).getTime() - now - serverOffset.current) / 1000),
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
          <small>یک لینک خصوصی بساز و برای دوستت بفرست. اولین نفر با ۱۰ برد، برندهٔ مسابقه است.</small>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => act("join-random")}
          >
            حریف تصادفی
          </button>
          <small>با اولین بازیکن منتظر وصل شو؛ مسابقه تا ۱۰ برد ادامه دارد.</small>
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
            {duel.directInvite ? "منتظر ورود هر دو بازیکن هستیم؛ بازی تا چند ثانیه دیگر شروع می‌شود." : duel.mode === "PRIVATE"
              ? "لینک را بفرست؛ با ورود نفر دوم بازی شروع می‌شود."
              : "اولین بازیکن آزاد به تو وصل می‌شود."}
          </p>
          {duel.mode === "PRIVATE" && !duel.directInvite && (
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
  if (duel.status === "ENDED") {
    const wonMatch = duel.matchWinnerUserId === duel.me?.id;
    const reason = duel.endReason === "TEN_WINS" ? "مسابقه با رسیدن به ۱۰ برد پایان یافت."
      : duel.endReason === "FORFEIT" ? (wonMatch ? "حریف مسابقه را واگذار کرد." : "مسابقه را به حریف واگذار کردی.")
      : duel.endReason === "DISCONNECTED" ? "مهلت ۳۰ ثانیه‌ای بازگشت به بازی تمام شد."
      : duel.directInvite?.reason || "شروع مسابقه لغو شد.";
    return (
      <section className="duel-screen">
        <Heading onBack={leave} title="نتیجهٔ مسابقه" />
        <div className={"duel-result " + (duel.matchWinnerUserId ? wonMatch ? "won" : "lost" : "draw")}>
          <span>{duel.matchWinnerUserId ? wonMatch ? "🏆" : "◌" : "🤝"}</span>
          <h2>{duel.matchWinnerUserId ? wonMatch ? "مسابقه را بردی!" : "حریف برندهٔ مسابقه شد" : "مسابقه پایان یافت"}</h2>
          <p>{reason}</p>
          {duel.endReason === "TEN_WINS" && duel.round?.winningWord && <p>واژهٔ دور پایانی: <strong>{duel.round.winningWord}</strong></p>}
          <div className="duel-score">
            <DuelPlayer user={duel.me} score={duel.myScore} online={Boolean(duel.me && onlineIds.has(duel.me.id))} onOpenProfile={onOpenProfile} />
            <b>—</b>
            <DuelPlayer user={duel.opponent} score={duel.opponentScore} online={Boolean(duel.opponent && onlineIds.has(duel.opponent.id))} onOpenProfile={onOpenProfile} />
          </div>
          <p>تعداد بردهای دورها؛ واگذاری امتیاز دورها را تغییر نمی‌دهد.</p>
          {duel.opponent && <div className="duel-rematch">
            {duel.opponentRematchPending && !duel.myRematchPending && <p>حریفت درخواست یک مسابقهٔ دیگر داده است.</p>}
            <button className="primary" disabled={busy || duel.myRematchPending} onClick={() => act("rematch", { connectionId: duel.id })}>
              {duel.myRematchPending ? "منتظر موافقت حریف…" : duel.opponentRematchPending ? "قبول و شروع مسابقهٔ جدید" : "بازی مجدد با همین حریف"}
            </button>
            {duel.myRematchPending && <><small>درخواست تا ۶۰ ثانیه معتبر است؛ برای شروع هر دو باید اینجا باشید.</small><button className="secondary" disabled={busy} onClick={() => act("cancel-rematch", { connectionId: duel.id })}>لغو درخواست</button></>}
          </div>}
          <button className="secondary" disabled={busy} onClick={async () => {
            try {
              if (duel.myRematchPending) {
                const data = await post("cancel-rematch", { connectionId: duel.id });
                if (data.duel && data.duel.status !== "ENDED") return;
              }
              setDuel(null);
            } catch (error) { setError(error instanceof Error ? error.message : "لغو درخواست انجام نشد"); }
          }}>انتخاب حریف تازه</button>
          <button className="secondary" onClick={leave}>بازگشت</button>
        </div>
      </section>
    );
  }
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
      <p className="duel-match-goal">اولین نفر با {duel.targetWins.toLocaleString("fa-IR")} برد، برندهٔ مسابقه است</p>
      <div className="duel-score">
        <DuelPlayer
          user={duel.me}
          score={duel.myScore}
          online={Boolean(duel.me && onlineIds.has(duel.me.id))}
          onOpenProfile={onOpenProfile}
        />
        <b>—</b>
        <DuelPlayer
          user={duel.opponent}
          score={duel.opponentScore}
          disconnected={!duel.opponentConnected}
          online={Boolean(duel.opponent && onlineIds.has(duel.opponent.id))}
          onOpenProfile={onOpenProfile}
        />
      </div>
      {!duel.opponentConnected && (
        <div className="duel-disconnected">
          ارتباط حریف قطع شده؛ {Math.max(0, Math.ceil(((duel.reconnectDeadline ? new Date(duel.reconnectDeadline).getTime() : now) - now - serverOffset.current) / 1000)).toLocaleString("fa-IR")} ثانیه برای بازگشت فرصت دارد.
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
  online = false,
  onOpenProfile,
}: {
  user: DuelUser | null;
  score: number;
  disconnected?: boolean;
  online?: boolean;
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
          <OnlineAvatar online={online} className="duel-online-avatar">
            {user.photoUrl ? <img src={avatarImageUrl(user.id, user.photoUrl) || ""} alt="" /> : <span>👤</span>}
          </OnlineAvatar>
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
