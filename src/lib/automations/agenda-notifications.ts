import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readAgentResponsibleHumans,
  normalizeBrazilianWhatsappPhone,
} from "@/lib/agents/responsible-human";
import { loadUazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { getContractAccess } from "@/lib/billing/contract-access";
import { inngest } from "@/lib/inngest/client";

async function bookingContext(client: SupabaseClient, org: string, id: string) {
  const booking = await client
    .from("customer_agenda_bookings")
    .select("*")
    .eq("organization_id", org)
    .eq("id", id)
    .single();
  if (booking.error) throw new Error("booking_missing");
  const b = booking.data;
  const [lead, resource, settings, agent] = await Promise.all([
    client
      .from("leads")
      .select("id,display_name,phone_number,status,metadata")
      .eq("organization_id", org)
      .eq("id", b.lead_id)
      .single(),
    client
      .from("customer_agenda_resources")
      .select("name,service_name")
      .eq("organization_id", org)
      .eq("id", b.resource_id)
      .single(),
    client
      .from("customer_agenda_settings")
      .select("enabled,timezone")
      .eq("organization_id", org)
      .single(),
    b.agent_id
      ? client
          .from("agent_registry")
          .select("metadata,persona_name,name")
          .eq("organization_id", org)
          .eq("id", b.agent_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (lead.error || resource.error || settings.error || agent.error)
    throw new Error("context_missing");
  return {
    b,
    lead: lead.data,
    resource: resource.data,
    settings: settings.data,
    agent: agent.data,
    responsibles: readAgentResponsibleHumans(agent.data?.metadata).filter(
      (person) => person.notifyOperational,
    ),
  };
}

export async function prepareAgendaNotifications(client: SupabaseClient) {
  const events = await client
    .from("customer_agenda_events")
    .select("id,organization_id,booking_id,version,event_type")
    .is("notices_prepared_at", null)
    .order("created_at")
    .limit(100);
  if (events.error) throw new Error(events.error.message);
  const upcoming = await client
    .from("customer_agenda_bookings")
    .select("organization_id,id")
    .eq("status", "booked")
    .lte("starts_at", new Date(Date.now() + 86400000).toISOString())
    .gte("ends_at", new Date(Date.now() - 86400000).toISOString())
    .order("starts_at")
    .limit(100);
  if (upcoming.error) throw new Error(upcoming.error.message);
  const ids = new Map<string, string>();
  for (const e of events.data ?? []) ids.set(e.booking_id, e.organization_id);
  for (const b of upcoming.data ?? []) ids.set(b.id, b.organization_id);
  let queued = 0;
  for (const [id, org] of ids) {
    const c = await bookingContext(client, org, id);
    const eventIds = (events.data ?? [])
      .filter((e) => e.booking_id === id)
      .map((e) => e.id);
    if (!c.settings.enabled) {
      if (eventIds.length)
        await client
          .from("customer_agenda_events")
          .update({ notices_prepared_at: new Date().toISOString() })
          .in("id", eventIds);
      continue;
    }
    const when = new Date(c.b.starts_at).toLocaleString("pt-BR", {
      timeZone: c.settings.timezone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const summary = `${c.lead.display_name ?? "Cliente"} · ${c.resource.service_name} · ${c.resource.name} · ${when}`;
    const rows: Array<Record<string, unknown>> = [];
    const push = (
      audience: string,
      phone: string,
      kind: string,
      due: Date,
      text: string,
    ) => {
      if (phone)
        rows.push({
          organization_id: org,
          booking_id: id,
          booking_version: c.b.version,
          audience,
          recipient_phone: normalizeBrazilianWhatsappPhone(phone),
          kind,
          due_at: due.toISOString(),
          message_text: text,
        });
    };
    for (const e of (events.data ?? []).filter(
      (e) => e.booking_id === id && e.version === c.b.version,
    ))
      for (const person of c.responsibles) {
        const title =
          (
            {
              booked: "Novo agendamento",
              rescheduled: "Agendamento remarcado",
              confirm: "Presença confirmada",
              cancel: "Agendamento cancelado",
              complete: "Atendimento realizado",
              no_show: "Ausência registrada",
            } as Record<string, string>
          )[e.event_type] ?? "Agenda atualizada";
        push(
          "responsible",
          person.phone,
          `event:${e.event_type}`,
          new Date(),
          `${title}: ${summary}.`,
        );
      }
    if (c.b.status === "booked") {
      const reminderAt = new Date(Date.parse(c.b.starts_at) - 30 * 60000);
      if (
        !c.b.confirmed_at &&
        Date.parse(c.b.starts_at) > Date.now() &&
        Date.parse(c.b.updated_at) < reminderAt.getTime()
      )
        push(
          "lead",
          c.lead.phone_number ?? "",
          "reminder",
          reminderAt,
          `Seu horário de ${c.resource.service_name} é ${when}. Está confirmado?`,
        );
      for (const person of c.responsibles)
        push(
          "responsible",
          person.phone,
          "outcome",
          new Date(Date.parse(c.b.ends_at) + 15 * 60000),
          `O atendimento foi realizado? ${summary}.`,
        );
    }
    if (rows.length) {
      const inserted = await client
        .from("customer_agenda_notices")
        .upsert(rows, {
          onConflict: "booking_id,booking_version,kind,recipient_phone",
          ignoreDuplicates: true,
        });
      if (inserted.error) throw new Error(inserted.error.message);
      queued += rows.length;
    }
    if (eventIds.length) {
      const marked = await client
        .from("customer_agenda_events")
        .update({ notices_prepared_at: new Date().toISOString() })
        .in("id", eventIds);
      if (marked.error) throw new Error(marked.error.message);
    }
  }
  return { considered: queued };
}

export async function dispatchAgendaNotifications(
  client: SupabaseClient,
  noticeId?: string,
) {
  const now = new Date().toISOString();
  await client
    .from("customer_agenda_notices")
    .update({
      status: "uncertain",
      reason: "delivery_confirmation_missing",
      updated_at: now,
    })
    .eq("status", "sending")
    .lt("lease_until", now);
  await client
    .from("customer_agenda_notices")
    .update({ status: "pending", updated_at: now })
    .eq("status", "processing")
    .lt("lease_until", now);
  let dueQuery = client
    .from("customer_agenda_notices")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", now)
    .order("due_at")
    .limit(5);
  if (noticeId) dueQuery = dueQuery.eq("id", noticeId);
  const due = await dueQuery;
  if (due.error) throw new Error(due.error.message);
  let sent = 0;
  for (const n of due.data ?? []) {
    const claimToken = randomUUID();
    const claim = await client
      .from("customer_agenda_notices")
      .update({
        status: "processing",
        claim_token: claimToken,
        lease_until: new Date(Date.now() + 120000).toISOString(),
        attempts: n.attempts + 1,
      })
      .eq("id", n.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claim.error) throw new Error(claim.error.message);
    if (!claim.data) continue;
    let sending = false;
    try {
      const c = await bookingContext(client, n.organization_id, n.booking_id);
      const optedOut =
        c.lead.status === "archived" ||
        c.lead.metadata?.whatsapp_opt_out === true ||
        Boolean(c.lead.metadata?.opt_out?.requested_at);
      const allowedRecipient =
        n.audience === "lead"
          ? normalizeBrazilianWhatsappPhone(c.lead.phone_number) ===
              n.recipient_phone && !optedOut
          : c.responsibles.some((person) => person.phone === n.recipient_phone);
      if (
        !c.settings.enabled ||
        c.b.version !== n.booking_version ||
        !allowedRecipient ||
        (n.kind === "reminder" &&
          (c.b.status !== "booked" ||
            Date.parse(c.b.starts_at) <= Date.now())) ||
        (n.kind === "outcome" && c.b.status !== "booked")
      ) {
        await client
          .from("customer_agenda_notices")
          .update({ status: "skipped", reason: "booking_or_recipient_changed" })
          .eq("id", n.id)
          .eq("claim_token", claimToken);
        continue;
      }
      if (!c.b.agent_id) throw new Error("missing_responsible_agent");
      const instance = await client
        .from("whatsapp_instances")
        .select("id,status,instance_token_encrypted,metadata")
        .eq("organization_id", n.organization_id)
        .eq("metadata->>agent_id", c.b.agent_id)
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      if (instance.error || !instance.data?.instance_token_encrypted)
        throw new Error("whatsapp_unavailable");
      if (!(await getContractAccess(n.organization_id, client)).allowed)
        throw new Error("billing_blocked");
      const options =
        n.kind === "outcome"
          ? [
              ["Sim, realizado", "complete"],
              ["Não compareceu", "no_show"],
              ["Ainda não sei", "unknown"],
            ]
          : n.kind === "reminder" && !c.b.confirmed_at
            ? [
                ["Confirmar", "confirm"],
                ["Remarcar", "reschedule"],
                ["Cancelar", "cancel"],
              ]
            : [];
      const choices: string[] = [];
      for (const [label, action] of options) {
        const saved = await client.from("customer_agenda_actions").upsert(
          {
            notice_id: n.id,
            organization_id: n.organization_id,
            booking_id: n.booking_id,
            booking_version: n.booking_version,
            recipient_phone: n.recipient_phone,
            action,
            expires_at: new Date(
              Math.max(
                Date.now() + 86400000,
                Date.parse(c.b.ends_at) + 86400000,
              ),
            ).toISOString(),
          },
          { onConflict: "notice_id,action", ignoreDuplicates: true },
        );
        if (saved.error) throw new Error("action_creation_failed");
        const token = await client
          .from("customer_agenda_actions")
          .select("token")
          .eq("notice_id", n.id)
          .eq("action", action)
          .single();
        if (token.error) throw new Error("action_missing");
        choices.push(`${label}|agenda-action:${token.data.token}`);
      }
      const credentials = await loadUazapiCredentials(client),
        token = decryptCredentialValue(instance.data.instance_token_encrypted);
      const start = await client
        .from("customer_agenda_notices")
        .update({
          status: "sending",
          lease_until: new Date(Date.now() + 120000).toISOString(),
        })
        .eq("id", n.id)
        .eq("status", "processing")
        .eq("claim_token", claimToken)
        .gt("lease_until", new Date().toISOString())
        .select("id")
        .maybeSingle();
      if (start.error) throw new Error("delivery_claim_failed");
      if (!start.data) continue;
      sending = true;
      const response = await fetch(
        `${credentials.baseUrl}${choices.length ? "/send/menu" : "/send/text"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({
            number: n.recipient_phone,
            text: n.message_text,
            ...(choices.length
              ? {
                  type: "button",
                  choices,
                  footerText:
                    c.agent?.persona_name ?? c.agent?.name ?? "Agenda",
                }
              : { linkPreview: false }),
            track_source: "connectyhub",
            track_id: `agenda_${n.id}`,
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result || result.error || result.success === false)
        throw new Error("delivery_unconfirmed");
      const saved = await client
        .from("customer_agenda_notices")
        .update({
          status: "sent",
          updated_at: new Date().toISOString(),
          reason: null,
        })
        .eq("id", n.id)
        .eq("claim_token", claimToken);
      if (saved.error) throw new Error("delivery_state_missing");
      sent++;
      if (n.audience === "lead" && c.b.conversation_id)
        await client.from("conversation_messages").insert({
          organization_id: n.organization_id,
          conversation_id: c.b.conversation_id,
          lead_id: c.b.lead_id,
          whatsapp_instance_id: instance.data.id,
          provider: "uazapi",
          direction: "outbound",
          message_type: choices.length ? "interactive" : "text",
          text_content: n.message_text,
          occurred_at: new Date().toISOString(),
          payload: {
            delivery_source: "customer_agenda",
            booking_id: n.booking_id,
            notice_id: n.id,
          },
        });
    } catch (error) {
      await client
        .from("customer_agenda_notices")
        .update({
          status: sending
            ? "uncertain"
            : n.attempts >= 2
              ? "failed"
              : "pending",
          reason: error instanceof Error ? error.message : "notice_failed",
          due_at: new Date(Date.now() + 15 * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", n.id)
        .eq("claim_token", claimToken)
        .neq("status", "sent");
    }
  }
  return { sent };
}

export async function consumeAgendaAction(
  client: SupabaseClient,
  input: {
    organizationId: string;
    phone: string;
    payload: unknown;
    text: string;
  },
) {
  const match = `${input.text}\n${JSON.stringify(input.payload)}`.match(
    /agenda-action:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
  );
  if (!match) return null;
  const phone = normalizeBrazilianWhatsappPhone(input.phone);
  const action = await client
    .from("customer_agenda_actions")
    .select("booking_id,action,recipient_phone")
    .eq("organization_id", input.organizationId)
    .eq("token", match[1])
    .eq("recipient_phone", phone)
    .maybeSingle();
  if (action.error || !action.data)
    return "Esse botão não está disponível para este contato.";
  const c = await bookingContext(
    client,
    input.organizationId,
    action.data.booking_id,
  );
  if (!c.settings.enabled)
    return "A agenda está pausada. O responsável pode conferir seu horário pelo painel.";
  const owner = c.responsibles.some((person) => person.phone === phone);
  if (
    (["complete", "no_show", "unknown"].includes(action.data.action) &&
      !owner) ||
    (!owner && normalizeBrazilianWhatsappPhone(c.lead.phone_number) !== phone)
  )
    return "Esse botão não está disponível para este contato.";
  const result = await client.rpc("consume_customer_agenda_action", {
    p_org: input.organizationId,
    p_token: match[1],
    p_phone: phone,
  });
  if (result.error)
    return "Esse agendamento foi atualizado ou o botão expirou. Vou precisar conferir o horário novamente.";
  if (result.data.action === "reschedule" && c.b.conversation_id) {
    const saved = await client
      .from("customer_agenda_offers")
      .upsert({
        organization_id: input.organizationId,
        conversation_id: c.b.conversation_id,
        lead_id: c.b.lead_id,
        resource_id: c.b.resource_id,
        slots: [],
        party_size: c.b.party_size,
        replace_booking_id: c.b.id,
        replace_version: c.b.version,
        expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      });
    if (saved.error)
      return "Não consegui preparar a remarcação. Seu horário atual continua reservado.";
  }
  return (
    (
      {
        confirm: "Seu horário está confirmado!",
        cancel: "O agendamento foi cancelado.",
        reschedule: "Claro. Qual dia e horário você prefere para remarcar?",
        complete: "Atendimento registrado como realizado.",
        no_show: "Registrei que o cliente não compareceu.",
        unknown:
          "Tudo bem. O resultado continua pendente; você pode atualizar pela agenda.",
      } as Record<string, string>
    )[result.data.action] ?? "Agenda atualizada."
  );
}

export async function queueAgendaNotifications(client: SupabaseClient) {
  const now = new Date().toISOString();
  const expired = await client
    .from("customer_agenda_notices")
    .update({ status: "uncertain", reason: "delivery_confirmation_missing" })
    .eq("status", "sending")
    .lt("lease_until", now);
  if (expired.error) throw new Error(expired.error.message);
  const recovered = await client
    .from("customer_agenda_notices")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("lease_until", now);
  if (recovered.error) throw new Error(recovered.error.message);
  const due = await client
    .from("customer_agenda_notices")
    .select("id,organization_id")
    .eq("status", "pending")
    .lte("due_at", now)
    .order("due_at")
    .limit(50);
  if (due.error) throw new Error(due.error.message);
  if (due.data?.length)
    await inngest.send(
      due.data.map((notice) => ({
        id: `agenda:${notice.id}:${Math.floor(Date.now() / 120000)}`,
        name: "connectyhub/agenda.notice",
        data: { noticeId: notice.id, organizationId: notice.organization_id },
      })),
    );
  return { queued: due.data?.length ?? 0 };
}
