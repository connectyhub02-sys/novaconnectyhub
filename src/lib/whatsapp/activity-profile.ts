import { activityPresets, type AgentActivityId } from "./activity-presets";

export type ProfessionalIdentity = { name: string; registration: string; state: string; showPublic: boolean };
export const professionalRegisters: Partial<Record<AgentActivityId, string>> = {
  corretor_imoveis: "CRECI", imobiliaria: "CRECI", advogado: "OAB", escritorio_advocacia: "OAB",
  dentista: "CRO", clinica_odontologica: "CRO", contador: "CRC", escritorio_contabilidade: "CRC",
  arquiteto: "CAU", escritorio_arquitetura: "CAU", personal_trainer: "CREF", corretor_seguros: "SUSEP", corretora_seguros: "SUSEP",
};
const retailActivities = new Set<AgentActivityId>(["generic_sales", "pizzaria_delivery", "restaurante_lanchonete", "farmacia", "moda_varejo", "academia_suplementos", "educacao_cursos", "autopecas", "ecommerce", "loja_suplementos"]);
export function activityDefaultDestination(id: AgentActivityId) {
  return retailActivities.has(id) ? "connectyhub_checkout" as const : "appointment" as const;
}
export function activityAppointmentLabel(id: AgentActivityId) {
  if (id === "corretor_imoveis" || id === "imobiliaria") return "Agendar visita";
  if (id === "revenda_veiculos") return "Agendar test-drive";
  if (["dentista", "clinica_odontologica", "esteticista", "estetica_clinica"].includes(id)) return "Agendar avaliação";
  if (["advogado", "escritorio_advocacia", "contador", "escritorio_contabilidade", "arquiteto", "escritorio_arquitetura"].includes(id)) return "Agendar reunião";
  return "Agendar atendimento";
}
export function normalizeProfessionalIdentity(value: unknown): ProfessionalIdentity | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string, length: number) => typeof record[key] === "string" ? record[key].trim().slice(0, length) : "";
  return { name: text("name", 120), registration: text("registration", 80), state: text("state", 2).toUpperCase(), showPublic: record.showPublic === true };
}
export function activityRepresentation(id: AgentActivityId) {
  const preset = activityPresets[id];
  return preset.kind === "professional"
    ? `Atendimento individual de ${preset.label.toLocaleLowerCase("pt-BR")}, vinculado ao profissional titular. Conduza a conversa de forma direta, com os serviços e a agenda desse titular. Não se apresente como recepção de uma empresa nem invente outro profissional para repassar o cliente. Ao propor agenda, diga que pode consultar os horários desse atendimento. Não atribua ao software identidade humana, credencial própria ou presença em uma visita; seja transparente quando perguntarem quem atende.`
    : preset.identity;
}
const individualNextSteps: Partial<Record<AgentActivityId, { closing: string; example: string }>> = {
  corretor_imoveis: { closing: "Retome o imóvel escolhido e ofereça consultar horários para uma visita. Converse diretamente sobre as preferências e a proposta; decisões presenciais e negociais dependem do titular.", example: "Você procura um imóvel para morar ou investir? Em qual região? Faça uma pergunta por vez." },
  advogado: { closing: "Organize a consulta sobre o assunto informado e apresente os horários disponíveis, sem fechar parecer ou prometer resultado.", example: "É uma primeira consulta ou você quer continuar um assunto já em atendimento?" },
  contador: { closing: "Resuma a atividade da empresa e o serviço contábil necessário; combine a conversa para definir escopo e documentos.", example: "Você precisa de apoio para uma empresa em atividade ou pretende abrir uma empresa?" },
  dentista: { closing: "Ofereça horários para consulta ou avaliação conforme o motivo informado. Não confirme tratamento antes de avaliação clínica.", example: "Você procura uma primeira consulta ou um retorno?" },
  esteticista: { closing: "Retome o objetivo estético e ofereça avaliação ou sessão adequada ao serviço já cadastrado, sem impor pacote.", example: "Qual cuidado você procura e já fez esse atendimento antes? Faça uma pergunta por vez." },
  personal_trainer: { closing: "Combine avaliação inicial e formato do acompanhamento conforme objetivo e disponibilidade; não prescreva exercícios pelo chat.", example: "Qual é seu objetivo com o acompanhamento e prefere presencial ou remoto? Faça uma pergunta por vez." },
  professor_particular: { closing: "Combine uma aula inicial conforme disciplina, nível e disponibilidade; não ofereça turmas ou certificados inexistentes.", example: "Qual matéria você quer estudar e em que nível está? Faça uma pergunta por vez." },
  arquiteto: { closing: "Resuma espaço, prioridades e escopo para uma reunião de briefing; análise técnica e proposta final dependem do titular.", example: "Você está pensando em reforma, construção ou projeto de interiores?" },
  eletricista: { closing: "Registre necessidade e região e consulte uma janela de visita técnica, sem orientar intervenções perigosas.", example: "O atendimento é para instalação, manutenção ou uma falha elétrica?" },
  encanador: { closing: "Resuma o problema hidráulico e o local e combine uma visita para avaliação, sem diagnóstico ou preço definitivo por suposição.", example: "É um vazamento, entupimento ou instalação?" },
  tecnico_ar_condicionado: { closing: "Confira equipamento, serviço e região e ofereça uma janela de atendimento técnico; peças e orçamento dependem da avaliação.", example: "Você procura instalação, limpeza ou reparo do ar-condicionado?" },
  corretor_seguros: { closing: "Organize a cotação conforme bem e proteção desejada e combine a análise das opções; proposta não significa apólice emitida.", example: "Qual bem ou tipo de proteção você quer cotar?" },
};
export function activityClosing(id: AgentActivityId) { return individualNextSteps[id]?.closing ?? activityPresets[id].closing; }
export function activityExample(id: AgentActivityId) { return individualNextSteps[id]?.example ?? activityPresets[id].example; }
export function buildActivityProfileInstruction(id: AgentActivityId, identity?: ProfessionalIdentity) {
  const preset = activityPresets[id];
  const register = professionalRegisters[id];
  return [
    "PERFIL DE ATENDIMENTO DA ATIVIDADE:", activityRepresentation(id),
    `Atividade: ${preset.label}. Objetivo: ${preset.objective}.`,
    `Vocabulário: ${preset.vocabulary}`,
    ...preset.playbook,
    `Próximo passo habitual: ${activityClosing(id)}`,
    `Exemplo de abordagem: ${activityExample(id)}`,
    `Cuidados: ${preset.care}`,
    ...(identity?.name ? [`Titular cadastrado: ${identity.name}.`] : []),
    ...(register && identity?.registration ? [`Registro informado pelo titular: ${register} ${identity.registration}${identity.state ? ` / ${identity.state}` : ""}. Não alegue verificação automática desse registro.`] : []),
    "A ação salva de cada item define venda, agenda ou site externo. Preço é informação, não consentimento de compra. Sem item de venda explicitamente escolhido, não use carrinho, pedido ou pagamento para uma consulta, visita, reunião ou orçamento.",
    "Preserve o item atual e interprete um aceite pela pergunta mais recente. Aceitar fotos ou disponibilidade de agenda não confirma compra.",
  ];
}
