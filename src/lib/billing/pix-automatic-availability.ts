export type PixAutomaticContext = "checkout" | "replacement";

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
