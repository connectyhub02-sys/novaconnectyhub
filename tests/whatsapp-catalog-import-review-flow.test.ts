import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardRouteSource = readFileSync("src/app/api/dashboard/sales-catalog/route.ts", "utf8");
const importerSource = readFileSync("src/lib/sales-catalog/importer.ts", "utf8");
const whatsappSyncSource = readFileSync("src/lib/sales-catalog/whatsapp-sync.ts", "utf8");
const salesCatalogConsoleSource = readFileSync("src/components/connectyhub-os/sales-catalog-console.tsx", "utf8");

describe("WhatsApp catalog import review flow", () => {
  it("creates a review job instead of writing WhatsApp products directly from the dashboard action", () => {
    expect(dashboardRouteSource).toContain("createWhatsappCatalogImportReview");
    expect(dashboardRouteSource).toContain('action === "import_whatsapp_catalog"');
    expect(dashboardRouteSource).not.toContain("await importWhatsappCatalog({");
    expect(whatsappSyncSource).toContain("createSalesCatalogImportReviewJob");
    expect(whatsappSyncSource).toContain('sourcePlatform: "whatsapp_catalog"');
    expect(whatsappSyncSource).toContain("mapWhatsappProductToImportDraft");
    expect(whatsappSyncSource).toContain("category: null");
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
  });

  it("keeps WhatsApp source metadata when reviewed products become catalog items", () => {
    expect(importerSource).toContain("buildPublishedImportSourceMetadata");
    expect(importerSource).toContain('source: "whatsapp_catalog"');
    expect(importerSource).toContain('highlight_label: importedFromWhatsapp ? "Importado do WhatsApp" : "Importado por IA"');
    expect(importerSource).toContain("whatsapp_catalog_payload");
    expect(importerSource).toContain("whatsapp_catalog_imported_at");
  });
});
