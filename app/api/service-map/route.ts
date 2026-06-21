import { jsonResponse, memory } from "../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { partnerRatingAggregate } from "../../lib/partner-reviews";

/**
 * Rider service map data. TWO distinct layers (they are NOT the same thing):
 *  - partners: partner SERVICE points (repair/fuel/etc.) — where riders get
 *    services. NEVER a pickup point. Each carries its review aggregate
 *    (ratingAvg + reviewCount) for the map card.
 *  - stores: Ponto pickup stations — the ONLY place mall orders are picked up.
 */
export async function GET() {
  await refreshCollectionsFromDatabase(["crmPartners", "pontos", "partnerReviews"]);
  const partners = memory.crmPartners
    .filter((p) => p.status === "Active" && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ id: p.id, name: p.name, category: p.category, services: p.services, bairro: p.bairro, lat: p.lat, lng: p.lng, phone: p.phone, ...partnerRatingAggregate(memory.partnerReviews, p.id) }));
  const stores = memory.pontos
    .filter((p) => p.pickupEnabled !== false && (p.status ?? "approved") === "approved" && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ id: p.id, name: p.name, bairro: p.bairro, franchise: p.franchise, lat: p.lat, lng: p.lng, address: p.address }));
  return jsonResponse({ data: { partners, stores } });
}
