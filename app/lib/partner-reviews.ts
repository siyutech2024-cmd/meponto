/**
 * Partner service-point reviews (商户评价). A rider rates a partner 1–5 stars
 * with an optional comment; the rider map shows the aggregate (avg + count) and
 * the detail view lists masked-author reviews.
 */

export type PartnerReview = {
  id: string;
  riderId: string;
  partnerId: string;
  riderName: string; // stored raw; masked on read
  rating: number; // 1..5
  comment: string;
  createdAt: string;
  updatedAt?: string;
};

export const partnerReviews: PartnerReview[] = [];

/** Mask an author name to first name + surname initial (no phone/CPF leak). */
export function maskAuthor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Membro";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Aggregate (avg to 1 decimal + count) for one partner. */
export function partnerRatingAggregate(reviews: PartnerReview[], partnerId: string): { ratingAvg: number; reviewCount: number } {
  const rows = reviews.filter((r) => r.partnerId === partnerId);
  if (rows.length === 0) return { ratingAvg: 0, reviewCount: 0 };
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  return { ratingAvg: Math.round(avg * 10) / 10, reviewCount: rows.length };
}
