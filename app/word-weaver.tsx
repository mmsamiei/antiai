"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { remainingWordWeaverSeconds, sampleWordWeaverClock, type WordWeaverClock } from "@/lib/word-weaver-clock";
import { sessionRequest } from "@/lib/client-session";
import { useOnlineUsers } from "@/lib/use-online-users";
import OnlineAvatar from "./online-avatar";
import { avatarImageUrl } from "@/lib/avatar-url";
import { useBackHandler } from "./back-navigation";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
type Actor = { id: string; displayName: string; photoUrl: string | null; isBot: boolean };
type EntryStatus = "PENDING" | "SCORED" | "FAILED";
type Result = {
  id: string; text: string; status: EntryStatus; failureMessage: string | null;
  relevanceScore: number | null; originalityScore: number | null; expressionScore: number | null;
  feedback: string | null;
  score: number | null; rank: number | null; isWinner: boolean; isMe: boolean;
  user: Actor;
};
type RoomState = {
  serverNow: string; playersCount: number; onboardingRequired: boolean;
  round: null | {
    id: string; number: number; status: "WRITING" | "JUDGING" | "RESULTS" | "CLOSED";
    word: string; missionId: string | null; missionType: string | null; missionTitle: string; missionPrompt: string; missionHint: string;
    writeDeadline: string; revealUntil: string | null; entryCount: number;
    submittedEntries: { id: string; text: string; user: Result["user"] }[];
    judgedCount: number; isSolo: boolean; myEntry: { text: string; status: EntryStatus } | null;
  };
  latestResult: null | {
    id: string; number: number; word: string; missionId: string | null; missionType: string | null; missionTitle: string; missionPrompt: string;
    winner: Actor | null;
  };
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE_PATH + url, sessionRequest(init));
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "ارتباط با اتاق برقرار نشد");
  return payload as T;
}

function Avatar({ userId, photoUrl, isBot = false, online = false }: { userId: string; photoUrl: string | null; isBot?: boolean; online?: boolean }) {
  return <OnlineAvatar online={online && !isBot}>
    {photoUrl ? <img className="word-weaver-avatar" src={avatarImageUrl(userId, photoUrl) || ""} alt="" /> : <span className="word-weaver-avatar word-weaver-avatar-fallback">{isBot ? "✦" : "👤"}</span>}
  </OnlineAvatar>;
}

function Player({ actor, onOpenProfile, own = false, online = false }: { actor: Actor; onOpenProfile: (id: string) => void; own?: boolean; online?: boolean }) {
  const content = <><Avatar userId={actor.id} photoUrl={actor.photoUrl} isBot={actor.isBot} online={online}/><b>{actor.displayName}</b>{actor.isBot && <small className="word-weaver-bot-badge">بات</small>}{own && <small>نوشتهٔ تو</small>}</>;
  return actor.isBot
    ? <div className="word-weaver-player" title="نویسندهٔ هوش مصنوعی، با الهام از سبک نویسنده">{content}</div>
    : <button className="word-weaver-player" onClick={() => onOpenProfile(actor.id)}>{content}</button>;
}

export default function WordWeaver({
  user, onExit, onOpenProfile, setError, registerLeave,
}: {
  user: { id: string | number; photo_url?: string; photoUrl?: string; first_name?: string; firstName?: string };
  registerLeave?: (handler: (() => Promise<void>) | null) => void;
  onExit: () => void; onOpenProfile: (userId: string) => void; setError: (message: string) => void;
}) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [text, setText] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loadedResultId, setLoadedResultId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpSaving, setHelpSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [clientNow, setClientNow] = useState(0);
  const stopped = useRef(false);
  const clientId = useRef("");
  const serverClock = useRef<WordWeaverClock | null>(null);
  const clockPhase = useRef("");
  const resyncClock = useRef(false);
  const lastServerTime = useRef(0);
  const onboardingDone = useRef(false);
  const activeRoundId = room?.round?.id || null;
  const resultRoundId = room?.latestResult?.id || null;

  const acceptRoom = useCallback((state: RoomState) => {
    if (stopped.current || Date.parse(state.serverNow) < lastServerTime.current) return;
    lastServerTime.current = Date.parse(state.serverNow);
    if (!state.onboardingRequired) onboardingDone.current = true;
    else if (!onboardingDone.current) setShowHelp(true);
    const phase = `${state.round?.id}:${state.round?.status}:${state.round?.writeDeadline}:${state.round?.revealUntil}`;
    const receivedAt = performance.now();
    // Polling updates room data without resetting a running countdown.
    if (!serverClock.current || resyncClock.current || clockPhase.current !== phase) {
      serverClock.current = sampleWordWeaverClock(state.serverNow, receivedAt);
      clockPhase.current = phase;
      resyncClock.current = false;
    }
    setClientNow(receivedAt);
    setRoom(state);
  }, []);
  const refresh = useCallback(async () => {
    const state = await request<RoomState>("/api/word-weaver");
    acceptRoom(state);
  }, [acceptRoom]);
  const post = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    return request<RoomState | { ok: true } | { word: string } | { entry: { text: string; status: EntryStatus } }>("/api/word-weaver", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
  }, []);

  useEffect(() => {
    stopped.current = false;
    clientId.current = window.crypto.randomUUID();
    void post("join", { clientId: clientId.current }).then((state) => {
      if ("serverNow" in state) acceptRoom(state);
    }).catch((cause) => {
      if (!stopped.current) setError(cause instanceof Error ? cause.message : "ورود به اتاق انجام نشد");
    });
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(() => undefined);
    }, 2_000);
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") void post("heartbeat", { clientId: clientId.current }).catch(() => undefined);
    }, 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        resyncClock.current = true;
        setClientNow(performance.now());
        void post("heartbeat", { clientId: clientId.current }).then((state) => {
          if ("serverNow" in state) acceptRoom(state);
        }).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const clock = window.setInterval(() => setClientNow(performance.now()), 200);
    return () => {
      stopped.current = true;
      window.clearInterval(poll); window.clearInterval(heartbeat); window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
      void post("leave", { clientId: clientId.current }).catch(() => undefined);
    };
  }, [post, refresh, setError, acceptRoom]);

  useEffect(() => {
    if (activeRoundId && room?.round?.myEntry) setText(room.round.myEntry.text);
    if (activeRoundId && room?.round?.status === "WRITING" && !room.round.myEntry) setText("");
  }, [activeRoundId, room?.round?.myEntry?.text, room?.round?.status]);

  useEffect(() => {
    setResults([]); setLoadedResultId(null);
    if (!resultRoundId) return;
    let cancelled = false;
    void request<{ results: Result[] }>("/api/word-weaver/results?round=" + encodeURIComponent(resultRoundId))
      .then((data) => { if (!cancelled) { setResults(data.results); setLoadedResultId(resultRoundId); } })
      .catch(() => { if (!cancelled) setResults([]); });
    return () => { cancelled = true; };
  }, [resultRoundId]);

  const saveEntry = async () => {
    if (busy || !text.trim() || room?.round?.myEntry) return;
    setBusy(true); setLocalError("");
    try {
      const data = await post("submit", { text });
      if ("entry" in data && !stopped.current) setRoom((current) => current?.round?.id === activeRoundId ? { ...current, round: { ...current.round, myEntry: data.entry } } : current);
      await refresh();
    }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : "ذخیرهٔ نوشته انجام نشد"); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    setBusy(true);
    try { await post("leave", { clientId: clientId.current }); } catch { /* presence expires when the request cannot reach the server */ }
    onExit();
  };
  useEffect(() => {
    registerLeave?.(async () => { await post("leave", { clientId: clientId.current }); onExit(); });
    return () => registerLeave?.(null);
  });
  const closeHelp = async () => {
    if (helpSaving) return;
    setHelpSaving(true);
    try {
      await request("/api/word-weaver/onboarding", { method: "POST" });
      onboardingDone.current = true;
      setShowHelp(false);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : "ذخیرهٔ راهنما انجام نشد");
    } finally {
      setHelpSaving(false);
    }
  };
  const writeSeconds = remainingWordWeaverSeconds(room?.round?.writeDeadline || null, serverClock.current, clientNow);
  useBackHandler(showHelp ? closeHelp : leave, true, showHelp ? 30 : 10);
  const resultSeconds = remainingWordWeaverSeconds(room?.round?.revealUntil || null, serverClock.current, clientNow);
  const joinedName = useMemo(() => user.first_name || user.firstName || "پروفایل من", [user.firstName, user.first_name]);
  const onlineIds = useOnlineUsers([
    String(user.id),
    ...(room?.round?.submittedEntries.map((entry) => entry.user.isBot ? null : entry.user.id) || []),
    room?.latestResult?.winner?.isBot ? null : room?.latestResult?.winner?.id,
    ...results.map((result) => result.user.isBot ? null : result.user.id)
  ]);

  return (
    <section className="word-weaver-screen" dir="rtl">
      <div className="word-weaver-heading">
        <button className="icon-button" onClick={leave} aria-label="بازگشت">→</button>
        <div><small>اتاق عمومی · {room?.playersCount?.toLocaleString("fa-IR") || "۰"} نفر حاضر</small><h1>واژه‌باف</h1></div>
        <div className="word-weaver-heading-actions">
          <button className="word-weaver-help-button" onClick={() => setShowHelp(true)} aria-label="راهنمای واژه‌باف">?</button>
          <button className="word-weaver-own-profile" onClick={() => onOpenProfile(String(user.id))} aria-label={"پروفایل " + joinedName}><Avatar userId={String(user.id)} photoUrl={user.photo_url || user.photoUrl || null} online={onlineIds.has(String(user.id))} /></button>
        </div>
      </div>

      {showHelp && <div className="help-backdrop" onClick={() => void closeHelp()}>
        <div className="help-modal" role="dialog" aria-modal="true" aria-labelledby="word-weaver-help-title" dir="rtl" onClick={(event) => event.stopPropagation()}>
          <button className="help-close" onClick={() => void closeHelp()} aria-label="بستن راهنما" disabled={helpSaving}>×</button>
          <span>✍️</span>
          <h2 id="word-weaver-help-title">راهنمای واژه‌باف</h2>
          <ol>
            <li>در هر دور، یک واژه و یک مأموریت نوشتن می‌بینی؛ جواب کوتاه و خلاقانه بنویس.</li>
            <li>برای ثبت پاسخ ۳۰ ثانیه فرصت داری و می‌توانی حداکثر ۲۰۰ نویسه بنویسی.</li>
            <li>پاسخ را نهایی ثبت کن؛ بعد از پایان دور برای همه آشکار می‌شود و قابل ویرایش نیست.</li>
            <li>بات‌ها هم در دور می‌نویسند. با ثبت پاسخ همهٔ حاضران، داوری زودتر شروع می‌شود.</li>
            <li>JEV پاسخ‌ها را از نظر اجرای مأموریت، تازگی و دقت معنا می‌سنجد؛ نتیجه و رتبه پس از داوری نمایش داده می‌شود.</li>
          </ol>
          <button className="primary help-done" onClick={() => void closeHelp()} disabled={helpSaving}>{helpSaving ? "…" : "شروع کنیم"}</button>
        </div>
      </div>}

      <p className="word-weaver-bot-intro">دو بات با الهام از جلال آل‌احمد و آلبر کامو، کنار شما می‌نویسند.</p>

      {!room ? <div className="empty-state">داریم وارد اتاق می‌شویم…</div> : room.round?.status === "WRITING" ? (
        <div className="word-weaver-card">
          <div className="word-weaver-roundline"><span>دور {room.round.number.toLocaleString("fa-IR")}</span><b className={writeSeconds <= 5 ? "urgent" : ""}>{writeSeconds.toLocaleString("fa-IR")} ثانیه</b></div>
          <p className="word-weaver-prompt">{room.round.missionTitle}</p><h2 className="word-weaver-mission-prompt">{room.round.missionPrompt}</h2>
          <p className="word-weaver-hint">{room.round.missionHint} پاسخ کوتاه و دقیق کافی است.</p>
          <textarea dir="rtl" disabled={busy || !!room.round.myEntry || writeSeconds === 0} maxLength={200} value={text} onChange={(event) => setText(event.target.value)} placeholder="پاسخت را کوتاه و خودمانی بنویس…" aria-label="پاسخ این دور" />
          <div className="word-weaver-formline"><small>پاسخ تا ۲۰۰ نویسه</small><button className="primary" disabled={busy || !!room.round.myEntry || writeSeconds === 0 || !text.trim()} onClick={saveEntry}>{busy ? "در حال ثبت…" : room.round.myEntry ? "ثبت شد ✓" : "ثبت نهایی پاسخ"}</button></div>
          <small className="word-weaver-save-state">{room.round.myEntry ? "پاسخت قطعی ثبت شد؛ بعد از پایان زمان، پاسخ‌ها آشکار می‌شوند." : "پاسخ دیگران پس از بسته‌شدن دور نمایش داده می‌شود؛ پاسخ ثبت‌شده قابل ویرایش نیست."}</small>
          <small className="word-weaver-count">{room.round.entryCount.toLocaleString("fa-IR")} نفر ثبت کرده‌اند؛ با ثبت همه، داوری زودتر شروع می‌شود.</small>
        </div>
      ) : room.round?.status === "JUDGING" ? (
        <div className="word-weaver-card word-weaver-judging"><span className="word-weaver-loader">✦</span><p>داوری دور {room.round.number.toLocaleString("fa-IR")} شروع شده</p><small>{room.round.missionTitle}</small><h2>{room.round.missionPrompt}</h2><small>{room.round.judgedCount.toLocaleString("fa-IR")} از {room.round.entryCount.toLocaleString("fa-IR")} پاسخ بررسی شده</small><div className="word-weaver-progress"><i style={{ width: (room.round.entryCount ? room.round.judgedCount / room.round.entryCount * 100 : 0) + "%" }} /></div></div>
      ) : room.round?.status === "RESULTS" ? (
        <div className="word-weaver-card word-weaver-next">
          <div className="word-weaver-roundline"><span>نتیجهٔ دور {room.round.number.toLocaleString("fa-IR")}</span><b>{resultSeconds.toLocaleString("fa-IR")} ثانیه</b></div>
          <h2>{room.latestResult?.winner ? `${room.latestResult.winner.displayName} برنده شد!` : "این دور برنده نداشت"}{room.latestResult?.winner?.isBot && <small className="word-weaver-bot-badge">بات</small>}</h2>
        </div>
      ) : <div className="word-weaver-card"><span className="word-weaver-loader">✦</span><h2>اتاق فعلاً خلوت است</h2><p>با ورود تو، دور بعد با یک تمرین تصادفی شروع می‌شود.</p></div>}

      {room?.round && ["WRITING", "JUDGING"].includes(room.round.status) && (
        <section className="word-weaver-results" aria-label="نوشته‌های این دور">
          <h2 className="word-weaver-feed-title">ثبت پاسخ‌ها</h2>
          {room.round.submittedEntries.length ? <div className="word-weaver-result-list">{room.round.submittedEntries.map((entry) => (
            <article className="word-weaver-result word-weaver-live-entry" key={entry.id}>
              <Player actor={entry.user} onOpenProfile={onOpenProfile} own={entry.user.id === String(user.id)} online={onlineIds.has(entry.user.id)}/>
              <p>{entry.text}</p>
            </article>
          ))}</div> : <div className="empty-state">هنوز کسی پاسخش را ثبت نکرده است.</div>}
        </section>
      )}

      {room?.latestResult && (
        <section className="word-weaver-results">
          <div className="word-weaver-results-heading"><div><small>{room.latestResult.missionTitle} · سه پاسخ برتر و پاسخ تو</small><h2>{room.latestResult.missionPrompt}</h2></div>{room.latestResult.winner ? <button className="word-weaver-winner" disabled={room.latestResult.winner.isBot} onClick={() => onOpenProfile(room.latestResult!.winner!.id)}><Avatar userId={room.latestResult.winner.id} photoUrl={room.latestResult.winner.photoUrl} isBot={room.latestResult.winner.isBot} online={onlineIds.has(room.latestResult.winner.id)}/><span><small>{room.latestResult.winner.isBot ? "برنده · بات" : "برنده"}</small><b>{room.latestResult.winner.displayName}</b></span></button> : <span className="word-weaver-no-winner">این دور برنده نداشت</span>}</div>
          {loadedResultId === resultRoundId && results.length ? <div className="word-weaver-result-list">{results.map((result) => <article className={"word-weaver-result " + (result.isWinner ? "is-winner" : "")} key={result.id}>
            <div className="word-weaver-result-top"><Player actor={result.user} onOpenProfile={onOpenProfile} online={onlineIds.has(result.user.id)}/>{result.score === null ? <span className="word-weaver-failed">{result.failureMessage || "داوری انجام نشد"}</span> : <strong>{result.score.toLocaleString("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>}</div>
            <p>{result.text}</p>{result.score !== null && <div className="word-weaver-metrics"><span>اجرای مأموریت <b>{result.relevanceScore?.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}</b></span><span>تازگی <b>{result.originalityScore?.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}</b></span><span>دقت معنا <b>{result.expressionScore?.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}</b></span></div>}{result.isMe && result.feedback && <small className="word-weaver-feedback">{result.feedback}</small>}
            <small aria-label="رتبه" className="word-weaver-rank">{result.rank === null ? "—" : result.rank.toLocaleString("fa-IR")}</small>{result.isMe && <small className="word-weaver-mine-label">نوشتهٔ تو</small>}
          </article>)}</div> : <div className="empty-state">{loadedResultId === resultRoundId ? "این دور نوشته‌ای برای نمایش ندارد." : "در حال دریافت نتیجه‌ها…"}</div>}

        </section>
      )}
      {localError && <button className="word-weaver-inline-error" onClick={() => setLocalError("")}>{localError} ×</button>}
    </section>
  );
}
