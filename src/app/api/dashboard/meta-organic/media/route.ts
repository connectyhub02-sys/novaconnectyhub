import { NextResponse, type NextRequest } from "next/server";
import {
  getClientMetaOrganicOverview,
  uploadClientMetaOrganicMedia,
} from "@/lib/meta/organic-publishing";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { isStorageQuotaError } from "@/lib/storage/quotas";
import { metaOrganicAccess, OrganicAccessError } from "@/lib/meta/organic-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let access: Awaited<ReturnType<typeof metaOrganicAccess>>;
  try { access = await metaOrganicAccess(request); }
  catch (error) { return NextResponse.json(formatError(error), { status: error instanceof OrganicAccessError ? error.status : error instanceof BillingAccessError ? 402 : 403 }); }
  const { workspace, organizationId } = access;


  if (Number(request.headers.get("content-length")) > 101 * 1024 * 1024) return NextResponse.json({ error: "Envie até 100 MB por arquivo." }, { status: 413 });
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem ou vídeo MP4 válido." }, { status: 400 });
  }

  if (file.size > 100 * 1024 * 1024) return NextResponse.json({ error: "Envie até 100 MB por arquivo." }, { status: 413 });
  try {
    await assertBillableAccess({ organizationId: organizationId });

    const media = await uploadClientMetaOrganicMedia({
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      fileName: file.name || "meta-organic.jpg",
      organizationId: organizationId,
      userId: workspace.user.id,
    });
    const overview = await getClientMetaOrganicOverview({
      organizationId: organizationId,
      userId: workspace.user.id,
    });

    return NextResponse.json({ media, overview });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: error instanceof BillingAccessError ? 402 : isStorageQuotaError(error) ? error.status : 400 });
  }
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado ao enviar midia Meta.",
    ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
  };
}
