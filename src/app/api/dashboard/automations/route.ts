import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import { loadAutomationPolicy } from "@/lib/automations/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  try {
    const organizationId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId: request.nextUrl.searchParams.get("companyId"),
    });
    const client = createServiceClient();
    const policy = await loadAutomationPolicy(client, organizationId);
    const activity = await client
      .from("automation_dispatches")
      .select(
        "id,journey,status,scheduled_for,sent_at,reason,created_at,lead_id,leads(display_name)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (activity.error)
      throw new Error("Não foi possível consultar as atividades.");
    return NextResponse.json({ policy, activity: activity.data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar automações.",
      },
      { status: statusForDashboardCompanyScopeError(error, 400) },
    );
  }
}

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Sessão obrigatória." }, { status: 401 });
  try {
    const body = await request.json();
    const organizationId = resolveDashboardCompanyId({
      workspace,
      requestedCompanyId:
        typeof body.companyId === "string" ? body.companyId : null,
    });
    if (
      !workspace.profile.isPlatformAdmin &&
      !["owner", "admin", "manager"].includes(
        workspace.organization?.role ?? "",
      )
    )
      return NextResponse.json(
        {
          error: "Somente responsáveis pela empresa podem alterar automações.",
        },
        { status: 403 },
      );
    const client = createServiceClient();
    if (body.action === "set_window") {
      const time = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (
        !time.test(body.start ?? "") ||
        !time.test(body.end ?? "") ||
        body.start === body.end
      )
        throw new Error("Informe uma janela de contato válida.");
      if (typeof body.timezone !== "string")
        throw new Error("Informe o fuso horário.");
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: body.timezone }).format();
      } catch {
        throw new Error("Fuso horário inválido.");
      }
      const existing = await loadAutomationPolicy(client, organizationId);
      if (!existing)
        throw new Error(
          "Ative o controle central antes de personalizar os horários.",
        );
      const result = await client
        .from("automation_policies")
        .update({
          window_start: body.start,
          window_end: body.end,
          timezone: body.timezone,
          updated_by: workspace.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId);
      if (result.error) throw new Error("Não foi possível salvar os horários.");
      return NextResponse.json({
        policy: await loadAutomationPolicy(client, organizationId),
      });
    }
    if (body.action === "close_uncertain") {
      if (typeof body.dispatchId !== "string")
        throw new Error("Tentativa inválida.");
      const closed = await client
        .from("automation_dispatches")
        .update({
          status: "skipped",
          reason: "delivery_reviewed_without_resend",
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", body.dispatchId)
        .eq("status", "uncertain")
        .select("id")
        .single();
      if (closed.error)
        throw new Error("Essa tentativa já mudou. Atualize a atividade.");
      return NextResponse.json({ closed: true });
    }
    if (body.action !== "set_follow_up" || typeof body.enabled !== "boolean")
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const { error } = await client.from("automation_policies").upsert(
      {
        organization_id: organizationId,
        follow_up_enabled: body.enabled,
        updated_by: workspace.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
    if (error) throw new Error("Não foi possível salvar a configuração.");
    // Preserve terminal and in-flight records for audit. The executor rechecks
    // the policy immediately before dispatching, including queued legacy events.
    if (!body.enabled) {
      const cancelled = await client
        .from("automation_dispatches")
        .update({
          status: "skipped",
          reason: "disabled_by_company",
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("status", "pending");
      if (cancelled.error)
        throw new Error(
          "Follow-up desativado; não foi possível atualizar o histórico da fila.",
        );
    }
    return NextResponse.json({
      policy: await loadAutomationPolicy(client, organizationId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar." },
      { status: statusForDashboardCompanyScopeError(error, 400) },
    );
  }
}
