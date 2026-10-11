import { NextResponse, type NextRequest } from "next/server";
import { officialAccess, OfficialAccessError } from "@/lib/meta/whatsapp-auth";
import {
  connectOfficial,
  createOfficialTemplate,
  listOfficialTemplates,
  officialConnection,
  officialSettings,
  registerOfficialNumber,
  sendOfficialMessage,
} from "@/lib/meta/whatsapp-cloud";
import {
  officialInbox,
  updateOfficialThread,
  officialCampaigns,
} from "@/lib/meta/whatsapp-inbox";
import {
  prepareOfficialCampaign,
  changeOfficialCampaign,
} from "@/lib/meta/whatsapp-campaigns";
import {
  uploadOfficialMedia,
  downloadOfficialMedia,
} from "@/lib/meta/whatsapp-media";
import { officialAssetId } from "@/lib/meta/whatsapp-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const failure = (error: unknown) =>
  json(
    {
      error:
        error instanceof Error ? error.message : "Falha na integração oficial.",
    },
    error instanceof OfficialAccessError ? error.status : 422,
  );
export async function GET(request: NextRequest) {
  try {
    const auth = await officialAccess(request),
      params = request.nextUrl.searchParams;
    const sender = params.get("sender"),
      phone = params.get("phone");
    if (params.get("download")) {
      if (!sender) throw new Error("Selecione o número.");
      const connection = await officialConnection(
        auth.client,
        auth.organizationId,
        sender,
      );
      if (!connection) throw new Error("Número desconectado.");
      return await downloadOfficialMedia(
        auth.client,
        connection,
        params.get("download")!,
      );
    }
    if (params.get("export")) {
      const id = params.get("export")!;
      const rows = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        const result = await auth.client
          .from("meta_whatsapp_campaign_recipients")
          .select(
            "phone,status,detail,updated_at,meta_whatsapp_messages(status,error_code)",
          )
          .eq("organization_id", auth.organizationId)
          .eq("campaign_id", id)
          .order("id")
          .range(offset, offset + 999);
        if (result.error) throw new Error("Falha ao exportar campanha.");
        rows.push(...result.data);
        if (result.data.length < 1000) break;
      }
      return json({ recipients: rows });
    }
    if (params.get("view") === "campaigns")
      return json({
        campaigns: await officialCampaigns(auth.client, auth.organizationId),
      });
    const config = await officialSettings(auth.client);
    const connections = await auth.client
      .from("meta_whatsapp_connections")
      .select(
        "phone_number_id,display_phone,verified_name,label,status,webhook_subscribed,webhook_at",
      )
      .eq("organization_id", auth.organizationId)
      .order("connected_at");
    if (connections.error) throw new Error("Falha ao consultar números.");
    const selected = sender
      ? connections.data.find((c) => c.phone_number_id === sender)
      : connections.data.find((c) => c.status === "connected");
    if (sender && !selected) {
      // A sender moved out of a tenant must not take that tenant's historical
      // conversations with it. This grants history reads only, never its token.
      const history = await auth.client
        .from("meta_whatsapp_threads")
        .select("phone_number_id")
        .eq("organization_id", auth.organizationId)
        .eq("phone_number_id", officialAssetId(sender))
        .limit(1)
        .maybeSingle();
      if (history.error)
        throw new Error("Falha ao consultar histórico deste número.");
      if (!history.data)
        throw new OfficialAccessError(
          "Número não encontrado nesta empresa.",
          404,
        );
    }
    let templates: Awaited<ReturnType<typeof listOfficialTemplates>> = [],
      templateError: string | null = null;
    if (selected?.status === "connected")
      try {
        const connection = await officialConnection(
          auth.client,
          auth.organizationId,
          selected.phone_number_id,
        );
        if (connection)
          templates = await listOfficialTemplates(auth.client, connection);
      } catch (error) {
        templateError =
          error instanceof Error
            ? error.message
            : "Falha ao consultar modelos.";
      }
    const inbox = await officialInbox(
      auth.client,
      auth.organizationId,
      sender,
      phone,
      Math.max(0, Math.min(10000, Number(params.get("offset")) || 0)),
      params.get("before"),
    );
    return json({
      ...inbox,
      connections: connections.data,
      selectedSender: sender || selected?.phone_number_id || null,
      connection: selected
        ? {
            displayPhone: selected.display_phone,
            verifiedName: selected.verified_name,
            webhookAt: selected.webhook_at,
            webhookSubscribed: selected.webhook_subscribed,
          }
        : null,
      templates,
      templateError,
      signupReady: Boolean(config.signupConfigId),
      pilotReady:
        auth.admin &&
        Boolean(config.pilotToken && config.pilotPhone && config.pilotWaba),
      actorId: auth.actorId,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await officialAccess(request);
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      if (Number(request.headers.get("content-length")) > 17 * 1024 * 1024)
        throw new Error("Arquivo acima do limite de 16 MB.");
      const form = await request.formData(),
        sender = officialAssetId(form.get("sender")),
        file = form.get("file");
      if (!(file instanceof File)) throw new Error("Selecione um arquivo.");
      const connection = await officialConnection(
        auth.client,
        auth.organizationId,
        sender,
      );
      if (!connection) throw new Error("Número desconectado.");
      return json(await uploadOfficialMedia(auth.client, connection, file));
    }
    if (Number(request.headers.get("content-length")) > 1024 * 1024)
      throw new Error("Solicitação muito grande.");
    const body = (await request.json()) as Record<string, unknown>;
    if (
      ["note", "read", "assign", "resolve", "rename_contact"].includes(
        String(body.action),
      )
    )
      return json(
        await updateOfficialThread(
          auth.client,
          auth.organizationId,
          auth.actorId,
          body,
        ),
      );
    if (body.action === "campaign_prepare")
      return json(
        await prepareOfficialCampaign(
          auth.client,
          auth.organizationId,
          auth.actorId,
          body,
        ),
      );
    if (body.action === "campaign_action")
      return json(
        await changeOfficialCampaign(
          auth.client,
          auth.organizationId,
          String(body.id),
          String(body.operation),
          body.costAccepted === true,
        ),
      );
    if (body.action === "import_pilot") {
      if (!auth.admin)
        throw new OfficialAccessError(
          "Conexão técnica exclusiva do admin.",
          403,
        );
      const config = await officialSettings(auth.client);
      if (!config.pilotToken || !config.pilotPhone || !config.pilotWaba)
        throw new Error("Configure o número de teste na manutenção.");
      return json(
        await connectOfficial(
          auth.client,
          auth.organizationId,
          auth.actorId,
          config.pilotToken,
          config.pilotWaba,
          config.pilotPhone,
        ),
      );
    }
    if (!body.sender) throw new Error("Selecione o número remetente.");
    const connection = await officialConnection(
      auth.client,
      auth.organizationId,
      officialAssetId(body.sender),
    );
    if (!connection) throw new Error("Conecte o número oficial primeiro.");
    if (body.action === "create_template")
      return json(await createOfficialTemplate(auth.client, connection, body));
    if (body.action === "send")
      return json(
        await sendOfficialMessage(auth.client, connection, auth.actorId, body),
      );
    if (body.action === "register")
      return json(
        await registerOfficialNumber(auth.client, connection, body.pin),
      );
    if (body.action === "rename_sender") {
      const label = String(body.label ?? "").trim();
      if (!label || label.length > 60)
        throw new Error("Nome do número: até 60 caracteres.");
      const result = await auth.client
        .from("meta_whatsapp_connections")
        .update({ label })
        .eq("organization_id", auth.organizationId)
        .eq("phone_number_id", connection.phone_number_id);
      if (result.error) throw new Error("Falha ao renomear número.");
      return json({ ok: true });
    }
    if (body.action === "disconnect") {
      const result = await auth.client
        .from("meta_whatsapp_connections")
        .update({ status: "disconnected", encrypted_token: "" })
        .eq("organization_id", auth.organizationId)
        .eq("phone_number_id", connection.phone_number_id);
      if (result.error) throw new Error("Falha ao desconectar.");
      await auth.client
        .from("meta_whatsapp_campaigns")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("organization_id", auth.organizationId)
        .eq("phone_number_id", connection.phone_number_id)
        .eq("status", "running");
      return json({ ok: true });
    }
    throw new Error("Ação inválida.");
  } catch (error) {
    return failure(error);
  }
}
