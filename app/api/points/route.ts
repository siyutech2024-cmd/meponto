import {
  acquisitionPointRules,
  getPartnerPointsAccount,
  getPointsAccount,
  pendingReleaseRules,
  pointsRules,
  pointsRuleSetVersions,
  redemptionLimitRules,
  riderPerformancePointRules,
} from "../../lib/points";
import { jsonResponse, memory } from "../../lib/server/memory";
import { requirePermission } from "../../lib/server/authz";
import { sessionFromRequest } from "../../lib/auth-session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const riderId = searchParams.get("riderId");
  // AUTH: this endpoint used to be open — anyone could dump every rider's
  // ledger. Now: the full network view needs the analytics permission, and
  // the per-rider view needs a session that OWNS that riderId (or analytics).
  if (!riderId) {
    const forbidden = requirePermission(request, "view_analytics");
    if (forbidden) return forbidden;
  } else {
    const session = await sessionFromRequest(request);
    const own =
      session &&
      memory.riders.some((r) => r.id === riderId && (r.id === session.userId || r.name === session.name));
    if (!own) {
      const forbidden = requirePermission(request, "view_analytics");
      if (forbidden) return forbidden;
    }
  }
  // Rider-app context (riderId present) → return ONLY that rider's account and
  // ledger (no cross-rider / partner data leak). Admin context (no riderId) →
  // full network view as before.
  const accounts = riderId
    ? [getPointsAccount(memory.pointsLedgerEntries, riderId)]
    : memory.riders.map((rider) => getPointsAccount(memory.pointsLedgerEntries, rider.id));
  const partnerAccounts = riderId
    ? []
    : memory.crmPartners
        .filter((partner) => partner.category !== "Supplier")
        .map((partner) => getPartnerPointsAccount(memory.partnerPointsLedgerEntries, partner.id));
  const ledger = riderId ? memory.pointsLedgerEntries.filter((e) => e.riderId === riderId) : memory.pointsLedgerEntries;
  const partnerLedger = riderId ? [] : memory.partnerPointsLedgerEntries;

  return jsonResponse({
    data: {
      accounts,
      partnerAccounts,
      ledger,
      partnerLedger,
      rules: pointsRules,
      ruleSetVersions: pointsRuleSetVersions,
      riderPerformanceRules: riderPerformancePointRules,
      acquisitionRules: acquisitionPointRules,
      pendingReleaseRules,
      redemptionLimitRules,
      readModel: "rider_points_read_model",
      standard: "docs/meponto-points-economy-standard.md",
    },
  });
}
