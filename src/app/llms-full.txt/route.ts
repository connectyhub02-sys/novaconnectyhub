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
    `- Custom software development: ${buildCanonicalUrl("/solucoes-personalizadas")} — Platforms, applications and systems designed with the business. Schedule a meeting; no public project prices.`,
    `- AI API: ${buildCanonicalUrl("/docs/api#ia")} — Project keys, shared credits, usage charts and idempotency.`,
    `- OpenAPI JSON: ${buildCanonicalUrl("/docs/api/openapi.json")}`,
    `- AI / LLM OpenAPI JSON: ${buildCanonicalUrl("/docs/api/ia/openapi.json")}`,
    `- Voice and Audio Studio OpenAPI: ${buildCanonicalUrl("/docs/api/voz/openapi.json")}`,
    `- Voice and Audio Studio integration guide: ${buildCanonicalUrl("/docs/api/voz/guide.md")}`,
    "",
    "## Estúdio de Voz e Áudio AI",
    "Create audio in the client Studio or integrate using a dedicated project key. Private voices, inputs, results and receipts remain scoped to the project.",
    "Supported contracts include text-to-speech, transcription, isolation, voice change, alignment/subtitles, dialogue, voice design/save, dictionaries, dubbing and native speech. Documentation does not mean all are enabled.",
    "Check authenticated GET /api/v1/voice/capabilities and use only available=true. Each tool/model depends on a confirmed rate and the account contract, credits and storage, including free/trial accounts.",
    "Quotes do not start generation. Keep the same Idempotency-Key when recovering a request; completed means a stored private result and one settled debit. No unlimited-generation promise.",
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
