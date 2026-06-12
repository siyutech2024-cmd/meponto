import type { Metadata } from "next";

/**
 * SEO / GEO layer for the public marketing homepage (meponto.com → /home).
 * Server component: metadata + JSON-LD are emitted in the raw HTML so both
 * classic crawlers and AI engines (which don't execute JS) see everything.
 */

const SITE = "https://www.meponto.com";
const TITLE = "MePonto — Rede de Pontos de Apoio para Entregadores em São Paulo";
const DESCRIPTION =
  "MePonto é a rede de pontos de apoio para entregadores em São Paulo: turnos transparentes pelo app, água, banheiro e segurança nos pontos, PontoMall de benefícios e franquias de última milha.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "ponto de apoio entregador",
    "ponto de apoio motoboy",
    "rede de apoio entregadores São Paulo",
    "turnos para entregadores",
    "renda extra entregador",
    "última milha",
    "last mile São Paulo",
    "franquia de entrega",
    "franquia última milha",
    "PontoMall",
    "MePonto",
    "99 entregas turnos",
    "apoio ao motofretista",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "MePonto",
    locale: "pt_BR",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MePonto — a rede da última milha em São Paulo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  other: {
    "geo.region": "BR-SP",
    "geo.placename": "São Paulo",
    "geo.position": "-23.5505;-46.6333",
    ICBM: "-23.5505, -46.6333",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "MePonto",
      url: SITE,
      logo: `${SITE}/meponto-logo.png`,
      slogan: "Conectar · Apoiar · Entregar",
      description: DESCRIPTION,
      areaServed: { "@type": "City", name: "São Paulo", address: { "@type": "PostalAddress", addressLocality: "São Paulo", addressRegion: "SP", addressCountry: "BR" } },
      sameAs: ["https://app.meponto.com", "https://mall.meponto.com", "https://franchise.meponto.com"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#site`,
      url: SITE,
      name: "MePonto",
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "Service",
      "@id": `${SITE}/#service`,
      name: "Rede de Pontos de Apoio MePonto",
      serviceType: "Pontos de apoio e gestão de turnos para entregadores de última milha",
      provider: { "@id": `${SITE}/#org` },
      areaServed: { "@type": "City", name: "São Paulo" },
      audience: { "@type": "Audience", audienceType: "Entregadores, motoboys e franqueados de logística" },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "O que é o MePonto?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "O MePonto é uma rede de pontos de apoio físicos para entregadores em São Paulo. Cada ponto oferece líder local, água, banheiro e segurança, e o app organiza turnos semanais com regras claras e pagamento correto.",
          },
        },
        {
          "@type": "Question",
          name: "Como faço para entregar com o MePonto?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Baixe ou acesse o app em app.meponto.com, faça o cadastro de entregador e escolha seus turnos semanais. Você decide quando rodar e acompanha ganhos e pontos no próprio app.",
          },
        },
        {
          "@type": "Question",
          name: "O que é o PontoMall?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "O PontoMall (mall.meponto.com) é o programa de benefícios do MePonto: cada entrega vira pontos, e os pontos viram produtos, serviços e descontos reais em parceiros do bairro.",
          },
        },
        {
          "@type": "Question",
          name: "Como ser franqueado MePonto?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Franqueados operam um território com modelo validado e sistema completo de operação, escala e finanças, com suporte da rede. Acesse franchise.meponto.com para iniciar a conversa.",
          },
        },
      ],
    },
  ],
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  );
}
