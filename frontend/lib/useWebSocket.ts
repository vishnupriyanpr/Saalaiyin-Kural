"use client";

import { useEffect, useRef } from "react";
import { getToken } from "./useAuth";

/**
 * Build the WebSocket URL from NEXT_PUBLIC_API_URL.
 * http://host:8000 -> ws://host:8000 ; https -> wss. The backend WS shares the
 * REST port and expects the JWT as a `token` query param.
 */
function buildWsUrl(token: string): string | null {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  const wsBase = base.replace(/^http/, "ws"); // http->ws, https->wss
  return `${wsBase}?token=${encodeURIComponent(token)}`;
}

/**
 * useWebSocket — opens a single WebSocket to the backend and forwards parsed
 * JSON payloads to `onMessage`. SSR-safe (browser-only, inside useEffect).
 *
 * - Auto-reconnects 3s after a close/error (unless the component unmounted).
 * - The `onMessage` handler is held in a ref so the socket is NOT torn down /
 *   recreated on every parent re-render — only a token change reconnects.
 */
export function useWebSocket(onMessage: (payload: any) => void): void {
  const handlerRef = useRef(onMessage);

  // Keep the latest handler without retriggering the connection effect.
  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = getToken();
    if (!token) return; // no auth -> no socket

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUnmount = false;
    let attempts = 0; // for exponential backoff

    const connect = () => {
      if (closedByUnmount) return;

      // Don't open a second socket if one is already connecting/open.
      if (
        ws &&
        (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)
      ) {
        return;
      }

      const url = buildWsUrl(token);
      if (!url) return;

      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempts = 0; // reset backoff on a successful connection
      };

      ws.onmessage = (event) => {
        let payload: any;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return; // ignore non-JSON frames
        }
        try {
          handlerRef.current(payload);
        } catch {
          /* swallow handler errors so the socket stays alive */
        }
      };

      ws.onclose = () => {
        // Transient (e.g. backend restart / page-load interruption) — stay quiet.
        if (!closedByUnmount) {
          console.debug("[useWebSocket] connection closed; will retry");
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // Don't spam console.error for transient failures; force a close so the
        // onclose -> reconnect path runs once.
        console.debug("[useWebSocket] connection error");
        try {
          ws?.close();
        } catch {
          /* noop */
        }
      };
    };

    const scheduleReconnect = () => {
      if (closedByUnmount || reconnectTimer) return;
      // ~3s base, exponential up to ~15s.
      const delay = Math.min(3000 * 2 ** attempts, 15000);
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        // Detach handlers first so a close fired during teardown/navigation
        // ("interrupted while the page was loading") can't trigger setState or
        // a reconnect.
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
        ws = null;
      }
    };
  }, []);
}
