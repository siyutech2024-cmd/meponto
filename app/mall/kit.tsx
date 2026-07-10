"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * PontoMall back-office shared kit — the small component vocabulary every
 * mall tab is built from (status badges, todo cards, drawer, toolbar, table,
 * pager, stats, section cards). Copy is hardcoded Chinese by design: this is
 * the internal HQ workspace, tone conventions live here so tabs stay thin.
 */

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

export type BadgeTone = "success" | "warn" | "danger" | "neutral" | "info";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  success: "border-[var(--success)]/40 bg-[var(--success-bg)] text-[var(--success)]",
  warn: "border-[var(--warn)]/40 bg-[var(--warn-bg)] text-[var(--warn)]",
  danger: "border-[var(--danger)]/40 bg-[var(--danger-bg)] text-[var(--danger)]",
  info: "border-[var(--info)]/40 bg-[var(--info-bg)] text-[var(--info)]",
  neutral: "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--muted)]",
};

export function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-[6px] border px-2 py-0.5 text-[11px] font-bold ${BADGE_TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TodoCard — "今天要处理什么" card; count-driven, clickable, tone-colored.
// ---------------------------------------------------------------------------

const TODO_TONE_COLOR: Record<BadgeTone, string> = {
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  neutral: "var(--muted)",
};

export function TodoCard({ label, value, tone = "neutral", hint, onClick, active, size = "md" }: {
  label: string;
  value: string | number;
  tone?: BadgeTone;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
  /** "sm" — compact overview variant (~72px tall, 20px number, one-line hint). */
  size?: "md" | "sm";
}) {
  const idle = tone === "neutral";
  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`panel min-w-0 text-left transition-colors ${sm ? "p-3" : "p-4"} ${onClick ? "hover:border-[var(--accent)]" : "cursor-default"} ${idle ? "opacity-60" : ""} ${active ? "border-[var(--accent)]" : ""}`}
    >
      <div className={`truncate font-bold uppercase text-[var(--muted)] ${sm ? "text-[10px]" : "text-[11px]"}`}>{label}</div>
      <div className={`font-black ${sm ? "mt-0.5 text-xl leading-6" : "mt-1 text-2xl"}`} style={{ color: TODO_TONE_COLOR[tone] ?? "var(--text)" }}>{value}</div>
      {hint && <div className={`mt-0.5 font-bold text-[var(--muted)] ${sm ? "truncate text-[10px]" : "text-[11px]"}`} title={sm ? hint : undefined}>{hint}</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Drawer — fixed right panel with overlay; Esc / overlay click closes.
// (Generalised from the products tab's ProductDrawer container.)
// ---------------------------------------------------------------------------

export function Drawer({ open, title, onClose, children, width = 420, ariaLabel }: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  ariaLabel?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onMouseDown={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="absolute right-0 top-0 flex h-full max-w-[94vw] flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ width }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] p-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)]">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar — search box + filter chips on the left, slot on the right.
// ---------------------------------------------------------------------------

export function Toolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="panel flex flex-wrap items-center gap-2 p-4">
      {children}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className = "w-64" }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`h-10 rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm font-bold outline-none focus:border-[var(--accent)] ${className}`}
    />
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)]"}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pager
// ---------------------------------------------------------------------------

export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 rounded-[8px] border border-[var(--line)] px-3 disabled:opacity-40">上一页</button>
      <span>第 {page} / {pages} 页 · 共 {total} 条</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 rounded-[8px] border border-[var(--line)] px-3 disabled:opacity-40">下一页</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat — plain metric card (label / value / hint).
// ---------------------------------------------------------------------------

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-bold uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard — panel with title / optional description / right slot / body.
// ---------------------------------------------------------------------------

export function SectionCard({ title, desc, right, children, className = "" }: {
  title: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <div className="text-xs font-black uppercase text-[var(--muted)]">{title}</div>
          {desc && <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">{desc}</div>}
        </div>
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTable — light wrapper: column defs (sortable optional) + rows + row
// click. Deliberately not universal; just enough for this back office.
// ---------------------------------------------------------------------------

export type DataColumn<T> = {
  key: string;
  label: ReactNode;
  /** Present → header renders a sort toggle reporting this key via onSort. */
  sortKey?: string;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => ReactNode;
};

export type SortState = { key: string; dir: 1 | -1 } | null;

export function DataTable<T>({ columns, rows, rowKey, onRowClick, sort, onSort, minWidth = 720, empty }: {
  columns: Array<DataColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: SortState;
  onSort?: (key: string) => void;
  minWidth?: number;
  empty?: ReactNode;
}) {
  return (
    <div className="panel overflow-x-auto p-0">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase text-[var(--muted)]">
            {columns.map((col, i) => (
              <th key={col.key} className={`py-2.5 ${i === 0 ? "px-3" : "pr-2"} ${col.align === "right" ? "text-right" : ""} ${col.className ?? ""}`}>
                {col.sortKey && onSort ? (
                  <button type="button" onClick={() => onSort(col.sortKey!)} className="inline-flex items-center gap-1 uppercase hover:text-[var(--text)]">
                    {col.label}
                    <span className="text-[9px]">{sort?.key === col.sortKey ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
                  </button>
                ) : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-t border-[var(--line)] font-bold ${onRowClick ? "cursor-pointer transition-colors hover:bg-[var(--surface-hover)]" : ""}`}
            >
              {columns.map((col, i) => (
                <td key={col.key} className={`py-2.5 ${i === 0 ? "px-3" : "pr-2"} ${col.align === "right" ? "text-right" : ""} ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center font-bold text-[var(--muted)]">{empty ?? "暂无数据。"}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
