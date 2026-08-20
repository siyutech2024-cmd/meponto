import type { Metadata } from "next";
import { memory } from "../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../lib/server/persistence";
import type { MarketplaceProduct } from "../lib/points";

const SITE = "https://mall.meponto.com";
const TITLE = "PontoMall — Loja de benefícios MePonto";
const DESCRIPTION =
  "Troque seus pontos MePonto por equipamentos, vouchers e serviços. Cada entrega vira benefício: retire no seu ponto de apoio em São Paulo.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "PontoMall",
    locale: "pt_BR",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "https://www.meponto.com/og.png", width: 1200, height: 630 }],
  },
  robots: { index: true, follow: true },
};

/**
 * ISR: re-render the storefront shell (and the product JSON-LD below) at most
 * every 5 minutes. The interactive catalog still hydrates client-side; this
 * layer exists so crawlers and AI engines see the real products in the raw
 * HTML without executing JavaScript.
 */
export const revalidate = 300;

/** Public, rider-visible catalog (matches the storefront's own filter). */
async function publicProducts(): Promise<MarketplaceProduct[]> {
  try {
    await refreshCollectionsFromDatabase(["marketplaceProducts"]);
    return memory.marketplaceProducts
      .filter((p) => p.status === "active" && (p.audience === "rider" || p.audience === "both"))
      .slice(0, 50);
  } catch {
    // SEO layer must never break the storefront.
    return [];
  }
}

function productJsonLd(products: MarketplaceProduct[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE}/#catalog`,
    name: "Catálogo PontoMall",
    numberOfItems: products.length,
    itemListElement: products.map((p, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: p.name,
        ...(p.imageUrl ? { image: p.imageUrl } : {}),
        description:
          (p.description ? `${p.description} — ` : "") +
          `${p.pointsPrice.toLocaleString("pt-BR")} pontos MePonto` +
          (p.cashPriceBRL ? ` + R$ ${p.cashPriceBRL.toFixed(2)}` : ""),
        ...(p.category ? { category: p.category } : {}),
        ...(p.cashPriceBRL && p.cashPriceBRL > 0
          ? {
              offers: {
                "@type": "Offer",
                priceCurrency: "BRL",
                price: p.cashPriceBRL.toFixed(2),
                availability:
                  p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                url: SITE,
              },
            }
          : {}),
      },
    })),
  };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const products = await publicProducts();
  return (
    <>
      {products.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(products)) }}
        />
      )}
      {children}
    </>
  );
}
