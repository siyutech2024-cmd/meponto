"use client";

import { useState } from "react";
import { Bike, LogIn, UserPlus } from "lucide-react";
import { writeSession } from "../lib/session";
import { useVentoStore } from "../lib/store";
import type { Role } from "../lib/rbac";

type LoginUser = { name: string; role: Role; portal: string; organization: string; identifier: string; defaultPath: string; franchise?: string; station?: string };

const field =
  "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-white outline-none placeholder:text-white/40 focus:border-[#ffd84d]/70 focus:bg-white/10";

export default function RiderLoginPage() {
  const setRole = useVentoStore((state) => state.setRole);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState({ identifier: "", password: "" });
  const [reg, setReg] = useState({ name: "", phone: "", email: "", password: "", birthday: "", pix: "", station: "", inviteCode: "" });

  function enter(user: LoginUser) {
    setRole(user.role);
    writeSession({
      name: user.name,
      role: user.role,
      portal: user.portal,
      organization: user.organization,
      identifier: user.identifier,
      franchise: user.franchise,
      station: user.station,
    });
    window.location.href = "/rider-app";
  }

  async function doLogin(identifier: string, password: string) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, portal: "rider" }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; user?: LoginUser };
    if (!response.ok || !payload.user) throw new Error(payload.error ?? "Não foi possível entrar. Confira e-mail/telefone e senha.");
    enter(payload.user);
  }

  return (
    <main
      data-i18n-skip
      className="grid min-h-screen place-items-center px-4 py-10 text-white"
      style={{
        background:
          "radial-gradient(700px 460px at 15% -5%, rgba(98,54,255,0.30), transparent 55%), radial-gradient(640px 420px at 90% 8%, rgba(13,118,255,0.24), transparent 55%), linear-gradient(180deg, #070a14 0%, #0a0e1d 60%, #070a14 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/meponto-logo.png" alt="MePonto" className="mx-auto h-12 w-auto" />
          <h1 className="mt-4 flex items-center justify-center gap-2 text-2xl font-black">
            <Bike size={22} className="text-[#ffd84d]" /> App do Entregador
          </h1>
          <p className="mt-1 text-sm font-bold text-white/55">Escalas, carteira, pontos e suporte — tudo em um lugar.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
          <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-white/15">
            <button
              type="button"
              onClick={() => { setTab("login"); setError(""); }}
              className={`h-11 text-sm font-black uppercase ${tab === "login" ? "bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-[#1a1405]" : "text-white/60"}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setTab("register"); setError(""); }}
              className={`h-11 text-sm font-black uppercase ${tab === "register" ? "bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-[#1a1405]" : "text-white/60"}`}
            >
              Criar conta
            </button>
          </div>

          {error && <div className="mb-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm font-black text-red-300">{error}</div>}

          {tab === "login" ? (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await doLogin(login.identifier, login.password);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input className={field} placeholder="E-mail ou telefone" value={login.identifier} onChange={(e) => setLogin({ ...login, identifier: e.target.value })} autoComplete="username" />
              <input className={field} type="password" placeholder="Senha" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} autoComplete="current-password" />
              <button
                type="submit"
                disabled={busy || !login.identifier.trim() || !login.password}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-sm font-black uppercase text-[#1a1405] shadow-[0_8px_30px_rgba(255,196,46,0.3)] disabled:opacity-50"
              >
                <LogIn size={16} /> {busy ? "Entrando..." : "Entrar"}
              </button>
            </form>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const response = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(reg),
                  });
                  const payload = (await response.json().catch(() => ({}))) as { error?: string; data?: { user: LoginUser } };
                  if (!response.ok || !payload.data?.user) throw new Error(payload.error ?? "Não foi possível criar a conta.");
                  // Auto-login right after registration.
                  await doLogin(reg.email.trim() || reg.phone.replace(/\s/g, ""), reg.password);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input className={field} placeholder="Nome completo *" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} autoComplete="name" />
              <div className="grid grid-cols-2 gap-3">
                <input className={field} placeholder="Telefone (DDD) *" inputMode="tel" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} autoComplete="tel" />
                <input className={field} type="password" placeholder="Senha (mín. 6) *" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} autoComplete="new-password" />
              </div>
              <input className={field} placeholder="E-mail (opcional)" inputMode="email" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} autoComplete="email" />
              <div className="grid grid-cols-2 gap-3">
                <input className={field} placeholder="Nascimento" type="date" value={reg.birthday} onChange={(e) => setReg({ ...reg, birthday: e.target.value })} />
                <input className={field} placeholder="Chave PIX" value={reg.pix} onChange={(e) => setReg({ ...reg, pix: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className={field} placeholder="Estação (ex.: Pinheiros)" value={reg.station} onChange={(e) => setReg({ ...reg, station: e.target.value })} />
                <input className={field} placeholder="Código de convite" value={reg.inviteCode} onChange={(e) => setReg({ ...reg, inviteCode: e.target.value })} />
              </div>
              {/* Honeypot */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              <button
                type="submit"
                disabled={busy || !reg.name.trim() || !reg.phone.trim() || reg.password.length < 6}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ffd84d] to-[#ff9d2e] text-sm font-black uppercase text-[#1a1405] shadow-[0_8px_30px_rgba(255,196,46,0.3)] disabled:opacity-50"
              >
                <UserPlus size={16} /> {busy ? "Criando..." : "Criar conta e entrar"}
              </button>
              <p className="text-center text-[11px] font-bold leading-4 text-white/40">
                Ao criar a conta você vira membro MePonto e aceita a <a href="/privacy" className="underline">política de privacidade</a>.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
