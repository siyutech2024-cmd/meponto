"use client";

/**
 * Client side of the region split (see app/lib/regions.ts): which menu this
 * page was opened from, plus the franchise membership needed to filter
 * client-computed lists. View-layer only — never writes.
 */

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isBoaVistaFranchise, regionFromPath, regionHref, REGION_CITY, REGION_CITY_ID, SJBV_ZONE_ID, type Region } from "./regions";

type FranchiseLite = { name: string; city?: string | null; leaderMode?: boolean | null };

export function useRegion(headers?: Record<string, string>) {
  const pathname = usePathname();
  const region: Region = regionFromPath(pathname);
  const [franchises, setFranchises] = useState<FranchiseLite[]>([]);
  const [zoneFranchises, setZoneFranchises] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  // Tenant portals (franchise / station) are already scoped to their own
  // franchise by the server — no region filtering on top of that.
  const [scoped, setScoped] = useState(false);
  const headerKey = JSON.stringify(headers ?? {});

  useEffect(() => {
    let alive = true;
    const h = { "Content-Type": "application/json", ...(JSON.parse(headerKey) as Record<string, string>) };
    void Promise.all([
      fetch("/api/network", { headers: h, cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/eastwind/zone-assignments", { headers: h, cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([network, zones]) => {
      if (!alive) return;
      setFranchises((network?.data?.franchises ?? []) as FranchiseLite[]);
      setScoped(Boolean(network?.data?.scoped));
      const zone = ((zones?.data ?? []) as Array<{ id: string; franchises?: string[]; franchise?: string }>).find((z) => z.id === SJBV_ZONE_ID);
      setZoneFranchises(new Set([...(zone?.franchises ?? []), ...(zone?.franchise ? [zone.franchise] : [])]));
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [headerKey]);

  const boaVista = useMemo(() => {
    const set = new Set(zoneFranchises);
    for (const f of franchises) if (isBoaVistaFranchise(f, zoneFranchises)) set.add(f.name);
    return set;
  }, [franchises, zoneFranchises]);

  /** Does a row owned by `franchise` belong on this page? Unassigned → São Paulo. */
  const inRegion = useMemo(
    () => (franchise: string | null | undefined) => scoped || (region === "sjbv") === boaVista.has(String(franchise ?? "")),
    [region, boaVista, scoped],
  );

  return useMemo(
    () => ({
      region,
      isBoaVista: region === "sjbv",
      city: REGION_CITY[region],
      cityId: REGION_CITY_ID[region],
      boaVistaFranchises: boaVista,
      inRegion,
      ready,
      scoped,
      /** Query param for region-aware APIs ("" for tenant portals). */
      regionQuery: scoped ? "" : `region=${region}`,
      href: (base: string) => regionHref(base, region),
    }),
    [region, boaVista, inRegion, ready, scoped],
  );
}
