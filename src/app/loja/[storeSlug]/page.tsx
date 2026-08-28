import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicStorefront } from "@/components/checkout/public-storefront";
import {
  loadPublicStorefrontOrganization,
  loadPublicStorefrontPageData,
  resolvePublicStorefrontBranding,
} from "@/lib/sales-catalog/public-storefront-loader";

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

  return {
    title: `${branding.displayName} | Loja`,
    description: `Compre produtos da ${branding.displayName} com checkout seguro e atendimento no WhatsApp.`,
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
      <script
        id="connecty-public-tracking-context"
        dangerouslySetInnerHTML={{
          __html: `window.__CONNECTYHUB_TRACKING_CONTEXT__=${safeJson(data.publicTrackingContext)};`,
        }}
      />
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
