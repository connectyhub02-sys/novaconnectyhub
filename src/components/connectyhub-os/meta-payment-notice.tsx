"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";

type Payment =
  | { billedBy: "connectyhub" }
  | { billedBy: "customer_meta"; status: "ok" | "missing" | "unknown"; paymentUrl: string; issues: string[] };

// Customer-paid official numbers: show whether Meta has a card and link straight to it.
export function MetaPaymentNotice({ url, compact = false }: { url: string | null; compact?: boolean }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  useEffect(() => {
    let active = true;
    if (!url) return;
    fetch(url, { cache: "no-store" })
      .then(async (r) => { const v = await r.json(); if (r.ok && active) setPayment(v); })
      .catch(() => null);
    return () => { active = false; };
  }, [url]);
  if (!url || !payment || payment.billedBy === "connectyhub") return null;
  const button = <a href={payment.paymentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"><CreditCard size={16} aria-hidden /> {payment.status === "ok" ? "Ver pagamento na Meta" : "Adicionar cartão na Meta"} <ExternalLink size={14} aria-hidden /></a>;
  if (payment.status === "ok")
    return compact ? null : <div role="status" className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span>Cartão cadastrado na Meta. As mensagens deste número são cobradas pela Meta no seu cartão.</span>{button}</div>;
  if (payment.status === "unknown")
    return <div role="status" className={`${compact ? "mt-2" : "mx-5 mt-3"} flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700`}><span>Não foi possível confirmar o pagamento na Meta agora. As mensagens deste número são cobradas pela Meta no cartão da sua conta.</span>{button}</div>;
  return <div role="alert" className={`${compact ? "mt-2" : "mx-5 mt-3"} rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950`}>
    <p className="font-semibold">Falta adicionar um cartão de crédito na Meta</p>
    <p className="mt-1">Sem o cartão, campanhas e mensagens iniciadas por você não são enviadas. Respostas a quem escreveu nas últimas 24 horas continuam funcionando. Clique no botão, entre com a conta que administra seu WhatsApp na Meta e adicione o cartão em “Adicionar método de pagamento”. Depois volte aqui.</p>
    {payment.issues.filter((i) => !i.startsWith("Falta adicionar")).map((i) => <p key={i} className="mt-1">{i}</p>)}
    <div className="mt-3">{button}</div>
  </div>;
}
