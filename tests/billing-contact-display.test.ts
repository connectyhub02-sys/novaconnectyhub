import { describe, expect, it } from "vitest";
import { parseBillingContact } from "../src/lib/billing/billing-contact";
import { isCardWithinValidity } from "../src/lib/billing/card-display";
describe("safe reusable billing data",()=>{
 it("whitelists contact fields without card secrets",()=>{
  expect(parseBillingContact({name:'Billing Person',email:'billing@example.test',phone:'(11) 99999-9999',cpfCnpj:'123.456.789-09',ccv:'123',number:'4111111111111111',token:'secret'})).toEqual({name:'Billing Person',email:'billing@example.test',phone:'11999999999',cpfCnpj:'12345678909'});
  expect(()=>parseBillingContact({cpfCnpj:'11111111111'})).toThrow();
 });
 it("keeps the whole expiry month valid and leaves legacy eligibility to the server",()=>{
  const now=new Date('2026-09-18T13:00:00Z');
  expect(isCardWithinValidity({exp_month:'08',exp_year:'2026'},now)).toBe(false);
  expect(isCardWithinValidity({exp_month:'09',exp_year:'2026'},now)).toBe(true);
  expect(isCardWithinValidity({exp_month:null,exp_year:null},now)).toBe(true);
 });
});
