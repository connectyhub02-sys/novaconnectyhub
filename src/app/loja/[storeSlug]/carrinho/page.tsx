import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicStorefront } from "@/components/checkout/public-storefront";
import { PublicTrackingContextBridge } from "@/components/tracking/public-tracking-context-bridge";
import {
  loadPublicStorefrontOrganization,
  loadPublicStorefrontPageData,
  resolvePublicStorefrontBranding,
} from "@/lib/sales-catalog/public-storefront-loader";

export const dynamic = "force-dynamic";

type StoreCartPageProps = {
  params: Promise<{ storeSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: StoreCartPageProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const organization = await loadPublicStorefrontOrganization(storeSlug);

  if (!organization) {
    return {
      title: "Carrinho | ConnectyHub",
      description: "Carrinho indisponivel.",
    };
  }

  const branding = resolvePublicStorefrontBranding(organization);

  return {
    title: `Carrinho | ${branding.displayName}`,
    description: `Finalize sua compra na loja ${branding.displayName}.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function StoreCartPage({ params, searchParams }: StoreCartPageProps) {
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
      <script
        id="connecty-public-tracking-context"
        dangerouslySetInnerHTML={{
          __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(data.publicTrackingContext)};`,
        }}
      />
      <PublicTrackingContextBridge context={data.publicTrackingContext} />
      <PublicStorefront
        mode="shop"
        initialCartOpen
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
