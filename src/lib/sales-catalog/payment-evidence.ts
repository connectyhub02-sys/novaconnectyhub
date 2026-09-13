/** Lead-authored words are a claim; media analysis can suggest review, never approval. */
export function paymentEvidenceIntent(text: string, attachment = false, mediaAnalysis = "") {
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const value = normalize(text);
  // Negation belongs to its clause: "nem paguei" is not a payment claim, but
  // "não paguei, mas foi debitado" still reports an actual debit for review.
  const claimPattern = /\b(?:paguei|foi debitad[oa]|debitou|debitaram|descontou|descontaram|saiu da (?:minha )?conta|pagamento (?:foi )?(?:feito|realizado|efetuado)|pix (?:foi )?(?:feito|enviado|concluido)|enviei (?:o )?pix)\b/g;
  const inquiryPrefix = /\b(?:se|caso|como|quando|sera|seria|talvez|acho|sabe|saber|confirma|confirmar|verifica|verificar)\b/;
  const groupsOf = (content: string) => content.split(/(?<=[.!?;])\s*|\n+|,\s*|\s+(?:mas|porem|contudo|no entanto|mesmo assim)\s+/)
    .map(group => group.trim().replace(/^(?:mas|porem|contudo|no entanto|mesmo assim)\s+/, ""));
  const attributedReport = (before: string) => [...before.matchAll(/\b(?:disse|diz|falou|afirmou|informou|avisou|alegou)\b/g)].some(report => {
    const subject = before.slice(0, report.index).replace(/\b(?:me|te|lhe|nos|ja|mesmo|tambem|sempre|so|nunca|nao|ontem|hoje)\b/g, "").trim();
    const financialSource = /^(?:(?:o|a|meu|minha)\s+){0,2}(?:banco|operadora|extrato)(?:\s+(?:do|da|de)\s+(?:cartao|conta))?$/.test(subject);
    // Preserve "eu disse que paguei", while named agents and other speakers
    // remain attribution rather than the customer's own report of a debit.
    // A reported bank/card-statement result is itself a financial claim for review.
    return Boolean(subject) && !financialSource && !/\beu$/.test(subject);
  });
  const groups = groupsOf(value);
  const clauses = groups.flatMap(group => {
    const firstClaim = [...group.matchAll(claimPattern)][0];
    // "Não sei se foi debitado e descontou" keeps its uncertainty across "e".
    if (firstClaim && (inquiryPrefix.test(group.slice(0, firstClaim.index)) || attributedReport(group.slice(0, firstClaim.index)))) return [];
    return group.split(/\s+e\s+|\s+(?=(?:por que|porque|como|quando|onde|sera que)\b)/);
  });
  const claim = clauses.some(clause => {
    if (clause.includes("?")) return false;
    const matches = clause.matchAll(claimPattern);
    return [...matches].some(match => {
      const before = clause.slice(0, match.index);
      const after = clause.slice(match.index! + match[0].length).trim();
      if (/\b(?:nao|nem|nunca|jamais)\b/.test(before)
        || /\b(?:vou|iria|ia|posso|quero|preciso|se|caso|como|quando|sera|seria|talvez|acho|sabe|saber|confirma|confirmar|verifica|verificar)\b/.test(before)
        || attributedReport(before)
        || /^(?:ainda\s+)?(?:nao|nem)(?:\s+(?:ainda|viu|ta|por favor))?[.!]*$/.test(after)) return false;
      return true;
    });
  });
  const hasReceipt = (content: string) => groupsOf(content).some(group => {
    if (group.includes("?")) return false;
    return [...group.matchAll(/\b(?:comprovante|pagamento (?:realizado|efetuado)|transferencia (?:realizada|concluida)|pix (?:enviado|concluido))\b/g)].some(match => {
      const before = group.slice(0, match.index);
      return !/\b(?:nao|nem|nunca|jamais|sem)\b/.test(before) && !inquiryPrefix.test(before) && !attributedReport(before);
    });
  });
  // An unrelated product photo cannot become evidence just because its caption
  // denies having a receipt. A receipt independently identified in the image
  // can still request review, even when the customer's text denies payment.
  const receipt = attachment && (hasReceipt(value) || hasReceipt(normalize(mediaAnalysis)));
  return { evidence: claim || receipt, kind: receipt ? "attachment" as const : "claim" as const,
    question: /pagamento|paguei|pagou|cobran|debito|debit|recus|aprov|cartao|comprovante|pix/.test(value) || claim || receipt };
}

export function selectPaymentEvidenceOrder<T extends { id: string; paymentStatus: string; status: string }>(orders: T[], text: string): T | null {
  const explicit = orders.filter(order => text.toLowerCase().includes(order.id.toLowerCase()) || text.toLowerCase().includes(order.id.slice(0, 8).toLowerCase()));
  if (explicit.length === 1) return explicit[0];
  const actionable = orders.filter(order => !["refunded", "confirmed"].includes(order.paymentStatus) && !["cancelled", "delivered"].includes(order.status));
  if (actionable.length === 1) return actionable[0];
  return orders.length === 1 ? orders[0] : null;
}
