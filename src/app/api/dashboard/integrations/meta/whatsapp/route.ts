import { NextResponse, type NextRequest } from "next/server";
import { officialAccess, OfficialAccessError } from "@/lib/meta/whatsapp-auth";
import { connectOfficial, createOfficialTemplate, listOfficialTemplates, officialConnection, officialSettings, registerOfficialNumber, sendOfficialMessage } from "@/lib/meta/whatsapp-cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
function failure(error:unknown) { return json({error:error instanceof Error ? error.message : "Falha na integração oficial."},error instanceof OfficialAccessError ? error.status : 422); }

export async function GET(request: NextRequest) {
  try {
    const auth = await officialAccess(request);
    const config = await officialSettings(auth.client);
    const connection = await officialConnection(auth.client,auth.organizationId);
    let templates: Awaited<ReturnType<typeof listOfficialTemplates>> = [], templateError:string|null = null;
    if (connection) try { templates = await listOfficialTemplates(auth.client,connection); } catch(error) { templateError=error instanceof Error ? error.message : "Falha ao consultar modelos."; }
    const messages = await auth.client.from("meta_whatsapp_messages").select("id,phone,direction,message_type,text_content,status,error_code,occurred_at").eq("organization_id",auth.organizationId).order("occurred_at",{ascending:false}).limit(100);
    if (messages.error) throw new Error("Não foi possível carregar o chat oficial.");
    return json({connection:connection ? {displayPhone:connection.display_phone,verifiedName:connection.verified_name,wabaId:connection.waba_id,phoneNumberId:connection.phone_number_id,permissions:connection.permissions,connectedAt:connection.connected_at,webhookAt:connection.webhook_at,webhookSubscribed:connection.webhook_subscribed} : null,signupReady:Boolean(config.signupConfigId),pilotReady:auth.admin && Boolean(config.pilotToken && config.pilotPhone && config.pilotWaba),templates,templateError,messages:messages.data,organizationId:auth.organizationId});
  } catch(error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await officialAccess(request);
    const body = await request.json() as Record<string,unknown>;
    if (body.action === "import_pilot") {
      if (!auth.admin) throw new OfficialAccessError("Conexão técnica exclusiva do admin.",403);
      const config = await officialSettings(auth.client);
      if (!config.pilotToken || !config.pilotPhone || !config.pilotWaba) throw new Error("Preencha as credenciais WhatsApp de teste na manutenção.");
      return json(await connectOfficial(auth.client,auth.organizationId,auth.actorId,config.pilotToken,config.pilotWaba,config.pilotPhone));
    }
    const connection = await officialConnection(auth.client,auth.organizationId);
    if (!connection) throw new Error("Conecte o WhatsApp oficial primeiro.");
    if (body.action === "create_template") return json(await createOfficialTemplate(auth.client,connection,body));
    if (body.action === "send") return json(await sendOfficialMessage(auth.client,connection,auth.actorId,body));
    if (body.action === "register") return json(await registerOfficialNumber(auth.client,connection,body.pin));
    if (body.action === "disconnect") {
      const result = await auth.client.from("meta_whatsapp_connections").update({status:"disconnected",encrypted_token:""}).eq("organization_id",auth.organizationId);
      if (result.error) throw new Error("Falha ao desconectar.");
      return json({ok:true});
    }
    throw new Error("Ação inválida.");
  } catch(error) { return failure(error); }
}
