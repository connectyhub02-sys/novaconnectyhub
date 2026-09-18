import { qualificationOptions } from "./qualification";

type Choice = [label: string, proportion: number];
const choices: Record<string, Choice[]> = {
  need: [["Demanda definida e relacionada ao negócio", 1], ["Quer orientação para definir a demanda", .5], ["Demanda fora da atuação do negócio", 0]],
  context: [["Sabe o que precisa e quer prosseguir", 1], ["Precisa comparar alternativas", .5], ["Apenas curiosidade, sem demanda", .1]],
  timeframe: [["Hoje ou nos próximos dias", 1], ["Data futura definida", .6], ["Pesquisando, sem prazo", .2]],
  urgency: [["Precisa de atendimento agora", 1], ["Tem prazo definido", .7], ["Sem prazo, apenas consultando", .2]],
  deadline: [["Há uma data ou prazo informado", 1], ["Não há prazo e quer atendimento", .8], ["Ainda precisa confirmar a data", .3]],
  timing: [["Data definida e quer consultar disponibilidade", 1], ["É flexível e quer agendar", .8], ["Ainda não pretende agendar", .2]],
  availability: [["Informou dias ou períodos disponíveis", 1], ["Horário flexível e quer agendar", .8], ["Ainda precisa organizar a disponibilidade", .3]],
  routine: [["Informou dias e períodos para acompanhamento", 1], ["Quer ajuda para organizar uma rotina", .5], ["Ainda não tem disponibilidade", .1]],
  delivery: [["Prefere entrega e quer verificar condições", 1], ["Prefere retirada", 1], ["Ainda está decidindo", .3]],
  unit: [["Escolheu uma unidade ou profissional", 1], ["Sem preferência e aceita consultar opções", .8], ["Não sabe qual unidade poderá atender", .3]],
  location: [["Informou o local do serviço", 1], ["Ainda precisa confirmar o local", .4], ["Não pretende informar o local", 0]],
  region: [["Definiu uma região", 1], ["Considera várias regiões", .8], ["Ainda não definiu", .3]],
  budget: [["Informou uma faixa de investimento", 1], ["Quer conhecer preços para definir a faixa", .5], ["Não tem intenção de investir neste momento", .1]],
  relationship: [["Já é cliente e precisa de atendimento", 1], ["Primeiro contato e quer contratar ou agendar", 1], ["Apenas pesquisando o atendimento", .3]],
  visit: [["Primeira consulta ou avaliação", 1], ["Retorno ou acompanhamento", 1], ["Somente informações, sem intenção de agendar", .3]],
  profile: [["Pessoa física", 1], ["MEI", 1], ["Empresa", 1], ["Ainda precisa definir para quem é o atendimento", .2]],
  level: [["Está começando", .8], ["Já tem experiência ou nível definido", 1], ["Precisa avaliar o nível", .5]],
  objection: [["Sem dúvidas e quer prosseguir", 1], ["Tem dúvidas ou condições a esclarecer", .5], ["Não quer prosseguir neste momento", 0]],
  size: [["Tamanho ou numeração definidos", 1], ["Quer ajuda para escolher o tamanho", .5], ["Apenas pesquisando, sem preferência", .2]],
  preference: [["Modelo, marca ou preferência definidos", 1], ["Quer comparar opções", .6], ["Sem preferência, apenas pesquisando", .2]],
  product: [["Produto ou categoria definidos", 1], ["Precisa de orientação para identificar o produto", .5], ["Produto fora da oferta conhecida do negócio", 0]],
  service: [["Serviço pretendido definido", 1], ["Precisa de avaliação para definir o serviço", .7], ["Somente informações gerais", .2]],
};

const specific: Record<string, Record<string, Choice[]>> = {
  pizzaria_delivery: { size: [["Pequena", 1], ["Média", 1], ["Grande ou família", 1], ["Quer ajuda para escolher", .5]], flavors: [["Sabores escolhidos", 1], ["Quer ver o cardápio ou recomendações", .5], ["Ainda não pretende pedir", .1]] },
  restaurante_lanchonete: { meal: [["Prato ou lanche escolhido", 1], ["Quer conhecer o cardápio", .5], ["Apenas consultando", .2]], options: [["Informou adicionais ou observações", 1], ["Sem adicionais ou observações", 1], ["Ainda está decidindo", .4]] },
  farmacia: { presentation: [["Apresentação ou embalagem definida", 1], ["Precisa confirmar a apresentação com profissional", .5], ["Não sabe e quer orientação do farmacêutico", .5]] },
  moda_varejo: { occasion: [["Ocasião específica definida", 1], ["Uso no dia a dia", .8], ["Somente pesquisando modelos", .3]] },
  estetica_clinica: { interest: [["Quer avaliação de um cuidado específico", 1], ["Quer orientação sobre opções", .7], ["Apenas pesquisando", .3]] },
  academia_suplementos: { goal: [["Quer musculação", 1], ["Quer aulas ou outra modalidade", 1], ["Quer conhecer as modalidades antes de escolher", .6], ["Apenas pesquisando", .2]] },
  educacao_cursos: { goal: [["Objetivo de aprendizagem definido", 1], ["Quer orientação para escolher um curso", .6], ["Apenas conhecendo a oferta", .2]] },
  imobiliaria: { purpose: [["Comprar", 1], ["Alugar", 1], ["Anunciar um imóvel", 1], ["Apenas pesquisando", .3]], property: [["Tipo e características definidos", 1], ["Aceita sugestões para definir o perfil", .6], ["Ainda não definiu o que procura", .2]] },
  corretor_imoveis: { purpose: [["Encontrar um imóvel", 1], ["Anunciar ou conversar sobre imóvel próprio", 1], ["Apenas pesquisando", .3]] },
  autopecas: { part: [["Peça ou código identificado", 1], ["Precisa de ajuda para identificar a peça", .6], ["Ainda não sabe qual peça precisa", .2]], vehicle: [["Modelo e ano informados", 1], ["Informou somente parte dos dados", .5], ["Não sabe os dados do veículo", .1]], engine: [["Motorização ou versão informada", 1], ["Vai confirmar os dados", .5], ["Não sabe e precisa de ajuda", .3]] },
  ecommerce: { intent: [["Quer comprar ou escolher produto", 1], ["Precisa de suporte para pedido existente", .8], ["Apenas pesquisando", .3]], reference: [["Produto ou pedido identificado", 1], ["Precisa de ajuda para localizar", .5], ["Sem produto ou pedido em mente", .1]], delivery: [["Cidade ou CEP de destino informado", 1], ["Ainda precisa confirmar o destino", .4], ["Não quer consultar entrega", .1]] },
  advogado: { subject: [["Assunto definido para primeira conversa", 1], ["Precisa de orientação para explicar a demanda", .6], ["Somente informações gerais", .2]] },
  escritorio_advocacia: { area: [["Área ou assunto da demanda informado", 1], ["Precisa de triagem para identificar a área", .6], ["Somente informações gerais", .2]] },
  contador: { service: [["Declaração", 1], ["Regularização", 1], ["Abertura", 1], ["Outro serviço definido", .8], ["Ainda precisa de orientação", .4]], period: [["Período ou prazo definido", 1], ["Precisa confirmar o período", .5], ["Consulta geral sem período específico", .2]] },
  escritorio_contabilidade: { service: [["Abertura de empresa", 1], ["Troca de contabilidade", 1], ["Rotina de cliente atual", 1], ["Apenas pesquisando", .3]], business: [["Atividade e demanda da empresa informadas", 1], ["Informou apenas a atividade ou demanda", .5], ["Ainda definindo o negócio", .3]] },
  dentista: { reason: [["Motivo do atendimento definido", 1], ["Quer avaliação geral", 1], ["Apenas consultando serviços", .3]] },
  esteticista: { care: [["Cuidado de interesse definido", 1], ["Quer avaliação para escolher um cuidado", .8], ["Apenas pesquisando", .3]] },
  personal_trainer: { goal: [["Objetivo definido e busca acompanhamento", 1], ["Quer avaliação para definir o objetivo", .8], ["Apenas pesquisando", .3]], format: [["Presencial", 1], ["Online", 1], ["Quer comparar os formatos", .5]] },
  professor_particular: { subject: [["Matéria ou conteúdo definido", 1], ["Quer ajuda para identificar dificuldades", .7], ["Ainda não definiu o conteúdo", .3]], goal: [["Acompanhamento contínuo", 1], ["Avaliação específica", 1], ["Ainda decidindo se precisa de aulas", .3]] },
  arquiteto: { scope: [["Projeto novo", 1], ["Reforma", 1], ["Interiores", 1], ["Precisa definir o escopo", .5]], space: [["Tipo de espaço e área aproximada informados", 1], ["Tipo informado, área a confirmar", .6], ["Ainda não definiu o espaço", .2]] },
  escritorio_arquitetura: { use: [["Residencial", 1], ["Comercial", 1], ["Uso misto", 1], ["Ainda não definido", .3]], scope: [["Projeto", 1], ["Interiores", 1], ["Acompanhamento de obra", 1], ["Quer orientação para definir", .5]] },
  eletricista: { service: [["Instalação nova", 1], ["Problema elétrico que apareceu", 1], ["Somente orçamento exploratório", .4]], description: [["Descreveu a ocorrência", 1], ["Não sabe descrever e solicita avaliação", .7], ["Ainda não tem uma ocorrência específica", .2]] },
  encanador: { issue: [["Vazamento", 1], ["Entupimento", 1], ["Instalação", 1], ["Não sabe e solicita avaliação", .6]], point: [["Ponto afetado identificado", 1], ["Não sabe identificar e quer avaliação", .6], ["Consulta geral", .2]] },
  tecnico_ar_condicionado: { service: [["Instalação", 1], ["Limpeza", 1], ["Reparo", 1], ["Ainda definindo o serviço", .5]], equipment: [["Identificou aparelhos e quantidade", 1], ["Informou apenas parte dos dados", .6], ["Vai verificar os equipamentos", .3]] },
  corretor_seguros: { intent: [["Cotação", 1], ["Renovação", 1], ["Atendimento de seguro atual", 1], ["Apenas pesquisando", .3]], insurance: [["Tipo de seguro definido", 1], ["Quer orientação sobre coberturas", .6], ["Ainda não sabe qual seguro procura", .3]] },
  corretora_seguros: { intent: [["Cotação", 1], ["Renovação", 1], ["Atendimento de apólice", 1], ["Apenas pesquisando", .3]], profile: [["Seguro pessoal", 1], ["Seguro empresarial", 1], ["Ainda definindo", .3]] },
  oficina_mecanica: { vehicle: [["Modelo e ano informados", 1], ["Informou parte dos dados", .5], ["Precisa confirmar os dados", .3]], service: [["Revisão", 1], ["Avaliação de um problema", 1], ["Apenas pesquisando serviços", .3]] },
  revenda_veiculos: { trade: [["Sim, tem veículo para avaliar na troca", 1], ["Não, pretende comprar sem troca", 1], ["Ainda decidindo", .4]] },
};

/** Equal points for equally useful choices; personal/clinical characteristics do not rank people. */
export function activityAnswerOptions(templateId: string, questionId: string, label: string, maximum: number) {
  const options = specific[templateId]?.[questionId] ?? choices[questionId] ?? [
    [`${label}: preferência ou necessidade definida`, 1],
    [`${label}: precisa de orientação para decidir`, .5],
    [`${label}: apenas pesquisando, sem definição`, .2],
  ] satisfies Choice[];
  const grouped = new Map<number, string[]>();
  for (const [text, proportion] of options) grouped.set(proportion, [...(grouped.get(proportion) ?? []), text]);
  const three: Choice[] = Array.from(grouped, ([points, labels]) => [labels.join(" / "), points]);
  if (three.length < 3 && !grouped.has(.5)) three.push(["Precisa de orientação ou esclarecimento antes de decidir", .5]);
  if (three.length < 3) three.push(["Não deseja prosseguir com esse atendimento", 0]);
  return qualificationOptions(three.slice(0, 3).map(([text, proportion]) => [text, Math.round(maximum * proportion)]));
}
