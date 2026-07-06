import { NextResponse, type NextRequest } from "next/server";
import { getClientAgentsWorkspace, type ClientAgent } from "@/lib/client-os/agents";
import type { WhatsappAudioVoiceState } from "@/lib/elevenlabs/voices";
import { requireClientCompanyAccess, type ClientCompany } from "@/lib/client-os/companies";
import { getCurrentWorkspace, type CurrentOrganization } from "@/lib/supabase/profile";
import {
  connectClientWhatsapp,
  disconnectClientWhatsapp,
  generateClientWhatsappCloneProfileFromHistory,
  getClientWhatsappMigrationCredential,
  getClientWhatsappState,
  refreshClientWhatsappStatus,
  resetClientWhatsappConnection,
  sendClientWhatsappHandoffNotificationTest,
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
  agentId?: unknown;
  connectPhone?: unknown;
  phone?: unknown;
  text?: unknown;
  behavior?: unknown;
  credential?: unknown;
  maxChats?: unknown;
  maxMessagesPerChat?: unknown;
};

type WorkspaceContext = {
  organization: CurrentOrganization;
  userId: string;
  companies: ClientCompany[];
  agents: ClientAgent[];
  selectedAgentId: string | null;
};

type DashboardWhatsappState = ClientWhatsappState & {
  companies: ClientCompany[];
  agents: ClientAgent[];
  selectedCompanyId: string | null;
  selectedAgentId: string | null;
};

export async function GET(request: NextRequest) {
  const context = await requireWorkspaceContext({
    requestedCompanyId: request.nextUrl.searchParams.get("companyId"),
    requestedAgentId: request.nextUrl.searchParams.get("agentId"),
    allowMissingCompany: true,
  });

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
      agentId: context.selectedAgentId,
    });

    return NextResponse.json(attachWorkspace(context, state));
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await readJson<ActionBody>(request);
  const context = await requireWorkspaceContext({
    requestedCompanyId: asString(body?.companyId),
    requestedAgentId: asString(body?.agentId),
    allowMissingCompany: false,
  });

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
        agentId: context.selectedAgentId,
        connectPhone: asString(body?.connectPhone),
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "refresh_status") {
      const result = await refreshClientWhatsappStatus({
        organization: context.organization,
        userId: context.userId,
        agentId: context.selectedAgentId,
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "reset_connection") {
      const result = await resetClientWhatsappConnection({
        organization: context.organization,
        userId: context.userId,
        agentId: context.selectedAgentId,
        connectPhone: asString(body?.connectPhone),
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "disconnect") {
      const result = await disconnectClientWhatsapp({
        organization: context.organization,
        userId: context.userId,
        agentId: context.selectedAgentId,
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "copy_migration_credential") {
      const credential = asMigrationCredentialKind(body?.credential);

      if (!credential) {
        return NextResponse.json({ error: "Credencial de migracao invalida." }, { status: 422 });
      }

      const result = await getClientWhatsappMigrationCredential({
        organization: context.organization,
        userId: context.userId,
        agentId: context.selectedAgentId,
        credential,
      });

      return NextResponse.json(result);
    }

    if (action === "send_test") {
      const result = await sendClientWhatsappTest({
        organization: context.organization,
        userId: context.userId,
        agentId: context.selectedAgentId,
        phone: typeof body?.phone === "string" ? body.phone : "",
        text: typeof body?.text === "string" ? body.text : "",
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "send_handoff_test") {
      const result = await sendClientWhatsappHandoffNotificationTest({
        organization: context.organization,
        userId: context.userId,
        agentId: context.selectedAgentId,
        behavior: body?.behavior,
      });

      return NextResponse.json(attachWorkspaceToResult(context, result));
    }

    if (action === "generate_clone_profile_from_history") {
      const result = await generateClientWhatsappCloneProfileFromHistory({
        organization: context.organization,
        userId: context.userId,
        agentId: context.selectedAgentId,
        maxChats: asNumber(body?.maxChats),
        maxMessagesPerChat: asNumber(body?.maxMessagesPerChat),
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
    agentId?: unknown;
    prompt?: unknown;
    agentPrompt?: unknown;
    globalPrompt?: unknown;
    behavior?: unknown;
    cloneProfile?: unknown;
    qualificationConfig?: unknown;
  }>(request);
  const context = await requireWorkspaceContext({
    requestedCompanyId: asString(body?.companyId),
    requestedAgentId: asString(body?.agentId),
    allowMissingCompany: false,
  });

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
      agentId: context.selectedAgentId,
      agentPrompt,
      globalPrompt,
      behavior: body?.behavior,
      cloneProfile: body?.cloneProfile,
      qualificationConfig: body?.qualificationConfig,
    });

    return NextResponse.json(attachWorkspace(context, state));
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
}

async function requireWorkspaceContext(input: {
  requestedCompanyId: string | null;
  requestedAgentId: string | null;
  allowMissingCompany: boolean;
}): Promise<WorkspaceContext | NextResponse | null> {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const { companies, agents } = await getClientAgentsWorkspace(workspace.user.id);

  if (companies.length === 0) {
    return input.allowMissingCompany ? null : NextResponse.json({ error: "Cadastre uma empresa antes de configurar o WhatsApp." }, { status: 422 });
  }

  const selectedAgent = resolveSelectedAgent(agents, input.requestedAgentId, input.requestedCompanyId);

  if (input.requestedAgentId && !selectedAgent) {
    return NextResponse.json({ error: "Escolha um agente vinculado a sua conta." }, { status: 422 });
  }

  const companyId = selectedAgent?.companyId || input.requestedCompanyId || companies[0]?.id;

  if (!companyId) {
    return input.allowMissingCompany ? null : NextResponse.json({ error: "Escolha uma empresa." }, { status: 422 });
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
      agents,
      selectedAgentId: selectedAgent?.id ?? null,
    };
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 422 });
  }
}

function resolveSelectedAgent(agents: ClientAgent[], requestedAgentId: string | null, requestedCompanyId: string | null) {
  if (requestedAgentId) {
    return agents.find((agent) => agent.id === requestedAgentId) ?? null;
  }

  if (requestedCompanyId) {
    return agents.find((agent) => agent.companyId === requestedCompanyId) ?? null;
  }

  return agents[0] ?? null;
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

function asNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function asMigrationCredentialKind(value: unknown) {
  return value === "serverUrl" || value === "instanceToken" ? value : null;
}

function attachWorkspace(context: WorkspaceContext, state: ClientWhatsappState): DashboardWhatsappState {
  return {
    ...state,
    companies: context.companies,
    agents: context.agents,
    selectedCompanyId: context.organization.id,
    selectedAgentId: context.selectedAgentId ?? state.agent?.id ?? null,
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
    agents: [],
    selectedCompanyId: null,
    selectedAgentId: null,
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
    salesCatalog: [],
    cloneTest: {
      total: 0,
      averageScore: null,
      lastScore: null,
      reviewCount: 0,
      lastEventAt: null,
      events: [],
    },
    runtimeAlerts: [],
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
