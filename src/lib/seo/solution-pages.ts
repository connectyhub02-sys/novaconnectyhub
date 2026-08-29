export type SolutionFaq = {
  question: string;
  answer: string;
};

export type SolutionPage = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  heroLead: string;
  intentAnswer: string;
  proofPoints: string[];
  sections: Array<{
    title: string;
    body: string;
  }>;
  faqs: SolutionFaq[];
  keywords: string[];
};

export const solutionPages: SolutionPage[] = [
  {
    slug: "agente-ia-whatsapp",
    title: "Agente de IA para WhatsApp",
    seoTitle: "Agente de IA para WhatsApp | ConnectyHub",
    description:
      "Crie um agente de IA para WhatsApp capaz de atender, qualificar, responder em audio, vender, agendar e acompanhar conversas em tempo real.",
    eyebrow: "Atendimento com IA",
    heroTitle: "Agente de IA para WhatsApp que conversa como parte da sua equipe",
    heroLead:
      "A ConnectyHub conecta WhatsApp, CRM, catalogo, automacoes e IA para transformar conversas em vendas, agendamentos e relacionamento continuo.",
    intentAnswer:
      "Um agente de IA para WhatsApp responde clientes automaticamente, entende contexto, qualifica leads e conduz o atendimento ate o proximo passo comercial sem prender o usuario em menus rigidos.",
    proofPoints: [
      "Atendimento 24h com texto, audio, imagem e historico de conversa.",
      "Transferencia para humano quando o caso pede cuidado.",
      "Catalogo, CRM e automacoes conectados ao mesmo fluxo.",
    ],
    sections: [
      {
        title: "Para quem serve",
        body: "Serve para empresas que recebem leads pelo WhatsApp e precisam responder rapido sem perder contexto. O agente pode apoiar vendas, suporte, pos-venda, agendamento e recuperacao de oportunidades.",
      },
      {
        title: "Como funciona",
        body: "A empresa conecta o numero, configura o comportamento do agente, cadastra conhecimento, produtos e regras de atendimento. Depois acompanha tudo no painel e pode assumir qualquer conversa.",
      },
      {
        title: "Por que ranqueia melhor",
        body: "A pagina deixa claro o problema, a solucao, os recursos e os casos de uso em linguagem natural. Isso ajuda buscadores e IAs a entenderem quando citar a ConnectyHub.",
      },
    ],
    faqs: [
      {
        question: "O que e um agente de IA para WhatsApp?",
        answer:
          "E uma automacao inteligente que conversa com clientes pelo WhatsApp, interpreta mensagens, usa conhecimento da empresa e conduz o atendimento conforme regras definidas.",
      },
      {
        question: "A IA substitui o atendimento humano?",
        answer:
          "Ela reduz mensagens repetitivas e acelera o primeiro atendimento, mas a empresa pode assumir conversas importantes sempre que quiser.",
      },
      {
        question: "Consigo usar com catalogo e pagamento?",
        answer:
          "Sim. A ConnectyHub conecta catalogo de vendas, checkout, pedidos e automacoes para transformar conversa em pedido acompanhado.",
      },
    ],
    keywords: ["agente de IA para WhatsApp", "IA WhatsApp", "atendimento automatico WhatsApp"],
  },
  {
    slug: "automacao-whatsapp",
    title: "Automacao WhatsApp",
    seoTitle: "Automacao WhatsApp para vendas e atendimento | ConnectyHub",
    description:
      "Automatize atendimento, follow-up, qualificacao, recuperacao de carrinho e mensagens comerciais pelo WhatsApp com IA e contexto.",
    eyebrow: "Automacao comercial",
    heroTitle: "Automacao de WhatsApp para vender, atender e recuperar oportunidades",
    heroLead:
      "A ConnectyHub organiza conversas, automacoes e agentes de IA para que cada lead receba resposta rapida, relevante e acompanhada.",
    intentAnswer:
      "Automacao WhatsApp e o uso de fluxos, gatilhos e IA para responder clientes, enviar follow-ups, recuperar carrinhos, confirmar pedidos e acionar humanos quando necessario.",
    proofPoints: [
      "Fluxos por evento, lead, conversa, pedido e status.",
      "Automacoes comerciais feitas fora do antigo modelo de campanhas no agente.",
      "Historico centralizado para medir resultado e corrigir gargalos.",
    ],
    sections: [
      {
        title: "Fluxos por etapa",
        body: "A automacao pode agir no primeiro contato, qualificacao, proposta, pagamento, abandono, pos-venda e reativacao. Cada etapa pode ter tom, prazo e objetivo proprio.",
      },
      {
        title: "IA com controle",
        body: "A IA responde com contexto e a empresa define limites, regras, fontes de conhecimento e momentos em que o atendimento humano deve entrar.",
      },
      {
        title: "Resultados buscaveis",
        body: "A pagina explica os casos concretos de automacao, o que ajuda mecanismos de busca a relacionarem a ConnectyHub com perguntas comerciais reais.",
      },
    ],
    faqs: [
      {
        question: "Automacao WhatsApp e diferente de chatbot?",
        answer:
          "Sim. Chatbots costumam seguir menus fixos. Uma automacao com IA usa contexto, eventos e regras para responder de forma mais natural.",
      },
      {
        question: "Posso automatizar follow-up?",
        answer:
          "Sim. E possivel criar rotinas para lembrar leads, acompanhar propostas, recuperar carrinhos e manter o relacionamento ativo.",
      },
      {
        question: "Preciso deixar campanhas dentro do agente?",
        answer:
          "Nao. Na ConnectyHub as campanhas e fluxos comerciais devem ficar na area de automacoes, deixando o agente focado no atendimento.",
      },
    ],
    keywords: ["automacao WhatsApp", "fluxo WhatsApp", "follow up WhatsApp", "recuperacao de carrinho WhatsApp"],
  },
  {
    slug: "catalogo-whatsapp",
    title: "Catalogo WhatsApp",
    seoTitle: "Catalogo WhatsApp com IA, loja publica e checkout | ConnectyHub",
    description:
      "Use catalogo WhatsApp com loja publica, produtos, categorias, imagens, checkout, pedidos e atendimento conectado ao agente de IA.",
    eyebrow: "Catalogo e vendas",
    heroTitle: "Catalogo WhatsApp conectado a loja, pedido e atendimento",
    heroLead:
      "A ConnectyHub ajuda empresas a apresentar produtos no WhatsApp, organizar categorias, exibir vitrines publicas e acompanhar pedidos.",
    intentAnswer:
      "Um catalogo WhatsApp bem estruturado permite que a empresa apresente produtos e servicos no atendimento, envie links, receba pedidos e mantenha o vendedor ou agente de IA com contexto comercial.",
    proofPoints: [
      "Produtos com categoria, preco, midias, estoque e destino de venda.",
      "Loja publica indexavel para buscadores quando o produto esta ativo.",
      "Checkout seguro e continuidade pelo WhatsApp.",
    ],
    sections: [
      {
        title: "Produtos e categorias",
        body: "Cada produto precisa de nome, descricao, categoria e imagens quando houver. Categorias claras ajudam o cliente, o agente e tambem os buscadores.",
      },
      {
        title: "Sincronizacao e revisao",
        body: "Quando um catalogo externo e importado, o ideal e revisar os itens antes de publicar. Assim o usuario define categoria, ajusta texto e evita produto incompleto na loja.",
      },
      {
        title: "Vitrine indexavel",
        body: "Produtos ativos podem virar paginas publicas com Schema Product, imagem, disponibilidade e preco, o que ajuda Google, Pinterest e IAs a entenderem a oferta.",
      },
    ],
    faqs: [
      {
        question: "A ConnectyHub importa produtos do catalogo do WhatsApp?",
        answer:
          "A plataforma possui fluxo de sincronizacao e revisao. O funcionamento final depende tambem da resposta do provedor WhatsApp conectado.",
      },
      {
        question: "As imagens dos produtos entram no catalogo?",
        answer:
          "Quando o provedor retorna as midias e elas estao acessiveis, as imagens podem ser usadas para compor a previa, a vitrine e o produto.",
      },
      {
        question: "Produto sem categoria deve ser publicado?",
        answer:
          "O ideal e exigir categoria antes da publicacao, para melhorar organizacao interna, atendimento por IA e leitura pelos buscadores.",
      },
    ],
    keywords: ["catalogo WhatsApp", "produtos WhatsApp", "loja WhatsApp", "checkout WhatsApp"],
  },
  {
    slug: "api-whatsapp",
    title: "API WhatsApp",
    seoTitle: "API WhatsApp com console de testes | ConnectyHub",
    description:
      "Consulte a documentacao publica da API WhatsApp ConnectyHub, teste endpoints, envie mensagens, gerencie instancias e configure webhooks.",
    eyebrow: "API para integradores",
    heroTitle: "API WhatsApp com documentacao e console de testes",
    heroLead:
      "A ConnectyHub oferece uma API REST para integradores criarem experiencias com WhatsApp, mensagens, contatos, webhooks e operacoes avancadas.",
    intentAnswer:
      "Uma API WhatsApp permite integrar sistemas externos ao atendimento, envio de mensagens, leitura de contatos, status de instancias e webhooks de eventos em tempo real.",
    proofPoints: [
      "Documentacao publica em /docs/api com exemplos e console interativo.",
      "Endpoints organizados por instancia, mensagem, contato, chat, webhook e provedor.",
      "Modelo pensado para clientes testarem antes de integrar em producao.",
    ],
    sections: [
      {
        title: "Ambiente de teste",
        body: "A documentacao da ConnectyHub permite selecionar endpoints, informar token, montar payloads e ver respostas diretamente no navegador.",
      },
      {
        title: "Base para parceiros",
        body: "Clientes e integradores podem consultar exemplos de cURL, fetch, parametros, schemas e respostas sem depender de atendimento manual.",
      },
      {
        title: "Descoberta por IA",
        body: "Uma documentacao publica e estruturada melhora a chance de IAs entenderem o produto e citarem a ConnectyHub quando alguem perguntar por API WhatsApp.",
      },
    ],
    faqs: [
      {
        question: "Onde esta a documentacao da API ConnectyHub?",
        answer: "A documentacao publica fica em /docs/api e inclui referencia, exemplos e console de testes.",
      },
      {
        question: "A API usa token?",
        answer:
          "Sim. As chamadas protegidas usam token do cliente. O console nao salva o token; ele serve apenas para testar durante a sessao.",
      },
      {
        question: "A API substitui o painel?",
        answer:
          "Nao. A API complementa o painel para integracoes externas, automacoes proprias e sistemas que precisam conversar com a ConnectyHub.",
      },
    ],
    keywords: ["API WhatsApp", "API envio mensagem WhatsApp", "webhook WhatsApp", "ConnectyHub API"],
  },
  {
    slug: "ia-para-imobiliarias",
    title: "IA para imobiliarias",
    seoTitle: "IA para imobiliarias no WhatsApp | ConnectyHub",
    description:
      "Atenda leads imobiliarios no WhatsApp com IA, catalogo de imoveis, qualificacao, agendamento e acompanhamento comercial.",
    eyebrow: "Imobiliarias",
    heroTitle: "IA para imobiliarias que responde leads e apresenta imoveis no WhatsApp",
    heroLead:
      "A ConnectyHub ajuda imobiliarias, corretores e equipes comerciais a responder rapido, qualificar interessados e apresentar imoveis com contexto.",
    intentAnswer:
      "IA para imobiliarias no WhatsApp ajuda a responder interessados, entender perfil de compra ou locacao, apresentar imoveis, enviar links e encaminhar para o corretor certo.",
    proofPoints: [
      "Catalogo de imoveis com fotos, descricao e categoria.",
      "Qualificacao por bairro, valor, finalidade e urgencia.",
      "Agendamento e repasse para corretor humano quando necessario.",
    ],
    sections: [
      {
        title: "Atendimento imobiliario",
        body: "O lead pode perguntar por bairro, preco, tipo de imovel ou disponibilidade. O agente usa o contexto do catalogo e da conversa para responder melhor.",
      },
      {
        title: "Pre-venda organizada",
        body: "A IA coleta informacoes importantes antes de acionar o corretor, reduzindo conversas frias e ajudando a priorizar oportunidades reais.",
      },
      {
        title: "Conteudo local",
        body: "Paginas publicas de imoveis e categorias podem ajudar mecanismos de busca a entenderem ofertas da imobiliaria e direcionarem trafego qualificado.",
      },
    ],
    faqs: [
      {
        question: "A IA consegue apresentar imoveis?",
        answer:
          "Sim, quando os imoveis estao cadastrados no catalogo com informacoes suficientes, o agente pode sugerir opcoes e enviar links de produto.",
      },
      {
        question: "O corretor consegue assumir a conversa?",
        answer:
          "Sim. O fluxo pode manter IA e humano no mesmo atendimento, com historico e contexto para reduzir retrabalho.",
      },
      {
        question: "Funciona para locacao e venda?",
        answer:
          "Sim. O cadastro e as automacoes podem ser adaptados para venda, locacao, lancamentos, captacao e pos-atendimento.",
      },
    ],
    keywords: ["IA para imobiliarias", "WhatsApp imobiliaria", "agente IA corretor", "catalogo de imoveis WhatsApp"],
  },
  {
    slug: "ia-para-ecommerce",
    title: "IA para e-commerce",
    seoTitle: "IA para e-commerce no WhatsApp | ConnectyHub",
    description:
      "Use IA no WhatsApp para vender produtos, recuperar carrinhos, responder duvidas, enviar links de pagamento e acompanhar pedidos.",
    eyebrow: "E-commerce",
    heroTitle: "IA para e-commerce que vende e recupera carrinhos pelo WhatsApp",
    heroLead:
      "A ConnectyHub combina atendimento, catalogo, checkout e automacoes para lojas que querem transformar conversas em pedidos acompanhados.",
    intentAnswer:
      "IA para e-commerce no WhatsApp responde duvidas de produto, recomenda itens, recupera carrinhos, envia links de pagamento e acompanha pedidos em conversas naturais.",
    proofPoints: [
      "Vitrine publica com produtos ativos e Schema Product.",
      "Carrinho, checkout e atendimento no mesmo fluxo.",
      "Follow-up para abandono e recompra.",
    ],
    sections: [
      {
        title: "Venda conversacional",
        body: "O cliente pode pedir recomendacao, perguntar preco, disponibilidade ou entrega. A IA responde com base nos produtos cadastrados e orienta a proxima acao.",
      },
      {
        title: "Recuperacao de carrinho",
        body: "Quando o cliente abandona uma compra, automacoes podem retomar o contato no momento certo com contexto do produto e do pedido.",
      },
      {
        title: "Produtos encontraveis",
        body: "Paginas de produto com imagem, preco, disponibilidade e descricao ajudam buscadores, Pinterest e sistemas de IA a entenderem o catalogo.",
      },
    ],
    faqs: [
      {
        question: "A ConnectyHub cria loja publica?",
        answer:
          "Sim. O catalogo pode gerar uma vitrine publica para produtos ativos, com compra segura e atendimento pelo WhatsApp.",
      },
      {
        question: "Da para vender sem preco fixo?",
        answer:
          "Sim. Produtos podem ficar sob consulta quando a venda exige atendimento, orcamento ou confirmacao manual.",
      },
      {
        question: "A IA acompanha pedidos?",
        answer:
          "A plataforma pode usar eventos de pedido, pagamento e atendimento para manter o cliente informado dentro do fluxo configurado.",
      },
    ],
    keywords: ["IA para e-commerce", "WhatsApp e-commerce", "recuperar carrinho WhatsApp", "vendas pelo WhatsApp"],
  },
];

export function getSolutionPage(slug: string) {
  return solutionPages.find((page) => page.slug === slug) ?? null;
}
