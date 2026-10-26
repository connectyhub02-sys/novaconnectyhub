import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingAttentionDetails } from "@/components/connectyhub-os/billing-attention";
import { billingAttentionDate, type BillingAttentionRow } from "@/lib/billing/attention";
const row: BillingAttentionRow = {id:'fixture',organization_id:'org',customer:'Cliente de teste',occurred_at:'2026-09-14T13:25:02Z',category:'uncertainNotices',detail:'payment_canceled'};
describe('billing attention presentation',()=>{
 it('shows customer, local original date and safe action without a resend button',()=>{
  const html=renderToStaticMarkup(<BillingAttentionDetails data={{pendingCount:1,pending:[row],closedCount:0,closed:[]}}/>);
  expect(html).toContain('Cliente de teste');expect(html).toContain('14/09/2026, 10:25');expect(html).toContain('Aviso de pagamento cancelado');expect(html).toContain('não reenvie manualmente');expect(html).not.toContain('<button');
 });
 it('separates audit closure from current pending work and preserves uncertainty',()=>{
  const html=renderToStaticMarkup(<BillingAttentionDetails data={{pendingCount:0,pending:[],closedCount:1,closed:[{...row,billing_closed_at:'2026-10-26T21:00:00Z',billing_closure_reason:'Encerrado sem reenvio.'}]}}/>);
  expect(html).toContain('Histórico: encerrados');expect(html).toContain('Encerrado sem reenvio.');expect(html).toContain('não confirma entrega');expect(html).not.toContain('Pendências por cliente');
 });
 it('does not present an unavailable detail load as healthy',()=>{
  expect(renderToStaticMarkup(<BillingAttentionDetails data={null}/>)).toContain('role="alert"');
  expect(billingAttentionDate('invalid')).toBe('Data não disponível');
 });
});
