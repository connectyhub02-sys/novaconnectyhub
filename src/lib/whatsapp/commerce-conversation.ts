import { activityDefaultDestination } from "./activity-profile";
import { getAgentPromptTemplate } from "./agent-prompt-templates";
export type ActivityCommerceJourney = "checkout" | "property" | "vehicle" | "appointment";

/** Policy comes from the saved activity, including agents with a manual prompt. */
export function resolveActivityCommerceJourney(templateId: string): ActivityCommerceJourney {
  if (templateId === "imobiliaria" || templateId === "corretor_imoveis") return "property";
  if (templateId === "revenda_veiculos") return "vehicle";
  return activityDefaultDestination(getAgentPromptTemplate(templateId).id) === "appointment" ? "appointment" : "checkout";
}

export function buildActivityCommerceInstruction(journey: ActivityCommerceJourney) {
  if (journey === "checkout") return [];
  return [
    "",
    "REGRA OBRIGATORIA DA ATIVIDADE: ATENDIMENTO CONSULTIVO",
    "- Esta regra se aplica aos itens de agendamento e aos itens legados sem escolha explicita de venda. Um item explicitamente configurado para venda segue seu proprio fluxo.",
    "- Nao monte carrinho, previa de pedido, reserva paga, checkout, Pix ou cobranca pelo WhatsApp, mesmo que o cliente peca para pagar. Encaminhe a negociacao ao responsavel.",
    "- Orcamento e capacidade de pagamento sao criterios de busca, nunca aceite de compra. Nao escolha um item em nome do cliente.",
    journey === "property"
      ? "- Entenda regiao, faixa de valor e caracteristicas desejadas; apresente imoveis reais, esclareca duvidas e proponha visita ou proposta com o corretor, sujeita a confirmacao."
      : journey === "appointment" ? "- Entenda a necessidade e proponha avaliação, atendimento ou reunião na agenda vinculada, sem prometer resultado ou horário não reservado." : "- Entenda modelo, uso, faixa de valor e eventual troca; apresente veiculos reais e proponha visita, test-drive ou proposta com o responsavel, sujeitos a confirmacao.",
    "- Use os precos como referencia e as fotos e links cadastrados para apresentar opcoes. Nao prometa financiamento aprovado, disponibilidade ou agendamento sem confirmacao.",
  ];
}

/** Budget qualification must not activate checkout even when it contains 'pagar'. */
export function isCommerceBudgetStatement(text: string) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const budget = /\b(?:orcamento|faixa de (?:valor|preco)|meu limite|posso (?:pagar|gastar|investir)|consigo (?:pagar|gastar|investir)|pretendo (?:gastar|investir)|tenho ate|no maximo|ate (?:r\$\s*)?(?:\d[\d.,]*|um milhao|cem mil))\b/.test(normalized);
  // A clearly selected purchase can include a budget without being only qualification.
  const purchase = /\b(?:quero comprar (?:esse|essa|este|esta)|vou levar|pode fechar|pode finalizar|confirmo (?:o pedido|a compra)|manda o pix|envia o pix|gere o pagamento)\b/.test(normalized);
  return budget && !purchase;
}

export function hasCheckoutActionClaim(text: string) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(?:seu pedido|previa do pedido|resumo do pedido|pedido ficou|carrinho|checkout|pix|boleto|link de pagamento|(?:gerar|ger[ae]i|criar|criei|fechar|fechei|confirmar|confirmei) (?:o |um |seu |o seu )?(?:pagamento|pedido)|finalizar (?:a )?compra|pague|pagar agora)\b/.test(normalized);
}

export function buildConsultativeCommerceReply(journey: ActivityCommerceJourney, budget: boolean) {
  if (journey === "appointment") return budget ? "Entendi sua faixa de investimento. Qual atendimento você está procurando?" : "Podemos consultar os horários disponíveis para esse atendimento. Qual dia você prefere?";
  if (budget) return journey === "vehicle"
    ? "Entendi sua faixa de investimento. Que características você procura no veículo?"
    : "Entendi sua faixa de investimento. O que não pode faltar no imóvel que você procura?";
  return journey === "vehicle"
    ? "Você prefere conversar sobre uma proposta ou consultar os horários para uma visita ou test-drive?"
    : "Você prefere conversar sobre uma proposta ou consultar os horários para uma visita ao imóvel?";
}

/** A payment keyword or an initial "sim" is not enough to interrupt the conversation. */
export function requiresCommerceConversationReply(text: string) {
  if (isCommerceBudgetStatement(text)) return true;
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/\b(?:depois|amanha|mais tarde|outro dia|vou pensar|ainda nao|agora nao)\b/.test(normalized)) return true;

  // Questions, objections and requests for a person take precedence over checkout shortcuts.
  if (/\b(?:humano|atendente|pessoa do time|falar com alguem|duvida|explica|explicar|explique|entender|saber|me conta|me diga|me diz|antes disso|antes de pagar|calma|espera|aguarda)\b/.test(normalized)) return true;
  if (/\b(?:como|quando|quanto|quantos|quantas|qual|quais|porque|por que|onde|serve|funciona|contem|tem desconto|tem garantia|tem acucar|tem lactose|tem gluten|tem efeito|tem risco|posso usar|posso tomar|posso consumir|e seguro)\b/.test(normalized)) return true;
  // Keep sentence boundaries: "não consigo não. Manda o Pix" is not "não manda".
  // Commas still belong to a command ("não, manda o Pix" remains ambiguous).
  const sentences = text.split(/[.!?;]+/).map(sentence => sentence.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim());
  if (sentences.some(sentence => /\b(?:nao quero|nao vou|nao pode|nao gera|nao gere|nao manda|nao mande|nao envia|nao envie|nao fecha|nao feche|cancela|cancelar|desisti|desistir|pare|parar)\b/.test(sentence))) return true;

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
    "- Uma faixa de investimento ou capacidade de pagar e apenas orcamento. Nao monte pedido nem trate uma recomendacao sua como produto escolhido pelo lead.",
    "- Depois de confirmar o pedido, preserve os itens e as quantidades. Uma mudanca solicitada pelo lead precisa de uma previa atualizada antes da cobranca.",
    "- Se o lead disser que ja informou os dados, reconheca e aproveite os dados salvos. Nao repita a mesma lista de cadastro nem reinicie a qualificacao.",
    "- Nao afirme que criou um pedido, gerou ou enviou um Pix sem o resultado registrado da ferramenta. O sistema executa o fechamento e envia o pagamento; uma promessa em texto nao executa essa acao.",
  ];
}
