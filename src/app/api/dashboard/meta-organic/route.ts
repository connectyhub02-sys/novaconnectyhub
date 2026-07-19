import { NextResponse, type NextRequest } from "next/server";
import {
  approveClientMetaOrganicPost,
  archiveClientMetaOrganicPost,
  createClientMetaOrganicDraft,
  getClientMetaOrganicOverview,
  publishClientMetaOrganicPost,
} from "@/lib/meta/organic-publishing";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 400 });
  }

  try {
    const overview = await getClientMetaOrganicOverview({
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
    });

    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 400 });
  }

  const body = await readJson<{
    action?: unknown;
    caption?: unknown;
    itemId?: unknown;
    linkUrl?: unknown;
    mediaUrl?: unknown;
    surfaces?: unknown;
    title?: unknown;
  }>(request);
  const action = readAction(body?.action);

  if (!action) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  try {
    let result: unknown;

    if (action === "create_draft") {
      result = await createClientMetaOrganicDraft({
        caption: body?.caption,
        linkUrl: body?.linkUrl,
        mediaUrl: body?.mediaUrl,
        organizationId: workspace.organization.id,
        surfaces: body?.surfaces,
        title: body?.title,
        userId: workspace.user.id,
      });
    } else if (action === "approve") {
      result = await approveClientMetaOrganicPost({
        itemId: readItemId(body?.itemId),
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
      });
    } else if (action === "publish") {
      result = await publishClientMetaOrganicPost({
        itemId: readItemId(body?.itemId),
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
      });
    } else {
      result = await archiveClientMetaOrganicPost({
        itemId: readItemId(body?.itemId),
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
      });
    }

    const overview = await getClientMetaOrganicOverview({
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
    });

    return NextResponse.json({ overview, result });
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

function readAction(value: unknown) {
  return value === "create_draft"
    || value === "approve"
    || value === "publish"
    || value === "archive"
    ? value
    : null;
}

function readItemId(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new Error("Publicacao Meta nao informada.");
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado na publicacao Meta.",
  };
}
