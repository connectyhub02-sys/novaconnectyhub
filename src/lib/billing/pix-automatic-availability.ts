export type PixAutomaticContext = "checkout" | "replacement";

/** Explains the existing initial-checkout rules without authorizing a payment. */
export function pixAutomaticCheckoutRestriction(input: {
  checkoutKind: string; subscriptionStatus: string; billingCycle: string;
  recurringAmount: number; providerSubscription: boolean; campaignPricing: boolean;
}) {
  if (input.checkoutKind === "renewal") return "Este checkout renova um plano existente. A adesão ao Pix Automático está disponível apenas na contratação inicial. Use cartão ou Pix comum nesta renovação.";
  if (input.checkoutKind !== "initial") return "A troca de plano ainda não permite adesão ao Pix Automático. Use cartão ou Pix comum.";
  if (input.providerSubscription) return "Este plano já possui uma assinatura automática vinculada. Confira a forma de pagamento em Minha Conta.";
  if (!["pending", "incomplete"].includes(input.subscriptionStatus)) return "A contratação inicial deste plano já foi encerrada. O Pix Automático não pode ser iniciado neste checkout.";
  if (input.billingCycle !== "recurring" || input.recurringAmount <= 0) return "Esta compra não tem renovação recorrente. Use cartão ou Pix comum para o pagamento único.";
  if (input.campaignPricing) return "Esta oferta tem preços por período e ainda não aceita Pix Automático. Use cartão ou Pix comum.";
  return null;
}

/** Replacement remains unavailable: the documented Journey 3 requires payment.
 * Checkout availability is determined by the authenticated server snapshot. */
export function pixAutomaticAvailability(context: PixAutomaticContext) {
  return {
    enabled: false as const,
    code: "pix_automatic_unavailable" as const,
    reason: context === "replacement"
      ? "Disponível para novas contratações elegíveis. Para trocar uma assinatura ativa, o Asaas exige autorização com primeiro pagamento. A troca sem cobrança depende da confirmação de uma jornada compatível pelo Asaas. Seu cartão atual continua válido."
      : "Pix Automático ainda não está disponível neste checkout. Use cartão ou Pix comum, que exige pagamento manual em cada vencimento.",
  };
}
