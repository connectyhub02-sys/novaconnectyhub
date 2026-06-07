import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const maxKnowledgeFileBytes = 12 * 1024 * 1024;
const maxExtractedChars = 12000;
const allowedMimeTypes = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const companyId = formData?.get("companyId");
  const file = formData?.get("file");

  if (typeof companyId !== "string" || !companyId.trim()) {
    return NextResponse.json({ error: "Escolha uma empresa antes de anexar arquivo." }, { status: 422 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo valido." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > maxKnowledgeFileBytes) {
    return NextResponse.json({ error: "O arquivo precisa ter ate 12 MB." }, { status: 400 });
  }

  const contentType = normalizeContentType(file);

  if (!allowedMimeTypes.has(contentType)) {
    return NextResponse.json({ error: "Use TXT, Markdown, CSV, JSON, PDF, DOC ou DOCX." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId: companyId.trim(),
      client,
    });
    const configResult = await loadR2Config(client);

    if (!configResult.ok) {
      return NextResponse.json({ error: configResult.error }, { status: 503 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = sanitizeFileName(file.name || "arquivo");
    const objectKey = `knowledge/${company.id}/${Date.now()}-${randomUUID()}-${fileName}`;
    const uploadResult = await putR2Object(configResult.config, objectKey, bytes, contentType);

    if (!uploadResult.ok) {
      return NextResponse.json({ error: uploadResult.error }, { status: 502 });
    }

    const extractedText = await extractTextForMemory(file, contentType);
    const content = extractedText
      ? extractedText
      : [
          `Arquivo anexado: ${fileName}`,
          `Tipo: ${contentType}`,
          "Conteudo textual ainda nao extraido automaticamente. Use este anexo como referencia cadastrada da empresa.",
        ].join("\n");

    const { data, error } = await client
      .from("intelligence_memory")
      .insert({
        scope: "organization",
        organization_id: company.id,
        memory_type: "knowledge_file",
        title: fileName,
        content,
        importance: 0.74,
        tags: ["knowledge_base", "company_file", "whatsapp_agent"],
        metadata: {
          file_name: fileName,
          content_type: contentType,
          size: file.size,
          storage_provider: "cloudflare-r2",
          storage_key: objectKey,
          storage_url: uploadResult.publicUrl,
          extracted_text: Boolean(extractedText),
          uploaded_by: workspace.user.id,
        },
      })
      .select("id, title, metadata, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel registrar o arquivo." }, { status: 500 });
    }

    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json({
      file: {
        id: data.id,
        title: data.title,
        fileName,
        contentType,
        size: file.size,
        storageUrl: uploadResult.publicUrl,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao anexar arquivo." }, { status: 500 });
  }
}

function normalizeContentType(file: File) {
  if (file.type) {
    return file.type;
  }

  const lower = file.name.toLowerCase();
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "text/plain";
}

async function extractTextForMemory(file: File, contentType: string) {
  if (!contentType.startsWith("text/") && contentType !== "application/json") {
    return "";
  }

  const text = await file.text().catch(() => "");
  return text.replace(/\s+/g, " ").trim().slice(0, maxExtractedChars);
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
