export type PaymentDiagnostic = {
  category: "declined" | "validation" | "integration" | "unknown";
  stage: "customer_lookup" | "customer_create" | "card_tokenization" | "payment_create" | "reconcile";
  code: string;
  httpStatus: number | null;
};

const allowedCodes = new Set(["forbidden", "invalid_creditCard", "invalid_creditCardHolderInfo", "invalid_cpfCnpj", "invalid_customer", "invalid_value", "invalid_installmentCount", "invalid_access_token", "access_token_not_found", "invalid_object", "invalid_action", "invalid_payment"]);

/** Provider descriptions can echo submitted data. Keep an allowlisted code, never the raw body. */
export function classifyAsaasFailure(status: number | null, endpoint: string, method: string, body?: unknown): PaymentDiagnostic {
  const stage = endpoint === "/creditCard/tokenizeCreditCard" ? "card_tokenization" : endpoint.startsWith("/customers") ? method === "POST" ? "customer_create" : "customer_lookup" : method === "POST" && ["/payments", "/subscriptions"].includes(endpoint) ? "payment_create" : "reconcile";
  const errors = body && typeof body === "object" && "errors" in body && Array.isArray(body.errors) ? body.errors : [];
  const code = errors.map(entry => entry && typeof entry === "object" && "code" in entry ? entry.code : null).find(value => typeof value === "string" && allowedCodes.has(value)) ?? "not_informed";
  const declined = stage === "payment_create" && status === 400 && code === "invalid_creditCard";
  return { stage, code, httpStatus: status, category: declined ? "declined" : status !== null && [400, 422].includes(status) ? "validation" : status !== null && [401, 403, 404].includes(status) ? "integration" : "unknown" };
}

export function paymentOutcomeCopy(status: string, diagnostic?: Partial<PaymentDiagnostic> | null) {
  if (status === "approved") return "Pagamento confirmado!";
  if (status === "rejected") return "Essa tentativa não foi autorizada. O motivo específico não foi informado. Confira com seu banco ou escolha outro cartão ou Pix.";
  if (status === "error" && diagnostic?.category === "validation" && ["customer_lookup", "customer_create"].includes(diagnostic.stage ?? "")) {
    return diagnostic.code === "invalid_cpfCnpj"
      ? "Não foi possível preparar o pagamento porque o CPF/CNPJ do pagador precisa ser corrigido. Envie o documento correto por aqui para continuarmos com o mesmo pedido."
      : "Não foi possível preparar o pagamento porque os dados do pagador precisam ser conferidos. Podemos corrigir o cadastro por aqui e continuar com o mesmo pedido.";
  }
  if (status === "error") return diagnostic?.category === "validation"
    ? "Não foi possível concluir o pagamento. Confira os dados do pagador e do cartão antes de tentar novamente."
    : "Não foi possível concluir essa tentativa. O motivo não foi confirmado; isso não significa falta de saldo ou limite. Se apareceu um débito no seu banco, peça ajuda à equipe antes de tentar novamente.";
  if (status === "cancelled" || status === "expired") return "Essa tentativa foi encerrada. Se apareceu um débito, peça uma conferência à equipe antes de tentar novamente.";
  if (status === "refunded") return "O pagamento foi estornado. Confira o acompanhamento com seu banco.";
  return "Ainda não temos confirmação desse pagamento. Estamos verificando; aguarde antes de tentar pagar novamente.";
}
