import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardRouteSource = readFileSync("src/app/api/dashboard/sales-catalog/route.ts", "utf8");
const importPatchRouteSource = readFileSync("src/app/api/dashboard/sales-catalog/imports/[jobId]/route.ts", "utf8");
const importerSource = readFileSync("src/lib/sales-catalog/importer.ts", "utf8");
const inngestFunctionsSource = readFileSync("src/lib/inngest/functions.ts", "utf8");
const whatsappSyncSource = readFileSync("src/lib/sales-catalog/whatsapp-sync.ts", "utf8");
const salesCatalogConsoleSource = readFileSync("src/components/connectyhub-os/sales-catalog-console.tsx", "utf8");

describe("WhatsApp catalog import review flow", () => {
  it("queues a review job instead of fetching WhatsApp products inside the dashboard request", () => {
    expect(dashboardRouteSource).toContain("queueWhatsappCatalogImportReview");
    expect(dashboardRouteSource).toContain('action === "import_whatsapp_catalog"');
    expect(dashboardRouteSource).toContain("whatsappCatalogImportProcessRequestedEventName");
    expect(dashboardRouteSource).toContain("salesCatalogImportProcessRequestedEventName");
    expect(dashboardRouteSource).toContain('sourcePlatform: "whatsapp_catalog"');
    expect(dashboardRouteSource).toContain("sales_catalog_import.inngest_dispatch_warning");
    expect(dashboardRouteSource).toContain("inngest.send");
    expect(dashboardRouteSource).not.toContain("await importWhatsappCatalog({");
    expect(whatsappSyncSource).toContain("createSalesCatalogImportQueuedReviewJob");
    expect(whatsappSyncSource).toContain("createSalesCatalogImportReviewJob");
    expect(whatsappSyncSource).toContain("processQueuedWhatsappCatalogImportReviews");
    expect(whatsappSyncSource).toContain("whatsappCatalogBackgroundPageTimeoutMs");
    expect(whatsappSyncSource).toContain("inspectWhatsappBusinessProfile");
    expect(whatsappSyncSource).toContain("sales_catalog_import.whatsapp_profile_probe");
    expect(whatsappSyncSource).toContain("sales_catalog_import.whatsapp_fetch_started");
    expect(whatsappSyncSource).toContain("sales_catalog_import.whatsapp_page_received");
    expect(whatsappSyncSource).toContain('sourcePlatform: "whatsapp_catalog"');
    expect(whatsappSyncSource).toContain("mapWhatsappProductToImportDraft");
    expect(whatsappSyncSource).toContain("category: null");
    expect(importerSource).toContain("completeSalesCatalogImportReviewJob");
    expect(importerSource).toContain('.neq("settings->>source_platform", "whatsapp_catalog")');
    expect(inngestFunctionsSource).toContain("connectyhubWhatsappCatalogImportSweep");
    expect(inngestFunctionsSource).toContain("process-whatsapp-catalog-import-jobs");
    expect(inngestFunctionsSource).toContain("shouldSweepWhatsappCatalog");
    expect(inngestFunctionsSource).toContain("whatsappCatalogImportProcessRequestedEventName");
  });

  it("requires saved categories before importing and publishing WhatsApp catalog products", () => {
    expect(importerSource).toContain('| "whatsapp_catalog"');
    expect(importerSource).toContain("assertImportPublishCategoryRules");
    expect(importerSource).toContain("Cadastre e salve categorias antes de publicar produtos vindos do catalogo WhatsApp.");
    expect(importerSource).toContain("Escolha uma categoria cadastrada para");
    expect(importerSource).toContain("requires_category_review");
    expect(salesCatalogConsoleSource).toContain("configuredCategoryOptions.length > 0");
    expect(salesCatalogConsoleSource).toContain("Cadastre e salve as categorias do catalogo antes de sincronizar.");
    expect(salesCatalogConsoleSource).toContain("countWhatsappImportItemsMissingCategory");
    expect(salesCatalogConsoleSource).toContain("categoryRequired={requiresCategoryReview}");
    expect(salesCatalogConsoleSource).toContain("sincronizacao whatsapp");
    expect(salesCatalogConsoleSource).toContain("Enfileirando a busca no provedor WhatsApp.");
    expect(salesCatalogConsoleSource).toContain("Aguardando produtos do WhatsApp");
    expect(importPatchRouteSource).toContain('currentImportJob.sourcePlatform !== "whatsapp_catalog"');
  });

  it("keeps WhatsApp source metadata when reviewed products become catalog items", () => {
    expect(importerSource).toContain("buildPublishedImportSourceMetadata");
    expect(importerSource).toContain('source: "whatsapp_catalog"');
    expect(importerSource).toContain('highlight_label: importedFromWhatsapp ? "Importado do WhatsApp" : "Importado por IA"');
    expect(importerSource).toContain("whatsapp_catalog_payload");
    expect(importerSource).toContain("whatsapp_catalog_imported_at");
  });
});
