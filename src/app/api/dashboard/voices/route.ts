import { NextResponse, type NextRequest } from "next/server";
import { createCustomerVoiceClone, deleteCustomerVoiceClone } from "@/lib/elevenlabs/voice-cloning";
import { listWhatsappAudioVoices } from "@/lib/elevenlabs/voices";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const consentText = "Confirmo que tenho direito e consentimento para clonar esta voz na ConnectyHub.";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Envie os dados da voz em multipart/form-data." }, { status: 400 });
  }

  const companyId = asString(formData.get("companyId"));
  const name = asString(formData.get("name"));
  const consentAccepted = asBoolean(formData.get("consentAccepted"));
  const removeBackgroundNoise = asBoolean(formData.get("removeBackgroundNoise"));
  const files = formData.getAll("files").filter(isFormFile);

  if (!companyId) {
    return NextResponse.json({ error: "Escolha uma empresa antes de clonar a voz." }, { status: 422 });
  }

  if (!consentAccepted) {
    return NextResponse.json({ error: "Confirme que voce tem direito e consentimento para clonar esta voz." }, { status: 422 });
  }

  try {
    const organization = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
    });
    const voice = await createCustomerVoiceClone({
      organizationId: organization.id,
      userId: workspace.user.id,
      name: name ?? "",
      files,
      consentText,
      removeBackgroundNoise,
    });
    const audio = await listWhatsappAudioVoices({ organizationId: organization.id });

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
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { companyId?: string; voiceId?: string } | null;
  const companyId = body?.companyId?.trim();
  const voiceId = body?.voiceId?.trim();

  if (!companyId || !voiceId) {
    return NextResponse.json({ error: "Informe a empresa e a voz para excluir." }, { status: 422 });
  }

  try {
    const organization = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
    });
    await deleteCustomerVoiceClone({ organizationId: organization.id, voiceId });
    const audio = await listWhatsappAudioVoices({ organizationId: organization.id });

    return NextResponse.json({
      audio,
      notice: { tone: "success", message: "Voz excluida." },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
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
