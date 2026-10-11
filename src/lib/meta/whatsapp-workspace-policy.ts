import { officialPhone, variableCount } from "./whatsapp-policy";

export const officialTemplatePresets = [
  {
    name: "novidades_e_ofertas",
    title: "Novidades e ofertas",
    category: "MARKETING",
    text: "Olá! Temos novidades para você. Quer receber mais informações? Para não receber novas mensagens, responda SAIR.",
    buttons: ["Quero conhecer", "Falar com atendente", "SAIR"],
  },
  {
    name: "confirmacao_de_pedido",
    title: "Confirmação de pedido",
    category: "UTILITY",
    text: "Recebemos seu pedido e estamos preparando os próximos passos. Se precisar de ajuda com esta compra, fale com nossa equipe.",
    buttons: ["Preciso de ajuda"],
  },
  {
    name: "lembrete_de_agendamento",
    title: "Lembrete de agendamento",
    category: "UTILITY",
    text: "Olá! Este é um lembrete do seu agendamento conosco. Podemos confirmar sua presença?",
    buttons: ["Confirmar", "Remarcar"],
  },
  {
    name: "retorno_solicitado",
    title: "Retorno solicitado",
    category: "MARKETING",
    text: "Olá! Estamos retornando seu pedido de informações. Podemos continuar por aqui? Para não receber novas mensagens, responda SAIR.",
    buttons: ["Continuar", "SAIR"],
  },
] as const;

export type OfficialTemplate = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: Array<{
    type: string;
    format?: string;
    text?: string;
    buttons?: Array<{
      type: string;
      text: string;
      url?: string;
      phone_number?: string;
    }>;
  }>;
};
export function templateParameters(
  template: OfficialTemplate,
  values: unknown,
) {
  if (
    template.components.some(
      (c) =>
        !["BODY", "FOOTER", "HEADER", "BUTTONS"].includes(c.type) ||
        (c.type === "HEADER" && c.format !== "TEXT") ||
        (c.type === "BUTTONS" &&
          c.buttons?.some((b) => b.type !== "QUICK_REPLY")) ||
        (c.type !== "BODY" && /\{\{/.test(c.text || "")),
    )
  )
    throw new Error(
      "Este modelo usa mídia, botão de link ou outro componente ainda não suportado no envio de campanhas. Use texto e respostas rápidas.",
    );
  const text = template.components.find((c) => c.type === "BODY")?.text || "";
  const count = variableCount(text);
  const params = Array.isArray(values) ? values : [];
  if (
    params.length !== count ||
    params.some(
      (v) =>
        typeof v !== "string" ||
        !v.trim() ||
        v.length > 500 ||
        /[\r\n]/.test(v),
    )
  )
    throw new Error(`Preencha os ${count} valores das variáveis do modelo.`);
  return {
    text: text.replace(/\{\{(\d+)\}\}/g, (_, n) =>
      String(params[Number(n) - 1]),
    ),
    components: [
      ...(count
        ? [
            {
              type: "body",
              parameters: params.map((text) => ({ type: "text", text })),
            },
          ]
        : []),
      ...(
        template.components.find((c) => c.type === "BUTTONS")?.buttons ?? []
      ).map((button, index) => ({
        type: "button",
        sub_type: "quick_reply",
        index: String(index),
        parameters: [{ type: "payload", payload: button.text }],
      })),
    ],
  };
}
export function campaignPhones(value: unknown) {
  if (typeof value !== "string" || value.length > 300000)
    throw new Error("Importe até 10.000 telefones.");
  const rows = value
    .split(/[\n;,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  if (!rows.length || rows.length > 10000)
    throw new Error("Informe entre 1 e 10.000 telefones com DDI e DDD.");
  return [...new Set(rows.map(officialPhone))];
}
export function replyButtons(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 3 ||
    value.some(
      (v) => typeof v !== "string" || !v.trim() || v.trim().length > 20,
    )
  )
    throw new Error("Use de 1 a 3 botões com até 20 caracteres.");
  const buttons = value.map((v) => (v as string).trim());
  if (new Set(buttons).size !== buttons.length)
    throw new Error("Cada botão precisa de um texto diferente.");
  return buttons.map((title, i) => ({
    type: "reply",
    reply: { id: `reply_${i + 1}`, title },
  }));
}

export { variableCount } from "./whatsapp-policy";
