import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { sendPushToRider } from "../../../lib/server/notify";
import { getAvailablePoints, type PointsLedgerEntry } from "../../../lib/points";
import { resolveTier } from "../../../lib/mall";

/**
 * Daily birthday bonus grant (idempotent). Credits the tier-defined birthday
 * points to every rider whose birthday (month-day) is today. Designed to be
 * called by a Vercel Cron once a day. Each rider can only be granted once per
 * calendar year (deterministic ledger sourceId), so retries are safe.
 *
 * Auth: if CRON_SECRET is set, require `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron sends this when the env var is configured). If unset, the route
 * still runs (handy for manual/local invocation) but logs the open access.
 */

const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function lifetimeOrders(rider99Id: string | undefined): number | null {
  if (!rider99Id) return null;
  const rows = memory.riderDailyKpis.filter((row) => row.rider99Id === rider99Id);
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + (row.completedOrders ?? 0), 0);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await refreshCollectionsFromDatabase(["riders", "riderDailyKpis", "pointsLedgerEntries", "mallConfigs"]);

  const now = new Date();
  const year = now.getUTCFullYear();
  const todayMonthDay = now.toISOString().slice(5, 10); // "MM-DD"
  // Base birthday gift for EVERY member (tiers may grant more).
  const baseBirthday = memory.mallConfigs.find((c) => c.id === "mall-config")?.birthdayBasePoints ?? 0;

  const granted: Array<{ riderId: string; name: string; tier: string; points: number }> = [];

  for (const rider of memory.riders) {
    const birthday = (rider.birthday ?? "").trim();
    if (birthday.length < 5) continue;
    // Accept YYYY-MM-DD or MM-DD; compare on month-day only.
    const monthDay = birthday.length >= 10 ? birthday.slice(5, 10) : birthday.slice(0, 5);
    if (monthDay !== todayMonthDay) continue;

    const tier = resolveTier(lifetimeOrders(rider.ninetyNineId));
    const points = Math.max(tier.birthdayPoints, baseBirthday);
    if (points <= 0) continue;

    // Idempotency: one grant per rider per year.
    const sourceId = `birthday-${rider.id}-${year}`;
    if (memory.pointsLedgerEntries.some((entry) => entry.sourceId === sourceId)) continue;

    const available = getAvailablePoints(memory.pointsLedgerEntries, rider.id);
    const entry: PointsLedgerEntry = {
      id: makeServerId("pts", memory.pointsLedgerEntries.length + 1),
      riderId: rider.id,
      accountId: `pts-${rider.id}`,
      type: "earn",
      points,
      status: "approved",
      sourceType: "admin_adjustment",
      sourceId,
      balanceAfter: available + points,
      reasonCode: "BIRTHDAY_BONUS",
      note: `Presente de aniversário (${tier.label}) — ${points} pts 🎂`,
      createdBy: "System",
      createdAt: nowStamp(),
    };
    memory.pointsLedgerEntries.unshift(entry);
    granted.push({ riderId: rider.id, name: rider.name, tier: tier.tier, points });
  }

  if (granted.length > 0) {
    appendServerAudit({
      actor: "System",
      action: "BIRTHDAY_BONUS_GRANTED",
      entity: "PointsLedger",
      entityId: todayMonthDay,
      detail: `${granted.length} rider(s) credited: ${granted.map((g) => `${g.name}(+${g.points})`).join(", ")}.`,
      risk: "Low",
    });
    await flushPendingToDatabase();
    // Best-effort push notification (no-op when the rider has no subscription).
    for (const g of granted) {
      await sendPushToRider(g.name, "Feliz aniversário! 🎂", `Você ganhou ${g.points} pontos de presente. Aproveite no PontoMall!`, "/rider-app/mall");
    }
  }

  return jsonResponse({ data: { date: todayMonthDay, granted: granted.length, riders: granted } });
}

// Vercel Cron issues GET requests; POST kept for manual/testing parity.
export async function GET(request: Request) {
  return run(request);
}
export async function POST(request: Request) {
  return run(request);
}
