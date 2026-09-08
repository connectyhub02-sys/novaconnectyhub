/** Presentation only: payment eligibility continues to be decided by the existing billing rules. */
export function billingCheckoutPresentation(paymentStatus: string, canPay: boolean, failure?: { label?: string; description: string } | null) {
  if (paymentStatus === "approved") return {
    title: "Pagamento confirmado", description: "Sua compra está registrada no painel.", tone: "success" as const,
  };
  if (paymentStatus === "rejected") return {
    title: failure?.label ?? "Pagamento não concluído",
    description: (failure?.description ?? "Não recebemos a confirmação deste pagamento.")
      + (canPay ? " Confira as orientações ou escolha Pix." : " Volte aos planos para abrir um novo pagamento."),
    tone: "error" as const,
  };
  if (paymentStatus === "in_process") return {
    title: "Pagamento em análise", description: "Aguardamos a confirmação do pagamento. Acompanhe a atualização nesta página.", tone: "warning" as const,
  };
  if (canPay) return {
    title: "Aguardando pagamento", description: "Escolha como deseja pagar para concluir a compra.", tone: "neutral" as const,
  };
  return {
    title: "Checkout encerrado", description: "Volte aos planos para conferir as condições e abrir um novo pagamento.", tone: "neutral" as const,
  };
}
