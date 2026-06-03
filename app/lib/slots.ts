export type SlotDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type SlotEnrollmentStatus = "open" | "full" | "ended";
export type SlotApprovalStatus = "submitted" | "ponto_approved" | "franchise_confirmed" | "rejected" | "cancelled";

export type RiderSlot = {
  id: string;
  dayKey: SlotDayKey;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  capacity: number;
  enrolled: number;
  status: SlotEnrollmentStatus;
  priority: boolean;
  pontoId: string;
  pontoName: string;
  franchiseId: string;
  franchiseName: string;
};

export type SlotEnrollment = {
  id: string;
  slotId: string;
  riderId: string;
  riderName: string;
  riderTier: number;
  status: SlotApprovalStatus;
  submittedAt: string;
  pontoReviewedBy?: string;
  pontoReviewedAt?: string;
  franchiseConfirmedBy?: string;
  franchiseConfirmedAt?: string;
  note: string;
};

export type SlotWorkflowStep = {
  key: string;
  label: string;
  owner: string;
  output: string;
  guardrail: string;
};

export const slotFeatureFlag = "slot_enrollment_beta";

export const slotWorkflowSteps: SlotWorkflowStep[] = [
  {
    key: "rider_submit",
    label: "Rider submits slot application",
    owner: "Rider App",
    output: "slot.enrollment.submitted.v1",
    guardrail: "Only active tier-2+ OL riders can submit production slot applications.",
  },
  {
    key: "ponto_review",
    label: "Ponto reviews capacity and local fit",
    owner: "Ponto Manager / Leader",
    output: "slot.enrollment.ponto_approved.v1",
    guardrail: "Ponto cannot approve above capacity unless a controlled overbook rule exists.",
  },
  {
    key: "franchise_confirm",
    label: "Franchise confirms operating cost and commitment",
    owner: "Franchise",
    output: "slot.enrollment.franchise_confirmed.v1",
    guardrail: "Confirmation freezes the rider into the operational plan for that slot window.",
  },
  {
    key: "hq_summary",
    label: "Headquarters receives aggregated data",
    owner: "Master Admin",
    output: "slot.summary.generated.v1",
    guardrail: "HQ reads summary projections and audit records, not private rider edits from other modules.",
  },
];

export const riderSlots: RiderSlot[] = [
  { id: "slot-20260601-1100", dayKey: "mon", date: "2026-06-01", weekday: "周一", startTime: "11:00", endTime: "14:00", capacity: 17, enrolled: 17, status: "ended", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260601-1400", dayKey: "mon", date: "2026-06-01", weekday: "周一", startTime: "14:00", endTime: "18:00", capacity: 11, enrolled: 11, status: "ended", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260601-1800", dayKey: "mon", date: "2026-06-01", weekday: "周一", startTime: "18:00", endTime: "22:00", capacity: 16, enrolled: 16, status: "ended", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260602-1100", dayKey: "tue", date: "2026-06-02", weekday: "周二", startTime: "11:00", endTime: "14:00", capacity: 17, enrolled: 17, status: "ended", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260602-1400", dayKey: "tue", date: "2026-06-02", weekday: "周二", startTime: "14:00", endTime: "18:00", capacity: 11, enrolled: 11, status: "ended", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260602-1800", dayKey: "tue", date: "2026-06-02", weekday: "周二", startTime: "18:00", endTime: "22:00", capacity: 16, enrolled: 16, status: "ended", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260603-1100", dayKey: "wed", date: "2026-06-03", weekday: "周三", startTime: "11:00", endTime: "14:00", capacity: 17, enrolled: 17, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260603-1400", dayKey: "wed", date: "2026-06-03", weekday: "周三", startTime: "14:00", endTime: "18:00", capacity: 11, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260603-1800", dayKey: "wed", date: "2026-06-03", weekday: "周三", startTime: "18:00", endTime: "22:00", capacity: 16, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260604-1100", dayKey: "thu", date: "2026-06-04", weekday: "周四", startTime: "11:00", endTime: "14:00", capacity: 17, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260604-1400", dayKey: "thu", date: "2026-06-04", weekday: "周四", startTime: "14:00", endTime: "18:00", capacity: 11, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260604-1800", dayKey: "thu", date: "2026-06-04", weekday: "周四", startTime: "18:00", endTime: "22:00", capacity: 16, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260605-1100", dayKey: "fri", date: "2026-06-05", weekday: "周五", startTime: "11:00", endTime: "14:00", capacity: 20, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260605-1400", dayKey: "fri", date: "2026-06-05", weekday: "周五", startTime: "14:00", endTime: "18:00", capacity: 13, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260605-1800", dayKey: "fri", date: "2026-06-05", weekday: "周五", startTime: "18:00", endTime: "22:00", capacity: 21, enrolled: 0, status: "open", priority: true, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260606-1100", dayKey: "sat", date: "2026-06-06", weekday: "周六", startTime: "11:00", endTime: "14:00", capacity: 20, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260606-1400", dayKey: "sat", date: "2026-06-06", weekday: "周六", startTime: "14:00", endTime: "18:00", capacity: 13, enrolled: 0, status: "open", priority: false, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260606-1800", dayKey: "sat", date: "2026-06-06", weekday: "周六", startTime: "18:00", endTime: "22:00", capacity: 21, enrolled: 0, status: "open", priority: true, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260607-1100", dayKey: "sun", date: "2026-06-07", weekday: "周日", startTime: "11:00", endTime: "14:00", capacity: 18, enrolled: 0, status: "open", priority: true, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260607-1400", dayKey: "sun", date: "2026-06-07", weekday: "周日", startTime: "14:00", endTime: "18:00", capacity: 14, enrolled: 0, status: "open", priority: true, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
  { id: "slot-20260607-1800", dayKey: "sun", date: "2026-06-07", weekday: "周日", startTime: "18:00", endTime: "22:00", capacity: 22, enrolled: 0, status: "open", priority: true, pontoId: "p-002", pontoName: "Ponto Liberdade Sul", franchiseId: "fr-sp-01", franchiseName: "SP Core Franchise" },
];

export const slotEnrollments: SlotEnrollment[] = [
  { id: "enr-001", slotId: "slot-20260603-1100", riderId: "r-1002", riderName: "Andre Santos", riderTier: 5, status: "franchise_confirmed", submittedAt: "2026-06-03 08:12", pontoReviewedBy: "Joao Pereira", pontoReviewedAt: "2026-06-03 08:18", franchiseConfirmedBy: "SP Core Franchise", franchiseConfirmedAt: "2026-06-03 08:31", note: "Night rider, confirmed for lunch peak." },
  { id: "enr-002", slotId: "slot-20260605-1800", riderId: "r-1001", riderName: "Carlos Mendes", riderTier: 3, status: "ponto_approved", submittedAt: "2026-06-03 09:05", pontoReviewedBy: "Rafael Costa", pontoReviewedAt: "2026-06-03 09:22", note: "Waiting franchise cost confirmation." },
  { id: "enr-003", slotId: "slot-20260607-1800", riderId: "r-1003", riderName: "Felipe Rocha", riderTier: 2, status: "submitted", submittedAt: "2026-06-03 09:40", note: "Priority Sunday night slot. Ponto review pending." },
];

export function getSlotSummary(slots = riderSlots, enrollments = slotEnrollments) {
  const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const enrolled = slots.reduce((sum, slot) => sum + slot.enrolled, 0);
  const submitted = enrollments.filter((item) => item.status === "submitted").length;
  const pontoApproved = enrollments.filter((item) => item.status === "ponto_approved").length;
  const franchiseConfirmed = enrollments.filter((item) => item.status === "franchise_confirmed").length;
  const prioritySlots = slots.filter((slot) => slot.priority).length;

  return {
    week: "2026-06-01 / 2026-06-07",
    slots: slots.length,
    capacity,
    enrolled,
    fillRate: Math.round((enrolled / capacity) * 100),
    submitted,
    pontoApproved,
    franchiseConfirmed,
    prioritySlots,
  };
}
