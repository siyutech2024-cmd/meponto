"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, QrCode, CheckCircle2 } from "lucide-react";
import { readSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import { translate, type TranslationKey } from "../lib/i18n";

function ScanInner() {
  const params = useSearchParams();
  const partnerId = params.get("partner") ?? "";
  const ref = params.get("ref") ?? "";
  const station = params.get("station") ?? params.get("ponto") ?? "";
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);
  const language = useVentoStore((s) => s.language);
  const t = (k: TranslationKey, vars?: Record<string, string | number | undefined>) => {
    let s = translate(language, k);
    if (vars) for (const [key, val] of Object.entries(vars)) s = s.replace(`{${key}}`, String(val ?? ""));
    return s;
  };

  const [state, setState] = useState<{ tone: "ok" | "err" | "info"; key: TranslationKey; vars?: Record<string, string | number | undefined>; raw?: string }>({ tone: "info", key: "scanProcessing" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ref) setState({ tone: "info", key: "scanInvited", vars: { ref } });
    else if (partnerId) setState({ tone: "info", key: "scanConfirmPartner" });
    else setState({ tone: "err", key: "scanInvalid" });
  }, [ref, partnerId]);

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> {t("scanBack")}</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><QrCode size={18} className="text-[var(--accent)]" /> {t("scanTitle")}</h1>
      </div>

      <div className={`panel p-5 text-sm font-bold ${state.tone === "ok" ? "text-[var(--ok-ink)]" : state.tone === "err" ? "text-[var(--danger-ink)]" : ""}`} data-i18n-skip>
        {state.raw ?? t(state.key, state.vars)}
      </div>

      {ref && !session?.name && (
        <Link
          href={`/register?ref=${encodeURIComponent(ref)}${station ? `&station=${encodeURIComponent(station)}` : ""}`}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)]"
        >
          <CheckCircle2 size={16} /> {t("scanCreateAccount")}
        </Link>
      )}

      {partnerId && state.tone === "info" && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!session?.name) {
              setState({ tone: "err", key: "scanLoginFirst" });
              return;
            }
            setBusy(true);
            // Resolve own rider id by name.
            const ridersResponse = await fetch("/api/riders", { headers, cache: "no-store" });
            const riders = ridersResponse.ok ? (await ridersResponse.json()).data : [];
            const me = (riders as Array<{ id: string; name: string }>).find((r) => r.name === session.name);
            if (!me) {
              setBusy(false);
              setState({ tone: "err", key: "scanNoRegistration" });
              return;
            }
            const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify({ action: "scanPartner", riderId: me.id, partnerId }) });
            const payload = await response.json().catch(() => ({}));
            setBusy(false);
            if (!response.ok) {
              // Server errors arrive pre-localized (pt) — show them verbatim.
              if (payload.error) setState({ tone: "err", key: "scanFail", raw: String(payload.error) });
              else setState({ tone: "err", key: "scanFail", vars: { s: response.status } });
              return;
            }
            {
              const d = payload.data as { partnerName: string; points: number; earned?: boolean; remaining?: number; grantPoints?: number };
              setState(
                d.earned
                  ? { tone: "ok", key: "scanEarned", vars: { name: d.partnerName, points: d.points } }
                  : { tone: "ok", key: "scanProgress", vars: { name: d.partnerName, remaining: d.remaining, grant: d.grantPoints } },
              );
            }
          }}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
        >
          <CheckCircle2 size={16} /> {busy ? t("scanValidating") : t("scanConfirm")}
        </button>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<ScanFallback />}>
      <ScanInner />
    </Suspense>
  );
}

function ScanFallback() {
  const language = useVentoStore((s) => s.language);
  return <div className="p-6 text-sm font-bold">{translate(language, "scanLoading")}</div>;
}
