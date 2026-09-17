import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";
import { readClientIp, validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { CardManagementError, changeBillingCard, listBillingCards } from "@/lib/billing/card-management";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=90;
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
async function workspace(){
  const w=await getCurrentWorkspace({allowRestricted:true});
  if(!w?.organization) throw new CardManagementError("Entre na sua conta para gerenciar os cartões.",401);
  if(!["owner","admin"].includes(w.organization.role)) throw new CardManagementError("Somente o titular ou administrador da organização pode gerenciar os cartões.",403);
  return w;
}
const fail=(e:unknown)=>e instanceof CardManagementError?reply({error:e.message},e.status):reply({error:"Não foi possível conferir o método de pagamento. Atualize a página ou contate o suporte."},503);
export async function GET(request:NextRequest){
  try{
    const w=await workspace();const id=request.nextUrl.searchParams.get("subscriptionId");
    if(!id || !/^[0-9a-f-]{36}$/i.test(id)) return reply({error:"Selecione uma assinatura."},400);
    return reply(await listBillingCards(createServiceClient(),w.organization!.id,id));
  }catch(e){return fail(e);}
}
export async function POST(request:NextRequest){
  try{
    const w=await workspace();
    if(request.headers.get("origin")!==new URL(request.url).origin) return reply({error:"Origem não autorizada."},403);
    const guard=validatePublicWriteRequest({headers:request.headers,requestUrl:request.url,routeKey:`billing-card-management:${w.organization!.id}`,maxPayloadBytes:16384,rateLimit:{limit:6,windowMs:60000}});
    if(!guard.ok) return reply({error:guard.message},guard.status);
    const raw=await request.text();if(raw.length>16384)return reply({error:"Dados excedem o limite permitido."},413);
    let body;try{body=JSON.parse(raw);}catch{return reply({error:"Dados inválidos."},400);}
    if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Dados inválidos."},400);
    const result=await changeBillingCard(createServiceClient(),w.organization!.id,w.user.id,body,readClientIp(request.headers));
    return reply({...result,message:"Cartão padrão atualizado. A próxima renovação usará este cartão. Nenhuma cobrança foi realizada agora."});
  }catch(e){return fail(e);}
}
