import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveDashboardCompanyId,
  statusForDashboardCompanyScopeError,
} from "@/lib/client-os/dashboard-route-scope";
import {
  getAgenda,
  availableAppointments,
  validateResource,
  agendaErrorMessage,
} from "@/lib/automations/agenda";
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
      client = createServiceClient();
    let leadQuery = client
      .from("leads")
      .select("id,display_name")
      .eq("organization_id", org)
      .order("display_name")
      .limit(100);
    const search = request.nextUrl.searchParams
      .get("search")
      ?.trim()
      .slice(0, 100);
    if (search)
      leadQuery = leadQuery.ilike(
        "display_name",
        `%${search.replace(/[\\%_]/g, "\\$&")}%`,
      );
    const leads = await leadQuery;
    if (leads.error) throw new Error("Não foi possível consultar os contatos.");
    const notices = await client
      .from("customer_agenda_notices")
      .select("id,audience,kind,status,due_at,reason")
      .eq("organization_id", org)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (notices.error)
      throw new Error("Não foi possível consultar os avisos da agenda.");
    return NextResponse.json({
      ...(await getAgenda(client, org)),
      notices: notices.data,
      leads: leads.data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Agenda indisponível.",
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
        { error: "Somente responsáveis pela empresa podem alterar a agenda." },
        { status: 403 },
      );
    if (body.action === "set_enabled") {
      if (typeof body.enabled !== "boolean")
        throw new Error("Informe o estado da agenda.");
      if (body.enabled) {
        const resources = await client
          .from("customer_agenda_resources")
          .select("id")
          .eq("organization_id", org)
          .eq("enabled", true)
          .limit(1);
        if (resources.error || !resources.data?.length)
          throw new Error(
            "Cadastre ao menos um serviço ou mesa antes de ativar.",
          );
      }
      const result = await client.from("customer_agenda_settings").upsert(
        {
          organization_id: org,
          enabled: body.enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
      if (result.error) throw new Error("Falha ao salvar a agenda.");
    } else if (body.action === "set_timezone") {
      if (typeof body.timezone !== "string")
        throw new Error("Informe o fuso horário.");
      try {
        new Intl.DateTimeFormat("pt-BR", { timeZone: body.timezone }).format();
      } catch {
        throw new Error("Fuso horário inválido.");
      }
      const saved = await client.from("customer_agenda_settings").upsert({
        organization_id: org,
        timezone: body.timezone,
        updated_at: new Date().toISOString(),
      });
      if (saved.error) throw new Error("Falha ao salvar o fuso.");
    } else if (
      body.action === "create_resource" ||
      body.action === "update_resource"
    ) {
      const resource = validateResource(body.resource ?? {});
      if (
        body.action === "update_resource" &&
        !uuid.test(body.resourceId ?? "")
      )
        throw new Error("Recurso inválido.");
      const result =
        body.action === "create_resource"
          ? await client
              .from("customer_agenda_resources")
              .insert({ ...resource, organization_id: org })
          : await client
              .from("customer_agenda_resources")
              .update({ ...resource, enabled: body.resource.enabled !== false })
              .eq("organization_id", org)
              .eq("id", body.resourceId)
              .select("id")
              .single();
      if (result.error) throw new Error("Falha ao salvar o serviço ou mesa.");
    } else if (body.action === "availability") {
      if (
        !uuid.test(body.resourceId ?? "") ||
        !Number.isFinite(Date.parse(body.from))
      )
        throw new Error("Informe recurso e data válidos.");
      let excludeId: string | undefined;
      if (body.bookingId) {
        const booking = await client
          .from("customer_agenda_bookings")
          .select("id")
          .eq("organization_id", org)
          .eq("id", body.bookingId)
          .eq("resource_id", body.resourceId)
          .single();
        if (booking.error) throw new Error("Agendamento inválido.");
        excludeId = booking.data.id;
      }
      return NextResponse.json({
        slots: await availableAppointments(
          client,
          org,
          body.resourceId,
          new Date(body.from),
          Number(body.partySize ?? 1),
          excludeId,
        ),
      });
    } else if (body.action === "book" || body.action === "reschedule") {
      if (
        !uuid.test(body.resourceId ?? "") ||
        !uuid.test(body.leadId ?? "") ||
        typeof body.requestKey !== "string" ||
        !body.requestKey ||
        !Number.isFinite(Date.parse(body.startsAt))
      )
        throw new Error("Confira os dados da reserva.");
      const conversation = await client
        .from("conversations")
        .select("id,whatsapp_instance_id")
        .eq("organization_id", org)
        .eq("lead_id", body.leadId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (conversation.error)
        throw new Error(
          "Não foi possível consultar o atendimento deste contato.",
        );
      const instance = conversation.data?.whatsapp_instance_id
        ? await client
            .from("whatsapp_instances")
            .select("metadata")
            .eq("id", conversation.data.whatsapp_instance_id)
            .eq("organization_id", org)
            .single()
        : null;
      if (instance?.error)
        throw new Error("Não foi possível consultar o agente responsável.");
      const result = await client.rpc("reserve_customer_appointment", {
        p_org: org,
        p_resource: body.resourceId,
        p_lead: body.leadId,
        p_start: body.startsAt,
        p_party: Number(body.partySize ?? 1),
        p_key: body.requestKey,
        p_replace: body.action === "reschedule" ? body.bookingId : null,
        p_version: body.version ?? null,
        p_conversation: conversation.data?.id ?? null,
        p_agent:
          instance?.data?.metadata?.agent_id ??
          (uuid.test(body.agentId ?? "") ? body.agentId : null),
      });
      if (result.error)
        return NextResponse.json(
          { error: agendaErrorMessage(result.error.message) },
          { status: 409 },
        );
    } else if (
      ["confirm", "cancel", "complete", "no_show"].includes(body.action)
    ) {
      if (!uuid.test(body.bookingId ?? "") || !Number.isInteger(body.version))
        throw new Error("Agendamento inválido.");
      const result = await client.rpc("update_customer_appointment", {
        p_org: org,
        p_booking: body.bookingId,
        p_version: body.version,
        p_action: body.action,
        p_actor: workspace.user.id,
      });
      if (result.error)
        return NextResponse.json(
          { error: agendaErrorMessage(result.error.message) },
          { status: 409 },
        );
    } else throw new Error("Ação inválida.");
    return NextResponse.json(await getAgenda(client, org));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Não foi possível salvar.",
      },
      { status: statusForDashboardCompanyScopeError(error, 400) },
    );
  }
}
