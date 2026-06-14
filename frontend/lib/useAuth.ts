"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";

export const TOKEN_KEY = "saalaikural_token";

export interface DecodedUser {
  id?: string;
  userId?: string;
  name?: string;
  role?: string;
  district?: string;
  exp?: number;
  iat?: number;
  [key: string]: any;
}

/** Read the raw JWT token from localStorage. Returns null on server / if absent. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export interface StoredUser {
  role?: "civilian" | "admin";
  userId?: string;
  name?: string;
  district?: string;
  adminRole?: string;
}

/** Read the small display-user object saved at login (name/district/etc). */
export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("saalaikural_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

/** Decode + validate the token (checks exp). Returns null if missing/expired/invalid. */
export function getDecodedUser(): DecodedUser | null {
  const token = getToken();
  if (!token) return null;
  try {
    const decoded = jwtDecode<DecodedUser>(token);
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null; // expired
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * React hook: returns the decoded user object (or null if missing/expired/invalid).
 * SSR-safe — returns null on the server, hydrates on the client.
 */
export function useAuth(): DecodedUser | null {
  const [user, setUser] = useState<DecodedUser | null>(null);

  useEffect(() => {
    setUser(getDecodedUser());
  }, []);

  return user;
}

/**
 * Guard hook for protected pages. Redirects to /login when there is no valid
 * (present, unexpired) token. Returns { ready, user } — `ready` flips true after
 * the client-side auth check has run (SSR-safe).
 */
export function useRequireAuth(): { ready: boolean; user: DecodedUser | null } {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<DecodedUser | null>(null);

  useEffect(() => {
    const decoded = getDecodedUser();
    if (!decoded) {
      router.replace("/login");
      return;
    }
    setUser(decoded);
    setReady(true);
  }, [router]);

  return { ready, user };
}
