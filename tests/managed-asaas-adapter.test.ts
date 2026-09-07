import { describe, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";
import * as diagnostics from "../src/lib/sales-catalog/payment-diagnostics";
import { managedRenewalDay } from "../src/lib/billing/managed-renewal-policy";

function adapter(responses: Array<{status?:number;body:unknown}>) {
  const fetch = vi.fn(async()=>{const r=responses.shift();if(!r)throw Error("Unexpected provider request");return {ok:!r.status||r.status<400,status:r.status??200,json:async()=>r.body};});
  const api=serverModuleHarness<typeof import("../src/lib/sales-catalog/asaas-direct")>("src/lib/sales-catalog/asaas-direct.ts",{"./payment-diagnostics":diagnostics},[],{fetch});
  return {api,fetch};
}
const payment={id:"pay_fixture",customer:"cus_fixture",value:100,status:"PENDING",billingType:"CREDIT_CARD",externalReference:"billing_managed:fixture"};
const input={accessToken:"fixture-secret",paymentId:payment.id,customerId:payment.customer,reference:payment.externalReference,amount:100,token:"fixture-vault-token"};

describe("Asaas application-managed recurrence",()=>{
  it("creates a single bill without attaching a card or an external subscription",async()=>{
    const t=adapter([{body:payment}]);await t.api.createManagedAsaasInvoice({...input,dueDate:"2026-09-10"});
    const call=t.fetch.mock.calls[0] as unknown as [string,{body:string}];expect(call[0]).toMatch(/\/payments$/);
    expect(JSON.parse(call[1].body)).toMatchObject({customer:payment.customer,value:100,dueDate:"2026-09-10"});
    expect(call[1].body).not.toMatch(/creditCard|subscription|fixture-vault-token/);
  });
  it("pays the existing bill with a token only, without creating another charge",async()=>{
    const t=adapter([{body:payment},{body:{...payment,status:"CONFIRMED"}}]);expect(await t.api.payManagedAsaasInvoice(input)).toMatchObject({status:"CONFIRMED"});
    const calls=t.fetch.mock.calls as unknown as Array<[string,{method:string;body:string}]>;
    expect(calls.map(c=>c[1].method)).toEqual(["GET","POST"]);expect(calls[1][0]).toContain("/payments/pay_fixture/payWithCreditCard");expect(JSON.parse(calls[1][1].body)).toEqual({creditCardToken:input.token});
  });
  it("returns an already paid charge without sending another debit",async()=>{
    const t=adapter([{body:{...payment,status:"CONFIRMED"}}]);await t.api.payManagedAsaasInvoice(input);expect(t.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{customer:"cus_other"},{externalReference:"another"},{value:101},{subscription:"sub_external"},{deleted:true}])("rejects mismatched or externally recurring bills before any debit (%j)",async(change)=>{
    const t=adapter([{body:{...payment,...change}}]);await expect(t.api.payManagedAsaasInvoice(input)).rejects.toMatchObject({definitive:true});expect(t.fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps an inconclusive provider result uncertain without sending an immediate retry",async()=>{
    const t=adapter([{body:payment},{status:500,body:{error:"temporary"}}]);await expect(t.api.payManagedAsaasInvoice(input)).rejects.toMatchObject({definitive:false});expect(t.fetch).toHaveBeenCalledTimes(2);
  });
  it("uses Brazilian calendar days and starts the daily sweep at 09:00",()=>{
    const end=new Date("2026-10-01T01:00:00Z"); // September 30 in Brazil
    expect(managedRenewalDay(end,new Date("2026-09-27T11:59:59Z"))).toBeNull();
    expect(managedRenewalDay(end,new Date("2026-09-27T12:00:00Z"))).toBe("2026-09-27");
    expect(managedRenewalDay(end,new Date("2026-09-29T12:00:00Z"))).toBe("2026-09-29");
    expect(managedRenewalDay(end,new Date("2026-09-30T12:00:00Z"))).toBeNull();
  });
  it("rejects retired PagBank charges before any provider request",async()=>{
    const fetch=vi.fn();const old=serverModuleHarness<typeof import("../src/lib/sales-catalog/pagbank")>("src/lib/sales-catalog/pagbank.ts",{},[],{fetch});
    await expect(old.createPagBankCardOrder({} as never)).rejects.toThrow("PagBank foi desativado");
    await expect(old.createPagBankPixOrder({} as never)).rejects.toThrow("PagBank foi desativado");expect(fetch).not.toHaveBeenCalled();
  });
});
