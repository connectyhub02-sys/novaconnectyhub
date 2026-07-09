import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
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
  brazilianStates,
  buildSalesCatalogContent,
  createDefaultSalesCatalogCommerceSettings,
  createSalesCatalogTag,
  defaultSalesCatalogShippingRules,
  createDefaultSalesCatalogShippingServices,
  emptySalesCatalogProductFulfillment,
  emptySalesCatalogProductInventory,
  emptySalesCatalogProductOffer,
  getSalesCatalogReadiness,
  resolveSalesCatalogMediaKind,
  salesCatalogLeadDataFields,
  salesCatalogPaymentMethodTemplates,
  salesCatalogBusinessTemplates,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogItemStatus,
  type SalesCatalogItemAttribute,
  type SalesCatalogLeadDataField,
  type SalesCatalogMedia,
  type SalesCatalogFulfillmentMode,
  type SalesCatalogFulfillmentStatus,
  type SalesCatalogPaymentMethod,
  type SalesCatalogPaymentMethodId,
  type SalesCatalogPaymentStatus,
  type SalesCatalogProductFulfillment,
  type SalesCatalogProductInventory,
  type SalesCatalogProductOffer,
  type SalesCatalogProductShipping,
  type SalesCatalogOrderStatus,
  type SalesCatalogReservationPolicy,
  type SalesCatalogShippingProvider,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
  type SalesCatalogStockStatus,
  type SalesCatalogWhatsAppMessageTemplates,
  type SalesCatalogSku,
  type SalesCatalogSkuStatus,
} from "@/lib/sales-catalog/shared";
import { encryptCredentialValue } from "@/lib/security/credentials-crypto";
import {
  buildMercadoPagoAuthorizationUrl,
  buildMercadoPagoWebhookUrl,
  isMercadoPagoTestTokenEnabled,
} from "@/lib/sales-catalog/mercado-pago";
import { createSalesCatalogPixPaymentSession } from "@/lib/sales-catalog/payment-sessions";
import { calculateSalesCatalogShippingQuotes, normalizeSalesCatalogCep } from "@/lib/sales-catalog/shipping-calculator";
import { importWhatsappCatalog, setWhatsappCatalogVisibility } from "@/lib/sales-catalog/whatsapp-sync";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxCatalogFiles = 8;
const maxCatalogFileBytes = 25 * 1024 * 1024;
const maxCatalogTotalBytes = 80 * 1024 * 1024;
const maxDescriptionLength = 1800;

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
  "metadata",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

const salesCatalogOrderItemSelect = "id, order_id, organization_id, catalog_item_id, sku_id, sku_code, title, tag, quantity, unit_price, sale_price, total, attributes, fulfillment, metadata, created_at";
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

  const companyId = readFormString(formData.get("companyId"));
  const requestedItemId = normalizeUuid(readFormString(formData.get("itemId")));
  const title = normalizeTitle(readFormString(formData.get("title")));
  const description = normalizeDescription(readFormString(formData.get("description")));
  const category = normalizeOptionalText(readFormString(formData.get("category")), 80);
  const price = normalizeOptionalText(readFormString(formData.get("price")), 60);
  const currency = normalizeOptionalText(readFormString(formData.get("currency")), 12) ?? "BRL";
  const status = normalizeStatus(readFormString(formData.get("status")));
  const attributes = readItemAttributesPayload(formData.get("attributes"));
  const inventory = readProductInventoryPayload(formData);
  const offer = readProductOfferPayload(formData);
  const fulfillment = readProductFulfillmentPayload(formData);
  const shipping = readProductShippingPayload(formData);
  const skus = readProductSkusPayload(formData.get("skus"));
  const files = formData.getAll("files").filter(isFormFile);
  const keepMediaIds = readKeepMediaIds(formData.get("keepMediaIds"));

  if (!companyId) {
    return NextResponse.json({ error: "Escolha uma empresa antes de cadastrar o produto." }, { status: 422 });
  }

  if (!title) {
    return NextResponse.json({ error: "Informe o nome do produto ou oferta." }, { status: 422 });
  }

  if (!description) {
    return NextResponse.json({ error: "Informe uma descricao comercial curta." }, { status: 422 });
  }

  const filesError = validateFiles(files);
  if (filesError) {
    return NextResponse.json({ error: filesError }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
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
    let media: SalesCatalogMedia[] = readSalesCatalogMediaMetadata(existingMetadata.media);
    if (existingRow && keepMediaIds) {
      media = media.filter((item) => keepMediaIds.has(item.id));
    }
    const existingMediaBytes = media.reduce((total, item) => total + item.size, 0);
    const uploadedBytes = files.reduce((total, file) => total + file.size, 0);

    if (media.length + files.length > maxCatalogFiles) {
      return NextResponse.json({ error: `O produto pode ter no maximo ${maxCatalogFiles} arquivos.` }, { status: 422 });
    }

    if (existingMediaBytes + uploadedBytes > maxCatalogTotalBytes) {
      return NextResponse.json({ error: "O total de arquivos do produto precisa ter ate 80 MB." }, { status: 422 });
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

    const tag = readFormString(existingMetadata.tag) ?? createSalesCatalogTag(title, itemId);
    const content = buildSalesCatalogContent({ title, description, category, price, currency, media, attributes, inventory, offer, fulfillment, shipping });
    const metadataSource = readFormString(existingMetadata.source) ?? "manual";
    const memoryTags = [
      "sales_catalog_item",
      "sales_catalog",
      ...(metadataSource === "whatsapp_catalog" ? ["whatsapp_catalog"] : []),
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
      attributes: serializeItemAttributes(attributes),
      inventory: serializeProductInventory(inventory),
      offer: serializeProductOffer(offer),
      fulfillment: serializeProductFulfillment(fulfillment),
      shipping: serializeProductShipping(shipping),
      media: serializeSalesCatalogMedia(media),
      skus: serializeSalesCatalogSkus(skus),
      source: metadataSource,
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
    const { data, error } = await query
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .single<SalesCatalogMemoryRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel salvar o produto." }, { status: 500 });
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
        coupon_code: offer.couponCode,
        fulfillment_mode: fulfillment.mode,
        actor_id: workspace.user.id,
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

    return NextResponse.json({ item: mapSalesCatalogItem(data), mode: existingRow ? "updated" : "created" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao cadastrar produto." }, { status: 500 });
  }
}

async function handleJsonPost(request: NextRequest, workspace: CurrentWorkspace) {
  const body = readRecord(await request.json().catch(() => null));
  const action = readFormString(body?.action);
  const companyId = readFormString(body?.companyId);

  if (!companyId) {
    return NextResponse.json({ error: "Escolha uma empresa antes de sincronizar o catalogo." }, { status: 422 });
  }

  try {
    const client = createServiceClient();

    if (action === "import_whatsapp_catalog") {
      const result = await importWhatsappCatalog({
        userId: workspace.user.id,
        companyId,
        catalogJid: readFormString(body?.catalogJid),
        client,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json(result);
    }

    if (action === "save_catalog_settings") {
      const settings = await saveCatalogSettings({
        client,
        companyId,
        userId: workspace.user.id,
        body,
      });

      revalidatePath("/dashboard/links");
      revalidatePath("/dashboard/whatsapp");

      return NextResponse.json({ settings });
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao sincronizar catalogo." }, { status: 500 });
  }
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
  const categories = normalizeStringList(input.body?.categories, template.categories, 30, 80);
  const attributes = normalizeSettingsAttributes(input.body?.attributes, template.attributes);
  const trackInventory = readBoolean(input.body?.trackInventory) ?? template.trackInventory;
  const variationMedia = readBoolean(input.body?.variationMedia) ?? template.variationMedia;
  const commerceDefaults = createDefaultSalesCatalogCommerceSettings();
  const paymentMethods = normalizePaymentMethods(input.body?.paymentMethods, commerceDefaults.paymentMethods);
  const orderPolicy = normalizeOrderPolicy(input.body?.orderPolicy, commerceDefaults.orderPolicy);
  const leadDataPolicy = normalizeLeadDataPolicy(input.body?.leadDataPolicy, commerceDefaults.leadDataPolicy);
  const messageTemplates = normalizeMessageTemplates(input.body?.messageTemplates, commerceDefaults.messageTemplates);
  const enabledPayments = paymentMethods.filter((method) => method.enabled);
  const now = new Date().toISOString();
  const metadata = {
    configured: true,
    business_type: businessType,
    categories,
    attributes,
    track_inventory: trackInventory,
    variation_media: variationMedia,
    payment_methods: paymentMethods.map(serializePaymentMethod),
    order_policy: serializeOrderPolicy(orderPolicy),
    lead_data_policy: serializeLeadDataPolicy(leadDataPolicy),
    message_templates: serializeMessageTemplates(messageTemplates),
    updated_by: input.userId,
    updated_from: "sales_catalog_setup",
  };
  const content = [
    `Tipo: ${template.label}`,
    categories.length ? `Categorias: ${categories.join(", ")}` : "",
    attributes.length ? "Variacoes:" : "",
    ...attributes.map((attribute) => `- ${attribute.name}: ${attribute.values.join(", ")}`),
    trackInventory ? "Controle de estoque por variacao: sim" : "Controle de estoque por variacao: nao",
    variationMedia ? "Midia por variacao: sim" : "Midia por variacao: nao",
    enabledPayments.length ? `Pagamentos: ${enabledPayments.map((method) => method.label).join(", ")}` : "Pagamentos: acionar humano",
    `Reserva do pedido: ${formatReservationPolicy(orderPolicy.reservationPolicy)}`,
    orderPolicy.minimumOrderValue ? `Pedido minimo: ${orderPolicy.minimumOrderValue}` : "",
    `CEP antes do frete: ${orderPolicy.askCepBeforeQuote ? "sim" : "nao"}`,
    leadDataPolicy.requiredFields.length ? `Dados do lead: ${leadDataPolicy.requiredFields.join(", ")}` : "",
    `Mensagem de resumo: ${messageTemplates.orderSummary}`,
  ].filter(Boolean).join("\n");
  const { data: existing, error: existingError } = await input.client
    .from("intelligence_memory")
    .select("id")
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("memory_type", "sales_catalog_settings")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw new Error(`Nao foi possivel verificar a configuracao atual: ${existingError.message}`);
  }

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
      attributes_count: attributes.length,
      track_inventory: trackInventory,
      variation_media: variationMedia,
      payment_methods_count: enabledPayments.length,
      reservation_policy: orderPolicy.reservationPolicy,
      required_lead_fields: leadDataPolicy.requiredFields,
      updated_by: input.userId,
    },
  });

  return mapSalesCatalogSettings(data);
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
  const localPickup = readBoolean(input.body?.localPickup) ?? false;
  const originCep = normalizeSalesCatalogCep(readFormString(input.body?.originCep));
  const defaultHandlingDays = normalizeNullableInteger(input.body?.defaultHandlingDays, 0, 45);
  const activeRules = rules.filter((rule) => rule.active);
  const now = new Date().toISOString();
  const metadata = {
    configured: true,
    local_pickup: localPickup,
    origin_cep: originCep,
    default_handling_days: defaultHandlingDays,
    rules: rules.map(serializeShippingRule),
    updated_by: input.userId,
    updated_from: "sales_catalog_shipping",
  };
  const content = [
    originCep ? `CEP de origem: ${originCep}` : "",
    localPickup ? "Retirada local: sim" : "Retirada local: nao",
    defaultHandlingDays !== null ? `Prazo de separacao: ${defaultHandlingDays} dia(s)` : "",
    activeRules.length ? "Estados atendidos:" : "Nenhum estado atendido foi marcado.",
    ...activeRules.map(formatShippingRuleContent),
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
    summary: `${activeRules.length} estado(s) atendido(s) configurado(s).`,
    confidence: 1,
    visibility: "organization",
    tags: ["sales_catalog", "sales_catalog_shipping", "whatsapp_agent"],
    payload: {
      active_states_count: activeRules.length,
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
  const companyId = readFormString(body?.companyId);
  const itemId = readFormString(body?.itemId);

  if (!companyId || !itemId) {
    return NextResponse.json({ error: "Informe a empresa e o produto para excluir." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({ userId: workspace.user.id, companyId, client });
    const { data, error } = await client
      .from("intelligence_memory")
      .delete()
      .eq("id", itemId)
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("memory_type", "sales_catalog_item")
      .select("id, title, metadata")
      .maybeSingle<{ id: string; title: string; metadata: JsonRecord | null }>();

    if (error) {
      return NextResponse.json({ error: `Nao foi possivel excluir: ${error.message}` }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Produto nao encontrado para esta empresa." }, { status: 404 });
    }

    const metadata = readRecord(data.metadata) ?? {};
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
      },
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json({ deletedItemId: data.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir produto." }, { status: 500 });
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
      return "Cada arquivo precisa ter ate 25 MB.";
    }

    const contentType = normalizeContentType(file);
    if (!isAllowedCatalogFile(contentType, file.name)) {
      return "Use imagens, videos, PDF, DOC, DOCX ou arquivos de texto.";
    }
  }

  if (total > maxCatalogTotalBytes) {
    return "O total de arquivos precisa ter ate 80 MB.";
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
    kind: item.kind,
    created_at: item.createdAt,
  }));
}

function readKeepMediaIds(value: unknown) {
  if (typeof value !== "string") return null;

  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return null;

  const ids = new Set<string>();
  for (const item of parsed) {
    const id = readFormString(item);
    if (id) ids.add(id);
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
  ]).has(contentType) || /\.(pdf|doc|docx|txt|md|csv)$/i.test(fileName);
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
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
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

function normalizeOrderPolicy(value: unknown, fallback: ReturnType<typeof createDefaultSalesCatalogCommerceSettings>["orderPolicy"]) {
  const record = readRecord(value);
  if (!record) return fallback;

  const abandonedCartMinutes = normalizeNullableInteger(record.abandonedCartMinutes ?? record.abandoned_cart_minutes, 0, 10080);
  const followUpDays = normalizeNullableInteger(record.followUpDays ?? record.follow_up_days, 0, 365);

  return {
    minimumOrderValue: normalizeOptionalText(readFormString(record.minimumOrderValue ?? record.minimum_order_value), 40) ?? fallback.minimumOrderValue,
    reservationPolicy: normalizeReservationPolicy(readFormString(record.reservationPolicy ?? record.reservation_policy)),
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
    unavailableItem: normalizeOptionalText(readFormString(record.unavailableItem ?? record.unavailable_item), 240) ?? fallback.unavailableItem,
    humanHandoff: normalizeOptionalText(readFormString(record.humanHandoff ?? record.human_handoff), 240) ?? fallback.humanHandoff,
  };
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
    unavailable_item: templates.unavailableItem,
    human_handoff: templates.humanHandoff,
  };
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
  const parts = [
    rule.price ? `frete ${rule.price}` : "frete a combinar",
    rule.minDays !== null || rule.maxDays !== null ? `prazo ${formatShippingDeadline(rule.minDays, rule.maxDays)}` : "",
    rule.cepStart && rule.cepEnd ? `CEP ${rule.cepStart}-${rule.cepEnd}` : "",
    activeServices.length ? `servicos ${activeServices.map((service) => service.name).join(", ")}` : "",
    rule.freeShippingThreshold ? `gratis acima de ${rule.freeShippingThreshold}` : "",
  ].filter(Boolean);

  return `- ${rule.uf} (${rule.state}): ${parts.join(", ") || "atendido"}`;
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

function readFormString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
