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
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <div className="industrial-shadow w-full max-w-md rounded border border-[#2a2a4a] bg-[#0d0d1a] p-5">
        <div className="mb-8 flex items-center gap-4">
          <BrandLockup markSize="lg" heading />
          <select
            data-i18n-skip
            aria-label={t("language")}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            className="ml-auto h-10 rounded border border-[#2a2a4a] bg-[#1a1a2e] px-2 text-sm font-black outline-none"
          >
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.shortLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 rounded border border-[#2a2a4a] bg-[#1a1a2e] p-3 text-sm text-[#8b8ba3]">
          {t("loginDemo")} <span className="font-black text-[#f0f0ff]">+55 11 90000-0000</span> {t("withPassword")}{" "}
          <span className="font-black text-[#f0f0ff]">pontosys-demo</span>.
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
            <span className="flex h-12 items-center gap-3 rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3">
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
            <span className="flex h-12 items-center gap-3 rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3">
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
            className="h-12 w-full rounded border border-[#8b5cf6] bg-[#8b5cf6] font-black text-white disabled:cursor-not-allowed disabled:border-[#2a2a4a] disabled:bg-[#1a1a2e] disabled:text-[#4a4a60]"
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
