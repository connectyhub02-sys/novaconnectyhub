import { NextResponse, type NextRequest } from "next/server";
import type { WhatsappAudioVoiceState } from "@/lib/elevenlabs/voices";
import { listClientCompanies, requireClientCompanyAccess, type ClientCompany } from "@/lib/client-os/companies";
import { getCurrentWorkspace, type CurrentOrganization } from "@/lib/supabase/profile";
import {
  connectClientWhatsapp,
  disconnectClientWhatsapp,
  getClientWhatsappState,
  refreshClientWhatsappStatus,
  sendClientWhatsappTest,
  updateClientWhatsappPrompt,
  type ClientWhatsappActionResult,
  type ClientWhatsappState,
} from "@/lib/whatsapp/client-workspace";
import { defaultWhatsappBehaviorConfig, defaultWhatsappGlobalPrompt } from "@/lib/whatsapp/agent-behavior";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActionBody = {
  action?: unknown;
  companyId?: unknown;
  phone?: unknown;
  text?: unknown;
};

type WorkspaceContext = {
  organization: CurrentOrganization;
  userId: string;
  companies: ClientCompany[];
};

type DashboardWhatsappState = ClientWhatsappState & {
  companies: ClientCompany[];
  selectedCompanyId: string | null;
};

export async function GET(request: NextRequest) {
  const context = await requireWorkspaceContext(request.nextUrl.searchParams.get("companyId"), true);

  if (context instanceof NextResponse) {
    return context;
  }

  if (!context) {
    return NextResponse.json(buildUnavailableState());
  }

  try {
    const state = await getClientWhatsappState({
      organization: context.organization,
      userId: context.userId,
    });

    return NextResponse.json(attachWorkspace(context, state));
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await readJson<ActionBody>(request);
  const context = await requireWorkspaceContext(asString(body?.companyId), false);

  if (context instanceof NextResponse) {
    return context;
  }

  if (!context) {
    return NextResponse.json({ error: "Cadastre uma empresa antes de conectar o WhatsApp." }, { status: 422 });
  }

  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "connect") {
      const result = await connectClientWhatsapp({
        organization: context.organization,
        userId: context.userId,
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "refresh_status") {
      const result = await refreshClientWhatsappStatus({
        organization: context.organization,
        userId: context.userId,
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "disconnect") {
      const result = await disconnectClientWhatsapp({
        organization: context.organization,
        userId: context.userId,
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "send_test") {
      const result = await sendClientWhatsappTest({
        organization: context.organization,
        userId: context.userId,
        phone: typeof body?.phone === "string" ? body.phone : "",
        text: typeof body?.text === "string" ? body.text : "",
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await readJson<{
    companyId?: unknown;
    prompt?: unknown;
    agentPrompt?: unknown;
    globalPrompt?: unknown;
    behavior?: unknown;
    qualificationConfig?: unknown;
  }>(request);
  const context = await requireWorkspaceContext(asString(body?.companyId), false);

  if (context instanceof NextResponse) {
    return context;
  }

  if (!context) {
    return NextResponse.json({ error: "Cadastre uma empresa antes de salvar o WhatsApp." }, { status: 422 });
  }

  const agentPrompt = typeof body?.agentPrompt === "string"
    ? body.agentPrompt
    : typeof body?.prompt === "string"
      ? body.prompt
      : undefined;
  const globalPrompt = typeof body?.globalPrompt === "string" ? body.globalPrompt : undefined;

  try {
    const state = await updateClientWhatsappPrompt({
      organization: context.organization,
      userId: context.userId,
      agentPrompt,
      globalPrompt,
      behavior: body?.behavior,
      qualificationConfig: body?.qualificationConfig,
    });

    return NextResponse.json(attachWorkspace(context, state));
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
}

async function requireWorkspaceContext(
  requestedCompanyId: string | null,
  allowMissingCompany: boolean,
): Promise<WorkspaceContext | NextResponse | null> {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const companies = await listClientCompanies(workspace.user.id);

  if (companies.length === 0) {
    return allowMissingCompany ? null : NextResponse.json({ error: "Cadastre uma empresa antes de configurar o WhatsApp." }, { status: 422 });
  }

  const companyId = requestedCompanyId || companies[0]?.id;

  if (!companyId) {
    return allowMissingCompany ? null : NextResponse.json({ error: "Escolha uma empresa." }, { status: 422 });
  }

  try {
    const organization = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
    });

    return {
      organization,
      userId: workspace.user.id,
      companies,
    };
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 422 });
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function attachWorkspace(context: WorkspaceContext, state: ClientWhatsappState): DashboardWhatsappState {
  return {
    ...state,
    companies: context.companies,
    selectedCompanyId: context.organization.id,
  };
}

function attachWorkspaceToResult(context: WorkspaceContext, result: ClientWhatsappActionResult) {
  return {
    ...result,
    state: attachWorkspace(context, result.state),
  };
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado no WhatsApp.",
  };
}

function buildUnavailableState(): DashboardWhatsappState {
  return {
    companies: [],
    selectedCompanyId: null,
    instance: null,
    agent: null,
    globalAgent: {
      id: "pending-global-agent",
      name: "Agente Global WhatsApp",
      prompt: defaultWhatsappGlobalPrompt,
      promptPreview: defaultWhatsappGlobalPrompt.slice(0, 180),
      updatedAt: null,
    },
    behavior: defaultWhatsappBehaviorConfig,
    audio: buildUnavailableAudioState(),
    knowledge: {
      files: [],
    },
    linkButtons: [],
    capability: {
      canConnect: false,
      schemaReady: false,
      message: "Cadastre uma empresa em Minha Empresa antes de configurar o WhatsApp.",
    },
  };
}

function buildUnavailableAudioState(): WhatsappAudioVoiceState {
  return {
    configured: false,
    defaultVoiceId: null,
    defaultModelId: null,
    outputFormat: null,
    voices: [],
    errorMessage: "Cadastre uma empresa antes de escolher a voz do agente.",
  };
}
