import { NextResponse, type NextRequest } from "next/server";
import {
  getClientMetaOrganicOverview,
  uploadClientMetaOrganicMedia,
} from "@/lib/meta/organic-publishing";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  if (!workspace.organization?.id) {
    return NextResponse.json({ error: "Empresa obrigatoria." }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie uma imagem valida." }, { status: 400 });
  }

  try {
    const media = await uploadClientMetaOrganicMedia({
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      fileName: file.name || "meta-organic.jpg",
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
    });
    const overview = await getClientMetaOrganicOverview({
      organizationId: workspace.organization.id,
      userId: workspace.user.id,
    });

    return NextResponse.json({ media, overview });
  } catch (error) {
    return NextResponse.json(formatError(error), { status: 400 });
  }
}

function formatError(error: unknown) {
  return {
    error: error instanceof Error ? error.message : "Erro inesperado ao enviar midia Meta.",
  };
}
