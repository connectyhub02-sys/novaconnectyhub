export type BillingAttentionRow = {
  id: string;
  organization_id: string;
  customer: string;
  occurred_at: string;
  category: string;
  detail: string;
  billing_closed_at?: string;
  billing_closure_reason?: string;
};
export type BillingAttention = {
  pendingCount: number;
  pending: BillingAttentionRow[];
  closedCount: number;
  closed: BillingAttentionRow[];
};

const guidance: Record<string, { title: string; action: string }> = {
  blockedNotices: { title: "Aviso aguardando remetente", action: "Confira a ativação dos avisos e reconecte o remetente em WhatsApp Interno. O envio será retomado somente se o aviso ainda for válido." },
  uncertainNotices: { title: "Entrega de aviso não confirmada", action: "Confira o recibo no provedor e o contato do cliente. Mantenha o envio retido enquanto houver dúvida; não reenvie manualmente." },
  exhaustedNotices: { title: "Aviso sem entrega após as tentativas", action: "Confira o contato do cliente e a conexão do remetente. Revise a validade do aviso antes de liberar uma nova tentativa." },
  overdueNotices: { title: "Aviso atrasado na fila", action: "Confira a execução da rotina de avisos e a conexão do remetente. Não crie outro aviso para o mesmo evento." },
  missingRate: { title: "Uso sem tarifa", action: "Confira a tarifa da operação e do modelo no Centro de custo para os próximos usos. Este registro aguarda decisão administrativa, sem cobrança retroativa automática." },
  unreconciledPayments: { title: "Pagamento aguardando conciliação", action: "Consulte a transação existente no Asaas e concilie o resultado. Não inicie outra cobrança enquanto o resultado estiver indefinido." },
  topupErrors: { title: "Recarga com pendência", action: "Confira a autorização, o limite mensal, o cartão e a última tentativa em Créditos e recargas. Concilie uma tentativa incerta antes de tentar novamente." },
  pixPending: { title: "Pix Automático aguardando conferência", action: "Confira no Asaas a autorização e o pagamento inicial. Concilie a operação existente antes de gerar outra autorização ou cobrança." },
  missedRenewals: { title: "Renovação sem tentativa hoje", action: "Confira contrato, consentimento, cartão e rotina de renovação. Investigue a ausência da tentativa antes de iniciar uma cobrança manual." },
};
const noticeNames: Record<string, string> = {
  payment_approved: "Aviso de pagamento aprovado",
  payment_canceled: "Aviso de pagamento cancelado",
  payment_overdue: "Aviso de pagamento vencido",
  renewal_reminder: "Lembrete de renovação",
  wallet_low_balance: "Aviso de saldo baixo",
  credit_topup_enabled: "Aviso de recarga automática autorizada",
  credit_topup_disabled: "Aviso de recarga automática desativada",
  credit_topup_action_required: "Aviso de recarga que precisa de atenção",
  paid_low_credits_20: "Aviso de saldo baixo (20%)",
  paid_low_credits_10: "Aviso de saldo crítico (10%)",
  paid_no_credits: "Aviso de créditos esgotados",
  paid_plan_three_days_remaining: "Lembrete de renovação em três dias",
  paid_plan_one_day_remaining: "Lembrete de renovação amanhã",
  paid_plan_due_today: "Lembrete de vencimento hoje",
  paid_plan_renewal_reminder: "Lembrete de renovação do plano",
  paid_plan_grace_period: "Aviso do prazo adicional para renovação",
};
export function billingAttentionGuidance(row: BillingAttentionRow) {
  const item = guidance[row.category] ?? { title: "Pendência financeira", action: "Confira a operação no Financeiro antes de executar qualquer ação." };
  const detail = row.category === "missingRate"
    ? row.detail.replace(/^whatsapp_traffic_routine_ai/, "Geração de campanha para WhatsApp").replace(/^content_generation/, "Geração de conteúdo")
    : noticeNames[row.detail] ?? row.detail;
  return { ...item, detail };
}
export function billingAttentionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não disponível" : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
