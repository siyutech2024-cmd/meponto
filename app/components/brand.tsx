type BrandMarkProps = {
  size?: "sm" | "lg";
};

const markSizes = {
  sm: "h-11 w-auto max-w-[176px]",
  lg: "h-20 w-auto max-w-[300px]",
};

export function BrandMark({ size = "sm" }: BrandMarkProps) {
  return (
    <img
      src="/meponto-logo.png"
      alt="MePonto"
      className={`${markSizes[size]} shrink-0 rounded-lg object-contain shadow-[0_0_22px_rgba(255,212,0,0.14)]`}
    />
  );
}

export function BrandLockup({ markSize = "sm", heading = false }: { markSize?: BrandMarkProps["size"]; heading?: boolean }) {
  return (
    <div className="flex items-center">
      <BrandMark size={markSize} />
      {heading ? <h1 className="sr-only">MePonto PontoSys</h1> : null}
    </div>
  );
}
