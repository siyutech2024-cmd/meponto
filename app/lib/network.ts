/**
 * Network master data: franchises and their stations.
 * Every station MUST be bound to a parent franchise (HQ → franchise → station).
 */

export type Franchise = {
  id: string;
  name: string;
  owner: string;
  phone: string;
  city: string;
  createdAt: string;
};

export const franchises: Franchise[] = [];

/** Build a Google Maps embed URL from a free-form address or a maps link. */
export function mapsEmbedUrl(address?: string, mapUrl?: string): string | null {
  const query = (mapUrl ?? "").trim() || (address ?? "").trim();
  if (!query) return null;
  // A pasted Google Maps link → extract the q/place part when possible, else embed the address.
  if (/^https?:\/\//i.test(query)) {
    try {
      const url = new URL(query);
      const q = url.searchParams.get("q") || url.pathname.split("/place/")[1]?.split("/")[0];
      if (q) return `https://maps.google.com/maps?q=${encodeURIComponent(decodeURIComponent(q))}&z=15&output=embed`;
    } catch {
      /* fall through to address */
    }
    if (address?.trim()) return `https://maps.google.com/maps?q=${encodeURIComponent(address.trim())}&z=15&output=embed`;
    return null;
  }
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}
