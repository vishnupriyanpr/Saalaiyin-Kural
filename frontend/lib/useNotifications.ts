"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { getToken } from "./useAuth";
import { useWebSocket } from "./useWebSocket";
import type { RealtimeNotification } from "./types";

/**
 * useNotifications — single source of truth for the notification bell.
 *
 * - On mount, fetches GET /api/notifications (server returns unread-first).
 * - Subscribes to the WebSocket; on { type:"NOTIFICATION", notification } it
 *   prepends the new notification and bumps the unread count.
 * - markRead / markAllRead update the backend AND local state optimistically.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) return;

    (async () => {
      try {
        const data = await api.get<RealtimeNotification[]>("/api/notifications", token);
        if (!cancelled && Array.isArray(data)) setNotifications(data);
      } catch {
        /* surface nothing in the bell on failure; stay empty */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Live updates.
  const onMessage = useCallback((payload: any) => {
    if (payload?.type === "NOTIFICATION" && payload.notification) {
      const incoming = payload.notification as RealtimeNotification;
      setNotifications((prev) => {
        if (prev.some((n) => n.id === incoming.id)) return prev; // de-dupe
        return [incoming, ...prev];
      });
    }
  }, []);

  useWebSocket(onMessage);

  const unreadCount = notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await api.patch(`/api/notifications/${id}/read`, undefined, getToken() || undefined);
    } catch {
      /* keep optimistic state; a refetch on next mount will reconcile */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.patch("/api/notifications/read-all", undefined, getToken() || undefined);
    } catch {
      /* keep optimistic state */
    }
  }, []);

  return { notifications, unreadCount, markRead, markAllRead };
}
