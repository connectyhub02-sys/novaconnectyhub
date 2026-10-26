import { billingAttentionDate, billingAttentionGuidance, type BillingAttention, type BillingAttentionRow } from "@/lib/billing/attention";

function AttentionItem({ row, closed = false }: { row: BillingAttentionRow; closed?: boolean }) {
  const info = billingAttentionGuidance(row);
  return <li className="rounded-lg border border-slate-200 p-3">
    <p className="font-semibold">{row.customer} — {info.title}</p>
    <p className="mt-1 text-sm">{row.category === "missedRenewals" ? "Vencimento" : "Registro"}: {billingAttentionDate(row.occurred_at)} (Brasília){info.detail ? ` · ${info.detail}` : ""}</p>
    {closed ? <>
      <p className="mt-2 text-sm">{row.billing_closure_reason}</p>
      <p className="mt-1 text-xs text-slate-600">Encerrado em {billingAttentionDate(row.billing_closed_at!)} (Brasília). Nenhuma ação necessária neste registro.</p>
    </> : <p className="mt-2 text-sm"><strong>O que fazer:</strong> {info.action}</p>}
    <p className="mt-1 break-all text-xs text-slate-500">Referência: {row.id}</p>
  </li>;
}
export function BillingAttentionDetails({ data }: { data: BillingAttention | null }) {
  if (!data) return <p role="alert" className="mt-3 text-amber-800">Não foi possível carregar clientes e datas das pendências. Atualize a página para conferir os detalhes e o histórico.</p>;
  return <>
    {data.pendingCount > 0 && <div className="mt-4">
      <h3 className="font-semibold">Pendências por cliente ({data.pendingCount})</h3>
      <ul className="mt-2 space-y-2">{data.pending.map(row => <AttentionItem key={`${row.category}:${row.id}`} row={row} />)}</ul>
      {data.pendingCount > data.pending.length && <p className="mt-2 text-sm">Exibindo as {data.pending.length} mais antigas de {data.pendingCount} pendências. As demais continuam registradas para conferência administrativa.</p>}
    </div>}
    {data.closedCount > 0 && <details className="mt-4 rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer font-semibold">Histórico: encerrados sem cobrança ou reenvio ({data.closedCount})</summary>
      <p className="mt-2 text-sm">A decisão administrativa preserva os registros originais. Encerramento de aviso não confirma entrega; uso sem tarifa não significa custo de IA gratuito.</p>
      <ul className="mt-3 space-y-2">{data.closed.map(row => <AttentionItem key={`${row.category}:${row.id}`} row={row} closed />)}</ul>
      {data.closedCount > data.closed.length && <p className="mt-2 text-sm">Exibindo os {data.closed.length} encerramentos mais recentes de {data.closedCount}.</p>}
    </details>}
  </>;
}
