"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Download, FileSpreadsheet, RefreshCw, Users } from "lucide-react";
import { AppShell, Badge, Button, DataTable, Field, PageTitle } from "../components/ui";
import type { OperationsCoreState } from "../lib/operations-core";

type Payload = { data: OperationsCoreState; error?: string };

export default function OperationsCorePage() {
  const [state, setState] = useState<OperationsCoreState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/operations-core", { cache: "no-store" });
    const payload = (await response.json()) as Payload;
    setState(payload.data);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const currentCycle = state?.quotaCycles[0];
  const summary = state?.summary;
  const quotaHealth = useMemo(() => {
    if (!summary?.platformCapacity) return 0;
    return Math.round((summary.stationAllocated / summary.platformCapacity) * 100);
  }, [summary]);

  async function createImportBatch(formData: FormData) {
    await runAction({
      action: "create_import_batch",
      businessDate: String(formData.get("businessDate") ?? ""),
      provider: "External Dispatch System",
      orderRows: Number(formData.get("orderRows") ?? 0),
      riderRows: Number(formData.get("riderRows") ?? 0),
      financeRows: Number(formData.get("financeRows") ?? 0),
    });
  }

  async function generateWhitelist() {
    if (!currentCycle) return;
    await runAction({ action: "generate_whitelist", cycleId: currentCycle.id });
  }

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/operations-core", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      setMessage(response.ok ? "Operation completed." : payload.error ?? "Operation failed.");
      if (response.ok) await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="运力与数据运营核心"
        eyebrow="T+1 reports / KPI / quota / whitelist"
        action={
          <button type="button" className="tag inline-flex items-center gap-2" onClick={() => void refresh()}>
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Field label="Data source" value={<Badge value={state?.source ?? "loading"} />} />
        <Field label="Latest business date" value={summary?.latestBusinessDate ?? "-"} />
        <Field label="Imported rows" value={(summary?.importedRows ?? 0).toLocaleString("pt-BR")} />
        <Field label="Unknown riders" value={summary?.unknownRiders ?? 0} />
        <Field label="Platform capacity" value={summary?.platformCapacity ?? 0} />
        <Field label="Station allocated" value={`${summary?.stationAllocated ?? 0} / ${quotaHealth}%`} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-[var(--accent)]" />
              <div>
                <h2 className="text-lg font-black">T+1 外部报表批次</h2>
                <p className="text-sm text-[var(--muted)]">订单、骑手与财务文件按业务日期导入；未知骑手只告警，不自动开户。</p>
              </div>
            </div>
            <DataTable
              headers={["Business date", "Batch", "Provider", "Orders", "Riders", "Finance", "Matched", "Unknown", "Status"]}
              rows={(state?.importBatches ?? []).map((batch) => [
                batch.businessDate,
                batch.id,
                batch.provider,
                batch.orderRows,
                batch.riderRows,
                batch.financeRows,
                batch.matchedRiders,
                batch.unknownRiders,
                <Badge key="status" value={batch.status} />,
              ])}
            />
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users size={18} className="text-[var(--accent)]" />
              <div>
                <h2 className="text-lg font-black">三级名额分配</h2>
                <p className="text-sm text-[var(--muted)]">外部系统确定排班容量，总部先分配加盟商，加盟商再分配站点。</p>
              </div>
            </div>
            <DataTable
              headers={["Franchise", "Cycle", "HQ quota", "Station allocated", "Remaining"]}
              rows={(state?.franchiseQuotas ?? []).map((quota) => [
                quota.franchiseName,
                quota.cycleId,
                quota.quota,
                quota.stationAllocated,
                <Badge key="remaining" value={quota.remaining === 0 ? "Allocated" : `${quota.remaining} remaining`} />,
              ])}
            />
            <div className="mt-4">
              <DataTable
                headers={["Station", "Franchise allocation", "Quota"]}
                rows={(state?.stationQuotas ?? []).map((quota) => [
                  quota.stationName,
                  quota.franchiseAllocationId,
                  quota.quota,
                ])}
              />
            </div>
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <Database size={18} className="text-[var(--accent)]" />
              <h2 className="text-lg font-black">KPI 规则版本</h2>
            </div>
            <DataTable
              headers={["Rule", "Version", "Orders", "Attendance", "AR", "Max cancel", "Points", "Status"]}
              rows={(state?.kpiRules ?? []).map((rule) => [
                rule.name,
                `v${rule.version}`,
                rule.minCompletedOrders,
                `${rule.minAttendanceMinutes}m`,
                `${rule.minAcceptanceRate}%`,
                `${rule.maxCancellationRate}%`,
                rule.pointsReward,
                <Badge key="status" value={rule.status} />,
              ])}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <form action={createImportBatch} className="panel grid gap-3 p-4">
            <div className="text-xs font-black uppercase text-[var(--accent)]">Create T+1 batch</div>
            <input name="businessDate" type="date" required className="h-11 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3" />
            <input name="orderRows" type="number" min="0" placeholder="Order rows" className="h-11 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3" />
            <input name="riderRows" type="number" min="0" placeholder="Rider rows" className="h-11 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3" />
            <input name="financeRows" type="number" min="0" placeholder="Finance rows" className="h-11 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3" />
            <Button disabled={busy}>
              <FileSpreadsheet size={16} />
              Register batch
            </Button>
          </form>

          <div className="panel p-4">
            <div className="text-xs font-black uppercase text-[var(--accent)]">Whitelist export</div>
            <h2 className="mt-1 text-lg font-black">总部终审名单</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              当前终审 {summary?.approvedEnrollments ?? 0} 人，待生成/重新生成导出 {summary?.readyForExport ?? 0} 人。
            </p>
            <button
              type="button"
              disabled={busy || !currentCycle}
              onClick={() => void generateWhitelist()}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-[var(--accent)] bg-[var(--accent)] px-4 font-black text-[var(--accent-ink)] disabled:opacity-40"
            >
              <Download size={17} />
              Generate whitelist
            </button>
          </div>

          <div className="panel p-4">
            <h2 className="text-lg font-black">导出历史</h2>
            <div className="mt-3 space-y-2">
              {(state?.whitelistExports ?? []).map((item) => (
                <div key={item.id} className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black">{item.fileName}</span>
                    <Badge value={item.status} />
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{item.rowCount} rows / {item.generatedAt}</div>
                </div>
              ))}
              {!state?.whitelistExports.length ? <p className="text-sm text-[var(--muted)]">No whitelist export yet.</p> : null}
            </div>
          </div>

          {message ? <div className="rounded border border-[var(--line)] bg-[var(--surface)] p-3 text-sm font-bold">{message}</div> : null}
        </aside>
      </section>
    </AppShell>
  );
}

