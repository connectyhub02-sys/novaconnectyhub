import { NextResponse, type NextRequest } from "next/server";
import { createClientAgent, deleteClientAgent, getClientAgentsWorkspace } from "@/lib/client-os/agents";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const data = await getClientAgentsWorkspace(workspace.user.id);
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
    companyId?: unknown;
    name?: unknown;
    sectorName?: unknown;
    roleTitle?: unknown;
    prompt?: unknown;
  }>(request);

  try {
    const agent = await createClientAgent({
      userId: workspace.user.id,
      companyId: typeof body?.companyId === "string" ? body.companyId : "",
      name: typeof body?.name === "string" ? body.name : "",
      sectorName: typeof body?.sectorName === "string" ? body.sectorName : undefined,
      roleTitle: typeof body?.roleTitle === "string" ? body.roleTitle : undefined,
      prompt: typeof body?.prompt === "string" ? body.prompt : undefined,
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson<{ agentId?: unknown }>(request);

  try {
    const agent = await deleteClientAgent({
      userId: workspace.user.id,
      agentId: typeof body?.agentId === "string" ? body.agentId : "",
    });

    return NextResponse.json({ deletedAgentId: agent.id });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
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
    error: error instanceof Error ? error.message : "Erro inesperado.",
  };
}
