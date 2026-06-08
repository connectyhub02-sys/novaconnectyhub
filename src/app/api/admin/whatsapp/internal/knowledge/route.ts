import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformWhatsappSector } from "@/lib/admin/platform-whatsapp-console";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
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
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData().catch(() => null);
  const sectorId = formData?.get("sectorId");
  const file = formData?.get("file");

  if (typeof sectorId !== "string" || !sectorId.trim()) {
    return NextResponse.json({ error: "Escolha um setor antes de anexar arquivo." }, { status: 422 });
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
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const configResult = await loadR2Config(client);

    if (!configResult.ok) {
      return NextResponse.json({ error: configResult.error }, { status: 503 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = sanitizeFileName(file.name || "arquivo");
    const objectKey = `platform-knowledge/whatsapp-sectors/${sector.id}/${Date.now()}-${randomUUID()}-${fileName}`;
    const uploadResult = await putR2Object(configResult.config, objectKey, bytes, contentType);

    if (!uploadResult.ok) {
      return NextResponse.json({ error: uploadResult.error }, { status: 502 });
    }

    const extractedText = await extractTextForMemory(file, contentType);
    const content = extractedText
      ? extractedText
      : [
          `Arquivo anexado: ${fileName}`,
          `Setor: ${sector.name}`,
          `Tipo: ${contentType}`,
          "Conteudo textual ainda nao extraido automaticamente. Use este anexo como referencia do setor.",
        ].join("\n");

    const { data, error } = await client
      .from("intelligence_memory")
      .insert({
        scope: "platform",
        organization_id: null,
        memory_type: "knowledge_file",
        title: fileName,
        content,
        importance: 0.76,
        tags: ["knowledge_base", "platform_whatsapp_sector", "whatsapp_agent"],
        metadata: {
          admin_whatsapp: true,
          sector_id: sector.id,
          sector_code: sector.sector_code,
          sector_name: sector.name,
          file_name: fileName,
          content_type: contentType,
          size: file.size,
          storage_provider: "cloudflare-r2",
          storage_key: objectKey,
          storage_url: uploadResult.publicUrl,
          extracted_text: Boolean(extractedText),
          uploaded_by: auth.userId,
        },
      })
      .select("id, title, metadata, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Nao foi possivel registrar o arquivo." }, { status: 500 });
    }

    revalidateWhatsappAdmin();

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

function revalidateWhatsappAdmin() {
  revalidatePath("/admin/whatsapp/atendimento");
  revalidatePath("/admin/setores");
}
