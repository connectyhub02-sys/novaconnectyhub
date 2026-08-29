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
  const publicCatalog = await loadPublicCatalogIndex({ productLimit: 300 });
  const lines = [
    "# ConnectyHub full public index",
    "",
    connectyhubSiteDescription,
    "",
    "## Canonical resources",
    `- Site: ${siteUrl}`,
    `- Sitemap: ${buildCanonicalUrl("/sitemap.xml")}`,
    `- Robots: ${buildCanonicalUrl("/robots.txt")}`,
    `- API docs: ${buildCanonicalUrl("/docs/api")}`,
    `- OpenAPI JSON: ${buildCanonicalUrl("/docs/api/openapi.json")}`,
    "",
    "## Solutions",
    ...solutionPages.flatMap((page) => [
      `### ${page.title}`,
      `URL: ${buildCanonicalUrl(`/solucoes/${page.slug}`)}`,
      `Description: ${page.description}`,
      `Direct answer: ${page.intentAnswer}`,
      `Keywords: ${page.keywords.join(", ")}`,
      "",
    ]),
    "## API endpoint groups",
    ...docsCatalog.groups.flatMap((group) => [
      `### ${group.name}`,
      group.description,
      ...group.endpoints.map((endpoint) => `- ${endpoint.method} ${docsCatalog.baseUrl}${endpoint.path}: ${endpoint.summary}`),
      "",
    ]),
    "## API schemas",
    ...docsCatalog.schemas.map((schema) => `- ${schema.name}: ${schema.description || `${schema.fields.length} documented fields`}`),
    "",
    "## Public stores",
    ...publicCatalog.stores.map((store) => `- ${store.name}: ${store.url} | Products: ${store.productsUrl} | Count: ${store.productCount}`),
    "",
    "## Public products",
    ...publicCatalog.products.map((product) => (
      `- ${product.title}: ${product.url} | Store: ${product.organizationName} | Category: ${product.category ?? "Produto"} | Price: ${product.price ?? "sob consulta"} ${product.currency}`
    )),
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
