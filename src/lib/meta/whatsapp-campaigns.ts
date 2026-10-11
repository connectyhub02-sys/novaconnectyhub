import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertBillableAccess } from "@/lib/billing/trial";
import {
  campaignPhones,
  templateParameters,
} from "./whatsapp-workspace-policy";
import {
  officialConnection,
  listOfficialTemplates,
  sendOfficialMessage,
} from "./whatsapp-cloud";
import { collectOutboundLinks } from "@/lib/whatsapp/outbound-links";

export async function prepareOfficialCampaign(
  client: SupabaseClient,
  org: string,
  actor: string,
  body: Record<string, unknown>,
) {
  const sender = String(body.sender ?? "");
  if (!sender) throw new Error("Selecione o número remetente.");
  const connection = await officialConnection(client, org, sender);
  if (!connection?.webhook_subscribed)
    throw new Error(
      "Conecte o número oficial e confirme o recebimento dos eventos.",
    );
  const name = String(body.name ?? "").trim(),
    consent = String(body.consentNote ?? "").trim();
  if (!name || name.length > 120)
    throw new Error("Dê um nome de até 120 caracteres à campanha.");
  if (body.consent !== true || consent.length < 5 || consent.length > 500)
    throw new Error(
      "Confirme a autorização dos destinatários e registre sua origem.",
    );
  if (
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
      String(body.requestKey),
    )
  )
    throw new Error("Identificador de campanha inválido.");
  const phones = campaignPhones(body.phones);
  const template = (await listOfficialTemplates(client, connection)).find(
    (t) =>
      t.name === body.templateName &&
      t.language === body.language &&
      t.status === "APPROVED",
  );
  if (!template)
    throw new Error("Escolha um modelo aprovado para este número.");
  const rendered = templateParameters(template, body.parameters);
  if (collectOutboundLinks({ text: rendered.text }).length)
    throw new Error("Este modelo contém links sem rastreamento suportado.");
  const scheduled = body.scheduledAt
    ? new Date(String(body.scheduledAt))
    : new Date();
  if (
    !Number.isFinite(scheduled.getTime()) ||
    scheduled.getTime() > Date.now() + 365 * 86400000
  )
    throw new Error("Data de agendamento inválida.");
  const result = await client.rpc("create_meta_whatsapp_campaign", {
    p_org: org,
    p_actor: actor,
    p_key: body.requestKey,
    p_sender: sender,
    p_name: name,
    p_template: template,
    p_parameters: Array.isArray(body.parameters) ? body.parameters : [],
    p_consent: consent,
    p_phones: phones,
    p_scheduled: body.scheduledAt ? scheduled.toISOString() : null,
  });
  if (result.error)
    throw new Error(
      "Não foi possível preparar a campanha. Confira os números e a conexão.",
    );
  return { id: result.data };
}

export async function changeOfficialCampaign(
  client: SupabaseClient,
  org: string,
  id: string,
  action: string,
  costAccepted: boolean,
) {
  const row = await client
    .from("meta_whatsapp_campaigns")
    .select("*")
    .eq("organization_id", org)
    .eq("id", id)
    .maybeSingle();
  if (row.error || !row.data)
    throw new Error("Campanha não encontrada nesta empresa.");
  const c = row.data;
  const transitions: Record<string, { from: string[]; to: string }> = {
    start: { from: ["draft", "paused"], to: "running" },
    pause: { from: ["running"], to: "paused" },
    cancel: { from: ["draft", "running", "paused"], to: "cancelled" },
  };
  const transition = transitions[action];
  if (!transition || !transition.from.includes(c.status))
    throw new Error("A campanha não permite essa ação no estado atual.");
  if (action === "start") {
    if (!costAccepted)
      throw new Error(
        "Revise e confirme os destinatários e a cobrança de uso da Meta antes de iniciar.",
      );
    const connection = await officialConnection(client, org, c.phone_number_id);
    if (!connection?.webhook_subscribed)
      throw new Error("Remetente desconectado.");
    const template = (await listOfficialTemplates(client, connection)).find(
      (t) =>
        t.name === c.template_name &&
        t.language === c.language &&
        t.status === "APPROVED",
    );
    if (
      !template ||
      JSON.stringify(template.components) !==
        JSON.stringify(c.template_snapshot.components)
    )
      throw new Error(
        "O modelo mudou ou deixou de estar aprovado. Prepare uma nova campanha.",
      );
    templateParameters(template, c.parameters);
  }
  const result = await client
    .from("meta_whatsapp_campaigns")
    .update({ status: transition.to, updated_at: new Date().toISOString() })
    .eq("organization_id", org)
    .eq("id", id)
    .eq("status", c.status)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data)
    throw new Error("A campanha mudou. Atualize antes de tentar novamente.");
  if (action === "cancel") {
    const cancelled = await client
      .from("meta_whatsapp_campaign_recipients")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("organization_id", org)
      .eq("campaign_id", id)
      .eq("status", "pending");
    if (cancelled.error)
      throw new Error(
        "Campanha cancelada; atualização dos pendentes será reconciliada pela fila.",
      );
  }
  return { status: transition.to };
}

// Each recipient has a stable send key; a timeout is terminal/uncertain, never a blind resend.
export async function dispatchOfficialCampaignBatch(client: SupabaseClient) {
  const claim = await client.rpc("claim_meta_whatsapp_campaign_batch", {
    p_limit: 20,
  });
  if (claim.error) throw new Error("Falha ao reservar a fila oficial.");
  let processed = 0;
  const started = Date.now();
  for (const r of claim.data ?? []) {
    const campaign = await client
      .from("meta_whatsapp_campaigns")
      .select("*")
      .eq("organization_id", r.organization_id)
      .eq("id", r.campaign_id)
      .maybeSingle();
    if (campaign.error)
      throw new Error("Falha ao consultar campanha reservada.");
    const c = campaign.data;
    if (!c || c.status !== "running" || Date.now() - started > 200000) {
      const released = await client
        .from("meta_whatsapp_campaign_recipients")
        .update({
          status: c?.status === "cancelled" ? "cancelled" : "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .eq("status", "processing");
      if (released.error)
        throw new Error("Falha ao liberar destinatário pausado.");
      continue;
    }
    let status = "sent",
      detail: string | null = null,
      messageId: string | null = null;
    try {
      await assertBillableAccess({ client, organizationId: c.organization_id });
      const connection = await officialConnection(
        client,
        c.organization_id,
        c.phone_number_id,
      );
      if (!connection) throw new Error("Número oficial desconectado.");
      const result = await sendOfficialMessage(
        client,
        connection,
        c.created_by,
        {
          type: "template",
          phone: r.phone,
          requestKey: r.request_key,
          templateName: c.template_name,
          language: c.language,
          parameters: c.parameters,
          expectedTemplate: c.template_snapshot.components,
          consent: true,
          consentNote: c.consent_note,
        },
      );
      messageId = result.id;
      if (["sending", "uncertain"].includes(result.status))
        status = "uncertain";
      if (result.status === "failed") status = "failed";
    } catch (error) {
      const existing = await client
        .from("meta_whatsapp_messages")
        .select("id,status")
        .eq("organization_id", r.organization_id)
        .eq("request_key", r.request_key)
        .maybeSingle();
      if (existing.error)
        throw new Error(
          "Não foi possível conferir o resultado do envio. A reserva será recuperada.",
        );
      messageId = existing.data?.id ?? null;
      status = existing.data
        ? ["accepted", "sent", "delivered", "read"].includes(
            existing.data.status,
          )
          ? "sent"
          : existing.data.status === "failed"
            ? "failed"
            : "uncertain"
        : "skipped";
      detail =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Falha no envio oficial";
      // Pause on provider rejections or disconnected/billing state; do not burn a whole audience.
      if (
        status !== "skipped" ||
        !/desativado|não receber|parada/i.test(detail)
      ) {
        const paused = await client
          .from("meta_whatsapp_campaigns")
          .update({ status: "paused", updated_at: new Date().toISOString() })
          .eq("id", c.id)
          .eq("organization_id", c.organization_id)
          .eq("status", "running");
        if (paused.error)
          throw new Error(
            "Falha ao pausar a campanha. A reserva será recuperada sem repetição.",
          );
      }
    }
    const saved = await client
      .from("meta_whatsapp_campaign_recipients")
      .update({
        status,
        message_id: messageId,
        detail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id)
      .eq("organization_id", r.organization_id)
      .eq("status", "processing");
    if (saved.error)
      throw new Error(
        "Falha ao salvar resultado da fila. Não repetir o envio.",
      );
    processed++;
  }
  const campaigns = await client
    .from("meta_whatsapp_campaigns")
    .select("id,organization_id")
    .eq("status", "running")
    .limit(100);
  if (campaigns.error) throw new Error("Falha ao finalizar campanhas.");
  for (const c of campaigns.data ?? []) {
    const remaining = await client
      .from("meta_whatsapp_campaign_recipients")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", c.organization_id)
      .eq("campaign_id", c.id)
      .in("status", ["pending", "processing"]);
    if (remaining.error)
      throw new Error("Falha ao contar pendências da campanha.");
    if (remaining.count === 0) {
      const completed = await client
        .from("meta_whatsapp_campaigns")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", c.id)
        .eq("organization_id", c.organization_id)
        .eq("status", "running");
      if (completed.error) throw new Error("Falha ao concluir a campanha.");
    }
  }
  return { processed };
}
