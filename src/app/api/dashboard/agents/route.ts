import { NextResponse, type NextRequest } from "next/server";
import {
  assertAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import { cloneClientAgent, createClientAgent, deleteClientAgent, getClientAgentsWorkspace, updateClientAgent } from "@/lib/client-os/agents";
import { BillingAccessError } from "@/lib/billing/trial";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const data = await getClientAgentsWorkspace({
      userId: workspace.user.id,
      organizationId: workspace.organization?.id,
      company: currentOrganizationToClientCompany(workspace.organization),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{
    action?: unknown;
    companyId?: unknown;
    name?: unknown;
    sectorName?: unknown;
    roleTitle?: unknown;
    prompt?: unknown;
    promptTemplateConfig?: unknown;
    sourceAgentId?: unknown;
  }>(request);

  try {
    await assertAccountComplete({ userId: workspace.user.id, client: createServiceClient() });
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: typeof body?.companyId === "string" ? body.companyId : null,
      missingMessage: "Cadastre uma empresa antes de criar agentes.",
    });

    if (body?.action === "clone") {
      const agent = await cloneClientAgent({
        userId: workspace.user.id,
        sourceAgentId: typeof body?.sourceAgentId === "string" ? body.sourceAgentId : "",
        companyId,
        organizationId: companyId,
        name: typeof body?.name === "string" ? body.name : undefined,
        sectorName: typeof body?.sectorName === "string" ? body.sectorName : undefined,
        roleTitle: typeof body?.roleTitle === "string" ? body.roleTitle : undefined,
        prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
        promptTemplateConfig: body?.promptTemplateConfig,
      });

      return NextResponse.json({ agent }, { status: 201 });
    }

    const agent = await createClientAgent({
      userId: workspace.user.id,
      companyId,
      name: typeof body?.name === "string" ? body.name : "",
      sectorName: typeof body?.sectorName === "string" ? body.sectorName : undefined,
      roleTitle: typeof body?.roleTitle === "string" ? body.roleTitle : undefined,
      prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
      promptTemplateConfig: body?.promptTemplateConfig,
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 400) });
  }
}

export async function PATCH(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{
    agentId?: unknown;
    companyId?: unknown;
    name?: unknown;
    sectorName?: unknown;
    roleTitle?: unknown;
    prompt?: unknown;
    promptTemplateConfig?: unknown;
  }>(request);

  try {
    await assertAccountComplete({ userId: workspace.user.id, client: createServiceClient() });
    const companyId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: typeof body?.companyId === "string" ? body.companyId : null,
      missingMessage: "Cadastre uma empresa antes de editar agentes.",
    });

    const agent = await updateClientAgent({
      userId: workspace.user.id,
      agentId: typeof body?.agentId === "string" ? body.agentId : "",
      companyId,
      organizationId: companyId,
      name: typeof body?.name === "string" ? body.name : "",
      sectorName: typeof body?.sectorName === "string" ? body.sectorName : undefined,
      roleTitle: typeof body?.roleTitle === "string" ? body.roleTitle : undefined,
      prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
      promptTemplateConfig: body?.promptTemplateConfig,
    });

    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 400) });
  }
}

export async function DELETE(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{ agentId?: unknown }>(request);

  try {
    const companyId = resolveDashboardCompanyId({
      workspace,
      missingMessage: "Cadastre uma empresa antes de excluir agentes.",
    });
    const agent = await deleteClientAgent({
      userId: workspace.user.id,
      agentId: typeof body?.agentId === "string" ? body.agentId : "",
      organizationId: companyId,
    });

    return NextResponse.json({ deletedAgentId: agent.id });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: statusForError(error, 400) });
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function formatError(error: unknown) {
  return {
    ...formatAccountCompletionError(error),
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}

function statusForError(error: unknown, fallback: number) {
  const scopeStatus = statusForDashboardCompanyScopeError(error, 0);
  if (scopeStatus) return scopeStatus;

  const accountStatus = statusForAccountCompletionError(error, fallback);

  if (accountStatus !== fallback) {
    return accountStatus;
  }

  return error instanceof BillingAccessError ? 402 : fallback;
}
