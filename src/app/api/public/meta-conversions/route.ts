import { createServiceClient } from "@/lib/supabase/service";
import { verifyOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import { validatePublicWriteRequest } from "@/lib/security/public-request-guard";
import { isPublicCommerceAvailable } from "@/lib/sales-catalog/public-commerce-access";
import { conversionUserData,isUuid,conversionOrigin } from "@/lib/meta/conversion-policy";
import { pixelConfiguration,queueConversion } from "@/lib/meta/pixel-conversions";
import { metaRecord,selectedMetaAsset } from "@/lib/meta/ads-leads-context";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:Request) {
  try {
    const guard=validatePublicWriteRequest({headers:request.headers,requestUrl:request.url,routeKey:"meta-conversions",maxPayloadBytes:4096,rateLimit:{limit:120,windowMs:60000}});
    if(!guard.ok)return json({error:guard.message},guard.status);
    if(!request.headers.get("content-type")?.startsWith("application/json"))return json({},415);
    const raw=await request.text();if(raw.length>4096)return json({},413);
    const b=JSON.parse(raw), org=b.organizationId;
    if(!isUuid(org)||!verifyOrganizationTrackingToken(org,typeof b.trackingToken==="string"?b.trackingToken:null))return json({},403);
    const client=createServiceClient();
    if(!isUuid(b.visitorId))return json({},422);
    // Revocation works even after a store/connection has been disabled.
    if(b.action==="consent") {
      if(typeof b.granted!=="boolean")return json({},422);
      const saved=await client.from("meta_pixel_consents").upsert({organization_id:org,visitor_id:b.visitorId,granted:b.granted,updated_at:new Date().toISOString()});
      if(saved.error)throw new Error("consent");
      return json({ok:true});
    }
    const config=await pixelConfiguration(client,org);
    if(!config?.enabled||!await isPublicCommerceAvailable(org,client))return json({active:false});
    const integration=await client.from("organization_integrations").select("status,metadata").eq("organization_id",org).eq("provider_id","meta-ads").maybeSingle();
    if(integration.error||integration.data?.status!=="connected"||selectedMetaAsset(metaRecord(integration.data.metadata),"ad_account_id")!==config.ad_account_id)return json({active:false});
    if(b.action==="config")return json({active:true,pixelId:config.pixel_id,testMode:Boolean(config.test_event_code)});
    const consent=await client.from("meta_pixel_consents").select("granted").eq("organization_id",org).eq("visitor_id",b.visitorId).maybeSingle();
    if(consent.error||!consent.data?.granted)return json({},403);
    if(!isUuid(b.eventId)||!["PageView","ViewContent","AddToCart","InitiateCheckout"].includes(b.eventName))return json({},422);
    const organization=await client.from("organizations").select("slug").eq("id",org).single();
    if(organization.error)throw new Error("organization");
    const base=conversionOrigin();
    const storePath=`/loja/${encodeURIComponent(organization.data.slug||org)}`;
    let sourceUrl=base+storePath;
    let customData:Record<string,unknown>|undefined;
    if(b.eventName==="ViewContent"||b.eventName==="AddToCart") {
      if(!isUuid(b.productId))return json({},422);
      const product=await client.from("intelligence_memory").select("id").eq("organization_id",org).eq("id",b.productId).eq("memory_type","sales_catalog_item").maybeSingle();
      if(product.error||!product.data)return json({},403);
      sourceUrl+=`/produto/${product.data.id}`;
      customData={content_ids:[product.data.id],content_type:"product"};
    }
    const userData=conversionUserData(org,b.visitorId,request.headers.get("user-agent")||"",b.fbp,b.fbc);
    if(b.eventName==="InitiateCheckout") {
      if(!isUuid(b.sessionId))return json({},422);
      const session=await client.from("sales_catalog_payment_sessions").select("id,amount,currency").eq("organization_id",org).eq("id",b.sessionId).maybeSingle();
      if(session.error||!session.data)return json({},403);
      // Never send checkout bearer URLs, tracking tokens, customer names or query strings to Meta.
      sourceUrl=base+storePath+"/checkout";
      customData={value:Number(session.data.amount)||0,currency:session.data.currency||"BRL"};
      const saved=await client.from("meta_checkout_attributions").upsert({organization_id:org,session_id:b.sessionId,visitor_id:b.visitorId,
        pixel_id:config.pixel_id,revision:config.revision,test_event_code:config.test_event_code,source_url:sourceUrl,user_data:userData},
        {onConflict:"organization_id,session_id",ignoreDuplicates:true});
      if(saved.error)throw new Error("checkout attribution");
    }
    await queueConversion(client,{organizationId:org,visitorId:b.visitorId,config,name:b.eventName,eventId:b.eventId,sourceUrl,userData,customData});
    return json({accepted:true,pixelId:config.pixel_id,testMode:Boolean(config.test_event_code),eventId:b.eventId,eventName:b.eventName,customData});
  }catch{return json({error:"Não foi possível registrar a medição."},400);}
}
