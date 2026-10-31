import { freezeLeaderDay, brtToday } from "../../../lib/server/leader-daily";
import { requirePermission, scopeFromRequest } from "../../../lib/server/authz";

/**
 * Leader Mode daily freeze (app/lib/server/leader-daily.ts).
 *
 * Schedule: Vercel cron 03:10 UTC = 00:10 São Paulo → freezes YESTERDAY.
 * Manual: ?date=YYYY-MM-DD (one past day) or ?from=…&to=… (backfill, ≤31 days).
 * Auth: CRON_SECRET bearer (cron), or an HQ session with manage_leaders.
 * Idempotent and insert-only — re-running a day never changes its records.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const isCron = Boolean(secret) && auth === `Bearer ${secret}`;
  if (!isCron) {
    if (secret || process.env.NODE_ENV === "production") {
      const forbidden = requirePermission(request, "manage_leaders");
      if (forbidden) return forbidden;
      const scope = await scopeFromRequest(request);
      if (scope.franchise || scope.station) return Response.json({ error: "HQ only" }, { status: 403 });
    }
  }

  const url = new URL(request.url);
  const today = brtToday();
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? url.searchParams.get("date") ?? yesterday;
  const to = url.searchParams.get("to") ?? url.searchParams.get("date") ?? yesterday;

  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to && days.length < 31; d = new Date(d.getTime() + 864e5)) {
    days.push(d.toISOString().slice(0, 10));
  }
  const results = [];
  for (const day of days) {
    try {
      results.push(await freezeLeaderDay(day));
    } catch (error) {
      results.push({ date: day, error: (error as Error).message });
    }
  }
  return Response.json({ data: results });
}
