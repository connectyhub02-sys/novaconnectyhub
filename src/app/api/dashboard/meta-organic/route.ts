import { NextResponse, type NextRequest } from "next/server";
import {
  approveClientMetaOrganicPost,
  archiveClientMetaOrganicPost,
  createClientMetaOrganicDraft,
  getClientMetaOrganicOverview,
  publishClientMetaOrganicPost,
} from "@/lib/meta/organic-publishing";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { metaOrganicAccess, OrganicAccessError } from "@/lib/meta/organic-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let access: Awaited<ReturnType<typeof metaOrganicAccess>>;
  try { access = await metaOrganicAccess(request); }
  catch (error) { return NextResponse.json(formatError(error), { status: error instanceof OrganicAccessError ? error.status : error instanceof BillingAccessError ? 402 : 403 }); }
  const { workspace, organizationId } = access;


  try {
    const overview = await getClientMetaOrganicOverview({
      organizationId,
      userId: workspace.user.id,
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      until: request.nextUrl.searchParams.get("until") ?? undefined,
    });

    return NextResponse.json({ overview });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let access: Awaited<ReturnType<typeof metaOrganicAccess>>;
  try { access = await metaOrganicAccess(request); }
  catch (error) { return NextResponse.json(formatError(error), { status: error instanceof OrganicAccessError ? error.status : error instanceof BillingAccessError ? 402 : 403 }); }
  const { workspace, organizationId } = access;


  const body = await readJson<{
    action?: unknown;
    caption?: unknown;
    itemId?: unknown;
    linkUrl?: unknown;
    mediaUrl?: unknown;
    media?: unknown;
    format?: unknown;
    scheduledFor?: unknown;
    surfaces?: unknown;
    title?: unknown;
  }>(request);
  const action = readAction(body?.action);

  if (!action) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  try {
    await assertBillableAccess({ organizationId: organizationId });

    let result: unknown;

    if (action === "create_draft") {
      result = await createClientMetaOrganicDraft({
        caption: body?.caption,
        linkUrl: body?.linkUrl,
        mediaUrl: body?.mediaUrl,
        media: body?.media,
        format: body?.format,
        organizationId: organizationId,
        scheduledFor: body?.scheduledFor,
        surfaces: body?.surfaces,
        title: body?.title,
        userId: workspace.user.id,
      });
    } else if (action === "approve") {
      result = await approveClientMetaOrganicPost({
        itemId: readItemId(body?.itemId),
        organizationId: organizationId,
        userId: workspace.user.id,
      });
    } else if (action === "publish") {
      result = await publishClientMetaOrganicPost({
        itemId: readItemId(body?.itemId),
        organizationId: organizationId,
        userId: workspace.user.id,
      });
    } else {
      result = await archiveClientMetaOrganicPost({
        itemId: readItemId(body?.itemId),
        organizationId: organizationId,
        userId: workspace.user.id,
      });
    }

    const overview = await getClientMetaOrganicOverview({
      organizationId,
      userId: workspace.user.id,
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      until: request.nextUrl.searchParams.get("until") ?? undefined,
    });

    return NextResponse.json({ overview, result });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: error instanceof BillingAccessError ? 402 : 400 });
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
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}
