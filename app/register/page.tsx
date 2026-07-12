"use client";

import { FormEvent, useEffect, useState } from "react";
import { writeSession } from "../lib/session";

type LoginStep = "phone" | "choice" | "cpf" | "code";
type SignupForm = { name: string; phone: string; cpf: string; inviterId: string; birthday: string };

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Progressive input masks (display only — the API normalizes digits). */
function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) return value; // typed with country code — leave as-is
  const n = d.slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, n.length - 4)}-${n.slice(-4)}`;
}
function maskCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Unified phone-first member funnel (公开用户 → 会员一级).
 *
 * Entrar: phone → OTP → in. Unknown phone → choose "create account" (name only,
 * OTP verifies the phone, account is created on verify — already logged in) or
 * "link by CPF" (phone changed — rebind, points preserved). One SMS either way,
 * no dead ends, no double login after signup.
 */
export default function RegisterPage() {
  const [mode, setMode] = useState<"register" | "login">("login");
  const [form, setForm] = useState<SignupForm>({ name: "", phone: "", cpf: "", inviterId: "", birthday: "" });
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
  // What the pending SMS is for — resend MUST repeat the same context
  // (cpf rebind / signup), otherwise the server answers needsCpf again.
  const [pendingSignup, setPendingSignup] = useState<SignupForm | null>(null);

  useEffect(() => {
    // Invite links carry ?ref= (canonical); accept ?invite= as an alias so no
    // valid referral is ever dropped.
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? params.get("invite");
    if (ref) {
      setForm((f) => ({ ...f, inviterId: ref }));
      setMode("register"); // invited people come to sign up — open the right tab
    }
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

  /**
   * Request an OTP. `opts` carries the flow context:
   *  - {}            → plain login for a known phone
   *  - {cpf}         → phone changed, rebind via CPF
   *  - {signup}      → phone-first signup (account created on verify)
   * Resends reuse the exact same context (see resend button).
   */
  async function requestOtp(opts: { cpf?: string; signup?: SignupForm; phone?: string } = {}) {
    const phone = opts.phone ?? loginPhone;
    setError("");
    setLoginInfo("");
    setState("sending");
    try {
      const res = await fetch("/api/member-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request-otp",
          phone,
          ...(opts.cpf ? { cpf: opts.cpf } : {}),
          ...(opts.signup ? { signup: { name: opts.signup.name, cpf: opts.signup.cpf, inviterId: opts.signup.inviterId, birthday: opts.signup.birthday } } : {}),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { sent?: boolean; rebind?: boolean; signup?: boolean; needsCpf?: boolean; devCode?: string; name?: string; role?: string; portal?: string; organization?: string };
      };
      if (!res.ok) throw new Error(payload.error ?? "Não foi possível enviar o código.");
      // Progressive activation: a Google guest entering a new phone is created +
      // logged in straight away (no SMS) — the server returns a full session.
      if (payload.data?.portal && payload.data?.name) {
        writeSession({ name: payload.data.name, role: payload.data.role || "Rider", portal: payload.data.portal, organization: payload.data.organization || "", identifier: phone });
        window.location.href = "/store";
        return;
      }
      if (payload.data?.needsCpf) {
        // Unknown phone: offer the two ways forward (create account / rebind).
        setLoginStep("choice");
        return;
      }
      if (!payload.data?.sent) throw new Error(payload.error ?? "Não foi possível enviar o código.");
      // Signup requested but the phone already has an account → the server sent
      // a LOGIN code instead. Tell the person and keep pendingSignup empty.
      if (opts.signup && !payload.data.signup) {
        setPendingSignup(null);
        setLoginInfo("Este telefone já tem conta — enviamos um código para entrar.");
      } else {
        setPendingSignup(opts.signup ?? null);
        setLoginInfo(payload.data.devCode ? `Código de teste: ${payload.data.devCode}` : "Enviamos um código por SMS.");
      }
      setLoginPhone(phone);
      setLoginStep("code");
      setMode("login");
      setResendIn(30);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setState("idle");
    }
  }

  /** Resend with the SAME context as the original request. */
  function resend() {
    if (pendingSignup) return void requestOtp({ signup: pendingSignup });
    if (loginCpf.replace(/\D/g, "").length === 11) return void requestOtp({ cpf: loginCpf });
    return void requestOtp();
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
      const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: { id?: string; name: string; role: string; portal: string; organization: string } };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Código inválido.");
      writeSession({ name: payload.data.name, role: payload.data.role || "Rider", portal: payload.data.portal || "rider", organization: payload.data.organization || "", identifier: loginPhone });
      if (pendingSignup) {
        // Fresh account, already logged in — celebrate + hand over the invite link.
        setMemberId(payload.data.id ?? "");
        setState("done");
        return;
      }
      // Land on a real page (the mall storefront) — NOT "/", which on
      // app.meponto.com redirects back to the deprecated rider web → /register loop.
      window.location.href = "/store";
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  /** Signup submit → OTP to verify the phone; the account is created on verify. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestOtp({ signup: form, phone: form.phone });
  }

  const input = "h-12 w-full rounded-[10px] border border-black/10 bg-white px-3 text-sm font-bold outline-none focus:border-[#ff7a00]";
  const inviteLink = typeof window !== "undefined" && memberId ? `${window.location.origin}/register?ref=${memberId}` : "";
  const whatsappShare = inviteLink
    ? `https://wa.me/?text=${encodeURIComponent(`Vem pro PontoMall comigo! 🎁 Cria sua conta grátis e ganhe pontos: ${inviteLink}`)}`
    : "";
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

        {state !== "done" && loginStep !== "code" && (
          <div className="mb-3 flex gap-1 rounded-full bg-white p-1 shadow-md">
            <button type="button" onClick={() => { setMode("login"); setLoginStep("phone"); setError(""); }} className={`h-9 flex-1 rounded-full text-sm font-black ${mode === "login" ? "bg-[#ff7a00] text-[#050505]" : "text-black/45"}`}>Entrar</button>
            <button type="button" onClick={() => { setMode("register"); setError(""); }} className={`h-9 flex-1 rounded-full text-sm font-black ${mode === "register" ? "bg-[#ff7a00] text-[#050505]" : "text-black/45"}`}>Criar conta</button>
          </div>
        )}

        {state === "done" ? (
          <div className="space-y-3 rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="text-2xl">🎉</div>
            <h2 className="text-lg font-black text-[#19202c]">Conta criada! Você é Membro nível 1.</h2>
            <p className="text-sm font-bold text-black/55">Telefone verificado e você já está logado. Ao vincular seu 99 ID, sobe para nível 2.</p>
            <div className="rounded-xl bg-[#fff4cf] p-3 text-left">
              <div className="text-[11px] font-black uppercase text-[#9a7400]">Convide e ganhe pontos</div>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(inviteLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                className="mt-1 w-full truncate rounded-lg bg-white px-3 py-2 text-left text-xs font-bold text-black/70"
              >
                {copied ? "✓ Link copiado!" : inviteLink}
              </button>
              {whatsappShare && (
                <a href={whatsappShare} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#25D366] text-sm font-black text-white">
                  Convidar pelo WhatsApp
                </a>
              )}
            </div>
            <a href="/store" className="inline-block rounded-[10px] bg-[#19202c] px-5 py-3 text-sm font-black text-white">Ir para a Loja</a>
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
              <form onSubmit={(e) => { e.preventDefault(); void requestOtp(); }} className="space-y-3">
                <label className="block text-xs font-black uppercase text-black/45">Telefone
                  <input required value={loginPhone} onChange={(e) => setLoginPhone(maskPhone(e.target.value))} className={`${input} mt-1`} placeholder="(11) 98765-4321" inputMode="tel" autoComplete="tel" />
                </label>
                <button disabled={sending || loginPhone.replace(/\D/g, "").length < 10} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
                  {sending ? "Enviando..." : "Enviar código"}
                </button>
              </form>
            )}

            {loginStep === "choice" && (
              <div className="space-y-3">
                <div className="rounded-[10px] bg-[#fff4cf] px-3 py-2 text-sm font-bold text-[#9a7400]">
                  Telefone {loginPhone} ainda não tem conta. Como quer continuar?
                </div>
                <button
                  type="button"
                  onClick={() => { setForm((f) => ({ ...f, phone: loginPhone })); setMode("register"); setLoginStep("phone"); setError(""); }}
                  className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c]"
                >
                  Criar conta nova com este número
                </button>
                <button
                  type="button"
                  onClick={() => { setLoginStep("cpf"); setError(""); }}
                  className="h-12 w-full rounded-[10px] border border-black/15 text-sm font-black text-black/70"
                >
                  Já tenho cadastro — troquei de número (CPF)
                </button>
                <button type="button" onClick={() => { setLoginStep("phone"); setError(""); }} className="w-full text-center text-xs font-black text-black/45 underline">Voltar</button>
              </div>
            )}

            {loginStep === "cpf" && (
              <form onSubmit={(e) => { e.preventDefault(); void requestOtp({ cpf: loginCpf }); }} className="space-y-3">
                <p className="text-xs font-bold text-black/55">Vincule este número ao seu cadastro confirmando o CPF. Seus pontos e carteira são preservados.</p>
                <input required value={loginCpf} onChange={(e) => setLoginCpf(maskCpf(e.target.value))} className={input} placeholder="CPF (11 dígitos)" inputMode="numeric" />
                <button disabled={sending || loginCpf.replace(/\D/g, "").length !== 11} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
                  {sending ? "Enviando..." : "Confirmar e enviar código"}
                </button>
                <button type="button" onClick={() => { setLoginStep("choice"); setError(""); }} className="w-full text-center text-xs font-black text-black/45 underline">Voltar</button>
              </form>
            )}

            {loginStep === "code" && (
              <form onSubmit={verifyOtp} className="space-y-3">
                <label className="block text-xs font-black uppercase text-black/45">Código enviado para {loginPhone}
                  <input required value={loginCode} onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className={`${input} mt-1 text-center tracking-[0.5em]`} placeholder="••••••" inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
                </label>
                <button disabled={sending || loginCode.length < 6} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
                  {sending ? "Entrando..." : pendingSignup ? "Confirmar e criar conta" : "Entrar"}
                </button>
                <div className="flex items-center justify-between text-xs font-black text-black/45">
                  <button type="button" onClick={() => { setLoginStep("phone"); setLoginCode(""); setPendingSignup(null); setError(""); }} className="underline">Trocar número</button>
                  <button type="button" disabled={resendIn > 0 || sending} onClick={resend} className="underline disabled:opacity-40">
                    {resendIn > 0 ? `Reenviar em ${resendIn}s` : "Reenviar código"}
                  </button>
                </div>
              </form>
            )}
            {loginStep !== "code" && <p className="text-center text-[11px] font-bold text-black/40">Entregadores: entre com o telefone do seu cadastro.</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <label className="block text-xs font-black uppercase text-black/45">Nome completo
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} placeholder="Seu nome" autoComplete="name" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">WhatsApp / telefone
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} className={`${input} mt-1`} placeholder="(11) 98765-4321" inputMode="tel" autoComplete="tel" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">CPF (opcional)
              <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} className={`${input} mt-1`} placeholder="000.000.000-00" inputMode="numeric" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">Aniversário 🎂 (ganhe pontos no seu dia)
              <input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} className={`${input} mt-1`} />
            </label>
            {form.inviterId ? (
              <div className="rounded-[10px] bg-[#e8f6ee] px-3 py-2 text-xs font-bold text-[#1d7a3e]">
                <div>✓ Convite aplicado — quem te convidou ganha pontos quando você confirmar o telefone.</div>
                <div className="mt-0.5">Indicado por: <b data-i18n-skip>{form.inviterId}</b></div>
              </div>
            ) : null}
            {error ? <div className="rounded-[10px] bg-[#fdeceb] px-3 py-2 text-sm font-bold text-[#c4423b]">{error}</div> : null}
            <button disabled={sending || !form.name.trim() || form.phone.replace(/\D/g, "").length < 10} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
              {sending ? "Enviando código..." : "Criar conta grátis"}
            </button>
            <p className="text-center text-[11px] font-bold text-black/40">Enviaremos um código por SMS para confirmar seu número — sua conta é criada na hora.</p>
          </form>
        )}
      </div>
    </main>
  );
}
