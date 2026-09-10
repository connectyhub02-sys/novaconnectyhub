import { publicAiRequest } from "@/lib/ai-api/public-response";
import { NextResponse } from "next/server";
import { authenticateAi,AiApiError } from "@/lib/ai-api/gateway";
import { createServiceClient } from "@/lib/supabase/service";
import { statusForAccessControlError } from "@/lib/billing/access-control";
export async function GET(request:Request,{params}:{params:Promise<{requestId:string}>}){try{const client=createServiceClient();const auth=await authenticateAi(request,client);const {data,error}=await client.from("ai_requests").select("id,status,model_id,charged_credits,reserved_credits,response,error_code,created_at").eq("id",(await params).requestId).eq("project_id",auth.project.id).maybeSingle();if(error||!data)return NextResponse.json({error:"Solicitação não encontrada."},{status:404});return NextResponse.json(publicAiRequest(data),{headers:{"Cache-Control":"no-store"}});}catch(e){return NextResponse.json({error:"Acesso não disponível."},{status:e instanceof AiApiError?e.status:statusForAccessControlError(e,503)});}}
