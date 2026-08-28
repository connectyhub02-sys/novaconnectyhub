import type { Metadata } from "next";
import ProductPage, { generateMetadata as generateProductMetadata } from "@/app/produto/[productId]/page";

export const dynamic = "force-dynamic";

type StoreProductPageProps = {
  params: Promise<{ storeSlug: string; productId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: StoreProductPageProps): Promise<Metadata> {
  const { productId } = await params;

  return generateProductMetadata({
    params: Promise.resolve({ productId }),
    searchParams,
  });
}

export default async function StoreProductPage({ params, searchParams }: StoreProductPageProps) {
  const { productId } = await params;

  return (
    <ProductPage
      params={Promise.resolve({ productId })}
      searchParams={searchParams}
    />
  );
}
