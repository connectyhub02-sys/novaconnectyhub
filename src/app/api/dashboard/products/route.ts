import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { importPlatformProductToCompany } from "@/lib/platform-products";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const action = typeof record?.action === "string" ? record.action : "";

  if (action !== "import_platform_product") {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  const productId = typeof record?.productId === "string" ? record.productId.trim() : "";
  const companyId = typeof record?.companyId === "string" ? record.companyId.trim() : "";

  if (!productId || !companyId) {
    return NextResponse.json({ error: "Escolha o produto e a empresa para importar." }, { status: 422 });
  }

  try {
    const result = await importPlatformProductToCompany({
      userId: workspace.user.id,
      companyId,
      productId,
      client: createServiceClient(),
    });

    revalidatePath("/dashboard/produtos");
    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao importar produto." }, { status: 500 });
  }
}
