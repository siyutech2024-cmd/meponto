"use client";

/** Lightweight client-side session: stored by the portal login, read by scoped pages. */
export type ClientSession = {
  name: string;
  role: string;
  portal: string;
  organization: string;
  franchise?: string;
  station?: string;
  identifier?: string;
};

const KEY = "mePontoSession";

export function readSession(): ClientSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClientSession) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: ClientSession) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode) — scoped pages fall back to defaults.
  }
}
