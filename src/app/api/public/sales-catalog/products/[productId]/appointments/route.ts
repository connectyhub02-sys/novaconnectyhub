import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapSalesCatalogItem } from "@/lib/client-os/sales-catalog";
import { publicCommerceBlockResponse } from "@/lib/sales-catalog/public-commerce-access";
import { isSalesCatalogDisplayableProduct } from "@/lib/sales-catalog/shared";
import { availableAppointments, agendaErrorMessage } from "@/lib/automations/agenda";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { localContactTime } from "@/lib/automations/contact-window";
import { readAgendaActivation, agendaDisabledMessage } from "@/lib/automations/agenda-activation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ productId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function loadProduct(productId: string) {
  if (!uuid.test(productId)) throw new Error("Item não encontrado.");
  const client = createServiceClient();
  const { data, error } = await client.from("intelligence_memory").select("id,organization_id,title,content,metadata,created_at,updated_at")
    .eq("id", productId).eq("scope", "organization").eq("memory_type", "sales_catalog_item").maybeSingle();
  if (error || !data?.organization_id) throw new Error("Item não encontrado.");
  const item = mapSalesCatalogItem(data);
  if (item.status !== "active" || !isSalesCatalogDisplayableProduct(item) || item.salesDestination !== "appointment") throw new Error("Este item não permite agendamento.");
  return { client, item };
}
function guardRequest(request: NextRequest, write: boolean) {
  const guard = validatePublicWriteRequest({ headers: request.headers, requestUrl: request.url, routeKey: `catalog-agenda-${write ? "book" : "slots"}`, maxPayloadBytes: 4096, rateLimit: { limit: write ? 5 : 40, windowMs: 60000 } });
  return guard.ok ? null : NextResponse.json({ error: guard.message }, { status: guard.status });
}
export async function GET(request: NextRequest, context: Context) {
  const guard = guardRequest(request, false); if (guard) return guard;
  try {
    const { client, item } = await loadProduct((await context.params).productId);
    const unavailable = await publicCommerceBlockResponse(item.companyId, client); if (unavailable) return unavailable;
    const activation = await readAgendaActivation(client, item.companyId);
    if (!activation.enabled) return NextResponse.json({ enabled: false, slots: [], error: agendaDisabledMessage }, { status: 409, headers: { "Cache-Control": "no-store" } });
    if (!item.fulfillment.agendaResourceId) return NextResponse.json({ slots: [], contactRequired: true });
    const timezone = activation.timezone;
    const requested = request.nextUrl.searchParams.get("from");
    const day = request.nextUrl.searchParams.get("day") ?? (requested ? null : localContactTime(new Date(), timezone).day);
    let from = requested ? new Date(requested) : new Date();
    if (day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Escolha uma data válida.");
      // Find local midnight using the agenda timezone, including DST transitions.
      const lower = Date.parse(`${day}T00:00:00Z`) - 14 * 3600000;
      from = new Date(NaN);
      for (let minute = 0; minute < 28 * 60; minute++) {
        const candidate = new Date(lower + minute * 60000);
        if (Number.isFinite(candidate.getTime()) && localContactTime(candidate, timezone).day === day) { from = candidate; break; }
      }
    }
    if (!Number.isFinite(from.getTime()) || from.getTime() > Date.now() + 90 * 86400000) throw new Error("Escolha uma data nos próximos 90 dias.");
    const slots = await availableAppointments(client, item.companyId, item.fulfillment.agendaResourceId, from, 1, undefined, day ?? undefined);
    return NextResponse.json({ enabled: true, slots, timezone, day }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Agenda indisponível." }, { status: 422 }); }
}
export async function POST(request: NextRequest, context: Context) {
  const guard = guardRequest(request, true); if (guard) return guard;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return NextResponse.json({ error: "Solicitação muito grande." }, { status: 413 });
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Solicitação inválida.");
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
    const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : new Date(NaN);
    if (!name || !/^\d{10,15}$/.test(phone) || !Number.isFinite(startsAt.getTime()) || startsAt.getTime() > Date.now() + 90 * 86400000) throw new Error("Informe nome, telefone com código do país e um horário disponível.");
    const { client, item } = await loadProduct((await context.params).productId);
    const unavailable = await publicCommerceBlockResponse(item.companyId, client); if (unavailable) return unavailable;
    if (!(await readAgendaActivation(client, item.companyId)).enabled) return NextResponse.json({ enabled: false, error: agendaDisabledMessage }, { status: 409 });
    const resourceId = item.fulfillment.agendaResourceId;
    if (!resourceId) throw new Error("Solicite o atendimento para combinar um horário.");
    const key = `public:${createHash("sha256").update([item.companyId, item.id, resourceId, phone, startsAt.toISOString()].join("|")).digest("hex")}`;
    const previous = await client.from("customer_agenda_bookings").select("starts_at,ends_at,status").eq("organization_id", item.companyId).eq("request_key", key).maybeSingle();
    if (previous.error) throw new Error("Não foi possível verificar o agendamento.");
    if (previous.data) {
      if (previous.data.status !== "booked") throw new Error("Essa reserva não está ativa. Escolha outro horário ou fale com o atendimento.");
      return NextResponse.json({ booked: true, startsAt: previous.data.starts_at, endsAt: previous.data.ends_at });
    }
    const slots = await availableAppointments(client, item.companyId, resourceId, startsAt);
    if (!slots.some(slot => slot.starts_at === startsAt.toISOString())) throw new Error("Esse horário não está mais disponível. Escolha outro.");
    const findLead = () => client.from("leads").select("id").eq("organization_id", item.companyId).eq("channel", "whatsapp").eq("phone_number", phone).maybeSingle();
    const existing = await findLead();
    if (existing.error) throw new Error("Não foi possível cadastrar o contato.");
    let leadId = existing.data?.id;
    if (!leadId) {
      const created = await client.from("leads").insert({ organization_id: item.companyId, channel: "whatsapp", phone_number: phone, display_name: name, source: "catalog_appointment", metadata: { requested_catalog_item_id: item.id } }).select("id").single();
      if (created.error?.code === "23505") leadId = (await findLead()).data?.id;
      else if (created.error) throw new Error("Não foi possível cadastrar o contato.");
      else leadId = created.data.id;
    }
    if (!leadId) throw new Error("Não foi possível cadastrar o contato.");
    const result = await client.rpc("reserve_customer_appointment", { p_org: item.companyId, p_resource: resourceId, p_lead: leadId, p_start: startsAt.toISOString(), p_party: 1, p_key: key });
    if (result.error?.message?.includes("AGENDA_UNAVAILABLE")) return NextResponse.json({ enabled: false, error: agendaDisabledMessage }, { status: 409 });
    if (result.error) throw new Error(agendaErrorMessage(result.error.message));
    return NextResponse.json({ booked: true, startsAt: result.data.starts_at, endsAt: result.data.ends_at });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível agendar." }, { status: 422 }); }
}
