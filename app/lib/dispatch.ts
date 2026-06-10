/**
 * Dispatch center domain model — bridges the 99Food Eastwind weekly schedule
 * with MePonto's HQ → franchise → station → rider signup chain.
 *
 * Flow: import Eastwind plan shifts → HQ allocates quota per franchise →
 * franchise allocates per station → stations sign riders up → HQ reviews →
 * operations copies the approved rider-ID list into Eastwind and marks the
 * shift as reported.
 */

export type DispatchShiftStatus = "scheduling" | "executing" | "finished";

export type DispatchShift = {
  id: string; // Eastwind shift id (16+ digits)
  planId: string;
  planName: string;
  city: string;
  hotzone: string;
  date: string; // YYYY-MM-DD
  timeRange: string; // "11:00~14:00"
  plannedCount: number;
  filled99Count: number; // riders already scheduled on Eastwind (at import time)
  isCritical: boolean;
  status: DispatchShiftStatus;
  reportedAt?: string; // when operations submitted the roster to Eastwind
  importedAt: string;
};

export type ShiftQuota = {
  id: string;
  shiftId: string;
  level: "franchise" | "station";
  franchise: string;
  station?: string;
  quota: number;
  updatedAt: string;
};

export type ShiftSignupStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "reported"
  | "cancelled";

export type ShiftSignup = {
  id: string;
  shiftId: string;
  franchise: string;
  station: string;
  riderId: string; // MePonto rider id
  riderName: string;
  rider99Id: string; // Eastwind rider id used for reporting
  riderCpf: string;
  status: ShiftSignupStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export const dispatchShifts: DispatchShift[] = [];
export const shiftQuotas: ShiftQuota[] = [];
export const shiftSignups: ShiftSignup[] = [];

const statusWords: Record<string, DispatchShiftStatus> = {
  排班中: "scheduling",
  执行中: "executing",
  已结束: "finished",
  scheduling: "scheduling",
  executing: "executing",
  finished: "finished",
};

export type ParsedShift = Omit<DispatchShift, "planId" | "planName" | "importedAt">;

/**
 * Parse shifts copied from the Eastwind plan-detail table (or a simple CSV).
 *
 * Tolerant token scanner: a shift starts at a 15+ digit id; afterwards we
 * pick up critical flag (是/否), the first plain date (schedule date), the
 * time range (HH:MM~HH:MM), planned count (first integer after the range),
 * filled count (last integer before the status word) and the status word.
 * Timestamp pairs like "2026-06-05 18:00:00" are skipped. Everything else
 * between the date and time range that isn't "--" is treated as hotzone text.
 */
export function parseEastwindShifts(raw: string): ParsedShift[] {
  const tokens = raw
    .replace(/[,;\t]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const shifts: ParsedShift[] = [];
  let current: Partial<ParsedShift> & { numbersAfterRange: number[] } = { numbersAfterRange: [] };

  const flush = () => {
    if (!current.id || !current.date || !current.timeRange) return;
    shifts.push({
      id: current.id,
      city: current.city ?? "",
      hotzone: current.hotzone ?? "",
      date: current.date,
      timeRange: current.timeRange,
      plannedCount: current.numbersAfterRange[0] ?? 0,
      filled99Count: current.numbersAfterRange.length > 1 ? current.numbersAfterRange[current.numbersAfterRange.length - 1] : 0,
      isCritical: current.isCritical ?? false,
      status: current.status ?? "scheduling",
    });
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (/^\d{15,}$/.test(token)) {
      flush();
      current = { id: token, numbersAfterRange: [] };
      continue;
    }
    if (!current.id) continue;

    if (token === "是" || /^yes$/i.test(token)) {
      current.isCritical = true;
      continue;
    }
    if (token === "否" || /^no$/i.test(token)) {
      current.isCritical = false;
      continue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      // Skip timestamp pairs (publish/open/close times).
      if (index + 1 < tokens.length && /^\d{2}:\d{2}(:\d{2})?$/.test(tokens[index + 1])) {
        index += 1;
        continue;
      }
      if (!current.date) current.date = token;
      continue;
    }

    if (/^\d{1,2}:\d{2}[~-]\d{1,2}:\d{2}$/.test(token)) {
      current.timeRange = token.replace("-", "~");
      continue;
    }

    if (/^\d{1,4}$/.test(token)) {
      if (current.timeRange) current.numbersAfterRange.push(Number(token));
      continue;
    }

    if (statusWords[token]) {
      current.status = statusWords[token];
      continue;
    }

    if (token === "--") continue;

    // Free text between date and time range → hotzone name (may be multi-word).
    if (current.date && !current.timeRange) {
      current.hotzone = current.hotzone ? `${current.hotzone} ${token}` : token;
    }
  }
  flush();

  return shifts.filter((shift) => shift.plannedCount > 0 || shift.timeRange);
}

export function shiftLabel(shift: Pick<DispatchShift, "date" | "timeRange" | "hotzone">): string {
  return `${shift.date} ${shift.timeRange} · ${shift.hotzone}`;
}
