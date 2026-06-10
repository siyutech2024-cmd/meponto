/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Importing the server memory module registers all tracked collections and
 * starts hydration from the database, so persisted data is restored before
 * (or shortly after) the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./app/lib/server/memory");
  }
}
