"use client";

import { createContext, useContext, useEffect, useRef, type MutableRefObject } from "react";

type BackHandler = { priority: number; run: () => void | Promise<void> };
export const BackHandlersContext = createContext<MutableRefObject<Map<symbol, BackHandler>> | null>(null);

export function useBackHandler(action: () => void | Promise<void>, enabled = true, priority = 10) {
  const handlers = useContext(BackHandlersContext);
  const latest = useRef(action);
  latest.current = action;
  useEffect(() => {
    if (!handlers || !enabled) return;
    const id = Symbol();
    handlers.current.set(id, { priority, run: () => latest.current() });
    return () => { handlers.current.delete(id); };
  }, [handlers, enabled, priority]);
}

// Keep one browser-history entry while inside the app. The app owns the actual
// screen history, including temporary overlays and asynchronous room exits.
export function useBrowserBack(enabled: boolean, action: () => void | Promise<void>) {
  const latest = useRef(action);
  const canBack = useRef(enabled);
  const armed = useRef(false);
  const suppressPop = useRef(false);
  const processing = useRef(false);
  const requested = useRef(false);
  latest.current = action;
  canBack.current = enabled;

  const sync = () => {
    if (canBack.current && !armed.current) {
      window.history.pushState({ ...window.history.state, antiAiBack: true }, "", window.location.href);
      armed.current = true;
    } else if (!canBack.current && armed.current) {
      armed.current = false;
      suppressPop.current = true;
      window.history.back();
    }
  };

  useEffect(() => {
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const onPop = async () => {
      requested.current = false;
      if (suppressPop.current) { suppressPop.current = false; return; }
      if (!armed.current) return;
      armed.current = false;
      sync();
      if (processing.current) return;
      processing.current = true;
      try { await latest.current(); }
      finally { processing.current = false; }
    };
    window.addEventListener("popstate", onPop);
    if (window.history.state?.antiAiBack) armed.current = true;
    sync();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.history.scrollRestoration = restoration;
    };
  }, []);

  useEffect(() => { sync(); }, [enabled]);

  return () => {
    if (processing.current || requested.current) return;
    if (armed.current) { requested.current = true; window.history.back(); }
    else void latest.current();
  };
}
