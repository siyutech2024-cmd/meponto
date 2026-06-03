"use client";

import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, Badge, Button, DataTable, Field, PageTitle } from "../components/ui";
import {
  buildExportDefinitions,
  operationHistory,
  parseRiderImportPreview,
  riderImportCsv,
  type OperationHistoryItem,
} from "../lib/importExport";
import { useVentoStore } from "../lib/store";

export default function ToolsPage() {
  const riders = useVentoStore((state) => state.riders);
  const incidents = useVentoStore((state) => state.incidents);
  const ledgerEntries = useVentoStore((state) => state.ledgerEntries);
  const [csvText, setCsvText] = useState(riderImportCsv);
  const [history, setHistory] = useState<OperationHistoryItem[]>(operationHistory);
  const [jobMessage, setJobMessage] = useState("Preview ready");
  const exports = useMemo(() => buildExportDefinitions(riders, incidents, ledgerEntries), [incidents, ledgerEntries, riders]);
  const previewRows = useMemo(() => parseRiderImportPreview(csvText), [csvText]);
  const cleanRows = previewRows.filter((row) => row.issues.length === 0).length;
  const warningRows = previewRows.length - cleanRows;

  async function queueImportJob() {
    const response = await fetch("/api/tools/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "Riders",
        filename: "riders-import-preview.csv",
        rows: previewRows.length,
        requestedBy: "Ops Desk",
      }),
    });
    const payload = (await response.json()) as { data?: OperationHistoryItem; error?: string };

    if (!response.ok || !payload.data) {
      setJobMessage(payload.error ?? "Import job could not be queued");
      return;
    }

    setHistory((items) => [payload.data as OperationHistoryItem, ...items]);
    setJobMessage(`${payload.data.id} queued with ${previewRows.length} preview rows`);
  }

  function downloadExport(entity: string, filename: string) {
    const source =
      entity === "Riders"
        ? riders
        : entity === "Incidents"
          ? incidents
          : ledgerEntries;
    const blob = new Blob([JSON.stringify(source, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename.replace(".csv", ".json");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <PageTitle
        title="Import / Export Tools"
        eyebrow="Data operations"
        action={
          <Button type="button" onClick={queueImportJob} disabled={!previewRows.length}>
            <UploadCloud size={17} />
            Queue Import
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <Field label="Preview Rows" value={previewRows.length} />
        <Field label="Clean Rows" value={cleanRows} />
        <Field label="Warnings" value={warningRows} />
        <Field label="Latest Job" value={jobMessage} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[var(--accent)]">Riders CSV</div>
              <h2 className="text-xl font-black">Import Preview</h2>
            </div>
            <FileSpreadsheet className="text-[var(--accent)]" size={22} />
          </div>
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            className="min-h-40 w-full rounded border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-sm outline-none"
            spellCheck={false}
          />
        </div>

        <div className="panel p-4">
          <div className="mb-3 text-xs font-black uppercase text-[var(--accent)]">Available Exports</div>
          <div className="space-y-3">
            {exports.map((item) => (
              <div key={item.id} className="rounded border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{item.entity}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {item.records} records / {item.format} / {item.lastRunAt}
                    </div>
                  </div>
                  <Badge value={item.format} />
                </div>
                <button
                  type="button"
                  onClick={() => downloadExport(item.entity, item.filename)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-[var(--line)] bg-[var(--surface-raised)] text-sm font-black hover:border-[var(--accent)]"
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4">
        <DataTable
          headers={["Row", "Name", "CPF", "Phone", "Ponto", "Leader", "Status", "Issues"]}
          rows={previewRows.map((row) => [
            row.row,
            row.name || "Missing",
            row.cpf || "Missing",
            row.phone || "Missing",
            row.ponto || "Missing",
            row.leader || "Missing",
            <Badge key="status" value={row.status} />,
            row.issues.length ? row.issues.join(", ") : <Badge key="ready" value="Ready" />,
          ])}
        />
      </section>

      <section className="mt-4">
        <DataTable
          headers={["Created At", "Operation", "Entity", "Status", "Records", "Requested By", "Detail"]}
          rows={history.map((item) => [
            item.createdAt,
            item.operation,
            item.entity,
            <Badge key="status" value={item.status} />,
            item.records,
            item.requestedBy,
            item.detail,
          ])}
        />
      </section>
    </AppShell>
  );
}
