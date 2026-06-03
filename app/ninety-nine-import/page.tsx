"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, LockKeyhole, UploadCloud } from "lucide-react";
import { AppShell, Badge, Button, DataTable, Field, PageTitle } from "../components/ui";
import { useVentoStore } from "../lib/store";
import type {
  NinetyNineImportBatch,
  NinetyNineImportRule,
  NinetyNineRiderPreview,
  NinetyNineSourceDefinition,
} from "../lib/ninetyNineImport";

type NinetyNineImportPayload = {
  data: {
    summary: {
      businessDate: string;
      uploadDate: string;
      files: number;
      ridersMatched: number;
      ready: number;
      warnings: number;
      blocked: number;
      estimatedPoints: number;
      status: string;
    };
    sources: NinetyNineSourceDefinition[];
    rules: NinetyNineImportRule[];
    batches: NinetyNineImportBatch[];
    previewRows: NinetyNineRiderPreview[];
    readModel: string;
    featureFlag: string;
    standard: string;
  };
};

const copy = {
  zh: {
    eyebrow: "99 每日数据导入",
    title: "前一天表现数据预校验",
    action: "确认预览批次",
    subtitle: "每天导入当天从 99 导出的三张表，但积分和星级按表内前一天业务日期计算。",
    sourceTitle: "三张 99 源表",
    ruleTitle: "导入控制规则",
    batchTitle: "导入批次",
    previewTitle: "骑手匹配预览",
    gateTitle: "OL 二级门槛",
    gateBody: "所有注册用户默认一级骑手。加入 OL 后自动成为二级骑手，二级及以上才允许生成 99 表现记录、星级数据和积分候选记录。",
    postingTitle: "暂不直接入账",
    postingBody: "本页先生成每日表现读模型和积分预估。真实积分账本需要批次审批或 pending release 规则通过后再写入。",
  },
  en: {
    eyebrow: "99 daily data import",
    title: "Previous-day performance precheck",
    action: "Confirm preview batch",
    subtitle: "Upload the three files exported from 99 today, but calculate tiers and points by the row business date from yesterday.",
    sourceTitle: "Three 99 source files",
    ruleTitle: "Import control rules",
    batchTitle: "Import batches",
    previewTitle: "Rider matching preview",
    gateTitle: "OL tier-2 gate",
    gateBody: "All registered users start as tier-1 riders. Joining OL promotes them to tier 2, and only tier 2+ can generate 99 performance, star, and point candidate records.",
    postingTitle: "No direct ledger posting",
    postingBody: "This page creates the daily performance read model and estimated points first. Real point ledger entries require batch approval or pending release rules.",
  },
  pt: {
    eyebrow: "Importação diária 99",
    title: "Pré-validação do dia anterior",
    action: "Confirmar lote prévio",
    subtitle: "Suba hoje os três arquivos exportados da 99, mas calcule níveis e pontos pela data operacional de ontem dentro da planilha.",
    sourceTitle: "Três fontes 99",
    ruleTitle: "Regras de controle",
    batchTitle: "Lotes de importação",
    previewTitle: "Prévia de vínculo do motoboy",
    gateTitle: "Bloqueio OL nível 2",
    gateBody: "Todos os usuários registrados começam no nível 1. Ao entrar no OL viram nível 2; só nível 2+ gera desempenho 99, estrela e candidato de pontos.",
    postingTitle: "Sem lançamento direto",
    postingBody: "A página cria primeiro o modelo diário e pontos estimados. O ledger real exige aprovação do lote ou regras de liberação pendente.",
  },
};

export default function NinetyNineImportPage() {
  const [payload, setPayload] = useState<NinetyNineImportPayload["data"] | null>(null);
  const [message, setMessage] = useState("Preview mode");
  const language = useVentoStore((state) => state.language);
  const t = copy[language];

  useEffect(() => {
    let active = true;
    fetch("/api/ninety-nine-import", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: NinetyNineImportPayload) => {
        if (active) setPayload(data.data);
      });
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    const summary = payload?.summary;
    return {
      businessDate: summary?.businessDate ?? "-",
      files: summary?.files ?? 0,
      ridersMatched: summary?.ridersMatched ?? 0,
      exceptions: (summary?.warnings ?? 0) + (summary?.blocked ?? 0),
      estimatedPoints: summary?.estimatedPoints ?? 0,
    };
  }, [payload]);

  function confirmPreviewBatch() {
    setMessage("Preview confirmed. Points ledger still requires approval.");
  }

  return (
    <AppShell>
      <PageTitle
        title={t.title}
        eyebrow={t.eyebrow}
        action={
          <Button type="button" onClick={confirmPreviewBatch}>
            <UploadCloud size={17} />
            {t.action}
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-5">
        <Field label="Business date" value={totals.businessDate} />
        <Field label="Source files" value={totals.files} />
        <Field label="Matched riders" value={totals.ridersMatched} />
        <Field label="Exceptions" value={totals.exceptions} />
        <Field label="Estimated points" value={totals.estimatedPoints.toLocaleString("pt-BR")} />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="panel overflow-hidden p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-[#8b5cf6]">{payload?.featureFlag ?? "ninety_nine_daily_import_beta"}</div>
              <h2 className="mt-1 text-xl font-black">{t.sourceTitle}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b8ba3]">{t.subtitle}</p>
            </div>
            <FileSpreadsheet className="text-[#8b5cf6]" size={24} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {(payload?.sources ?? []).map((source) => (
              <div key={source.key} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-black text-white">{source.label}</div>
                  <Badge value={source.required ? "Required" : "Optional"} />
                </div>
                <div className="mt-2 text-xs leading-5 text-[#8b8ba3]">{source.businessPurpose}</div>
                <div className="mt-3 rounded bg-[#1a1a2e] p-2 font-mono text-[11px] text-[#c4c4d4]">{source.filePattern}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Field label="Rows" value={source.sampleRows} />
                  <Field label="Riders" value={source.sampleRiders} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <LockKeyhole className="text-[#fb923c]" size={18} />
              <h2 className="text-lg font-black">{t.gateTitle}</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#8b8ba3]">{t.gateBody}</p>
          </div>
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <Database className="text-[#06d6a0]" size={18} />
              <h2 className="text-lg font-black">{t.postingTitle}</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#8b8ba3]">{t.postingBody}</p>
            <div className="mt-3"><Badge value={message} /></div>
          </div>
        </div>
      </section>

      <section className="mt-4">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="text-[#06d6a0]" size={18} />
          <h2 className="text-lg font-black">{t.ruleTitle}</h2>
        </div>
        <DataTable
          headers={["Rule", "Policy", "Risk guard"]}
          rows={(payload?.rules ?? []).map((rule) => [rule.label, rule.policy, rule.riskGuard])}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="text-[#fb923c]" size={18} />
            <h2 className="text-lg font-black">{t.batchTitle}</h2>
          </div>
          <DataTable
            headers={["Batch", "Upload", "Business", "Status", "Files", "Rows", "Warnings"]}
            rows={(payload?.batches ?? []).map((batch) => [
              batch.id,
              batch.uploadDate,
              batch.businessDate,
              <Badge key="status" value={batch.status} />,
              batch.fileCount,
              `${batch.performanceRows + batch.earningsRows + batch.statementRows}`,
              batch.warnings.join(" / "),
            ])}
          />
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheet className="text-[#8b5cf6]" size={18} />
            <h2 className="text-lg font-black">{t.previewTitle}</h2>
          </div>
          <DataTable
            headers={["99 ID", "Name", "Tier", "OL", "Orders", "TSH", "AR", "CAA", "Earnings", "Pts", "Status", "Issue"]}
            rows={(payload?.previewRows ?? []).map((row) => [
              row.rider99Id,
              row.name,
              row.membershipTier,
              row.olStatus,
              row.orders,
              row.tshHours,
              row.ar === null ? "-" : `${row.ar}%`,
              row.caa === null ? "-" : `${row.caa}%`,
              row.grossEarnings === null ? "-" : `R$ ${row.grossEarnings.toFixed(2)}`,
              row.estimatedPoints,
              <Badge key="status" value={row.importStatus} />,
              row.issue,
            ])}
          />
        </div>
      </section>
    </AppShell>
  );
}
