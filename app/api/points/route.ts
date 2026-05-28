import { getPartnerPointsAccount, getPointsAccount, pointsRules } from "../../lib/points";
import { jsonResponse, memory } from "../../lib/server/memory";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const riderId = searchParams.get("riderId");
  const accounts = riderId
    ? [getPointsAccount(memory.pointsLedgerEntries, riderId)]
    : memory.riders.map((rider) => getPointsAccount(memory.pointsLedgerEntries, rider.id));
  const partnerAccounts = memory.crmPartners
    .filter((partner) => partner.category !== "Supplier")
    .map((partner) => getPartnerPointsAccount(memory.partnerPointsLedgerEntries, partner.id));

  return jsonResponse({
    data: {
      accounts,
      partnerAccounts,
      ledger: memory.pointsLedgerEntries,
      partnerLedger: memory.partnerPointsLedgerEntries,
      rules: pointsRules,
      readModel: "rider_points_read_model",
      standard: "docs/meponto-points-economy-standard.md",
    },
  });
}
