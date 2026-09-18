import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as cardInput from "../src/lib/sales-catalog/card-input";
import * as validation from "../src/lib/billing/replacement-card-input";
import * as terms from "../src/lib/billing/commercial-terms";
import * as availability from "../src/lib/billing/pix-automatic-availability";
import type { PixMandate } from "../src/lib/billing/pix-automatic";

const config={accessToken:"fixture-secret",mode:"sandbox",webhookSecret:"fixture-hook"};
function adapter(fetch: typeof globalThis.fetch){return serverModuleHarness<typeof import("../src/lib/billing/asaas-pix-automatic-api")>("src/lib/billing/asaas-pix-automatic-api.ts",{"@/lib/sales-catalog/card-input":cardInput},[],{fetch});}
describe("Asaas Pix Automatic HTTP contract",()=>{
 it("creates one composite QR and delegates recurring invoices to Asaas without a separate payment POST",async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({id:"auth_test",status:"CREATED",immediateQrCode:{conciliationIdentifier:"txid"},payload:"qr-code"})));
  const api=adapter(fetch);
  const created=await api.createPixAuthorization({accessToken:"fixture",mode:"sandbox"},{customerId:"cus_test",contractId:"contract",frequency:"MONTHLY",startDate:"2030-10-10",amount:80,recurringAmount:100});
  expect(created).toMatchObject({status:"CREATED",conciliationIdentifier:"txid",payload:"qr-code"});expect(fetch).toHaveBeenCalledOnce();
  const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe("https://api-sandbox.asaas.com/v3/pix/automatic/authorizations");
  expect(JSON.parse(init.body as string)).toMatchObject({value:100,paymentCreationMode:"SUBSCRIPTION",retryPolicy:"NOT_ALLOWED",immediateQrCode:{originalValue:80,expirationSeconds:3600}});
 });
 it.each([[400,true],[403,true],[429,false],[503,false]])("sanitizes HTTP %s and marks definitive=%s",async(status,definitive)=>{
  const api=adapter(vi.fn(async()=>new Response(JSON.stringify({errors:[{description:"DO_NOT_ECHO_PRIVATE_DATA"}]}),{status})));
  await expect(api.pixRequest({accessToken:"fixture"},"/pix/automatic/authorizations","POST",{})).rejects.toMatchObject({definitive});
  await expect(api.pixRequest({accessToken:"fixture"},"/pix/automatic/authorizations","POST",{})).rejects.not.toThrow("DO_NOT_ECHO");
 });
 it("recovers by customer plus exact contract across pages and never POSTs on recovery",async()=>{
  const fetch=vi.fn(async(url:RequestInfo|URL)=>new Response(JSON.stringify(String(url).includes("offset=0")?{data:[{id:"wrong",contractId:"other"}],hasMore:true}:{data:[{id:"right",contractId:"expected"}],hasMore:false})));
  expect(await adapter(fetch).findPixAuthorization({accessToken:"fixture"},"cus_test","expected")).toMatchObject({id:"right"});
  expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls.every(call=>!String(call[0]).includes("/payments"))).toBe(true);
 });
});
function service(options:{timeout?:boolean;active?:boolean;paid?:boolean;wrongCustomer?:boolean;mode?:string}={}){
 const provider=adapter(vi.fn());
 const id=randomUUID();let claimed=false;
 const mandate:PixMandate={id,organization_id:randomUUID(),subscription_id:randomUUID(),invoice_id:randomUUID(),payment_id:randomUUID(),actor_id:randomUUID(),mode:"sandbox",contract_id:id.replaceAll("-",""),state:"dispatching",amount:130,recurring_amount:110,frequency:"MONTHLY",start_date:"2030-10-10",customer_id:"cus_test",provider_id:"auth_test",provider_subscription_id:options.active?"sub_test":null,conciliation_id:"txid",qr_payload:"qr",qr_image:null,qr_expires_at:null,initial_provider_payment_id:null,error_code:null,initial_effects_completed:false};
 const remote={id:"auth_test",status:options.active?"ACTIVE":"CREATED",customerId:"cus_test",contractId:mandate.contract_id,subscriptionId:options.active?"sub_test":"",frequency:"MONTHLY",startDate:"2030-10-10",value:110,paymentCreationMode:"SUBSCRIPTION",conciliationIdentifier:"txid",payload:"qr"};
 const payment={id:"pay_test",customer:options.wrongCustomer?"cus_other":"cus_test",value:130,status:options.paid?"RECEIVED":"PENDING",billingType:"PIX",conciliationIdentifier:"txid"};
 const create=vi.fn(async()=>{if(options.timeout)throw new provider.PixAutomaticError("unknown",503);return remote;});
 const get=vi.fn(async()=>remote),find=vi.fn(async()=>options.timeout?null:remote);
 const cancel=vi.fn(async()=>({...remote,status:"CANCELLED"}));
 const effects=vi.fn(async()=>({processingStatus:"processed"}));
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==="begin_billing_pix_authorization"){const first=!claimed;claimed=true;return{data:{claimed:first,authorization:{...mandate,provider_id:options.timeout?null:mandate.provider_id}},error:null};}
  if(name==="sync_billing_pix_authorization"){mandate.state=args.p_failure==="unknown"?"unknown":(args.p_remote as typeof remote).status;return{data:mandate,error:null};}
  if(name==="bind_billing_pix_payment"){mandate.initial_provider_payment_id=payment.id;return{data:"connectyhub_subscription:fixture",error:null};}throw Error(name);
 });
 const events=new Map<string,Record<string,unknown>>();
 const client={rpc,from(table:string){
  let key="",patch:object|null=null;
  const data=()=>table==="billing_pix_events"?events.get(key):{...mandate};
  const apply=()=>{if(patch&&table==="billing_pix_events")Object.assign(events.get(key)??{},patch);return{data:data(),error:null};};
  const q={select:()=>q,eq:(column:string,value:string)=>{if(column==="event_id")key=value;return q;},order:()=>q,limit:()=>q,
   upsert:(value:Record<string,unknown>)=>{key=String(value.event_id);if(!events.has(key))events.set(key,value);return q;},
   update:(value:object)=>{patch=value;if(table!=="billing_pix_events")Object.assign(mandate,value);return q;},
   single:async()=>apply(),maybeSingle:async()=>apply(),then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(apply()).then(resolve)};return q;
 }};
 const snapshot={amount:130,recurringAmount:110,revision:0,recurrenceLabel:"Mensal",terms:{billingCycle:"recurring",billingInterval:"month"},intent:{checkoutKind:"initial",payment:{id:mandate.payment_id,payload:{}},subscription:{status:"pending",provider_subscription_id:null}}};
 const api=serverModuleHarness<typeof import("../src/lib/billing/pix-automatic")>("src/lib/billing/pix-automatic.ts",{
  "@/lib/sales-catalog/card-input":cardInput,"@/lib/sales-catalog/asaas":{loadAsaasPlatformBillingConfig:async()=>({...config,mode:options.mode??"sandbox"}),verifyAsaasWebhookToken:({header}:{header:string})=>({ok:header==="fixture-hook"})},
  "./native-card-checkout":{loadNativeBillingSnapshot:async()=>snapshot},"./commercial-terms":terms,"./replacement-card-input":validation,"./platform-billing-webhook":{processPlatformBillingAsaasWebhook:effects},"./pix-automatic-availability":availability,
  "./asaas-pix-automatic-api":{...provider,pixCustomer:async()=>"cus_test",createPixAuthorization:create,cancelPixAuthorization:cancel,getPixAuthorization:get,findPixAuthorization:find,listPixPayments:async()=>options.timeout?[]:[payment],getPixPayment:async()=>payment},
 });
 const db=client as unknown as Parameters<typeof api.beginPixCheckout>[0];
 const scope={organizationId:mandate.organization_id,subscriptionId:mandate.subscription_id,actorId:mandate.actor_id};
 const body={requestId:id,amount:130,recurringAmount:110,revision:0,acceptRecurring:true,consentVersion:api.pixAutomaticConsentVersion};
 const holder={name:"Pessoa Teste",email:"test@example.test",cpfCnpj:"12345678909",phone:"11999999999"};
 return{api,db,scope,body,holder,mandate,rpc,create,effects,get,find,cancel,snapshot};
}
describe("Pix Automatic reconciliation",()=>{
 it("allows an eligible initial checkout without address/consent and without dispatching",async()=>{const h=service();expect(await h.api.pixCheckoutSnapshot(h.db,h.scope.organizationId,h.scope.subscriptionId)).toMatchObject({enabled:true,reason:null});expect(h.create).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();});
 it("explains why an unpaid renewal cannot start a mandate without blaming a cancelled QR",async()=>{const h=service();h.snapshot.intent.checkoutKind="renewal";h.snapshot.intent.subscription.status="past_due";expect(await h.api.pixCheckoutSnapshot(h.db,h.scope.organizationId,h.scope.subscriptionId)).toMatchObject({enabled:false,reason:expect.stringContaining("renova um plano existente")});expect(h.create).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();});
 it.each([[false,false],[true,false],[false,true]])("does not activate with active=%s and paid=%s",async(active,paid)=>{const h=service({active,paid});await h.api.reconcilePixMandate(h.db,h.mandate);expect(h.effects).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalledWith("bind_billing_pix_payment",expect.anything());});
 it("requires fresh ACTIVE and a verified paid transaction before invoking existing idempotent activation",async()=>{const h=service({active:true,paid:true});await h.api.reconcilePixMandate(h.db,h.mandate);expect(h.get).toHaveBeenCalledOnce();expect(h.effects).toHaveBeenCalledOnce();expect(h.mandate.initial_effects_completed).toBe(true);});
 it("rejects a payment belonging to another customer",async()=>{const h=service({active:true,paid:true,wrongCustomer:true});await expect(h.api.reconcilePixMandate(h.db,h.mandate)).rejects.toMatchObject({code:"mismatch"});expect(h.effects).not.toHaveBeenCalled();});
 it("does not send a second authorization after an ambiguous timeout",async()=>{const h=service({timeout:true});await expect(h.api.beginPixCheckout(h.db,h.scope,h.body,h.holder)).rejects.toMatchObject({code:"unknown"});await h.api.beginPixCheckout(h.db,h.scope,h.body,h.holder);expect(h.create).toHaveBeenCalledOnce();expect(h.find).toHaveBeenCalledOnce();});
 it("requires explicit consent and unchanged prices before dispatch",async()=>{const h=service();await expect(h.api.beginPixCheckout(h.db,h.scope,{...h.body,acceptRecurring:false},h.holder)).rejects.toMatchObject({code:"invalid_input"});await expect(h.api.beginPixCheckout(h.db,h.scope,{...h.body,amount:1},h.holder)).rejects.toMatchObject({code:"busy"});expect(h.create).not.toHaveBeenCalled();});
 it("prevents reconciliation against a different provider environment",async()=>{const h=service({mode:"production"});await expect(h.api.reconcilePixMandate(h.db,h.mandate)).rejects.toMatchObject({code:"unavailable"});expect(h.get).not.toHaveBeenCalled();});
 it("rejects unsigned authorization webhooks before any state mutation",async()=>{const h=service();await expect(h.api.processPixAutomaticWebhook(h.db,{id:"evt",event:"PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",authorization:{id:"auth_test"}},"wrong")).rejects.toMatchObject({status:401});expect(h.rpc).not.toHaveBeenCalled();});
 it("persists webhook completion and makes a duplicate inert",async()=>{const h=service({active:true,paid:true});const event={id:"evt_fixture",event:"PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",authorization:{id:"auth_test"}};await h.api.processPixAutomaticWebhook(h.db,event,"fixture-hook");expect(await h.api.processPixAutomaticWebhook(h.db,event,"fixture-hook")).toMatchObject({duplicate:true});expect(h.effects).toHaveBeenCalledOnce();});
 it("does not treat a forged ACTIVE payload as remote confirmation",async()=>{const h=service({paid:true,active:false});await h.api.processPixAutomaticWebhook(h.db,{id:"evt_fixture",event:"PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",authorization:{id:"auth_test",status:"ACTIVE"}},"fixture-hook");expect(h.effects).not.toHaveBeenCalled();});
 it("intercepts Pix subscription status events without cutting the paid access period",async()=>{const h=service({active:true,paid:false});expect(await h.api.processPixAutomaticWebhook(h.db,{id:"evt_sub",event:"SUBSCRIPTION_INACTIVATED",subscription:{id:"sub_test"}},"fixture-hook")).toMatchObject({ok:true});expect(h.effects).not.toHaveBeenCalled();});
 it.each([false,true])("cancels future debits after verified refund (initial bound=%s)",async bound=>{const h=service({active:true});if(bound)h.mandate.initial_provider_payment_id="pay_test";await h.api.settlePixPayment(h.db,h.mandate,{id:"pay_test",customer:"cus_test",billingType:"PIX",value:130,conciliationIdentifier:"txid",status:"REFUNDED"});expect(h.cancel).toHaveBeenCalledWith(expect.anything(),"auth_test");expect(h.mandate.state).toBe("CANCELLED");if(bound)expect(h.effects).toHaveBeenCalledOnce();else expect(h.effects).not.toHaveBeenCalled();});
});
