import { jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { partnerRatingAggregate } from "../../lib/partner-reviews";
import { isSupplierCategory } from "../../lib/server/crm-categories";

/**
 * Rider service map data. TWO distinct layers (they are NOT the same thing):
 *  - partners: partner SERVICE points (repair/fuel/etc.) — where riders get
 *    services. NEVER a pickup point. Each carries its review aggregate
 *    (ratingAvg + reviewCount) plus the rider offer (discount / bonus points)
 *    for the map card and the partner LIST. Supply-chain vendors (供应商) are
 *    back-office only and never rider-facing. Partners without geo still
 *    appear (the map layer skips them; the list shows them all).
 *  - stores: Ponto pickup stations — the ONLY place mall orders are picked up.
 */
export async function GET() {
  await refreshCollectionsFromDatabase(["crmPartners", "pontos", "partnerReviews"]);
  const partners = memory.crmPartners
    .filter((p) => p.status === "Active" && !isSupplierCategory(p.category))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      services: p.services,
      bairro: p.bairro,
      lat: Number.isFinite(p.lat) ? p.lat : null,
      lng: Number.isFinite(p.lng) ? p.lng : null,
      phone: p.phone,
      discountBRL: p.riderDiscountBRL ?? 0,
      partnerPoints: p.riderRewardPoints ?? 0,
      ...partnerRatingAggregate(memory.partnerReviews, p.id),
    }));
  const stores = memory.pontos
    .filter((p) => p.pickupEnabled !== false && (p.status ?? "approved") === "approved" && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ id: p.id, name: p.name, bairro: p.bairro, franchise: p.franchise, lat: p.lat, lng: p.lng, address: p.address }));
  return jsonResponse({ data: { partners, stores } });
}
