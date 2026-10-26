/**
 * Server-side region filter (see app/lib/regions.ts).
 *
 * APIs accept an optional `region=sp|sjbv` query param. Absent → no filtering
 * (every existing caller — franchise portals, the rider app, exports — sees
 * exactly what it saw before). Present → rows are kept by their franchise:
 *   sjbv → the franchise is part of the Boa Vista operation
 *   sp   → everything else (incl. "Unassigned"), i.e. the pre-existing view
 * READ-ONLY: this only narrows what a GET returns; it never writes.
 */

import { scopeFromRequest } from "./authz";
import { memory } from "./memory";
import { refreshCollectionsFromDatabase } from "./persistence";
import { isBoaVistaFranchise, SJBV_ZONE_ID, type Region } from "../regions";

export function regionParam(url: URL): Region | null {
  const value = url.searchParams.get("region")?.trim();
  return value === "sjbv" || value === "sp" ? value : null;
}

/** Names of every franchise that belongs to the Boa Vista operation. */
export async function boaVistaFranchiseNames(): Promise<Set<string>> {
  await refreshCollectionsFromDatabase(["franchises", "hotZoneAssignments"]);
  const zone = (memory.hotZoneAssignments ?? []).find((z) => z.id === SJBV_ZONE_ID);
  const zoneFranchises = new Set<string>([...(zone?.franchises ?? []), ...(zone?.franchise ? [zone.franchise] : [])]);
  const names = new Set<string>(zoneFranchises);
  for (const franchise of memory.franchises ?? []) {
    if (isBoaVistaFranchise(franchise, zoneFranchises)) names.add(franchise.name);
  }
  return names;
}

/**
 * Predicate for `region`, or null when the request carries no region (= no
 * filtering). Usage: `const inRegion = await regionFilter(request); if (inRegion)
 * rows = rows.filter((r) => inRegion(r.franchise));`
 */
export async function regionFilter(request: Request, url: URL = new URL(request.url)): Promise<((franchise: string | null | undefined) => boolean) | null> {
  const region = regionParam(url);
  if (!region) return null;
  // Franchise / station portals are already pinned to their own franchise —
  // a Boa Vista franchise admin must keep seeing their riders on every page.
  const scope = await scopeFromRequest(request);
  if (scope.franchise || scope.station) return null;
  const boaVista = await boaVistaFranchiseNames();
  return region === "sjbv"
    ? (franchise) => boaVista.has(String(franchise ?? ""))
    : (franchise) => !boaVista.has(String(franchise ?? ""));
}
