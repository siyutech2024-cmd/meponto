"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { portalConfigs, type PortalId } from "../lib/portals";
import type { Role } from "../lib/rbac";
import { writeSession } from "../lib/session";
import { useVentoStore } from "../lib/store";

/** Login copy defaults to Portuguese — the operating language in Brazil. */
const ptCopy: Record<PortalId, { name: string; description: string; hint: string }> = {
  pontosys: { name: "PontoSys · Matriz", description: "Operação, risco, finanças, relatórios, permissões e escala de toda a rede.", hint: "Conta da matriz" },
  franchise: { name: "Painel da Franquia", description: "Acompanhe seus pontos, entregadores, escalas, PontoMall e dados operacionais.", hint: "Conta da franquia" },
  ponto: { name: "Painel do Ponto", description: "Triagem de inscrições, operação local e gestão dos entregadores do ponto.", hint: "Conta do ponto" },
  rider: { name: "App do Entregador", description: "Turnos, carteira, pontos e suporte — tudo em um lugar.", hint: "Conta do entregador" },
  partner: { name: "Portal do Parceiro", description: "Confirmação de serviços e pontos do ecossistema MePonto.", hint: "Conta do parceiro" },
  supplier: { name: "Portal do Fornecedor", description: "Envie produtos, preços de fornecimento e acompanhe pedidos.", hint: "Conta do fornecedor" },
  pontomall: { name: "Gestão do PontoMall", description: "Regras de pontos, precificação e pedidos de resgate.", hint: "Conta de operação do mall" },
};

export function PortalLogin({ portalId }: { portalId: PortalId }) {
  const portal = portalConfigs[portalId];
  const copy = ptCopy[portalId];
  const setRole = useVentoStore((state) => state.setRole);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_480px]">
        {/* Brand panel: centered, balanced proportions. */}
        <section className="relative flex flex-col items-center justify-center gap-8 border-b border-[var(--line)] bg-[#050505] p-10 text-center text-white lg:border-b-0 lg:border-r" data-i18n-skip>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,209,0,0.08),transparent_55%)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meponto-logo.png" alt="MePonto" className="relative h-24 w-auto rounded-[12px] object-contain shadow-[0_0_42px_rgba(255,212,0,0.22)] md:h-28" />
          <div className="relative max-w-xl">
            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">
              <ShieldCheck size={15} />
              Acesso seguro dedicado
            </div>
            <h1 className="mt-4 text-4xl font-black leading-tight md:text-5xl">{copy.name}</h1>
            <p className="mx-auto mt-4 max-w-md text-base font-bold leading-7 text-white/55">{copy.description}</p>
          </div>
          <div className="relative text-sm font-bold text-white/40">{portal.futureDomain}</div>
        </section>

        <section className="grid place-items-center px-4 py-8" data-i18n-skip>
          <div className="w-full max-w-md">
            {/* The system picker is an HQ-only concept. */}
            {portalId === "pontosys" && (
              <Link href="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
                <ArrowLeft size={16} />
                Voltar à seleção de sistemas
              </Link>
            )}
            <div className="panel p-5">
              <div className="mb-5">
                <div className="text-xs font-black uppercase text-[var(--accent)]">{copy.hint}</div>
                <h2 className="mt-1 text-2xl font-black">Login da conta</h2>
              </div>

              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setSubmitting(true);
                  setError("");
                  try {
                    const response = await fetch("/api/auth/login", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ identifier, password, portal: portalId }),
                    });
                    const payload = (await response.json()) as {
                      error?: string;
                      user?: { name: string; role: Role; portal: string; organization: string; identifier: string; defaultPath: string; franchise?: string; station?: string };
                    };
                    if (!response.ok || !payload.user) {
                      setError(payload.error ?? "Falha no login");
                      return;
                    }
                    setRole(payload.user.role);
                    writeSession({
                      name: payload.user.name,
                      role: payload.user.role,
                      portal: payload.user.portal,
                      organization: payload.user.organization,
                      identifier: payload.user.identifier,
                      franchise: payload.user.franchise,
                      station: payload.user.station,
                    });
                    window.location.href = payload.user.defaultPath;
                  } catch {
                    setError("Serviço de login indisponível no momento");
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase text-[var(--muted)]">E-mail ou telefone</span>
                  <span className="flex h-12 items-center gap-3 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3">
                    <Mail size={18} className="text-[var(--muted)]" />
                    <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" className="min-w-0 flex-1 bg-transparent outline-none" />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase text-[var(--muted)]">Senha</span>
                  <span className="flex h-12 items-center gap-3 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3">
                    <Lock size={18} className="text-[var(--muted)]" />
                    <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" className="min-w-0 flex-1 bg-transparent outline-none" />
                    <button type="button" aria-label="Mostrar senha" onClick={() => setShowPassword((value) => !value)} className="grid h-9 w-9 place-items-center rounded border border-[var(--line)]">
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
                {error ? <div className="rounded border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm font-bold text-[var(--danger-ink)]">{error}</div> : null}
                <button disabled={submitting} className="h-12 w-full rounded bg-[var(--accent)] font-black text-[var(--accent-ink)] disabled:opacity-50">
                  {submitting ? "Entrando..." : "Entrar"}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
