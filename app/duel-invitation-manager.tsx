"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionRequest } from "@/lib/client-session";
import { Invitation, InvitationState, InviteRemaining, playerName, PlayerAvatar } from "./players";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
export function useDuelInvitations({ userId, onJoin, beforeAccept, onError }: {
  userId: string | null; onJoin: (connectionId: string, inviteId: string) => Promise<void>;
  beforeAccept: (invite: Invitation) => Promise<boolean>; onError: (message: string) => void;
}) {
  const [state, setState] = useState<InvitationState | null>(null);
  const [busy, setBusy] = useState(false);
  const joined = useRef(new Set<string>());
  const joining = useRef(false);
  const actionBusy = useRef(false);
  const sequence = useRef(0);
  const appliedSequence = useRef(0);
  const polling = useRef(false);
  const latest = useRef({ onJoin, beforeAccept, onError }); latest.current = { onJoin, beforeAccept, onError };
  const receive = useCallback(async (data: InvitationState, version: number) => {
    if (version < appliedSequence.current) return;
    appliedSequence.current = version;
    setState(data);
    const accepted = data.invites.find(i => i.status === "ACCEPTED" && i.connectionId && i.connection?.status !== "ENDED" && !joined.current.has(i.id));
    if (!accepted || joining.current) return;
    joining.current = true;
    try { await latest.current.onJoin(accepted.connectionId!, accepted.id); joined.current.add(accepted.id); }
    catch (e) { latest.current.onError(e instanceof Error ? e.message : "ورود به بازی انجام نشد"); }
    finally { joining.current = false; }
  }, []);
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    const version = ++sequence.current;
    try {
      const response = await fetch(base + "/api/duel-invites", sessionRequest());
      if (!response.ok) throw new Error("دریافت دعوت‌ها انجام نشد");
      await receive(await response.json(), version);
    } finally { polling.current = false; }
  }, [receive]);
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    const poll = () => { if (!stopped && document.visibilityState === "visible") void refresh().catch(() => undefined); };
    poll(); const timer = setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [userId, refresh]);
  const action = async (action: string, extra: Record<string, unknown> = {}) => {
    if (actionBusy.current) return;
    actionBusy.current = true; setBusy(true);
    try {
      if (action === "accept") {
        const invite = state?.invites.find(i => i.id === extra.id);
        if (!invite || !await latest.current.beforeAccept(invite)) return;
      }
      const version = ++sequence.current;
      const response = await fetch(base + "/api/duel-invites", sessionRequest({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) }));
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      await receive(data, version);
    } catch (e) { latest.current.onError(e instanceof Error ? e.message : "عملیات دعوت انجام نشد"); await refresh().catch(() => undefined); }
    finally { actionBusy.current = false; setBusy(false); }
  };
  return { state, busy, action };
}
export function InvitationBanner({ me, state, busy, action }: { me: string; state: InvitationState | null; busy: boolean; action: (action: string, extra: Record<string, unknown>) => Promise<void> }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const invite = state?.invites.find(i => i.recipientId === me && i.status === "PENDING" && !dismissed.has(i.id));
  if (!state) return null;
  if (!invite) {
    const outgoing = state.invites.find(i => i.senderId === me && i.status === "PENDING");
    if (!outgoing) return null;
    return <aside className="outgoing-invitation" aria-live="polite"><span>در انتظار پاسخ {playerName(outgoing.recipient)}<InviteRemaining invite={outgoing} serverNow={state.serverNow}/></span><button className="secondary" disabled={busy} onClick={() => void action("cancel", { id: outgoing.id })}>لغو دعوت</button></aside>;
  }
  return <aside className="invitation-banner" role="region" aria-label="دعوت به دوحرف" aria-live="polite">
    <button className="invite-dismiss" aria-label="بستن اعلان" onClick={() => setDismissed(s => new Set([...s, invite.id]))}>×</button>
    <div className="player-identity"><PlayerAvatar player={invite.sender} online/><div><b>{playerName(invite.sender)}</b><p>تو را به دوحرف دعوت کرده</p><InviteRemaining invite={invite} serverNow={state.serverNow}/></div></div>
    <div className="invite-actions"><button className="primary" disabled={busy} onClick={() => void action("accept", { id: invite.id })}>قبول و رفتن به بازی</button><button className="secondary" disabled={busy} onClick={() => void action("reject", { id: invite.id })}>رد</button></div>
  </aside>;
}
