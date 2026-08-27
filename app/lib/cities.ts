/**
 * Canonical city names for the whole platform.
 *
 * WHY THIS EXISTS: the same city arrives spelled several ways — Eastwind's
 * board renders it in the session's UI language ("圣保罗" when the scraper is
 * on a Chinese locale, "Sao Paulo" in English, "São Paulo" in Portuguese), and
 * historic dispatch rows were written with whatever string was current then.
 * Comparing those raw strings silently fails: on 2026-08-27 a name-based match
 * skipped BOTH cities and stopped every scraper upload for 40 minutes.
 *
 * Rule: store the canonical name, compare through `canonicalCity()`, never
 * compare raw city strings to each other.
 */

export const CITIES = ["São Paulo", "São João da Boa Vista"] as const;
export type City = (typeof CITIES)[number];

export const DEFAULT_CITY: City = "São Paulo";

/** Eastwind city_id per city (from vendor.rider.monitor.cityInfo). */
export const CITY_IDS: Record<City, string> = {
  "São Paulo": "55000199",
  "São João da Boa Vista": "55000174",
};

/** Map centre + zoom per city (rider monitor). */
export const CITY_VIEW: Record<City, { center: [number, number]; zoom: number }> = {
  "São Paulo": { center: [-23.63, -46.66], zoom: 12 },
  "São João da Boa Vista": { center: [-21.9698, -46.7985], zoom: 13 },
};

/** Every spelling seen in the wild, normalized (see `fold`). */
const ALIASES: Record<string, City> = {
  "sao paulo": "São Paulo",
  "圣保罗": "São Paulo",
  "sp": "São Paulo",
  "55000199": "São Paulo",
  "sao joao da boa vista": "São João da Boa Vista",
  "圣若昂达博阿维斯塔": "São João da Boa Vista",
  "圣若昂-达博阿维斯塔": "São João da Boa Vista",
  "sjbv": "São João da Boa Vista",
  "55000174": "São João da Boa Vista",
};

/** Lowercase, strip accents and collapse whitespace. */
function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve any spelling (or Eastwind city id) to the canonical city.
 * Unknown / empty values fall back to São Paulo — the pre-existing operation,
 * so legacy rows written before cities existed keep behaving as they did.
 */
export function canonicalCity(value: unknown): City {
  const key = fold(value);
  if (!key) return DEFAULT_CITY;
  const direct = ALIASES[key];
  if (direct) return direct;
  const exact = CITIES.find((city) => fold(city) === key);
  return exact ?? DEFAULT_CITY;
}

/** True when two city strings mean the same city, whatever their spelling. */
export function sameCity(a: unknown, b: unknown): boolean {
  return canonicalCity(a) === canonicalCity(b);
}
