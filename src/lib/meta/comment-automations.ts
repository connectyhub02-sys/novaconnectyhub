import type { MetaSocialChannel } from "./social-agent-policy";

export type CommentAutomation = {
  id: string;
  name: string;
  enabled: boolean;
  platform: "instagram" | "facebook";
  trigger: "keyword" | "any_comment";
  keywords: string[];
  postIds: string[];
  action: "private_message" | "public_ai";
  text: string;
  buttonTitle: string;
  buttonUrl: string;
  continueWithAgent: boolean;
  requireApproval: boolean;
};
export type SocialFollowUp = {
  enabled: boolean;
  platform: "instagram" | "facebook" | "both";
  delayMinutes: number;
  instruction: string;
  requireApproval: boolean;
};
export type SocialAutomationsConfig = {
  version: 1;
  rules: CommentAutomation[];
  followUp?: SocialFollowUp;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, length: number) =>
  typeof value === "string" ? value.trim().slice(0, length) : "";
export function normalizeSocialAutomations(
  value: unknown,
): SocialAutomationsConfig {
  const raw = record(value);
  const seen = new Set<string>();
  const rules = (Array.isArray(raw.rules) ? raw.rules : [])
    .slice(0, 20)
    .map((value) => {
      const item = record(value);
      const id = text(item.id, 80);
      if (!id || seen.has(id))
        throw new Error("Cada automação precisa de uma identificação única.");
      seen.add(id);
      const buttonUrl = text(item.buttonUrl, 2048);
      if (buttonUrl) {
        let valid = false;
        try {
          const url = new URL(buttonUrl);
          valid = url.protocol === "https:" && !url.username && !url.password;
        } catch {}
        if (!valid)
          throw new Error("O botão precisa de um endereço HTTPS válido.");
      }
      const rule: CommentAutomation = {
        id,
        name: text(item.name, 80),
        enabled: item.enabled === true,
        platform: item.platform === "facebook" ? "facebook" : "instagram",
        trigger: item.trigger === "any_comment" ? "any_comment" : "keyword",
        keywords: (Array.isArray(item.keywords) ? item.keywords : [])
          .map((value) => text(value, 80))
          .filter(Boolean)
          .slice(0, 20),
        postIds: (Array.isArray(item.postIds) ? item.postIds : [])
          .map((value) => text(value, 100))
          .filter(Boolean)
          .slice(0, 50),
        action: item.action === "public_ai" ? "public_ai" : "private_message",
        text: text(item.text, 1000),
        buttonTitle: text(item.buttonTitle, 20),
        buttonUrl,
        continueWithAgent: item.continueWithAgent === true,
        requireApproval: item.requireApproval !== false,
      };
      if (
        rule.enabled &&
        (!rule.name ||
          (rule.trigger === "keyword" && !rule.keywords.length) ||
          (rule.action === "private_message" && !rule.text))
      )
        throw new Error("Preencha nome, gatilho e mensagem antes de ativar.");
      if (rule.buttonUrl && rule.text.length > 640)
        throw new Error("Mensagem com botão deve ter até 640 caracteres.");
      if (Boolean(rule.buttonTitle) !== Boolean(buttonUrl))
        throw new Error("Preencha o nome e o endereço do botão.");
      if (rule.action === "public_ai") {
        rule.buttonTitle = "";
        rule.buttonUrl = "";
        rule.continueWithAgent = false;
      }
      return rule;
    });
  const follow = record(raw.followUp);
  const followUp: SocialFollowUp = {
    enabled: follow.enabled === true,
    platform:
      follow.platform === "facebook" || follow.platform === "instagram"
        ? follow.platform
        : "both",
    delayMinutes: Math.max(
      15,
      Math.min(1200, Math.round(Number(follow.delayMinutes) || 60)),
    ),
    instruction:
      text(follow.instruction, 800) ||
      "Retome a necessidade que ficou pendente, com uma pergunta breve e útil. Não insista se o contato encerrou a conversa.",
    requireApproval: follow.requireApproval !== false,
  };
  return { version: 1, rules, followUp };
}
export function matchCommentAutomation(
  config: unknown,
  input: {
    channel: MetaSocialChannel;
    text: string | null;
    postId: string | null;
  },
) {
  if (!input.channel.endsWith("comments")) return null;
  const normalizedText = fold(input.text || "");
  const matches = normalizeSocialAutomations(config).rules.filter(
    (rule) =>
      rule.enabled &&
      input.channel.startsWith(rule.platform) &&
      (!rule.postIds.length ||
        Boolean(input.postId && rule.postIds.includes(input.postId))) &&
      (rule.trigger === "any_comment" ||
        rule.keywords.some((keyword) => {
          const needle = fold(keyword);
          if (!needle) return false;
          for (
            let index = normalizedText.indexOf(needle);
            index >= 0;
            index = normalizedText.indexOf(needle, index + 1)
          ) {
            const before = normalizedText[index - 1] || " ";
            const after = normalizedText[index + needle.length] || " ";
            if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after))
              return true;
          }
          return false;
        })),
  );
  return (
    matches.sort(
      (a, b) =>
        Number(b.trigger === "keyword") - Number(a.trigger === "keyword") ||
        Number(b.postIds.length > 0) - Number(a.postIds.length > 0),
    )[0] ?? null
  );
}
function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
export function isSocialOptOut(value: string | null) {
  return /\b(parar|pare|sair|remover|descadastrar|cancelar inscricao|nao quero receber|nao me mande|nao enviar|stop|unsubscribe)\b/.test(
    fold(value || ""),
  );
}
export function commentAutomationChannel(
  rule: CommentAutomation,
): MetaSocialChannel {
  return rule.platform === "instagram"
    ? "instagram_comments"
    : "facebook_comments";
}
export function commentAutomationChannelConfig(rule: CommentAutomation) {
  return {
    enabled: true,
    mode: "public" as const,
    autoReply: !rule.requireApproval,
    requiresHumanApproval: rule.requireApproval,
    allowPublicReplies: rule.action === "public_ai",
    allowPrivateReplies: rule.action === "private_message",
  };
}

export function storedCommentAutomation(
  value: unknown,
): CommentAutomation | null {
  if (!value) return null;
  return normalizeSocialAutomations({ rules: [value] }).rules[0] ?? null;
}
