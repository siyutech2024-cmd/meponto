"use client";

import { FormEvent, useEffect, useState } from "react";
import { writeSession } from "../lib/session";

type LoginStep = "phone" | "cpf" | "code";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Public member self-registration + phone-OTP login (公开用户 → 会员一级). */
export default function RegisterPage() {
  const [mode, setMode] = useState<"register" | "login">("login");
  const [form, setForm] = useState({ name: "", phone: "", cpf: "", inviterId: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [memberId, setMemberId] = useState("");
  const [copied, setCopied] = useState(false);

  // ---- Login (phone + OTP, anchored to the member record) ----
  const [loginStep, setLoginStep] = useState<LoginStep>("phone");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginCpf, setLoginCpf] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginInfo, setLoginInfo] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [googleCred, setGoogleCred] = useState("");

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setForm((f) => ({ ...f, inviterId: ref }));
  }, []);

  // Sign in with Google → linked rider logs straight in; first time, fall into
  // the phone+CPF flow to bind this Google account to the rider (one identity).
  async function googleLogin(credential?: string) {
    if (!credential) return;
    setError("");
    setLoginInfo("");
    setState("sending");
    try {
      const res = await fetch("/api/member-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "google", credential }),
      });
      // Progressive login (GOOGLE_LITE_LOGIN on): the server returns a guest
      // session with `name` + verified:false → falls into the redirect-to-/store
      // branch below and enters PontoMall right away. With the flag off it
      // returns needsLink and we collect phone+CPF here as before.
      const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: { name?: string; needsLink?: boolean; email?: string; verified?: boolean; needsVerification?: boolean } };
      if (!res.ok) throw new Error(payload.error ?? "Não foi possível entrar com o Google.");
      if (payload.data?.needsLink) {
        setGoogleCred(credential);
        setMode("login");
        setLoginStep("phone");
        setLoginInfo(`Vincule sua conta Google${payload.data.email ? ` (${payload.data.email})` : ""}: confirme seu telefone para concluir.`);
        setState("idle");
        return;
      }
      if (payload.data?.name) {
        writeSession({ name: payload.data.name, role: "Rider", portal: "rider", organization: "", identifier: payload.data.email ?? "" });
        window.location.href = "/store";
        return;
      }
      throw new Error("Resposta inesperada do servidor.");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  // Load Google Identity Services and render the button (login mode only).
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || mode !== "login") return;
    type GsiId = {
      initialize: (o: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
    const render = () => {
      const gid = (window as unknown as { google?: { accounts?: { id?: GsiId } } }).google?.accounts?.id;
      const el = document.getElementById("gsi-btn");
      if (!gid || !el) return;
      gid.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => void googleLogin(r.credential) });
      gid.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 300 });
    };
    if ((window as unknown as { google?: unknown }).google) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.body.appendChild(script);
    return () => { script.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function requestOtp(withCpf: boolean) {
    setError("");
    setLoginInfo("");
    setState("sending");
    try {
      const res = await fetch("/api/member-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-otp", phone: loginPhone, ...(withCpf ? { cpf: loginCpf } : {}) }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { sent?: boolean; rebind?: boolean; needsCpf?: boolean; devCode?: string; name?: string; role?: string; portal?: string; organization?: string };
      };
      if (!res.ok) throw new Error(payload.error ?? "Não foi possível enviar o código.");
      // Progressive activation: a Google guest entering a new phone is created +
      // logged in straight away (no SMS) — the server returns a full session.
      if (payload.data?.portal && payload.data?.name) {
        writeSession({ name: payload.data.name, role: payload.data.role || "Rider", portal: payload.data.portal, organization: payload.data.organization || "", identifier: loginPhone });
        window.location.href = "/store";
        return;
      }
      if (payload.data?.needsCpf) {
        setLoginStep("cpf");
        setError("Telefone não encontrado. Confirme seu CPF para vincular este número.");
        return;
      }
      if (!payload.data?.sent) throw new Error(payload.error ?? "Não foi possível enviar o código.");
      setLoginStep("code");
      setResendIn(30);
      setLoginInfo(payload.data.devCode ? `Código de teste: ${payload.data.devCode}` : "Enviamos um código por SMS.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setState("idle");
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("sending");
    try {
      const res = await fetch("/api/member-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify-otp", phone: loginPhone, code: loginCode, ...(googleCred ? { googleCredential: googleCred } : {}) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: { name: string; role: string; portal: string; organization: string } };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Código inválido.");
      writeSession({ name: payload.data.name, role: payload.data.role || "Rider", portal: payload.data.portal || "rider", organization: payload.data.organization || "", identifier: loginPhone });
      // Land on a real page (the mall storefront) — NOT "/", which on
      // app.meponto.com redirects back to the deprecated rider web → /register loop.
      window.location.href = "/store";
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("sending");
    const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível cadastrar.");
      setState("idle");
      return;
    }
    setMemberId(payload.data.id);
    setState("done");
  }

  const input = "h-12 w-full rounded-[10px] border border-black/10 bg-white px-3 text-sm font-bold outline-none focus:border-[#ff7a00]";
  const inviteLink = typeof window !== "undefined" && memberId ? `${window.location.origin}/register?ref=${memberId}` : "";
  const sending = state === "sending";

  return (
    <main className="min-h-screen w-full" style={{ background: "linear-gradient(135deg,#fff4cf,#ffd9a8)" }}>
      <style>{`
        .me-wm-light{background:linear-gradient(100deg,#19202c 30%,#f5b301 50%,#19202c 70%);background-size:220% auto;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:meShineM 2.6s linear infinite;letter-spacing:-.5px;line-height:1}
        @keyframes meShineM{to{background-position:-220% center}}
        @media (prefers-reduced-motion:reduce){.me-wm-light{animation:none;color:#19202c;-webkit-text-fill-color:#19202c}}
      `}</style>
      <div className="mx-auto max-w-lg px-5 py-10">
        <div className="mb-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meponto-app-icon.png" alt="MePonto" className="h-11 w-11 rounded-xl" />
            <span aria-hidden="true" className="me-wm-light select-none text-[28px] font-black">MePonto</span>
          </div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#ff7a00]">MePonto · PontoMall</div>
          <h1 className="mt-2 text-3xl font-black text-[#19202c]">Conta de membro</h1>
          <p className="mt-2 text-sm font-bold text-black/55">Entre com seu telefone. Entregadores também são membros — veja escalas, carteira e pontos.</p>
        </div>

        {state !== "done" && (
          <div className="mb-3 flex gap-1 rounded-full bg-white p-1 shadow-md">
            <button type="button" onClick={() => { setMode("login"); setError(""); }} className={`h-9 flex-1 rounded-full text-sm font-black ${mode === "login" ? "bg-[#ff7a00] text-[#050505]" : "text-black/45"}`}>Entrar</button>
            <button type="button" onClick={() => { setMode("register"); setError(""); }} className={`h-9 flex-1 rounded-full text-sm font-black ${mode === "register" ? "bg-[#ff7a00] text-[#050505]" : "text-black/45"}`}>Criar conta</button>
          </div>
        )}

        {state === "done" ? (
          <div className="space-y-3 rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="text-2xl">🎉</div>
            <h2 className="text-lg font-black text-[#19202c]">Conta criada! Você é Membro nível 1.</h2>
            <p className="text-sm font-bold text-black/55">Já pode acumular pontos e resgatar na Loja. Ao vincular seu 99 ID, sobe para nível 2.</p>
            <div className="rounded-xl bg-[#fff4cf] p-3 text-left">
              <div className="text-[11px] font-black uppercase text-[#9a7400]">Convide e ganhe pontos</div>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(inviteLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                className="mt-1 w-full truncate rounded-lg bg-white px-3 py-2 text-left text-xs font-bold text-black/70"
              >
                {copied ? "✓ Link copiado!" : inviteLink}
              </button>
            </div>
            <a href="/" className="inline-block rounded-[10px] bg-[#19202c] px-5 py-3 text-sm font-black text-white">Ir para a Loja</a>
          </div>
        ) : mode === "login" ? (
          <div className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            {error ? <div className="rounded-[10px] bg-[#fdeceb] px-3 py-2 text-sm font-bold text-[#c4423b]">{error}</div> : null}
            {loginInfo && !error ? <div className="rounded-[10px] bg-[#fff4cf] px-3 py-2 text-sm font-bold text-[#9a7400]">{loginInfo}</div> : null}

            {GOOGLE_CLIENT_ID && loginStep === "phone" && !googleCred && (
              <>
                <div id="gsi-btn" className="flex justify-center" />
                <div className="flex items-center gap-3 text-[11px] font-black uppercase text-black/30">
                  <span className="h-px flex-1 bg-black/10" /> ou <span className="h-px flex-1 bg-black/10" />
                </div>
              </>
            )}

            {loginStep === "phone" && (
              <form onSubmit={(e) => { e.preventDefault(); void requestOtp(false); }} className="space-y-3">
                <label className="block text-xs font-black uppercase text-black/45">Telefone
                  <input required value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} className={`${input} mt-1`} placeholder="11 98765-4321" inputMode="tel" />
                </label>
                <button disabled={sending || loginPhone.replace(/\D/g, "").length < 10} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
                  {sending ? "Enviando..." : "Enviar código"}
                </button>
              </form>
            )}

            {loginStep === "cpf" && (
              <form onSubmit={(e) => { e.preventDefault(); void requestOtp(true); }} className="space-y-3">
                <p className="text-xs font-bold text-black/55">Vincule este número ao seu cadastro confirmando o CPF. Seus pontos e carteira são preservados.</p>
                <input required value={loginCpf} onChange={(e) => setLoginCpf(e.target.value)} className={input} placeholder="CPF (11 dígitos)" inputMode="numeric" />
                <button disabled={sending || loginCpf.replace(/\D/g, "").length !== 11} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
                  {sending ? "Enviando..." : "Confirmar e enviar código"}
                </button>
                <button type="button" onClick={() => { setLoginStep("phone"); setError(""); }} className="w-full text-center text-xs font-black text-black/45 underline">Voltar</button>
              </form>
            )}

            {loginStep === "code" && (
              <form onSubmit={verifyOtp} className="space-y-3">
                <label className="block text-xs font-black uppercase text-black/45">Código enviado para {loginPhone}
                  <input required value={loginCode} onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className={`${input} mt-1 text-center tracking-[0.5em]`} placeholder="••••••" inputMode="numeric" maxLength={6} />
                </label>
                <button disabled={sending || loginCode.length < 6} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
                  {sending ? "Entrando..." : "Entrar"}
                </button>
                <div className="flex items-center justify-between text-xs font-black text-black/45">
                  <button type="button" onClick={() => { setLoginStep("phone"); setLoginCode(""); setError(""); }} className="underline">Trocar número</button>
                  <button type="button" disabled={resendIn > 0 || sending} onClick={() => void requestOtp(false)} className="underline disabled:opacity-40">
                    {resendIn > 0 ? `Reenviar em ${resendIn}s` : "Reenviar código"}
                  </button>
                </div>
              </form>
            )}
            <p className="text-center text-[11px] font-bold text-black/40">Entregadores: entre com o telefone do seu cadastro.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <label className="block text-xs font-black uppercase text-black/45">Nome completo
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} placeholder="Seu nome" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">WhatsApp / telefone
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} mt-1`} placeholder="11 98765-4321" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">CPF (opcional)
              <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className={`${input} mt-1`} placeholder="000.000.000-00" />
            </label>
            {form.inviterId ? <div className="rounded-[10px] bg-[#e8f6ee] px-3 py-2 text-xs font-bold text-[#1d7a3e]">✓ Convite aplicado — quem te convidou ganha pontos.</div> : null}
            {error ? <div className="rounded-[10px] bg-[#fdeceb] px-3 py-2 text-sm font-bold text-[#c4423b]">{error}</div> : null}
            <button disabled={sending} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
              {sending ? "Criando..." : "Criar conta grátis"}
            </button>
            <p className="text-center text-[11px] font-bold text-black/40">Depois de criar a conta, entre pelo telefone com código.</p>
          </form>
        )}
      </div>
    </main>
  );
}
