import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  try {
    const org = resolveDashboardCompanyId({
        workspace,
        requestedCompanyId: request.nextUrl.searchParams.get("companyId"),
      }),
      leadId = request.nextUrl.searchParams.get("leadId") ?? "",
      client = createServiceClient();
    if (!uuid.test(leadId)) throw new Error("Contato inválido.");
    const visits = await client
      .from("customer_lead_visits")
      .select("id,description,kind,occurred_at,return_at,return_status")
      .eq("organization_id", org)
      .eq("lead_id", leadId)
      .order("occurred_at", { ascending: false })
      .limit(30);
    const profile = await client
      .from("automation_lead_profiles")
      .select("evidence,preferences,updated_at")
      .eq("organization_id", org)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (visits.error || profile.error)
      throw new Error("Não foi possível consultar os retornos.");
    return NextResponse.json({ visits: visits.data, profile: profile.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar." },
      { status: statusForDashboardCompanyScopeError(error, 400) },
    );
  }
}
export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  try {
    const body = await request.json(),
      org = resolveDashboardCompanyId({
        workspace,
        requestedCompanyId:
          typeof body.companyId === "string" ? body.companyId : null,
      }),
      client = createServiceClient();
    if (
      !workspace.profile.isPlatformAdmin &&
      !["owner", "admin", "manager"].includes(
        workspace.organization?.role ?? "",
      )
    )
      return NextResponse.json(
        {
          error:
            "Somente responsáveis pela empresa podem registrar atendimentos.",
        },
        { status: 403 },
      );
    if (body.action === "preferences") {
      if (!uuid.test(body.leadId ?? "") || typeof body.paused !== "boolean")
        throw new Error("Preferência inválida.");
      const lead = await client
        .from("leads")
        .select("id")
        .eq("organization_id", org)
        .eq("id", body.leadId)
        .single();
      if (lead.error) throw new Error("Contato inválido.");
      const start = body.windowStart || null,
        end = body.windowEnd || null,
        time = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (
        Boolean(start) !== Boolean(end) ||
        (start && (!time.test(start) || !time.test(end) || start === end))
      )
        throw new Error("Confira o horário preferido.");
      const saved = await client
        .from("automation_lead_profiles")
        .upsert({
          organization_id: org,
          lead_id: body.leadId,
          preferences: {
            paused: body.paused,
            windowStart: start,
            windowEnd: end,
          },
          next_review_at: new Date().toISOString(),
        });
      if (saved.error) throw new Error("Falha ao salvar preferências.");
      return NextResponse.json({ saved: true });
    }
    if (body.action === "cancel_return") {
      if (!uuid.test(body.leadId ?? "") || !uuid.test(body.visitId ?? ""))
        throw new Error("Retorno inválido.");
      const cancelled = await client
        .from("customer_lead_visits")
        .update({ return_status: "cancelled" })
        .eq("organization_id", org)
        .eq("lead_id", body.leadId)
        .eq("id", body.visitId)
        .in("return_status", ["pending", "scheduled"])
        .select("id")
        .single();
      if (cancelled.error)
        throw new Error("Esse retorno já mudou. Atualize a ficha.");
      return NextResponse.json({ cancelled: true });
    }
    if (
      !uuid.test(body.leadId ?? "") ||
      typeof body.description !== "string" ||
      !body.description.trim() ||
      body.description.length > 300 ||
      !["visit", "purchase", "service"].includes(body.kind) ||
      !Number.isFinite(Date.parse(body.occurredAt)) ||
      typeof body.requestKey !== "string"
    )
      throw new Error("Confira a descrição e a data do atendimento.");
    const result = await client.rpc("record_customer_visit", {
      p_org: org,
      p_lead: body.leadId,
      p_description: body.description,
      p_kind: body.kind,
      p_occurred: body.occurredAt,
      p_return: body.returnAt ?? null,
      p_key: body.requestKey,
      p_actor: workspace.user.id,
    });
    if (result.error)
      throw new Error(
        "Não foi possível registrar. Confira as datas e atualize antes de tentar novamente.",
      );
    return NextResponse.json({ visit: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao registrar." },
      { status: statusForDashboardCompanyScopeError(error, 400) },
    );
  }
}
