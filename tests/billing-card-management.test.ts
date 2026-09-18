import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({tokenize:vi.fn(),config:vi.fn(),rpc:vi.fn(),eq:vi.fn(),subscription:null as unknown,receipt:null as unknown,current:null as unknown}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/sales-catalog/asaas",()=>({loadAsaasPlatformBillingConfig:mock.config}));
vi.mock("@/lib/sales-catalog/asaas-direct",()=>({tokenizeAsaasBillingCard:mock.tokenize,AsaasDirectError:class extends Error{constructor(public definitive:boolean,public declined:boolean,public diagnostic?:{httpStatus:number}){super("provider secret");}}}));
import { changeBillingCard, cardBlocker, type ManagedSubscription } from "@/lib/billing/card-management";
import { AsaasDirectError } from "@/lib/sales-catalog/asaas-direct";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
const sub="11111111-1111-4111-8111-111111111111",old="22222222-2222-4222-8222-222222222222",request="33333333-3333-4333-8333-333333333333";
const body={action:"add",subscriptionId:sub,requestId:request,expectedDefault:old,expectedEnd:"2030-10-14T13:33:55Z",acceptRecurring:true,consentVersion:"connectyhub-card-default-v1",card:{number:"4111111111111111",holderName:"Fixture",expiryMonth:"12",expiryYear:"2032",ccv:"123"},holder:{name:"Fixture",email:"fixture@example.com",cpfCnpj:"12345678901",phone:"11999999999",postalCode:"01001000",addressNumber:"1"}};
const client={from:(table:string)=>{const chain={select:()=>chain,eq:(...args:unknown[])=>{mock.eq(table,...args);return chain;},maybeSingle:async()=>({data:table==="organization_subscriptions"?mock.subscription:table==="billing_payment_method_changes"?mock.receipt:mock.current,error:null})};return chain;},rpc:mock.rpc};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY","fixture-only");mock.subscription={id:sub,status:"active",billing_provider:"asaas",provider_subscription_id:null,current_period_end:body.expectedEnd,metadata:{commercial_terms:{billing_cycle:"recurring"}}};mock.receipt=null;mock.current={id:old,customer_id:"cus_fixture"};mock.config.mockResolvedValue({accessToken:"fixture-secret"});mock.tokenize.mockResolvedValue({customerId:"cus_fixture",token:"fixture-token",brand:"VISA"});mock.rpc.mockResolvedValue({data:{methodId:"new",topupUpdated:true},error:null});});
afterEach(()=>vi.unstubAllEnvs());
it("tokenizes without a charge and passes only encrypted token and masked metadata to the atomic RPC",async()=>{
 await changeBillingCard(client as never,"org","owner",body,"203.0.113.1");
 expect(mock.tokenize).toHaveBeenCalledWith(expect.objectContaining({customerId:"cus_fixture",remoteIp:"203.0.113.1"}));
 expect(mock.rpc).toHaveBeenCalledTimes(1);const [name,args]=mock.rpc.mock.calls[0];expect(name).toBe("set_billing_default_card_profile");
 expect(args.p_holder).toEqual(body.holder);expect(args.p_card).toMatchObject({last_digits:"1111",brand:"VISA",exp_year:"2032"});expect(decryptCredentialValue(args.p_card.token_encrypted)).toBe("fixture-token");
 expect(JSON.stringify(args)).not.toMatch(/4111111111111111|fixture-secret|fixture-token|ccv/);
});
it("never changes the old card after tokenization fails and gives an actionable permission blocker",async()=>{
 mock.tokenize.mockRejectedValue(new AsaasDirectError(true,false,{httpStatus:403} as never));
 await expect(changeBillingCard(client as never,"org","owner",body,"ip")).rejects.toThrow("habilitação de tokenização");expect(mock.rpc).not.toHaveBeenCalled();
});
it("scopes subscriptions and receipts to the authenticated organization and rejects another organization's subscription",async()=>{
 mock.subscription=null;await expect(changeBillingCard(client as never,"other","owner",body,"ip")).rejects.toMatchObject({status:404});expect(mock.eq).toHaveBeenCalledWith("organization_subscriptions","organization_id","other");expect(mock.tokenize).not.toHaveBeenCalled();
});
it("requires explicit consent and rejects stale UI before touching the provider",async()=>{
 await expect(changeBillingCard(client as never,"org","owner",{...body,acceptRecurring:false},"ip")).rejects.toMatchObject({status:422});
 await expect(changeBillingCard(client as never,"org","owner",{...body,expectedDefault:null},"ip")).rejects.toThrow("mudou");expect(mock.tokenize).not.toHaveBeenCalled();
});
it("selects a saved card without calling the provider and returns recorded receipts without retrying",async()=>{
 await changeBillingCard(client as never,"org","owner",{...body,action:"default",methodId:request},"ip");expect(mock.tokenize).not.toHaveBeenCalled();expect(mock.rpc.mock.calls[0][1]).toMatchObject({p_method:request,p_card:null});
 mock.receipt={method_id:request,topup_updated:true};mock.rpc.mockClear();expect(await changeBillingCard(client as never,"org","owner",body,"ip")).toMatchObject({replayed:true});expect(mock.rpc).not.toHaveBeenCalled();
});
it("blocks external agreements instead of creating a second recurring charge",()=>{
 expect(cardBlocker({...mock.subscription as ManagedSubscription,provider_subscription_id:"sub_external"})).toContain("acordo externo");
});
