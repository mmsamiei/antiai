"use client";
import { sessionRequest } from "./client-session";
import type { InvitationState } from "@/app/players";
import type { MatchState } from "@/app/country-matchmaking";
type Status = { invitations: InvitationState; matching: MatchState };
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
let last: { key: string; promise: Promise<Status>; expires: number } | null = null;
export function fetchSocialStatus(userId: string): Promise<Status> {
  const init = sessionRequest();
  const key = userId + ":" + new Headers(init.headers).get("Authorization");
  if (last?.key === key && last.expires > Date.now()) return last.promise;
  const promise = fetch(base + "/api/social", init).then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "دریافت دعوت‌ها انجام نشد");
    return data as Status;
  });
  const entry = { key, promise, expires: Infinity };last = entry;
  promise.then(() => { if (last === entry) entry.expires = Date.now() + 200; }, () => { if (last === entry) last = null; });
  return promise;
}
