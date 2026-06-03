import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { I18nRuntime } from "./components/i18n-runtime";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MePonto PontoSys",
  description: "Sistema operacional MePonto PontoSys para riders, pontos e operacoes",
  icons: {
    icon: "/meponto-logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${outfit.variable}`}>
      <body className="font-[family-name:var(--font-inter)]">
        <I18nRuntime />
        {children}
      </body>
    </html>
  );
}
