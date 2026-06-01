type BrandMarkProps = {
  size?: "sm" | "lg";
};

const markSizes = {
  sm: "h-11 w-11",
  lg: "h-16 w-16",
};

export function BrandMark({ size = "sm" }: BrandMarkProps) {
  return (
    <Image
      alt="meponto"
      className={`${markSizes[size]} shrink-0 rounded-xl shadow-[0_6px_16px_rgba(30,41,59,0.16)]`}
      height={64}
      priority
      src="/meponto-logo.svg"
      width={64}
    />
  );
}

export function BrandLockup({ markSize = "sm", heading = false }: { markSize?: BrandMarkProps["size"]; heading?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={markSize} />
      <div>
        {heading ? (
          <h1 className="text-xl font-extrabold tracking-tight text-[#0f172a] font-[family-name:var(--font-outfit)]">
            meponto
          </h1>
        ) : (
          <div className="text-xl font-extrabold tracking-tight text-[#0f172a] font-[family-name:var(--font-outfit)]">
            meponto
          </div>
        )}
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">PontoSys</div>
      </div>
    </div>
  );
}
import Image from "next/image";
