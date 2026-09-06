/** Lead-authored words are a claim; media analysis can suggest review, never approval. */
export function paymentEvidenceIntent(text: string, attachment = false, mediaAnalysis = "") {
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const value = normalize(text);
  const negative = /\b(nao|nunca)\s+(?:\w+\s+){0,2}(paguei|pago|pagou|debitaram|descontou)|\b(vou|posso|quero|preciso|como)\s+(?:\w+\s+){0,2}(pagar|enviar|mandar)|\b(se|caso)\s+(?:eu\s+)?(pagar|pagasse|enviar)/.test(value);
  const claim = !negative && /\b(ja paguei|eu paguei|paguei|foi debitado|debitou|descontou|saiu da (minha )?conta|pagamento (foi )?(feito|realizado)|pix (feito|enviado)|enviei o pix)\b/.test(value);
  const receipt = attachment && /comprovante|pagamento (realizado|efetuado)|transferencia (realizada|concluida)|pix (enviado|concluido)/.test(normalize(`${text} ${mediaAnalysis}`));
  return { evidence: claim || receipt, kind: receipt ? "attachment" as const : "claim" as const,
    question: /pagamento|paguei|pagou|cobran|debito|debit|recus|aprov|cartao|comprovante|pix/.test(value) || receipt };
}

export function selectPaymentEvidenceOrder<T extends { id: string; paymentStatus: string; status: string }>(orders: T[], text: string): T | null {
  const explicit = orders.filter(order => text.toLowerCase().includes(order.id.toLowerCase()) || text.toLowerCase().includes(order.id.slice(0, 8).toLowerCase()));
  if (explicit.length === 1) return explicit[0];
  const actionable = orders.filter(order => !["refunded", "confirmed"].includes(order.paymentStatus) && !["cancelled", "delivered"].includes(order.status));
  if (actionable.length === 1) return actionable[0];
  return orders.length === 1 ? orders[0] : null;
}
