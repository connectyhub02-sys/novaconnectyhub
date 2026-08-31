import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicStorefront } from "@/components/checkout/public-storefront";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicTrackingContextBridge } from "@/components/tracking/public-tracking-context-bridge";
import {
  loadPublicStorefrontOrganization,
  loadPublicStorefrontPageData,
  resolvePublicStorefrontBranding,
} from "@/lib/sales-catalog/public-storefront-loader";
import { buildStorefrontStructuredData } from "@/lib/seo/structured-data";
import { toAbsoluteUrl } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

type StorePageProps = {
  params: Promise<{ storeSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const organization = await loadPublicStorefrontOrganization(storeSlug);

  if (!organization) {
    return {
      title: "Loja | ConnectyHub",
      description: "Loja indisponivel.",
    };
  }

  const branding = resolvePublicStorefrontBranding(organization);
  const description = `Compre produtos da ${branding.displayName} com checkout seguro e atendimento no WhatsApp.`;
  const imageUrl = toAbsoluteUrl(branding.logoUrl);
  const canonical = `/loja/${encodeURIComponent(organization.slug ?? organization.id)}`;

  return {
    title: `${branding.displayName} | Loja`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${branding.displayName} | Loja`,
      description,
      url: canonical,
      siteName: "ConnectyHub",
      locale: "pt_BR",
      type: "website",
      images: imageUrl ? [{ url: imageUrl, alt: branding.logoAlt }] : ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${branding.displayName} | Loja`,
      description,
      images: imageUrl ? [imageUrl] : ["/opengraph-image"],
    },
    pinterest: {
      richPin: true,
    },
  };
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const data = await loadPublicStorefrontPageData({
    storeSlug,
    query: (await searchParams) ?? {},
  });

  if (!data) {
    notFound();
  }

  return (
    <>
      <JsonLd
        id="connectyhub-storefront-jsonld"
        data={buildStorefrontStructuredData({
          storeSlug: data.storeSlug,
          displayName: data.branding.displayName,
          description:
            data.storefront.headerText
            ?? `Produtos selecionados pela ${data.branding.displayName}, com atendimento pelo WhatsApp e checkout seguro pela ConnectyHub.`,
          logoUrl: data.branding.logoUrl,
          pagePath: `/loja/${encodeURIComponent(data.storeSlug)}`,
          products: data.products.map((product) => ({
            id: product.id,
            title: product.title,
            description: product.description,
            category: product.category,
            priceCents: product.priceCents,
            coverUrl: product.coverUrl,
            stockLabel: product.stockLabel,
          })),
        })}
      />
      <script
        id="connecty-public-tracking-context"
        dangerouslySetInnerHTML={{
          __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(data.publicTrackingContext)};`,
        }}
      />
      <PublicTrackingContextBridge context={data.publicTrackingContext} />
      <PublicStorefront
        mode="home"
        storeSlug={data.storeSlug}
        branding={data.branding}
        storefront={data.storefront}
        products={data.products}
        tracking={data.tracking}
      />
    </>
  );
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
