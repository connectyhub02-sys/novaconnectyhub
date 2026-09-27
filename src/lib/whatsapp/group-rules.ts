// Rules of the agent inside WhatsApp groups: guidance in the group, orders only in private.

/** Someone in a group who wants to buy: price, how to buy, delivery, payment, "quero esse". */
export function showsPurchaseIntent(text: string) {
  return /\b(compr|adquir|encomend|pedido|pre[çc]o|valor|quanto (custa|é|e|fica|sai)|como (fa[çc]o|faz) (para|pra) (ter|pegar|pedir)|quero (esse|essa|o |a |um|uma|comprar|pedir)|pagar|pagamento|pix|cart[aã]o|parcel|entreg|frete|envi[ao]|tem (dispon|estoque|a pronta))/i.test(text);
}

/** A group reply that asks for personal or payment data: never allowed in a group. */
export function asksForPersonalData(text: string) {
  return /\b(cpf|cep|e-?mail|endere[çc]o|nome completo|cart[aã]o de cr[eé]dito|n[uú]mero do cart[aã]o|chave pix|dados (pessoais|de pagamento|para (o )?pagamento|para (o )?pedido)|seus dados)\b/i.test(text);
}

export const groupPrivateRedirectText = "Pra te ajudar com o pedido certinho, te chamo no privado agora 😉";
