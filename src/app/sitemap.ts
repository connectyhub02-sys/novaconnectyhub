import type { MetadataRoute } from "next";
import { loadPublicCatalogIndex } from "@/lib/seo/public-index";
import { buildCanonicalUrl } from "@/lib/seo/site";
import { solutionPages } from "@/lib/seo/solution-pages";

type SitemapEntry = MetadataRoute.Sitemap[number];

export const runtime = "nodejs";
export const revalidate = 3600;

const staticRoutes: Array<{
  path: string;
  changeFrequency: SitemapEntry["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/solucoes", changeFrequency: "weekly", priority: 0.9 },
  { path: "/docs/api", changeFrequency: "weekly", priority: 0.9 },
  { path: "/cadastro", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privacidade", changeFrequency: "yearly", priority: 0.3 },
  { path: "/termos", changeFrequency: "yearly", priority: 0.3 },
  { path: "/exclusao-de-dados", changeFrequency: "yearly", priority: 0.25 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const publicCatalog = await loadPublicCatalogIndex({ productLimit: 5000 });
  const entries: SitemapEntry[] = [
    ...staticRoutes.map((route) => ({
      url: buildCanonicalUrl(route.path),
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...solutionPages.map((page) => ({
      url: buildCanonicalUrl(`/solucoes/${page.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.82,
    })),
    ...publicCatalog.stores.flatMap((store) => [
      {
        url: store.url,
        lastModified: toSitemapDate(store.updatedAt) ?? now,
        changeFrequency: "daily" as const,
        priority: 0.72,
      },
      {
        url: store.productsUrl,
        lastModified: toSitemapDate(store.updatedAt) ?? now,
        changeFrequency: "daily" as const,
        priority: 0.68,
      },
    ]),
    ...publicCatalog.products.map((product) => ({
      url: product.url,
      lastModified: toSitemapDate(product.updatedAt) ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.62,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    })),
  ];

  return dedupeSitemapEntries(entries);
}

function dedupeSitemapEntries(entries: SitemapEntry[]) {
  const byUrl = new Map<string, SitemapEntry>();

  for (const entry of entries) {
    if (!byUrl.has(entry.url)) {
      byUrl.set(entry.url, entry);
    }
  }

  return Array.from(byUrl.values());
}

function toSitemapDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
