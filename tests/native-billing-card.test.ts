import * as references from "../src/lib/billing/payment-reference";
import * as discounts from '../src/lib/billing/plan-discounts';
import * as feedback from '../src/lib/billing/payment-feedback';
import * as schedule from "../src/lib/billing/managed-renewal-policy";
import * as commercial from '../src/lib/billing/commercial-terms';
import * as bumps from '../src/lib/billing/plan-checkout-catalog';
import { describe, expect, it, vi } from 'vitest';
import { serverModuleHarness } from './helpers/server-module-harness';
import { isIP } from 'node:net';
import * as cardInput from '../src/lib/sales-catalog/card-input';
import * as diagnostics from '../src/lib/sales-catalog/payment-diagnostics';
const id='55555555-5555-4555-8555-555555555555';
const card={holderName:'Teste',number:'4111111111111111',expiryMonth:'12',expiryYear:'2030',ccv:'123'};
const holder={name:'Cliente Teste',email:'test@example.com',cpfCnpj:'12345678909',phone:'11999999999',postalCode:'01001000',addressNumber:'10'};
class CheckoutError extends Error {constructor(message:string,public status=400){super(message)}}
class DirectError extends Error {constructor(public definitive:boolean,public declined:boolean, public diagnostic?: diagnostics.PaymentDiagnostic){super('Safe failure')}}
function setup(oneTime=false, discounted=false) {
 const amount=oneTime?120:discounted?40:130;
 let attempt: Record<string,unknown>|null=null;
 const intent={payment:{id:'pay-local',status:'pending',amount_brl:amount,payload:(oneTime?{commercial_terms:{billing_cycle:"one_time",access_duration_days:30}}:{}) as Record<string,unknown>},invoice:{id:'invoice'},subscription:{id:'subscription',organization_id:'org',metadata:{}},plan:{monthly_price_brl:100},targetPlanCode:'starter'};
 if(discounted) {
  Object.assign(intent, {checkoutKind:'initial'});
  intent.payment.payload.plan_pricing={price_brl:10,list_price_brl:100,first_purchase_discount_percent:90};
 }
 const saveCard=vi.fn(async()=>{});
 const fulfill=vi.fn();
 const adapter={AsaasDirectError:DirectError,createAsaasNativeSubscription:vi.fn(async()=>({id:'sub_provider'})),createAsaasDirectCardPayment:vi.fn(async()=>({id:'pay_provider',status:'CONFIRMED',value:amount,billingType:'CREDIT_CARD',externalReference:`billing_card:${id}`})),cancelAsaasNativeSubscription:vi.fn(async()=>null),retireAsaasPayment:vi.fn(),findAsaasDirectPayment:vi.fn(async()=>null),findAsaasNativeSubscription:vi.fn(async()=>null),getAsaasNativePayment:vi.fn(),applyAsaasPaymentEvent:vi.fn(p=>p)};
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='claim_native_billing_card') {attempt={id,organization_id:'org',subscription_id:'subscription',invoice_id:'invoice',payment_id:'pay-local',amount,recurring_amount:oneTime?0:110,external_reference:`billing_card:${id}`,state:'processing',stage:'preparing',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};return {data:{claimed:true,attempt},error:null}}
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
   if(table==='billing_payments')return {data:{checkout_revision:0,organization_id:'org',subscription_id:'subscription',invoice_id:'invoice',amount_brl:amount,provider_payment_id:'pay_provider',payload:intent.payment.payload},error:null};
   if(table==='billing_card_attempts') {if(update) {attempt={...attempt,...update};return {data:attempt,error:null}}return {data:attempt?[attempt]:[],error:null}}
   return {data:null,error:null};
  };
  q.single=async()=>table==='billing_card_attempts'&&!update?{data:attempt,error:null}:result();q.maybeSingle=q.single;q.then=(resolve:(r:unknown)=>void)=>Promise.resolve(result()).then(resolve);return q;
 }};
 const mod=serverModuleHarness<typeof import('../src/lib/billing/native-card-checkout')>('src/lib/billing/native-card-checkout.ts',{'./payment-reference':references,'./payment-feedback':feedback,'./plan-discounts':discounts,'./managed-renewal-policy':schedule,'./asaas-card-vault':{savePendingAsaasCard:saveCard},'@/lib/sales-catalog/payment-diagnostics':diagnostics,'node:net':{isIP},'@/lib/sales-catalog/card-input':cardInput,'@/lib/sales-catalog/asaas-direct':adapter,'@/lib/sales-catalog/asaas':{loadAsaasPlatformBillingConfig:async()=>({accessToken:'fixture',webhookSecret:'fixture'}),verifyAsaasWebhookToken:({header}:{header:string})=>({ok:header==='fixture'})},'@/lib/sales-catalog/transparent-checkout':{CheckoutError,directPaymentState:(p:{status:string})=>p.status==='CONFIRMED'?'approved':'pending'},'./commercial-terms':commercial,'./plan-checkout-catalog':bumps,'./plan-checkout':{readCheckoutCommercialTerms:()=>commercial.readCommercialTerms(intent.payment.payload.commercial_terms),loadBillingCheckoutIntent:async()=>intent,resolveBillingCheckoutProvider:()=> 'asaas',isBillingCheckoutPayable:()=>true,loadBillingCheckoutBumps:async()=>[...(oneTime?[]:[{code:'monthly',priceBrl:10,recurrence:'monthly'}]),{code:'one',priceBrl:20,recurrence:'one_time'}],readSelectedBillingCheckoutBumpCodesForCatalog:()=>['monthly','one']},'./platform-billing-webhook':{notifyNativeBillingOutcome:vi.fn(),processPlatformBillingAsaasWebhook:fulfill}});
 const pay=()=>mod.payNativeBillingCard(client as never,'org','subscription',{attemptId:id,amount,revision:0,acceptRecurring:!oneTime,recurringConsentVersion:schedule.managedRenewalConsentVersion,card,holder},'203.0.113.1');
 return {mod,pay,adapter,rpc,client,intent,saveCard,fulfill};
}
describe('panel native card orchestration',()=>{
 it('returns the permission failure to the checkout without charging or inventing a bank refusal',async()=>{
  const s=setup();
  s.saveCard.mockRejectedValueOnce(new DirectError(true,false,{category:'integration',stage:'card_tokenization',code:'forbidden',httpStatus:403}));
  const result=await s.pay();
  expect(result).toMatchObject({status:'error',rejection:{label:'Cartão indisponível',retryCardAllowed:false}});
  expect(result.rejection?.description).toContain('Asaas');
  expect(result.message).not.toMatch(/Mercado Pago|saldo|banco emissor/);
  expect(s.adapter.createAsaasDirectCardPayment).not.toHaveBeenCalled();
 });
 it('charges the welcome price while authorizing the full recurring price',async()=>{const s=setup(false,true);await s.pay();expect(s.adapter.createAsaasDirectCardPayment).toHaveBeenCalledWith(expect.objectContaining({amount:40}));expect(s.rpc.mock.calls[0][1]).toMatchObject({p_amount:40,p_recurring:110});});
 it('clamps renewal day at the end of a short month',()=>{const {mod}=setup();expect(mod.nextMonthlyBillingDate(new Date('2027-01-31T10:00:00Z'))).toBe('2027-02-28')});
 it('charges the first total once and saves an authorization without an external subscription',async()=>{
  const s=setup();expect(await s.pay()).toMatchObject({approved:true});expect(s.adapter.createAsaasDirectCardPayment).toHaveBeenCalledTimes(1);expect(s.adapter.createAsaasDirectCardPayment).toHaveBeenCalledWith(expect.objectContaining({amount:130}));expect(s.adapter.createAsaasNativeSubscription).not.toHaveBeenCalled();expect(s.saveCard).toHaveBeenCalledTimes(1);
  expect(s.rpc.mock.calls[0][0]).toBe('claim_native_billing_card');expect(JSON.stringify(s.rpc.mock.calls)).not.toContain(card.number);expect(JSON.stringify(s.rpc.mock.calls)).not.toContain('ccv');
 });
 it('keeps an uncertain charge locked and does not recreate the recurring agreement on retry',async()=>{
  const s=setup();s.adapter.createAsaasDirectCardPayment.mockRejectedValueOnce(new DirectError(false,false));expect(await s.pay()).toMatchObject({status:'unknown'});expect(await s.pay()).toMatchObject({status:'unknown'});expect(s.adapter.createAsaasDirectCardPayment).toHaveBeenCalledTimes(1);expect(s.adapter.createAsaasNativeSubscription).not.toHaveBeenCalled();expect(s.adapter.cancelAsaasNativeSubscription).not.toHaveBeenCalled();
 });
 it('does not create any external agreement when the first charge is refused',async()=>{
  const s=setup();s.adapter.createAsaasDirectCardPayment.mockRejectedValueOnce(new DirectError(true,true));expect(await s.pay()).toMatchObject({status:'rejected'});expect(s.adapter.cancelAsaasNativeSubscription).not.toHaveBeenCalled();
 });
 it('rejects stale totals, absent recurring consent and invalid webhook signatures before provider writes',async()=>{
  const s=setup();await expect(s.mod.payNativeBillingCard(s.client as never,'org','subscription',{attemptId:id,amount:1,revision:0,acceptRecurring:true,recurringConsentVersion:schedule.managedRenewalConsentVersion},'203.0.113.1')).rejects.toThrow('carrinho mudou');
  await expect(s.mod.payNativeBillingCard(s.client as never,'org','subscription',{},'203.0.113.1')).rejects.toThrow('condições de renovação');
  await expect(s.mod.processNativeBillingWebhook(s.client as never,{payment:{id:'pay_test',externalReference:`billing_card:${id}`}},'wrong')).rejects.toMatchObject({status:401});expect(s.rpc).not.toHaveBeenCalled();expect(s.adapter.getAsaasNativePayment).not.toHaveBeenCalled();
 });
 it('one-time plan charges once without creating an agreement or requiring renewal consent',async()=>{
  const t=setup(true);expect(await t.pay()).toMatchObject({approved:true});
  expect(t.adapter.createAsaasDirectCardPayment).toHaveBeenCalledWith(expect.objectContaining({amount:120}));
  expect(t.adapter.createAsaasNativeSubscription).not.toHaveBeenCalled();
  expect(t.rpc.mock.calls[0][1].p_recurring).toBe(0);expect(t.saveCard).not.toHaveBeenCalled();
 });

});

describe('managed renewal settlement',()=>{
 it('settles a Pix conversion without activating the previously refused card',async()=>{
  const s=setup();
  const payment={id:'pay_provider',externalReference:'billing_managed:'+id,billingType:'PIX',status:'CONFIRMED',value:130};
  s.adapter.getAsaasNativePayment.mockResolvedValue(payment);
  await s.mod.processNativeBillingWebhook(s.client as never,{payment},'fixture');
  expect(s.fulfill).toHaveBeenCalledWith(s.client,expect.anything(),expect.objectContaining({externalReference:'connectyhub_subscription:org:subscription:invoice:'+id,billingType:'PIX'}));
  expect(s.rpc).not.toHaveBeenCalled();expect(s.saveCard).not.toHaveBeenCalled();
 });
 it('rejects mismatched Pix amounts before fulfillment',async()=>{
  const s=setup();const payment={id:'pay_provider',externalReference:'billing_managed:'+id,billingType:'PIX',status:'CONFIRMED',value:1};
  s.adapter.getAsaasNativePayment.mockResolvedValue(payment);
  await expect(s.mod.processNativeBillingWebhook(s.client as never,{payment},'fixture')).rejects.toMatchObject({status:409});
  expect(s.fulfill).not.toHaveBeenCalled();expect(s.rpc).not.toHaveBeenCalled();
 });
 it('recovers the shared invoice reference when the webhook omits it',async()=>{
  const s=setup();s.adapter.createAsaasDirectCardPayment.mockRejectedValueOnce(new DirectError(true,true));await s.pay();
  s.rpc.mockClear();s.intent.payment.payload.managed_external_reference='billing_managed:'+id;
  s.adapter.getAsaasNativePayment.mockResolvedValue({id:'pay_provider',externalReference:'billing_managed:'+id,billingType:'PIX',status:'CONFIRMED',value:130});
  await s.mod.processNativeBillingWebhook(s.client as never,{payment:{id:'pay_provider'}},'fixture');
  expect(s.fulfill).toHaveBeenCalledTimes(1);expect(s.rpc).not.toHaveBeenCalled();
 });
});
