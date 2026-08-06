import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { fetchRows } from "../../../lib/server/db-read";
import type { DispatchShift } from "../../../lib/dispatch";

/**
 * 模式二 T5 · 傍晚自动锁班 (v3.0 R4 / 默认 18:00 圣保罗时间).
 *
 * Freezes the roster of every still-open shift for the NEXT operating day, so
 * the list reported to 99 can no longer drift overnight. After the lock:
 *   · franchise/station submissions are refused (dispatch API)
 *   · riders can no longer self-signup or self-cancel (slots API)
 *   · HQ can still lock/unlock manually from the reporting desk — every
 *     unlock is audited. That's the intended escape hatch, not a hole.
 *
 * Idempotent: shifts already carrying `lockedAt` are skipped, so a Vercel
 * retry or a manual re-run never double-locks and never re-audits.
 *
 * Schedule: Vercel cron. 18:00 São Paulo = 21:00 UTC (BRT, no DST since 2019).
 * Auth: same policy as the other crons — if CRON_SECRET is set, require it.
 *
 * Deliberately memory-free (direct read + direct write on app_state_records),
 * so this route doesn't count against the module-guard memory baseline.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // The roster locked tonight is TOMORROW's (ops fills it during the afternoon
  // for the next day). ?date= overrides so the sweep can be re-run for one day.
  const url = new URL(request.url);
  const explicit = url.searchParams.get("date");
  const spNow = new Date(Date.now() - 3 * 3600_000); // BRT = UTC-3
  const target = explicit ?? new Date(spNow.getTime() + 864e5).toISOString().slice(0, 10);

  const shifts = await fetchRows<DispatchShift>("dispatchShifts", [{ op: "eq", field: "date", value: target }]);
  const pending = shifts.filter((shift) => shift.status === "scheduling" && !shift.lockedAt);
  if (pending.length === 0) {
    return Response.json({ data: { date: target, locked: 0 } });
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("app_state_records").upsert(
    pending.map((shift) => ({
      collection: "dispatchShifts",
      record_id: shift.id,
      data: { ...shift, lockedAt: stamp, lockedBy: "Auto (cron)" },
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "collection,record_id" },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Audit is a plain append into the same store — no ledger semantics needed,
  // but every lock must be traceable to who/when (v3.0 R4).
  await supabase.from("app_state_records").insert({
    collection: "auditEvents",
    record_id: `aud-lock-${target}-${Date.now()}`,
    data: {
      id: `aud-lock-${target}-${Date.now()}`,
      at: stamp,
      actor: "Auto (cron)",
      action: "DISPATCH_SHIFT_LOCKED",
      entity: "DispatchShift",
      entityId: target,
      detail: `Evening sweep: ${pending.length} shift(s) locked for ${target} — roster frozen.`,
      risk: "Low",
    },
    updated_at: new Date().toISOString(),
  });

  return Response.json({ data: { date: target, locked: pending.length, lockedAt: stamp } });
}
