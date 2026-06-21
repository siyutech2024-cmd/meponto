import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { requirePermission } from "../../../lib/server/authz";
import { sessionFromRequest } from "../../../lib/auth-session";
import { maskAuthor, partnerRatingAggregate, type PartnerReview } from "../../../lib/partner-reviews";

/**
 * Partner service-point reviews (商户评价).
 *  - GET  ?partnerCode=&limit=&cursor= : aggregate + masked-author list (public).
 *  - POST {partnerCode, rating, comment} : submit/update own review (rider).
 * Event: partner.review.created.v1.
 */

const COLLECTIONS = ["partnerReviews", "crmPartners", "riders", "partnerServiceRecords"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
// Eligibility gate (only riders who used the partner can review) — off by default.
const REQUIRE_REDEEM = process.env.PARTNER_REVIEW_REQUIRE_REDEEM === "1";

function resolvePartner(code: string) {
  const key = code.replace(/^(partner-|crm-)/i, "");
  return memory.crmPartners.find((p) => p.id === code || p.id === key || p.name === code);
}

export async function GET(request: Request) {
  await refreshCollectionsFromDatabase(COLLECTIONS);
  const url = new URL(request.url);
  const partner = resolvePartner(String(url.searchParams.get("partnerCode") ?? "").trim());
  if (!partner) return jsonResponse({ error: "Parceiro não encontrado.", code: "partner_not_found" }, { status: 404 });

  const agg = partnerRatingAggregate(memory.partnerReviews, partner.id);
  const all = memory.partnerReviews
    .filter((r) => r.partnerId === partner.id)
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const cursor = Math.max(0, Number(url.searchParams.get("cursor")) || 0);
  const page = all.slice(cursor, cursor + limit);
  const items = page.map((r) => ({ id: r.id, author: maskAuthor(r.riderName), rating: r.rating, comment: r.comment, createdAt: r.createdAt }));
  const nextCursor = cursor + limit < all.length ? String(cursor + limit) : null;

  return jsonResponse({ data: { ratingAvg: agg.ratingAvg, reviewCount: agg.reviewCount, items, nextCursor } });
}

async function handlePost(request: Request) {
  const forbidden = requirePermission(request, "use_rider_app");
  if (forbidden) return forbidden;
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Faça login.", code: "unauthenticated" }, { status: 401 });
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const rider = memory.riders.find((r) => r.id === session.userId || r.name === session.name);
  if (!rider) return jsonResponse({ error: "Cadastro não encontrado.", code: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { partnerCode?: string; rating?: number; comment?: string };
  const rating = Math.floor(Number(body.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: "Avaliação deve ser de 1 a 5.", code: "invalid_rating" }, { status: 400 });
  }
  const partner = resolvePartner(String(body.partnerCode ?? "").trim());
  if (!partner) return jsonResponse({ error: "Parceiro não encontrado.", code: "partner_not_found" }, { status: 404 });

  if (REQUIRE_REDEEM && !memory.partnerServiceRecords.some((s) => s.riderId === rider.id && s.partnerId === partner.id && s.status !== "rejected")) {
    return jsonResponse({ error: "Apenas quem usou o parceiro pode avaliar.", code: "not_eligible" }, { status: 403 });
  }

  const comment = String(body.comment ?? "").trim().slice(0, 500);
  const stamp = nowStamp();
  // One review per rider per partner → update (覆盖) when it already exists.
  const index = memory.partnerReviews.findIndex((r) => r.riderId === rider.id && r.partnerId === partner.id);
  let review: PartnerReview;
  if (index !== -1) {
    review = { ...memory.partnerReviews[index], rating, comment, updatedAt: stamp };
    memory.partnerReviews[index] = review;
  } else {
    review = { id: makeServerId("prv", memory.partnerReviews.length + 1), riderId: rider.id, partnerId: partner.id, riderName: rider.name, rating, comment, createdAt: stamp };
    memory.partnerReviews.unshift(review);
  }

  const agg = partnerRatingAggregate(memory.partnerReviews, partner.id);
  appendServerAudit({ actor: rider.name, action: "partner.review.created.v1", entity: "PartnerReview", entityId: review.id, detail: `${rider.name} avaliou ${partner.name}: ${rating}★.`, risk: "Low" });
  return jsonResponse({ data: { reviewId: review.id, partnerRatingAvg: agg.ratingAvg, partnerReviewCount: agg.reviewCount } }, { status: index !== -1 ? 200 : 201 });
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
