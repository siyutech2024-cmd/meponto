/**
 * Operating regions = separate sidebar menus (业务方 2026-10-26 定).
 *
 * São Paulo (old OL, physical Pontos) and São João da Boa Vista (dedicated
 * account, leader mode) are run as two separate operations. The same pages
 * serve both; the REGION comes from the URL: anything under a `/boavista`
 * segment is the Boa Vista menu, everything else is São Paulo — so the
 * existing São Paulo URLs keep working exactly as before.
 *
 * VIEW-LAYER ONLY: nothing here writes data. A rider's region is derived on
 * read from their franchise (or, for not-yet-assigned riders, from the city
 * board they appear on), so no stored record is changed and no history moves.
 */

import { CITY_IDS, type City } from "./cities";

export type Region = "sp" | "sjbv";

export const REGION_CITY: Record<Region, City> = {
  sp: "São Paulo",
  sjbv: "São João da Boa Vista",
};

export const REGION_CITY_ID: Record<Region, string> = {
  sp: CITY_IDS["São Paulo"],
  sjbv: CITY_IDS["São João da Boa Vista"],
};

/** Zone id of the Boa Vista hot area (app/rider-monitor/hot-zones.ts). */
export const SJBV_ZONE_ID = "sjbv-hot";

export function regionFromPath(pathname: string | null | undefined): Region {
  return /\/boavista(\/|$)/.test(pathname ?? "") ? "sjbv" : "sp";
}

/** URL of a page inside a region's menu, e.g. ("/riders", "sjbv") → "/riders/boavista". */
export function regionHref(base: string, region: Region): string {
  return region === "sjbv" ? `${base.replace(/\/$/, "")}/boavista` : base;
}

const BOA_VISTA_RE = /boa\s*vista|sjbv|博阿维斯塔/i;

/**
 * Is this franchise part of the Boa Vista operation? Matched on what the
 * franchise record already says — leader mode, its city or name — or on HQ
 * having given it the Boa Vista hot zone. Everything else stays São Paulo, so an unrecognised
 * franchise never silently disappears from the São Paulo menu.
 */
export function isBoaVistaFranchise(
  franchise: { name?: string | null; city?: string | null; leaderMode?: boolean | null } | null | undefined,
  boaVistaZoneFranchises?: ReadonlySet<string>,
): boolean {
  if (!franchise) return false;
  const name = String(franchise.name ?? "");
  if (boaVistaZoneFranchises?.has(name)) return true;
  // Leader mode is the Boa Vista operating model (São Paulo runs physical
  // Pontos), so a leader-mode franchise belongs to Boa Vista even when its
  // city field was never filled in.
  if (franchise.leaderMode === true) return true;
  return BOA_VISTA_RE.test(String(franchise.city ?? "")) || BOA_VISTA_RE.test(name);
}
