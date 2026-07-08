import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  createPlatformProductCode,
  createPlatformProductSlug,
  mapPlatformProductRow,
  PLATFORM_PRODUCT_SELECT,
  type PlatformProductCommissionBase,
  type PlatformProductMarketplaceStatus,
  type PlatformProductRow,
  type PlatformProductStatus,
} from "@/lib/platform-products";
import {
  createSalesCatalogTag,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  resolveSalesCatalogMediaKind,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogItemAttribute,
  type SalesCatalogMedia,
  type SalesCatalogProductFulfillment,
  type SalesCatalogProductInventory,
  type SalesCatalogProductOffer,
  type SalesCatalogProductShipping,
  type SalesCatalogShippingProfile,
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
  type SalesCatalogStockStatus,
} from "@/lib/sales-catalog/shared";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxProductFiles = 12;
const maxProductFileBytes = 25 * 1024 * 1024;
const maxProductTotalBytes = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  return savePlatformProduct(request, "create");
}

export async function PATCH(request: NextRequest) {
  return savePlatformProduct(request, "update");
}

async function savePlatformProduct(request: NextRequest, mode: "create" | "update") {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Envie os dados do produto em multipart/form-data." }, { status: 400 });
  }

  const service = createServiceClient();
  const requestedProductId = normalizeUuid(readFormString(formData.get("productId")));
  const productId = requestedProductId ?? randomUUID();
  const title = normalizeTitle(readFormString(formData.get("name")));
  const description = normalizeDescription(readFormString(formData.get("commercialDescription")));
  const files = formData.getAll("files").filter(isFormFile);
  const filesError = validateFiles(files);

  if (mode === "update" && !requestedProductId) {
    return NextResponse.json({ error: "Informe o produto para edicao." }, { status: 422 });
  }

  if (!title) {
    return NextResponse.json({ error: "Informe o nome do produto ConnectyHub." }, { status: 422 });
  }

  if (!description) {
    return NextResponse.json({ error: "Informe a descricao comercial do produto." }, { status: 422 });
  }

  if (filesError) {
    return NextResponse.json({ error: filesError }, { status: 422 });
  }

  try {
    let existingProduct: ReturnType<typeof mapPlatformProductRow> | null = null;

    if (requestedProductId) {
      const { data, error } = await service
        .from("platform_products")
        .select(PLATFORM_PRODUCT_SELECT)
        .eq("id", requestedProductId)
        .maybeSingle<PlatformProductRow>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: "Produto ConnectyHub nao encontrado." }, { status: 404 });
      }

      existingProduct = mapPlatformProductRow(data);
    }

    const keepMediaIds = readKeepMediaIds(formData.get("keepMediaIds"));
    let media = existingProduct?.media ?? [];

    if (existingProduct && keepMediaIds) {
      media = media.filter((item) => keepMediaIds.has(item.id));
    }

    const existingMediaBytes = media.reduce((total, item) => total + item.size, 0);
    const uploadedBytes = files.reduce((total, file) => total + file.size, 0);

    if (media.length + files.length > maxProductFiles) {
      return NextResponse.json({ error: `O produto pode ter no maximo ${maxProductFiles} arquivos.` }, { status: 422 });
    }

    if (existingMediaBytes + uploadedBytes > maxProductTotalBytes) {
      return NextResponse.json({ error: "O total de arquivos do produto precisa ter ate 100 MB." }, { status: 422 });
    }

    const configResult = files.length > 0 ? await loadR2Config(service) : null;

    if (configResult && !configResult.ok) {
      return NextResponse.json({ error: configResult.error }, { status: 503 });
    }

    const now = new Date().toISOString();

    if (configResult?.ok) {
      for (const file of files) {
        const contentType = normalizeContentType(file);
        const fileName = sanitizeFileName(file.name || "arquivo");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const objectKey = `platform-products/${productId}/${Date.now()}-${randomUUID()}-${fileName}`;
        const upload = await putR2Object(configResult.config, objectKey, bytes, contentType);

        if (!upload.ok) {
          return NextResponse.json({ error: upload.error }, { status: 502 });
        }

        media.push({
          id: randomUUID(),
          fileName,
          contentType,
          size: file.size,
          storageUrl: upload.publicUrl,
          kind: resolveSalesCatalogMediaKind(contentType, fileName),
          createdAt: now,
        });
      }
    }

    const productCode = normalizeProductCode(readFormString(formData.get("productCode"))) ?? createPlatformProductCode(title, productId);
    const slug = normalizeSlug(readFormString(formData.get("slug"))) ?? createPlatformProductSlug(title, productId);
    const agentTag = normalizeAgentTag(readFormString(formData.get("agentTag"))) ?? createSalesCatalogTag(`connectyhub ${title}`, productId);
    const payload = {
      id: productId,
      product_code: productCode,
      slug,
      name: title,
      short_description: normalizeOptionalText(readFormString(formData.get("shortDescription")), 220),
      commercial_description: description,
      category: normalizeOptionalText(readFormString(formData.get("category")), 80),
      status: normalizeProductStatus(readFormString(formData.get("status"))),
      marketplace_status: normalizeMarketplaceStatus(readFormString(formData.get("marketplaceStatus"))),
      price: normalizeOptionalText(readFormString(formData.get("price")), 60),
      currency: normalizeOptionalText(readFormString(formData.get("currency")), 12) ?? "BRL",
      attributes: serializeItemAttributes(readItemAttributesPayload(formData.get("attributes"))),
      inventory: serializeProductInventory(readProductInventoryPayload(formData)),
      offer: serializeProductOffer(readProductOfferPayload(formData)),
      fulfillment: serializeProductFulfillment(readProductFulfillmentPayload(formData)),
      shipping: serializeProductShipping(readProductShippingPayload(formData)),
      skus: serializeSalesCatalogSkus(readProductSkusPayload(formData.get("skus"))),
      media: serializeSalesCatalogMedia(media),
      agent_tag: agentTag,
      agent_prompt: normalizeOptionalText(readFormString(formData.get("agentPrompt")), 1200),
      sales_notes: normalizeOptionalText(readFormString(formData.get("salesNotes")), 1200),
      commission_percentage: normalizeMoneyNumber(formData.get("commissionPercentage"), 0, 100),
      commission_base: normalizeCommissionBase(readFormString(formData.get("commissionBase"))),
      commission_release_days: normalizeInteger(formData.get("commissionReleaseDays"), 0, 365, 15),
      recurring_commission_months: normalizeInteger(formData.get("recurringCommissionMonths"), 0, 120, 0),
      refund_window_days: normalizeInteger(formData.get("refundWindowDays"), 0, 365, 7),
      created_by: existingProduct?.createdBy ?? auth.userId,
      metadata: {
        source: "admin_os",
        mirrored_from: "sales_catalog_product_contract",
        updated_by: auth.userId,
      },
    };
    const query = existingProduct
      ? service.from("platform_products").update(payload).eq("id", existingProduct.id)
      : service.from("platform_products").insert({ ...payload, created_at: now, updated_at: now });
    const { data, error } = await query
      .select(PLATFORM_PRODUCT_SELECT)
      .single<PlatformProductRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel salvar o produto ConnectyHub." }, { status: 500 });
    }

    await service.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: existingProduct ? "platform_product.updated" : "platform_product.created",
      target_table: "platform_products",
      target_id: data.id,
      metadata: {
        productCode: data.product_code,
        status: data.status,
        marketplaceStatus: data.marketplace_status,
        commissionPercentage: data.commission_percentage,
      },
    });

    revalidatePath("/admin/produtos-connectyhub");
    revalidatePath("/dashboard/produtos");

    return NextResponse.json({ product: mapPlatformProductRow(data) }, { status: existingProduct ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar produto ConnectyHub." }, { status: 500 });
  }
}

function readProductShippingPayload(formData: FormData): SalesCatalogProductShipping {
  return {
    weightGrams: normalizeNullableInteger(formData.get("weightGrams"), 1, 500000),
    dimensions: {
      lengthCm: normalizeNullableDecimal(formData.get("lengthCm"), 1, 1000),
      widthCm: normalizeNullableDecimal(formData.get("widthCm"), 1, 1000),
      heightCm: normalizeNullableDecimal(formData.get("heightCm"), 1, 1000),
    },
    profile: normalizeShippingProfile(readFormString(formData.get("shippingProfile"))),
    notes: normalizeOptionalText(readFormString(formData.get("shippingNotes")), 240),
  };
}

function readProductInventoryPayload(formData: FormData): SalesCatalogProductInventory {
  const fallback = emptySalesCatalogProductInventory();

  return {
    status: normalizeStockStatus(readFormString(formData.get("inventoryStatus"))),
    quantity: normalizeNullableInteger(formData.get("stockQuantity"), 0, 1000000),
    lowStockThreshold: normalizeNullableInteger(formData.get("lowStockThreshold"), 0, 1000000),
    allowBackorder: readFormBoolean(formData.get("allowBackorder")) ?? fallback.allowBackorder,
    notes: normalizeOptionalText(readFormString(formData.get("inventoryNotes")), 240),
  };
}

function readProductOfferPayload(formData: FormData): SalesCatalogProductOffer {
  const fallback = emptySalesCatalogProductOffer();

  return {
    salePrice: normalizeOptionalText(readFormString(formData.get("salePrice")), 60) ?? fallback.salePrice,
    saleStartsAt: normalizeDateString(readFormString(formData.get("saleStartsAt"))) ?? fallback.saleStartsAt,
    saleEndsAt: normalizeDateString(readFormString(formData.get("saleEndsAt"))) ?? fallback.saleEndsAt,
    couponCode: normalizeCouponCode(readFormString(formData.get("couponCode"))) ?? fallback.couponCode,
    couponDescription: normalizeOptionalText(readFormString(formData.get("couponDescription")), 160) ?? fallback.couponDescription,
    callToAction: normalizeOptionalText(readFormString(formData.get("callToAction")), 180) ?? fallback.callToAction,
    notes: normalizeOptionalText(readFormString(formData.get("offerNotes")), 240) ?? fallback.notes,
  };
}

function readProductFulfillmentPayload(formData: FormData): SalesCatalogProductFulfillment {
  const fallback = emptySalesCatalogProductFulfillment();

  return {
    mode: normalizeFulfillmentMode(readFormString(formData.get("fulfillmentMode"))),
    schedulingRequired: readFormBoolean(formData.get("schedulingRequired")) ?? fallback.schedulingRequired,
    serviceDuration: normalizeOptionalText(readFormString(formData.get("serviceDuration")), 80) ?? fallback.serviceDuration,
    deliveryInstructions: normalizeOptionalText(readFormString(formData.get("deliveryInstructions")), 240) ?? fallback.deliveryInstructions,
    accessInstructions: normalizeOptionalText(readFormString(formData.get("accessInstructions")), 240) ?? fallback.accessInstructions,
  };
}

function readProductSkusPayload(value: unknown): SalesCatalogSku[] {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): SalesCatalogSku | null => {
      const record = readRecord(item);
      if (!record) return null;
      const skuCode = normalizeSkuCode(readFormString(record.skuCode ?? record.sku_code));
      if (!skuCode) return null;
      const dimensions = readRecord(record.dimensions) ?? {};

      return {
        id: null,
        companyId: "",
        catalogItemId: null,
        skuCode,
        title: normalizeOptionalText(readFormString(record.title), 120),
        attributes: readItemAttributesPayload(record.attributes),
        price: normalizeOptionalText(readFormString(record.price), 60),
        salePrice: normalizeOptionalText(readFormString(record.salePrice ?? record.sale_price), 60),
        currency: normalizeOptionalText(readFormString(record.currency), 12) ?? "BRL",
        stockStatus: normalizeStockStatus(readFormString(record.stockStatus ?? record.stock_status)),
        stockQuantity: normalizeNullableInteger(record.stockQuantity ?? record.stock_quantity, 0, 1000000),
        lowStockThreshold: normalizeNullableInteger(record.lowStockThreshold ?? record.low_stock_threshold, 0, 1000000),
        weightGrams: normalizeNullableInteger(record.weightGrams ?? record.weight_grams, 1, 500000),
        dimensions: {
          lengthCm: normalizeNullableDecimal(dimensions.lengthCm ?? dimensions.length_cm, 1, 1000),
          widthCm: normalizeNullableDecimal(dimensions.widthCm ?? dimensions.width_cm, 1, 1000),
          heightCm: normalizeNullableDecimal(dimensions.heightCm ?? dimensions.height_cm, 1, 1000),
        },
        mediaIds: normalizeStringList(record.mediaIds ?? record.media_ids, [], 12, 80),
        status: normalizeSkuStatus(readFormString(record.status)),
        createdAt: null,
        updatedAt: null,
      };
    })
    .filter((item): item is SalesCatalogSku => Boolean(item))
    .slice(0, 80);
}

function readItemAttributesPayload(value: unknown): SalesCatalogItemAttribute[] {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): SalesCatalogItemAttribute | null => {
      const record = readRecord(item);
      const id = normalizeSlug(readFormString(record?.id)) ?? "";
      const name = normalizeOptionalText(readFormString(record?.name), 80);
      const values = normalizeStringList(record?.values, [], 50, 80);

      if (!id || !name || values.length === 0) return null;
      return { id, name, values };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item))
    .slice(0, 20);
}

function serializeItemAttributes(attributes: SalesCatalogItemAttribute[]) {
  return attributes.map((attribute) => ({ id: attribute.id, name: attribute.name, values: attribute.values }));
}

function serializeSalesCatalogMedia(media: SalesCatalogMedia[]) {
  return media.map((item) => ({
    id: item.id,
    file_name: item.fileName,
    content_type: item.contentType,
    size: item.size,
    storage_url: item.storageUrl,
    kind: item.kind,
    created_at: item.createdAt,
  }));
}

function serializeSalesCatalogSkus(skus: SalesCatalogSku[]) {
  return skus.map((sku) => ({
    id: sku.id,
    sku_code: sku.skuCode,
    title: sku.title,
    attributes: serializeItemAttributes(sku.attributes),
    price: sku.price,
    sale_price: sku.salePrice,
    currency: sku.currency,
    stock_status: sku.stockStatus,
    stock_quantity: sku.stockQuantity,
    low_stock_threshold: sku.lowStockThreshold,
    weight_grams: sku.weightGrams,
    dimensions: {
      length_cm: sku.dimensions.lengthCm,
      width_cm: sku.dimensions.widthCm,
      height_cm: sku.dimensions.heightCm,
    },
    media_ids: sku.mediaIds,
    status: sku.status,
  }));
}

function serializeProductShipping(shipping: SalesCatalogProductShipping) {
  return {
    weight_grams: shipping.weightGrams,
    dimensions: {
      length_cm: shipping.dimensions.lengthCm,
      width_cm: shipping.dimensions.widthCm,
      height_cm: shipping.dimensions.heightCm,
    },
    profile: shipping.profile,
    notes: shipping.notes,
  };
}

function serializeProductInventory(inventory: SalesCatalogProductInventory) {
  return {
    status: inventory.status,
    quantity: inventory.quantity,
    low_stock_threshold: inventory.lowStockThreshold,
    allow_backorder: inventory.allowBackorder,
    notes: inventory.notes,
  };
}

function serializeProductOffer(offer: SalesCatalogProductOffer) {
  return {
    sale_price: offer.salePrice,
    sale_starts_at: offer.saleStartsAt,
    sale_ends_at: offer.saleEndsAt,
    coupon_code: offer.couponCode,
    coupon_description: offer.couponDescription,
    call_to_action: offer.callToAction,
    notes: offer.notes,
  };
}

function serializeProductFulfillment(fulfillment: SalesCatalogProductFulfillment) {
  return {
    mode: fulfillment.mode,
    scheduling_required: fulfillment.schedulingRequired,
    service_duration: fulfillment.serviceDuration,
    delivery_instructions: fulfillment.deliveryInstructions,
    access_instructions: fulfillment.accessInstructions,
  };
}

function normalizeProductStatus(value: string | null): PlatformProductStatus {
  if (!value) return "active";
  if (value === "active" || value === "paused" || value === "archived") return value;
  return "draft";
}

function normalizeMarketplaceStatus(value: string | null): PlatformProductMarketplaceStatus {
  if (!value) return "visible";
  if (value === "visible" || value === "featured") return value;
  return "hidden";
}

function normalizeCommissionBase(value: string | null): PlatformProductCommissionBase {
  return value === "net" ? "net" : "gross";
}

function normalizeStockStatus(value: string | null): SalesCatalogStockStatus {
  if (value === "out_of_stock" || value === "on_backorder") return value;
  return "in_stock";
}

function normalizeSkuStatus(value: string | null): SalesCatalogSkuStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeShippingProfile(value: string | null): SalesCatalogShippingProfile {
  if (value === "free" || value === "custom") return value;
  return "default";
}

function normalizeFulfillmentMode(value: string | null): SalesCatalogFulfillmentMode {
  if (value === "digital" || value === "service" || value === "subscription") return value;
  return "physical";
}

function validateFiles(files: File[]) {
  if (files.length > maxProductFiles) return `Envie no maximo ${maxProductFiles} arquivos.`;
  for (const file of files) {
    if (file.size > maxProductFileBytes) return `O arquivo ${file.name} precisa ter ate 25 MB.`;
  }
  return null;
}

function normalizeContentType(file: File) {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "arquivo";
}

function normalizeTitle(value: string | null) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "";
}

function normalizeDescription(value: string | null) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 2200) ?? "";
}

function normalizeOptionalText(value: string | null, maxLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeDateString(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeCouponCode(value: string | null) {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "")
    .slice(0, 32) ?? "";
  return normalized || null;
}

function normalizeProductCode(value: string | null) {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) ?? "";
  return /^[A-Z0-9_-]{2,64}$/.test(normalized) ? normalized : null;
}

function normalizeSlug(value: string | null) {
  const normalized = value
    ?.trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) ?? "";
  return normalized || null;
}

function normalizeAgentTag(value: string | null) {
  const normalized = value?.trim().slice(0, 120) ?? "";
  return normalized.startsWith("{{") && normalized.endsWith("}}") ? normalized : null;
}

function normalizeSkuCode(value: string | null) {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64) ?? "";
  return normalized || null;
}

function normalizeMoneyNumber(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number"
    ? value
    : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Math.trunc(normalizeMoneyNumber(value, fallback, max));
  return Math.min(max, Math.max(min, parsed));
}

function normalizeNullableInteger(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeInteger(value, min, max, min);
}

function normalizeNullableDecimal(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = normalizeMoneyNumber(value, min, max);
  return Math.min(max, Math.max(min, parsed));
}

function normalizeStringList(value: unknown, fallback: string[], maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function readKeepMediaIds(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? parseJson(value) : null;
  if (!Array.isArray(parsed)) return null;
  return new Set(parsed.filter((item): item is string => typeof item === "string"));
}

function readFormString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readFormBoolean(value: unknown) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isFormFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "size" in value;
}

function normalizeUuid(value: string | null) {
  const normalized = value?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}
