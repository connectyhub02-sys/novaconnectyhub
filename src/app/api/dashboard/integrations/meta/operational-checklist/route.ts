import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { buildMetaOperationalChecklist } from "@/lib/meta/operational-checklist-policy";
import { resolveMetaSocialDispatchMode } from "@/lib/meta/social-dispatch-policy";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type IntegrationRow = {
  id: string;
  status: string | null;
  external_account_label: string | null;
  metadata: JsonRecord | null;
};

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const companyId = request.nextUrl.searchParams.get("companyId")?.trim();

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });

    const { data: integration, error: integrationError } = await client
      .from("organization_integrations")
      .select("id, status, external_account_label, metadata")
      .eq("organization_id", company.id)
      .eq("provider_id", "meta-ads")
      .maybeSingle<IntegrationRow>();

    if (integrationError) {
      throw new Error(integrationError.message);
    }

    if (!integration || integration.status !== "connected") {
      return NextResponse.json({ error: "Conecte a integracao Meta antes de gerar o checklist operacional." }, { status: 404 });
    }

    const checklist = buildMetaOperationalChecklist({
      accountLabel: integration.external_account_label,
      integrationStatus: integration.status,
      metadata: integration.metadata,
      runtimeMode: resolveMetaSocialDispatchMode(),
    });

    return NextResponse.json({ checklist });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel carregar o checklist operacional Meta.",
    }, { status: readErrorStatus(error) });
  }
}

function readErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("Somente dono ou admin") || message.includes("acesso")) {
    return 403;
  }

  return 400;
}
