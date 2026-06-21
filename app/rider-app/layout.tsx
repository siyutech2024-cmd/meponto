import type { ReactNode } from "react";
import { RiderSplash } from "./splash-gate";

/** Rider app shell: overlays the HQ-managed launch screen on every app launch. */
export default function RiderAppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RiderSplash />
      {children}
    </>
  );
}
