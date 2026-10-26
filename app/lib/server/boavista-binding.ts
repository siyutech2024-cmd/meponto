/**
 * Boa Vista default binding (业务方 2026-10-26:"在这个区域内的骑手默认绑定到 SJBV 上")。
 *
 * Every rider the Boa Vista feed keeps (already inside the Boa Vista area —
 * see the zone filter in /api/eastwind/rider-status) is bound to the Boa Vista
 * franchise BY DEFAULT:
 *   - no MePonto profile yet          → a profile is created on that franchise
 *   - profile with no franchise yet   → that franchise is filled in
 *   - profile already on a franchise  → LEFT ALONE (never re-assigned)
 * Nothing historical moves: T+1 rows keep the attribution they were stamped
 * with at import; only the CURRENT binding of unbound riders is set. Station
 * (leader) stays "Unassigned" for ops to choose.
 *
 * Safety (2026-07-21 incident — auto-materialisation from a stale view):
 * the rider list is re-read from the database first, matching is by 99 ID /
 * CPF / phone, new profiles get a deterministic id (`r-sjbv-<99ID>`) so two
 * concurrent rounds can't create duplicates, and only touched records are
 * flushed. Runs only when exactly ONE Boa Vista franchise exists.
 * Kill switch: SJBV_AUTOBIND=off.
 */

import type { Rider } from "../data";
import { appendServerAudit, memory } from "./memory";
import { refreshCollectionsFromDatabase } from "./persistence";
import { boaVistaFranchiseNames } from "./regions";

type FeedRider = { rider_ext_id: string | null; rider_name: string | null; phone: string | null; id_no: string | null };

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const unbound = (value: unknown) => !value || value === "Unassigned";

export async function bindBoaVistaRiders(feed: FeedRider[]): Promise<{ franchise: string | null; created: number; bound: number; skipped?: string }> {
  if (process.env.SJBV_AUTOBIND === "off") return { franchise: null, created: 0, bound: 0, skipped: "disabled" };
  const names = [...(await boaVistaFranchiseNames())];
  if (names.length !== 1) return { franchise: null, created: 0, bound: 0, skipped: names.length ? "several Boa Vista franchises" : "no Boa Vista franchise" };
  const target = names[0];

  await refreshCollectionsFromDatabase(["riders"]);
  const riders = memory.riders as Rider[];
  // Keyed by rider id (not array index — new profiles are prepended below).
  const by99 = new Map<string, string>(), byCpf = new Map<string, string>(), byPhone = new Map<string, string>();
  for (const r of riders) {
    if (r.ninetyNineId) by99.set(String(r.ninetyNineId), r.id);
    if (digits(r.cpf).length === 11) byCpf.set(digits(r.cpf), r.id);
    if (digits(r.phone).length >= 10) byPhone.set(digits(r.phone), r.id);
  }
  const toCreate: Rider[] = [];

  let created = 0, bound = 0;
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  for (const f of feed) {
    const ext = digits(f.rider_ext_id);
    if (!ext || seen.has(ext)) continue;
    seen.add(ext);
    const cpf = digits(f.id_no);
    const phone = digits(f.phone);
    const matchId = by99.get(ext) ?? (cpf.length === 11 ? byCpf.get(cpf) : undefined) ?? (phone.length >= 10 ? byPhone.get(phone) : undefined);

    if (matchId === undefined) {
      const id = `r-sjbv-${ext}`;
      if (riders.some((r) => r.id === id)) continue; // another round already made it
      const rider: Rider = {
        id,
        name: String(f.rider_name ?? "").trim() || ext,
        cpf: cpf.length === 11 ? cpf : "",
        phone: f.phone ?? "",
        pix: "",
        bairro: "",
        ponto: "Unassigned",
        leader: "Unassigned",
        invitedBy: "Boa Vista feed",
        chatRoom: "MePonto Intake",
        ar: 100,
        status: "Active",
        vehicleType: "Motorcycle",
        brand: "Unknown",
        model: "To confirm",
        rentalStatus: "Unknown",
        isMottu: false,
        onlineHours: 0,
        nightShiftCount: 0,
        incidentCount: 0,
        joinDate: today,
        ninetyNineId: ext,
        franchise: target,
        birthday: "",
      } as Rider;
      toCreate.push(rider);
      by99.set(ext, id);
      if (rider.cpf) byCpf.set(rider.cpf, id);
      created += 1;
      appendServerAudit({ actor: "eastwind-sjbv", action: "RIDER_CREATED", entity: "Rider", entityId: id, detail: `${rider.name} (${ext}) → ${target}(Boa Vista 区域默认绑定)`, risk: "Low" });
      continue;
    }
    if (matchId.startsWith("r-sjbv-") && toCreate.some((r) => r.id === matchId)) continue; // created this round
    const index = riders.findIndex((r) => r.id === matchId);
    if (index < 0) continue;
    const current = riders[index];
    // Only riders with NO binding at all get the default; never re-assign.
    if (!unbound(current.franchise) || !unbound(current.ponto)) continue;
    riders[index] = { ...current, franchise: target };
    bound += 1;
    appendServerAudit({ actor: "eastwind-sjbv", action: "RIDER_ASSIGNED", entity: "Rider", entityId: current.id, detail: `${current.name} → franchise ${target}(Boa Vista 区域默认绑定,原未归属)`, risk: "Low" });
  }
  if (toCreate.length) riders.unshift(...toCreate);
  return { franchise: target, created, bound };
}
