import type { MetadataRoute } from "next";
import { buildCanonicalUrl, getConnectyhubSiteUrl } from "@/lib/seo/site";
import {publicCatalogSitemapIds} from "@/lib/seo/public-index";
export const revalidate=3600;

const privatePaths = [
  "/admin",
  "/admin/",
  "/api/",
  "/auth/",
  "/checkout",
  "/checkout/",
  "/dashboard",
  "/dashboard/",
  "/loja/*/carrinho",
  "/r/",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // The public site's crawl policy must survive a catalog/database outage.
  const ids=await publicCatalogSitemapIds().catch(() => [{ id: 0 }]);
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
      {
        userAgent: ["OAI-SearchBot", "ChatGPT-User", "GPTBot"],
        allow: "/",
        disallow: privatePaths,
      },
    ],
    sitemap: [buildCanonicalUrl("/sitemap.xml"),...ids.map(({id})=>buildCanonicalUrl(`/catalogo/sitemap/${id}.xml`))],
    host: getConnectyhubSiteUrl(),
  };
}
