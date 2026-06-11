import { acceptClientId, appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";
import { persistDeleteRecord, refreshCollectionsFromDatabase } from "../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../lib/server/authz";
import { parseEastwindShifts, type DispatchShift, type ShiftQuota, type ShiftSignup, type ShiftSignupStatus } from "../../lib/dispatch";

const DISPATCH_COLLECTIONS = ["dispatchShifts", "shiftQuotas", "shiftSignups"];

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

/** Aggregated board: shifts + quotas + signups, optionally filtered by date range. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "";
  // Rider self-service view only needs the rider-app permission.
  const forbidden = requirePermission(request, view === "open" ? "use_rider_app" : "manage_slots");
  if (forbidden) return forbidden;

  // Serverless instances hydrate once at boot — always read the latest state.
  await refreshCollectionsFromDatabase(DISPATCH_COLLECTIONS);

  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const franchiseScope = url.searchParams.get("franchise") ?? "";
  const stationScope = url.searchParams.get("station") ?? "";

  const shifts = memory.dispatchShifts
    .filter((shift) => (!from || shift.date >= from) && (!to || shift.date <= to))
    .filter((shift) => view !== "open" || shift.status === "scheduling")
    .sort((a, b) => (a.date + a.timeRange).localeCompare(b.date + b.timeRange));

  const shiftIds = new Set(shifts.map((shift) => shift.id));
  let quotas = memory.shiftQuotas.filter((quota) => shiftIds.has(quota.shiftId));
  let signups = memory.shiftSignups.filter((signup) => shiftIds.has(signup.shiftId));

  // Tenant scoping: franchise sees its own quotas/signups (incl. station-level
  // rows under it); a station sees only its own.
  if (franchiseScope) {
    quotas = quotas.filter((quota) => quota.franchise === franchiseScope);
    signups = signups.filter((signup) => signup.franchise === franchiseScope);
  }
  if (stationScope) {
    quotas = quotas.filter((quota) => (quota.level === "station" ? quota.station === stationScope : true));
    signups = signups.filter((signup) => signup.station === stationScope);
  }

  return jsonResponse({
    data: { shifts, quotas, signups },
    summary: {
      shifts: shifts.length,
      planned: shifts.reduce((sum, shift) => sum + shift.plannedCount, 0),
      approved: signups.filter((signup) => signup.status === "approved" || signup.status === "reported").length,
      pending: signups.filter((signup) => signup.status === "submitted").length,
      reportedShifts: shifts.filter((shift) => shift.reportedAt).length,
    },
  });
}

type ImportBody = {
  action: "import";
  planId?: string;
  planName?: string;
  city?: string;
  text: string;
};

type QuotaBody = {
  action: "quota";
  shiftId: string;
  level: "franchise" | "station";
  franchise: string;
  station?: string;
  quota: number;
};

type SignupBody = {
  action: "signup";
  shiftId: string;
  franchise: string;
  station: string;
  riders: Array<{ riderId?: string; riderName: string; rider99Id: string; riderCpf?: string }>;
};

type ReviewBody = {
  action: "review";
  signupIds: string[];
  status: Extract<ShiftSignupStatus, "approved" | "rejected" | "cancelled">;
  note?: string;
};

type ReportBody = {
  action: "report";
  shiftId: string;
  confirm?: boolean; // true → mark reported; false → just return the roster text
};

type SetWeekBody = {
  action: "setWeek";
  city?: string;
  hotzone?: string;
  entries: Array<{ date: string; timeRange: string; plannedCount: number; isCritical?: boolean }>;
};

type DeleteShiftBody = { action: "deleteShift"; shiftId: string };

type Body = ImportBody | QuotaBody | SignupBody | ReviewBody | ReportBody | SetWeekBody | DeleteShiftBody;

export async function POST(request: Request) {
  const peek = (await request.clone().json().catch(() => ({}))) as { action?: string };
  // Riders may submit their own signups from the rider app; everything else
  // stays behind the dispatch permission.
  const forbidden =
    peek.action === "signup"
      ? requirePermission(request, "use_rider_app") && requirePermission(request, "manage_slots")
      : requirePermission(request, "manage_slots");
  if (forbidden) return forbidden;

  const body = (await request.json().catch(() => ({}))) as Partial<Body>;
  const actor = roleFromRequest(request);

  // Work on the latest cross-instance state before mutating.
  await refreshCollectionsFromDatabase(DISPATCH_COLLECTIONS);

  switch (body.action) {
    case "import": {
      const { text, planId = "", planName = "", city = "圣保罗" } = body as ImportBody;
      if (!text || typeof text !== "string") {
        return jsonResponse({ error: "text is required" }, { status: 400 });
      }

      const parsed = parseEastwindShifts(text.slice(0, 200_000));
      if (parsed.length === 0) {
        return jsonResponse({ error: "no shifts recognized in pasted text" }, { status: 400 });
      }

      let created = 0;
      let updated = 0;
      const importedAt = nowStamp();
      for (const shift of parsed) {
        const record: DispatchShift = {
          ...shift,
          city: shift.city || city,
          planId,
          planName,
          importedAt,
        };
        const index = memory.dispatchShifts.findIndex((item) => item.id === record.id);
        if (index === -1) {
          memory.dispatchShifts.unshift(record);
          created += 1;
        } else {
          // Keep local workflow fields (reportedAt) on re-import.
          memory.dispatchShifts[index] = { ...memory.dispatchShifts[index], ...record, reportedAt: memory.dispatchShifts[index].reportedAt };
          updated += 1;
        }
      }

      appendServerAudit({
        actor,
        action: "DISPATCH_IMPORT_SHIFTS",
        entity: "DispatchShift",
        entityId: planId || "ad-hoc",
        detail: `Imported ${created} new and updated ${updated} shifts from Eastwind paste.`,
        risk: "Low",
      });

      return jsonResponse({ data: { created, updated, total: parsed.length } }, { status: 201 });
    }

    case "quota": {
      const { shiftId, level, franchise, station, quota } = body as QuotaBody;
      if (!shiftId || !franchise || !Number.isFinite(Number(quota)) || Number(quota) < 0) {
        return jsonResponse({ error: "shiftId, franchise and non-negative quota are required" }, { status: 400 });
      }
      if (level === "station" && !station) {
        return jsonResponse({ error: "station is required for station-level quota" }, { status: 400 });
      }
      if (!memory.dispatchShifts.some((shift) => shift.id === shiftId)) {
        return jsonResponse({ error: "shift not found" }, { status: 404 });
      }

      const id = `q-${shiftId}-${level}-${franchise}${station ? `-${station}` : ""}`.replace(/\s+/g, "_");
      const record: ShiftQuota = {
        id,
        shiftId,
        level: level === "station" ? "station" : "franchise",
        franchise,
        station: station || undefined,
        quota: Math.floor(Number(quota)),
        updatedAt: nowStamp(),
      };
      const index = memory.shiftQuotas.findIndex((item) => item.id === id);
      if (index === -1) memory.shiftQuotas.unshift(record);
      else memory.shiftQuotas[index] = record;

      return jsonResponse({ data: record }, { status: 201 });
    }

    case "signup": {
      const { shiftId, franchise, station, riders } = body as SignupBody;
      if (!shiftId || !franchise || !station || !Array.isArray(riders) || riders.length === 0) {
        return jsonResponse({ error: "shiftId, franchise, station and riders are required" }, { status: 400 });
      }
      const shift = memory.dispatchShifts.find((item) => item.id === shiftId);
      if (!shift) return jsonResponse({ error: "shift not found" }, { status: 404 });

      const createdAt = nowStamp();
      const createdRecords: ShiftSignup[] = [];
      const skipped: string[] = [];

      for (const rider of riders.slice(0, 200)) {
        const rider99Id = String(rider.rider99Id ?? "").trim();
        const riderName = String(rider.riderName ?? "").trim();
        if (!rider99Id || !/^\d{6,}$/.test(rider99Id)) {
          skipped.push(`${riderName || "?"} (99ID inválido)`);
          continue;
        }
        const duplicate = memory.shiftSignups.some(
          (item) => item.shiftId === shiftId && item.rider99Id === rider99Id && item.status !== "rejected" && item.status !== "cancelled",
        );
        if (duplicate) {
          skipped.push(`${riderName || rider99Id} (duplicado)`);
          continue;
        }

        const record: ShiftSignup = {
          id: acceptClientId(undefined) ?? makeServerId("sgn", memory.shiftSignups.length + 1 + createdRecords.length),
          shiftId,
          franchise,
          station,
          riderId: String(rider.riderId ?? "").trim(),
          riderName,
          rider99Id,
          riderCpf: String(rider.riderCpf ?? "").trim(),
          status: "submitted",
          note: "",
          createdAt,
          updatedAt: createdAt,
        };
        memory.shiftSignups.unshift(record);
        createdRecords.push(record);

        // Remember the rider's 99 id on the rider profile for next time.
        if (record.riderId) {
          const riderIndex = memory.riders.findIndex((item) => item.id === record.riderId);
          if (riderIndex !== -1) {
            memory.riders[riderIndex] = { ...memory.riders[riderIndex], ninetyNineId: rider99Id } as (typeof memory.riders)[number];
          }
        }
      }

      return jsonResponse({ data: { created: createdRecords.length, skipped } }, { status: 201 });
    }

    case "review": {
      const { signupIds, status, note } = body as ReviewBody;
      if (!Array.isArray(signupIds) || signupIds.length === 0 || !["approved", "rejected", "cancelled"].includes(String(status))) {
        return jsonResponse({ error: "signupIds and a valid status are required" }, { status: 400 });
      }

      let changed = 0;
      const stamp = nowStamp();
      for (const signupId of signupIds.slice(0, 500)) {
        const index = memory.shiftSignups.findIndex((item) => item.id === signupId);
        if (index === -1) continue;
        memory.shiftSignups[index] = {
          ...memory.shiftSignups[index],
          status,
          note: typeof note === "string" ? note.slice(0, 300) : memory.shiftSignups[index].note,
          updatedAt: stamp,
        };
        changed += 1;
      }

      appendServerAudit({
        actor,
        action: `DISPATCH_REVIEW_${String(status).toUpperCase()}`,
        entity: "ShiftSignup",
        entityId: `${changed} signups`,
        detail: `Review batch set ${changed} signups to ${status}.`,
        risk: status === "rejected" ? "Medium" : "Low",
      });

      return jsonResponse({ data: { changed } });
    }

    case "report": {
      const { shiftId, confirm } = body as ReportBody;
      const shift = memory.dispatchShifts.find((item) => item.id === shiftId);
      if (!shift) return jsonResponse({ error: "shift not found" }, { status: 404 });

      const roster = memory.shiftSignups.filter(
        (item) => item.shiftId === shiftId && (item.status === "approved" || item.status === "reported"),
      );
      const rosterText = roster.map((item) => item.rider99Id).join("\n");

      if (confirm) {
        const stamp = nowStamp();
        const shiftIndex = memory.dispatchShifts.findIndex((item) => item.id === shiftId);
        memory.dispatchShifts[shiftIndex] = { ...shift, reportedAt: stamp };
        for (const signup of roster) {
          const index = memory.shiftSignups.findIndex((item) => item.id === signup.id);
          if (index !== -1) memory.shiftSignups[index] = { ...memory.shiftSignups[index], status: "reported", updatedAt: stamp };
        }
        appendServerAudit({
          actor,
          action: "DISPATCH_SHIFT_REPORTED",
          entity: "DispatchShift",
          entityId: shiftId,
          detail: `Roster of ${roster.length} riders marked as reported to Eastwind.`,
          risk: "Low",
        });
      }

      return jsonResponse({
        data: {
          shiftId,
          count: roster.length,
          plannedCount: shift.plannedCount,
          rosterText,
          reportedAt: confirm ? memory.dispatchShifts.find((item) => item.id === shiftId)?.reportedAt : shift.reportedAt,
        },
      });
    }

    case "setWeek": {
      const { entries, hotzone = "Santo Amaro", city = "圣保罗" } = body as SetWeekBody;
      if (!Array.isArray(entries) || entries.length === 0) {
        return jsonResponse({ error: "entries are required" }, { status: 400 });
      }

      let created = 0;
      let updated = 0;
      const importedAt = nowStamp();

      for (const entry of entries.slice(0, 50)) {
        const date = String(entry.date ?? "");
        const timeRange = String(entry.timeRange ?? "").replace("-", "~");
        const plannedCount = Math.max(0, Math.floor(Number(entry.plannedCount)));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}~\d{1,2}:\d{2}$/.test(timeRange) || !Number.isFinite(plannedCount)) {
          continue;
        }

        const index = memory.dispatchShifts.findIndex(
          (shift) => shift.date === date && shift.timeRange === timeRange && shift.hotzone === hotzone,
        );
        if (index !== -1) {
          memory.dispatchShifts[index] = {
            ...memory.dispatchShifts[index],
            plannedCount,
            isCritical: entry.isCritical ?? memory.dispatchShifts[index].isCritical,
          };
          updated += 1;
        } else if (plannedCount > 0) {
          const record: DispatchShift = {
            id: `ms-${date}-${timeRange.replace(/[:~]/g, "")}-${hotzone.replace(/\s+/g, "")}`.toLowerCase(),
            planId: "",
            planName: "手动排班",
            city,
            hotzone,
            date,
            timeRange,
            plannedCount,
            filled99Count: 0,
            isCritical: entry.isCritical ?? false,
            status: "scheduling",
            importedAt,
          };
          memory.dispatchShifts.unshift(record);
          created += 1;
        }
      }

      appendServerAudit({
        actor,
        action: "DISPATCH_SET_WEEK",
        entity: "DispatchShift",
        entityId: hotzone,
        detail: `Manual weekly plan: ${created} shifts created, ${updated} updated.`,
        risk: "Low",
      });

      return jsonResponse({ data: { created, updated } }, { status: 201 });
    }

    case "deleteShift": {
      const { shiftId } = body as DeleteShiftBody;
      const index = memory.dispatchShifts.findIndex((shift) => shift.id === shiftId);
      if (index === -1) return jsonResponse({ error: "shift not found" }, { status: 404 });

      const removed = memory.dispatchShifts[index];
      memory.dispatchShifts.splice(index, 1);
      persistDeleteRecord("dispatchShifts", shiftId);

      let cleaned = 0;
      for (let i = memory.shiftQuotas.length - 1; i >= 0; i -= 1) {
        if (memory.shiftQuotas[i].shiftId === shiftId) {
          persistDeleteRecord("shiftQuotas", memory.shiftQuotas[i].id);
          memory.shiftQuotas.splice(i, 1);
          cleaned += 1;
        }
      }
      for (let i = memory.shiftSignups.length - 1; i >= 0; i -= 1) {
        if (memory.shiftSignups[i].shiftId === shiftId) {
          persistDeleteRecord("shiftSignups", memory.shiftSignups[i].id);
          memory.shiftSignups.splice(i, 1);
          cleaned += 1;
        }
      }

      appendServerAudit({
        actor,
        action: "DISPATCH_SHIFT_DELETED",
        entity: "DispatchShift",
        entityId: shiftId,
        detail: `Shift ${removed.date} ${removed.timeRange} ${removed.hotzone} deleted with ${cleaned} related quota/signup record(s).`,
        risk: "Medium",
      });

      return jsonResponse({ data: { ok: true, cleaned } });
    }

    default:
      return jsonResponse({ error: "unknown action" }, { status: 400 });
  }
}
