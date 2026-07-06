import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { mapSalesCatalogItem, mapSalesCatalogSettings, mapSalesCatalogShippingSettings } from "@/lib/client-os/sales-catalog";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  brazilianStates,
  buildSalesCatalogContent,
  createSalesCatalogTag,
  defaultSalesCatalogShippingRules,
  createDefaultSalesCatalogShippingServices,
  getSalesCatalogReadiness,
  resolveSalesCatalogMediaKind,
  salesCatalogBusinessTemplates,
  type SalesCatalogAttribute,
  type SalesCatalogBusinessType,
  type SalesCatalogItemStatus,
  type SalesCatalogItemAttribute,
  type SalesCatalogMedia,
  type SalesCatalogProductShipping,
  type SalesCatalogShippingProvider,
  type SalesCatalogShippingProfile,
  type SalesCatalogShippingRule,
  type SalesCatalogShippingService,
  type SalesCatalogShippingWeightTier,
} from "@/lib/sales-catalog/shared";
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
  const title = normalizeTitle(readFormString(formData.get("title")));
  const description = normalizeDescription(readFormString(formData.get("description")));
  const category = normalizeOptionalText(readFormString(formData.get("category")), 80);
  const price = normalizeOptionalText(readFormString(formData.get("price")), 60);
  const currency = normalizeOptionalText(readFormString(formData.get("currency")), 12) ?? "BRL";
  const status = normalizeStatus(readFormString(formData.get("status")));
  const attributes = readItemAttributesPayload(formData.get("attributes"));
  const shipping = readProductShippingPayload(formData);
  const files = formData.getAll("files").filter(isFormFile);

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
    const configResult = files.length > 0 ? await loadR2Config(client) : null;

    if (configResult && !configResult.ok) {
      return NextResponse.json({ error: configResult.error }, { status: 503 });
    }

    const itemId = randomUUID();
    const now = new Date().toISOString();
    const media: SalesCatalogMedia[] = [];

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

    const tag = createSalesCatalogTag(title, itemId);
    const content = buildSalesCatalogContent({ title, description, category, price, currency, media, attributes, shipping });
    const metadata = {
      title,
      description,
      category,
      price,
      currency,
      status,
      tag,
      attributes: serializeItemAttributes(attributes),
      shipping: serializeProductShipping(shipping),
      media: media.map((item) => ({
        id: item.id,
        file_name: item.fileName,
        content_type: item.contentType,
        size: item.size,
        storage_url: item.storageUrl,
        kind: item.kind,
        created_at: item.createdAt,
      })),
      source: "manual",
      readiness: getSalesCatalogReadiness({ description, media }),
      created_by: workspace.user.id,
    };

    const { data, error } = await client
      .from("intelligence_memory")
      .insert({
        id: itemId,
        scope: "organization",
        organization_id: company.id,
        memory_type: "sales_catalog_item",
        title,
        content,
        importance: 0.82,
        tags: ["sales_catalog_item", "sales_catalog", "whatsapp_agent", "lead_tracking"],
        metadata,
      })
      .select("id, organization_id, title, content, metadata, created_at, updated_at")
      .single<SalesCatalogMemoryRow>();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel cadastrar o produto." }, { status: 500 });
    }

    await client.from("intelligence_events").insert({
      scope: "organization",
      organization_id: company.id,
      source_type: "sales_catalog",
      source_id: data.id,
      event_type: "sales_catalog.item_created",
      title: `Produto cadastrado: ${title}`,
      summary: `Tag ${tag} criada para uso no agente WhatsApp.`,
      confidence: 1,
      visibility: "organization",
      tags: ["sales_catalog", "sales_catalog_item", "whatsapp_agent", "lead_tracking"],
      payload: {
        product_id: data.id,
        label: title,
        tag,
        media_count: media.length,
        created_by: workspace.user.id,
      },
    });

    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json({ item: mapSalesCatalogItem(data) });
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
  const now = new Date().toISOString();
  const metadata = {
    configured: true,
    business_type: businessType,
    categories,
    attributes,
    track_inventory: trackInventory,
    variation_media: variationMedia,
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

function normalizeUf(value: string | null) {
  if (!value) return null;
  const uf = value.toUpperCase();
  return /^[A-Z]{2}$/.test(uf) ? uf : null;
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
  return value instanceof File && value.size > 0;
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
