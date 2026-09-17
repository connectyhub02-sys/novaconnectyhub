export type PixAutomaticContext = "checkout" | "replacement";

/** Replacement remains unavailable: the documented Journey 3 requires payment.
 * Checkout availability is determined by the authenticated server snapshot. */
export function pixAutomaticAvailability(context: PixAutomaticContext) {
  return {
    enabled: false as const,
    code: "pix_automatic_unavailable" as const,
    reason: context === "replacement"
      ? "O Asaas exige um primeiro pagamento para autorizar Pix Automático. A troca sem cobrança agora não está disponível. Mantenha o cartão atual; a equipe precisa confirmar uma jornada compatível antes de fazer a mudança."
      : "Pix Automático ainda não está disponível neste checkout. Use cartão ou Pix comum, que exige pagamento manual em cada vencimento.",
  };
}
