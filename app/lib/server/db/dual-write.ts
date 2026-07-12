import { appendServerAudit } from "../memory";
import { coreMode } from "./core";

/**
 * M0 dual-write helper (docs/data-core-cure-plan.md §4 S3).
 *
 * During the dual-write window the LEGACY memory+flush pipeline stays the
 * source of truth: the caller performs its legacy mutation as before, then
 * calls dualWrite() with the equivalent new-table write. A new-table failure
 * is logged + audited but NEVER thrown — user requests must not break while
 * the new path is being proven. The daily reconciliation report is what
 * surfaces sustained divergence (see reconcile.ts).
 */
export async function dualWrite(module: string, label: string, tableWrite: () => Promise<void>): Promise<void> {
  if (coreMode(module) === "off") return;
  try {
    await tableWrite();
  } catch (error) {
    const detail = `${label}: ${(error as Error).message}`;
    console.warn(`[core:${module}] dual-write failed (legacy path unaffected) — ${detail}`);
    appendServerAudit({
      actor: "core-migration",
      action: "CORE_DUAL_WRITE_FAILED",
      entity: "CoreMigration",
      entityId: module,
      detail,
      risk: "Medium",
    });
  }
}
