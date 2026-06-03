"use client";

import Link from "next/link";
import { CheckCircle2, KeyRound, Lock, Phone, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { BrandMark } from "../components/brand";

type ResetStatus = "idle" | "code_sent" | "password_reset";

export default function ResetPasswordPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<ResetStatus>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function postReset(payload: Record<string, string>) {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { status?: ResetStatus; message?: string; demoCode?: string; error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? "Reset request failed");
    }

    return data;
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const data = await postReset({ phone });
      setStatus(data.status ?? "code_sent");
      setMessage(`${data.message ?? "Verification code sent."} Demo code: ${data.demoCode ?? "246810"}`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Reset request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function completeReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const data = await postReset({ phone, code, newPassword });
      setStatus(data.status ?? "password_reset");
      setMessage(data.message ?? "Demo password reset complete.");
      setCode("");
      setNewPassword("");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <div className="industrial-shadow w-full max-w-lg rounded border border-[#2a2a4a] bg-[#0d0d1a] p-5">
        <div className="mb-8 flex items-center gap-4">
          <BrandMark size="lg" />
          <div>
            <h1 className="text-3xl font-black">Reset Password</h1>
            <p className="text-sm uppercase text-[#8b8ba3]">MePonto PontoSys account recovery</p>
          </div>
        </div>

        <div className="mb-4 rounded border border-[#2a2a4a] bg-[#1a1a2e] p-3 text-sm text-[#8b8ba3]">
          Enter a phone number to receive a demo verification code, then confirm the code with a new password.
        </div>

        <form className="space-y-4" onSubmit={requestCode}>
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">Phone Number</span>
            <span className="flex h-12 items-center gap-3 rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3">
              <Phone size={18} className="text-[#8b8ba3]" />
              <input
                name="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="+55 11 90000-0000"
                inputMode="tel"
              />
            </span>
          </label>

          <button
            disabled={isSubmitting || !phone}
            className="h-12 w-full rounded border border-[#8b5cf6] bg-[#8b5cf6] font-black text-white disabled:cursor-not-allowed disabled:border-[#2a2a4a] disabled:bg-[#1a1a2e] disabled:text-[#4a4a60]"
          >
            Request Reset Code
          </button>
        </form>

        <div className="my-5 h-px bg-[#3c3f2e]" />

        <form className="space-y-4" onSubmit={completeReset}>
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">Verification Code</span>
            <span className="flex h-12 items-center gap-3 rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3">
              <KeyRound size={18} className="text-[#8b8ba3]" />
              <input
                name="code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="246810"
                inputMode="numeric"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">New Password</span>
            <span className="flex h-12 items-center gap-3 rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3">
              <Lock size={18} className="text-[#8b8ba3]" />
              <input
                name="newPassword"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="Enter New Password"
                type="password"
              />
            </span>
          </label>

          {error ? (
            <div className="rounded border border-[#f43f5e] bg-[#f43f5e]/15 px-3 py-2 text-sm font-bold text-[#fb7185]">{error}</div>
          ) : null}

          {message ? (
            <div className="flex gap-3 rounded border border-[#06d6a0] bg-[#102318] px-3 py-2 text-sm font-bold text-[#8af0b2]">
              {status === "password_reset" ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
              <span>{message}</span>
            </div>
          ) : null}

          <button
            disabled={isSubmitting || !phone || !code || !newPassword}
            className="h-12 w-full rounded border border-[#8b5cf6] bg-[#8b5cf6] font-black text-white disabled:cursor-not-allowed disabled:border-[#2a2a4a] disabled:bg-[#1a1a2e] disabled:text-[#4a4a60]"
          >
            Set New Password
          </button>
        </form>

        <Link href="/login" className="mt-5 block text-center text-sm font-bold text-[#8b8ba3]">
          Back to Login
        </Link>
      </div>
    </main>
  );
}
