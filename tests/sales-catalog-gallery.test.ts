import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/r2", () => ({ loadR2Config: vi.fn(), putR2Object: vi.fn() }));
vi.mock("@/lib/storage/quotas", () => ({
  assertStorageUploadAllowed: vi.fn(), recordOrganizationStorageUsage: vi.fn(), releaseOrganizationStorageUsage: vi.fn(),
  StorageQuotaError: class extends Error {},
}));
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { assertStorageUploadAllowed, recordOrganizationStorageUsage, StorageQuotaError } from "@/lib/storage/quotas";
import { buildImportedMedia, createSalesCatalogImportReviewJob, getSalesCatalogImportJob, normalizeImportImageUrls, publishSalesCatalogImportJob, updateSalesCatalogImportItems } from "@/lib/sales-catalog/importer";
import { buildWhatsappCatalogImportDrafts } from "@/lib/sales-catalog/whatsapp-sync";

const companyId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const urls = ["https://photos.example/front.jpg", "https://photos.example/room.jpg", "https://photos.example/garden.jpg"];
const now = "2026-09-11T21:00:00Z";
type Row = Record<string, unknown>;

// In-memory boundary exercises the actual review, patch, reload and publication paths.
function database() {
  const tables: Record<string, Row[]> = { intelligence_memory: [{ id: randomUUID(), organization_id: companyId, scope: "organization", memory_type: "sales_catalog_settings", metadata: { categories: ["Casas"] } }] };
  const client = { from(table: string) {
    tables[table] ??= [];
    const filters: Array<(row: Row) => boolean> = [];
    let mutation: "insert" | "update" | "delete" | null = null;
    let payload: Row | Row[] = {};
    const execute = () => {
      let rows = tables[table].filter(row => filters.every(filter => filter(row)));
      if (mutation === "insert") {
        rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: randomUUID(), ...row }));
        tables[table].push(...rows);
      }
      if (mutation === "update") rows.forEach(row => Object.assign(row, payload));
      if (mutation === "delete") tables[table] = tables[table].filter(row => !rows.includes(row));
      return { data: rows, error: null };
    };
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      insert: (value: Row | Row[]) => { mutation = "insert"; payload = value; return query; },
      update: (value: Row) => { mutation = "update"; payload = value; return query; },
      delete: () => { mutation = "delete"; return query; },
      single: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
      maybeSingle: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
      then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, tables };
}

async function review(db: ReturnType<typeof database>) {
  const { drafts } = buildWhatsappCatalogImportDrafts({
    catalogJid: "5511999999999@s.whatsapp.net", whatsappInstanceId: userId, agentId: null, now,
    products: [{ id: "house", name: "Casa", description: "Casa com jardim", price: "850000000", currency: "BRL",
      media: { images: [...urls, urls[0]].map(original_image_url => ({ original_image_url })) } }],
  });
  return createSalesCatalogImportReviewJob({ client: db.client, companyId, userId, sourceKind: "mixed", sourcePlatform: "whatsapp_catalog", targetMode: "review", defaultSalesDestination: "connectyhub_checkout", drafts });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertStorageUploadAllowed).mockResolvedValue(undefined as never);
  vi.mocked(recordOrganizationStorageUsage).mockResolvedValue(undefined as never);
  vi.mocked(loadR2Config).mockResolvedValue({ ok: true, config: { endpoint: "https://r2.example", accessKeyId: "test", secretAccessKey: "test", bucket: "media", publicUrl: "https://media.example" } });
  vi.mocked(putR2Object).mockImplementation(async (_config, key, body) => ({ ok: true, objectKey: key, publicUrl: `https://media.example/${key}`, bytesSize: body.byteLength }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("WhatsApp gallery import", () => {
  it("preserves the gallery and chosen cover from provider through review to R2-backed product", async () => {
    const db = database();
    const job = await review(db);
    expect(job.items[0].imageUrls).toEqual(urls);
    expect(putR2Object).not.toHaveBeenCalled();
    const chosen = [urls[2], urls[0], urls[1]];
    await updateSalesCatalogImportItems({ client: db.client, companyId, jobId: job.id, patches: [{ id: job.items[0].id, category: "Casas", imageUrl: chosen[0], imageUrls: chosen }] });
    const saved = await getSalesCatalogImportJob({ client: db.client, companyId, jobId: job.id });
    expect(saved.items[0]).toMatchObject({ imageUrl: chosen[0], imageUrls: chosen });
    const published = await publishSalesCatalogImportJob({ client: db.client, companyId, userId, jobId: job.id });
    expect(published.items[0]).toMatchObject({ status: "published", imageImportStatus: "imported", imageUrls: chosen });
    const product = db.tables.intelligence_memory.find(row => row.memory_type === "sales_catalog_item");
    const metadata = product?.metadata as Row;
    const media = metadata.media as Row[];
    expect(media).toHaveLength(3);
    expect(media.map(row => row.file_name)).toEqual(["garden.jpg", "front.jpg", "room.jpg"]);
    expect(media.every(row => String(row.storage_url).startsWith("https://media.example/sales-catalog/" + companyId))).toBe(true);
    expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual(chosen);
    expect(assertStorageUploadAllowed).toHaveBeenCalledTimes(3);
    expect(recordOrganizationStorageUsage).toHaveBeenCalledTimes(3);
    for (const [call] of vi.mocked(recordOrganizationStorageUsage).mock.calls) {
      expect(call).toMatchObject({ organizationId: companyId, category: "product_media", bytes: 3, fileCount: 1 });
    }
    // Repeating publication cannot upload or account for the same published draft again.
    await expect(publishSalesCatalogImportJob({ client: db.client, companyId, userId, jobId: job.id })).rejects.toThrow("Nenhum item");
    expect(putR2Object).toHaveBeenCalledTimes(3);
  });

  it("keeps cumulative results when products are published in separate requests", async () => {
    const db = database(); const job = await review(db);
    const original = db.tables.sales_catalog_import_items[0];
    const secondId = randomUUID();
    db.tables.sales_catalog_import_items.push({ ...original, id: secondId, title: "Outra casa", source_evidence: { source_platform: "whatsapp_catalog", whatsapp_catalog_id: "house-2" } });
    await updateSalesCatalogImportItems({ client: db.client, companyId, jobId: job.id, patches: [{ id: job.items[0].id, category: "Casas" }, { id: secondId, category: "Casas" }] });
    const first = await publishSalesCatalogImportJob({ client: db.client, companyId, userId, jobId: job.id, itemIds: [job.items[0].id] });
    expect(first.status).toBe("review_required");
    expect(first.stats.published_catalog_items).toBe(1);
    const last = await publishSalesCatalogImportJob({ client: db.client, companyId, userId, jobId: job.id, itemIds: [secondId] });
    expect(last.status).toBe("published");
    expect(last.stats.published_catalog_items).toBe(2);
    expect(putR2Object).toHaveBeenCalledTimes(6);
  });

  it("exposes partial gallery failure in the job, not a silent success", async () => {
    const db = database(); const job = await review(db);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404 }));
    const result = await publishSalesCatalogImportJob({ client: db.client, companyId, userId, jobId: job.id, patches: [{ id: job.items[0].id, category: "Casas" }] });
    expect(result.errorMessage).toContain("1 produto(s) com fotos nao importadas");
    expect(result.items[0].imageImportError).toContain("2 de 3");
    expect(result.stats.image_import_failures).toBe(1);
  });

  it("keeps gallery choices scoped to the importing company", async () => {
    const db = database(); const job = await review(db);
    await updateSalesCatalogImportItems({ client: db.client, companyId: "33333333-3333-4333-8333-333333333333", jobId: job.id, patches: [{ id: job.items[0].id, imageUrl: urls[2], imageUrls: [urls[2]] }] });
    const result = await getSalesCatalogImportJob({ client: db.client, companyId, jobId: job.id });
    expect(result.items[0].imageUrls).toEqual(urls);
  });

  it("reports a failed photo and keeps the successfully stored images in order", async () => {
    const db = database(); const job = await review(db);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 503 }));
    const result = await buildImportedMedia({ client: db.client, companyId, itemId: "product", item: job.items[0], now });
    expect(result.media.map(media => media.fileName)).toEqual(["room.jpg", "garden.jpg"]);
    expect(result.imageImportStatus).toBe("failed");
    expect(result.imageImportError).toContain("2 de 3");
    expect(result.imageImportError).toContain("Foto 1");
    expect(recordOrganizationStorageUsage).toHaveBeenCalledTimes(2);
  });

  it("stops on the organization's quota and does not store or count blocked files", async () => {
    const db = database(); const job = await review(db);
    vi.mocked(assertStorageUploadAllowed).mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new StorageQuotaError("Sem espaco"));
    const result = await buildImportedMedia({ client: db.client, companyId, itemId: "product", item: job.items[0], now });
    expect(result.media).toHaveLength(1);
    expect(result.imageImportError).toContain("1 de 3");
    expect(putR2Object).toHaveBeenCalledTimes(1);
    expect(recordOrganizationStorageUsage).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("respects disabled imports and external destinations", async () => {
    const db = database(); const job = await review(db);
    for (const item of [{ ...job.items[0], importExternalImage: false }, { ...job.items[0], salesDestination: "external_site" as const }]) {
      expect((await buildImportedMedia({ client: db.client, companyId, itemId: "product", item, now })).imageImportStatus).toBe("skipped");
    }
    expect(fetch).not.toHaveBeenCalled(); expect(putR2Object).not.toHaveBeenCalled();
  });

  it("keeps legacy single-image imports and removes duplicates or invalid URLs", () => {
    expect(normalizeImportImageUrls(urls[0])).toEqual([urls[0]]);
    expect(normalizeImportImageUrls(urls[0], [urls[0], "javascript:alert(1)", urls[1], urls[1]])).toEqual(urls.slice(0, 2));
    expect(normalizeImportImageUrls(null, urls)).toEqual([]);
  });
});
