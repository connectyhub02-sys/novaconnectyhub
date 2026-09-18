import { defaultLeadQualificationConfig, qualificationOptions, type LeadQualificationConfig } from "./qualification";

/** Custom intake rubric requested by the account owner; not an authorization to sell or medical advice. */
export function createProfessionalGuidanceQualification(): LeadQualificationConfig {
  const rows: Array<[string, string, string, Array<[string, number, boolean?]>]> = [
    ["interest_reason", "Motivo do interesse", "Qual é o principal motivo do seu interesse?", [
      ["Tratamento/indicação médica", 15], ["Recuperação acompanhada por profissional", 10], ["Performance esportiva", 5], ["Estética/ganho de massa", 3]]],
    ["previous_use", "Uso anterior", "Você já utilizou algum tipo de esteroide anabolizante anteriormente?", [
      ["Nunca utilizou", 5], ["Já utilizou com acompanhamento", 10], ["Utiliza atualmente com acompanhamento", 10], ["Utiliza sem acompanhamento", 0]]],
    ["referral", "Indicação", "Seu interesse surgiu por indicação de quem?", [
      ["Médico", 15], ["Outro profissional de saúde habilitado", 10], ["Personal trainer", 3], ["Amigos", 0], ["Influenciadores/redes sociais", 0]]],
    ["medical_follow_up", "Acompanhamento", "Você possui acompanhamento médico relacionado ao uso dessas substâncias?", [
      ["Sim", 20], ["Vai iniciar acompanhamento", 8], ["Não", 0]]],
    ["prescription", "Prescrição", "Você possui prescrição médica válida para o produto que procura, quando exigida?", [
      ["Sim", 25], ["Está aguardando consulta/prescrição", 8], ["Não", 0]]],
    ["main_concern", "Principal preocupação", "O que você considera mais importante ao procurar esse tipo de produto?", [
      ["Segurança", 5], ["Procedência", 5], ["Orientação profissional", 5], ["Preço", 1], ["Resultado rápido", 0]]],
    ["professional_evaluation", "Avaliação profissional", "Você estaria disposto a passar por avaliação profissional antes de utilizar qualquer substância?", [
      ["Sim", 10], ["Talvez", 3], ["Não", 0]]],
    ["current_stage", "Estágio atual", "Em que estágio você está?", [
      ["Possui prescrição e procura canal autorizado", 10], ["Procura orientação profissional", 8], ["Apenas pesquisando", 3], ["Procura acesso sem receita", 0, true]]],
  ];
  return { ...defaultLeadQualificationConfig, customized: true, productName: "Atendimento com orientação profissional",
    commercialObjective: "Identificar contexto, acompanhamento e estágio declarado para orientar o atendimento e o encaminhamento ao responsável. A pontuação não autoriza fornecimento nem substitui avaliação profissional ou verificação de documentos.",
    maxQuestionsPerConversation: 8, questions: rows.map(([id, label, question, options]) => ({
      id: `guidance_${id}`, crmField: `guidance_${id}`, label, question, required: true,
      weight: Math.max(...options.map(option => option[1])), options: qualificationOptions(options),
    })), disqualifiers: [], handoffRules: [
      "Procura de acesso sem receita desqualifica o avanço comercial e deve ser encaminhada ao responsável.",
      "Declaração de prescrição não equivale a documento verificado. Encaminhe a verificação e os requisitos de atendimento ao responsável.",
      "Não prescreva substâncias, doses, ciclos ou tratamento. Encaminhe dúvidas sobre uso, segurança e acompanhamento a profissional habilitado.",
    ] };
}
