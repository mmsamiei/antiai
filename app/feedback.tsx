"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionRequest } from "@/lib/client-session";
import { feedbackKinds, feedbackStatuses, FEEDBACK_POINTS } from "@/lib/feedback-config";
import { avatarImageUrl } from "@/lib/avatar-url";
import { useBackHandler } from "./back-navigation";
import OnlineAvatar from "./online-avatar";
import { useOnlineUsers } from "@/lib/use-online-users";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
type View = "home" | "new" | "mine" | "leaderboard" | "review";
type Status = keyof typeof feedbackStatuses;
type Kind = keyof typeof feedbackKinds;
type Item = { id: string; kind: Kind; title: string; body: string; status: Status; reply: string | null; points: number; createdAt: string; user?: { name: string } };
type Row = { userId: string; name: string; username: string | null; photoUrl: string | null; rank: number; accepted: number; points: number };
type Data = { canReview: boolean; items?: Item[]; rows?: Row[]; hasMore: boolean; me?: { rank: number; points: number } | null };
type Draft = { requestId: string; kind: Kind; title: string; body: string };
const freshDraft = (): Draft => ({ requestId: crypto.randomUUID(), kind: "SUGGESTION", title: "", body: "" });
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(base + path, sessionRequest(init));
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "ارتباط با نظرجو برقرار نشد.");
  return data;
}
export default function Feedback({ userId, onBack, onOpenProfile, setError }: { userId: string; onBack: () => void; onOpenProfile: (id: string) => void; setError: (s: string) => void }) {
  const [view, setView] = useState<View>("home");
  const [page, setPage] = useState(1), [filter, setFilter] = useState<Status>("PENDING");
  const [data, setData] = useState<Data | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const onlineIds = useOnlineUsers(data?.rows?.map(row => row.userId) || []);
  const [draft, setDraft] = useState<Draft | null>(null), [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const draftKey = `antiai-feedback-draft:${userId}`;
  useEffect(() => {
    let restored: Draft | null = null;
    try { const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null"); if (saved && typeof saved.requestId === "string" && Object.hasOwn(feedbackKinds, saved.kind) && typeof saved.title === "string" && typeof saved.body === "string") restored = saved; } catch {}
    setDraft(restored || freshDraft());
  }, [draftKey]);
  useEffect(() => { if (draft) { try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch {} } }, [draft, draftKey]);
  const back = () => { if (view === "home") onBack(); else { setView("home"); setPage(1); } };
  useBackHandler(back, view !== "home");
  const open = (next: View) => { setPage(1); setNotice(""); setView(next); };
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    try {
      const result = await request<Data>(`/api/feedback?view=${view === "home" || view === "new" ? "mine" : view}&page=${page}&status=${filter}`);
      if (id === sequence.current) setData(result);
    } catch (e) { if (id === sequence.current) setError(e instanceof Error ? e.message : "نظرها بارگذاری نشد."); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [view, page, filter, setError]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const send = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const result = await request<{ duplicate: boolean }>("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      setDraft(freshDraft()); setNotice(result.duplicate ? "این نظر قبلاً ثبت شده؛ در نظرهای من می‌توانی پیگیری‌اش کنی." : "نظرت ثبت شد. ممنون که به بهترشدن بازی کمک می‌کنی! 🌱");
      setPage(1); setView("mine");
    } catch (e) { setError(e instanceof Error ? e.message : "نظر ثبت نشد."); }
    finally { setBusy(false); }
  };
  return <section className="country-mode-screen feedback-screen">
    <div className="section-heading"><button className="icon-button" aria-label="بازگشت" onClick={back}>→</button><div><small>با هم بهترش می‌کنیم</small><h1>نظرجو</h1></div><span>💡</span></div>
    {notice && <p className="feedback-notice" role="status">{notice}</p>}
    {view === "home" ? <>
      <p className="feedback-intro">پیشنهاد، انتقاد یا باگی دیدی؟ اینجا بنویس؛ ما می‌خوانیم و نتیجهٔ بررسی را همین‌جا بهت می‌گوییم.</p>
      <button className="game-card world" onClick={() => open("new")}><span className="game-icon">✍️</span><span className="game-copy"><b>نوشتن نظر جدید</b><small>از ایدهٔ تازه تا مشکلی که موقع بازی دیدی</small></span><span className="game-arrow">←</span></button>
      <button className="game-card duel" onClick={() => open("mine")}><span className="game-icon">💬</span><span className="game-copy"><b>نظرهای من</b><small>پیگیری وضعیت و دیدن پاسخ بررسی</small></span><span className="game-arrow">←</span></button>
      <button className="game-card phrase-hunt" onClick={() => open("leaderboard")}><span className="game-icon">🏆</span><span className="game-copy"><b>رتبه‌های نظرجو</b><small>بازیکن‌هایی که به بهترشدن اپ کمک کرده‌اند</small></span><span className="game-arrow">←</span></button>
      {data?.canReview && <button className="game-card words" onClick={() => open("review")}><span className="game-icon">🔎</span><span className="game-copy"><b>بررسی نظرها</b><small>بخش مدیریت؛ پاسخ و تأیید مشارکت‌ها</small></span><span className="game-arrow">←</span></button>}
      <aside className="feedback-guide"><b>امتیاز چطور حساب می‌شود؟</b><p>هر نظر مفید که تأیید شود، {FEEDBACK_POINTS.toLocaleString("fa-IR")} امتیاز دارد؛ پیشنهاد، انتقاد و گزارش باگ ارزش یکسان دارند. تعداد پیام‌ها امتیاز نمی‌آورد و انجام‌شدن یک نظر دوباره امتیاز ندارد.</p><p>پذیرفته‌شدن یعنی بازخوردت مفید بوده؛ قول اجرای همهٔ ایده‌ها نیست. متن نظرها فقط برای خودت و تیم بررسی نمایش داده می‌شود.</p></aside>
    </> : view === "new" ? <form className="feedback-form" onSubmit={e => { e.preventDefault(); void send(); }}>
      <h2>نوشتن نظر جدید</h2>
      <label>نوع نظر<select value={draft?.kind || "SUGGESTION"} disabled={busy} onChange={e => setDraft(d => d && ({ ...d, kind: e.target.value as Kind }))}>{Object.entries(feedbackKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>عنوان کوتاه<input required minLength={3} maxLength={100} value={draft?.title || ""} disabled={busy} placeholder="مثلاً: مشکل نمایش نتیجهٔ دوحرف" onChange={e => setDraft(d => d && ({ ...d, title: e.target.value }))} /></label>
      <label>توضیحات<textarea required minLength={10} maxLength={3000} rows={7} value={draft?.body || ""} disabled={busy} placeholder="چه اتفاقی افتاد؟ انتظار داشتی چه شود؟ اگر ایده‌ای داری، توضیح بده چطور بازی را بهتر می‌کند." onChange={e => setDraft(d => d && ({ ...d, body: e.target.value }))} /></label>
      <small className="players-hint">پیش‌نویس روی همین دستگاه حفظ می‌شود. لطفاً هر موضوع را جدا بنویس و اطلاعات حساس نفرست.</small>
      <button className="primary" disabled={busy || !draft}>{busy ? "در حال ثبت…" : "ثبت نظر"}</button>
    </form> : <>
      <div className="feedback-list-heading"><h2>{view === "mine" ? "نظرهای من" : view === "review" ? "بررسی نظرها" : "رتبه‌های نظرجو"}</h2><button className="secondary" disabled={loading} onClick={() => void load()}>تازه‌سازی</button></div>
      {view === "review" && <label className="feedback-filter">وضعیت<select value={filter} onChange={e => { setFilter(e.target.value as Status); setPage(1); }}>{Object.entries(feedbackStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {loading ? <div className="empty-state">در حال بارگذاری…</div> : view === "leaderboard" ? <>
        <p className="players-hint">امتیاز بر اساس مشارکت‌های تأییدشده است. در امتیاز برابر، کسی که زودتر نخستین تأیید را گرفته بالاتر می‌آید.</p>
        {data?.me && <p className="feedback-notice">رتبهٔ تو: {data.me.rank.toLocaleString("fa-IR")} · {data.me.points.toLocaleString("fa-IR")} امتیاز</p>}
        {!data?.rows?.length && <div className="empty-state">هنوز مشارکتی تأیید نشده؛ اولین نفر باش! 🌱</div>}
        {data?.rows?.map(row => <button key={row.userId} className="feedback-ranking" onClick={() => onOpenProfile(row.userId)}><b>{row.rank.toLocaleString("fa-IR")}</b><OnlineAvatar online={onlineIds.has(row.userId)}>{row.photoUrl ? <img className="avatar" src={avatarImageUrl(row.userId, row.photoUrl) || ""} alt="" /> : <span className="avatar avatar-fallback">👤</span>}</OnlineAvatar><span className="feedback-ranking-copy"><strong>{row.name}</strong>{row.username && <small dir="ltr">@{row.username}</small>}<small>{row.accepted.toLocaleString("fa-IR")} مشارکت تأییدشده</small></span><b>{row.points.toLocaleString("fa-IR")}<small>امتیاز</small></b></button>)}
      </> : <>
        {!data?.items?.length && <div className="empty-state">{view === "mine" ? "هنوز نظری ثبت نکرده‌ای." : "در این وضعیت نظری وجود ندارد."}</div>}
        {data?.items?.map(item => <article className="feedback-item" key={item.id}><div className="feedback-item-meta"><span>{feedbackKinds[item.kind]}</span><span className={`feedback-status ${item.status.toLowerCase()}`}>{feedbackStatuses[item.status]}</span></div><h3>{item.title}</h3>{item.user && <small>{item.user.name}</small>}<p>{item.body}</p><small>{new Date(item.createdAt).toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" })}{item.points > 0 ? ` · ${item.points.toLocaleString("fa-IR")} امتیاز` : ""}</small>{item.reply && <div className="feedback-reply"><b>پاسخ بررسی</b><p>{item.reply}</p></div>}{view === "review" && <Review item={item} onDone={load} setError={setError} />}</article>)}
        {view === "mine" && <button className="primary" onClick={() => open("new")}>نوشتن نظر جدید</button>}
      </>}
      <div className="feedback-pagination">{page > 1 && <button className="secondary" disabled={loading} onClick={() => setPage(p => p - 1)}>صفحهٔ قبل</button>}{data?.hasMore && <button className="secondary" disabled={loading} onClick={() => setPage(p => p + 1)}>صفحهٔ بعد</button>}</div>
    </>}
  </section>;
}
function Review({ item, onDone, setError }: { item: Item; onDone: () => Promise<void>; setError: (s: string) => void }) {
  const [status, setStatus] = useState<Status>(item.status === "PENDING" ? "ACCEPTED" : item.status), [reply, setReply] = useState(item.reply || ""), [busy, setBusy] = useState(false);
  return <form className="feedback-form feedback-review" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); try { await request("/api/feedback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status, reply }) }); await onDone(); } catch (e) { setError(e instanceof Error ? e.message : "بررسی ثبت نشد."); } finally { setBusy(false); } }}>
    <label>نتیجهٔ بررسی<select value={status} onChange={e => setStatus(e.target.value as Status)} disabled={busy}>{Object.entries(feedbackStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>پاسخ به بازیکن<textarea required minLength={1} maxLength={1500} rows={3} value={reply} onChange={e => setReply(e.target.value)} disabled={busy} placeholder="دلیل تأیید، نتیجهٔ بررسی یا توضیح کوتاهی برای بازیکن بنویس." /></label>
    <button className="primary" disabled={busy}>{busy ? "در حال ثبت…" : "ثبت نتیجهٔ بررسی"}</button>
  </form>;
}
