import { activityPresets } from "../whatsapp/activity-presets";
import { activityAnswerOptions } from "./activity-answer-options";
import { defaultLeadQualificationQuestions, qualificationOptions, type LeadQualificationConfig } from "./qualification";

// Reviewed onboarding examples, shared by the internal-agent seed and legacy backfill.
const onboarding: Record<string, { question: string; choices: Array<[string, number]> }> = {
  business_offer: { question: "O que você quer vender pelo WhatsApp hoje: produto, servico, delivery, curso, mentoria ou outra coisa?", choices: [["Já defini o produto, serviço ou conteúdo que quero oferecer", 1], ["Tenho uma ideia e preciso organizar minha oferta", .5], ["Ainda não tenho uma oferta e estou apenas conhecendo", .15]] },
  has_product: { question: "Você ja tem produto/servico proprio ou quer comecar importando produtos da ConnectyHub por comissao?", choices: [["Já tenho meu próprio produto ou serviço", 1], ["Quero começar com produtos por comissão", .8], ["Ainda não decidi como começar", .3]] },
  clone_person: { question: "Quem seria a pessoa clonada no seu atendimento: você, um vendedor, um fundador ou alguem da equipe?", choices: [["Eu mesmo vou representar o atendimento", 1], ["Uma pessoa da equipe, com autorização dela", 1], ["Ainda vou definir quem representa o atendimento", .3]] },
  whatsapp_context: { question: "Esse atendimento vai rodar em um WhatsApp comercial seu ou você ainda vai separar um numero para isso?", choices: [["Já tenho um número comercial para conectar", 1], ["Vou separar um número para esse atendimento", .6], ["Ainda não sei qual número vou usar", .2]] },
  owner_notification_phone: { question: "Qual numero da equipe deve receber aviso quando sair venda, lead quente ou pedido de humano?", choices: [["Informei o número do responsável que deve receber os avisos", 1], ["Sei quem será o responsável, mas vou confirmar o número", .5], ["Ainda não defini o responsável pelos avisos", .2]] },
  main_objection: { question: "O que mais te deixa em duvida antes de colocar um clone vendendo no WhatsApp?", choices: [["Não tenho mais dúvidas e quero começar", 1], ["Quero esclarecer custo, funcionamento ou configuração", .5], ["Não quero seguir com a plataforma neste momento", 0]] },
  urgency: { question: "Você quer testar isso agora, ainda hoje, essa semana ou está só entendendo a ideia?", choices: [["Quero testar agora ou ainda hoje", 1], ["Quero testar durante esta semana", .65], ["Estou apenas entendendo a ideia, sem prazo", .2]] },
  next_step: { question: "Se fizer sentido, você prefere que eu te guie criando o agente agora ou quer ver uma demonstracao primeiro?", choices: [["Quero criar e configurar meu agente agora", 1], ["Quero ver uma demonstração primeiro", .7], ["Prefiro pensar e retomar depois", .2]] },
};

export function onboardingAnswerOptions(id: string, maximum: number) {
  return onboarding[id] ? qualificationOptions(onboarding[id].choices.map(([label, ratio]) => [label, Math.round(maximum * ratio)])) : undefined;
}

function canonicalQuestion(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\bvc\b/g, "voce").replace(/\bpra\b/g, "para").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Only legacy absence is seeded. An authored option list (including []) is never reset. */
export function fillMissingQualificationAnswers(config: LeadQualificationConfig, templateId: string): LeadQualificationConfig {
  return { ...config, questions: config.questions.map(question => {
    if (question.options !== undefined) return question;
    const text = canonicalQuestion(question.question);
    const internal = onboarding[question.id];
    if (internal && canonicalQuestion(internal.question) === text) {
      return { ...question, options: onboardingAnswerOptions(question.id, question.weight) };
    }
    const generic = defaultLeadQualificationQuestions.find(item => canonicalQuestion(item.question) === text);
    if (generic) return { ...question, options: qualificationOptions(generic.options!.map(option => [option.label, Math.round(question.weight * option.points / generic.weight), option.disqualifies])) };
    const entries = Object.entries(activityPresets);
    const profiles = [...entries.filter(([id]) => id === templateId), ...entries.filter(([id]) => id !== templateId)];
    for (const [id, profile] of profiles) {
      const matching = profile.questions.find(([, , prompt]) => canonicalQuestion(prompt) === text);
      if (matching) return { ...question, options: activityAnswerOptions(id, matching[0], matching[1], question.weight) };
    }
    if (text === canonicalQuestion("Ficou alguma dúvida sobre o próximo passo?")) {
      return { ...question, options: activityAnswerOptions(templateId, "objection", question.label, question.weight) };
    }
    return question;
  }) };
}
