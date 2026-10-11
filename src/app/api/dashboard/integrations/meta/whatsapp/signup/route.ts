import { NextResponse, type NextRequest } from "next/server";
import { officialAccess, OfficialAccessError } from "@/lib/meta/whatsapp-auth";
import { cloudRequest, connectOfficial, officialSettings } from "@/lib/meta/whatsapp-cloud";
import { createMetaOAuthState, hashMetaOAuthState, matchesMetaOAuthCookie } from "@/lib/meta/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "__Host-meta-whatsapp-state";
export async function POST(request: NextRequest) {
  try {
    const auth = await officialAccess(request);
    const body = await request.json() as Record<string,unknown>;
    const config = await officialSettings(auth.client);
    if (!config.signupConfigId) throw new Error("Conexão guiada WhatsApp aguardando configuração na sala de manutenção.");
    if (body.action === "start") {
      const state = createMetaOAuthState();
      const result = await auth.client.from("meta_whatsapp_oauth_attempts").insert({state_hash:hashMetaOAuthState(state),organization_id:auth.organizationId,user_id:auth.actorId,expires_at:new Date(Date.now()+600000).toISOString()});
      if (result.error) throw new Error("Não foi possível iniciar a autorização.");
      const response = NextResponse.json({state,appId:config.appId,configId:config.signupConfigId,version:config.graphVersion},{headers:{"Cache-Control":"private, no-store"}});
      response.cookies.set(cookieName,state,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:600});
      return response;
    }
    if (body.action !== "finish" || typeof body.code !== "string" || body.code.length > 8192 || typeof body.state !== "string" || !matchesMetaOAuthCookie(body.state,request.cookies.get(cookieName)?.value)) throw new OfficialAccessError("Autorização inválida. Inicie novamente.",403);
    const consumed = await auth.client.from("meta_whatsapp_oauth_attempts").update({consumed_at:new Date().toISOString()}).eq("state_hash",hashMetaOAuthState(body.state)).eq("organization_id",auth.organizationId).eq("user_id",auth.actorId).is("consumed_at",null).gt("expires_at",new Date().toISOString()).select("state_hash").maybeSingle();
    if (consumed.error || !consumed.data) throw new OfficialAccessError("Autorização expirada ou já utilizada.",403);
    const token = await cloudRequest<{access_token:string}>(config,`${config.appId}|${config.appSecret}`,"oauth/access_token",undefined,{client_id:config.appId,client_secret:config.appSecret,code:body.code});
    if (!token.access_token) throw new Error("Meta não retornou autorização válida.");
    const connected = await connectOfficial(auth.client,auth.organizationId,auth.actorId,token.access_token,body.wabaId,body.phoneNumberId);
    const response = NextResponse.json(connected,{headers:{"Cache-Control":"private, no-store"}});
    response.cookies.set(cookieName,"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:0});
    return response;
  } catch(error) {
    return NextResponse.json({error:error instanceof Error ? error.message : "Falha na conexão WhatsApp."},{status:error instanceof OfficialAccessError ? error.status : 422,headers:{"Cache-Control":"private, no-store"}});
  }
}
