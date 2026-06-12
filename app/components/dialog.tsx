"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * App-themed replacement for window.alert / confirm / prompt. Renders inside
 * the MePonto surface (panel + accent) instead of the browser's native popup.
 */
type DialogKind = "alert" | "confirm" | "prompt";

type DialogRequest = {
  kind: DialogKind;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "danger";
  resolve: (value: string | boolean | null) => void;
};

type DialogApi = {
  alert: (title: string, message?: string) => Promise<void>;
  confirm: (title: string, opts?: { message?: string; confirmText?: string; cancelText?: string; tone?: "default" | "danger" }) => Promise<boolean>;
  prompt: (title: string, opts?: { message?: string; placeholder?: string; defaultValue?: string; confirmText?: string }) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState("");

  const api = useMemo<DialogApi>(
    () => ({
      alert: (title, message) =>
        new Promise<void>((resolve) => setRequest({ kind: "alert", title, message, resolve: () => resolve() })),
      confirm: (title, opts) =>
        new Promise<boolean>((resolve) =>
          setRequest({ kind: "confirm", title, message: opts?.message, confirmText: opts?.confirmText, cancelText: opts?.cancelText, tone: opts?.tone, resolve: (v) => resolve(Boolean(v)) }),
        ),
      prompt: (title, opts) =>
        new Promise<string | null>((resolve) => {
          setInputValue(opts?.defaultValue ?? "");
          setRequest({ kind: "prompt", title, message: opts?.message, placeholder: opts?.placeholder, defaultValue: opts?.defaultValue, confirmText: opts?.confirmText, resolve: (v) => resolve(typeof v === "string" ? v : null) });
        }),
    }),
    [],
  );

  const close = useCallback(
    (value: string | boolean | null) => {
      request?.resolve(value);
      setRequest(null);
      setInputValue("");
    },
    [request],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {request && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--overlay)] p-4 backdrop-blur-sm" onMouseDown={() => request.kind === "alert" && close(null)}>
          <div className="panel w-full max-w-md p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-[var(--text)]">{request.title}</h2>
            {request.message && <p className="mt-2 whitespace-pre-line text-sm font-bold leading-6 text-[var(--muted-strong)]">{request.message}</p>}
            {request.kind === "prompt" && (
              <input
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && close(inputValue)}
                placeholder={request.placeholder}
                className="mt-3 h-11 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
            )}
            <div className="mt-5 flex justify-end gap-2">
              {request.kind !== "alert" && (
                <button type="button" onClick={() => close(request.kind === "prompt" ? null : false)} className="h-10 rounded-[8px] border border-[var(--line)] px-4 text-sm font-black text-[var(--muted-strong)] hover:border-[var(--muted)]">
                  {request.cancelText ?? "取消"}
                </button>
              )}
              <button
                type="button"
                onClick={() => close(request.kind === "prompt" ? inputValue : request.kind === "confirm" ? true : null)}
                className={`h-10 rounded-[8px] px-5 text-sm font-black ${request.tone === "danger" ? "bg-[var(--danger)] text-white" : "bg-[var(--accent)] text-[var(--accent-ink)]"}`}
              >
                {request.confirmText ?? "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
