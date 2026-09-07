import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listPlatformCampaignOffers,
  preparePlatformCampaign,
} from "@/lib/commerce/platform-campaigns";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization)
    return NextResponse.json({ error: "Entre no painel." }, { status: 401 });
  try {
    return NextResponse.json({
      offers: await listPlatformCampaignOffers(
        createServiceClient(),
        workspace.organization.id,
        request.nextUrl.searchParams.get("plan") ?? "",
        request.nextUrl.searchParams.get("subscription") ?? undefined,
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar ofertas." },
      { status: 422 },
    );
  }
}
export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace({ allowRestricted: true });
  if (!workspace?.organization)
    return NextResponse.json({ error: "Entre no painel." }, { status: 401 });
  const body = await request.json();
  const client = createServiceClient();
  const payment = await client
    .from("billing_payments")
    .select("id")
    .eq("organization_id", workspace.organization.id)
    .eq("subscription_id", body.subscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (payment.error)
    return NextResponse.json(
      { error: "Cobrança não encontrada." },
      { status: 404 },
    );
  try {
    const pricing = await preparePlatformCampaign(client, payment.data.id, {
      campaignId: String(body.campaignId),
      optionId: String(body.optionId),
    });
    return NextResponse.json({ pricing });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao aplicar oferta." },
      { status: 409 },
    );
  }
}
