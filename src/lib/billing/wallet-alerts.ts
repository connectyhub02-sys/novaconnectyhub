import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPlatformBillingLifecycleNotification } from "./platform-billing-webhook";
export async function processWalletAlerts(client:SupabaseClient,organizationId?:string) {
  let query=client.from("wallet_alert_queue").select("organization_id,updated_at").lte("updated_at",new Date().toISOString()).order("updated_at").limit(100);
  if(organizationId)query=query.eq("organization_id",organizationId);
  const queue=await query;if(queue.error)throw new Error("Fila de avisos indisponível.");
  let notices=0;
  for(const row of queue.data??[]){
    const {data:a,error}=await client.rpc("claim_wallet_alert",{p_org:row.organization_id});
    if(error)continue;
    if(a?.deferred){await client.from("wallet_alert_queue").update({updated_at:a.available_at}).eq("organization_id",row.organization_id).eq("updated_at",row.updated_at);continue;}
    if(a){
      const eventType=a.level===0?"paid_no_credits":a.level===10?"paid_low_credits_10":"paid_low_credits_20";
      const result=await sendPlatformBillingLifecycleNotification(client,{organizationId:a.organization_id,subscriptionId:a.subscription_id,planCode:a.plan_code,planName:a.plan_name,amountBrl:Number(a.amount_brl),includedCredits:Number(a.reference_credits),balanceCredits:Number(a.balance_credits),eventType,dedupeKey:`wallet:${a.organization_id}:${a.episode}:${a.level}`,metadata:{source:"shared_wallet_alert",walletEpisode:a.episode,creditReference:Number(a.reference_credits),checkout_path:"/dashboard/creditos",checkout_url:`${process.env.NEXT_PUBLIC_APP_URL??"https://connectyhub.com.br"}/dashboard/creditos`}}).catch(()=>null);
      if(!result?.notificationId)continue;
      const done=await client.rpc("finish_wallet_alert",{p_org:a.organization_id,p_episode:a.episode,p_level:a.level});if(done.error)continue;
      notices++;
    }
    await client.from("wallet_alert_queue").delete().eq("organization_id",row.organization_id).eq("updated_at",row.updated_at);
  }
  return {checked:queue.data?.length??0,notices};
}
