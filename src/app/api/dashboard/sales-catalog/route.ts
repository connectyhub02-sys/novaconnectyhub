import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError, getOrganizationBillingAccess } from "@/lib/billing/trial";
import {
  getOrganizationSalesCatalogSettings,
  mapSalesCatalogItem,
  mapSalesCatalogOrder,
  mapSalesCatalogPaymentIntegration,
  mapSalesCatalogSettings,
  mapSalesCatalogShippingSettings,
  type SalesCatalogOrderItemRow,
  type SalesCatalogOrderRow,
  type SalesCatalogPaymentIntegrationRow,
  type SalesCatalogSkuRow,
} from "@/lib/client-os/sales-catalog";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import {
  brazilianStates,
  buildSalesCatalogContent,
  createDefaultSalesCatalogCommerceSettings,
  createDefaultSalesCatalogOrderBumps,
  createSalesCatalogTag,
  defaultSalesCatalogShippingRules,
  createDefaultSalesCatalogShippingServices,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  getSalesCatalogReadiness,
  normalizeSalesCatalogStorefrontFontPreset,
  resolveSalesCatalogMediaKind,
  salesCatalogLeadDataFields,
  salesCatalogPaymentMethodTemplates,
  salesCatalogPagBankPaymentMethodOptions,
  salesCatalogBusinessTemplates,
  type SalesCatalogAttribute,
  type SalesCatalogBillingCycle,
  type SalesCatalogBillingInterval,
  type SalesCatalogBusinessType,
  type SalesCatalogItemStatus,
  type SalesCatalogItemAttribute,
  type SalesCatalogLeadDataField,
  type SalesCatalogMedia,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogFulfillmentStatus,
  type SalesCatalogPaymentMethod,
  type SalesCatalogPaymentMethodId,
  type SalesCatalogPagBankPaymentMethod,
  type SalesCatalogPagBankSettings,
  type SalesCatalogPaymentStatus,
  type SalesCatalogAutomationSettings,
  type SalesCatalogCommerceAgentMode,
  type SalesCatalogCommerceAgentSettings,
  type SalesCatalogCommerceAgentSurface,
  type SalesCatalogCommerceAgentVerticalPlaybook,
  type SalesCatalogGeoPoint,
  type SalesCatalogLocalDeliveryZone,
  type SalesCatalogLocalDeliveryZoneShape,
  type SalesCatalogProductFulfillment,
  type SalesCatalogProductInventory,
  type SalesCatalogProductOffer,
  type SalesCatalogProductPageContent,
  type SalesCatalogProductShipping,
  type SalesCatalogOrderStatus,
  type SalesCatalogReservationPolicy,
  type SalesCatalogSalesDestination,
  type SalesCatalogShippingProvider,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
  type SalesCatalogStockStatus,
  type SalesCatalogStorefrontSettings,
  type SalesCatalogWhatsAppMessageTemplates,
  type SalesCatalogOrderBumpSettings,
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
} from "@/lib/sales-catalog/shared";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
import {
  buildMercadoPagoAuthorizationUrl,
  buildMercadoPagoWebhookUrl,
  isMercadoPagoTestTokenEnabled,
} from "@/lib/sales-catalog/mercado-pago";
import { normalizeSalesCatalogCategoryIconMap } from "@/lib/sales-catalog/category-icons";
import { createSalesCatalogPixPaymentSession } from "@/lib/sales-catalog/payment-sessions";
import { buildSalesCatalogProductUrl } from "@/lib/sales-catalog/public-urls";
import { calculateSalesCatalogShippingQuotes, normalizeSalesCatalogCep } from "@/lib/sales-catalog/shipping-calculator";
import { salesCatalogImportProcessRequestedEventName } from "@/lib/sales-catalog/importer";
import {
  exportWhatsappCatalogProducts,
  queueWhatsappCatalogImportReview,
  setWhatsappCatalogVisibility,
  whatsappCatalogImportProcessRequestedEventName,
} from "@/lib/sales-catalog/whatsapp-sync";
import {
  cleanupSalesCatalogMediaStorage,
  filterCleanedSalesCatalogMedia,
  type SalesCatalogMediaCleanupResult,
} from "@/lib/sales-catalog/media-storage-cleanup";
import { inngest } from "@/lib/inngest/client";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import {
  assertStorageUploadAllowed,
  isStorageQuotaError,
  recordOrganizationStorageUsage,
} from "@/lib/storage/quotas";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { appendLeadTrackingParams, buildTrackedLinkUrl, createTrackedLinkSlug, createTrackedLinkTag, normalizeHttpUrl } from "@/lib/tracking/tracked-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxCatalogFiles = 8;
const maxCatalogFileBytes = 250 * 1024 * 1024;
const maxCatalogTotalBytes = 500 * 1024 * 1024;
const maxCartCheckoutItemUnitPriceCents = 10_000_000_000;
const maxDescriptionLength = 1800;
const maxProductPageTextLength = 1800;
const maxProductPageQuickDetails = 8;

type JsonRecord = Record<string, unknown>;

type SalesCatalogMemoryRow = {
  id: string;
  organization_id: string | null;
  title: string;
  content: string;
  metadata: JsonRecord | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProductTrackedLinkResult = {
  id: string;
  label: string;
  url: string;
  tag: string;
  trackingUrl: string;
};

type ProductTrackedLinkRow = {
  id: string;
  metadata: JsonRecord | null;
  created_at: string | null;
};

type CurrentWorkspace = NonNullable<Awaited<ReturnType<typeof getCurrentWorkspace>>>;

const salesCatalogOrderSelect = [
  "id",
  "organization_id",
  "lead_id",
  "conversation_id",
  "source",
  "status",
  "payment_status",
  "fulfillment_status",
  "customer_name",
  "customer_phone",
  "customer_document",
  "customer_email",
  "destination_cep",
  "destination_address",
  "subtotal",
  "discount_total",
  "shipping_total",
  "total",
  "payment_method",
  "shipping_method",
  "agent_notes",
  "internal_notes",
  "latest_payment_session_id",
  "commercial_flow_type",
  "revenue_owner_type",
  "contains_platform_products",
  "commission_eligible",
  "metadata",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

const salesCatalogOrderItemSelect = "id, order_id, organization_id, catalog_item_id, sku_id, sku_code, title, tag, quantity, unit_price, sale_price, total, attributes, fulfillment, product_origin_type, commercial_flow_type, revenue_owner_type, commission_eligible, platform_product_id, metadata, created_at";
const salesCatalogPaymentIntegrationSelect = "id, organization_id, provider, mode, status, account_label, provider_account_id, public_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, connected_at, last_error, webhook_secret_encrypted, webhook_url, metadata, created_at, updated_at";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    return handleJsonPost(request, workspace);
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Envie os dados do produto em multipart/form-data." }, { status: 400 });
  }

  const requestedCompanyId = readFormString(formData.get("companyId"));
  const requestedItemId = normalizeUuid(readFormString(formData.get("itemId")));
  const title = normalizeTitle(readFormString(formData.get("title")));
  const description = normalizeDescription(readFormString(formData.get("description")));
  const category = normalizeOptionalText(readFormString(formData.get("category")), 80);
  const price = normalizeOptionalText(readFormString(formData.get("price")), 60);
  const currency = normalizeOptionalText(readFormString(formData.get("currency")), 12) ?? "BRL";
  const status = normalizeStatus(readFormString(formData.get("status")));
  const salesDestination = normalizeSalesDestination(readFormString(formData.get("salesDestination")));
  const productUrlInput = normalizeOptionalText(readFormString(formData.get("productUrl")), 1000);
  const externalButtonLabel = normalizeButtonLabel(readFormString(formData.get("externalButtonLabel"))) ?? title;
  const attributes = readItemAttributesPayload(formData.get("attributes"));
  const inventory = readProductInventoryPayload(formData);
  const offer = readProductOfferPayload(formData);
  const fulfillment = readProductFulfillmentPayload(formData);
  const shipping = readProductShippingPayload(formData);
  const pageContent = readProductPageContentPayload(formData);
  const billingCycle = normalizeBillingCycle(readFormString(formData.get("billingCycle")));
  const billingInterval = billingCycle === "recurring"
    ? normalizeBillingInterval(readFormString(formData.get("billingInterval")))
    : "month";
  const skus = readProductSkusPayload(formData.get("skus"));
  const storeFeatured = readFormBoolean(formData.get("storeFeatured")) ?? false;
  const storeFeaturedRank = storeFeatured
    ? normalizeNullableInteger(formData.get("storeFeaturedRank"), 1, 999)
    : null;
  const files = formData.getAll("files").filter(isFormFile);
  const keepMediaIds = readKeepMediaIds(formData.get("keepMediaIds"));

  if (!title) {
    return NextResponse.json({ error: "Informe o nome do produto ou oferta." }, { status: 422 });
  }

  if (!description) {
    return NextResponse.json({ error: "Informe uma descricao comercial curta." }, { status: 422 });
  }

  let productUrl: string | null = productUrlInput;
  if (salesDestination === "external_site") {
    if (!productUrlInput) {
      return NextResponse.json({ error: "Informe o link do produto no site externo." }, { status: 422 });
    }

    try {
      productUrl = normalizeHttpUrl(productUrlInput);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Informe uma URL valida para o produto externo." }, { status: 422 });
    }
  } else {
    productUrl = null;
  }

  const filesError = validateFiles(files);
  if (filesError) {
    return NextResponse.json({ error: filesError }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Escolha uma empresa antes de cadastrar o produto.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });
    const itemId = requestedItemId ?? randomUUID();
    const now = new Date().toISOString();
    let existingRow: SalesCatalogMemoryRow | null = null;

    if (requestedItemId) {
      const { data: existingData, error: existingError } = await client
        .from("intelligence_memory")
        .select("id, organization_id, title, content, metadata, created_at, updated_at")
        .eq("id", requestedItemId)
        .eq("scope", "organization")
        .eq("organization_id", company.id)
        .eq("memory_type", "sales_catalog_item")
        .maybeSingle<SalesCatalogMemoryRow>();

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }

      if (!existingData) {
        return NextResponse.json({ error: "Produto nao encontrado para edicao." }, { status: 404 });
      }

      existingRow = existingData;
    }

    const existingMetadata = readRecord(existingRow?.metadata) ?? {};
    const previousMedia = readSalesCatalogMediaMetadata(existingMetadata.media);
    let media: SalesCatalogMedia[] = previousMedia;
    let removedMedia: SalesCatalogMedia[] = [];
    let removedMediaCleanup: SalesCatalogMediaCleanupResult | null = null;
    if (existingRow && keepMediaIds) {
      const keepMediaIdSet = new Set(keepMediaIds);
      media = keepMediaIds
        .map((id) => previousMedia.find((item) => item.id === id))
        .filter((item): item is SalesCatalogMedia => Boolean(item));
      removedMedia = previousMedia.filter((item) => !keepMediaIdSet.has(item.id));
    }
    const existingMediaBytes = media.reduce((total, item) => total + item.size, 0);
    const uploadedBytes = files.reduce((total, file) => total + file.size, 0);

    if (media.length + files.length > maxCatalogFiles) {
      return NextResponse.json({ error: `O produto pode ter no maximo ${maxCatalogFiles} arquivos.` }, { status: 422 });
    }

    if (existingMediaBytes + uploadedBytes > maxCatalogTotalBytes) {
      return NextResponse.json({ error: "O total de arquivos do produto precisa ter ate 500 MB." }, { status: 422 });
    }

    if (files.length > 0) {
      await assertStorageUploadAllowed({
        client,
        organizationId: company.id,
        category: "product_media",
        files: files.map((file) => ({
          fileName: file.name,
          contentType: normalizeContentType(file),
          sizeBytes: file.size,
        })),
      });
    }

    const configResult = files.length > 0 ? await loadR2Config(client) : null;

    if (configResult && !configResult.ok) {
      return NextResponse.json({ error: configResult.error }, { status: 503 });
    }

    if (configResult?.ok) {
      for (const file of files) {
        const contentType = normalizeContentType(file);
        const fileName = sanitizeFileName(file.name || "arquivo");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const objectKey = `sales-catalog/${company.id}/${itemId}/${Date.now()}-${randomUUID()}-${fileName}`;
        const upload = await putR2Object(configResult.config, objectKey, bytes, contentType);

        if (!upload.ok) {
          return NextResponse.json({ error: upload.error }, { status: 502 });
        }

        await recordOrganizationStorageUsage({
          client,
          organizationId: company.id,
          category: "product_media",
          bytes: upload.bytesSize,
          fileCount: 1,
          metadata: {
            source: "sales_catalog_product_upload",
            product_id: itemId,
            object_key: upload.objectKey,
            content_type: contentType,
          },
        });

        media.push({
          id: randomUUID(),
          fileName,
          contentType,
          size: file.size,
          storageUrl: upload.publicUrl,
          objectKey: upload.objectKey,
          kind: resolveSalesCatalogMediaKind(contentType, fileName),
          createdAt: now,
        });
      }
    }

    const tag = readFormString(existingMetadata.tag) ?? createSalesCatalogTag(title, itemId);
    const existingLinkButtonId = readFormString(existingMetadata.link_button_id) ?? readFormString(existingMetadata.external_link_button_id);
    const productPageUrl = salesDestination === "connectyhub_checkout"
      ? buildSalesCatalogProductUrl(itemId)
      : null;
    const trackedLink = salesDestination === "external_site" && productUrl
      ? await upsertProductTrackedLinkButton({
          client,
          companyId: company.id,
          userId: workspace.user.id,
          itemId,
          title,
          description,
          category,
          price,
          currency,
          productUrl,
          label: externalButtonLabel,
          existingLinkButtonId,
        })
      : null;
    if (salesDestination !== "external_site" && existingLinkButtonId) {
      await deleteProductTrackedLinkButton({
        client,
        companyId: company.id,
        userId: workspace.user.id,
        linkButtonId: existingLinkButtonId,
        productTitle: title,
      });
    }
    const content = buildSalesCatalogContent({
      title,
      description,
      category,
      price,
      currency,
      media,
      attributes,
      inventory,
      offer,
      fulfillment,
      shipping,
      pageContent,
      billingCycle,
      billingInterval,
      salesDestination,
      productUrl,
      externalLinkButtonTag: trackedLink?.tag ?? null,
    });
    const metadataSource = readFormString(existingMetadata.source) ?? "manual";
    const highlightLabel = normalizeHighlightLabel(readFormString(formData.get("highlightLabel")));
    const memoryTags = [
      "sales_catalog_item",
      "sales_catalog",
      ...(metadataSource === "whatsapp_catalog" ? ["whatsapp_catalog"] : []),
      ...(salesDestination === "external_site" ? ["external_site_product"] : []),
      "whatsapp_agent",
      "lead_tracking",
    ];
    const metadata = {
      ...existingMetadata,
      title,
      description,
      category,
      price,
      currency,
      status,
      tag,
      highlight_label: highlightLabel,
      store_featured: storeFeatured,
      store_featured_rank: storeFeaturedRank,
      store_featured_at: storeFeatured
        ? readFormString(existingMetadata.store_featured_at) ?? readFormString(existingMetadata.storeFeaturedAt) ?? now
        : null,
      attributes: serializeItemAttributes(attributes),
      inventory: serializeProductInventory(inventory),
      offer: serializeProductOffer(offer),
      fulfillment: serializeProductFulfillment(fulfillment),
      shipping: serializeProductShipping(shipping),
      page_content: serializeProductPageContent(pageContent),
      billing_cycle: billingCycle,
      billing_interval: billingInterval,
      media: serializeSalesCatalogMedia(media),
      skus: serializeSalesCatalogSkus(skus),
      source: metadataSource,
      sales_destination: salesDestination,
      source_product_url: productUrl,
      product_page_url: productPageUrl,
      link_button_id: trackedLink?.id ?? null,
      link_button_label: trackedLink?.label ?? null,
      link_button_tag: trackedLink?.tag ?? null,
      link_button_tracking_url: trackedLink?.trackingUrl ?? null,
      readiness: getSalesCatalogReadiness({ description, media }),
      created_by: readFormString(existingMetadata.created_by) ?? workspace.user.id,
      updated_by: workspace.user.id,
      updated_from: existingRow ? "sales_catalog_edit" : "sales_catalog_create",
    };
    const payload = {
      scope: "organization",
      organization_id: company.id,
      memory_type: "sales_catalog_item",
      title,
      content,
      importance: 0.82,
      tags: memoryTags,
      metadata,
      updated_at: now,
    };
    const query = existingRow
      ? client.from("intelligence_memory").update(payload).eq("id", existingRow.id)
      : client.from("intelligence_memory").insert({ id: itemId, ...payload, created_at: now });
    const saveResult = await query
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .single<SalesCatalogMemoryRow>();
    let data = saveResult.data;
    const error = saveResult.error;

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel salvar o produto." }, { status: 500 });
    }

    if (removedMedia.length > 0) {
      removedMediaCleanup = await cleanupSalesCatalogMediaStorage({
        client,
        organizationId: company.id,
        productId: data.id,
        userId: workspace.user.id,
        media: removedMedia,
        reason: "product_media_removed",
      });

      const uncleanedMedia = filterCleanedSalesCatalogMedia(removedMedia, removedMediaCleanup);
      if (uncleanedMedia.length > 0) {
        media = [...media, ...uncleanedMedia];

        const restoredMetadata = {
          ...(readRecord(data.metadata) ?? metadata),
          media: serializeSalesCatalogMedia(media),
          media_cleanup: {
            deleted_count: removedMediaCleanup.deletedCount,
            failed_count: removedMediaCleanup.failed.length,
            released_bytes: removedMediaCleanup.releasedBytes,
            released_file_count: removedMediaCleanup.releasedFileCount,
            skipped_count: removedMediaCleanup.skipped.length,
            updated_at: new Date().toISOString(),
          },
        };
        const restoredContent = buildSalesCatalogContent({
          title,
          description,
          category,
          price,
          currency,
          media,
          attributes,
          inventory,
          offer,
          fulfillment,
          shipping,
          pageContent,
          billingCycle,
          billingInterval,
          salesDestination,
          productUrl,
          externalLinkButtonTag: trackedLink?.tag ?? null,
        });
        const { data: restoredData } = await client
          .from("intelligence_memory")
          .update({
            content: restoredContent,
            metadata: restoredMetadata,
            updated_at: now,
          })
          .eq("id", data.id)
          .eq("scope", "organization")
          .eq("organization_id", company.id)
          .eq("memory_type", "sales_catalog_item")
          .select("id, organization_id, title, content, metadata, created_at, updated_at")
          .single<SalesCatalogMemoryRow>();

        if (restoredData) {
          data = restoredData;
        }
      }
    }

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: company.id,
      source_type: "sales_catalog",
      source_id: data.id,
      event_type: existingRow ? "sales_catalog.item_updated" : "sales_catalog.item_created",
      title: existingRow ? `Produto atualizado: ${title}` : `Produto cadastrado: ${title}`,
      summary: existingRow ? `Tag ${tag} atualizada para uso no agente WhatsApp.` : `Tag ${tag} criada para uso no agente WhatsApp.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_item", "whatsapp_agent", "lead_tracking"],
      payload: {
        product_id: data.id,
        label: title,
        tag,
        media_count: media.length,
        uploaded_media_count: files.length,
        inventory_status: inventory.status,
        stock_quantity: inventory.quantity,
        sale_price: offer.salePrice,
        store_featured: storeFeatured,
        store_featured_rank: storeFeaturedRank,
        coupon_code: offer.couponCode,
        fulfillment_mode: fulfillment.mode,
        sales_destination: salesDestination,
        product_url: productUrl,
        link_button_id: trackedLink?.id ?? null,
        link_button_tag: trackedLink?.tag ?? null,
        actor_id: workspace.user.id,
        removed_media_count: removedMedia.length,
        media_cleanup: removedMediaCleanup,
      },
    });

    await persistSalesCatalogSkus({
      client,
      companyId: company.id,
      itemId: data.id,
      skus,
      fallback: {
        title,
        price,
        salePrice: offer.salePrice,
        currency,
        inventory,
        shipping,
        attributes,
      },
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");
    revalidatePath(`/loja/${company.slug ?? company.id}`);

    return NextResponse.json({
      item: mapSalesCatalogItem(data),
      mode: existingRow ? "updated" : "created",
    });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao cadastrar produto."), { status: statusForRouteError(error, 500) });
  }
}

async function handleJsonPost(request: NextRequest, workspace: CurrentWorkspace) {
  const body = readRecord(await request.json().catch(() => null));
  const action = readFormString(body?.action);
  const requestedCompanyId = readFormString(body?.companyId);

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Escolha uma empresa antes de sincronizar o catalogo.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertSalesCatalogJsonActionAccess({ action, organizationId: company.id, client });

    if (action === "cleanup_archived_product_media") {
      const result = await cleanupArchivedSalesCatalogProductMedia({
        client,
        companyId: company.id,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "import_whatsapp_catalog") {
      const result = await queueWhatsappCatalogImportReview({
        userId: workspace.user.id,
        companyId,
        whatsappInstanceId: readFormString(body?.whatsappInstanceId),
        client,
      });
      const dispatchResults = await Promise.allSettled([
        inngest.send({
          name: whatsappCatalogImportProcessRequestedEventName,
          data: {
            jobId: result.importJob.id,
            companyId: company.id,
            whatsappInstanceId: result.whatsappInstanceId,
          },
        }),
        inngest.send({
          name: salesCatalogImportProcessRequestedEventName,
          data: {
            jobId: result.importJob.id,
            companyId: company.id,
            whatsappInstanceId: result.whatsappInstanceId,
            sourcePlatform: "whatsapp_catalog",
          },
        }),
      ]);
      const dispatchErrors = dispatchResults
        .filter((dispatchResult): dispatchResult is PromiseRejectedResult => dispatchResult.status === "rejected")
        .map((dispatchResult) => dispatchResult.reason instanceof Error ? dispatchResult.reason.message : "Falha ao acionar a Inngest.");

      if (dispatchErrors.length > 0) {
        await client.from("sales_catalog_import_events").insert({
          import_job_id: result.importJob.id,
          organization_id: company.id,
          level: "warning",
          event_type: "sales_catalog_import.inngest_dispatch_warning",
          title: "Aviso ao acionar a fila",
          summary: "A importacao foi salva, mas um dos acionamentos da Inngest falhou. O sweep recorrente ainda pode processar o job.",
          payload: {
            errors: dispatchErrors,
            job_id: result.importJob.id,
            whatsapp_instance_id: result.whatsappInstanceId,
          },
        });
      }

      revalidatePath("/dashboard/automacoes");
      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "export_whatsapp_catalog") {
      const result = await exportWhatsappCatalogProducts({
        userId: workspace.user.id,
        companyId,
        whatsappInstanceId: readFormString(body?.whatsappInstanceId),
        itemIds: readStringArray(body?.itemIds),
        client,
      });

      revalidatePath("/dashboard/automacoes");
      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "save_catalog_settings") {
      const result = await saveCatalogSettings({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");
      revalidatePath(`/loja/${company.slug ?? company.id}`);

      return NextResponse.json(result);
    }

    if (action === "save_pagbank_settings") {
      const result = await savePagBankSettings({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/integracoes");
      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");
      revalidatePath(`/loja/${company.slug ?? company.id}`);

      return NextResponse.json(result);
    }

    if (action === "save_shipping_settings") {
      const shippingSettings = await saveShippingSettings({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json({ shippingSettings });
    }

    if (action === "calculate_shipping_quote") {
      const quote = await calculateShippingQuote({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      return NextResponse.json(quote);
    }

    if (action === "start_mercado_pago_oauth") {
      const result = await startMercadoPagoOAuth({
        client,
        companyId,
        userId: workspace.user.id,
      });

      return NextResponse.json(result);
    }

    if (action === "save_mercado_pago_webhook_secret") {
      const result = await saveMercadoPagoWebhookSecret({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/links");

      return NextResponse.json(result);
    }

    if (action === "disconnect_mercado_pago") {
      const result = await disconnectMercadoPagoIntegration({
        client,
        companyId,
        userId: workspace.user.id,
      });

      revalidatePath("/dashboard/links");

      return NextResponse.json(result);
    }

    if (action === "disconnect_pagbank") {
      const result = await disconnectPagBankIntegration({
        client,
        companyId,
        userId: workspace.user.id,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/integracoes");

      return NextResponse.json(result);
    }

    if (action === "create_payment_session") {
      const result = await createPaymentSession({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "create_order") {
      const result = await createSalesCatalogOrder({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "create_cart_checkout") {
      const result = await createSalesCatalogCartCheckout({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/atendimento");
      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "update_order_status") {
      const result = await updateSalesCatalogOrderStatus({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "set_whatsapp_visibility") {
      const itemId = readFormString(body?.itemId);
      const visible = readBoolean(body?.visible);

      if (!itemId || visible === null) {
        return NextResponse.json({ error: "Informe o produto e a visibilidade desejada." }, { status: 422 });
      }

      const result = await setWhatsappCatalogVisibility({
        userId: workspace.user.id,
        companyId,
        itemId,
        visible,
        client,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Acao de catalogo nao reconhecida." }, { status: 422 });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao sincronizar catalogo."), { status: statusForRouteError(error, 500) });
  }
}

async function assertSalesCatalogJsonActionAccess(input: {
  action: string | null;
  organizationId: string;
  client: ReturnType<typeof createServiceClient>;
}) {
  if (input.action === "cleanup_archived_product_media") {
    return null;
  }

  if (input.action !== "create_cart_checkout") {
    return assertBillableAccess({ organizationId: input.organizationId, client: input.client });
  }

  return assertSalesCatalogManualAccess({
    organizationId: input.organizationId,
    client: input.client,
  });
}

async function assertSalesCatalogManualAccess(input: {
  organizationId: string;
  client: ReturnType<typeof createServiceClient>;
}) {
  const status = await getOrganizationBillingAccess({
    organizationId: input.organizationId,
    client: input.client,
  });

  if (status.canUseBillableFeatures || status.state === "paid_no_credits") {
    return status;
  }

  throw new BillingAccessError(status);
}

async function cleanupArchivedSalesCatalogProductMedia(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const limit = normalizeNullableInteger(input.body?.limit, 1, 500) ?? 100;
  const { data: rows, error } = await input.client
    .from("intelligence_memory")
    .select("id, title, metadata")
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "sales_catalog_item")
    .filter("metadata->>status", "eq", "archived")
    .limit(limit)
    .returns<Array<{ id: string; title: string; metadata: JsonRecord | null }>>();

  if (error) {
    throw new Error(`Nao foi possivel carregar produtos arquivados: ${error.message}`);
  }

  const summaries: Array<{
    productId: string;
    title: string;
    cleanup: SalesCatalogMediaCleanupResult;
  }> = [];
  let productCount = 0;
  let deletedCount = 0;
  let releasedBytes = 0;
  let releasedFileCount = 0;

  for (const row of rows ?? []) {
    const metadata = readRecord(row.metadata) ?? {};
    const media = readSalesCatalogMediaMetadata(metadata.media);

    if (media.length === 0) {
      continue;
    }

    productCount += 1;

    const cleanup = await cleanupSalesCatalogMediaStorage({
      client: input.client,
      organizationId: input.companyId,
      productId: row.id,
      userId: input.userId,
      media,
      reason: "product_deleted",
    });
    const remainingMedia = filterCleanedSalesCatalogMedia(media, cleanup);

    if (cleanup.deletedCount > 0) {
      const nextMetadata = {
        ...metadata,
        media: serializeSalesCatalogMedia(remainingMedia),
        media_cleanup: {
          deleted_count: cleanup.deletedCount,
          failed_count: cleanup.failed.length,
          released_bytes: cleanup.releasedBytes,
          released_file_count: cleanup.releasedFileCount,
          skipped_count: cleanup.skipped.length,
          updated_at: new Date().toISOString(),
        },
      };

      await input.client
        .from("intelligence_memory")
        .update({
          metadata: nextMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("scope", "organization")
        .eq("organization_id", input.companyId)
        .eq("memory_type", "sales_catalog_item");
    }

    deletedCount += cleanup.deletedCount;
    releasedBytes += cleanup.releasedBytes;
    releasedFileCount += cleanup.releasedFileCount;
    summaries.push({ productId: row.id, title: row.title, cleanup });
  }

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.companyId,
    source_type: "sales_catalog",
    source_id: input.companyId,
    event_type: "sales_catalog.archived_media_cleanup",
    title: "Limpeza de midias de produtos arquivados",
    summary: `${deletedCount} arquivo(s) removido(s) do storage em ${productCount} produto(s) arquivado(s).`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_item", "storage", "cleanup"],
    payload: {
      products_with_media: productCount,
      deleted_media_count: deletedCount,
      released_bytes: releasedBytes,
      released_file_count: releasedFileCount,
      requested_by: input.userId,
      limit,
    },
  });

  return {
    scanned: rows?.length ?? 0,
    productsWithMedia: productCount,
    deletedMediaCount: deletedCount,
    releasedBytes,
    releasedFileCount,
    summaries,
  };
}

async function saveCatalogSettings(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const businessType = normalizeBusinessType(readFormString(input.body?.businessType));
  const template = salesCatalogBusinessTemplates.find((item) => item.value === businessType)
    ?? salesCatalogBusinessTemplates[salesCatalogBusinessTemplates.length - 1];
  const categories = normalizeStringList(input.body?.categories, [], 30, 80);
  const attributes = normalizeSettingsAttributes(input.body?.attributes, []);
  const storefront = normalizeStorefrontSettings(input.body?.storefront, categories);
  const trackInventory = readBoolean(input.body?.trackInventory) ?? false;
  const variationMedia = readBoolean(input.body?.variationMedia) ?? false;
  const commerceDefaults = createDefaultSalesCatalogCommerceSettings();
  const paymentMethods = normalizePaymentMethods(input.body?.paymentMethods, commerceDefaults.paymentMethods);
  const pagBank = normalizePagBankSettings(input.body?.pagBank ?? input.body?.pagbank, commerceDefaults.pagBank);
  const orderPolicy = normalizeOrderPolicy(input.body?.orderPolicy, commerceDefaults.orderPolicy);
  const leadDataPolicy = normalizeLeadDataPolicy(input.body?.leadDataPolicy, commerceDefaults.leadDataPolicy);
  const messageTemplates = normalizeMessageTemplates(input.body?.messageTemplates, commerceDefaults.messageTemplates);
  const automationSettings = normalizeAutomationSettings(input.body?.automationSettings, commerceDefaults.automationSettings);
  const orderBumps = normalizeOrderBumps(input.body?.orderBumps, createDefaultSalesCatalogOrderBumps());
  const commerceAgent = normalizeCommerceAgentSettings(input.body?.commerceAgent, commerceDefaults.commerceAgent);
  const enabledPayments = paymentMethods.filter((method) => method.enabled);
  const now = new Date().toISOString();
  const metadata = {
    configured: true,
    business_type: businessType,
    categories,
    attributes,
    storefront: serializeStorefrontSettings(storefront),
    track_inventory: trackInventory,
    variation_media: variationMedia,
    payment_methods: paymentMethods.map(serializePaymentMethod),
    pagbank: serializePagBankSettings(pagBank),
    order_policy: serializeOrderPolicy(orderPolicy),
    lead_data_policy: serializeLeadDataPolicy(leadDataPolicy),
    message_templates: serializeMessageTemplates(messageTemplates),
    automation_settings: serializeAutomationSettings(automationSettings),
    order_bumps: serializeOrderBumps(orderBumps),
    commerce_agent: serializeCommerceAgentSettings(commerceAgent),
    updated_by: input.userId,
    updated_from: "sales_catalog_setup",
  };
  const content = [
    `Tipo: ${template.label}`,
    categories.length ? `Categorias: ${categories.join(", ")}` : "",
    storefront.heroTitle ? `Chamada da loja: ${storefront.heroTitle}${storefront.heroHighlight ? ` ${storefront.heroHighlight}` : ""}` : "",
    storefront.heroSubtitle ? `Subtitulo da loja: ${storefront.heroSubtitle}` : "",
    storefront.headerText ? `Header publico: ${storefront.headerText}` : "",
    storefront.footerText ? `Sobre no footer: ${storefront.footerText}` : "",
    storefront.footerContactText ? `Contato no footer: ${storefront.footerContactText}` : "",
    attributes.length ? "Variacoes:" : "",
    ...attributes.map((attribute) => `- ${attribute.name}: ${attribute.values.join(", ")}`),
    trackInventory ? "Controle de estoque por variacao: sim" : "Controle de estoque por variacao: nao",
    variationMedia ? "Midia por variacao: sim" : "Midia por variacao: nao",
    enabledPayments.length ? `Pagamentos: ${enabledPayments.map((method) => method.label).join(", ")}` : "Pagamentos: acionar humano",
    `PagBank: ${pagBank.enabledMethods.join(", ")}`,
    "PagBank regra do agente: ofereca somente os metodos habilitados nesta configuracao; nao ofereca Pix, cartao, debito ou boleto quando o metodo estiver desativado.",
    `PagBank recorrencia: ${pagBank.recurringEnabled ? "habilitada" : "desabilitada"}.`,
    pagBank.softDescriptor ? `PagBank descriptor: ${pagBank.softDescriptor}` : "",
    `Reserva do pedido: ${formatReservationPolicy(orderPolicy.reservationPolicy)}`,
    orderPolicy.minimumOrderValue ? `Pedido minimo: ${orderPolicy.minimumOrderValue}` : "",
    `CEP antes do frete: ${orderPolicy.askCepBeforeQuote ? "sim" : "nao"}`,
    leadDataPolicy.requiredFields.length ? `Dados do lead: ${leadDataPolicy.requiredFields.join(", ")}` : "",
    `Mensagem de resumo: ${messageTemplates.orderSummary}`,
    orderBumps.enabled && orderBumps.items.length ? `Order bumps: ${orderBumps.items.length} oferta(s)` : "Order bumps: inativo",
    commerceAgent.enabled
      ? `Agente na loja: ${formatCommerceAgentMode(commerceAgent.mode)} em ${commerceAgent.surfaces.join(", ")}`
      : "Agente na loja: inativo",
  ].filter(Boolean).join("\n");
  const { data: existing, error: existingError } = await input.client
    .from("intelligence_memory")
    .select("id, metadata")
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_settings")
    .limit(1)
    .maybeSingle<{ id: string; metadata: JsonRecord | null }>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar a configuracao atual: ${existingError.message}`);
  }

  const previousCategories = normalizeStringList(readRecord(existing?.metadata)?.categories, [], 30, 80);
  const categoryRenames = normalizeCategoryRenames(input.body?.categoryRenames ?? input.body?.category_renames, previousCategories, categories);
  const settingsId = existing?.id ?? randomUUID();
  const payload = {
    id: settingsId,
    scope: "organization",
    organization_id: company.id,
    memory_type: "sales_catalog_settings",
    title: "Configuracao do Catalogo de Vendas",
    content,
    importance: 0.76,
    tags: ["sales_catalog", "sales_catalog_settings", "whatsapp_agent"],
    metadata,
    updated_at: now,
  };
  const query = existing
    ? input.client.from("intelligence_memory").update(payload).eq("id", existing.id)
    : input.client.from("intelligence_memory").insert({ ...payload, created_at: now });
  const { data, error } = await query
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .single<SalesCatalogMemoryRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar a configuracao do catalogo.");
  }

  const renamedProductsCount = await applySalesCatalogCategoryRenames({
    client: input.client,
    companyId: company.id,
    renames: categoryRenames,
    updatedAt: now,
    userId: input.userId,
  });

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog",
    source_id: data.id,
    event_type: "sales_catalog.settings_saved",
    title: "Configuracao do Catalogo de Vendas salva",
    summary: `${categories.length} categorias e ${attributes.length} variacoes configuradas.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_settings", "whatsapp_agent"],
    payload: {
      business_type: businessType,
      categories_count: categories.length,
      category_renames: categoryRenames,
      category_renamed_products_count: renamedProductsCount,
      attributes_count: attributes.length,
      storefront,
      track_inventory: trackInventory,
      variation_media: variationMedia,
      payment_methods_count: enabledPayments.length,
      pagbank: serializePagBankSettings(pagBank),
      reservation_policy: orderPolicy.reservationPolicy,
      required_lead_fields: leadDataPolicy.requiredFields,
      commerce_agent: serializeCommerceAgentSettings(commerceAgent),
      updated_by: input.userId,
    },
  });

  return {
    settings: mapSalesCatalogSettings(data),
  };
}

async function savePagBankSettings(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const commerceDefaults = createDefaultSalesCatalogCommerceSettings();
  const pagBank = normalizePagBankSettings(input.body?.pagBank ?? input.body?.pagbank, commerceDefaults.pagBank);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await input.client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_settings")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<SalesCatalogMemoryRow>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar a configuracao atual: ${existingError.message}`);
  }

  const currentMetadata = readRecord(existing?.metadata) ?? {};
  const metadata = {
    ...currentMetadata,
    configured: readBoolean(currentMetadata.configured) ?? false,
    pagbank: serializePagBankSettings(pagBank),
    updated_by: input.userId,
    updated_from: "pagbank_integration_settings",
  };
  const settingsId = existing?.id ?? randomUUID();
  const payload = {
    id: settingsId,
    scope: "organization",
    organization_id: company.id,
    memory_type: "sales_catalog_settings",
    title: existing?.title ?? "Configuracao do Catalogo de Vendas",
    content: mergePagBankSettingsContent(existing?.content ?? "", pagBank),
    importance: 0.76,
    tags: ["sales_catalog", "sales_catalog_settings", "pagbank", "payment_preferences"],
    metadata,
    updated_at: now,
  };
  const query = existing
    ? input.client.from("intelligence_memory").update(payload).eq("id", existing.id)
    : input.client.from("intelligence_memory").insert({ ...payload, created_at: now });
  const { data, error } = await query
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .single<SalesCatalogMemoryRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar as preferencias PagBank.");
  }

  const settings = mapSalesCatalogSettings(data);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog",
    source_id: data.id,
    event_type: "sales_catalog.pagbank_settings_saved",
    title: "Preferencias PagBank salvas",
    summary: `PagBank configurado com ${pagBank.enabledMethods.length} metodo(s) de pagamento.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "pagbank", "payment_preferences"],
    payload: {
      pagbank: serializePagBankSettings(pagBank),
      updated_by: input.userId,
    },
  });

  return {
    settings,
    pagBankPreferences: {
      companyId: settings.companyId,
      settings: settings.pagBank,
      configured: settings.configured,
      updatedAt: settings.updatedAt,
    },
  };
}

function mergePagBankSettingsContent(content: string, pagBank: SalesCatalogPagBankSettings) {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return !normalized.startsWith("pagbank:")
        && !normalized.startsWith("pagbank descriptor:")
        && !normalized.startsWith("pagbank parcelas:")
        && !normalized.startsWith("pagbank pix:")
        && !normalized.startsWith("pagbank recorrencia:")
        && !normalized.startsWith("pagbank regra do agente:");
    });

  lines.push(`PagBank: ${pagBank.enabledMethods.join(", ")}`);
  lines.push("PagBank regra do agente: ofereca somente os metodos habilitados nesta configuracao; nao ofereca Pix, cartao, debito ou boleto quando o metodo estiver desativado.");
  lines.push(`PagBank recorrencia: ${pagBank.recurringEnabled ? "habilitada" : "desabilitada"}.`);
  lines.push(`PagBank parcelas: maximo ${pagBank.maxInstallments}, sem juros ate ${pagBank.interestFreeInstallments}`);
  if (pagBank.softDescriptor) {
    lines.push(`PagBank descriptor: ${pagBank.softDescriptor}`);
  }
  lines.push(`PagBank Pix: expira em ${pagBank.pixExpirationMinutes} minuto(s)`);

  return lines.filter(Boolean).join("\n");
}

async function saveShippingSettings(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const rules = normalizeShippingRules(input.body?.rules);
  const shippingEnabled = readBoolean(input.body?.shippingEnabled) ?? false;
  const localDeliveryEnabled = readBoolean(input.body?.localDeliveryEnabled) ?? false;
  const localPickup = readBoolean(input.body?.localPickup) ?? false;
  const originCep = normalizeSalesCatalogCep(readFormString(input.body?.originCep));
  const defaultHandlingDays = normalizeNullableInteger(input.body?.defaultHandlingDays, 0, 45);
  const localDeliveryZones = normalizeLocalDeliveryZones(input.body?.localDeliveryZones);
  const activeRules = rules.filter((rule) => rule.active);
  const activeDeliveryRules = shippingEnabled ? activeRules : [];
  const activeLocalDeliveryZones = localDeliveryEnabled ? localDeliveryZones.filter((zone) => zone.active) : [];

  assertShippingSettingsReady({
    shippingEnabled,
    activeRules,
    localDeliveryEnabled,
    activeLocalDeliveryZones,
  });

  const now = new Date().toISOString();
  const metadata = {
    configured: true,
    shipping_enabled: shippingEnabled,
    local_delivery_enabled: localDeliveryEnabled,
    local_pickup: localPickup,
    origin_cep: originCep,
    default_handling_days: defaultHandlingDays,
    rules: rules.map(serializeShippingRule),
    local_delivery_zones: localDeliveryZones.map(serializeLocalDeliveryZone),
    updated_by: input.userId,
    updated_from: "sales_catalog_shipping",
  };
  const content = [
    shippingEnabled ? "Frete por entrega: sim" : "Frete por entrega: nao",
    localDeliveryEnabled ? "Entrega local: sim" : "Entrega local: nao",
    originCep ? `CEP de origem: ${originCep}` : "",
    localPickup ? "Retirada local: sim" : "Retirada local: nao",
    defaultHandlingDays !== null ? `Prazo de separacao: ${defaultHandlingDays} dia(s)` : "",
    shippingEnabled
      ? activeDeliveryRules.length ? "Estados atendidos:" : "Nenhum estado atendido foi marcado."
      : "Frete por entrega desativado.",
    ...activeDeliveryRules.map(formatShippingRuleContent),
    localDeliveryEnabled
      ? activeLocalDeliveryZones.length ? "Zonas locais atendidas:" : "Nenhuma zona local ativa foi marcada."
      : "Entrega local desativada.",
    ...activeLocalDeliveryZones.map(formatLocalDeliveryZoneContent),
  ].filter(Boolean).join("\n");
  const { data: existing, error: existingError } = await input.client
    .from("intelligence_memory")
    .select("id")
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_shipping_settings")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar o frete atual: ${existingError.message}`);
  }

  const settingsId = existing?.id ?? randomUUID();
  const payload = {
    id: settingsId,
    scope: "organization",
    organization_id: company.id,
    memory_type: "sales_catalog_shipping_settings",
    title: "Entrega e Frete do Catalogo de Vendas",
    content,
    importance: 0.74,
    tags: ["sales_catalog", "sales_catalog_shipping", "whatsapp_agent"],
    metadata,
    updated_at: now,
  };
  const query = existing
    ? input.client.from("intelligence_memory").update(payload).eq("id", existing.id)
    : input.client.from("intelligence_memory").insert({ ...payload, created_at: now });
  const { data, error } = await query
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .single<SalesCatalogMemoryRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar o frete do catalogo.");
  }

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog",
    source_id: data.id,
    event_type: "sales_catalog.shipping_saved",
    title: "Entrega e frete do Catalogo de Vendas salvos",
    summary: shippingEnabled
      ? `${activeDeliveryRules.length} estado(s) e ${activeLocalDeliveryZones.length} zona(s) local(is) configurados.`
      : localDeliveryEnabled
        ? `${activeLocalDeliveryZones.length} zona(s) local(is) configuradas.`
        : "Frete por entrega desativado.",
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_shipping", "whatsapp_agent"],
    payload: {
      shipping_enabled: shippingEnabled,
      active_states_count: activeDeliveryRules.length,
      local_delivery_enabled: localDeliveryEnabled,
      local_delivery_zones_count: activeLocalDeliveryZones.length,
      local_pickup: localPickup,
      origin_cep: originCep,
      default_handling_days: defaultHandlingDays,
      updated_by: input.userId,
    },
  });

  return mapSalesCatalogShippingSettings(data);
}

async function calculateShippingQuote(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const itemId = readFormString(input.body?.itemId);
  const cep = normalizeSalesCatalogCep(readFormString(input.body?.cep));

  if (!itemId) {
    throw new Error("Escolha um produto para calcular o frete.");
  }

  if (!cep) {
    throw new Error("Informe um CEP valido com 8 digitos.");
  }

  const { data: itemRow, error: itemError } = await input.client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("id", itemId)
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_item")
    .maybeSingle<SalesCatalogMemoryRow>();

  if (itemError) {
    throw new Error(`Nao foi possivel carregar o produto: ${itemError.message}`);
  }

  if (!itemRow) {
    throw new Error("Produto nao encontrado para esta empresa.");
  }

  const { data: settingsRow, error: settingsError } = await input.client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_shipping_settings")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<SalesCatalogMemoryRow>();

  if (settingsError) {
    throw new Error(`Nao foi possivel carregar o frete: ${settingsError.message}`);
  }

  if (!settingsRow) {
    throw new Error("Configure entrega e frete antes de calcular por CEP.");
  }

  const item = mapSalesCatalogItem(itemRow);
  const shippingSettings = mapSalesCatalogShippingSettings(settingsRow);

  if (!shippingSettings.shippingEnabled) {
    throw new Error("Frete por entrega esta desativado para este catalogo.");
  }

  const result = calculateSalesCatalogShippingQuotes({ item, settings: shippingSettings, cep });

  return {
    item: {
      id: item.id,
      title: item.title,
      weightGrams: result.weightGrams,
      weightSource: result.weightSource,
    },
    destination: result.destination,
    quotes: result.quotes,
    error: result.error,
  };
}

function assertShippingSettingsReady(input: {
  shippingEnabled: boolean;
  activeRules: SalesCatalogShippingRule[];
  localDeliveryEnabled: boolean;
  activeLocalDeliveryZones: SalesCatalogLocalDeliveryZone[];
}) {
  if (input.shippingEnabled && input.activeRules.length === 0) {
    throw new Error("Marque ao menos um estado como Entrego ou desative o frete por entrega.");
  }

  const incompleteStates = input.activeRules
    .filter((rule) => input.shippingEnabled && (
      !hasShippingMoneyValue(rule.price)
      || rule.minDays === null
      || rule.maxDays === null
    ))
    .map((rule) => rule.uf);

  if (incompleteStates.length > 0) {
    throw new Error(`Complete valor, prazo minimo e prazo maximo dos estados ativos: ${incompleteStates.join(", ")}.`);
  }

  const partialCepStates = input.activeRules
    .filter((rule) => input.shippingEnabled && Boolean(rule.cepStart) !== Boolean(rule.cepEnd))
    .map((rule) => rule.uf);

  if (partialCepStates.length > 0) {
    throw new Error(`Preencha CEP inicial e CEP final juntos, ou deixe os dois vazios para atender o estado inteiro: ${partialCepStates.join(", ")}.`);
  }

  if (!input.localDeliveryEnabled) {
    return;
  }

  if (input.activeLocalDeliveryZones.length === 0) {
    throw new Error("Crie ao menos uma zona local ativa ou desative a entrega local.");
  }

  const incompleteZones = input.activeLocalDeliveryZones
    .filter((zone) => !hasShippingMoneyValue(zone.price) || zone.minDays === null || zone.maxDays === null)
    .map((zone) => zone.name);

  if (incompleteZones.length > 0) {
    throw new Error(`Complete valor, prazo minimo e prazo maximo das zonas locais: ${incompleteZones.join(", ")}.`);
  }

  const invalidZones = input.activeLocalDeliveryZones
    .filter((zone) => {
      if (zone.shape === "radius") {
        return !isValidGeoPoint(zone.baseLatitude, zone.baseLongitude) || zone.radiusKm === null || zone.radiusKm <= 0;
      }

      if (zone.shape === "neighborhoods") {
        return zone.neighborhoods.length === 0 && zone.cities.length === 0;
      }

      return zone.polygon.length < 3
        && (!isValidGeoPoint(zone.baseLatitude, zone.baseLongitude) || zone.radiusKm === null || zone.radiusKm <= 0);
    })
    .map((zone) => zone.name);

  if (invalidZones.length > 0) {
    throw new Error(`Complete a area atendida das zonas locais: ${invalidZones.join(", ")}.`);
  }
}

function hasShippingMoneyValue(value: string | null) {
  return /\d/.test(value?.trim() ?? "");
}

async function startMercadoPagoOAuth(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const state = `mp_${randomUUID()}`;
  const webhookUrl = buildMercadoPagoWebhookUrl();
  const testTokenEnabled = await isMercadoPagoTestTokenEnabled({ client: input.client });
  const now = new Date().toISOString();
  const payload = {
    organization_id: company.id,
    provider: "mercado_pago",
    status: "pending",
    mode: testTokenEnabled ? "sandbox" : "production",
    webhook_url: webhookUrl,
    last_error: null,
    metadata: {
      oauth_state: state,
      oauth_requested_by: input.userId,
      oauth_requested_at: now,
    },
    updated_at: now,
  };
  const { data, error } = await input.client
    .from("sales_catalog_payment_integrations")
    .upsert(payload, { onConflict: "organization_id,provider" })
    .select(salesCatalogPaymentIntegrationSelect)
    .single<SalesCatalogPaymentIntegrationRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel iniciar a conexao com Mercado Pago.");
  }

  return {
    integration: mapSalesCatalogPaymentIntegration(data),
    authorizationUrl: await buildMercadoPagoAuthorizationUrl({ companyId: company.id, state, client: input.client }),
    webhookUrl,
  };
}

async function saveMercadoPagoWebhookSecret(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const secret = normalizeOptionalText(readFormString(input.body?.webhookSecret), 240);
  const { data: existing } = await input.client
    .from("sales_catalog_payment_integrations")
    .select(salesCatalogPaymentIntegrationSelect)
    .eq("organization_id", company.id)
    .eq("provider", "mercado_pago")
    .maybeSingle<SalesCatalogPaymentIntegrationRow>();
  const existingMetadata = readRecord(existing?.metadata) ?? {};
  const now = new Date().toISOString();
  const { data, error } = await input.client
    .from("sales_catalog_payment_integrations")
    .upsert({
      organization_id: company.id,
      provider: "mercado_pago",
      status: existing?.status ?? "pending",
      mode: existing?.mode ?? (process.env.MERCADO_PAGO_TEST_TOKEN === "true" ? "sandbox" : "production"),
      webhook_secret_encrypted: secret ? encryptCredentialValue(secret) : null,
      webhook_url: buildMercadoPagoWebhookUrl(),
      metadata: {
        ...existingMetadata,
        webhook_secret_saved_by: input.userId,
        webhook_secret_saved_at: now,
      },
      updated_at: now,
    }, { onConflict: "organization_id,provider" })
    .select(salesCatalogPaymentIntegrationSelect)
    .single<SalesCatalogPaymentIntegrationRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar o segredo do webhook Mercado Pago.");
  }

  return { integration: mapSalesCatalogPaymentIntegration(data) };
}

async function disconnectMercadoPagoIntegration(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const { data, error } = await input.client
    .from("sales_catalog_payment_integrations")
    .update({
      status: "disabled",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      last_error: null,
      metadata: {
        disconnected_by: input.userId,
        disconnected_at: new Date().toISOString(),
      },
    })
    .eq("organization_id", company.id)
    .eq("provider", "mercado_pago")
    .select(salesCatalogPaymentIntegrationSelect)
    .maybeSingle<SalesCatalogPaymentIntegrationRow>();

  if (error) {
    throw new Error(`Nao foi possivel desconectar Mercado Pago: ${error.message}`);
  }

  if (!data) {
    throw new Error("Nenhuma conexao Mercado Pago encontrada para esta empresa.");
  }

  return { integration: mapSalesCatalogPaymentIntegration(data) };
}

async function disconnectPagBankIntegration(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const { data, error } = await input.client
    .from("sales_catalog_payment_integrations")
    .update({
      status: "disabled",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      last_error: null,
      metadata: {
        disconnected_by: input.userId,
        disconnected_at: new Date().toISOString(),
      },
    })
    .eq("organization_id", company.id)
    .eq("provider", "pagbank")
    .select(salesCatalogPaymentIntegrationSelect)
    .maybeSingle<SalesCatalogPaymentIntegrationRow>();

  if (error) {
    throw new Error(`Nao foi possivel desconectar PagBank: ${error.message}`);
  }

  if (!data) {
    throw new Error("Nenhuma conexao PagBank encontrada para esta empresa.");
  }

  return { integration: mapSalesCatalogPaymentIntegration(data) };
}

async function createPaymentSession(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const orderId = normalizeUuid(readFormString(input.body?.orderId));

  if (!orderId) {
    throw new Error("Informe o pedido para gerar pagamento.");
  }

  const result = await createSalesCatalogPixPaymentSession({
    client: input.client,
    organizationId: company.id,
    orderId,
    amount: readFormString(input.body?.amount),
    payerEmail: readFormString(input.body?.payerEmail),
    source: "dashboard",
    actorId: input.userId,
  });

  return result;
}

async function createSalesCatalogOrder(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const itemId = readFormString(input.body?.itemId);
  const skuId = normalizeUuid(readFormString(input.body?.skuId));
  const quantity = normalizeNullableInteger(input.body?.quantity, 1, 100000) ?? 1;
  const customerName = normalizeOptionalText(readFormString(input.body?.customerName), 140);
  const customerPhone = normalizeOptionalText(readFormString(input.body?.customerPhone), 40);

  if (!itemId) {
    throw new Error("Escolha um produto para criar o pedido.");
  }

  if (!customerName && !customerPhone) {
    throw new Error("Informe ao menos o nome ou telefone do lead.");
  }

  const { data: itemRow, error: itemError } = await input.client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("id", itemId)
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_item")
    .maybeSingle<SalesCatalogMemoryRow>();

  if (itemError) {
    throw new Error(`Nao foi possivel carregar o produto do pedido: ${itemError.message}`);
  }

  if (!itemRow) {
    throw new Error("Produto nao encontrado para esta empresa.");
  }

  const itemMetadata = readRecord(itemRow.metadata) ?? {};
  const item = mapSalesCatalogItem(itemRow);
  let skuRow: SalesCatalogSkuRow | null = null;

  if (skuId) {
    const { data: loadedSku, error: skuError } = await input.client
      .from("sales_catalog_skus")
      .select("id, organization_id, catalog_item_id, sku_code, title, attributes, price, sale_price, currency, stock_status, stock_quantity, low_stock_threshold, weight_grams, dimensions, media_ids, status, metadata, created_at, updated_at")
      .eq("id", skuId)
      .eq("organization_id", company.id)
      .eq("catalog_item_id", item.id)
      .neq("status", "archived")
      .maybeSingle<SalesCatalogSkuRow>();

    if (skuError) {
      throw new Error(`Nao foi possivel carregar o SKU do pedido: ${skuError.message}`);
    }

    skuRow = loadedSku ?? null;
  }

  if (item.status === "archived") {
    throw new Error("Este produto esta arquivado e nao pode virar pedido.");
  }

  if (item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder) {
    throw new Error("Este produto esta esgotado. Ative encomenda ou escolha outro item.");
  }

  if (skuRow?.stock_status === "out_of_stock" && !item.inventory.allowBackorder) {
    throw new Error("Este SKU esta esgotado. Escolha outra variacao ou ative encomenda.");
  }

  const attributes = readItemAttributesPayload(input.body?.attributes);
  const skuAttributes = skuRow ? readItemAttributesPayload(skuRow.attributes) : [];
  const selectedAttributes = attributes.length > 0 ? attributes : skuAttributes.length > 0 ? skuAttributes : item.attributes;
  const unitPrice = skuRow?.price ?? item.price;
  const salePrice = skuRow?.sale_price ?? item.offer.salePrice;
  const subtotal = normalizeOptionalText(readFormString(input.body?.subtotal), 80) ?? salePrice ?? unitPrice;
  const shippingTotal = normalizeOptionalText(readFormString(input.body?.shippingTotal), 80);
  const discountTotal = normalizeOptionalText(readFormString(input.body?.discountTotal), 80);
  const total = normalizeOptionalText(readFormString(input.body?.total), 80) ?? subtotal;
  const paymentMethod = normalizeOptionalText(readFormString(input.body?.paymentMethod), 80);
  const shippingMethod = normalizeOptionalText(readFormString(input.body?.shippingMethod), 80);
  const agentNotes = normalizeOptionalText(readFormString(input.body?.agentNotes), 1200);
  const internalNotes = normalizeOptionalText(readFormString(input.body?.internalNotes), 1200);
  const destinationCep = normalizeSalesCatalogCep(readFormString(input.body?.destinationCep));
  const destinationAddress = normalizeOptionalText(readFormString(input.body?.destinationAddress), 300);
  const customerDocument = normalizeOptionalText(readFormString(input.body?.customerDocument), 40);
  const customerEmail = normalizeOptionalText(readFormString(input.body?.customerEmail), 160);
  const orderStatus = normalizeSalesCatalogOrderStatus(readFormString(input.body?.status), "pending_payment");
  const paymentStatus = normalizeSalesCatalogPaymentStatus(readFormString(input.body?.paymentStatus), "pending");
  const fulfillmentStatus = normalizeSalesCatalogFulfillmentStatus(readFormString(input.body?.fulfillmentStatus), "pending");
  const source = normalizeOptionalText(readFormString(input.body?.source), 40) ?? "dashboard";
  const skuMetadata = readRecord(skuRow?.metadata) ?? {};
  const platformProductId = readFormString(skuMetadata.platform_product_id) ?? readFormString(itemMetadata.platform_product_id);
  const platformProductCode = readFormString(skuMetadata.platform_product_code) ?? readFormString(itemMetadata.platform_product_code);
  const platformCommissionPercentage = normalizeNumber(itemMetadata.platform_product_commission_percentage);
  const platformCommissionReleaseDays = normalizeNumber(itemMetadata.platform_product_commission_release_days);
  const platformAgentPrompt = readFormString(itemMetadata.platform_product_agent_prompt);
  const commercialFlowType = normalizeCommercialFlowType(readFormString(skuMetadata.commercial_flow_type)
    ?? readFormString(itemMetadata.commercial_flow_type)
    ?? (platformProductId ? "connectyhub_resale" : "client_direct"));
  const revenueOwnerType = normalizeRevenueOwnerType(readFormString(skuMetadata.revenue_owner_type)
    ?? readFormString(itemMetadata.revenue_owner_type)
    ?? (platformProductId ? "connectyhub" : "client"));
  const commissionPolicyType = normalizeCommissionPolicyType(readFormString(skuMetadata.commission_policy_type)
    ?? readFormString(itemMetadata.commission_policy_type)
    ?? (platformProductId ? "percentage" : "none"));
  const commissionEligible = readBoolean(skuMetadata.commission_eligible)
    ?? readBoolean(itemMetadata.commission_eligible)
    ?? Boolean(platformProductId && commissionPolicyType !== "none" && platformCommissionPercentage && platformCommissionPercentage > 0);
  const now = new Date().toISOString();

  const { data: orderRow, error: orderError } = await input.client
    .from("sales_catalog_orders")
    .insert({
      organization_id: company.id,
      lead_id: normalizeUuid(readFormString(input.body?.leadId)),
      conversation_id: normalizeUuid(readFormString(input.body?.conversationId)),
      source,
      status: orderStatus,
      payment_status: paymentStatus,
      fulfillment_status: fulfillmentStatus,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_document: customerDocument,
      customer_email: customerEmail,
      destination_cep: destinationCep,
      destination_address: destinationAddress,
      subtotal,
      discount_total: discountTotal,
      shipping_total: shippingTotal,
      total,
      payment_method: paymentMethod,
      shipping_method: shippingMethod,
      agent_notes: agentNotes,
      internal_notes: internalNotes,
      commercial_flow_type: commercialFlowType,
      revenue_owner_type: revenueOwnerType,
      contains_platform_products: Boolean(platformProductId),
      commission_eligible: commissionEligible,
      metadata: {
        created_from: "sales_catalog_dashboard",
        catalog_item_id: item.id,
        catalog_item_tag: item.tag,
        currency: item.currency,
        billing_cycle: item.billingCycle,
        billing_interval: item.billingInterval,
        platform_product_id: platformProductId,
        platform_product_code: platformProductCode,
        commercial_flow_type: commercialFlowType,
        revenue_owner_type: revenueOwnerType,
        commission_policy_type: commissionPolicyType,
        commission_eligible: commissionEligible,
        platform_product_marketplace: Boolean(platformProductId),
      },
      created_by: input.userId,
      created_at: now,
      updated_at: now,
    })
    .select(salesCatalogOrderSelect)
    .single<SalesCatalogOrderRow>();

  if (orderError || !orderRow) {
    throw new Error(orderError?.message ?? "Nao foi possivel criar o pedido.");
  }

  const { data: orderItemRow, error: orderItemError } = await input.client
    .from("sales_catalog_order_items")
    .insert({
      order_id: orderRow.id,
      organization_id: company.id,
      catalog_item_id: item.id,
      sku_id: skuRow?.id ?? null,
      sku_code: skuRow?.sku_code ?? null,
      title: item.title,
      tag: item.tag,
      quantity,
      unit_price: unitPrice,
      sale_price: salePrice,
      total,
      product_origin_type: platformProductId ? "connectyhub" : "client",
      commercial_flow_type: commercialFlowType,
      revenue_owner_type: revenueOwnerType,
      commission_eligible: commissionEligible,
      platform_product_id: platformProductId ?? null,
      attributes: serializeItemAttributes(selectedAttributes),
      fulfillment: serializeProductFulfillment(item.fulfillment),
      metadata: {
        category: item.category,
        currency: item.currency,
        stock_status: item.inventory.status,
        sku_code: skuRow?.sku_code ?? null,
        source: item.source,
        billing_cycle: item.billingCycle,
        billing_interval: item.billingInterval,
        platform_product_id: platformProductId,
        platform_product_code: platformProductCode,
        commercial_flow_type: commercialFlowType,
        revenue_owner_type: revenueOwnerType,
        commission_policy_type: commissionPolicyType,
        commission_eligible: commissionEligible,
        platform_product_commission_percentage: platformCommissionPercentage,
        platform_product_commission_release_days: platformCommissionReleaseDays,
        platform_product_agent_prompt: platformAgentPrompt,
      },
    })
    .select(salesCatalogOrderItemSelect)
    .single<SalesCatalogOrderItemRow>();

  if (orderItemError || !orderItemRow) {
    throw new Error(orderItemError?.message ?? "Pedido criado, mas nao foi possivel salvar o item.");
  }

  const updatedItems = await maybeDeductSalesCatalogOrderInventory({
    client: input.client,
    companyId: company.id,
    userId: input.userId,
    order: orderRow,
    items: [orderItemRow],
  });

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog_order",
    source_id: orderRow.id,
    event_type: "sales_catalog.order_created",
    title: `Pedido criado: ${customerName ?? customerPhone}`,
    summary: `${item.title} registrado para acompanhamento no WhatsApp.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "whatsapp_agent", "lead_tracking"],
    payload: {
      order_id: orderRow.id,
      product_id: item.id,
      tag: item.tag,
      quantity,
      total,
      status: orderStatus,
      payment_status: paymentStatus,
      fulfillment_status: fulfillmentStatus,
      created_by: input.userId,
    },
  });

  return { order: mapSalesCatalogOrder(orderRow, [orderItemRow]), items: updatedItems };
}

type SalesCatalogCartCheckoutItem = {
  catalogItemId: string | null;
  name: string;
  note: string | null;
  quantity: number;
  source: "catalog" | "manual";
  unitPriceCents: number;
};

async function createSalesCatalogCartCheckout(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const customerName = normalizeOptionalText(readFormString(input.body?.customerName), 140);
  const customerPhone = normalizeOptionalText(readFormString(input.body?.customerPhone), 40);
  const customerEmail = normalizeOptionalText(readFormString(input.body?.customerEmail), 160);
  const leadId = normalizeUuid(readFormString(input.body?.leadId));
  const conversationId = normalizeUuid(readFormString(input.body?.conversationId));
  const agentId = normalizeUuid(readFormString(input.body?.agentId ?? input.body?.agent_id));
  const customerDocument = normalizeOptionalText(readFormString(input.body?.customerDocument), 40);
  const destinationCep = normalizeSalesCatalogCep(readFormString(input.body?.destinationCep));
  const destinationAddress = normalizeOptionalText(readFormString(input.body?.destinationAddress), 300);
  const agentNotes = normalizeOptionalText(readFormString(input.body?.agentNotes), 1200);
  const internalNotes = normalizeOptionalText(readFormString(input.body?.internalNotes), 1200);
  const cartItems = readSalesCatalogCartCheckoutItems(input.body?.items);

  if (!customerName && !customerPhone) {
    throw new Error("Informe ao menos o nome ou telefone do lead.");
  }

  if (cartItems.length === 0) {
    throw new Error("Adicione ao menos um item na sacola para gerar checkout.");
  }

  const catalogItemIds = Array.from(new Set(
    cartItems
      .map((item) => item.catalogItemId)
      .filter((item): item is string => Boolean(item)),
  ));
  const catalogRowsById = new Map<string, SalesCatalogMemoryRow>();

  if (catalogItemIds.length > 0) {
    const { data: catalogRows, error: catalogError } = await input.client
      .from("intelligence_memory")
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("memory_type", "sales_catalog_item")
      .in("id", catalogItemIds)
      .returns<SalesCatalogMemoryRow[]>();

    if (catalogError) {
      throw new Error(`Nao foi possivel carregar os produtos da sacola: ${catalogError.message}`);
    }

    for (const row of catalogRows ?? []) {
      catalogRowsById.set(row.id, row);
    }

    const missingCatalogItems = catalogItemIds.filter((itemId) => !catalogRowsById.has(itemId));
    if (missingCatalogItems.length > 0) {
      throw new Error("Um ou mais produtos da sacola nao existem mais no catalogo desta empresa.");
    }
  }

  const resolvedItems = cartItems.map((cartItem) => {
    const catalogRow = cartItem.catalogItemId ? catalogRowsById.get(cartItem.catalogItemId) ?? null : null;

    if (!catalogRow) {
      const unitPriceCents = cartItem.unitPriceCents;
      const totalCents = unitPriceCents * cartItem.quantity;

      return {
        attributes: [] as SalesCatalogItemAttribute[],
        catalogItemId: null as string | null,
        category: null as string | null,
        commercialFlowType: "client_direct",
        commissionEligible: false,
        commissionPolicyType: "none",
        currency: "BRL",
        fulfillment: emptySalesCatalogProductFulfillment(),
        itemSource: "manual",
        metadata: {
          cart_item_source: "manual",
          cart_item_note: cartItem.note,
        } satisfies JsonRecord,
        platformAgentPrompt: null as string | null,
        platformCommissionPercentage: null as number | null,
        platformCommissionReleaseDays: null as number | null,
        platformProductCode: null as string | null,
        platformProductId: null as string | null,
        productOriginType: "client",
        quantity: cartItem.quantity,
        revenueOwnerType: "client",
        salePriceCents: unitPriceCents,
        skuCode: null as string | null,
        skuId: null as string | null,
        tag: null as string | null,
        title: cartItem.name,
        totalCents,
        unitPriceCents,
      };
    }

    const itemMetadata = readRecord(catalogRow.metadata) ?? {};
    const item = mapSalesCatalogItem(catalogRow);

    if (item.status === "archived") {
      throw new Error(`O produto "${item.title}" esta arquivado e nao pode virar pedido.`);
    }

    if (item.inventory.status === "out_of_stock" && !item.inventory.allowBackorder) {
      throw new Error(`O produto "${item.title}" esta esgotado. Ative encomenda ou escolha outro item.`);
    }

    const platformProductId = readFormString(itemMetadata.platform_product_id);
    const platformProductCode = readFormString(itemMetadata.platform_product_code);
    const platformCommissionPercentage = normalizeNumber(itemMetadata.platform_product_commission_percentage);
    const platformCommissionReleaseDays = normalizeNumber(itemMetadata.platform_product_commission_release_days);
    const platformAgentPrompt = readFormString(itemMetadata.platform_product_agent_prompt);
    const commercialFlowType = normalizeCommercialFlowType(readFormString(itemMetadata.commercial_flow_type)
      ?? (platformProductId ? "connectyhub_resale" : "client_direct"));
    const revenueOwnerType = normalizeRevenueOwnerType(readFormString(itemMetadata.revenue_owner_type)
      ?? (platformProductId ? "connectyhub" : "client"));
    const commissionPolicyType = normalizeCommissionPolicyType(readFormString(itemMetadata.commission_policy_type)
      ?? (platformProductId ? "percentage" : "none"));
    const commissionEligible = readBoolean(itemMetadata.commission_eligible)
      ?? Boolean(platformProductId && commissionPolicyType !== "none" && platformCommissionPercentage && platformCommissionPercentage > 0);
    const unitPriceCents = getSalesCatalogCheckoutItemPriceCents(item) || cartItem.unitPriceCents;
    const totalCents = unitPriceCents * cartItem.quantity;

    return {
      attributes: item.attributes,
      catalogItemId: item.id,
      category: item.category,
      commercialFlowType,
      commissionEligible,
      commissionPolicyType,
      currency: item.currency,
      fulfillment: item.fulfillment,
      itemSource: item.source,
      metadata: {
        cart_item_source: "catalog",
        cart_item_note: cartItem.note,
        category: item.category,
        currency: item.currency,
        source: item.source,
        stock_status: item.inventory.status,
        platform_product_id: platformProductId,
        platform_product_code: platformProductCode,
        commercial_flow_type: commercialFlowType,
        revenue_owner_type: revenueOwnerType,
        commission_policy_type: commissionPolicyType,
        commission_eligible: commissionEligible,
        platform_product_commission_percentage: platformCommissionPercentage,
        platform_product_commission_release_days: platformCommissionReleaseDays,
        platform_product_agent_prompt: platformAgentPrompt,
      } satisfies JsonRecord,
      platformAgentPrompt,
      platformCommissionPercentage,
      platformCommissionReleaseDays,
      platformProductCode,
      platformProductId,
      productOriginType: platformProductId ? "connectyhub" : "client",
      quantity: cartItem.quantity,
      revenueOwnerType,
      salePriceCents: unitPriceCents,
      skuCode: null as string | null,
      skuId: null as string | null,
      tag: item.tag,
      title: item.title,
      totalCents,
      unitPriceCents,
    };
  });
  const hasPlatformItems = resolvedItems.some((item) => Boolean(item.platformProductId));
  const hasClientItems = resolvedItems.some((item) => !item.platformProductId);

  if (hasPlatformItems && hasClientItems) {
    throw new Error("Nao misture produtos proprios e produtos ConnectyHub no mesmo checkout. Crie pedidos separados para garantir o recebimento correto.");
  }

  const subtotalCents = resolvedItems.reduce((total, item) => total + item.totalCents, 0);
  const subtotal = formatSalesCatalogMoneyCents(subtotalCents);
  const total = subtotal;
  const now = new Date().toISOString();
  const orderCommercialFlowType = hasPlatformItems ? resolvedItems[0]?.commercialFlowType ?? "connectyhub_resale" : "client_direct";
  const orderRevenueOwnerType = hasPlatformItems ? resolvedItems[0]?.revenueOwnerType ?? "connectyhub" : "client";
  const orderCommissionEligible = resolvedItems.some((item) => item.commissionEligible);

  const { data: orderRow, error: orderError } = await input.client
    .from("sales_catalog_orders")
    .insert({
      organization_id: company.id,
      lead_id: leadId,
      conversation_id: conversationId,
      source: "attendance_panel",
      status: "pending_payment",
      payment_status: "pending",
      fulfillment_status: "pending",
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_document: customerDocument,
      customer_email: customerEmail,
      destination_cep: destinationCep,
      destination_address: destinationAddress,
      subtotal,
      discount_total: null,
      shipping_total: null,
      total,
      payment_method: null,
      shipping_method: null,
      agent_notes: agentNotes,
      internal_notes: internalNotes,
      commercial_flow_type: orderCommercialFlowType,
      revenue_owner_type: orderRevenueOwnerType,
      contains_platform_products: hasPlatformItems,
      commission_eligible: orderCommissionEligible,
      metadata: {
        created_from: "attendance_sales_bag",
        source: "attendance_panel",
        cart_item_count: resolvedItems.length,
        cart_total_cents: subtotalCents,
        currency: "BRL",
        commercial_flow_type: orderCommercialFlowType,
        revenue_owner_type: orderRevenueOwnerType,
        commission_eligible: orderCommissionEligible,
        platform_product_marketplace: hasPlatformItems,
        agent_id: agentId,
        lead_name: customerName,
        lead_phone: customerPhone,
      },
      created_by: input.userId,
      created_at: now,
      updated_at: now,
    })
    .select(salesCatalogOrderSelect)
    .single<SalesCatalogOrderRow>();

  if (orderError || !orderRow) {
    throw new Error(orderError?.message ?? "Nao foi possivel criar o pedido da sacola.");
  }

  const itemPayload = resolvedItems.map((item) => ({
    order_id: orderRow.id,
    organization_id: company.id,
    catalog_item_id: item.catalogItemId,
    sku_id: item.skuId,
    sku_code: item.skuCode,
    title: item.title,
    tag: item.tag,
    quantity: item.quantity,
    unit_price: formatSalesCatalogMoneyCents(item.unitPriceCents),
    sale_price: formatSalesCatalogMoneyCents(item.salePriceCents),
    total: formatSalesCatalogMoneyCents(item.totalCents),
    product_origin_type: item.productOriginType,
    commercial_flow_type: item.commercialFlowType,
    revenue_owner_type: item.revenueOwnerType,
    commission_eligible: item.commissionEligible,
    platform_product_id: item.platformProductId ?? null,
    attributes: serializeItemAttributes(item.attributes),
    fulfillment: serializeProductFulfillment(item.fulfillment),
    metadata: item.metadata,
  }));
  const { data: orderItemRows, error: orderItemsError } = await input.client
    .from("sales_catalog_order_items")
    .insert(itemPayload)
    .select(salesCatalogOrderItemSelect)
    .returns<SalesCatalogOrderItemRow[]>();

  if (orderItemsError || !orderItemRows?.length) {
    throw new Error(orderItemsError?.message ?? "Pedido criado, mas nao foi possivel salvar os itens da sacola.");
  }

  const paymentResult = await createSalesCatalogPixPaymentSession({
    client: input.client,
    organizationId: company.id,
    orderId: orderRow.id,
    amount: total,
    payerEmail: customerEmail,
    source: "dashboard",
    actorId: input.userId,
  });
  const leadAwareCheckoutUrl = appendLeadTrackingParams(paymentResult.trackingUrl ?? paymentResult.checkoutUrl, {
    leadId,
    leadPhone: customerPhone,
    conversationId,
    agentId,
  });
  const { data: refreshedOrder, error: refreshedOrderError } = await input.client
    .from("sales_catalog_orders")
    .select(salesCatalogOrderSelect)
    .eq("id", orderRow.id)
    .eq("organization_id", company.id)
    .maybeSingle<SalesCatalogOrderRow>();

  if (refreshedOrderError) {
    throw new Error(`Checkout criado, mas nao foi possivel recarregar o pedido: ${refreshedOrderError.message}`);
  }

  const { data: refreshedItems, error: refreshedItemsError } = await input.client
    .from("sales_catalog_order_items")
    .select(salesCatalogOrderItemSelect)
    .eq("order_id", orderRow.id)
    .order("created_at", { ascending: true })
    .returns<SalesCatalogOrderItemRow[]>();

  if (refreshedItemsError) {
    throw new Error(`Checkout criado, mas nao foi possivel recarregar os itens: ${refreshedItemsError.message}`);
  }

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog_order",
    source_id: orderRow.id,
    event_type: "sales_catalog.checkout_created_from_attendance",
    title: "Checkout criado pela sacola do atendimento",
    summary: `${resolvedItems.length} item(ns) enviados para pagamento pelo painel de atendimento.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "payment", "attendance_panel", "lead_tracking"],
    payload: {
      order_id: orderRow.id,
      checkout_url: paymentResult.checkoutUrl,
      tracking_url: leadAwareCheckoutUrl,
      tracking_link_id: paymentResult.trackingLinkId ?? null,
      tracking_tag: paymentResult.trackingTag ?? null,
      total,
      item_count: resolvedItems.length,
      items: resolvedItems.map((item) => ({
        catalog_item_id: item.catalogItemId,
        title: item.title,
        quantity: item.quantity,
        unit_price: formatSalesCatalogMoneyCents(item.unitPriceCents),
        sale_price: formatSalesCatalogMoneyCents(item.salePriceCents),
        total: formatSalesCatalogMoneyCents(item.totalCents),
        product_origin_type: item.productOriginType,
        commercial_flow_type: item.commercialFlowType,
        revenue_owner_type: item.revenueOwnerType,
        commission_eligible: item.commissionEligible,
        platform_product_id: item.platformProductId,
      })),
      lead_id: leadId,
      conversation_id: conversationId,
      agent_id: agentId,
      lead_phone: customerPhone,
      created_by: input.userId,
    },
  });

  return {
    order: mapSalesCatalogOrder(refreshedOrder ?? orderRow, refreshedItems ?? orderItemRows),
    session: paymentResult.session,
    checkoutUrl: paymentResult.checkoutUrl,
    trackingUrl: leadAwareCheckoutUrl,
  };
}

async function updateSalesCatalogOrderStatus(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  body: JsonRecord | null;
}) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client: input.client,
  });
  const orderId = readFormString(input.body?.orderId);

  if (!orderId) {
    throw new Error("Informe o pedido que deseja atualizar.");
  }

  const patch: JsonRecord = {};
  const status = normalizeNullableSalesCatalogOrderStatus(readFormString(input.body?.status));
  const paymentStatus = normalizeNullableSalesCatalogPaymentStatus(readFormString(input.body?.paymentStatus));
  const fulfillmentStatus = normalizeNullableSalesCatalogFulfillmentStatus(readFormString(input.body?.fulfillmentStatus));
  const internalNotes = normalizeOptionalText(readFormString(input.body?.internalNotes), 1200);

  if (status) patch.status = status;
  if (paymentStatus) patch.payment_status = paymentStatus;
  if (fulfillmentStatus) patch.fulfillment_status = fulfillmentStatus;
  if (internalNotes) patch.internal_notes = internalNotes;

  if (Object.keys(patch).length === 0) {
    throw new Error("Informe uma mudanca de status para atualizar o pedido.");
  }

  const { data: orderRow, error: orderError } = await input.client
    .from("sales_catalog_orders")
    .update(patch)
    .eq("id", orderId)
    .eq("organization_id", company.id)
    .select(salesCatalogOrderSelect)
    .maybeSingle<SalesCatalogOrderRow>();

  if (orderError) {
    throw new Error(`Nao foi possivel atualizar o pedido: ${orderError.message}`);
  }

  if (!orderRow) {
    throw new Error("Pedido nao encontrado para esta empresa.");
  }

  const { data: itemRows, error: itemsError } = await input.client
    .from("sales_catalog_order_items")
    .select(salesCatalogOrderItemSelect)
    .eq("order_id", orderRow.id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    throw new Error(`Pedido atualizado, mas nao foi possivel recarregar os itens: ${itemsError.message}`);
  }

  const orderItems = (itemRows ?? []) as SalesCatalogOrderItemRow[];

  const deductedItems = await maybeDeductSalesCatalogOrderInventory({
    client: input.client,
    companyId: company.id,
    userId: input.userId,
    order: orderRow,
    items: orderItems,
  });
  const restoredItems = await maybeRestoreSalesCatalogOrderInventory({
    client: input.client,
    companyId: company.id,
    userId: input.userId,
    order: orderRow,
    items: orderItems,
  });
  const updatedItems = mergeSalesCatalogUpdatedItems(deductedItems, restoredItems);

  await maybeScheduleSalesCatalogPostSaleFollowUp({
    client: input.client,
    companyId: company.id,
    userId: input.userId,
    order: orderRow,
  });

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: company.id,
    source_type: "sales_catalog_order",
    source_id: orderRow.id,
    event_type: "sales_catalog.order_status_updated",
    title: "Status do pedido atualizado",
    summary: `Pedido ${orderRow.id.slice(0, 8)} atualizado no catalogo de vendas.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "whatsapp_agent", "lead_tracking"],
    payload: {
      order_id: orderRow.id,
      patch,
      updated_by: input.userId,
    },
  });

  return { order: mapSalesCatalogOrder(orderRow, orderItems), items: updatedItems };
}

async function maybeDeductSalesCatalogOrderInventory(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  order: SalesCatalogOrderRow;
  items: SalesCatalogOrderItemRow[];
}) {
  const orderMetadata = readRecord(input.order.metadata) ?? {};
  const alreadyDeductedAt = readFormString(orderMetadata.inventory_deducted_at);
  const shouldDeduct = input.order.status === "paid" || input.order.payment_status === "confirmed";

  if (alreadyDeductedAt || !shouldDeduct || input.order.status === "cancelled") return [];

  const quantitiesBySku = new Map<string, number>();
  const quantitiesByProduct = new Map<string, number>();

  for (const item of input.items) {
    const quantity = normalizeNullableInteger(item.quantity, 1, 100000) ?? 1;
    const skuId = readFormString(item.sku_id);
    const productId = readFormString(item.catalog_item_id);

    if (skuId) {
      quantitiesBySku.set(skuId, (quantitiesBySku.get(skuId) ?? 0) + quantity);
    } else if (productId) {
      quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) ?? 0) + quantity);
    }
  }

  const skuIds = Array.from(quantitiesBySku.keys());
  const productIds = Array.from(quantitiesByProduct.keys());
  if (skuIds.length === 0 && productIds.length === 0) return [];

  const [skuResult, productResult] = await Promise.all([
    skuIds.length > 0
      ? input.client
          .from("sales_catalog_skus")
          .select("id, organization_id, catalog_item_id, sku_code, title, attributes, price, sale_price, currency, stock_status, stock_quantity, low_stock_threshold, weight_grams, dimensions, media_ids, status, metadata, created_at, updated_at")
          .eq("organization_id", input.companyId)
          .in("id", skuIds)
          .returns<SalesCatalogSkuRow[]>()
      : Promise.resolve({ data: [] as SalesCatalogSkuRow[], error: null }),
    productIds.length > 0
      ? input.client
          .from("intelligence_memory")
          .select("id, organization_id, title, content, metadata, created_at, updated_at")
          .eq("scope", "organization")
          .eq("organization_id", input.companyId)
          .eq("memory_type", "sales_catalog_item")
          .in("id", productIds)
          .returns<SalesCatalogMemoryRow[]>()
      : Promise.resolve({ data: [] as SalesCatalogMemoryRow[], error: null }),
  ]);

  if (skuResult.error || productResult.error) return [];

  const now = new Date().toISOString();
  const updatedItems: Array<ReturnType<typeof mapSalesCatalogItem>> = [];
  const deductions: JsonRecord[] = [];

  for (const skuRow of skuResult.data ?? []) {
    const deductedQuantity = quantitiesBySku.get(skuRow.id);
    if (!deductedQuantity || skuRow.stock_quantity === null) continue;

    const nextQuantity = Math.max(0, skuRow.stock_quantity - deductedQuantity);
    const nextStatus = resolveNextStockStatus(nextQuantity, skuRow.stock_status);
    const metadata = readRecord(skuRow.metadata) ?? {};

    await input.client
      .from("sales_catalog_skus")
      .update({
        stock_quantity: nextQuantity,
        stock_status: nextStatus,
        metadata: {
          ...metadata,
          inventory_updated_at: now,
          inventory_updated_from_order_id: input.order.id,
          inventory_update_reason: "order_confirmed",
        },
      })
      .eq("id", skuRow.id)
      .eq("organization_id", input.companyId);

    deductions.push({
      kind: "sku",
      sku_id: skuRow.id,
      product_id: skuRow.catalog_item_id,
      sku_code: skuRow.sku_code,
      title: skuRow.title,
      deducted_quantity: deductedQuantity,
      previous_quantity: skuRow.stock_quantity,
      next_quantity: nextQuantity,
      next_status: nextStatus,
    });
  }

  for (const productRow of productResult.data ?? []) {
    const deductedQuantity = quantitiesByProduct.get(productRow.id);
    if (!deductedQuantity) continue;

    const metadata = readRecord(productRow.metadata) ?? {};
    const inventory = readProductInventoryMetadata(metadata.inventory);

    if (inventory.quantity === null) continue;

    const nextQuantity = Math.max(0, inventory.quantity - deductedQuantity);
    const nextInventory: SalesCatalogProductInventory = {
      ...inventory,
      quantity: nextQuantity,
      status: nextQuantity <= 0 ? (inventory.allowBackorder ? "on_backorder" : "out_of_stock") : "in_stock",
    };
    const refreshedItem = await persistSalesCatalogProductInventory({
      client: input.client,
      companyId: input.companyId,
      orderId: input.order.id,
      productRow,
      inventory: nextInventory,
      now,
      reason: "order_confirmed",
    });

    if (!refreshedItem) continue;

    deductions.push({
      kind: "product",
      product_id: productRow.id,
      title: refreshedItem.title,
      deducted_quantity: deductedQuantity,
      previous_quantity: inventory.quantity,
      next_quantity: nextQuantity,
      next_status: nextInventory.status,
    });
    updatedItems.push(refreshedItem);
  }

  if (deductions.length === 0) return [];

  await input.client
    .from("sales_catalog_orders")
    .update({
      metadata: {
        ...orderMetadata,
        inventory_deducted_at: now,
        inventory_deducted_by: input.userId,
        inventory_deducted_items: deductions,
      },
    })
    .eq("id", input.order.id)
    .eq("organization_id", input.companyId);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.companyId,
    source_type: "sales_catalog_order",
    source_id: input.order.id,
    event_type: "sales_catalog.inventory_deducted",
    title: "Estoque baixado por pedido confirmado",
    summary: `${deductions.length} produto(s) atualizado(s) apos confirmacao de pagamento.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "sales_catalog_inventory", "whatsapp_agent"],
    payload: {
      order_id: input.order.id,
      deducted_by: input.userId,
      items: deductions,
    },
  });

  return updatedItems;
}

async function maybeRestoreSalesCatalogOrderInventory(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  order: SalesCatalogOrderRow;
  items: SalesCatalogOrderItemRow[];
}) {
  const orderMetadata = readRecord(input.order.metadata) ?? {};
  const alreadyDeductedAt = readFormString(orderMetadata.inventory_deducted_at);
  const alreadyRestoredAt = readFormString(orderMetadata.inventory_restored_at);
  const shouldRestore = input.order.status === "cancelled"
    || input.order.payment_status === "failed"
    || (input.order.payment_status === "refunded" && input.order.fulfillment_status !== "fulfilled");

  if (!alreadyDeductedAt || alreadyRestoredAt || !shouldRestore) return [];

  const { quantitiesByProduct, quantitiesBySku } = readInventoryQuantitiesFromDeductions(orderMetadata.inventory_deducted_items);

  if (quantitiesByProduct.size === 0 && quantitiesBySku.size === 0) {
    for (const item of input.items) {
      const quantity = normalizeNullableInteger(item.quantity, 1, 100000) ?? 1;
      const skuId = readFormString(item.sku_id);
      const productId = readFormString(item.catalog_item_id);

      if (skuId) {
        quantitiesBySku.set(skuId, (quantitiesBySku.get(skuId) ?? 0) + quantity);
      } else if (productId) {
        quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) ?? 0) + quantity);
      }
    }
  }

  const skuIds = Array.from(quantitiesBySku.keys());
  const productIds = Array.from(quantitiesByProduct.keys());
  if (skuIds.length === 0 && productIds.length === 0) return [];

  const [skuResult, productResult] = await Promise.all([
    skuIds.length > 0
      ? input.client
          .from("sales_catalog_skus")
          .select("id, organization_id, catalog_item_id, sku_code, title, attributes, price, sale_price, currency, stock_status, stock_quantity, low_stock_threshold, weight_grams, dimensions, media_ids, status, metadata, created_at, updated_at")
          .eq("organization_id", input.companyId)
          .in("id", skuIds)
          .returns<SalesCatalogSkuRow[]>()
      : Promise.resolve({ data: [] as SalesCatalogSkuRow[], error: null }),
    productIds.length > 0
      ? input.client
          .from("intelligence_memory")
          .select("id, organization_id, title, content, metadata, created_at, updated_at")
          .eq("scope", "organization")
          .eq("organization_id", input.companyId)
          .eq("memory_type", "sales_catalog_item")
          .in("id", productIds)
          .returns<SalesCatalogMemoryRow[]>()
      : Promise.resolve({ data: [] as SalesCatalogMemoryRow[], error: null }),
  ]);

  if (skuResult.error || productResult.error) return [];

  const now = new Date().toISOString();
  const updatedItems: Array<ReturnType<typeof mapSalesCatalogItem>> = [];
  const restorations: JsonRecord[] = [];

  for (const skuRow of skuResult.data ?? []) {
    const restoredQuantity = quantitiesBySku.get(skuRow.id);
    if (!restoredQuantity || skuRow.stock_quantity === null) continue;

    const nextQuantity = Math.min(1000000, skuRow.stock_quantity + restoredQuantity);
    const nextStatus = resolveNextStockStatus(nextQuantity, skuRow.stock_status);
    const metadata = readRecord(skuRow.metadata) ?? {};

    await input.client
      .from("sales_catalog_skus")
      .update({
        stock_quantity: nextQuantity,
        stock_status: nextStatus,
        metadata: {
          ...metadata,
          inventory_updated_at: now,
          inventory_updated_from_order_id: input.order.id,
          inventory_update_reason: "order_restored",
        },
      })
      .eq("id", skuRow.id)
      .eq("organization_id", input.companyId);

    restorations.push({
      kind: "sku",
      sku_id: skuRow.id,
      product_id: skuRow.catalog_item_id,
      sku_code: skuRow.sku_code,
      title: skuRow.title,
      restored_quantity: restoredQuantity,
      previous_quantity: skuRow.stock_quantity,
      next_quantity: nextQuantity,
      next_status: nextStatus,
    });
  }

  for (const productRow of productResult.data ?? []) {
    const restoredQuantity = quantitiesByProduct.get(productRow.id);
    if (!restoredQuantity) continue;

    const metadata = readRecord(productRow.metadata) ?? {};
    const inventory = readProductInventoryMetadata(metadata.inventory);

    if (inventory.quantity === null) continue;

    const nextQuantity = Math.min(1000000, inventory.quantity + restoredQuantity);
    const nextInventory: SalesCatalogProductInventory = {
      ...inventory,
      quantity: nextQuantity,
      status: nextQuantity > 0 ? "in_stock" : (inventory.allowBackorder ? "on_backorder" : "out_of_stock"),
    };
    const refreshedItem = await persistSalesCatalogProductInventory({
      client: input.client,
      companyId: input.companyId,
      orderId: input.order.id,
      productRow,
      inventory: nextInventory,
      now,
      reason: "order_restored",
    });

    if (!refreshedItem) continue;

    restorations.push({
      kind: "product",
      product_id: productRow.id,
      title: refreshedItem.title,
      restored_quantity: restoredQuantity,
      previous_quantity: inventory.quantity,
      next_quantity: nextQuantity,
      next_status: nextInventory.status,
    });
    updatedItems.push(refreshedItem);
  }

  if (restorations.length === 0) return [];

  await input.client
    .from("sales_catalog_orders")
    .update({
      metadata: {
        ...orderMetadata,
        inventory_restored_at: now,
        inventory_restored_by: input.userId,
        inventory_restored_items: restorations,
      },
    })
    .eq("id", input.order.id)
    .eq("organization_id", input.companyId);

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.companyId,
    source_type: "sales_catalog_order",
    source_id: input.order.id,
    event_type: "sales_catalog.inventory_restored",
    title: "Estoque devolvido por pedido cancelado",
    summary: `${restorations.length} produto(s) devolvido(s) ao estoque.`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_order", "sales_catalog_inventory", "whatsapp_agent"],
    payload: {
      order_id: input.order.id,
      restored_by: input.userId,
      items: restorations,
    },
  });

  return updatedItems;
}

async function persistSalesCatalogProductInventory(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  orderId: string;
  productRow: SalesCatalogMemoryRow;
  inventory: SalesCatalogProductInventory;
  now: string;
  reason: "order_confirmed" | "order_restored";
}) {
  const metadata = readRecord(input.productRow.metadata) ?? {};
  const nextMetadata = {
    ...metadata,
    inventory: serializeProductInventory(input.inventory),
    inventory_updated_at: input.now,
    inventory_updated_from_order_id: input.orderId,
    inventory_update_reason: input.reason,
  };
  const refreshedItem = mapSalesCatalogItem({ ...input.productRow, metadata: nextMetadata });
  const content = buildSalesCatalogContent({
    title: refreshedItem.title,
    description: refreshedItem.description,
    category: refreshedItem.category,
    price: refreshedItem.price,
    currency: refreshedItem.currency,
    media: refreshedItem.media,
    attributes: refreshedItem.attributes,
    inventory: refreshedItem.inventory,
    offer: refreshedItem.offer,
    fulfillment: refreshedItem.fulfillment,
    shipping: refreshedItem.shipping,
    pageContent: refreshedItem.pageContent,
  });
  const { error: updateError } = await input.client
    .from("intelligence_memory")
    .update({
      content,
      metadata: nextMetadata,
      updated_at: input.now,
    })
    .eq("id", input.productRow.id)
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "sales_catalog_item");

  return updateError ? null : refreshedItem;
}

function mergeSalesCatalogUpdatedItems(...itemGroups: Array<Array<ReturnType<typeof mapSalesCatalogItem>>>) {
  const byId = new Map<string, ReturnType<typeof mapSalesCatalogItem>>();

  for (const group of itemGroups) {
    for (const item of group) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}

function readInventoryQuantitiesFromDeductions(value: unknown) {
  const quantitiesByProduct = new Map<string, number>();
  const quantitiesBySku = new Map<string, number>();
  const source = Array.isArray(value) ? value : [];

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const skuId = readFormString(record.sku_id);
    const productId = readFormString(record.product_id);
    const quantity = normalizeNullableInteger(record.deducted_quantity, 1, 100000);
    if (!quantity) continue;

    if (skuId) {
      quantitiesBySku.set(skuId, (quantitiesBySku.get(skuId) ?? 0) + quantity);
    } else if (productId) {
      quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) ?? 0) + quantity);
    }
  }

  return { quantitiesByProduct, quantitiesBySku };
}

function resolveNextStockStatus(nextQuantity: number, currentStatus: string | null): SalesCatalogStockStatus {
  if (nextQuantity > 0) return "in_stock";
  return currentStatus === "on_backorder" ? "on_backorder" : "out_of_stock";
}

async function maybeScheduleSalesCatalogPostSaleFollowUp(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  order: SalesCatalogOrderRow;
}) {
  const shouldSchedule = input.order.status === "delivered" || input.order.fulfillment_status === "fulfilled";
  if (!shouldSchedule || !input.order.lead_id || !input.order.conversation_id) return;

  const initialMetadata = readRecord(input.order.metadata) ?? {};
  if (readFormString(initialMetadata.post_sale_followup_scheduled_at)) return;

  const agentId = readFormString(initialMetadata.agent_id);
  if (!agentId) return;

  const settings = await getOrganizationSalesCatalogSettings(input.client, input.companyId).catch(() => null);
  const delayDays = settings?.orderPolicy.followUpDays;
  if (!delayDays || delayDays <= 0) return;

  const { data: conversation } = await input.client
    .from("conversations")
    .select("whatsapp_instance_id")
    .eq("id", input.order.conversation_id)
    .eq("organization_id", input.companyId)
    .maybeSingle<{ whatsapp_instance_id: string | null }>();

  if (!conversation?.whatsapp_instance_id) return;

  const { data: latestOrder } = await input.client
    .from("sales_catalog_orders")
    .select("metadata")
    .eq("id", input.order.id)
    .eq("organization_id", input.companyId)
    .maybeSingle<{ metadata: JsonRecord | null }>();
  const latestMetadata = readRecord(latestOrder?.metadata) ?? initialMetadata;

  if (readFormString(latestMetadata.post_sale_followup_scheduled_at)) return;

  const now = new Date().toISOString();

  try {
    const { enqueueWhatsappFollowUp } = await import("@/lib/whatsapp/proactive-followup");
    await enqueueWhatsappFollowUp({
      organizationId: input.companyId,
      whatsappInstanceId: conversation.whatsapp_instance_id,
      conversationId: input.order.conversation_id,
      leadId: input.order.lead_id,
      agentId,
      agentRunId: readFormString(latestMetadata.agent_run_id) ?? `sales_catalog_order_${input.order.id}`,
      salesCatalogOrderId: input.order.id,
      salesCatalogFollowUpKind: "post_sale",
    }, delayDays * 24 * 60);

    await input.client
      .from("sales_catalog_orders")
      .update({
        metadata: {
          ...latestMetadata,
          post_sale_followup_scheduled_at: now,
          post_sale_followup_scheduled_by: input.userId,
          post_sale_followup_delay_days: delayDays,
        },
      })
      .eq("id", input.order.id)
      .eq("organization_id", input.companyId);

    await input.client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: input.companyId,
      source_type: "sales_catalog_order",
      source_id: input.order.id,
      producer_agent_id: agentId,
      event_type: "sales_catalog.post_sale_followup_scheduled",
      title: "Pos-venda agendado",
      summary: `Enviar acompanhamento em ${delayDays} dia(s) se o lead nao retomar a conversa.`,
      confidence: 0.74,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_order", "whatsapp", "post_sale", "follow_up"],
      payload: {
        order_id: input.order.id,
        lead_id: input.order.lead_id,
        conversation_id: input.order.conversation_id,
        whatsapp_instance_id: conversation.whatsapp_instance_id,
        agent_id: agentId,
        delay_days: delayDays,
        scheduled_by: input.userId,
      },
    });
  } catch {
    return;
  }
}

function readProductInventoryMetadata(value: unknown): SalesCatalogProductInventory {
  const fallback = emptySalesCatalogProductInventory();
  const record = readRecord(value);

  if (!record) return fallback;

  return {
    status: normalizeStockStatus(readFormString(record.status)),
    quantity: normalizeNullableInteger(record.quantity, 0, 1000000),
    lowStockThreshold: normalizeNullableInteger(record.lowStockThreshold ?? record.low_stock_threshold, 0, 1000000),
    allowBackorder: readBoolean(record.allowBackorder ?? record.allow_backorder)
      ?? readFormBoolean(record.allowBackorder ?? record.allow_backorder)
      ?? fallback.allowBackorder,
    notes: normalizeOptionalText(readFormString(record.notes), 240),
  };
}

export async function DELETE(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { companyId?: unknown; itemId?: unknown } | null;
  const requestedCompanyId = readFormString(body?.companyId);
  const itemId = readFormString(body?.itemId);

  if (!itemId) {
    return NextResponse.json({ error: "Informe a empresa e o produto para excluir." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId,
      missingMessage: "Informe a empresa e o produto para excluir.",
    });
    const company = await requireClientCompanyAccess({ userId: workspace.user.id, companyId, client });
    await assertSalesCatalogManualAccess({ organizationId: company.id, client });

    const { data: existingItem, error: loadError } = await client
      .from("intelligence_memory")
      .select("id, title, metadata")
      .eq("id", itemId)
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("memory_type", "sales_catalog_item")
      .maybeSingle<{ id: string; title: string; metadata: JsonRecord | null }>();

    if (loadError) {
      return NextResponse.json({ error: `Nao foi possivel excluir: ${loadError.message}` }, { status: 500 });
    }

    if (!existingItem) {
      return NextResponse.json({ error: "Produto nao encontrado para esta empresa." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const metadata = readRecord(existingItem.metadata) ?? {};
    const media = readSalesCatalogMediaMetadata(metadata.media);
    const linkedButtonId = readFormString(metadata.link_button_id) ?? readFormString(metadata.external_link_button_id);
    const archivedMetadata: JsonRecord = {
      ...metadata,
      active: false,
      archived_at: now,
      deleted_at: now,
      deleted_by: workspace.user.id,
      external_link_button_id: null,
      external_link_button_label: null,
      external_link_button_tag: null,
      external_link_button_tracking_url: null,
      link_button_id: null,
      link_button_label: null,
      link_button_tag: null,
      link_button_tracking_url: null,
      removed_from_runtime_at: now,
      status: "archived",
    };

    const archiveResult = await client
      .from("intelligence_memory")
      .update({
        metadata: archivedMetadata,
        updated_at: now,
      })
      .eq("id", itemId)
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("memory_type", "sales_catalog_item")
      .select("id, title, metadata")
      .maybeSingle<{ id: string; title: string; metadata: JsonRecord | null }>();
    let data = archiveResult.data;
    const error = archiveResult.error;

    if (error) {
      return NextResponse.json({ error: `Nao foi possivel excluir: ${error.message}` }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Produto nao encontrado para esta empresa." }, { status: 404 });
    }

    const { error: skuArchiveError } = await client
      .from("sales_catalog_skus")
      .update({ status: "archived", updated_at: now })
      .eq("organization_id", company.id)
      .eq("catalog_item_id", data.id);

    if (skuArchiveError) {
      return NextResponse.json({ error: `Produto removido, mas nao foi possivel arquivar variacoes: ${skuArchiveError.message}` }, { status: 500 });
    }

    const mediaCleanup = await cleanupSalesCatalogMediaStorage({
      client,
      organizationId: company.id,
      productId: data.id,
      userId: workspace.user.id,
      media,
      reason: "product_deleted",
    });
    const remainingMedia = filterCleanedSalesCatalogMedia(media, mediaCleanup);

    if (media.length > 0) {
      const nextArchivedMetadata = {
        ...archivedMetadata,
        media: serializeSalesCatalogMedia(remainingMedia),
        media_cleanup: {
          deleted_count: mediaCleanup.deletedCount,
          failed_count: mediaCleanup.failed.length,
          released_bytes: mediaCleanup.releasedBytes,
          released_file_count: mediaCleanup.releasedFileCount,
          skipped_count: mediaCleanup.skipped.length,
          updated_at: new Date().toISOString(),
        },
      };
      const { data: refreshedData, error: mediaMetadataError } = await client
        .from("intelligence_memory")
        .update({
          metadata: nextArchivedMetadata,
          updated_at: now,
        })
        .eq("id", data.id)
        .eq("scope", "organization")
        .eq("organization_id", company.id)
        .eq("memory_type", "sales_catalog_item")
        .select("id, title, metadata")
        .maybeSingle<{ id: string; title: string; metadata: JsonRecord | null }>();

      if (!mediaMetadataError && refreshedData) {
        data = refreshedData;
      }
    }

    const deletedLinkButtonIds = await deleteProductTrackedLinkButtonsForCatalogItem({
      client,
      companyId: company.id,
      userId: workspace.user.id,
      itemId: data.id,
      linkButtonIds: linkedButtonId ? [linkedButtonId] : [],
      productTitle: data.title,
    });

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: company.id,
      source_type: "sales_catalog",
      source_id: data.id,
      event_type: "sales_catalog.item_deleted",
      title: `Produto removido: ${data.title}`,
      summary: `Tag ${readFormString(metadata.tag) ?? data.id} removida do catalogo de vendas.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_item", "whatsapp_agent", "lead_tracking"],
      payload: {
        product_id: data.id,
        label: data.title,
        tag: readFormString(metadata.tag),
        deleted_by: workspace.user.id,
        linked_button_id: linkedButtonId,
        linked_button_ids: deletedLinkButtonIds,
        media_cleanup: mediaCleanup,
      },
    });

    revalidatePath("/dashboard/agentes");
    revalidatePath("/dashboard/automacoes");
    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard/atendimento");

    return NextResponse.json({ deletedItemId: data.id, mediaCleanup });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao excluir produto."), { status: statusForRouteError(error, 500) });
  }
}

function validateFiles(files: File[]) {
  if (files.length > maxCatalogFiles) {
    return `Envie no maximo ${maxCatalogFiles} arquivos por produto.`;
  }

  let total = 0;
  for (const file of files) {
    total += file.size;
    if (file.size <= 0 || file.size > maxCatalogFileBytes) {
      return "Cada arquivo precisa ter ate 250 MB.";
    }

    const contentType = normalizeContentType(file);
    if (!isAllowedCatalogFile(contentType, file.name)) {
      return "Use imagens, GIFs, videos, PDF, DOC, DOCX ou arquivos de texto.";
    }
  }

  if (total > maxCatalogTotalBytes) {
    return "O total de arquivos precisa ter ate 500 MB.";
  }

  return null;
}

function readSalesCatalogMediaMetadata(value: unknown): SalesCatalogMedia[] {
  const source = Array.isArray(value) ? value : [];
  const media: SalesCatalogMedia[] = [];

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const storageUrl = readFormString(record.storage_url) ?? readFormString(record.storageUrl);
    if (!storageUrl) continue;

    const fileName = normalizeOptionalText(readFormString(record.file_name ?? record.fileName), 120) ?? "arquivo";
    const contentType = normalizeOptionalText(readFormString(record.content_type ?? record.contentType), 120) ?? "application/octet-stream";
    const size = normalizeNullableInteger(record.size, 0, maxCatalogFileBytes) ?? 0;

    media.push({
      id: readFormString(record.id) ?? randomUUID(),
      fileName,
      contentType,
      size,
      storageUrl,
      objectKey: readFormString(record.object_key) ?? readFormString(record.objectKey),
      kind: resolveSalesCatalogMediaKind(contentType, fileName),
      createdAt: readFormString(record.created_at) ?? readFormString(record.createdAt),
    });
  }

  return media.slice(0, maxCatalogFiles);
}

function serializeSalesCatalogMedia(media: SalesCatalogMedia[]) {
  return media.map((item) => ({
    id: item.id,
    file_name: item.fileName,
    content_type: item.contentType,
    size: item.size,
    storage_url: item.storageUrl,
    object_key: item.objectKey ?? null,
    kind: item.kind,
    created_at: item.createdAt,
  }));
}

function readKeepMediaIds(value: unknown) {
  if (typeof value !== "string") return null;

  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return null;

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const id = readFormString(item);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

function isAllowedCatalogFile(contentType: string, fileName: string) {
  if (contentType.startsWith("image/") || contentType.startsWith("video/") || contentType.startsWith("text/")) return true;

  return new Set([
    "application/json",
    "application/msword",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]).has(contentType) || /\.(png|jpe?g|webp|gif|mp4|webm|mov|pdf|doc|docx|txt|md|csv|json)$/i.test(fileName);
}

function normalizeContentType(file: File) {
  if (file.type) return file.type;

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

function normalizeTitle(value: string | null) {
  const title = value?.replace(/\s+/g, " ").trim() ?? "";
  return title.slice(0, 120);
}

function normalizeDescription(value: string | null) {
  const description = value?.replace(/\s+/g, " ").trim() ?? "";
  return description.slice(0, maxDescriptionLength);
}

function normalizeOptionalText(value: string | null, maxLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeHighlightLabel(value: string | null) {
  return normalizeOptionalText(value, 32);
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

function normalizeStatus(value: string | null): SalesCatalogItemStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeSalesDestination(value: string | null): SalesCatalogSalesDestination {
  if (value === "external_site" || value === "connectyhub_checkout") return value;
  return "connectyhub_checkout";
}

function normalizeBillingCycle(value: string | null): SalesCatalogBillingCycle {
  return value === "recurring" ? "recurring" : "one_time";
}

function normalizeBillingInterval(value: string | null): SalesCatalogBillingInterval {
  if (value === "week" || value === "quarter" || value === "year") return value;
  return "month";
}

function normalizeButtonLabel(value: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length >= 2 ? normalized.slice(0, 48) : null;
}

function normalizeBusinessType(value: string | null): SalesCatalogBusinessType {
  if (value === "fashion" || value === "physical" || value === "services" || value === "digital" || value === "food") {
    return value;
  }

  return "simple";
}

function normalizePaymentMethodId(value: string | null): SalesCatalogPaymentMethodId | null {
  if (value === "pix" || value === "card_link" || value === "boleto" || value === "cash_on_delivery" || value === "manual") {
    return value;
  }

  return null;
}

function normalizeReservationPolicy(value: string | null): SalesCatalogReservationPolicy {
  if (value === "before_payment" || value === "manual_approval") return value;
  return "after_payment";
}

function formatReservationPolicy(value: SalesCatalogReservationPolicy) {
  if (value === "before_payment") return "antes do pagamento";
  if (value === "manual_approval") return "aprovacao humana";
  return "apos pagamento";
}

function normalizeStringList(value: unknown, fallback: string[], limit: number, maxLength: number) {
  const source = Array.isArray(value) ? value : fallback;
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of source) {
    const normalized = normalizeOptionalText(readFormString(item), maxLength);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    output.push(normalized);

    if (output.length >= limit) break;
  }

  return output;
}

type SalesCatalogCategoryRename = {
  from: string;
  to: string;
};

function normalizeCategoryRenames(
  value: unknown,
  previousCategories: string[],
  nextCategories: string[],
): SalesCatalogCategoryRename[] {
  const previousByKey = new Map(previousCategories.map((category) => [normalizeCategoryLookupKey(category), category]));
  const nextByKey = new Map(nextCategories.map((category) => [normalizeCategoryLookupKey(category), category]));
  const output = new Map<string, SalesCatalogCategoryRename>();

  function addRename(fromValue: unknown, toValue: unknown) {
    const from = normalizeOptionalText(readFormString(fromValue), 80);
    const to = normalizeOptionalText(readFormString(toValue), 80);
    if (!from || !to) return;

    const fromKey = normalizeCategoryLookupKey(from);
    const toKey = normalizeCategoryLookupKey(to);
    if (!fromKey || !toKey || fromKey === toKey) return;

    const canonicalFrom = previousByKey.get(fromKey);
    const canonicalTo = nextByKey.get(toKey);
    if (!canonicalFrom || !canonicalTo) return;

    output.set(fromKey, { from: canonicalFrom, to: canonicalTo });
  }

  const record = readRecord(value);
  if (record) {
    for (const [from, to] of Object.entries(record)) {
      addRename(from, to);
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const itemRecord = readRecord(item);
      if (!itemRecord) continue;

      addRename(itemRecord.from ?? itemRecord.old ?? itemRecord.previous, itemRecord.to ?? itemRecord.next ?? itemRecord.new);
    }
  }

  for (let index = 0; index < Math.max(previousCategories.length, nextCategories.length); index += 1) {
    const previous = previousCategories[index];
    const next = nextCategories[index];
    if (!previous || !next) continue;

    const previousKey = normalizeCategoryLookupKey(previous);
    const nextKey = normalizeCategoryLookupKey(next);
    if (previousKey === nextKey) continue;
    if (nextByKey.has(previousKey) || previousByKey.has(nextKey)) continue;

    addRename(previous, next);
  }

  return Array.from(output.values());
}

function normalizeCategoryLookupKey(value: string | null | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

async function applySalesCatalogCategoryRenames(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  renames: SalesCatalogCategoryRename[];
  updatedAt: string;
  userId: string;
}) {
  if (input.renames.length === 0) return 0;

  const renameByKey = new Map(input.renames.map((rename) => [normalizeCategoryLookupKey(rename.from), rename]));
  let updatedCount = 0;
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data: rows, error } = await input.client
      .from("intelligence_memory")
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .eq("scope", "organization")
      .eq("organization_id", input.companyId)
      .eq("memory_type", "sales_catalog_item")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Nao foi possivel carregar produtos para renomear categoria: ${error.message}`);
    }

    const items = (rows ?? []) as SalesCatalogMemoryRow[];
    for (const row of items) {
      const metadata = readRecord(row.metadata) ?? {};
      const currentCategory = normalizeOptionalText(readFormString(metadata.category), 80);
      if (!currentCategory) continue;

      const rename = renameByKey.get(normalizeCategoryLookupKey(currentCategory));
      if (!rename) continue;

      const item = mapSalesCatalogItem(row);
      const nextMetadata = {
        ...metadata,
        category: rename.to,
        category_renamed_from: currentCategory,
        category_renamed_at: input.updatedAt,
        category_renamed_by: input.userId,
      };
      const nextContent = buildSalesCatalogContent({
        title: item.title,
        description: item.description,
        category: rename.to,
        price: item.price,
        currency: item.currency,
        media: item.media,
        attributes: item.attributes,
        inventory: item.inventory,
        offer: item.offer,
        fulfillment: item.fulfillment,
        shipping: item.shipping,
        pageContent: item.pageContent,
        salesDestination: item.salesDestination,
        productUrl: item.productUrl,
        externalLinkButtonTag: item.externalLinkButtonTag,
      });
      const { error: updateError } = await input.client
        .from("intelligence_memory")
        .update({
          content: nextContent,
          metadata: nextMetadata,
          updated_at: input.updatedAt,
        })
        .eq("id", row.id)
        .eq("organization_id", input.companyId)
        .eq("memory_type", "sales_catalog_item");

      if (updateError) {
        throw new Error(`Nao foi possivel renomear categoria do produto ${item.title}: ${updateError.message}`);
      }

      updatedCount += 1;
    }

    if (items.length < pageSize) break;
  }

  return updatedCount;
}

function normalizeSettingsAttributes(value: unknown, fallback: SalesCatalogAttribute[]) {
  const source = Array.isArray(value) ? value : fallback;
  const attributes: SalesCatalogAttribute[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const name = normalizeOptionalText(readFormString(record.name), 50);
    if (!name) continue;

    const key = createAttributeId(name);
    if (seen.has(key)) continue;

    seen.add(key);
    attributes.push({
      id: normalizeOptionalText(readFormString(record.id), 50) ?? key,
      name,
      values: normalizeStringList(record.values, [], 40, 50),
      required: readBoolean(record.required) ?? false,
    });

    if (attributes.length >= 12) break;
  }

  return attributes;
}

function normalizeStorefrontSettings(value: unknown, categories: string[] = []): SalesCatalogStorefrontSettings {
  const record = readRecord(value) ?? {};

  return {
    publicDisplayName: normalizeOptionalText(readFormString(record.publicDisplayName ?? record.public_display_name), 80),
    heroTitle: normalizeOptionalText(readFormString(record.heroTitle ?? record.hero_title), 120),
    heroHighlight: normalizeOptionalText(readFormString(record.heroHighlight ?? record.hero_highlight), 90),
    heroSubtitle: normalizeOptionalText(readFormString(record.heroSubtitle ?? record.hero_subtitle), 180),
    headerText: normalizeOptionalText(readFormString(record.headerText ?? record.header_text), 140),
    footerText: normalizeOptionalText(readFormString(record.footerText ?? record.footer_text), 320),
    footerContactText: normalizeOptionalText(readFormString(record.footerContactText ?? record.footer_contact_text), 180),
    primaryColor: normalizeStorefrontPrimaryColor(readFormString(record.primaryColor ?? record.primary_color)),
    textColor: normalizeStorefrontTextColor(readFormString(record.textColor ?? record.text_color)),
    buttonColor: normalizeStorefrontTextColor(readFormString(record.buttonColor ?? record.button_color)),
    buttonTextColor: normalizeStorefrontTextColor(readFormString(record.buttonTextColor ?? record.button_text_color)),
    cardTextColor: normalizeStorefrontTextColor(readFormString(record.cardTextColor ?? record.card_text_color)),
    offerTextColor: normalizeStorefrontTextColor(readFormString(record.offerTextColor ?? record.offer_text_color)),
    heroTitleColor: normalizeStorefrontTextColor(readFormString(record.heroTitleColor ?? record.hero_title_color)),
    heroHighlightColor: normalizeStorefrontTextColor(readFormString(record.heroHighlightColor ?? record.hero_highlight_color)),
    categoryStripColor: normalizeStorefrontPrimaryColor(readFormString(record.categoryStripColor ?? record.category_strip_color)),
    categoryIconColor: normalizeStorefrontTextColor(readFormString(record.categoryIconColor ?? record.category_icon_color)),
    bodyFont: normalizeSalesCatalogStorefrontFontPreset(record.bodyFont ?? record.body_font),
    headingFont: normalizeSalesCatalogStorefrontFontPreset(record.headingFont ?? record.heading_font),
    homeCategoryNames: normalizeStringList(record.homeCategoryNames ?? record.home_category_names, [], 60, 80),
    categoryIcons: normalizeSalesCatalogCategoryIconMap(record.categoryIcons ?? record.category_icons, categories),
  };
}

function normalizeStorefrontPrimaryColor(value: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function normalizeStorefrontTextColor(value: string | null) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function normalizePaymentMethods(value: unknown, fallback: SalesCatalogPaymentMethod[]) {
  const source = Array.isArray(value) ? value : fallback;
  const methodsById = new Map(salesCatalogPaymentMethodTemplates.map((method) => [method.id, { ...method, enabled: false }]));

  for (const method of fallback) {
    methodsById.set(method.id, { ...method });
  }

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const id = normalizePaymentMethodId(readFormString(record.id));
    if (!id) continue;

    const fallbackMethod = methodsById.get(id) ?? salesCatalogPaymentMethodTemplates.find((method) => method.id === id);
    methodsById.set(id, {
      id,
      label: normalizeOptionalText(readFormString(record.label), 50) ?? fallbackMethod?.label ?? id,
      enabled: readBoolean(record.enabled) ?? fallbackMethod?.enabled ?? false,
      instructions: normalizeOptionalText(readFormString(record.instructions), 240) ?? fallbackMethod?.instructions ?? null,
      requiresProof: readBoolean(record.requiresProof ?? record.requires_proof) ?? fallbackMethod?.requiresProof ?? false,
    });
  }

  return salesCatalogPaymentMethodTemplates.map((method) => methodsById.get(method.id) ?? { ...method });
}

function normalizePagBankSettings(value: unknown, fallback: SalesCatalogPagBankSettings): SalesCatalogPagBankSettings {
  const record = readRecord(value);
  if (!record) {
    return { ...fallback, enabledMethods: [...fallback.enabledMethods] };
  }

  const enabledMethods = normalizePagBankPaymentMethods(
    record.enabledMethods ?? record.enabled_methods,
    fallback.enabledMethods,
  );
  const maxInstallments = normalizeNullableInteger(
    record.maxInstallments ?? record.max_installments,
    1,
    12,
  ) ?? fallback.maxInstallments;
  const interestFreeInstallments = normalizeNullableInteger(
    record.interestFreeInstallments ?? record.interest_free_installments,
    0,
    maxInstallments,
  ) ?? Math.min(fallback.interestFreeInstallments, maxInstallments);

  return {
    enabledMethods,
    maxInstallments,
    interestFreeInstallments,
    softDescriptor: normalizeOptionalText(readFormString(record.softDescriptor ?? record.soft_descriptor), 17),
    pixExpirationMinutes: normalizeNullableInteger(
      record.pixExpirationMinutes ?? record.pix_expiration_minutes,
      5,
      43200,
    ) ?? fallback.pixExpirationMinutes,
    checkoutExpirationMinutes: normalizeNullableInteger(
      record.checkoutExpirationMinutes ?? record.checkout_expiration_minutes,
      5,
      43200,
    ) ?? fallback.checkoutExpirationMinutes,
    allowBuyerEdit: readBoolean(record.allowBuyerEdit ?? record.allow_buyer_edit) ?? fallback.allowBuyerEdit,
    recurringEnabled: readBoolean(record.recurringEnabled ?? record.recurring_enabled) ?? fallback.recurringEnabled,
  };
}

function normalizePagBankPaymentMethods(
  value: unknown,
  fallback: SalesCatalogPagBankPaymentMethod[],
): SalesCatalogPagBankPaymentMethod[] {
  const allowed = new Set(salesCatalogPagBankPaymentMethodOptions.map((method) => method.id));
  const source = Array.isArray(value) ? value : fallback;
  const methods = source
    .map((item) => readFormString(item))
    .filter((method): method is SalesCatalogPagBankPaymentMethod => allowed.has(method as SalesCatalogPagBankPaymentMethod));

  return methods.length > 0 ? Array.from(new Set(methods)) : [...fallback];
}

function normalizeOrderPolicy(value: unknown, fallback: ReturnType<typeof createDefaultSalesCatalogCommerceSettings>["orderPolicy"]) {
  const record = readRecord(value);
  if (!record) return fallback;

  const abandonedCartMinutes = normalizeNullableInteger(record.abandonedCartMinutes ?? record.abandoned_cart_minutes, 0, 10080);
  const followUpDays = normalizeNullableInteger(record.followUpDays ?? record.follow_up_days, 0, 365);
  const reservationPolicy = readFormString(record.reservationPolicy ?? record.reservation_policy);

  return {
    minimumOrderValue: normalizeOptionalText(readFormString(record.minimumOrderValue ?? record.minimum_order_value), 40) ?? fallback.minimumOrderValue,
    reservationPolicy: reservationPolicy ? normalizeReservationPolicy(reservationPolicy) : fallback.reservationPolicy,
    allowOrderWithoutPayment: readBoolean(record.allowOrderWithoutPayment ?? record.allow_order_without_payment) ?? fallback.allowOrderWithoutPayment,
    requireHumanConfirmation: readBoolean(record.requireHumanConfirmation ?? record.require_human_confirmation) ?? fallback.requireHumanConfirmation,
    askCepBeforeQuote: readBoolean(record.askCepBeforeQuote ?? record.ask_cep_before_quote) ?? fallback.askCepBeforeQuote,
    abandonedCartMinutes: abandonedCartMinutes ?? fallback.abandonedCartMinutes,
    followUpDays: followUpDays ?? fallback.followUpDays,
  };
}

function normalizeLeadDataPolicy(value: unknown, fallback: ReturnType<typeof createDefaultSalesCatalogCommerceSettings>["leadDataPolicy"]) {
  const record = readRecord(value);
  if (!record) return fallback;

  const fields = Array.isArray(record.requiredFields) || Array.isArray(record.required_fields)
    ? normalizeLeadDataFields(record.requiredFields ?? record.required_fields)
    : fallback.requiredFields;

  return {
    requiredFields: fields,
    consentMessage: normalizeOptionalText(readFormString(record.consentMessage ?? record.consent_message), 240) ?? fallback.consentMessage,
    retentionDays: normalizeNullableInteger(record.retentionDays ?? record.retention_days, 0, 3650) ?? fallback.retentionDays,
  };
}

function normalizeMessageTemplates(
  value: unknown,
  fallback: SalesCatalogWhatsAppMessageTemplates,
): SalesCatalogWhatsAppMessageTemplates {
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    orderSummary: normalizeOptionalText(readFormString(record.orderSummary ?? record.order_summary), 360) ?? fallback.orderSummary,
    paymentRequest: normalizeOptionalText(readFormString(record.paymentRequest ?? record.payment_request), 360) ?? fallback.paymentRequest,
    paymentConfirmed: normalizeOptionalText(readFormString(record.paymentConfirmed ?? record.payment_confirmed), 240) ?? fallback.paymentConfirmed,
    paymentRejected: normalizeOptionalText(readFormString(record.paymentRejected ?? record.payment_rejected), 300) ?? fallback.paymentRejected,
    paymentRefunded: normalizeOptionalText(readFormString(record.paymentRefunded ?? record.payment_refunded), 300) ?? fallback.paymentRefunded,
    unavailableItem: normalizeOptionalText(readFormString(record.unavailableItem ?? record.unavailable_item), 240) ?? fallback.unavailableItem,
    humanHandoff: normalizeOptionalText(readFormString(record.humanHandoff ?? record.human_handoff), 240) ?? fallback.humanHandoff,
  };
}

function normalizeAutomationSettings(
  value: unknown,
  fallback: SalesCatalogAutomationSettings,
): SalesCatalogAutomationSettings {
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    paymentStatusNotifications: readBoolean(record.paymentStatusNotifications ?? record.payment_status_notifications)
      ?? fallback.paymentStatusNotifications,
    useConversationWhatsappFirst: readBoolean(record.useConversationWhatsappFirst ?? record.use_conversation_whatsapp_first)
      ?? fallback.useConversationWhatsappFirst,
    defaultWhatsappInstanceId: normalizeUuid(readFormString(record.defaultWhatsappInstanceId ?? record.default_whatsapp_instance_id)),
    defaultAgentId: normalizeUuid(readFormString(record.defaultAgentId ?? record.default_agent_id)),
  };
}

function normalizeOrderBumps(value: unknown, fallback: SalesCatalogOrderBumpSettings): SalesCatalogOrderBumpSettings {
  const record = readRecord(value);
  if (!record) return fallback;

  const seen = new Set<string>();
  const items = (Array.isArray(record.items) ? record.items : [])
    .map((item): SalesCatalogOrderBumpSettings["items"][number] | null => {
      const itemRecord = readRecord(item);
      if (!itemRecord) return null;

      const productId = normalizeUuid(readFormString(itemRecord.productId ?? itemRecord.product_id));
      if (!productId || seen.has(productId)) return null;
      seen.add(productId);

      return {
        productId,
        active: readBoolean(itemRecord.active) ?? true,
        badge: normalizeOptionalText(readFormString(itemRecord.badge), 32),
        title: normalizeOptionalText(readFormString(itemRecord.title), 80),
        description: normalizeOptionalText(readFormString(itemRecord.description), 180),
      };
    })
    .filter((item): item is SalesCatalogOrderBumpSettings["items"][number] => Boolean(item))
    .slice(0, 12);

  return {
    enabled: readBoolean(record.enabled) ?? false,
    items,
  };
}

function normalizeCommerceAgentSettings(
  value: unknown,
  fallback: SalesCatalogCommerceAgentSettings,
): SalesCatalogCommerceAgentSettings {
  const record = readRecord(value);
  if (!record) return fallback;

  return {
    enabled: readBoolean(record.enabled) ?? fallback.enabled,
    mode: normalizeCommerceAgentMode(readFormString(record.mode), fallback.mode),
    surfaces: normalizeCommerceAgentSurfaces(record.surfaces, fallback.surfaces),
    verticalPlaybook: normalizeCommerceAgentVerticalPlaybook(
      readFormString(record.verticalPlaybook ?? record.vertical_playbook),
      fallback.verticalPlaybook,
    ),
    maxOffersPerSession: normalizeNullableInteger(record.maxOffersPerSession ?? record.max_offers_per_session, 0, 12)
      ?? fallback.maxOffersPerSession,
    allowAutoAddToCart: readBoolean(record.allowAutoAddToCart ?? record.allow_auto_add_to_cart)
      ?? fallback.allowAutoAddToCart,
    checkoutQuietMode: readBoolean(record.checkoutQuietMode ?? record.checkout_quiet_mode)
      ?? fallback.checkoutQuietMode,
    agentDockLabel: normalizeOptionalText(readFormString(record.agentDockLabel ?? record.agent_dock_label), 60)
      ?? fallback.agentDockLabel,
  };
}

function normalizeCommerceAgentMode(
  value: string | null,
  fallback: SalesCatalogCommerceAgentMode,
): SalesCatalogCommerceAgentMode {
  if (value === "observer" || value === "assistant" || value === "active_seller") return value;
  return fallback;
}

function normalizeCommerceAgentSurfaces(
  value: unknown,
  fallback: SalesCatalogCommerceAgentSurface[],
): SalesCatalogCommerceAgentSurface[] {
  const source = Array.isArray(value) ? value : [];
  const allowed = new Set<SalesCatalogCommerceAgentSurface>(["store", "product", "cart", "checkout"]);
  const surfaces = source
    .map((item) => readFormString(item))
    .filter((item): item is SalesCatalogCommerceAgentSurface => allowed.has(item as SalesCatalogCommerceAgentSurface));

  return surfaces.length > 0 ? Array.from(new Set(surfaces)) : [...fallback];
}

function normalizeCommerceAgentVerticalPlaybook(
  value: string | null,
  fallback: SalesCatalogCommerceAgentVerticalPlaybook,
): SalesCatalogCommerceAgentVerticalPlaybook {
  if (
    value === "generic"
    || value === "food"
    || value === "fashion"
    || value === "beauty"
    || value === "real_estate"
    || value === "services"
    || value === "digital"
    || value === "physical"
  ) {
    return value;
  }

  return fallback;
}

function normalizeLeadDataFields(value: unknown): SalesCatalogLeadDataField[] {
  const source = Array.isArray(value) ? value : [];
  const allowed = new Set(salesCatalogLeadDataFields.map((field) => field.value));
  const output: SalesCatalogLeadDataField[] = [];

  for (const item of source) {
    const field = readFormString(item);
    if (!field || !allowed.has(field as SalesCatalogLeadDataField) || output.includes(field as SalesCatalogLeadDataField)) continue;
    output.push(field as SalesCatalogLeadDataField);
  }

  return output;
}

function serializePaymentMethod(method: SalesCatalogPaymentMethod) {
  return {
    id: method.id,
    label: method.label,
    enabled: method.enabled,
    instructions: method.instructions,
    requires_proof: method.requiresProof,
  };
}

function serializePagBankSettings(settings: SalesCatalogPagBankSettings) {
  return {
    enabled_methods: settings.enabledMethods,
    max_installments: settings.maxInstallments,
    interest_free_installments: settings.interestFreeInstallments,
    soft_descriptor: settings.softDescriptor,
    pix_expiration_minutes: settings.pixExpirationMinutes,
    checkout_expiration_minutes: settings.checkoutExpirationMinutes,
    allow_buyer_edit: settings.allowBuyerEdit,
    recurring_enabled: settings.recurringEnabled,
  };
}

function serializeStorefrontSettings(settings: SalesCatalogStorefrontSettings) {
  return {
    public_display_name: settings.publicDisplayName,
    hero_title: settings.heroTitle,
    hero_highlight: settings.heroHighlight,
    hero_subtitle: settings.heroSubtitle,
    header_text: settings.headerText,
    footer_text: settings.footerText,
    footer_contact_text: settings.footerContactText,
    primary_color: settings.primaryColor,
    text_color: settings.textColor,
    button_color: settings.buttonColor,
    button_text_color: settings.buttonTextColor,
    card_text_color: settings.cardTextColor,
    offer_text_color: settings.offerTextColor,
    hero_title_color: settings.heroTitleColor,
    hero_highlight_color: settings.heroHighlightColor,
    category_strip_color: settings.categoryStripColor,
    category_icon_color: settings.categoryIconColor,
    body_font: settings.bodyFont,
    heading_font: settings.headingFont,
    home_category_names: settings.homeCategoryNames,
    category_icons: settings.categoryIcons,
  };
}

function serializeOrderPolicy(policy: ReturnType<typeof createDefaultSalesCatalogCommerceSettings>["orderPolicy"]) {
  return {
    minimum_order_value: policy.minimumOrderValue,
    reservation_policy: policy.reservationPolicy,
    allow_order_without_payment: policy.allowOrderWithoutPayment,
    require_human_confirmation: policy.requireHumanConfirmation,
    ask_cep_before_quote: policy.askCepBeforeQuote,
    abandoned_cart_minutes: policy.abandonedCartMinutes,
    follow_up_days: policy.followUpDays,
  };
}

function serializeLeadDataPolicy(policy: ReturnType<typeof createDefaultSalesCatalogCommerceSettings>["leadDataPolicy"]) {
  return {
    required_fields: policy.requiredFields,
    consent_message: policy.consentMessage,
    retention_days: policy.retentionDays,
  };
}

function serializeMessageTemplates(templates: SalesCatalogWhatsAppMessageTemplates) {
  return {
    order_summary: templates.orderSummary,
    payment_request: templates.paymentRequest,
    payment_confirmed: templates.paymentConfirmed,
    payment_rejected: templates.paymentRejected,
    payment_refunded: templates.paymentRefunded,
    unavailable_item: templates.unavailableItem,
    human_handoff: templates.humanHandoff,
  };
}

function serializeAutomationSettings(settings: SalesCatalogAutomationSettings) {
  return {
    payment_status_notifications: settings.paymentStatusNotifications,
    use_conversation_whatsapp_first: settings.useConversationWhatsappFirst,
    default_whatsapp_instance_id: settings.defaultWhatsappInstanceId,
    default_agent_id: settings.defaultAgentId,
  };
}

function serializeOrderBumps(settings: SalesCatalogOrderBumpSettings) {
  return {
    enabled: settings.enabled,
    items: settings.items.map((item) => ({
      product_id: item.productId,
      active: item.active,
      badge: item.badge,
      title: item.title,
      description: item.description,
    })),
  };
}

function serializeCommerceAgentSettings(settings: SalesCatalogCommerceAgentSettings) {
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    surfaces: settings.surfaces,
    vertical_playbook: settings.verticalPlaybook,
    max_offers_per_session: settings.maxOffersPerSession,
    allow_auto_add_to_cart: settings.allowAutoAddToCart,
    checkout_quiet_mode: settings.checkoutQuietMode,
    agent_dock_label: settings.agentDockLabel,
  };
}

function formatCommerceAgentMode(mode: SalesCatalogCommerceAgentMode) {
  if (mode === "observer") return "observador";
  if (mode === "active_seller") return "vendedor ativo";
  return "assistente";
}

function readItemAttributesPayload(value: unknown): SalesCatalogItemAttribute[] {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): SalesCatalogItemAttribute | null => {
      const record = readRecord(item);
      if (!record) return null;

      const name = normalizeOptionalText(readFormString(record.name), 50);
      const values = normalizeStringList(record.values, [], 40, 50);

      if (!name || values.length === 0) return null;

      return {
        id: normalizeOptionalText(readFormString(record.id), 50) ?? createAttributeId(name),
        name,
        values,
      };
    })
    .filter((item): item is SalesCatalogItemAttribute => Boolean(item));
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
        id: normalizeUuid(readFormString(record.id)),
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
        createdAt: readFormString(record.createdAt ?? record.created_at),
        updatedAt: readFormString(record.updatedAt ?? record.updated_at),
      };
    })
    .filter((item): item is SalesCatalogSku => Boolean(item))
    .slice(0, 80);
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

function readProductPageContentPayload(formData: FormData): SalesCatalogProductPageContent {
  return {
    fullDescription: normalizeOptionalText(readFormString(formData.get("pageFullDescription")), maxProductPageTextLength),
    usage: normalizeOptionalText(readFormString(formData.get("pageUsage")), maxProductPageTextLength),
    shippingInfo: normalizeOptionalText(readFormString(formData.get("pageShippingInfo")), maxProductPageTextLength),
    faq: normalizeOptionalText(readFormString(formData.get("pageFaq")), maxProductPageTextLength),
    importantNotice: normalizeOptionalText(readFormString(formData.get("pageImportantNotice")), 520),
    quickDetails: readProductQuickDetailsPayload(formData.get("pageQuickDetails")),
  };
}

function readProductQuickDetailsPayload(value: unknown): SalesCatalogProductPageContent["quickDetails"] {
  const parsed = typeof value === "string" && value.trim() ? parseJson(value) : null;
  const list = Array.isArray(parsed) ? parsed : [];

  return list
    .map((item, index) => {
      const record = readRecord(item);
      if (!record) return null;

      const label = normalizeOptionalText(readFormString(record.label), 42);
      const detailValue = normalizeOptionalText(readFormString(record.value), 90);
      if (!label || !detailValue) return null;

      return {
        id: normalizeOptionalText(readFormString(record.id), 48) ?? `detail_${index + 1}`,
        label,
        value: detailValue,
      };
    })
    .filter((item): item is SalesCatalogProductPageContent["quickDetails"][number] => Boolean(item))
    .slice(0, maxProductPageQuickDetails);
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

function serializeItemAttributes(attributes: SalesCatalogItemAttribute[]) {
  return attributes.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    values: attribute.values,
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

function serializeProductPageContent(pageContent: SalesCatalogProductPageContent) {
  return {
    full_description: pageContent.fullDescription,
    usage: pageContent.usage,
    shipping_info: pageContent.shippingInfo,
    faq: pageContent.faq,
    important_notice: pageContent.importantNotice,
    quick_details: pageContent.quickDetails.map((detail) => ({
      id: detail.id,
      label: detail.label,
      value: detail.value,
    })),
  };
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

async function upsertProductTrackedLinkButton(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  itemId: string;
  title: string;
  description: string;
  category: string | null;
  price: string | null;
  currency: string;
  productUrl: string;
  label: string;
  existingLinkButtonId?: string | null;
}): Promise<ProductTrackedLinkResult> {
  const now = new Date().toISOString();
  const slug = createTrackedLinkSlug(input.label);
  const existingLinkButtonId = input.existingLinkButtonId?.trim() || null;
  let linkId = existingLinkButtonId;
  let existingMetadata: JsonRecord = {};

  if (existingLinkButtonId) {
    const { data, error } = await input.client
      .from("intelligence_memory")
      .select("id, metadata, created_at")
      .eq("id", existingLinkButtonId)
      .eq("scope", "organization")
      .eq("organization_id", input.companyId)
      .eq("memory_type", "tracked_link_button")
      .maybeSingle<ProductTrackedLinkRow>();

    if (error) {
      throw new Error(`Nao foi possivel carregar o botao externo do produto: ${error.message}`);
    }

    if (data?.id) {
      linkId = data.id;
      existingMetadata = readRecord(data.metadata) ?? {};
    } else {
      linkId = null;
    }
  }

  if (!linkId) {
    const { data, error } = await input.client
      .from("intelligence_memory")
      .insert({
        scope: "organization",
        organization_id: input.companyId,
        memory_type: "tracked_link_button",
        title: input.label,
        content: input.productUrl,
        importance: 0.7,
        tags: ["tracked_link_button", "sales_catalog_item", "whatsapp_agent", "lead_tracking", "external_site_product"],
        metadata: {
          label: input.label,
          url: input.productUrl,
          slug,
          click_count: 0,
          sales_destination: "external_site",
          source: "sales_catalog_product",
          catalog_item_id: input.itemId,
          product_title: input.title,
          product_description: input.description,
          product_category: input.category,
          product_price: input.price,
          product_currency: input.currency,
          created_by: input.userId,
        },
        created_at: now,
        updated_at: now,
      })
      .select("id, metadata, created_at")
      .single<ProductTrackedLinkRow>();

    if (error || !data?.id) {
      throw new Error(error?.message ?? "Nao foi possivel criar botao externo do produto.");
    }

    linkId = data.id;
    existingMetadata = readRecord(data.metadata) ?? {};
  }

  const tag = createTrackedLinkTag(input.label, linkId);
  const trackingUrl = buildTrackedLinkUrl(linkId);
  const metadata = {
    ...existingMetadata,
    label: input.label,
    url: input.productUrl,
    slug,
    tag,
    tracking_url: trackingUrl,
    sales_destination: "external_site",
    source: "sales_catalog_product",
    catalog_item_id: input.itemId,
    product_title: input.title,
    product_description: input.description,
    product_category: input.category,
    product_price: input.price,
    product_currency: input.currency,
    updated_by: input.userId,
  };

  const { error: updateError } = await input.client
    .from("intelligence_memory")
    .update({
      title: input.label,
      content: input.productUrl,
      tags: ["tracked_link_button", "sales_catalog_item", "whatsapp_agent", "lead_tracking", "external_site_product"],
      metadata,
      updated_at: now,
    })
    .eq("id", linkId)
    .eq("organization_id", input.companyId);

  if (updateError) {
    throw new Error(`Nao foi possivel salvar o botao externo do produto: ${updateError.message}`);
  }

  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.companyId,
    source_type: "tracked_link_button",
    source_id: linkId,
    event_type: existingLinkButtonId ? "tracked_link.updated_from_product" : "tracked_link.created_from_product",
    title: `Botao externo do produto: ${input.label}`,
    summary: `Tag ${tag} vinculada ao produto ${input.title}.`,
    confidence: 1,
    visibility: "organization",
    tags: ["tracked_link_button", "sales_catalog_item", "whatsapp_agent", "lead_tracking"],
    payload: {
      catalog_item_id: input.itemId,
      label: input.label,
      url: input.productUrl,
      tag,
      tracking_url: trackingUrl,
      sales_destination: "external_site",
      actor_id: input.userId,
    },
  });

  return {
    id: linkId,
    label: input.label,
    url: input.productUrl,
    tag,
    trackingUrl,
  };
}

async function deleteProductTrackedLinkButtonsForCatalogItem(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  itemId: string;
  linkButtonIds: string[];
  productTitle: string;
}) {
  const directIds = new Set(input.linkButtonIds.map((id) => id.trim()).filter(Boolean));
  const { data, error } = await input.client
    .from("intelligence_memory")
    .select("id, title, content, metadata, created_at")
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "tracked_link_button")
    .contains("tags", ["tracked_link_button"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Nao foi possivel carregar botoes externos do produto: ${error.message}`);
  }

  const rows = ((data ?? []) as Array<{
    id: string;
    title: string;
    content: string;
    metadata: JsonRecord | null;
    created_at: string | null;
  }>)
    .filter((row) => isTrackedLinkButtonFromCatalogItem(row, input.itemId, directIds));

  for (const row of rows) {
    await deleteProductTrackedLinkButton({
      client: input.client,
      companyId: input.companyId,
      userId: input.userId,
      linkButtonId: row.id,
      productTitle: input.productTitle,
    });
  }

  return rows.map((row) => row.id);
}

function isTrackedLinkButtonFromCatalogItem(
  row: { id: string; metadata: JsonRecord | null },
  itemId: string,
  directIds: Set<string>,
) {
  if (directIds.has(row.id)) return true;

  const metadata = readRecord(row.metadata) ?? {};
  return (
    readFormString(metadata.catalog_item_id) === itemId ||
    readFormString(metadata.sales_catalog_item_id) === itemId ||
    readFormString(metadata.link_button_catalog_item_id) === itemId ||
    readFormString(metadata.product_id) === itemId
  );
}

async function deleteProductTrackedLinkButton(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  userId: string;
  linkButtonId: string;
  productTitle: string;
}) {
  const { data, error } = await input.client
    .from("intelligence_memory")
    .delete()
    .eq("id", input.linkButtonId)
    .eq("scope", "organization")
    .eq("organization_id", input.companyId)
    .eq("memory_type", "tracked_link_button")
    .select("id, title, content, metadata, created_at")
    .maybeSingle<{
      id: string;
      title: string;
      content: string;
      metadata: JsonRecord | null;
      created_at: string | null;
    }>();

  if (error) {
    throw new Error(`Nao foi possivel remover o botao externo antigo: ${error.message}`);
  }

  if (!data) return;

  const metadata = readRecord(data.metadata) ?? {};
  await input.client.from("intelligence_events").insert({
    scope: "organization",
    organization_id: input.companyId,
    source_type: "tracked_link_button",
    source_id: data.id,
    event_type: "tracked_link.deleted_from_product",
    title: `Botao externo removido: ${data.title}`,
    summary: `Produto ${input.productTitle} deixou de vender por site externo.`,
    confidence: 1,
    visibility: "organization",
    tags: ["tracked_link_button", "sales_catalog_item", "whatsapp_agent", "lead_tracking"],
    payload: {
      label: readFormString(metadata.label) ?? data.title,
      url: readFormString(metadata.url) ?? data.content,
      tag: readFormString(metadata.tag),
      deleted_by: input.userId,
    },
  });
}

async function persistSalesCatalogSkus(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  itemId: string;
  skus: SalesCatalogSku[];
  fallback: {
    title: string;
    price: string | null;
    salePrice: string | null;
    currency: string;
    inventory: SalesCatalogProductInventory;
    shipping: SalesCatalogProductShipping;
    attributes: SalesCatalogItemAttribute[];
  };
}) {
  const now = new Date().toISOString();
  const sourceSkus = input.skus.length > 0
    ? input.skus
    : [{
        id: null,
        companyId: input.companyId,
        catalogItemId: input.itemId,
        skuCode: createSkuCode(input.fallback.title, input.itemId),
        title: input.fallback.title,
        attributes: input.fallback.attributes,
        price: input.fallback.price,
        salePrice: input.fallback.salePrice,
        currency: input.fallback.currency,
        stockStatus: input.fallback.inventory.status,
        stockQuantity: input.fallback.inventory.quantity,
        lowStockThreshold: input.fallback.inventory.lowStockThreshold,
        weightGrams: input.fallback.shipping.weightGrams,
        dimensions: input.fallback.shipping.dimensions,
        mediaIds: [],
        status: "active" as SalesCatalogSkuStatus,
        createdAt: null,
        updatedAt: null,
      }];
  const payload = sourceSkus.map((sku) => ({
    id: sku.id ?? randomUUID(),
    organization_id: input.companyId,
    catalog_item_id: input.itemId,
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
    updated_at: now,
  }));
  const activeCodes = payload.map((sku) => sku.sku_code);

  if (payload.length > 0) {
    await input.client
      .from("sales_catalog_skus")
      .upsert(payload, { onConflict: "catalog_item_id,sku_code" });
  }

  await input.client
    .from("sales_catalog_skus")
    .update({ status: "archived", updated_at: now })
    .eq("organization_id", input.companyId)
    .eq("catalog_item_id", input.itemId)
    .not("sku_code", "in", `(${activeCodes.map((code) => `"${code}"`).join(",")})`);
}

function normalizeShippingRules(value: unknown): SalesCatalogShippingRule[] {
  const source = Array.isArray(value) ? value : [];
  const rulesByUf = new Map(defaultSalesCatalogShippingRules.map((rule) => [rule.uf, { ...rule }]));

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const uf = normalizeUf(readFormString(record.uf));
    if (!uf || !rulesByUf.has(uf)) continue;

    const fallback = rulesByUf.get(uf)!;
    const minDays = normalizeNullableInteger(record.minDays ?? record.min_days, 0, 120);
    const rawMaxDays = normalizeNullableInteger(record.maxDays ?? record.max_days, 0, 120);
    const maxDays = minDays !== null && rawMaxDays !== null && rawMaxDays < minDays ? minDays : rawMaxDays;

    rulesByUf.set(uf, {
      uf,
      state: fallback.state,
      active: readBoolean(record.active) ?? false,
      cepStart: normalizeSalesCatalogCep(readFormString(record.cepStart ?? record.cep_start)),
      cepEnd: normalizeSalesCatalogCep(readFormString(record.cepEnd ?? record.cep_end)),
      price: normalizeOptionalText(readFormString(record.price), 40),
      minDays,
      maxDays,
      freeShippingThreshold: normalizeOptionalText(readFormString(record.freeShippingThreshold ?? record.free_shipping_threshold), 40),
      services: normalizeShippingServices(record.services, fallback.services),
      notes: normalizeOptionalText(readFormString(record.notes), 160),
    });
  }

  return brazilianStates.map(({ uf }) => rulesByUf.get(uf) ?? {
    uf,
    state: brazilianStates.find((state) => state.uf === uf)?.state ?? uf,
    active: false,
    cepStart: null,
    cepEnd: null,
    price: null,
    minDays: null,
    maxDays: null,
    freeShippingThreshold: null,
    services: createDefaultSalesCatalogShippingServices(),
    notes: null,
  });
}

function serializeShippingRule(rule: SalesCatalogShippingRule) {
  return {
    uf: rule.uf,
    state: rule.state,
    active: rule.active,
    cep_start: rule.cepStart,
    cep_end: rule.cepEnd,
    price: rule.price,
    min_days: rule.minDays,
    max_days: rule.maxDays,
    free_shipping_threshold: rule.freeShippingThreshold,
    services: rule.services.map(serializeShippingService),
    notes: rule.notes,
  };
}

function formatShippingRuleContent(rule: SalesCatalogShippingRule) {
  const activeServices = rule.services.filter((service) => service.active);
  const cepScope = rule.cepStart && rule.cepEnd ? `CEP ${rule.cepStart}-${rule.cepEnd}` : "todo o estado";
  const parts = [
    rule.price ? `frete ${rule.price}` : "frete a combinar",
    rule.minDays !== null || rule.maxDays !== null ? `prazo ${formatShippingDeadline(rule.minDays, rule.maxDays)}` : "",
    cepScope,
    activeServices.length ? `servicos ${activeServices.map((service) => service.name).join(", ")}` : "",
    rule.freeShippingThreshold ? `gratis acima de ${rule.freeShippingThreshold}` : "",
  ].filter(Boolean);

  return `- ${rule.uf} (${rule.state}): ${parts.join(", ") || "atendido"}`;
}

function normalizeLocalDeliveryZones(value: unknown): SalesCatalogLocalDeliveryZone[] {
  const source = Array.isArray(value) ? value : [];
  const zones: SalesCatalogLocalDeliveryZone[] = [];

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const shape = normalizeLocalDeliveryZoneShape(readFormString(record.shape));
    const minDays = normalizeNullableInteger(record.minDays ?? record.min_days, 0, 120);
    const rawMaxDays = normalizeNullableInteger(record.maxDays ?? record.max_days, 0, 120);
    const maxDays = minDays !== null && rawMaxDays !== null && rawMaxDays < minDays ? minDays : rawMaxDays;

    zones.push({
      id: normalizeOptionalText(readFormString(record.id), 80) ?? randomUUID(),
      name: normalizeOptionalText(readFormString(record.name), 80) ?? `Zona local ${zones.length + 1}`,
      active: readBoolean(record.active) ?? false,
      shape,
      baseAddress: normalizeOptionalText(readFormString(record.baseAddress ?? record.base_address), 220),
      baseLatitude: normalizeNullableCoordinate(record.baseLatitude ?? record.base_latitude, -90, 90),
      baseLongitude: normalizeNullableCoordinate(record.baseLongitude ?? record.base_longitude, -180, 180),
      radiusKm: normalizeNullableDecimal(record.radiusKm ?? record.radius_km, 0.1, 200),
      polygon: normalizeGeoPoints(record.polygon),
      neighborhoods: readTextList(record.neighborhoods, 80),
      cities: readTextList(record.cities, 80),
      price: normalizeOptionalText(readFormString(record.price), 40),
      minDays,
      maxDays,
      freeDeliveryThreshold: normalizeOptionalText(readFormString(record.freeDeliveryThreshold ?? record.free_delivery_threshold), 40),
      orderMinimum: normalizeOptionalText(readFormString(record.orderMinimum ?? record.order_minimum), 40),
      notes: normalizeOptionalText(readFormString(record.notes), 220),
    });

    if (zones.length >= 40) break;
  }

  return zones;
}

function serializeLocalDeliveryZone(zone: SalesCatalogLocalDeliveryZone) {
  return {
    id: zone.id,
    name: zone.name,
    active: zone.active,
    shape: zone.shape,
    base_address: zone.baseAddress,
    base_latitude: zone.baseLatitude,
    base_longitude: zone.baseLongitude,
    radius_km: zone.radiusKm,
    polygon: zone.polygon.map((point) => ({ lat: point.lat, lng: point.lng })),
    neighborhoods: zone.neighborhoods,
    cities: zone.cities,
    price: zone.price,
    min_days: zone.minDays,
    max_days: zone.maxDays,
    free_delivery_threshold: zone.freeDeliveryThreshold,
    order_minimum: zone.orderMinimum,
    notes: zone.notes,
  };
}

function formatLocalDeliveryZoneContent(zone: SalesCatalogLocalDeliveryZone) {
  const parts = [
    `tipo ${formatLocalDeliveryShapeLabel(zone.shape)}`,
    zone.price ? `taxa ${zone.price}` : "",
    zone.minDays !== null || zone.maxDays !== null ? `prazo ${formatShippingDeadline(zone.minDays, zone.maxDays)}` : "",
    zone.orderMinimum ? `pedido minimo ${zone.orderMinimum}` : "",
    zone.freeDeliveryThreshold ? `gratis acima de ${zone.freeDeliveryThreshold}` : "",
    formatLocalDeliveryScope(zone),
    zone.notes ? `observacao ${zone.notes}` : "",
  ].filter(Boolean);

  return `- ${zone.name}: ${parts.join(", ")}`;
}

function formatLocalDeliveryScope(zone: SalesCatalogLocalDeliveryZone) {
  if (zone.shape === "neighborhoods") {
    const neighborhoods = zone.neighborhoods.length ? `bairros ${zone.neighborhoods.join(", ")}` : "";
    const cities = zone.cities.length ? `cidades ${zone.cities.join(", ")}` : "";
    return [neighborhoods, cities].filter(Boolean).join("; ") || "bairros/cidades pendentes";
  }

  if (zone.shape === "polygon") {
    if (zone.polygon.length >= 3) {
      return `${zone.polygon.length} pontos desenhados no mapa`;
    }

    const base = zone.baseAddress || (isValidGeoPoint(zone.baseLatitude, zone.baseLongitude)
      ? `${zone.baseLatitude}, ${zone.baseLongitude}`
      : "base pendente");

    return zone.radiusKm ? `ate ${zone.radiusKm} km de ${base}` : `raio pendente de ${base}`;
  }

  const base = zone.baseAddress || (isValidGeoPoint(zone.baseLatitude, zone.baseLongitude)
    ? `${zone.baseLatitude}, ${zone.baseLongitude}`
    : "base pendente");

  return zone.radiusKm ? `ate ${zone.radiusKm} km de ${base}` : `raio pendente de ${base}`;
}

function formatLocalDeliveryShapeLabel(shape: SalesCatalogLocalDeliveryZoneShape) {
  if (shape === "neighborhoods") return "bairros";
  if (shape === "polygon") return "mapa";
  return "raio";
}

function normalizeLocalDeliveryZoneShape(value: string | null): SalesCatalogLocalDeliveryZoneShape {
  if (value === "neighborhoods" || value === "polygon") return value;
  return "radius";
}

function normalizeGeoPoints(value: unknown): SalesCatalogGeoPoint[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 80)
    .map((item): SalesCatalogGeoPoint | null => {
      const record = readRecord(item);
      if (!record) return null;

      const lat = normalizeNullableCoordinate(record.lat ?? record.latitude, -90, 90);
      const lng = normalizeNullableCoordinate(record.lng ?? record.longitude, -180, 180);

      return toValidGeoPoint(lat, lng);
    })
    .filter((point): point is SalesCatalogGeoPoint => Boolean(point));
}

function readTextList(value: unknown, maxLength: number) {
  const source = typeof value === "string"
    ? value.split(/[\n,;]/g)
    : Array.isArray(value)
      ? value.map((item) => readFormString(item))
      : [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of source) {
    const text = normalizeOptionalText(readFormString(item), maxLength);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    output.push(text);
  }

  return output;
}

function isValidGeoPoint(lat: number | null, lng: number | null) {
  return toValidGeoPoint(lat, lng) !== null;
}

function toValidGeoPoint(lat: number | null, lng: number | null): SalesCatalogGeoPoint | null {
  return typeof lat === "number"
    && Number.isFinite(lat)
    && Math.abs(lat) <= 90
    && typeof lng === "number"
    && Number.isFinite(lng)
    && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
}

function normalizeShippingServices(value: unknown, fallback: SalesCatalogShippingService[]): SalesCatalogShippingService[] {
  const source = Array.isArray(value) ? value : [];
  const servicesById = new Map((fallback.length > 0 ? fallback : createDefaultSalesCatalogShippingServices()).map((service) => [service.id, cloneShippingService(service)]));

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const id = normalizeOptionalText(readFormString(record.id), 60);
    if (!id) continue;

    const fallbackService = servicesById.get(id);
    servicesById.set(id, {
      id,
      provider: normalizeShippingProvider(readFormString(record.provider), fallbackService?.provider),
      name: normalizeOptionalText(readFormString(record.name), 80) ?? fallbackService?.name ?? id,
      active: readBoolean(record.active) ?? fallbackService?.active ?? false,
      tiers: normalizeWeightTiers(record.tiers, fallbackService?.tiers ?? []),
    });
  }

  return Array.from(servicesById.values());
}

function normalizeWeightTiers(value: unknown, fallback: SalesCatalogShippingWeightTier[]): SalesCatalogShippingWeightTier[] {
  const source = Array.isArray(value) ? value : fallback;
  const tiers: SalesCatalogShippingWeightTier[] = [];

  for (const item of source) {
    const record = readRecord(item);
    if (!record) continue;

    const maxWeightGrams = normalizeNullableInteger(record.maxWeightGrams ?? record.max_weight_grams, 1, 500000);
    const id = normalizeOptionalText(readFormString(record.id), 60) ?? (maxWeightGrams ? `tier_${maxWeightGrams}` : randomUUID());

    tiers.push({
      id,
      name: normalizeOptionalText(readFormString(record.name), 80) ?? (maxWeightGrams ? `Ate ${maxWeightGrams} g` : "Faixa"),
      active: readBoolean(record.active) ?? true,
      maxWeightGrams,
      price: normalizeOptionalText(readFormString(record.price), 40),
      minDays: normalizeNullableInteger(record.minDays ?? record.min_days, 0, 120),
      maxDays: normalizeNullableInteger(record.maxDays ?? record.max_days, 0, 120),
    });

    if (tiers.length >= 12) break;
  }

  return tiers.length > 0 ? tiers : fallback.map((tier) => ({ ...tier }));
}

function serializeShippingService(service: SalesCatalogShippingService) {
  return {
    id: service.id,
    provider: service.provider,
    name: service.name,
    active: service.active,
    tiers: service.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      active: tier.active,
      max_weight_grams: tier.maxWeightGrams,
      price: tier.price,
      min_days: tier.minDays,
      max_days: tier.maxDays,
    })),
  };
}

function cloneShippingService(service: SalesCatalogShippingService): SalesCatalogShippingService {
  return {
    ...service,
    tiers: service.tiers.map((tier) => ({ ...tier })),
  };
}

function normalizeShippingProvider(value: string | null, fallback?: SalesCatalogShippingProvider): SalesCatalogShippingProvider {
  if (value === "correios" || value === "carrier") return value;
  return fallback ?? "carrier";
}

function normalizeSkuStatus(value: string | null): SalesCatalogSkuStatus {
  if (value === "draft" || value === "archived") return value;
  return "active";
}

function normalizeSkuCode(value: string | null) {
  if (!value) return null;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return normalized || null;
}

function createSkuCode(title: string, id: string) {
  return `${createAttributeId(title).toUpperCase().replace(/_/g, "-").slice(0, 24) || "SKU"}-${id.slice(0, 6).toUpperCase()}`;
}

function formatShippingDeadline(minDays: number | null, maxDays: number | null) {
  if (minDays !== null && maxDays !== null) return `${minDays}-${maxDays} dia(s)`;
  if (minDays !== null) return `a partir de ${minDays} dia(s)`;
  if (maxDays !== null) return `ate ${maxDays} dia(s)`;
  return "a combinar";
}

function normalizeShippingProfile(value: string | null): SalesCatalogShippingProfile {
  if (value === "free" || value === "custom") return value;
  return "default";
}

function normalizeStockStatus(value: string | null): SalesCatalogStockStatus {
  if (value === "out_of_stock" || value === "on_backorder") return value;
  return "in_stock";
}

function normalizeFulfillmentMode(value: string | null): SalesCatalogFulfillmentMode {
  if (value === "digital" || value === "service" || value === "subscription") return value;
  return "physical";
}

function normalizeSalesCatalogOrderStatus(
  value: string | null,
  fallback: SalesCatalogOrderStatus,
): SalesCatalogOrderStatus {
  return normalizeNullableSalesCatalogOrderStatus(value) ?? fallback;
}

function normalizeNullableSalesCatalogOrderStatus(value: string | null): SalesCatalogOrderStatus | null {
  if (
    value === "draft"
    || value === "pending_payment"
    || value === "paid"
    || value === "in_preparation"
    || value === "shipped"
    || value === "delivered"
    || value === "cancelled"
    || value === "needs_human"
  ) {
    return value;
  }

  return null;
}

function normalizeSalesCatalogPaymentStatus(
  value: string | null,
  fallback: SalesCatalogPaymentStatus,
): SalesCatalogPaymentStatus {
  return normalizeNullableSalesCatalogPaymentStatus(value) ?? fallback;
}

function normalizeNullableSalesCatalogPaymentStatus(value: string | null): SalesCatalogPaymentStatus | null {
  if (value === "pending" || value === "proof_sent" || value === "confirmed" || value === "failed" || value === "refunded") {
    return value;
  }

  return null;
}

function normalizeSalesCatalogFulfillmentStatus(
  value: string | null,
  fallback: SalesCatalogFulfillmentStatus,
): SalesCatalogFulfillmentStatus {
  return normalizeNullableSalesCatalogFulfillmentStatus(value) ?? fallback;
}

function normalizeNullableSalesCatalogFulfillmentStatus(value: string | null): SalesCatalogFulfillmentStatus | null {
  if (value === "pending" || value === "scheduled" || value === "in_progress" || value === "fulfilled" || value === "cancelled") {
    return value;
  }

  return null;
}

function normalizeCommercialFlowType(value: string | null) {
  if (value === "connectyhub_resale" || value === "connectyhub_direct" || value === "external_marketplace") return value;
  return "client_direct";
}

function normalizeRevenueOwnerType(value: string | null) {
  if (value === "connectyhub" || value === "split" || value === "external_provider") return value;
  return "client";
}

function normalizeCommissionPolicyType(value: string | null) {
  if (value === "percentage" || value === "fixed" || value === "custom") return value;
  return "none";
}

function readSalesCatalogCartCheckoutItems(value: unknown): SalesCatalogCartCheckoutItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 50).map((entry, index) => {
    const record = readRecord(entry);

    if (!record) {
      throw new Error(`Item ${index + 1} da sacola esta invalido.`);
    }

    const source = readFormString(record.source) === "catalog" ? "catalog" : "manual";
    const catalogItemId = source === "catalog"
      ? readFormString(record.catalogItemId) ?? readFormString(record.id)
      : null;
    const name = normalizeOptionalText(readFormString(record.name) ?? readFormString(record.title), 140)
      ?? `Item ${index + 1}`;
    const note = normalizeOptionalText(readFormString(record.note), 140);
    const quantity = normalizeNullableInteger(record.quantity, 1, 1000) ?? 1;
    const unitPriceCents = normalizeNullableInteger(record.unitPriceCents, 1, maxCartCheckoutItemUnitPriceCents)
      ?? parseSalesCatalogMoneyToCents(readFormString(record.unitPrice))
      ?? parseSalesCatalogMoneyToCents(readFormString(record.price))
      ?? 0;

    if (source === "catalog" && !catalogItemId) {
      throw new Error(`O item ${index + 1} da sacola perdeu o vinculo com o catalogo.`);
    }

    if (unitPriceCents <= 0) {
      throw new Error(`Informe um valor valido para "${name}".`);
    }

    return {
      catalogItemId,
      name,
      note,
      quantity,
      source,
      unitPriceCents,
    };
  });
}

function getSalesCatalogCheckoutItemPriceCents(item: ReturnType<typeof mapSalesCatalogItem>) {
  const sku = item.skus.find((entry) => entry.status === "active") ?? item.skus[0] ?? null;
  const candidates = [
    item.offer.salePrice,
    item.price,
    sku?.salePrice,
    sku?.price,
  ];

  for (const candidate of candidates) {
    const cents = parseSalesCatalogMoneyToCents(candidate);

    if (cents && cents > 0) {
      return cents;
    }
  }

  return 0;
}

function parseSalesCatalogMoneyToCents(value: string | null | undefined) {
  const cleaned = value?.replace(/[^\d,.-]/g, "") ?? "";

  if (!cleaned) {
    return null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;
  let normalized = cleaned;

  if (decimalSeparator) {
    const separatorIndex = decimalSeparator === "," ? lastComma : lastDot;
    const integerPart = cleaned.slice(0, separatorIndex).replace(/[^\d-]/g, "");
    const decimalPart = cleaned.slice(separatorIndex + 1).replace(/\D/g, "");
    normalized = decimalPart.length <= 2 && decimalPart.length > 0
      ? `${integerPart}.${decimalPart}`
      : cleaned.replace(/[^\d-]/g, "");
  } else {
    normalized = cleaned.replace(/[^\d-]/g, "");
  }

  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

function formatSalesCatalogMoneyCents(value: number) {
  return (Math.max(0, Math.round(value)) / 100).toFixed(2);
}

function normalizeUf(value: string | null) {
  if (!value) return null;
  const uf = value.toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : null;
}

function normalizeUuid(value: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function normalizeNullableInteger(value: unknown, min: number, max: number) {
  const number = normalizeNumber(value);
  if (number === null) return null;

  const integer = Math.round(number);
  if (integer < min || integer > max) return null;

  return integer;
}

function normalizeNullableDecimal(value: unknown, min: number, max: number) {
  const number = normalizeNumber(value);
  if (number === null || number < min || number > max) return null;

  return Math.round(number * 100) / 100;
}

function normalizeNullableCoordinate(value: unknown, min: number, max: number) {
  const number = normalizeNumber(value);
  if (number === null || number < min || number > max) return null;

  return Math.round(number * 1_000_000) / 1_000_000;
}

function normalizeNumber(value: unknown) {
  const source = typeof value === "string" ? value.replace(",", ".").trim() : value;
  const number = typeof source === "number" ? source : typeof source === "string" && source ? Number(source) : Number.NaN;

  return Number.isFinite(number) ? number : null;
}

function sanitizeFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || "arquivo";
}

function isFormFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.name.trim().length > 0;
}

function formatRouteError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;

  return {
    error: message || fallback,
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function statusForRouteError(error: unknown, fallback: number) {
  const scopeStatus = statusForDashboardCompanyScopeError(error, 0);
  if (scopeStatus) return scopeStatus;

  if (isStorageQuotaError(error)) return error.status;

  return error instanceof BillingAccessError ? 402 : fallback;
}

function readFormString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .map((item) => normalizeUuid(readFormString(item)))
      .filter((item): item is string => Boolean(item)),
  ));
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readFormBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "off") return false;
  return null;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function createAttributeId(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "atributo";
}
