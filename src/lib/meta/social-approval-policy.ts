import { isMetaCommentChannel, type MetaSocialChannel } from "./social-agent-policy";

const maxSocialApprovalTextLength = 1500;

export function buildMetaSocialSuggestedReply(input: {
  channel: MetaSocialChannel;
  leadName?: string | null;
  messageText?: string | null;
}) {
  const name = normalizeLeadFirstName(input.leadName);
  const greeting = name ? `Oi, ${name}!` : "Oi!";
  const message = input.messageText?.trim().toLowerCase() ?? "";
  const wantsPrice = /\b(preco|valor|quanto|orcamento|investimento|custa|custo)\b/.test(message);
  const wantsContact = /\b(chama|direct|dm|mensagem|contato|whatsapp|zap)\b/.test(message);

  if (isMetaCommentChannel(input.channel)) {
    if (wantsPrice || wantsContact) {
      return `${greeting} Obrigado pelo contato. Vou continuar com voce por mensagem privada para te orientar com mais seguranca.`;
    }

    return `${greeting} Obrigado por comentar. Vou te chamar por mensagem privada para entender melhor e te passar o proximo passo.`;
  }

  if (wantsPrice) {
    return `${greeting} Obrigado pelo contato. Me conta qual solucao voce procura hoje para eu te orientar com os valores certos.`;
  }

  return `${greeting} Obrigado por chamar. Me conta um pouco mais sobre o que voce precisa para eu te ajudar da melhor forma.`;
}

export function normalizeMetaSocialApprovalText(value: unknown) {
  const text = typeof value === "string" ? value.trim().replace(/\r\n/g, "\n") : "";

  if (!text) {
    throw new Error("Informe a resposta aprovada.");
  }

  if (text.length > maxSocialApprovalTextLength) {
    throw new Error(`A resposta pode ter no maximo ${maxSocialApprovalTextLength} caracteres.`);
  }

  return text;
}

function normalizeLeadFirstName(value: string | null | undefined) {
  const firstName = value?.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}'-]/gu, "");

  if (!firstName || firstName.length < 2 || /^lead$/i.test(firstName)) {
    return null;
  }

  return firstName.slice(0, 32);
}
