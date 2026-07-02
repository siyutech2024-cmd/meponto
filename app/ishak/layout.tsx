import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ishak Ma · MePonto",
  description: "马强 Ishak Ma — Responsável Comercial · MePonto. O ponto de quem entrega.",
  openGraph: {
    title: "Ishak Ma · MePonto",
    description: "Responsável Comercial · MePonto — O ponto de quem entrega.",
  },
};

export default function IshakLayout({ children }: { children: ReactNode }) {
  return children;
}
