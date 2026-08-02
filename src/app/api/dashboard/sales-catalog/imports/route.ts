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
  type SalesCatalogImportDestination,
  type SalesCatalogImportFileInput,
  type SalesCatalogImportSourceKind,
  type SalesCatalogImportTargetMode,
} from "@/lib/sales-catalog/importer";
import { inngest } from "@/lib/inngest/client";
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

    if (!payload.sourceUrl && !payload.text?.trim() && payload.files.length === 0) {
      return NextResponse.json({ error: "Envie uma URL, texto do cardapio ou arquivo para importar." }, { status: 422 });
    }

    if (payload.sourceKind === "site" && !payload.sourceUrl) {
      return NextResponse.json({ error: "Informe o link do site ou pagina do produto." }, { status: 422 });
    }

    const importJob = await createSalesCatalogImportJob({
      client,
      companyId: company.id,
      userId: workspace.user.id,
      sourceKind: payload.sourceKind,
      targetMode: payload.targetMode,
      defaultSalesDestination: payload.defaultSalesDestination,
      text: payload.text,
      sourceUrl: payload.sourceUrl,
      files: payload.files,
      title: payload.title,
    });

    await inngest.send({
      name: salesCatalogImportProcessRequestedEventName,
      data: {
        jobId: importJob.id,
        companyId: company.id,
        sourceKind: payload.sourceKind,
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

    return {
      companyId: readString(formData.get("companyId")),
      sourceKind: normalizeSourceKind(readString(formData.get("sourceKind")) ?? inferSourceKindFromFiles(files)),
      targetMode: normalizeTargetMode(readString(formData.get("targetMode"))),
      defaultSalesDestination: normalizeSalesDestination(readString(formData.get("defaultSalesDestination"))),
      text: readString(formData.get("text")),
      sourceUrl: readString(formData.get("sourceUrl")),
      title: readString(formData.get("title")),
      files,
    };
  }

  const body = readRecord(await request.json().catch(() => null)) ?? {};

  return {
    companyId: readString(body.companyId),
    sourceKind: normalizeSourceKind(readString(body.sourceKind)),
    targetMode: normalizeTargetMode(readString(body.targetMode)),
    defaultSalesDestination: normalizeSalesDestination(readString(body.defaultSalesDestination)),
    text: readString(body.text),
    sourceUrl: readString(body.sourceUrl),
    title: readString(body.title),
    files: [] as SalesCatalogImportFileInput[],
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
  if (first.contentType.includes("pdf")) return "pdf";
  if (first.contentType.startsWith("image/")) return "image";
  if (first.contentType.includes("spreadsheet") || /\.(xlsx?|ods)$/i.test(first.fileName)) return "excel";
  if (first.contentType.includes("csv") || /\.csv$/i.test(first.fileName)) return "csv";
  return "text";
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

function normalizeTargetMode(value: unknown): SalesCatalogImportTargetMode {
  if (value === "connectyhub_checkout" || value === "external_site") return value;
  return "review";
}

function normalizeSalesDestination(value: unknown): SalesCatalogImportDestination {
  if (value === "external_site" || value === "manual_handoff" || value === "connectyhub_checkout") return value;
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

  return error instanceof BillingAccessError ? 402 : fallback;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}
