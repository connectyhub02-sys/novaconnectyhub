import { NextResponse, type NextRequest } from "next/server";
import {
  listClientSocialDispatchMonitor,
  listClientSocialApprovals,
  retryClientSocialDispatch,
  reviewClientSocialApproval,
} from "@/lib/client-os/social-approvals";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  try {
    const [approvals, dispatchMonitor] = await Promise.all([
      listClientSocialApprovals({ userId: workspace.user.id }),
      listClientSocialDispatchMonitor({ userId: workspace.user.id }),
    ]);

    return NextResponse.json({ approvals, dispatchMonitor });
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
    runId?: unknown;
    responseText?: unknown;
    note?: unknown;
  }>(request);
  const action = body?.action === "retry_dispatch"
    ? "retry_dispatch"
    : body?.action === "approve"
    ? "approve"
    : body?.action === "reject"
      ? "reject"
      : null;

  if (!action) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  try {
    if (action === "retry_dispatch") {
      const result = await retryClientSocialDispatch({
        userId: workspace.user.id,
        runId: typeof body?.runId === "string" ? body.runId : "",
      });

      return NextResponse.json(result);
    }

    const result = await reviewClientSocialApproval({
      userId: workspace.user.id,
      runId: typeof body?.runId === "string" ? body.runId : "",
      action,
      responseText: body?.responseText,
      note: body?.note,
    });

    return NextResponse.json(result);
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
    error: error instanceof Error ? error.message : "Erro inesperado nas aprovacoes sociais.",
  };
}
