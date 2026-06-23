"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, KeyRound, Smartphone, ArrowRight } from "lucide-react";
import { writeSession } from "../lib/session";
import { useVentoStore } from "../lib/store";

type MemberData = { name: string; role: string; portal: string; organization: string };

const field =
  "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-white outline-none placeholder:text-white/40 focus:border-[#ffd84d]/70 focus:bg-white/10";

type Step = "phone" | "cpf" | "code";

export default function RiderLoginPage() {
  const setRole = useVentoStore((state) => state.setRole);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [rebind, setRebind] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const returnToRef = useRef<string | null>(null);

  // Capture an optional returnTo (e.g. the mall storefront the rider came from).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rt = params.get("returnTo");
    if (rt) {
      try {
        const host = new URL(rt).hostname.toLowerCase();
        if (host === "meponto.com" || host.endsWith(".meponto.com")) returnToRef.current = rt;
      } catch {
        /* ignore malformed returnTo */
      }
    }
  }, []);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function enter(member: MemberData) {
    setRole("Rider");
    writeSession({
      name: member.name,
      role: member.role || "Rider",
      portal: member.portal || "rider",
      organization: member.organization || "",
      identifier: phone,
    });
    window.location.href = returnToRef.current ?? "/rider-app";
  }

  async function requestOtp(withCpf: boolean) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/member-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-otp", phone, ...(withCpf ? { cpf } : {}) }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { sent?: boolean; rebind?: boolean; needsCpf?: boolean; devCode?: string };
      };
      if (!res.ok) throw new Error(payload.error ?? "Não foi possível enviar o código.");
      if (payload.data?.needsCpf) {
        setStep("cpf");
        setError("Telefone não encontrado. Confirme seu CPF para vincular este número.");
        return;
      }
      if (!payload.data?.sent) throw new Error(payload.error ?? "Não foi possível enviar o código.");
      setRebind(!!payload.data.rebind);
      setStep("code");
      setResendIn(30);
      setInfo(payload.data.devCode ? `Código de teste: ${payload.data.devCode}` : "Enviamos um código por SMS.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/member-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify-otp", phone, code }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: MemberData };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Código inválido.");
      enter(payload.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      data-i18n-skip
      className="grid min-h-screen place-items-center px-4 py-10 text-white"
      style={{
        background:
          "radial-gradient(720px 480px at 12% -8%, rgba(255,177,46,0.22), transparent 55%), radial-gradient(640px 420px at 92% 6%, rgba(255,209,77,0.16), transparent 55%), linear-gradient(180deg, #0a0c10 0%, #0c0f16 60%, #070a0d 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meponto-logo.png" alt="MePonto" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 flex items-center justify-center gap-2 text-2xl font-black">
            <Bike size={22} className="text-[#ffd84d]" /> App do Entregador
          </h1>
          <p className="mt-1 text-sm font-bold text-white/55">Entre com seu telefone — escalas, carteira, pontos e suporte.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
          {error && <div className="mb-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm font-black text-red-300">{error}</div>}
          {info && !error && <div className="mb-4 rounded-xl border border-[#ffd84d]/30 bg-[#ffd84d]/10 px-4 py-3 text-sm font-black text-[#ffd84d]">{info}</div>}

          {step === "phone" && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void requestOtp(false); }}>
              <label className="flex items-center gap-2 text-xs font-black uppercase text-white/50"><Smartphone size={14} /> Telefone</label>
              <input className={field} placeholder="Telefone com DDD (ex.: 11 98765-4321)" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button type="submit" disabled={busy || phone.replace(/\D/g, "").length < 10}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-sm font-black uppercase text-[#1a1405] shadow-[0_8px_30px_rgba(255,196,46,0.3)] disabled:opacity-50">
                {busy ? "Enviando..." : <>Enviar código <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {step === "cpf" && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void requestOtp(true); }}>
              <p className="text-xs font-bold text-white/55">Vincule seu número ao seu cadastro confirmando o CPF. Seus pontos e carteira são preservados.</p>
              <input className={field} placeholder="CPF (11 dígitos)" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} />
              <button type="submit" disabled={busy || cpf.replace(/\D/g, "").length !== 11}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-sm font-black uppercase text-[#1a1405] disabled:opacity-50">
                {busy ? "Enviando..." : <>Confirmar e enviar código <ArrowRight size={16} /></>}
              </button>
              <button type="button" onClick={() => { setStep("phone"); setError(""); }} className="w-full py-1 text-center text-xs font-black text-white/55 underline">Voltar</button>
            </form>
          )}

          {step === "code" && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void verifyOtp(); }}>
              <label className="flex items-center gap-2 text-xs font-black uppercase text-white/50"><KeyRound size={14} /> Código enviado para {phone}{rebind ? " (novo número)" : ""}</label>
              <input className={`${field} tracking-[0.5em] text-center text-lg`} placeholder="••••••" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <button type="submit" disabled={busy || code.length < 6}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-sm font-black uppercase text-[#1a1405] disabled:opacity-50">
                {busy ? "Entrando..." : "Entrar"}
              </button>
              <div className="flex items-center justify-between text-xs font-black text-white/55">
                <button type="button" onClick={() => { setStep("phone"); setCode(""); setError(""); }} className="underline">Trocar número</button>
                <button type="button" disabled={resendIn > 0 || busy} onClick={() => void requestOtp(rebind)} className="underline disabled:opacity-40">
                  {resendIn > 0 ? `Reenviar em ${resendIn}s` : "Reenviar código"}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] font-bold leading-4 text-white/40">
          Ao entrar você aceita a <a href="/privacy" className="underline">política de privacidade</a> da MePonto.
        </p>
      </div>
    </main>
  );
}
