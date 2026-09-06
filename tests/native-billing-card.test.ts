import { describe, expect, it, vi } from 'vitest';
import { serverModuleHarness } from './helpers/server-module-harness';
import { isIP } from 'node:net';
import * as cardInput from '../src/lib/sales-catalog/card-input';
const id='55555555-5555-4555-8555-555555555555';
const card={holderName:'Teste',number:'4111111111111111',expiryMonth:'12',expiryYear:'2030',ccv:'123'};
const holder={name:'Cliente Teste',email:'test@example.com',cpfCnpj:'12345678909',phone:'11999999999',postalCode:'01001000',addressNumber:'10'};
class CheckoutError extends Error {constructor(message:string,public status=400){super(message)}}
class DirectError extends Error {constructor(public definitive:boolean,public declined:boolean){super('Safe failure')}}
function setup() {
 let attempt: Record<string,unknown>|null=null;
 const intent={payment:{id:'pay-local',status:'pending',amount_brl:130,payload:{}},invoice:{id:'invoice'},subscription:{id:'subscription',organization_id:'org',metadata:{}},plan:{monthly_price_brl:100},targetPlanCode:'starter'};
 const adapter={AsaasDirectError:DirectError,createAsaasNativeSubscription:vi.fn(async()=>({id:'sub_provider'})),createAsaasDirectCardPayment:vi.fn(async()=>({id:'pay_provider',status:'CONFIRMED',value:130,billingType:'CREDIT_CARD',externalReference:`billing_card:${id}`})),cancelAsaasNativeSubscription:vi.fn(async()=>null),retireAsaasPayment:vi.fn(),findAsaasDirectPayment:vi.fn(async()=>null),findAsaasNativeSubscription:vi.fn(async()=>null),getAsaasNativePayment:vi.fn(),applyAsaasPaymentEvent:vi.fn(p=>p)};
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='claim_native_billing_card') {attempt={id,organization_id:'org',subscription_id:'subscription',invoice_id:'invoice',payment_id:'pay-local',amount:130,recurring_amount:110,external_reference:`billing_card:${id}`,state:'processing',stage:'preparing',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};return {data:{claimed:true,attempt},error:null}}
  if(name==='finish_native_billing_card'){attempt={...attempt,state:args.p_state,provider_payment_id:args.p_provider_payment};return {data:attempt,error:null}}
  return {data:null,error:null};
 });
 const client={rpc,from:(table:string)=>{
  let update:Record<string,unknown>|null=null;
  const q:Record<string,unknown>={};
  for(const op of ['select','eq','or','limit','order'])q[op]=()=>q;
  q.update=(value:Record<string,unknown>)=>{update=value;return q};
  const result=()=>{
   if(update?.effects_claimed_at)return {data:null,error:null}; // another notification worker owns the lease
   if(table==='billing_payments')return {data:{checkout_revision:0},error:null};
   if(table==='billing_card_attempts') {if(update) {attempt={...attempt,...update};return {data:attempt,error:null}}return {data:attempt?[attempt]:[],error:null}}
   return {data:null,error:null};
  };
  q.single=async()=>table==='billing_card_attempts'&&!update?{data:attempt,error:null}:result();q.maybeSingle=q.single;q.then=(resolve:(r:unknown)=>void)=>Promise.resolve(result()).then(resolve);return q;
 }};
 const mod=serverModuleHarness<typeof import('../src/lib/billing/native-card-checkout')>('src/lib/billing/native-card-checkout.ts',{'node:net':{isIP},'@/lib/sales-catalog/card-input':cardInput,'@/lib/sales-catalog/asaas-direct':adapter,'@/lib/sales-catalog/asaas':{loadAsaasPlatformBillingConfig:async()=>({accessToken:'fixture',webhookSecret:'fixture'}),verifyAsaasWebhookToken:({header}:{header:string})=>({ok:header==='fixture'})},'@/lib/sales-catalog/transparent-checkout':{CheckoutError,directPaymentState:(p:{status:string})=>p.status==='CONFIRMED'?'approved':'pending'},'./plan-checkout':{loadBillingCheckoutIntent:async()=>intent,resolveBillingCheckoutProvider:()=> 'asaas',isBillingCheckoutPayable:()=>true,loadBillingCheckoutBumps:async()=>[{code:'monthly',priceBrl:10,recurrence:'monthly'},{code:'one',priceBrl:20,recurrence:'one_time'}],readSelectedBillingCheckoutBumpCodesForCatalog:()=>['monthly','one']},'./platform-billing-webhook':{notifyNativeBillingOutcome:vi.fn(),processPlatformBillingAsaasWebhook:vi.fn()}});
 const pay=()=>mod.payNativeBillingCard(client as never,'org','subscription',{attemptId:id,amount:130,revision:0,acceptRecurring:true,card,holder},'203.0.113.1');
 return {mod,pay,adapter,rpc,client,intent};
}
describe('panel native card orchestration',()=>{
 it('clamps renewal day at the end of a short month',()=>{const {mod}=setup();expect(mod.nextMonthlyBillingDate(new Date('2027-01-31T10:00:00Z'))).toBe('2027-02-28')});
 it('charges the first total once and schedules only monthly products in future installments',async()=>{
  const s=setup();expect(await s.pay()).toMatchObject({approved:true});expect(s.adapter.createAsaasDirectCardPayment).toHaveBeenCalledTimes(1);expect(s.adapter.createAsaasDirectCardPayment).toHaveBeenCalledWith(expect.objectContaining({amount:130}));expect(s.adapter.createAsaasNativeSubscription).toHaveBeenCalledWith(expect.objectContaining({amount:110}));
  expect(s.rpc.mock.calls[0][0]).toBe('claim_native_billing_card');expect(JSON.stringify(s.rpc.mock.calls)).not.toContain(card.number);expect(JSON.stringify(s.rpc.mock.calls)).not.toContain('ccv');
 });
 it('keeps an uncertain charge locked and does not recreate the recurring agreement on retry',async()=>{
  const s=setup();s.adapter.createAsaasDirectCardPayment.mockRejectedValueOnce(new DirectError(false,false));expect(await s.pay()).toMatchObject({status:'unknown'});expect(await s.pay()).toMatchObject({status:'unknown'});expect(s.adapter.createAsaasDirectCardPayment).toHaveBeenCalledTimes(1);expect(s.adapter.createAsaasNativeSubscription).toHaveBeenCalledTimes(1);expect(s.adapter.cancelAsaasNativeSubscription).not.toHaveBeenCalled();
 });
 it('cancels the future agreement when the first charge is definitively refused',async()=>{
  const s=setup();s.adapter.createAsaasDirectCardPayment.mockRejectedValueOnce(new DirectError(true,true));expect(await s.pay()).toMatchObject({status:'rejected'});expect(s.adapter.cancelAsaasNativeSubscription).toHaveBeenCalledWith(expect.anything(),'sub_provider',`billing_recurring:${id}`);
 });
 it('rejects stale totals, absent recurring consent and invalid webhook signatures before provider writes',async()=>{
  const s=setup();await expect(s.mod.payNativeBillingCard(s.client as never,'org','subscription',{attemptId:id,amount:1,revision:0,acceptRecurring:true},'203.0.113.1')).rejects.toThrow('carrinho mudou');
  await expect(s.mod.payNativeBillingCard(s.client as never,'org','subscription',{},'203.0.113.1')).rejects.toThrow('renovação mensal');
  await expect(s.mod.processNativeBillingWebhook(s.client as never,{payment:{id:'pay_test',externalReference:`billing_card:${id}`}},'wrong')).rejects.toMatchObject({status:401});expect(s.rpc).not.toHaveBeenCalled();expect(s.adapter.getAsaasNativePayment).not.toHaveBeenCalled();
 });
});
