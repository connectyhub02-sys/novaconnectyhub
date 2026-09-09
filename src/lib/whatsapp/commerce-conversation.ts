/** A payment keyword or an initial "sim" is not enough to interrupt the conversation. */
export function requiresCommerceConversationReply(text: string) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/\b(?:depois|amanha|mais tarde|outro dia|vou pensar|ainda nao|agora nao)\b/.test(normalized)) return true;

  // Questions, objections and requests for a person take precedence over checkout shortcuts.
  if (/\b(?:humano|atendente|pessoa do time|falar com alguem|duvida|explica|explicar|explique|entender|saber|me conta|me diga|me diz|antes disso|antes de pagar|calma|espera|aguarda)\b/.test(normalized)) return true;
  if (/\b(?:como|quando|quanto|quantos|quantas|qual|quais|porque|por que|onde|serve|funciona|contem|tem desconto|tem garantia|tem acucar|tem lactose|tem gluten|tem efeito|tem risco|posso usar|posso tomar|posso consumir|e seguro)\b/.test(normalized)) return true;
  if (/\b(?:nao quero|nao vou|nao pode|nao gera|nao gere|nao manda|nao envie|nao fecha|nao feche|cancela|cancelar|desisti|desistir|pare|parar)\b/.test(normalized)) return true;

  // Method changes preserve the cart; changes to products, quantities or delivery need a new preview.
  const withoutMethodSwitch = normalized.replace(/\b(?:troca|trocar|muda|mudar|altera|alterar)\s+(?:(?:a forma|o metodo)\s+de\s+pagamento\s+)?(?:(?:de|o|do)\s+)?(?:pix|cartao|credito|debito)?\s*(?:para|por|pra|pro|no|em)\s+(?:o\s+)?(?:pix|cartao|credito|debito)\b/g, "");
  if (/\b(?:troca|trocar|muda|mudar|altera|alterar|corrige|corrigir|tira|tirar|remove|remover|adiciona|adicionar|inclui|incluir|acrescenta|acrescentar|coloca|colocar)\b/.test(withoutMethodSwitch)) return true;
  if (/\b(?:mais um|mais uma|tambem quero|quero tambem|so que|mas sem|porem|em vez|ao inves)\b/.test(normalized)) return true;

  // A polite request to send payment may end with "?". Other questions stay with the clone.
  const paymentRequest = /\b(?:manda|mande|mandar|passa|passe|passar|envia|enviar|envie|gera|gerar|gere|reenvia|reenviar|pode fechar|pode finalizar|pode concluir|pode prosseguir|pode continuar|pode seguir)\b/.test(normalized)
    && /\b(?:pix|pagamento|checkout|link|pedido|codigo)\b/.test(normalized);
  return text.includes("?") && !paymentRequest;
}

export function buildCommerceConversationInstruction() {
  return [
    "",
    "CONTINUIDADE DO CLONE DURANTE A VENDA:",
    "- Mantenha o tom, vocabulario e ritmo do clone em todas as etapas, inclusive ao esclarecer dados ou pagamento. Uma resposta curta e suficiente nao precisa virar apresentacao de catalogo.",
    "- Responda primeiro a duvida, objecao ou comentario atual. Se o lead interromper o fechamento, esclareca e retome o pedido combinado quando ele quiser continuar.",
    "- As etapas comerciais sao internas e flexiveis: aproveite todos os dados enviados de uma vez, inclusive por audio transcrito; pergunte apenas pelo que ainda falta.",
    "- Nao termine toda resposta com uma pergunta de venda. Agradecimentos, explicacoes e esclarecimentos podem terminar naturalmente.",
    "- Recomende com base na necessidade e nos fatos do catalogo. Sugira um complemento somente quando fizer sentido e aguarde aceite; nunca acrescente produtos por conta propria.",
    "- Depois de confirmar o pedido, preserve os itens e as quantidades. Uma mudanca solicitada pelo lead precisa de uma previa atualizada antes da cobranca.",
    "- Se o lead disser que ja informou os dados, reconheca e aproveite os dados salvos. Nao repita a mesma lista de cadastro nem reinicie a qualificacao.",
    "- Nao afirme que criou um pedido, gerou ou enviou um Pix sem o resultado registrado da ferramenta. O sistema executa o fechamento e envia o pagamento; uma promessa em texto nao executa essa acao.",
  ];
}
