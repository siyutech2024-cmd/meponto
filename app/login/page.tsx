"use client";

import Link from "next/link";
import { Eye, EyeOff, Lock, Phone } from "lucide-react";
import { useState } from "react";
import { BrandLockup } from "../components/brand";
import { languages, translate, type Language, type TranslationKey } from "../lib/i18n";
import { useVentoStore } from "../lib/store";

export default function LoginPage() {
  const language = useVentoStore((state) => state.language);
  const setLanguage = useVentoStore((state) => state.setLanguage);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = (key: TranslationKey) => translate(language, key);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] px-4 py-8">
      <div className="industrial-shadow w-full max-w-md rounded-2xl border border-[#dbe3ee] bg-white p-6">
        <div className="mb-8 flex items-center gap-4">
          <BrandLockup markSize="lg" heading />
          <select
            data-i18n-skip
            aria-label={t("language")}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            className="ml-auto h-10 rounded-lg border border-[#dbe3ee] bg-white px-2 text-sm font-black text-[#0f172a] outline-none"
          >
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.shortLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 rounded-lg border border-[#dbeafe] bg-[#eff6ff] p-3 text-sm text-[#475569]">
          {t("loginDemo")} <span className="font-black text-[#2563eb]">+55 11 90000-0000</span> {t("withPassword")}{" "}
          <span className="font-black text-[#2563eb]">pontosys-demo</span>.
        </div>

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const phone = String(form.get("phone") ?? "");
            const password = String(form.get("password") ?? "");

            if (!phone || !password) {
              setError(t("invalidLogin"));
              return;
            }

            setIsSubmitting(true);
            setError("");

            try {
              const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, password }),
              });
              const data = (await response.json()) as { error?: string };

              if (!response.ok) {
                setError(data.error ?? t("invalidLogin"));
                return;
              }

              window.location.href = "/dashboard";
            } catch {
              setError(t("loginServiceUnavailable"));
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">{t("phoneNumber")}</span>
            <span className="flex h-12 items-center gap-3 rounded-lg border border-[#dbe3ee] bg-white px-3">
              <Phone size={18} className="text-[#8b8ba3]" />
              <input
                name="phone"
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder={t("enterPhoneNumber")}
                inputMode="tel"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">{t("password")}</span>
            <span className="flex h-12 items-center gap-3 rounded-lg border border-[#dbe3ee] bg-white px-3">
              <Lock size={18} className="text-[#8b8ba3]" />
              <input
                name="password"
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder={t("enterPassword")}
                type={showPassword ? "text" : "password"}
              />
              <button
                aria-label={t("showPassword")}
                title={t("showPassword")}
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="grid h-9 w-9 place-items-center rounded border border-[#2a2a4a]"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          {error ? <div className="rounded border border-[#f43f5e] bg-[#f43f5e]/15 px-3 py-2 text-sm font-bold text-[#fb7185]">{error}</div> : null}

          <button
            disabled={isSubmitting}
            className="h-12 w-full rounded-lg border border-[#2563eb] bg-[#2563eb] font-black text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:border-[#d7dfdc] disabled:bg-[#edf1f7] disabled:text-[#9aa6a2]"
          >
            {isSubmitting ? t("loggingIn") : t("login")}
          </button>
          <Link href="/reset-password" className="block text-center text-sm font-bold text-[#8b8ba3]">
            {t("forgotPassword")}
          </Link>
        </form>
      </div>
    </main>
  );
}
