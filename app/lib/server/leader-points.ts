/**
 * Boa Vista (leader mode) order points from the frozen daily live ledger.
 * 业务方 2026-10-31: "累计订单按照每日订单统计进去,每个订单积分 +1".
 *
 * One ledger entry per rider per day, id `pts-ord-<date>-<riderId>` — the SAME
 * id the T+1 import uses (performance route creditOrderPoints), so:
 *   - this credit is insert-only: a day that already has an entry (from T+1
 *     or an earlier freeze) is never touched here;
 *   - a later T+1 import of that day updates the entry to the table's count
 *     (T+1 wins), exactly like any T+1 re-import.
 * Points ledger is still the legacy collection (txcore dual-write mirrors it
 * on flush), so this goes through memory + flush like every other credit.
 */

import { getAvailablePoints } from "../points";
import type { LeaderDailyOrders } from "./leader-daily";
import { memory } from "./memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "./persistence";

export async function creditLeaderDailyPoints(rows: LeaderDailyOrders[]): Promise<{ credited: number; points: number; skipped: number }> {
  if (!rows.length) return { credited: 0, points: 0, skipped: 0 };
  await refreshCollectionsFromDatabase(["riders", "franchises", "pointsLedgerEntries"]);
  const leaderFranchises = new Set(memory.franchises.filter((f) => f.leaderMode === true).map((f) => f.name));
  const by99 = new Map(memory.riders.filter((r) => r.ninetyNineId).map((r) => [String(r.ninetyNineId), r]));
  const existing = new Set(memory.pointsLedgerEntries.map((e) => e.id));
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  let credited = 0;
  let points = 0;
  let skipped = 0;
  for (const row of rows) {
    const orders = Math.round(Number(row.completedOrders ?? 0));
    const rider = by99.get(String(row.rider99Id));
    if (orders <= 0 || !rider || !rider.franchise || !leaderFranchises.has(rider.franchise)) {
      skipped += 1;
      continue;
    }
    const id = `pts-ord-${row.date}-${rider.id}`;
    if (existing.has(id)) {
      skipped += 1;
      continue;
    }
    memory.pointsLedgerEntries.unshift({
      id,
      riderId: rider.id,
      accountId: `pts-${rider.id}`,
      type: "earn",
      points: orders,
      status: "approved",
      sourceType: "delivery",
      sourceId: `ldo-${row.date}`,
      balanceAfter: getAvailablePoints(memory.pointsLedgerEntries, rider.id) + orders,
      reasonCode: "ORDER_POINTS",
      note: `实时日统计 ${row.date} 完单 ${orders} × 1分(Boa Vista,T+1 导入后以表为准)`,
      createdBy: "Leader daily (live)",
      createdAt: stamp,
    });
    existing.add(id);
    credited += 1;
    points += orders;
  }
  if (credited) await flushPendingToDatabase();
  return { credited, points, skipped };
}
