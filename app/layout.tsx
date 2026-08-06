import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Outfit } from "next/font/google";
import { I18nRuntime } from "./components/i18n-runtime";
import { StoreHydrator } from "./components/store-hydrator";
import { DialogProvider } from "./components/dialog";
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
        <DialogProvider>{children}</DialogProvider>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
          }}
        />
        {/* GA4 — stream "MePonto Web" (property descuai). Loaded after
            hydration so it never blocks first paint; GA4 enhanced measurement
            tracks SPA route changes via the History API automatically. */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-SKT4QZV5RV" strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-SKT4QZV5RV');`}
        </Script>
      </body>
    </html>
  );
}
