import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { assertBillableAccess, BillingAccessError } from "@/lib/billing/trial";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
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
    const client = createServiceClient();
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });
    await assertBillableAccess({ organizationId: company.id, client });

    const result = await importPlatformProductToCompany({
      userId: workspace.user.id,
      companyId,
      productId,
      client,
    });

    revalidatePath("/dashboard/produtos");
    revalidatePath("/dashboard/links");
    revalidatePath("/dashboard/whatsapp");

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao importar produto.",
        ...(error instanceof BillingAccessError ? { billingAccess: error.status } : {}),
      },
      { status: error instanceof BillingAccessError ? 402 : 500 },
    );
  }
}
