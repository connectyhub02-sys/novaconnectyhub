import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rpc, record } from "./gateway";
export async function reconcileAiRequests(client: SupabaseClient) {
  const { data, error } = await client.from("ai_requests").select("id,status,result_snapshot")
    .or("status.in.(preparing,reserved,processing),and(status.eq.uncertain,result_snapshot.not.is.null)").lt("updated_at",new Date(Date.now()-5*60000).toISOString()).order("updated_at").limit(100);
  if(error) throw new Error("Não foi possível consultar a conciliação de IA.");
  let completed=0, released=0, uncertain=0;
  for(const r of data??[]) {
    if(r.result_snapshot) {await rpc(client,"finish_ai_request",record(r.result_snapshot));completed++;}
    else if(r.status==="preparing"||r.status==="reserved") {
      // Lock and recheck in SQL: never release a call that started in parallel.
      await rpc(client,"expire_unstarted_ai_request",{p_request:r.id});released++;
    } else if(r.status==="processing") {await rpc(client,"finish_ai_request",{p_request:r.id,p_status:"uncertain",p_error:"worker_interrupted"});uncertain++;}
  }
  return {completed,released,uncertain};
}
