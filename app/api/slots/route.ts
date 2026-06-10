import { getSlotSummary, riderSlots, slotEnrollments, slotFeatureFlag, slotWorkflowSteps, type RiderSlot, type SlotEnrollment, type SlotApprovalStatus } from "../../lib/slots";
import { appendServerAudit, jsonResponse, memory } from "../../lib/server/memory";
import { getSupabaseServerClient } from "../../lib/supabase/server";
import { sessionFromRequest, type AuthSession } from "../../lib/auth-session";

type SlotState = {
  slots: RiderSlot[];
  enrollments: SlotEnrollment[];
  source: "supabase" | "memory";
  weekStart: string;
  weekEnd: string;
  weekStatus: string;
  weeks: Array<{ id: string; weekStart: string; weekEnd: string; status: string }>;
};

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  let state: SlotState;
  try {
    state = scopeSlotState(
      await loadSlotState(url.searchParams.get("weekStart") ?? undefined, session.portal === "rider"),
      session,
    );
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, { status: session.portal === "rider" ? 409 : 500 });
  }

  if (url.searchParams.get("format") === "csv") {
    if (session.role !== "Super Admin" && session.role !== "Regional Manager") {
      return jsonResponse({ error: "Only headquarters can export the final roster." }, { status: 403 });
    }
    return new Response(buildSlotRosterCsv(state), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="meponto-slot-roster.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  }

  return jsonResponse({
    data: {
      featureFlag: slotFeatureFlag,
      summary: {
        ...getSlotSummary(state.slots, state.enrollments),
        week: `${state.weekStart} / ${state.weekEnd}`,
      },
      slots: state.slots,
      enrollments: state.enrollments,
      weeks: state.weeks,
      weekStatus: state.weekStatus,
      workflow: slotWorkflowSteps,
      readModel: "slot_weekly_summary_read_model",
      source: state.source,
      viewer: {
        role: session.role,
        portal: session.portal,
        tenantId: session.tenantId,
        organization: session.organization,
      },
      standard: "docs/modules/slot-enrollment-contract.md",
    },
  });
}

export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Authentication required." }, { status: 401 });
  if (session.role !== "Rider") {
    return jsonResponse({ error: "Only rider accounts can submit slot applications." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    slotId?: string;
    riderTier?: number;
    note?: string;
  } | null;

  if (!body?.slotId) {
    return jsonResponse({ error: "slotId is required." }, { status: 400 });
  }

  const targetWeekStart = await weekStartForSlot(body.slotId);
  if (!targetWeekStart) {
    return jsonResponse({ error: "Slot not found." }, { status: 404 });
  }
  let state: SlotState;
  try {
    state = scopeSlotState(await loadSlotState(targetWeekStart, true), session);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, { status: 409 });
  }
  if (state.weekStatus !== "open") {
    return jsonResponse({ error: "This schedule week has not been opened for rider applications." }, { status: 409 });
  }
  const slot = state.slots.find((item) => item.id === body.slotId);
  if (!slot) {
    return jsonResponse({ error: "Slot not found." }, { status: 404 });
  }

  const riderTier = riderTierForSession(session);
  if (riderTier < 2) {
    return jsonResponse({ error: "Only OL tier-2+ riders can submit production slot applications." }, { status: 403 });
  }

  if (slot.status !== "open") {
    return jsonResponse({ error: "Slot has already started or is closed." }, { status: 409 });
  }

  if (slot.enrolled >= slot.capacity) {
    return jsonResponse({ error: "Slot is already full." }, { status: 409 });
  }

  const riderId = riderIdForSession(session);
  if (state.enrollments.some((item) => item.slotId === slot.id && item.riderId === riderId && !["rejected", "cancelled"].includes(item.status))) {
    return jsonResponse({ error: "You already submitted an application for this slot." }, { status: 409 });
  }

  const enrollment = {
    id: `enr-${crypto.randomUUID()}`,
    slotId: slot.id,
    riderId,
    riderName: session.name,
    riderTier,
    status: "submitted" as const,
    submittedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    note: body.note ?? "Submitted from rider app.",
  };

  if (state.source === "supabase") {
    const saved = await insertSupabaseEnrollment(enrollment, slot);
    if (!saved.ok) return jsonResponse({ error: saved.error }, { status: 409 });
  } else {
    memory.slotEnrollments.unshift(enrollment);
    slot.enrolled += 1;
  }

  appendServerAudit({
    actor: session.name,
    action: "slot.enrollment.submitted.v1",
    entity: "SlotEnrollment",
    entityId: enrollment.id,
    detail: `${session.name} submitted ${slot.date} ${slot.startTime}-${slot.endTime}.`,
    risk: "Low",
  });

  return jsonResponse({ data: enrollment }, { status: 201 });
}

export async function PUT(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Authentication required." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    enrollmentId?: string;
    action?: "ponto_approve" | "franchise_confirm" | "hq_review" | "reject";
    reviewer?: string;
    note?: string;
  } | null;

  if (!body?.enrollmentId || !body.action) {
    return jsonResponse({ error: "enrollmentId and action are required." }, { status: 400 });
  }

  const requiredRole = {
    ponto_approve: "Ponto Manager",
    franchise_confirm: "Franchise Admin",
    hq_review: "Super Admin",
    reject: "Ponto Manager",
  } as const;
  if (session.role !== requiredRole[body.action]) {
    return jsonResponse({ error: `${requiredRole[body.action]} is required for ${body.action}.` }, { status: 403 });
  }

  const targetWeekStart = await weekStartForEnrollment(body.enrollmentId);
  if (!targetWeekStart) {
    return jsonResponse({ error: "Enrollment not found." }, { status: 404 });
  }
  const state = scopeSlotState(await loadSlotState(targetWeekStart), session);
  const enrollment = state.enrollments.find((item) => item.id === body.enrollmentId);
  if (!enrollment) {
    return jsonResponse({ error: "Enrollment not found." }, { status: 404 });
  }

  const slot = state.slots.find((item) => item.id === enrollment.slotId);
  if (!slot) {
    return jsonResponse({ error: "Slot not found." }, { status: 404 });
  }

  const stampedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const reviewer = session.name;

  if (body.action === "ponto_approve") {
    if (enrollment.status !== "submitted") {
      return jsonResponse({ error: "Only submitted enrollments can be approved by the Ponto." }, { status: 409 });
    }
    enrollment.status = "ponto_approved";
    enrollment.pontoReviewedBy = reviewer;
    enrollment.pontoReviewedAt = stampedAt;
    enrollment.note = body.note ?? `Approved by ${slot.pontoName}.`;
  }

  if (body.action === "franchise_confirm") {
    if (enrollment.status !== "ponto_approved") {
      return jsonResponse({ error: "Only Ponto-approved enrollments can be confirmed by the franchise." }, { status: 409 });
    }
    enrollment.status = "franchise_confirmed";
    enrollment.franchiseConfirmedBy = reviewer;
    enrollment.franchiseConfirmedAt = stampedAt;
    enrollment.note = body.note ?? `Confirmed by ${slot.franchiseName}.`;
  }

  if (body.action === "hq_review") {
    if (enrollment.status !== "franchise_confirmed") {
      return jsonResponse({ error: "Only franchise-confirmed enrollments can be reviewed by HQ." }, { status: 409 });
    }
    enrollment.status = "hq_reviewed";
    enrollment.hqReviewedBy = reviewer;
    enrollment.hqReviewedAt = stampedAt;
    enrollment.note = body.note ?? `Reviewed by HQ for ${slot.pontoName}.`;
  }

  if (body.action === "reject") {
    if (enrollment.status === "franchise_confirmed" || enrollment.status === "hq_reviewed") {
      return jsonResponse({ error: "Confirmed or HQ-reviewed enrollments cannot be rejected in this MVP flow." }, { status: 409 });
    }
    enrollment.status = "rejected";
    enrollment.pontoReviewedBy = reviewer;
    enrollment.pontoReviewedAt = stampedAt;
    enrollment.note = body.note ?? `Rejected by ${slot.pontoName}.`;
    slot.enrolled = Math.max(0, slot.enrolled - 1);
  }

  if (state.source === "supabase") {
    const saved = await updateSupabaseEnrollment(enrollment, body.action);
    if (!saved.ok) return jsonResponse({ error: saved.error }, { status: 409 });
  }

  appendServerAudit({
    actor: reviewer,
    action: `slot.enrollment.${body.action}.v1`,
    entity: "SlotEnrollment",
    entityId: enrollment.id,
    detail: `${reviewer} changed ${enrollment.riderName} on ${slot.pontoName} ${slot.date} ${slot.startTime}-${slot.endTime}.`,
    risk: body.action === "reject" ? "Medium" : "Low",
  });

  return jsonResponse({ data: enrollment });
}

async function loadSlotState(requestedWeekStart?: string, openOnly = false): Promise<SlotState> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      slots: memory.riderSlots,
      enrollments: memory.slotEnrollments,
      source: "memory",
      weekStart: "2026-06-01",
      weekEnd: "2026-06-07",
      weekStatus: "open",
      weeks: [{ id: "memory-week", weekStart: "2026-06-01", weekEnd: "2026-06-07", status: "open" }],
    };
  }

  try {
    const client = getSupabaseServerClient();
    const { data: cycleRows, error: cycleError } = await client
      .from("quota_cycles")
      .select("id,business_week_start,business_week_end,status")
      .order("business_week_start", { ascending: false });

    if (cycleError) throw cycleError;
    const weeks = (cycleRows ?? []).map((row) => ({
      id: String(row.id),
      weekStart: String(row.business_week_start),
      weekEnd: String(row.business_week_end),
      status: String(row.status),
    }));
    const eligibleWeeks = openOnly ? weeks.filter((week) => week.status === "open") : weeks;
    const requestedWeek = requestedWeekStart
      ? eligibleWeeks.find((week) => week.weekStart === requestedWeekStart)
      : undefined;
    if (requestedWeekStart && !requestedWeek) {
      throw new Error(openOnly ? "This schedule week is not open for rider applications." : "Quota cycle not found.");
    }
    const selectedWeek = requestedWeek ?? chooseDefaultWeek(eligibleWeeks);
    const weekStart = selectedWeek?.weekStart ?? "2026-06-01";
    const weekEnd = addDays(weekStart, 6);
    const { data: slotRows, error: slotError } = await client
      .from("rider_slots")
      .select("*")
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (slotError) throw slotError;

    if (!slotRows?.length && !requestedWeekStart && !weeks.length) {
      await seedSupabaseSlots();
      return loadSlotState(requestedWeekStart, openOnly);
    }

    const slotIds = (slotRows ?? []).map((row) => String(row.id));
    let enrollmentRows: Record<string, unknown>[] = [];
    if (slotIds.length) {
      const { data: rows, error: enrollmentError } = await client
        .from("slot_enrollments")
        .select("*")
        .in("slot_id", slotIds)
        .order("submitted_at", { ascending: false });

      if (enrollmentError) throw enrollmentError;
      enrollmentRows = (rows ?? []) as Record<string, unknown>[];
    }

    return {
      slots: (slotRows ?? []).map(mapSupabaseSlot),
      enrollments: enrollmentRows.map(mapSupabaseEnrollment),
      source: "supabase",
      weekStart,
      weekEnd,
      weekStatus: selectedWeek?.status ?? "open",
      weeks,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? `Supabase slot query failed: ${error.message}` : "Supabase slot query failed.");
  }
}

async function weekStartForSlot(slotId: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return startOfBusinessWeek(memory.riderSlots.find((slot) => slot.id === slotId)?.date);
  }
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("rider_slots")
    .select("date")
    .eq("id", slotId)
    .maybeSingle();
  if (error) throw error;
  return startOfBusinessWeek(data?.date ? String(data.date) : undefined);
}

async function weekStartForEnrollment(enrollmentId: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const enrollment = memory.slotEnrollments.find((item) => item.id === enrollmentId);
    return enrollment ? weekStartForSlot(enrollment.slotId) : undefined;
  }
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("slot_enrollments")
    .select("slot_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) throw error;
  return data?.slot_id ? weekStartForSlot(String(data.slot_id)) : undefined;
}

function chooseDefaultWeek(weeks: SlotState["weeks"]) {
  if (!weeks.length) return undefined;
  const today = todayInSaoPaulo();
  const current = weeks.find((week) => week.weekStart <= today && week.weekEnd >= today);
  if (current) return current;
  const chronological = [...weeks].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  return chronological.find((week) => week.weekStart > today) ?? chronological.at(-1);
}

function todayInSaoPaulo() {
  return nowInSaoPaulo().date;
}

function nowInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
  };
}

function hasSlotStarted(date: string, startTime: string) {
  const now = nowInSaoPaulo();
  return `${date}T${startTime}` <= `${now.date}T${now.time}`;
}

function startOfBusinessWeek(date?: string) {
  if (!date) return undefined;
  const value = new Date(`${date}T12:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

async function seedSupabaseSlots() {
  const client = getSupabaseServerClient();
  await client.from("rider_slots").upsert(riderSlots.map(slotToSupabaseRow), { onConflict: "id" });
  await client.from("slot_enrollments").upsert(slotEnrollments.map(enrollmentToSupabaseRow), { onConflict: "id" });
}

async function insertSupabaseEnrollment(enrollment: SlotEnrollment, slot: RiderSlot) {
  try {
    const client = getSupabaseServerClient();
    const { error } = await client.rpc("submit_slot_enrollment", {
      p_id: enrollment.id,
      p_slot_id: slot.id,
      p_rider_external_id: enrollment.riderId,
      p_rider_name: enrollment.riderName,
      p_rider_tier: enrollment.riderTier,
      p_note: enrollment.note,
    });
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Supabase insert failed." };
  }
}

async function updateSupabaseEnrollment(enrollment: SlotEnrollment, action: string) {
  try {
    const client = getSupabaseServerClient();
    const reviewer =
      action === "hq_review"
        ? enrollment.hqReviewedBy
        : action === "franchise_confirm"
          ? enrollment.franchiseConfirmedBy
          : enrollment.pontoReviewedBy;
    const { error } = await client.rpc("review_slot_enrollment", {
      p_enrollment_id: enrollment.id,
      p_action: action,
      p_reviewer: reviewer ?? "Unknown reviewer",
      p_note: enrollment.note,
    });

    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Supabase update failed." };
  }
}

function mapSupabaseSlot(row: Record<string, unknown>): RiderSlot {
  const date = String(row.date);
  const startTime = String(row.start_time).slice(0, 5);
  return {
    id: String(row.id),
    dayKey: dayKeyFromDate(date),
    date,
    weekday: String(row.weekday),
    startTime,
    endTime: String(row.end_time).slice(0, 5),
    capacity: Number(row.capacity ?? 0),
    enrolled: Number(row.enrolled ?? 0),
    status: row.status === "open" && !hasSlotStarted(date, startTime) ? "open" : "ended",
    priority: Boolean(row.priority),
    pontoId: String(row.ponto_external_id ?? ""),
    pontoName: String(row.ponto_name ?? ""),
    franchiseId: String(row.franchise_id ?? ""),
    franchiseName: String(row.franchise_name ?? ""),
    quotaNote: String(row.quota_note ?? ""),
  };
}

function scopeSlotState(state: SlotState, session: AuthSession): SlotState {
  if (session.portal === "pontosys") return state;

  let slots = state.slots;
  if (session.portal === "franchise") {
    const franchiseId = franchiseIdForTenant(session.tenantId);
    slots = slots.filter((slot) => slot.franchiseId === franchiseId);
  }
  if (session.portal === "ponto" || session.portal === "rider") {
    const pontoId = pontoIdForTenant(session.tenantId);
    slots = slots.filter((slot) => slot.pontoId === pontoId);
  }

  const slotIds = new Set(slots.map((slot) => slot.id));
  let enrollments = state.enrollments.filter((item) => slotIds.has(item.slotId));
  if (session.portal === "rider") {
    const riderId = riderIdForSession(session);
    enrollments = enrollments.filter((item) => item.riderId === riderId);
  }
  return { ...state, slots, enrollments };
}

function franchiseIdForTenant(tenantId: string) {
  const map: Record<string, string> = {
    "tenant-fr-sp-core": "fr-sp-01",
    "tenant-fr-tatuape": "fr-sp-02",
  };
  return map[tenantId] ?? tenantId;
}

function pontoIdForTenant(tenantId: string) {
  const map: Record<string, string> = {
    "tenant-st-paulista": "p-001",
    "tenant-st-liberdade": "p-002",
    "tenant-st-tatuape": "p-003",
  };
  return map[tenantId] ?? tenantId;
}

function riderIdForSession(session: AuthSession) {
  const map: Record<string, string> = {
    "acct-rider": "r-1001",
  };
  return map[session.userId] ?? session.userId;
}

function riderTierForSession(session: AuthSession) {
  const map: Record<string, number> = {
    "acct-rider": 3,
  };
  return map[session.userId] ?? 1;
}

function dayKeyFromDate(date: string): RiderSlot["dayKey"] {
  const keys: RiderSlot["dayKey"][] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return keys[day];
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function mapSupabaseEnrollment(row: Record<string, unknown>): SlotEnrollment {
  return {
    id: String(row.id),
    slotId: String(row.slot_id),
    riderId: String(row.rider_external_id ?? ""),
    riderName: String(row.rider_name ?? ""),
    riderTier: Number(row.rider_tier ?? 1),
    status: String(row.status) as SlotApprovalStatus,
    submittedAt: formatDbDate(row.submitted_at) ?? "",
    pontoReviewedBy: nullableString(row.ponto_reviewed_by),
    pontoReviewedAt: formatDbDate(row.ponto_reviewed_at),
    franchiseConfirmedBy: nullableString(row.franchise_confirmed_by),
    franchiseConfirmedAt: formatDbDate(row.franchise_confirmed_at),
    hqReviewedBy: nullableString(row.hq_reviewed_by),
    hqReviewedAt: formatDbDate(row.hq_reviewed_at),
    note: String(row.note ?? ""),
  };
}

function slotToSupabaseRow(slot: RiderSlot) {
  return {
    id: slot.id,
    week: "2026-06-01 / 2026-06-07",
    date: slot.date,
    weekday: slot.weekday,
    start_time: slot.startTime,
    end_time: slot.endTime,
    ponto_external_id: slot.pontoId,
    ponto_name: slot.pontoName,
    franchise_id: slot.franchiseId,
    franchise_name: slot.franchiseName,
    capacity: slot.capacity,
    enrolled: slot.enrolled,
    status: slot.status === "open" ? "open" : "closed",
    priority: slot.priority,
    quota_note: slot.quotaNote,
  };
}

function enrollmentToSupabaseRow(enrollment: SlotEnrollment) {
  return {
    id: enrollment.id,
    slot_id: enrollment.slotId,
    rider_external_id: enrollment.riderId,
    rider_name: enrollment.riderName,
    rider_tier: enrollment.riderTier,
    status: enrollment.status,
    submitted_at: enrollment.submittedAt,
    ponto_reviewed_by: enrollment.pontoReviewedBy ?? null,
    ponto_reviewed_at: enrollment.pontoReviewedAt ?? null,
    franchise_confirmed_by: enrollment.franchiseConfirmedBy ?? null,
    franchise_confirmed_at: enrollment.franchiseConfirmedAt ?? null,
    hq_reviewed_by: enrollment.hqReviewedBy ?? null,
    hq_reviewed_at: enrollment.hqReviewedAt ?? null,
    note: enrollment.note,
  };
}

function nullableString(value: unknown) {
  return value == null ? undefined : String(value);
}

function formatDbDate(value: unknown) {
  if (!value) return undefined;
  return String(value).slice(0, 16).replace("T", " ");
}

function buildSlotRosterCsv(state: SlotState) {
  const headers = [
    "enrollment_id",
    "status",
    "rider_id",
    "rider_name",
    "rider_tier",
    "slot_id",
    "date",
    "weekday",
    "start_time",
    "end_time",
    "ponto_id",
    "ponto_name",
    "franchise_id",
    "franchise_name",
    "capacity",
    "enrolled",
    "submitted_at",
    "ponto_reviewed_by",
    "ponto_reviewed_at",
    "franchise_confirmed_by",
    "franchise_confirmed_at",
    "hq_reviewed_by",
    "hq_reviewed_at",
    "note",
  ];

  const rows = state.enrollments.map((enrollment) => {
    const slot = state.slots.find((item) => item.id === enrollment.slotId);
    return [
      enrollment.id,
      enrollment.status,
      enrollment.riderId,
      enrollment.riderName,
      enrollment.riderTier,
      enrollment.slotId,
      slot?.date ?? "",
      slot?.weekday ?? "",
      slot?.startTime ?? "",
      slot?.endTime ?? "",
      slot?.pontoId ?? "",
      slot?.pontoName ?? "",
      slot?.franchiseId ?? "",
      slot?.franchiseName ?? "",
      slot?.capacity ?? "",
      slot?.enrolled ?? "",
      enrollment.submittedAt,
      enrollment.pontoReviewedBy ?? "",
      enrollment.pontoReviewedAt ?? "",
      enrollment.franchiseConfirmedBy ?? "",
      enrollment.franchiseConfirmedAt ?? "",
      enrollment.hqReviewedBy ?? "",
      enrollment.hqReviewedAt ?? "",
      enrollment.note,
    ].map(csvCell).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Supabase slot query failed:\s*/, "") : "Slot request failed.";
}
