type NoticeVoiceInput = {
  senderKind: "customer" | "platform";
  agentName?: string;
  eventType: string | null;
  platformMessage: string;
  metadata: Record<string, unknown>;
};

/** Select tone only after the actual sender is known, including a platform fallback. */
export function renderAccountNoticeVoice(input: NoticeVoiceInput) {
  if (input.senderKind === "platform") return input.platformMessage;
  const name = input.agentName?.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80);
  const identity = name ? `Sou ${name}, seu assistente virtual.` : "Sou seu assistente virtual.";
  const event = input.eventType ?? "";
  const rawBalance = input.metadata.balance_credits;
  const balance = rawBalance === null || rawBalance === undefined ? null : Number(rawBalance);
  const balanceText = balance !== null && Number.isFinite(balance) && balance >= 0
    ? ` Restam ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(balance)} créditos no saldo compartilhado da sua conta.`
    : " O saldo compartilhado da sua conta está baixo.";
  const url = typeof input.metadata.checkout_public_url === "string" ? input.metadata.checkout_public_url : input.metadata.checkout_url;
  const action = typeof url === "string" && url.trim() ? ` Acompanhe o saldo e as opções no painel: ${url}.` : " Acompanhe o saldo e as opções no painel ConnectyHub.";
  if (event === "paid_low_credits_20" || event === "paid_low_credits_10") {
    const opening = event === "paid_low_credits_10" ? "Meu combustível está perto de acabar." : "Estou ficando sem combustível para atender.";
    return `${identity}\n\n${opening}${balanceText} Se esse saldo acabar, meus atendimentos que usam IA ficam pausados até uma recarga.${action}`;
  }
  if (event === "paid_no_credits") return `${identity}\n\nFiquei sem créditos para continuar os atendimentos com IA. O saldo compartilhado da sua conta acabou e aguardo uma recarga para retomar essas atividades. A mensalidade do plano é separada.${action}`;
  const opening = customerNoticeOpening(event);
  // Preserve commercial facts, custom text, payment instructions and URLs verbatim.
  return `${identity}\n\n${opening}\n\n${input.platformMessage}`;
}

function customerNoticeOpening(event: string) {
  if (event === "payment_approved") return "Recebi a confirmação do seu pagamento e vim te avisar:";
  if (event === "payment_pending" || event === "checkout_payment_started") return "Estou acompanhando seu pagamento. Ele ainda precisa de confirmação:";
  if (event === "payment_rejected" || event === "payment_card_retry_failed") return "Vim te avisar que o pagamento não foi aprovado. Preciso da sua atenção para regularizar:";
  if (event === "payment_canceled") return "Recebi a informação de que o pagamento foi cancelado. Confira os detalhes:";
  if (event === "payment_refunded") return "Recebi a confirmação do estorno e vim te atualizar:";
  if (event === "credit_topup_enabled") return "Vou te manter por dentro das recargas automáticas que você autorizou:";
  if (event === "credit_topup_disabled") return "Vim confirmar que sua recarga automática foi desativada:";
  if (event === "credit_topup_action_required") return "Preciso da sua atenção: a recarga automática encontrou um impedimento:";
  if (["paid_plan_three_days_remaining", "paid_plan_renewal_reminder", "paid_plan_one_day_remaining", "paid_plan_due_today", "paid_access_ending"].includes(event)) return "Quero continuar te ajudando. Vim lembrar que o período do seu plano está terminando:";
  if (["paid_plan_expired", "paid_access_ended", "paid_plan_grace_period", "trial_expired"].includes(event)) return "Preciso te avisar sobre o acesso que mantém meus atendimentos ativos:";
  return "Vim te trazer uma atualização da sua conta ConnectyHub:";
}
