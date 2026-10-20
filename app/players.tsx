"use client";
import { useEffect, useState } from "react";
import OnlineAvatar from "./online-avatar";
import { avatarImageUrl } from "@/lib/avatar-url";
import { sessionRequest } from "@/lib/client-session";

export type Player = { id: string; firstName: string | null; lastName: string | null; username: string | null; photoUrl: string | null; online?: boolean; acceptsGameInvites?: boolean };
export type Invitation = { id: string; senderId: string; recipientId: string; sender: Player; recipient: Player; status: string; reason: string | null; expiresAt: string; startDeadline: string | null; connectionId: string | null; connection: { status: string } | null };
export type InvitationState = { invites: Invitation[]; acceptsGameInvites: boolean; serverNow: string };
export const playerName = (p: Player) => [p.firstName, p.lastName].filter(Boolean).join(" ") || p.username || "بازیکن";
export function PlayerAvatar({ player, online = false }: { player: Player; online?: boolean }) {
  return <OnlineAvatar online={online}>{player.photoUrl ? <img className="players-avatar" src={avatarImageUrl(player.id, player.photoUrl) || ""} alt="" /> : <span className="players-avatar players-fallback">👤</span>}</OnlineAvatar>;
}
export function InviteRemaining({ invite, serverNow }: { invite: Invitation; serverNow: string }) {
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(() => Date.parse(serverNow) - Date.now());
  useEffect(() => { setOffset(Date.parse(serverNow) - Date.now()); }, [serverNow]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(invite.expiresAt) - now - offset) / 1000));
  return <small>{seconds.toLocaleString("fa-IR")} ثانیه فرصت پاسخ</small>;
}
export default function Players({ me, state, busy, onAction, onSend, onProfile, onBack }: {
  me: string; state: InvitationState | null; busy: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<void>;
  onSend: (id: string) => void; onProfile: (id: string) => void; onBack: () => void;
}) {
  const [section, setSection] = useState("players");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch((process.env.NEXT_PUBLIC_BASE_PATH || "") + `/api/players?q=${encodeURIComponent(query)}&page=${page}`, sessionRequest({ signal: controller.signal }));
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        setPlayers(data.players); setHasMore(data.hasMore); setError("");
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "دریافت بازیکن‌ها انجام نشد"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    setLoading(true);
    const delay = setTimeout(refresh, 300), timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearTimeout(delay); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [query, page]);
  const pending = state?.invites.filter(i => i.recipientId === me && i.status === "PENDING").length || 0;
  const status: Record<string, string> = { PENDING: "در انتظار پاسخ", ACCEPTED: "پذیرفته‌شده", REJECTED: "ردشده", CANCELLED: "لغوشده", EXPIRED: "منقضی‌شده" };
  return <section className="players-page">
    <div className="players-heading"><button className="icon-button" onClick={onBack} aria-label="بازگشت">→</button><div><h1>بازیکن‌ها</h1><p>یک هم‌بازی برای دوحرف پیدا کن</p></div></div>
    <div className="players-tabs"><button className={section === "players" ? "active" : ""} onClick={() => setSection("players")}>بازیکن‌ها</button><button className={section === "invites" ? "active" : ""} onClick={() => setSection("invites")}>دعوت‌های من {pending > 0 && <b className="invite-badge">{pending.toLocaleString("fa-IR")}</b>}</button></div>
    {section === "players" ? <>
      <input className="players-search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="جست‌وجوی نام یا نام کاربری" maxLength={80} aria-label="جست‌وجوی بازیکن" />
      <p className="players-hint">{query ? "نتایج جست‌وجو · آنلاین‌ها در ابتدا" : "بازیکن‌های آنلاین"}</p>
      {error && <p role="alert">{error}</p>}
      {loading ? <p>در حال دریافت…</p> : players.length === 0 ? <p className="empty-state">{query ? "بازیکنی پیدا نشد" : "فعلاً بازیکن دیگری آنلاین نیست"}</p> : players.map(p => <div className="player-card" key={p.id}>
        <button className="player-identity" onClick={() => onProfile(p.id)}><PlayerAvatar player={p} online={p.online} /><span><b>{playerName(p)}</b><small dir="ltr">{p.username ? `@${p.username}` : ""}</small><small>{p.online ? "آنلاین" : "آفلاین"}</small></span></button>
        <button className="secondary" disabled={busy || loading || !p.online || p.acceptsGameInvites === false} onClick={() => onSend(p.id)}>{p.acceptsGameInvites === false ? "دعوت غیرفعال" : "دعوت به دوحرف"}</button>
      </div>)}
      <div className="players-pagination"><button className="secondary" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>قبلی</button><span>{(page + 1).toLocaleString("fa-IR")}</span><button className="secondary" disabled={!hasMore || loading} onClick={() => setPage(p => p + 1)}>بعدی</button></div>
    </> : <>
      <label className="invite-preference"><input type="checkbox" disabled={busy || !state} checked={state?.acceptsGameInvites ?? true} onChange={e => void onAction("preference", { enabled: e.target.checked })} />دریافت دعوت بازی</label>
      {!state ? <p>در حال دریافت دعوت‌ها…</p> : !state.invites.length ? <p className="empty-state">هنوز دعوتی نداری</p> : state.invites.map(i => {
        const incoming = i.recipientId === me, p = incoming ? i.sender : i.recipient;
        return <article className="invite-card" key={i.id}>
          <button className="player-identity" onClick={() => onProfile(p.id)}><PlayerAvatar player={p}/><span><small>{incoming ? "دعوت از طرف" : "دعوت فرستادی برای"}</small><b>{playerName(p)}</b></span></button>
          <span className="invite-status">{status[i.status]}</span>{i.reason && <p>{i.reason}</p>}
          {i.status === "PENDING" && <><InviteRemaining invite={i} serverNow={state.serverNow}/><div className="invite-actions">{incoming ? <><button className="primary" disabled={busy} onClick={() => void onAction("accept", { id: i.id })}>قبول</button><button className="secondary" disabled={busy} onClick={() => void onAction("reject", { id: i.id })}>رد</button></> : <button className="secondary" disabled={busy} onClick={() => void onAction("cancel", { id: i.id })}>لغو دعوت</button>}</div></>}
        </article>;
      })}
    </>}
  </section>;
}
