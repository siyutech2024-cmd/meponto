import type { Metadata } from "next";

const TITLE = "PontoMall — Loja de benefícios MePonto";
const DESCRIPTION =
  "Troque seus pontos MePonto por equipamentos, vouchers e serviços. Cada entrega vira benefício: retire no seu ponto de apoio em São Paulo.";

export const metadata: Metadata = {
  metadataBase: new URL("https://mall.meponto.com"),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "https://mall.meponto.com",
    siteName: "PontoMall",
    locale: "pt_BR",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "https://www.meponto.com/og.png", width: 1200, height: 630 }],
  },
  robots: { index: true, follow: true },
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
