"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { BrandLockup } from "./brand";
import { portalConfigs, testAccounts, type PortalId } from "../lib/portals";
import type { Role } from "../lib/rbac";
import { writeSession } from "../lib/session";
import { useVentoStore } from "../lib/store";

export function PortalLogin({ portalId }: { portalId: PortalId }) {
  const portal = portalConfigs[portalId];
  const account = testAccounts.find((item) => item.portal === portalId);
  const setRole = useVentoStore((state) => state.setRole);
  const [identifier, setIdentifier] = useState(account?.identifier ?? "");
  const [password, setPassword] = useState(account?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_480px]">
        <section className="flex flex-col justify-between border-b border-[var(--line)] bg-[#050505] p-6 text-white lg:border-b-0 lg:border-r lg:p-10">
          <div className="flex items-center justify-between gap-4">
            <BrandLockup markSize="lg" />
            <span className="rounded border border-white/15 px-3 py-2 text-xs font-black uppercase text-[var(--accent)]">{portal.productName}</span>
          </div>
          <div className="my-12 max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-black uppercase text-[var(--accent)]">
              <ShieldCheck size={16} />
              Dedicated secure access
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight md:text-6xl">{portal.title}</h1>
            <p className="mt-5 max-w-2xl text-base font-bold leading-7 text-white/60">{portal.description}</p>
          </div>
          <div className="text-sm font-bold text-white/45">{portal.futureDomain}</div>
        </section>

        <section className="grid place-items-center px-4 py-8">
          <div className="w-full max-w-md">
            <Link href="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
              <ArrowLeft size={16} />
              返回系统选择
            </Link>
            <div className="panel p-5">
              <div className="mb-5">
                <div className="text-xs font-black uppercase text-[var(--accent)]">{portal.loginHint}</div>
                <h2 className="mt-1 text-2xl font-black">账户登录</h2>
              </div>

              {account ? (
                <div className="mb-4 rounded border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-sm">
                  <div className="font-black">{account.name}</div>
                  <div className="mt-1 text-xs font-bold text-[var(--muted)]">{account.identifier} / {account.password}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{account.organization}</div>
                </div>
              ) : null}

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
                      setError(payload.error ?? "登录失败");
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
                    setError("登录服务暂时不可用");
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase text-[var(--muted)]">邮箱或手机号</span>
                  <span className="flex h-12 items-center gap-3 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3">
                    <Mail size={18} className="text-[var(--muted)]" />
                    <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase text-[var(--muted)]">密码</span>
                  <span className="flex h-12 items-center gap-3 rounded border border-[var(--line)] bg-[var(--surface-raised)] px-3">
                    <Lock size={18} className="text-[var(--muted)]" />
                    <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} className="min-w-0 flex-1 bg-transparent outline-none" />
                    <button type="button" aria-label="显示密码" onClick={() => setShowPassword((value) => !value)} className="grid h-9 w-9 place-items-center rounded border border-[var(--line)]">
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
                {error ? <div className="rounded border border-[var(--danger)] bg-[var(--danger-bg)] p-3 text-sm font-bold text-[var(--danger-ink)]">{error}</div> : null}
                <button disabled={submitting} className="h-12 w-full rounded bg-[var(--accent)] font-black text-[var(--accent-ink)] disabled:opacity-50">
                  {submitting ? "登录中" : `进入${portal.productName}`}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

