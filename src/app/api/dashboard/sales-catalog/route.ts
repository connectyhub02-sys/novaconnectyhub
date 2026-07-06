import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  buildSalesCatalogContent,
  createSalesCatalogTag,
  getSalesCatalogReadiness,
  resolveSalesCatalogMediaKind,
  type SalesCatalogItemStatus,
  type SalesCatalogMedia,
} from "@/lib/sales-catalog/shared";
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

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
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
    const content = buildSalesCatalogContent({ title, description, category, price, currency, media });
    const metadata = {
      title,
      description,
      category,
      price,
      currency,
      status,
      tag,
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
