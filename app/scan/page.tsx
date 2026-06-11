"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, QrCode, CheckCircle2 } from "lucide-react";
import { readSession } from "../lib/session";

function ScanInner() {
  const params = useSearchParams();
  const partnerId = params.get("partner") ?? "";
  const ref = params.get("ref") ?? "";
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(() => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Rider" }), [session]);

  const [state, setState] = useState<{ tone: "ok" | "err" | "info"; text: string }>({ tone: "info", text: "Processando..." });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ref) setState({ tone: "info", text: `Você foi convidado pelo código ${ref}. Cadastre-se na sua estação informando este código para o seu padrinho ganhar pontos após o seu primeiro pedido.` });
    else if (partnerId) setState({ tone: "info", text: "Confirme para validar este parceiro e creditar os pontos dele." });
    else setState({ tone: "err", text: "QR inválido." });
  }, [ref, partnerId]);

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/rider-app" className="tag inline-flex items-center gap-1"><ArrowLeft size={13} /> Voltar</Link>
        <h1 className="flex items-center gap-2 text-lg font-black"><QrCode size={18} className="text-[var(--accent)]" /> Validação por QR</h1>
      </div>

      <div className={`panel p-5 text-sm font-bold ${state.tone === "ok" ? "text-[var(--ok-ink)]" : state.tone === "err" ? "text-[var(--danger-ink)]" : ""}`}>
        {state.text}
      </div>

      {partnerId && state.tone === "info" && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!session?.name) {
              setState({ tone: "err", text: "Faça login no app do entregador antes de validar." });
              return;
            }
            setBusy(true);
            // Resolve own rider id by name.
            const ridersResponse = await fetch("/api/riders", { headers, cache: "no-store" });
            const riders = ridersResponse.ok ? (await ridersResponse.json()).data : [];
            const me = (riders as Array<{ id: string; name: string }>).find((r) => r.name === session.name);
            if (!me) {
              setBusy(false);
              setState({ tone: "err", text: "Cadastro não encontrado — fale com o gestor da estação." });
              return;
            }
            const response = await fetch("/api/mall", { method: "POST", headers, body: JSON.stringify({ action: "scanPartner", riderId: me.id, partnerId }) });
            const payload = await response.json().catch(() => ({}));
            setBusy(false);
            if (!response.ok) {
              setState({ tone: "err", text: payload.error ?? `Falha (${response.status})` });
              return;
            }
            setState({ tone: "ok", text: `Parceiro ${payload.data.partnerName} validado! +${payload.data.points} pontos creditados ao parceiro.` });
          }}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] text-sm font-black uppercase text-[var(--accent-ink)] disabled:opacity-50"
        >
          <CheckCircle2 size={16} /> {busy ? "Validando..." : "Confirmar validação"}
        </button>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm font-bold">Carregando...</div>}>
      <ScanInner />
    </Suspense>
  );
}
