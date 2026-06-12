import { NextResponse, type NextRequest } from "next/server";
import { createCustomerVoiceClone, deleteCustomerVoiceClone } from "@/lib/elevenlabs/voice-cloning";
import { listWhatsappAudioVoices } from "@/lib/elevenlabs/voices";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { requirePlatformWhatsappSector } from "@/lib/admin/platform-whatsapp-console";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const consentText = "Confirmo que tenho direito e consentimento para clonar esta voz na ConnectyHub.";
const fallbackVoiceOrganizationId = "00000000-0000-4000-8000-000000000000";

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Envie os dados da voz em multipart/form-data." }, { status: 400 });
  }

  const sectorId = asString(formData.get("sectorId"));
  const name = asString(formData.get("name"));
  const consentAccepted = asBoolean(formData.get("consentAccepted"));
  const removeBackgroundNoise = asBoolean(formData.get("removeBackgroundNoise"));
  const files = formData.getAll("files").filter(isFormFile);

  if (!sectorId) {
    return NextResponse.json({ error: "Escolha um setor antes de clonar a voz." }, { status: 422 });
  }

  if (!consentAccepted) {
    return NextResponse.json({ error: "Confirme que voce tem direito e consentimento para clonar esta voz." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const organizationId = await resolveOrganizationId(client, sector.id);
    const voice = await createCustomerVoiceClone({
      organizationId,
      userId: auth.userId,
      name: name ?? "",
      files,
      consentText,
      removeBackgroundNoise,
      client,
    });
    const audio = await listWhatsappAudioVoices({ organizationId: organizationId || fallbackVoiceOrganizationId, client });

    return NextResponse.json({
      voice,
      audio,
      notice: {
        tone: voice.requiresVerification ? "warning" : "success",
        message: voice.requiresVerification
          ? "Voz clonada. O provedor solicitou verificacao antes do uso completo."
          : "Voz clonada e liberada para o agente.",
      },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: resolveErrorStatus(error) });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await request.json().catch(() => null) as { sectorId?: string; voiceId?: string } | null;
  const sectorId = body?.sectorId?.trim();
  const voiceId = body?.voiceId?.trim();

  if (!sectorId || !voiceId) {
    return NextResponse.json({ error: "Informe o setor e a voz para excluir." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const sector = await requirePlatformWhatsappSector(client, sectorId);
    const organizationId = await resolveOrganizationId(client, sector.id);
    await deleteCustomerVoiceClone({ organizationId, voiceId, client });
    const audio = await listWhatsappAudioVoices({ organizationId: organizationId || fallbackVoiceOrganizationId, client });

    return NextResponse.json({
      audio,
      notice: { tone: "success", message: "Voz excluida." },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

async function resolveOrganizationId(client: ReturnType<typeof createServiceClient>, sectorId: string) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("organization_id")
    .eq("provider", "uazapi")
    .contains("metadata", { admin_whatsapp: true, sector_id: sectorId })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ organization_id: string }>();

  if (data?.organization_id) {
    return data.organization_id;
  }

  const { data: org } = await client
    .from("organizations")
    .select("id")
    .eq("slug", "connectyhub-platform-whatsapp")
    .maybeSingle<{ id: string }>();

  if (!org?.id) {
    throw new Error("Conecte o WhatsApp do setor antes de clonar a voz.");
  }

  return org.id;
}

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: FormDataEntryValue | null) {
  return typeof value === "string" && ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

function isFormFile(value: FormDataEntryValue): value is File {
  return Boolean(value)
    && typeof value === "object"
    && "arrayBuffer" in value
    && "name" in value
    && "size" in value;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Nao foi possivel clonar a voz.",
  };
}

function resolveErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.startsWith("Informe ")
    || message.startsWith("Envie ")
    || message.includes("precisa ser um audio")
    || message.includes("excede")
    || message.includes("nao podem passar")
  ) {
    return 422;
  }

  return 500;
}
