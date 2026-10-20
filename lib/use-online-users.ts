"use client";

import { useEffect, useState } from "react";
import { sessionRequest } from "@/lib/client-session";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function useOnlineUsers(userIds: (string | null | undefined)[]) {
  const key = [...new Set(userIds.filter((id): id is string => Boolean(id)))].slice(0, 100).sort().join(",");
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || !key) {
        if (active) setOnlineIds(new Set());
        return;
      }
      try {
        const response = await fetch(BASE_PATH + "/api/presence/status", sessionRequest({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: key.split(",") }),
          cache: "no-store"
        }));
        if (!response.ok) throw new Error("Presence unavailable");
        const data = await response.json() as { onlineUserIds: string[] };
        if (active) setOnlineIds(new Set(data.onlineUserIds));
      } catch {
        if (active) setOnlineIds(new Set());
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    const onVisibility = () => void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key]);

  return onlineIds;
}
