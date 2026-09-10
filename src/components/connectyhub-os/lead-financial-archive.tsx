"use client";
import { useCallback, useEffect, useState } from "react";
type Review = { id: string; order_id: string | null; status: string; notification_status: string; requested_at: string; resolution: string | null; resolution_notice_state: string };
type Entry = { id: string; operation: string; created_at: string; media_status: string; text: string | null; direction: string; messageType: string; deliveryStatus?: string };
type Data = { links: Array<{id:string;label:string;click_count:number;last_clicked_at:string|null;created_at:string}>; contactPreference: { optedOut: boolean; requestedAt: string | null; source: string | null }; canResolve: boolean; reviews: Review[]; archive: Entry[]; cursor: string | null };
export function LeadFinancialArchive({ companyId, leadId }: { companyId: string; leadId: string }) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async (cursor?: string | null) => {
    const response = await fetch(`/api/dashboard/lead-journey?${new URLSearchParams({ companyId, leadId, ...(cursor ? { cursor } : {}) })}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(previous => ({ ...result, archive: cursor ? [...previous?.archive ?? [], ...result.archive] : result.archive }));
  }, [companyId, leadId]);
  useEffect(() => { void Promise.resolve().then(() => load()).catch(error => setError(error.message)); }, [load]);
  async function resolve(review: Review, form: FormData) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/dashboard/lead-journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, leadId, reviewId: review.id, resolution: form.get("resolution"), reference: form.get("reference") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 text-xs">
    <h3 className="font-bold text-slate-950">Conferências e arquivo de mensagens</h3>
    {error ? <p role="alert" className="mt-2 text-rose-700">{error}</p> : null}
    {!data ? <p className="mt-2 text-slate-500">Carregando arquivo…</p> : <>
      {data.contactPreference?.optedOut ? <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <p className="font-semibold">Lead saiu da lista de contatos automáticos</p>
        <p className="mt-1">Follow-ups, lembretes de agenda, recuperação e retornos automáticos estão interrompidos. Agendamentos, pedidos e histórico foram preservados.</p>
        <p className="mt-1">{data.contactPreference.requestedAt ? new Date(data.contactPreference.requestedAt).toLocaleString("pt-BR") : "Preferência já registrada"} · {data.contactPreference.source === "public_link" ? "Confirmado pelo link de saída" : data.contactPreference.source === "whatsapp_agent" ? "Solicitado na conversa" : "Registro de preferência"}</p>
      </div> : null}
      {data.reviews.map(review => <details key={review.id} open={review.status !== "resolved"} className="mt-3 rounded-xl border border-amber-200 p-3">
        <summary className="cursor-pointer font-semibold">{review.status === "resolved" ? "Conferência concluída" : "Conferência financeira pendente"} · {review.order_id?.slice(0,8) ?? "Identificar pedido"}</summary>
        <p className="mt-2 text-slate-600">{review.status === "resolved" ? review.resolution === "confirmed" ? "Pagamento confirmado." : "Recebimento não identificado na conferência." : review.notification_status === "sent" ? "Responsável avisado. Pagamento protegido durante a análise." : "Caso registrado no painel. Aviso ao responsável pendente; confira os destinatários e a conexão."}</p>
        {review.status === "resolved" ? <p className="mt-2 text-slate-500">{review.resolution_notice_state === "sent" ? "Resultado enviado ao lead." : review.resolution_notice_state === "superseded" ? "Confirmação acompanhada pelo fluxo de pagamento do pedido." : ["unknown", "sending"].includes(review.resolution_notice_state) ? "Confirme na conversa se o retorno foi entregue antes de reenviar." : "Retorno ao lead na fila de envio."}</p> : null}
        {review.status !== "resolved" && data.canResolve ? <form className="mt-3 space-y-2" onSubmit={event => { event.preventDefault(); void resolve(review, new FormData(event.currentTarget)); }}>
          <label className="block">Resultado da consulta<select name="resolution" className="mt-1 w-full rounded border p-2"><option value="unconfirmed">Recebimento não identificado</option><option value="confirmed">Confirmado pelo processador</option></select></label>
          <label className="block">Referência da conferência<textarea name="reference" required minLength={5} maxLength={500} placeholder="Referência da consulta ao processador ou ao financeiro" className="mt-1 w-full rounded border p-2" /></label>
          <button disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Concluir conferência</button>
        </form> : null}
      </details>)}
      {data.links?.length ? <details className="mt-3 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">Links enviados e cliques</summary>
        <p className="mt-2 text-slate-500">Até 50 links recentes. Prévias identificadas do WhatsApp não entram na contagem.</p>
        {data.links.map(link=><div key={link.id} className="mt-2 border-t border-slate-100 pt-2"><p className="font-semibold">{link.label} · {link.click_count} {link.click_count===1?"clique":"cliques"}</p><p className="text-slate-500">{link.last_clicked_at?`Último clique: ${new Date(link.last_clicked_at).toLocaleString("pt-BR")}`:"Nenhum clique registrado"}</p></div>)}
      </details>:null}
      <details className="mt-3"><summary className="cursor-pointer font-semibold">Mensagens e mídias preservadas</summary>
        <p className="mt-2 text-slate-500">Versões recebidas, atualizações e arquivos, inclusive durante atendimento humano.</p>
        {data.archive.map(entry => <div key={entry.id} className="mt-2 border-t border-slate-100 pt-2">
          <p className="text-[11px] text-slate-500">{new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.direction === "inbound" ? "Lead" : "Atendimento"} · {entry.deliveryStatus ? ({prepared:"Preparada",queued:"Agendada no WhatsApp",sending:"Confirmação pendente",sent:"Enviada",failed:"Não enviada",uncertain:"Entrega a confirmar"}[entry.deliveryStatus] ?? "Registrada") : entry.operation === "updated" ? "Atualizada" : entry.operation === "deleted" ? "Removida na origem" : "Recebida"}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{entry.text || entry.messageType || "Mensagem"}</p>
          {entry.media_status === "stored" ? <a href={`/api/dashboard/lead-archive/${entry.id}/file`} className="mt-1 inline-block text-blue-700 underline">Abrir arquivo preservado</a> : entry.media_status === "retry" ? <p className="mt-1 text-amber-700">Gravação da mídia pendente. Recuperação automática em andamento.</p> : null}
        </div>)}
        {data.cursor ? <button className="mt-3 text-blue-700 underline" onClick={() => void load(data.cursor).catch(error => setError(error.message))}>Carregar versões anteriores</button> : null}
      </details>
    </>}
  </section>;
}
