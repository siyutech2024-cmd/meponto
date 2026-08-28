import type { LeaderAssessment, LeaderAssessmentState } from "../../leader-mode";
import { selectRows, updateRows, upsertRows, type Where } from "./core";

/**
 * Leader Mode repository (docs/leader-mode-design.md): `leader_assessments`
 * real table — routes call these methods, never supabase-js directly.
 * No memory-collection involvement: assessments were born after the
 * data-core-cure guard, so they live in Postgres from day one.
 */

type AssessmentRow = {
  id: string;
  station_id: string;
  station_name: string;
  franchise: string;
  week: string;
  state: string;
  metrics: LeaderAssessment["metrics"];
  targets_snapshot: LeaderAssessment["targetsSnapshot"];
  gaps: LeaderAssessment["gaps"];
  passed: boolean;
  trial: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

function toRow(a: LeaderAssessment): AssessmentRow {
  return {
    id: a.id,
    station_id: a.stationId,
    station_name: a.stationName,
    franchise: a.franchise,
    week: a.week,
    state: a.state,
    metrics: a.metrics,
    targets_snapshot: a.targetsSnapshot,
    gaps: a.gaps,
    passed: a.passed,
    trial: a.trial,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    closed_at: a.closedAt ?? null,
  };
}

function fromRow(r: AssessmentRow): LeaderAssessment {
  return {
    id: r.id,
    stationId: r.station_id,
    stationName: r.station_name,
    franchise: r.franchise,
    week: r.week,
    state: r.state as LeaderAssessmentState,
    metrics: r.metrics,
    targetsSnapshot: r.targets_snapshot,
    gaps: r.gaps ?? [],
    passed: r.passed,
    trial: r.trial,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.closed_at ? { closedAt: r.closed_at } : {}),
  };
}

export async function listAssessments(franchise: string, week: string): Promise<LeaderAssessment[]> {
  const rows = await selectRows<AssessmentRow>("leader_assessments", { where: { franchise, week } satisfies Where });
  return rows.map(fromRow);
}

export async function upsertAssessments(assessments: LeaderAssessment[]): Promise<void> {
  if (assessments.length === 0) return;
  await upsertRows("leader_assessments", assessments.map(toRow), "id");
}

/** Freeze every provisional snapshot of (franchise, week). Returns count via caller's list. */
export async function closeWeekAssessments(franchise: string, week: string, closedAt: string): Promise<void> {
  await updateRows(
    "leader_assessments",
    { franchise, week, state: "provisional" },
    { state: "closed", closed_at: closedAt, updated_at: closedAt },
  );
}

/** closed → settled once the payment order has been generated (design §2.4). */
export async function markWeekSettled(franchise: string, week: string, at: string): Promise<void> {
  await updateRows(
    "leader_assessments",
    { franchise, week, state: "closed" },
    { state: "settled", updated_at: at },
  );
}
