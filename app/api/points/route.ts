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

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const riderId = searchParams.get("riderId");
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
