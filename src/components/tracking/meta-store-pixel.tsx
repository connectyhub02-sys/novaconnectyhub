"use client";
import { useEffect,useState } from "react";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";
import { commerceAgentTrackingEventName } from "@/lib/commerce-agent/client-events";
import { metaClickAttribution } from "@/lib/meta/click-attribution";

type Fbq=((...args:unknown[])=>void)&{queue:unknown[][];loaded:boolean;version:string;callMethod?:(...args:unknown[])=>void;push?:unknown};
declare global {interface Window {fbq?:Fbq;_fbq?:Fbq;connectyMetaPixels?:Set<string>}}
function browserEvent(pixelId:string,name:string,eventId:string,data:unknown) {
  if(!window.fbq) {
    const fn=((...args:unknown[])=>{if(fn.callMethod)fn.callMethod(...args);else fn.queue.push(args);}) as Fbq;
    fn.queue=[];fn.loaded=true;fn.version="2.0";fn.push=fn;window.fbq=fn;window._fbq=fn;
    const script=document.createElement("script");script.async=true;script.src="https://connect.facebook.net/en_US/fbevents.js";document.head.appendChild(script);
  }
  const fbq=window.fbq;
  window.connectyMetaPixels??=new Set();
  if(!window.connectyMetaPixels.has(pixelId)) {
    fbq("set","autoConfig",false,pixelId);fbq("init",pixelId);window.connectyMetaPixels.add(pixelId);
  }
  fbq("consent","grant");fbq("trackSingle",pixelId,name,data||{},{eventID:eventId});
}
const readCookie=(name:string)=>document.cookie.split("; ").find(s=>s.startsWith(`${name}=`))?.slice(name.length+1);
export function MetaStorePixel({context}:{context:ConnectyPublicTrackingContext}) {
  const org=context.organization_id||"",token=context.tracking_token||"";
  const key=`connecty_meta_consent_${org}`;
  const [revision,setRevision]=useState(0);
  const [active,setActive]=useState(false),[choice,setChoice]=useState<string|null>(null),[open,setOpen]=useState(false);
  useEffect(()=>{
    if(!org||!token)return;
    let alive=true;
    let visitorId:string;
    try{visitorId=localStorage.getItem(`${key}_id`)||crypto.randomUUID();localStorage.setItem(`${key}_id`,visitorId);}catch{return;}
    const request=async(body:Record<string,unknown>)=>{
      const r=await fetch("/api/public/meta-conversions",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({organizationId:org,trackingToken:token,visitorId,...body}),keepalive:true});
      return r.ok?r.json():null;
    };
    const opted=()=>localStorage.getItem(key)==="granted";
    const emit=async(eventName:string,productId?:string,sessionId?:string)=>{
      if(!alive||!opted())return;
      const fbc=metaClickAttribution(location.search,localStorage.getItem(`${key}_fbc`));
      if(fbc)localStorage.setItem(`${key}_fbc`,fbc);
      const eventId=crypto.randomUUID();
      const d=await request({eventName,eventId,productId,sessionId,fbp:readCookie("_fbp"),fbc});
      // The browser Pixel includes the current URL automatically. Checkout bearer URLs
      // and query strings can contain private data, so those events stay server-only.
      if(alive&&opted()&&d?.accepted&&!d.testMode&&!location.search&&!location.pathname.startsWith("/checkout/"))browserEvent(d.pixelId,eventName,eventId,d.customData);
    };
    const start=async()=>{
      const d=await request({action:"config"});if(!alive||!d?.active)return;
      setActive(true);setChoice(localStorage.getItem(key));
      if(!opted())return;
      if(!await request({action:"consent",granted:true})||!alive||!opted())return;
      void emit("PageView").catch(()=>{});
      if(context.product_id||context.catalog_item_id)void emit("ViewContent",context.product_id||context.catalog_item_id||undefined).catch(()=>{});
      if(context.payment_session_id)void emit("InitiateCheckout",undefined,context.payment_session_id).catch(()=>{});
    };
    const handler=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.event_type==="cart_item_added"&&typeof d.metadata?.product_id==="string")void emit("AddToCart",d.metadata.product_id).catch(()=>{});};
    window.addEventListener(commerceAgentTrackingEventName,handler);
    void start().catch(()=>{});
    return()=>{alive=false;window.removeEventListener(commerceAgentTrackingEventName,handler);};
  },[org,token,key,context.product_id,context.catalog_item_id,context.payment_session_id,revision]);
  async function choose(granted:boolean) {
    const visitorId=localStorage.getItem(`${key}_id`);
    // Stop browser sends immediately; server acknowledgement is required before re-enabling.
    localStorage.setItem(key,granted?"granted":"denied");
    if(!granted){window.fbq?.("consent","revoke");localStorage.removeItem(`${key}_fbc`);}
    try {
      const r=await fetch("/api/public/meta-conversions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:org,trackingToken:token,visitorId,action:"consent",granted}),keepalive:true});
      if(!r.ok)throw new Error();setChoice(granted?"granted":"denied");setOpen(false);if(granted)setRevision(n=>n+1);
    }catch{localStorage.setItem(key,"denied");setChoice("denied");setOpen(true);}
  }
  if(!active)return null;
  return <aside className="fixed bottom-3 left-3 z-50 max-w-sm rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg" aria-label="Preferências de medição">
    {choice&&!open?<button className="text-xs underline" onClick={()=>setOpen(true)}>Preferências de privacidade</button>:<><p className="text-sm">Permitir que esta loja compartilhe visitas e compras com a Meta para medir anúncios? Você pode recusar e continuar comprando.</p><div className="mt-3 flex gap-3"><button className="rounded border px-3 py-2 text-sm" onClick={()=>choose(false)}>Recusar</button><button className="rounded border px-3 py-2 text-sm" onClick={()=>choose(true)}>Permitir medição</button></div></>}
  </aside>;
}
