type BrandMarkProps = {
  size?: "sm" | "lg";
};

const markSizes = {
  sm: "h-11 w-11",
  lg: "h-16 w-16",
};

export function BrandMark({ size = "sm" }: BrandMarkProps) {
  return (
    <div
      aria-hidden="true"
      className={`${markSizes[size]} relative shrink-0 overflow-hidden rounded-xl border border-[#d9e5e0] bg-[#087857] shadow-[0_6px_16px_rgba(8,120,87,0.18)]`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#087857,#0d9069)]" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 64 64" role="img">
        <path
          d="M16 44V24c0-5 3-8 8-8s8 3 8 8v20m0-20c0-5 3-8 8-8s8 3 8 8v8c0 5-3 8-8 8h-8"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5.5"
        />
        <circle cx="48" cy="18" r="4.5" fill="#06131b" stroke="white" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

export function BrandLockup({ markSize = "sm", heading = false }: { markSize?: BrandMarkProps["size"]; heading?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={markSize} />
      <div>
        {heading ? (
          <h1 className="text-xl font-extrabold tracking-tight text-[#17211e] font-[family-name:var(--font-outfit)]">
            meponto
          </h1>
        ) : (
          <div className="text-xl font-extrabold tracking-tight text-[#17211e] font-[family-name:var(--font-outfit)]">
            meponto
          </div>
        )}
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">PontoSys</div>
      </div>
    </div>
  );
}
