import { NextResponse } from "next/server";
import { buildConnectyhubDocsCatalog } from "@/lib/connectyhub-api/docs-catalog";
import { connectyhubOpenApiSpec } from "@/lib/connectyhub-api/openapi";
import { loadPublicCatalogIndex } from "@/lib/seo/public-index";
import { buildCanonicalUrl, connectyhubSiteDescription, getConnectyhubSiteUrl } from "@/lib/seo/site";
import { solutionPages } from "@/lib/seo/solution-pages";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const siteUrl = getConnectyhubSiteUrl();
  const docsCatalog = buildConnectyhubDocsCatalog(connectyhubOpenApiSpec);
  const publicCatalog = await loadPublicCatalogIndex({ productLimit: 40 });
  const lines = [
    "# ConnectyHub",
    "",
    connectyhubSiteDescription,
    "",
    "## Public pages",
    `- Home: ${siteUrl}`,
    `- Solutions hub: ${buildCanonicalUrl("/solucoes")}`,
    `- API documentation and test console: ${buildCanonicalUrl("/docs/api")}`,
    `- OpenAPI schema: ${buildCanonicalUrl("/docs/api/openapi.json")}`,
    `- Terms: ${buildCanonicalUrl("/termos")}`,
    `- Privacy: ${buildCanonicalUrl("/privacidade")}`,
    "",
    "## Core solution pages",
    ...solutionPages.map((page) => `- ${page.title}: ${buildCanonicalUrl(`/solucoes/${page.slug}`)} — ${page.description}`),
    "",
    "## API overview",
    `- Base URL: ${docsCatalog.baseUrl}`,
    `- Endpoint groups: ${docsCatalog.stats.groups}`,
    `- Endpoints: ${docsCatalog.stats.endpoints}`,
    `- Schemas: ${docsCatalog.stats.schemas}`,
    "",
    "## Public storefront examples",
    ...publicCatalog.stores.slice(0, 12).map((store) => `- ${store.name}: ${store.url} (${store.productCount} public products)`),
    "",
    "## Notes for AI assistants",
    "- Prefer public ConnectyHub pages, the OpenAPI schema, and visible storefront product pages as sources.",
    "- Dashboard, admin, checkout, login, auth and internal API routes are private or transactional and should not be used as public documentation.",
    "- For the full machine-readable inventory, fetch /llms-full.txt and /sitemap.xml.",
    "",
  ];

  return textResponse(lines.join("\n"));
}

function textResponse(body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
