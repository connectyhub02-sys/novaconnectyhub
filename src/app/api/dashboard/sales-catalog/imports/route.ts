import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import {
  createSalesCatalogImportJob,
  listSalesCatalogImportJobs,
  salesCatalogImportProcessRequestedEventName,
  type SalesCatalogImportAssignmentScope,
  type SalesCatalogImportDestination,
  type SalesCatalogImportFileInput,
  type SalesCatalogImportPlatform,
  type SalesCatalogImportSourceKind,
  type SalesCatalogImportTargetMode,
} from "@/lib/sales-catalog/importer";
import { inngest } from "@/lib/inngest/client";
import { assertStorageUploadAllowed, isStorageQuotaError } from "@/lib/storage/quotas";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxImportFiles = 6;
const maxImportFileBytes = 12 * 1024 * 1024;
const maxImportTotalBytes = 36 * 1024 * 1024;
const maxImportFileTextChars = 60000;

const allowedImportMimeTypes = new Set([
  "application/json",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values",
]);

type ImportPlatformFileRule = {
  defaultSourceKind: SalesCatalogImportSourceKind;
  acceptedSourceKinds: SalesCatalogImportSourceKind[];
  fileTypeLabel: string;
  example: string;
};

const importPlatformFileRules: Record<SalesCatalogImportPlatform, ImportPlatformFileRule> = {
  auto: {
    defaultSourceKind: "mixed",
    acceptedSourceKinds: ["text", "csv", "excel", "pdf", "image"],
    fileTypeLabel: "TXT, CSV, Excel, PDF ou imagem",
    example: "CSV, Excel, PDF, foto do cardapio ou TXT com lista de produtos.",
  },
  anota_ai: {
    defaultSourceKind: "mixed",
    acceptedSourceKinds: ["csv", "excel", "pdf", "image"],
    fileTypeLabel: "exportacao, planilha, PDF ou foto",
    example: "exportacao do cardapio do Anota Ai, planilha, PDF ou foto legivel.",
  },
  woocommerce: {
    defaultSourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    fileTypeLabel: "CSV do WooCommerce",
    example: "Produtos > Exportar > Gerar CSV.",
  },
  shopify: {
    defaultSourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    fileTypeLabel: "CSV do Shopify",
    example: "Products export CSV do Shopify.",
  },
  wix: {
    defaultSourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    fileTypeLabel: "CSV do Wix Stores",
    example: "exportacao CSV de produtos do Wix Stores.",
  },
  nuvemshop: {
    defaultSourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    fileTypeLabel: "CSV da Nuvemshop",
    example: "exportacao CSV de produtos da Nuvemshop.",
  },
  loja_integrada: {
    defaultSourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    fileTypeLabel: "CSV da Loja Integrada",
    example: "exportacao CSV de produtos da Loja Integrada.",
  },
  tray: {
    defaultSourceKind: "csv",
    acceptedSourceKinds: ["csv"],
    fileTypeLabel: "CSV da Tray",
    example: "exportacao CSV de produtos da Tray.",
  },
  ifood: {
    defaultSourceKind: "mixed",
    acceptedSourceKinds: ["csv", "excel", "pdf", "image"],
    fileTypeLabel: "cardapio, planilha, PDF ou foto",
    example: "planilha do cardapio, PDF do menu ou foto legivel.",
  },
  generic_menu: {
    defaultSourceKind: "mixed",
    acceptedSourceKinds: ["pdf", "image"],
    fileTypeLabel: "PDF ou imagem",
    example: "PDF do cardapio ou foto clara do menu.",
  },
  generic_sheet: {
    defaultSourceKind: "excel",
    acceptedSourceKinds: ["csv", "excel"],
    fileTypeLabel: "CSV ou Excel",
    example: "planilha com Produto, Descricao, Preco, Categoria, Estoque, SKU e URL da imagem.",
  },
};

type JsonRecord = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: readString(request.nextUrl.searchParams.get("companyId")),
      missingMessage: "Escolha uma empresa antes de carregar importacoes.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    const importJobs = await listSalesCatalogImportJobs({
      client,
      companyId: company.id,
      limit: 12,
    });

    return NextResponse.json({ importJobs });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao carregar importacoes."), { status: statusForRouteError(error, 500) });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const payload = await readImportRequest(request);
    const client = createServiceClient();
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: payload.companyId,
      missingMessage: "Escolha uma empresa antes de importar produtos.",
    });
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });
    const assignmentScope = await resolveImportAssignmentScope({
      client,
      companyId: company.id,
      assignedAgentIds: payload.assignedAgentIds,
      assignedWhatsappInstanceIds: payload.assignedWhatsappInstanceIds,
    });

    if (payload.sourceUrl || payload.sourceKind === "site") {
      return NextResponse.json({ error: "Importacao por link foi desativada. Anexe um arquivo do catalogo para importar." }, { status: 422 });
    }

    if (payload.files.length === 0) {
      return NextResponse.json({ error: "Anexe um arquivo legivel para importar produtos com IA." }, { status: 422 });
    }

    await assertStorageUploadAllowed({
      client,
      organizationId: company.id,
      category: "import_source",
      files: payload.files.map((file) => ({
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.size,
      })),
    });

    const importJob = await createSalesCatalogImportJob({
      client,
      companyId: company.id,
      userId: workspace.user.id,
      sourceKind: payload.sourceKind,
      sourcePlatform: payload.sourcePlatform,
      targetMode: payload.targetMode,
      defaultSalesDestination: payload.defaultSalesDestination,
      text: payload.text,
      sourceUrl: payload.sourceUrl,
      files: payload.files,
      title: payload.title,
      assignedAgentIds: assignmentScope.assignedAgentIds,
      assignedWhatsappInstanceIds: assignmentScope.assignedWhatsappInstanceIds,
    });

    await inngest.send({
      name: salesCatalogImportProcessRequestedEventName,
      data: {
        jobId: importJob.id,
        companyId: company.id,
        sourceKind: payload.sourceKind,
        sourcePlatform: payload.sourcePlatform,
      },
    }).catch(() => null);

    return NextResponse.json({ importJob });
  } catch (error) {
    return NextResponse.json(formatRouteError(error, "Erro ao importar produtos."), { status: statusForRouteError(error, 500) });
  }
}

async function readImportRequest(request: NextRequest) {
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);

    if (!formData) {
      throw new Error("Envie os dados da importacao em multipart/form-data.");
    }

    const files = await readImportFiles(formData.getAll("files"));
    const sourcePlatform = normalizeImportPlatform(readString(formData.get("sourcePlatform")));
    const requestedSourceKind = normalizeSourceKind(readString(formData.get("sourceKind")) ?? inferSourceKindFromFiles(files));
    assertImportFilesMatchPlatform(sourcePlatform, files);

    return {
      companyId: readString(formData.get("companyId")),
      sourceKind: resolveSourceKindForPlatform(sourcePlatform, requestedSourceKind, files),
      sourcePlatform,
      targetMode: normalizeTargetMode(readString(formData.get("targetMode"))),
      defaultSalesDestination: normalizeSalesDestination(readString(formData.get("defaultSalesDestination"))),
      text: readString(formData.get("text")),
      sourceUrl: readString(formData.get("sourceUrl")),
      title: readString(formData.get("title")),
      assignedAgentIds: readUuidListPayload(formData.get("assignedAgentIds")),
      assignedWhatsappInstanceIds: readUuidListPayload(formData.get("assignedWhatsappInstanceIds")),
      files,
    };
  }

  const body = readRecord(await request.json().catch(() => null)) ?? {};

  const sourcePlatform = normalizeImportPlatform(readString(body.sourcePlatform));
  const requestedSourceKind = normalizeSourceKind(readString(body.sourceKind));

  return {
    companyId: readString(body.companyId),
    sourceKind: resolveSourceKindForPlatform(sourcePlatform, requestedSourceKind, []),
    sourcePlatform,
    targetMode: normalizeTargetMode(readString(body.targetMode)),
    defaultSalesDestination: normalizeSalesDestination(readString(body.defaultSalesDestination)),
    text: readString(body.text),
    sourceUrl: readString(body.sourceUrl),
    title: readString(body.title),
    assignedAgentIds: readUuidListPayload(body.assignedAgentIds),
    assignedWhatsappInstanceIds: readUuidListPayload(body.assignedWhatsappInstanceIds),
    files: [] as SalesCatalogImportFileInput[],
  };
}

async function resolveImportAssignmentScope(input: {
  client: ReturnType<typeof createServiceClient>;
  companyId: string;
  assignedAgentIds: string[];
  assignedWhatsappInstanceIds: string[];
}): Promise<SalesCatalogImportAssignmentScope> {
  const requestedAgentIds = uniqueStringList(input.assignedAgentIds);
  const requestedWhatsappInstanceIds = uniqueStringList(input.assignedWhatsappInstanceIds);

  if (requestedWhatsappInstanceIds.length > 0) {
    const { data, error } = await input.client
      .from("whatsapp_instances")
      .select("id")
      .eq("organization_id", input.companyId)
      .neq("status", "archived")
      .in("id", requestedWhatsappInstanceIds);

    if (error) {
      throw new Error(`Nao foi possivel validar o WhatsApp selecionado: ${error.message}`);
    }

    const validIds = new Set((data ?? [])
      .map((row) => readString((row as { id?: unknown }).id))
      .filter((id): id is string => Boolean(id)));
    const invalidIds = requestedWhatsappInstanceIds.filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      throw new Error("Escolha um WhatsApp da empresa selecionada para importar produtos.");
    }
  }

  if (requestedAgentIds.length > 0) {
    const { data, error } = await input.client
      .from("agent_registry")
      .select("id")
      .eq("organization_id", input.companyId)
      .neq("status", "archived")
      .in("id", requestedAgentIds);

    if (error) {
      throw new Error(`Nao foi possivel validar o agente selecionado: ${error.message}`);
    }

    const validIds = new Set((data ?? [])
      .map((row) => readString((row as { id?: unknown }).id))
      .filter((id): id is string => Boolean(id)));
    const invalidIds = requestedAgentIds.filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      throw new Error("Escolha um agente da empresa selecionada para importar produtos.");
    }
  }

  return {
    assignedAgentIds: requestedAgentIds,
    assignedWhatsappInstanceIds: requestedWhatsappInstanceIds,
  };
}

async function readImportFiles(values: FormDataEntryValue[]) {
  const files = values.filter((value): value is File => value instanceof File && value.name.trim().length > 0);

  if (files.length > maxImportFiles) {
    throw new Error(`Envie no maximo ${maxImportFiles} arquivos por importacao.`);
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > maxImportTotalBytes) {
    throw new Error("O total dos arquivos precisa ter ate 36 MB.");
  }

  const parsed: SalesCatalogImportFileInput[] = [];

  for (const file of files) {
    if (file.size <= 0 || file.size > maxImportFileBytes) {
      throw new Error("Cada arquivo precisa ter ate 12 MB.");
    }

    const contentType = normalizeContentType(file);
    if (!allowedImportMimeTypes.has(contentType)) {
      throw new Error("Use TXT, CSV, JSON, PDF, XLSX, JPG, PNG ou WEBP.");
    }

    const arrayBuffer = await file.arrayBuffer();
    parsed.push({
      fileName: sanitizeFileName(file.name || "catalogo"),
      contentType,
      size: file.size,
      base64: Buffer.from(arrayBuffer).toString("base64"),
      text: await extractTextFromImportFile(file, contentType),
    });
  }

  return parsed;
}

async function extractTextFromImportFile(file: File, contentType: string) {
  if (!contentType.startsWith("text/") && contentType !== "application/json") {
    return null;
  }

  const text = await file.text().catch(() => "");
  return text.trim().slice(0, maxImportFileTextChars) || null;
}

function inferSourceKindFromFiles(files: SalesCatalogImportFileInput[]): SalesCatalogImportSourceKind {
  const first = files[0];
  if (!first) return "text";
  return inferSourceKindFromImportFile(first);
}

function inferSourceKindFromImportFile(file: SalesCatalogImportFileInput): SalesCatalogImportSourceKind {
  if (file.contentType.includes("pdf")) return "pdf";
  if (file.contentType.startsWith("image/")) return "image";
  if (file.contentType.includes("csv") || /\.(csv|tsv)$/i.test(file.fileName)) return "csv";
  if (file.contentType.includes("spreadsheet") || /\.(xlsx?|ods)$/i.test(file.fileName)) return "excel";
  return "text";
}

function resolveSourceKindForPlatform(
  sourcePlatform: SalesCatalogImportPlatform,
  requestedSourceKind: SalesCatalogImportSourceKind,
  files: SalesCatalogImportFileInput[],
): SalesCatalogImportSourceKind {
  const rule = importPlatformFileRules[sourcePlatform];
  const inferred = files[0] ? inferSourceKindFromImportFile(files[0]) : requestedSourceKind;

  if (sourcePlatform === "auto" || rule.defaultSourceKind === "mixed" || sourcePlatform === "generic_sheet") {
    return rule.acceptedSourceKinds.includes(inferred) ? inferred : rule.defaultSourceKind;
  }

  return rule.defaultSourceKind;
}

function assertImportFilesMatchPlatform(sourcePlatform: SalesCatalogImportPlatform, files: SalesCatalogImportFileInput[]) {
  if (sourcePlatform === "auto") return;

  const rule = importPlatformFileRules[sourcePlatform];
  const invalidFiles = files.filter((file) => !rule.acceptedSourceKinds.includes(inferSourceKindFromImportFile(file)));

  if (invalidFiles.length === 0) return;

  throw new Error(`${formatImportPlatformForRoute(sourcePlatform)} aceita ${rule.fileTypeLabel}. Exemplo: ${rule.example}`);
}

function normalizeContentType(file: File) {
  if (file.type) {
    return file.type;
  }

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".tsv")) return "text/tab-separated-values";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

function normalizeSourceKind(value: unknown): SalesCatalogImportSourceKind {
  if (value === "csv" || value === "excel" || value === "site" || value === "pdf" || value === "image" || value === "mixed") {
    return value;
  }

  return "text";
}

function normalizeImportPlatform(value: unknown): SalesCatalogImportPlatform {
  if (
    value === "woocommerce"
    || value === "shopify"
    || value === "wix"
    || value === "nuvemshop"
    || value === "loja_integrada"
    || value === "tray"
    || value === "anota_ai"
    || value === "ifood"
    || value === "generic_menu"
    || value === "generic_sheet"
  ) {
    return value;
  }

  return "auto";
}

function formatImportPlatformForRoute(value: SalesCatalogImportPlatform) {
  if (value === "woocommerce") return "WooCommerce";
  if (value === "shopify") return "Shopify";
  if (value === "wix") return "Wix Stores";
  if (value === "nuvemshop") return "Nuvemshop";
  if (value === "loja_integrada") return "Loja Integrada";
  if (value === "tray") return "Tray";
  if (value === "anota_ai") return "Anota Ai";
  if (value === "ifood") return "iFood / cardapio delivery";
  if (value === "generic_menu") return "PDF ou foto de cardapio";
  if (value === "generic_sheet") return "Planilha generica";
  return "Importacao automatica";
}

function normalizeTargetMode(value: unknown): SalesCatalogImportTargetMode {
  if (value === "connectyhub_checkout" || value === "external_site") return value;
  return "connectyhub_checkout";
}

function normalizeSalesDestination(value: unknown): SalesCatalogImportDestination {
  if (value === "external_site" || value === "connectyhub_checkout") return value;
  return "connectyhub_checkout";
}

function sanitizeFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || "catalogo";
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuidListPayload(value: unknown) {
  const parsed = typeof value === "string"
    ? parseJsonOrCsvList(value)
    : value;

  if (!Array.isArray(parsed)) {
    const id = normalizeUuid(readString(parsed));
    return id ? [id] : [];
  }

  return uniqueStringList(
    parsed
      .map((item) => normalizeUuid(readString(item)))
      .filter((item): item is string => Boolean(item)),
  );
}

function parseJsonOrCsvList(value: string) {
  if (!value.trim()) return [];

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function uniqueStringList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeUuid(value: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}
