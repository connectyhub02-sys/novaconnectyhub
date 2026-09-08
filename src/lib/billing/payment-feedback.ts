import type { RejectedPaymentCopy } from "@/components/checkout/mercado-pago-card-brick";
import type { PaymentDiagnostic } from "@/lib/sales-catalog/payment-diagnostics";

/** Used outside the Mercado Pago brick: a missing result never implies a bank decline. */
export function buildBillingPaymentFailureCopy(
  provider: "asaas" | "pagbank" | "mercado_pago" | "unknown",
  status?: string | null,
  diagnostic?: Partial<PaymentDiagnostic> | null,
): RejectedPaymentCopy {
  const name = provider === "asaas" ? "Asaas" : provider === "pagbank" ? "PagBank" : provider === "mercado_pago" ? "Mercado Pago" : "provedor de pagamento";
  const integration = diagnostic?.category === "integration";
  const permission = integration && diagnostic?.httpStatus === 403;
  const declined = status === "rejected" && diagnostic?.category === "declined";
  const validation = diagnostic?.category === "validation";
  const description = permission
    ? `O ${name} não autorizou o recurso necessário para preparar este pagamento. A equipe precisa regularizar a integração.`
    : integration
      ? `Não foi possível preparar o pagamento pela integração com o ${name}. A equipe precisa verificar a configuração.`
      : declined
        ? `O ${name} informou que essa tentativa não foi autorizada. O motivo específico não foi informado.`
        : validation
          ? "Não foi possível concluir o pagamento com os dados informados."
          : "O pagamento não foi concluído. Ainda não temos um motivo confirmado para essa tentativa.";
  return {
    label: declined ? "Pagamento recusado" : integration ? "Cartão indisponível" : "Pagamento não concluído",
    inlineMessage: description,
    title: integration ? "O pagamento por cartão precisa de ajuste" : declined ? "Essa tentativa não foi autorizada" : "Não foi possível concluir o pagamento",
    description,
    reason: permission ? "Permissão de integração pendente." : integration ? "Configuração do recebimento precisa de conferência." : validation ? "Dados do pagamento precisam de conferência." : "Motivo específico não confirmado.",
    recommendation: integration ? "Você pode escolher Pix ou entrar em contato com a equipe para regularizar o pagamento por cartão." : validation ? "Confira os dados do titular e do cartão antes de tentar novamente." : "Se apareceu um lançamento no banco, peça uma conferência à equipe antes de repetir o pagamento.",
    nextSteps: integration
      ? ["Trocar de cartão não resolve esta restrição da integração.", "Escolha Pix para continuar ou peça ajuda à equipe."]
      : ["Confira o resultado no aplicativo do seu banco.", "Sem lançamento ou pagamento em conferência, você pode tentar outro cartão ou escolher Pix."],
    retryCardAllowed: !integration,
    statusDetail: null,
  };
}
