import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
export async function GET(request:Request){
 const auth=await requirePlatformAdmin();if(auth instanceof NextResponse)return auth;
 let query=createServiceClient().from("ai_requests").select("id,organization_id,project_id,status,model_id,reserved_credits,charged_credits,error_code,created_at,result_snapshot,organizations(name),ai_projects(name),usage_events(provider_cost,input_tokens,output_tokens)").limit(200);
 query=new URL(request.url).searchParams.get("pending")==="1"?query.eq("status","uncertain").order("created_at"):query.order("created_at",{ascending:false});
 const {data,error}=await query;
 return NextResponse.json(error?{error:"Não foi possível consultar as chamadas."}:{requests:(data??[]).map(r=>({...r,result_snapshot:undefined,has_result:!!r.result_snapshot}))},{status:error?503:200,headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
 const auth=await requirePlatformAdmin();if(auth instanceof NextResponse)return auth;
 const body=await request.json().catch(()=>null);
 if(!body?.requestId||typeof body.reason!=="string"||body.reason.trim().length<15)return NextResponse.json({error:"Descreva a conferência realizada (mínimo 15 caracteres)."},{status:422});
 const {error}=await createServiceClient().rpc("release_uncertain_ai_request",{p_request:body.requestId,p_actor:auth.userId,p_reason:body.reason.trim().slice(0,2000)});
 return NextResponse.json(error?{error:"A solicitação mudou de estado ou não pode ser liberada."}:{ok:true},{status:error?409:200});
}
