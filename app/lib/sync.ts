"use client";

/**
 * Fire-and-forget client → server synchronization.
 *
 * Store actions update the UI optimistically and then mirror the mutation to
 * the API, which persists it server-side (and into Supabase when enabled).
 * Failures only log a warning — the UI keeps its optimistic state and the
 * record stays in localStorage, so nothing is lost for the current browser.
 */
export function syncToServer(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown) {
  if (typeof window === "undefined") return;

  void fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
    .then((response) => {
      if (!response.ok) {
        console.warn(`[MePonto sync] ${method} ${path} responded ${response.status}`);
      }
    })
    .catch((error) => {
      console.warn(`[MePonto sync] ${method} ${path} failed:`, error);
    });
}
