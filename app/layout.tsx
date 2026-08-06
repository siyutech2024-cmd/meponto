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
        {/* GA4 — property "MePonto" (own property since 2026-08-06; it used to
            share the "descuai" property with DESCU, which blended two products'
            users and sessions into one set of reports). Stream "MePonto Web",
            meponto.com — GA4 web streams cover subdomains automatically, so
            mall./franchise./app. all report here without extra tags.
            Timezone São Paulo, currency BRL.
            Loaded after hydration so it never blocks first paint; enhanced
            measurement tracks SPA route changes via the History API. */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-2F6D6V9CK8" strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-2F6D6V9CK8');`}
        </Script>
      </body>
    </html>
  );
}
