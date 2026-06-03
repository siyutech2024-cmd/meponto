import { getSlotSummary, slotFeatureFlag, slotWorkflowSteps } from "../../lib/slots";
import { appendServerAudit, jsonResponse, makeServerId, memory } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({
    data: {
      featureFlag: slotFeatureFlag,
      summary: getSlotSummary(memory.riderSlots, memory.slotEnrollments),
      slots: memory.riderSlots,
      enrollments: memory.slotEnrollments,
      workflow: slotWorkflowSteps,
      readModel: "slot_weekly_summary_read_model",
      standard: "docs/modules/slot-enrollment-contract.md",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    slotId?: string;
    riderId?: string;
    riderName?: string;
    riderTier?: number;
    note?: string;
  } | null;

  if (!body?.slotId || !body.riderId || !body.riderName) {
    return jsonResponse({ error: "slotId, riderId, and riderName are required." }, { status: 400 });
  }

  const slot = memory.riderSlots.find((item) => item.id === body.slotId);
  if (!slot) {
    return jsonResponse({ error: "Slot not found." }, { status: 404 });
  }

  if ((body.riderTier ?? 1) < 2) {
    return jsonResponse({ error: "Only OL tier-2+ riders can submit production slot applications." }, { status: 403 });
  }

  if (slot.enrolled >= slot.capacity) {
    return jsonResponse({ error: "Slot is already full." }, { status: 409 });
  }

  const enrollment = {
    id: makeServerId("enr", memory.slotEnrollments.length + 1),
    slotId: slot.id,
    riderId: body.riderId,
    riderName: body.riderName,
    riderTier: body.riderTier ?? 2,
    status: "submitted" as const,
    submittedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    note: body.note ?? "Submitted from rider app.",
  };

  memory.slotEnrollments.unshift(enrollment);
  slot.enrolled += 1;

  appendServerAudit({
    actor: body.riderName,
    action: "slot.enrollment.submitted.v1",
    entity: "SlotEnrollment",
    entityId: enrollment.id,
    detail: `${body.riderName} submitted ${slot.date} ${slot.startTime}-${slot.endTime}.`,
    risk: "Low",
  });

  return jsonResponse({ data: enrollment }, { status: 201 });
}
