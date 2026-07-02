import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Ming Liu · MePonto",
  description: "刘鸣 Ming Liu — Fundador · MePonto. O ponto de quem entrega.",
  openGraph: {
    title: "Ming Liu · MePonto",
    description: "Fundador · MePonto — O ponto de quem entrega.",
  },
};

export default function LiumingLayout({ children }: { children: ReactNode }) {
  return children;
}
