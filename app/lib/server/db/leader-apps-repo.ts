import { selectRows, updateRows, upsertRows, type Where } from "./core";

/**
 * Leader Mode applications repository — `leader_applications` real table
 * (docs/leader-mode-design.md §7). Routes call these methods only.
 */

export type LeaderApplicationKind = "open_station" | "join_station" | "transfer";
export type LeaderApplicationStatus = "pending" | "approved" | "rejected";

export type LeaderApplication = {
  id: string;
  kind: LeaderApplicationKind;
  franchise: string;
  applicantRiderId: string;
  applicantName: string;
  targetStationId?: string;
  proposedStationName?: string;
  channel: "self" | "leader_referral" | "franchisee";
  referrerStationId?: string;
  eligibility: { orders28d: number; activeDays28d: number };
  status: LeaderApplicationStatus;
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
};

type Row = {
  id: string;
  kind: string;
  franchise: string;
  applicant_rider_id: string;
  applicant_name: string;
  target_station_id: string | null;
  proposed_station_name: string | null;
  channel: string;
  referrer_station_id: string | null;
  eligibility: LeaderApplication["eligibility"];
  status: string;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function fromRow(r: Row): LeaderApplication {
  return {
    id: r.id,
    kind: r.kind as LeaderApplicationKind,
    franchise: r.franchise,
    applicantRiderId: r.applicant_rider_id,
    applicantName: r.applicant_name,
    ...(r.target_station_id ? { targetStationId: r.target_station_id } : {}),
    ...(r.proposed_station_name ? { proposedStationName: r.proposed_station_name } : {}),
    channel: r.channel as LeaderApplication["channel"],
    ...(r.referrer_station_id ? { referrerStationId: r.referrer_station_id } : {}),
    eligibility: r.eligibility ?? { orders28d: 0, activeDays28d: 0 },
    status: r.status as LeaderApplicationStatus,
    ...(r.reviewed_by ? { reviewedBy: r.reviewed_by } : {}),
    ...(r.review_note ? { reviewNote: r.review_note } : {}),
    createdAt: r.created_at,
    ...(r.reviewed_at ? { reviewedAt: r.reviewed_at } : {}),
  };
}

export async function insertApplication(app: LeaderApplication): Promise<void> {
  await upsertRows(
    "leader_applications",
    [
      {
        id: app.id,
        kind: app.kind,
        franchise: app.franchise,
        applicant_rider_id: app.applicantRiderId,
        applicant_name: app.applicantName,
        target_station_id: app.targetStationId ?? null,
        proposed_station_name: app.proposedStationName ?? null,
        channel: app.channel,
        referrer_station_id: app.referrerStationId ?? null,
        eligibility: app.eligibility,
        status: app.status,
        created_at: app.createdAt,
      },
    ],
    "id",
  );
}

export async function listApplications(where: { franchise?: string; applicantRiderId?: string; status?: string }): Promise<LeaderApplication[]> {
  const filter: Where = {};
  if (where.franchise) filter.franchise = where.franchise;
  if (where.applicantRiderId) filter.applicant_rider_id = where.applicantRiderId;
  if (where.status) filter.status = where.status;
  const rows = await selectRows<Row>("leader_applications", {
    where: filter,
    orderBy: { column: "created_at", ascending: false },
    limit: 200,
  });
  return rows.map(fromRow);
}

export async function reviewApplication(id: string, status: "approved" | "rejected", reviewedBy: string, note: string): Promise<void> {
  await updateRows(
    "leader_applications",
    { id, status: "pending" },
    { status, reviewed_by: reviewedBy, review_note: note, reviewed_at: new Date().toISOString() },
  );
}
