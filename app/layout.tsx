import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { I18nRuntime } from "./components/i18n-runtime";
import { StoreHydrator } from "./components/store-hydrator";
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
  title: "MePonto",
  description: "MePonto — turnos, pontos e operações para entregadores parceiros",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MePonto", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/meponto-logo-icon.png",
    apple: "/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#0b0e14",
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
        <StoreHydrator />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
          }}
        />
      </body>
    </html>
  );
}
