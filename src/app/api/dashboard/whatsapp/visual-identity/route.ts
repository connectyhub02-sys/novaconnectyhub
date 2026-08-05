import { NextResponse, type NextRequest } from "next/server";
import { BillingAccessError } from "@/lib/billing/trial";
import { getClientAgentsWorkspace, type ClientAgent } from "@/lib/client-os/agents";
import type { ClientCompany } from "@/lib/client-os/companies";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import { isStorageQuotaError } from "@/lib/storage/quotas";
import { getCurrentWorkspace, type CurrentOrganization } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { getClientWhatsappState } from "@/lib/whatsapp/client-workspace";
import {
  archiveAgentVisualIdentityReference,
  createAgentVisualIdentityReference,
  normalizeVisualIdentityContentType,
} from "@/lib/whatsapp/visual-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkspaceContext = {
  organization: CurrentOrganization;
  userId: string;
  companies: ClientCompany[];
  agents: ClientAgent[];
  selectedAgentId: string | null;
};

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const context = await requireWorkspaceContext({
    requestedCompanyId: asString(formData?.get("companyId")),
    requestedAgentId: asString(formData?.get("agentId")),
  });

  if (context instanceof NextResponse) {
    return context;
  }

  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem valida." }, { status: 400 });
  }

  try {
    const client = createServiceClient();
    const state = await getClientWhatsappState({
      organization: context.organization,
      userId: context.userId,
      agentId: context.selectedAgentId,
      client,
    });

    if (!state.agent) {
      return NextResponse.json({ error: "Crie ou selecione um agente antes de treinar identidade visual." }, { status: 422 });
    }

    const reference = await createAgentVisualIdentityReference({
      scope: "client",
      organizationId: context.organization.id,
      agentId: state.agent.id,
      whatsappInstanceId: state.instance?.id ?? null,
      userId: context.userId,
      source: "manual_upload",
      fileName: file.name,
      contentType: normalizeVisualIdentityContentType(file.name, file.type),
      bytes: new Uint8Array(await file.arrayBuffer()),
      client,
    });
    const nextState = await getClientWhatsappState({
      organization: context.organization,
      userId: context.userId,
      agentId: state.agent.id,
      client,
    });

    return NextResponse.json({
      reference,
      state: attachWorkspace(context, nextState),
      notice: { tone: "success", message: "Referencia visual enviada. O Inngest vai processar o treinamento." },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 500) });
  }
}

export async function DELETE(request: NextRequest) {
  const context = await requireWorkspaceContext({
    requestedCompanyId: request.nextUrl.searchParams.get("companyId"),
    requestedAgentId: request.nextUrl.searchParams.get("agentId"),
  });

  if (context instanceof NextResponse) {
    return context;
  }

  const referenceId = request.nextUrl.searchParams.get("referenceId");

  if (!referenceId) {
    return NextResponse.json({ error: "Informe a referencia visual." }, { status: 422 });
  }

  try {
    const client = createServiceClient();
    const state = await getClientWhatsappState({
      organization: context.organization,
      userId: context.userId,
      agentId: context.selectedAgentId,
      client,
    });

    if (!state.agent) {
      return NextResponse.json({ error: "Agente nao encontrado." }, { status: 422 });
    }

    const reference = await archiveAgentVisualIdentityReference({
      scope: "client",
      organizationId: context.organization.id,
      agentId: state.agent.id,
      referenceId,
      client,
    });
    const nextState = await getClientWhatsappState({
      organization: context.organization,
      userId: context.userId,
      agentId: state.agent.id,
      client,
    });

    return NextResponse.json({
      reference,
      state: attachWorkspace(context, nextState),
      notice: { tone: "success", message: "Referencia visual arquivada." },
    });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 500) });
  }
}

async function requireWorkspaceContext(input: {
  requestedCompanyId: string | null;
  requestedAgentId: string | null;
}): Promise<WorkspaceContext | NextResponse> {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization) {
    return NextResponse.json({ error: "Cadastre uma empresa antes de treinar identidade visual." }, { status: 422 });
  }

  if (input.requestedCompanyId && input.requestedCompanyId !== workspace.organization.id) {
    return NextResponse.json({ error: "Empresa fora do workspace atual." }, { status: 422 });
  }

  const { companies, agents } = await getClientAgentsWorkspace({
    userId: workspace.user.id,
    organizationId: workspace.organization.id,
    company: currentOrganizationToClientCompany(workspace.organization),
  });
  const selectedAgent = resolveSelectedAgent(agents, input.requestedAgentId, workspace.organization.id);

  if (input.requestedAgentId && !selectedAgent) {
    return NextResponse.json({ error: "Escolha um agente vinculado a sua conta." }, { status: 422 });
  }

  return {
    organization: workspace.organization,
    userId: workspace.user.id,
    companies,
    agents,
    selectedAgentId: selectedAgent?.id ?? null,
  };
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

function attachWorkspace(context: WorkspaceContext, state: Awaited<ReturnType<typeof getClientWhatsappState>>) {
  return {
    ...state,
    companies: context.companies,
    agents: context.agents,
    selectedCompanyId: context.organization.id,
    selectedAgentId: context.selectedAgentId ?? state.agent?.id ?? null,
  };
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado na identidade visual.",
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function statusForError(error: unknown, fallback: number) {
  if (error instanceof BillingAccessError) return 402;
  if (isStorageQuotaError(error)) return error.status;
  return fallback;
}
