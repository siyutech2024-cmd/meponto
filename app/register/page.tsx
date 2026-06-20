"use client";

import { FormEvent, useEffect, useState } from "react";

/** Public member self-registration (公开用户 → 会员一级). */
export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", phone: "", cpf: "", inviterId: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [memberId, setMemberId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setForm((f) => ({ ...f, inviterId: ref }));
  }, []);

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

  return (
    <main className="min-h-screen w-full" style={{ background: "linear-gradient(135deg,#fff4cf,#ffd9a8)" }}>
      <div className="mx-auto max-w-lg px-5 py-10">
        <div className="mb-6 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#ff7a00]">MePonto · PontoMall</div>
          <h1 className="mt-2 text-3xl font-black text-[#19202c]">Criar conta de membro</h1>
          <p className="mt-2 text-sm font-bold text-black/55">Cadastre-se grátis, acumule pontos e troque por produtos — retirada em qualquer Ponto.</p>
        </div>

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
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <label className="block text-xs font-black uppercase text-black/45">Nome completo
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} placeholder="Seu nome" />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">WhatsApp / telefone
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${input} mt-1`} placeholder="+55 11 9...." />
            </label>
            <label className="block text-xs font-black uppercase text-black/45">CPF (opcional)
              <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className={`${input} mt-1`} placeholder="000.000.000-00" />
            </label>
            {form.inviterId ? <div className="rounded-[10px] bg-[#e8f6ee] px-3 py-2 text-xs font-bold text-[#1d7a3e]">✓ Convite aplicado — quem te convidou ganha pontos.</div> : null}
            {error ? <div className="rounded-[10px] bg-[#fdeceb] px-3 py-2 text-sm font-bold text-[#c4423b]">{error}</div> : null}
            <button disabled={state === "sending"} className="h-12 w-full rounded-[10px] bg-[#ff7a00] text-sm font-black text-[#19202c] disabled:opacity-50">
              {state === "sending" ? "Criando..." : "Criar conta grátis"}
            </button>
            <p className="text-center text-[11px] font-bold text-black/40">Já tem 99 ID? Use o login do app do entregador.</p>
          </form>
        )}
      </div>
    </main>
  );
}
