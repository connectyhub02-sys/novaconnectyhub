export type PanelMode = "admin" | "client";
type NavigationDefinition = { group: string; label: string; aliases: string };
/** Task ownership is explicit; providers and URL spelling do not decide the menu group. */
export const panelNavigation: Record<string, NavigationDefinition> = {
  "/admin/analytics": { group: "Divulgação", label: "Analytics do site", aliases: "Google Analytics GA4 visitas visitantes" },
  "/admin/seo": { group: "Divulgação", label: "Busca orgânica", aliases: "SEO Google Search Console indexação sitemap Bing" },
  "/admin": {
    "group": "Início",
    "label": "Início",
    "aliases": "Dashboard Operação"
  },
  "/admin/agentes": {
    "group": "Operação",
    "label": "Agentes internos",
    "aliases": "Agentes Operação"
  },
  "/admin/whatsapp/atendimento": {
    "group": "Operação",
    "label": "Atendimento",
    "aliases": "WhatsApp Interno Operação"
  },
  "/admin/inteligencia": {
    "group": "Operação",
    "label": "Memória e eventos",
    "aliases": "Inteligencia Operação"
  },
  "/admin/conteudo": {
    "group": "Divulgação",
    "label": "Criação com IA",
    "aliases": "Criativos IA Operação"
  },
  "/admin/setores": {
    "group": "Operação",
    "label": "Setores",
    "aliases": "Setores Operação"
  },
  "/admin/ceo": {
    "group": "Início",
    "label": "Resumo executivo",
    "aliases": "CEO IA Operação"
  },
  "/admin/aprovacoes": {
    "group": "Início",
    "label": "Pendências e aprovações",
    "aliases": "Aprovações Operação"
  },
  "/admin/redes-sociais/publicacoes": {
    "group": "Divulgação",
    "label": "Publicações",
    "aliases": "Publicações Redes sociais"
  },
  "/admin/redes-sociais/calendario": {
    "group": "Divulgação",
    "label": "Calendário de posts",
    "aliases": "Calendário de posts Redes sociais"
  },
  "/admin/redes-sociais/biblioteca": {
    "group": "Divulgação",
    "label": "Biblioteca de mídias",
    "aliases": "Biblioteca de mídias Redes sociais"
  },
  "/admin/redes-sociais/contas": {
    "group": "Sistema",
    "label": "Conexões sociais",
    "aliases": "Contas conectadas Redes sociais"
  },
  "/admin/trafego/meta-ads": {
    "group": "Divulgação",
    "label": "Meta Ads",
    "aliases": "Meta Ads Meta e tráfego"
  },
  "/admin/meta": {
    "group": "Operação",
    "label": "WhatsApp oficial",
    "aliases": "Meta e WhatsApp oficial Meta e tráfego"
  },
  "/admin/trafego/google-ads": {
    "group": "Divulgação",
    "label": "Google Ads",
    "aliases": "Google Ads Meta e tráfego"
  },
  "/admin/trafego": {
    "group": "Divulgação",
    "label": "Resultados de divulgação",
    "aliases": "Visao Geral Meta e tráfego"
  },
  "/admin/clientes": {
    "group": "Clientes",
    "label": "Clientes",
    "aliases": "Clientes Clientes"
  },
  "/admin/leads": {
    "group": "Comercial",
    "label": "CRM Leads",
    "aliases": "CRM Leads Clientes"
  },
  "/admin/automacoes": {
    "group": "Operação",
    "label": "Automações da plataforma",
    "aliases": "Automacoes Clientes"
  },
  "/dashboard/meus-produtos": {
    "group": "Conta",
    "label": "Minhas compras",
    "aliases": "Meus produtos biblioteca compras"
  },
  "/admin/planos": {
    "group": "Financeiro",
    "label": "Planos",
    "aliases": "Planos Clientes"
  },
  "/admin/contratos": {
    "group": "Comercial",
    "label": "Contratos personalizados",
    "aliases": "Contratos personalizados Clientes"
  },
  "/admin/reunioes": {
    "group": "Comercial",
    "label": "Reuniões de projetos",
    "aliases": "Reuniões de projetos Clientes"
  },
  "/admin/campanhas-comerciais": {
    "group": "Comercial",
    "label": "Ofertas e benefícios",
    "aliases": "Campanhas comerciais Clientes"
  },
  "/admin/produtos-connectyhub": {
    "group": "Comercial",
    "label": "Produtos ConnectyHub",
    "aliases": "Produtos CH Clientes"
  },
  "/admin/compliance-produtos": {
    "group": "Comercial",
    "label": "Revisão de produtos",
    "aliases": "Compliance Produtos Clientes"
  },
  "/admin/clientes/whatsapp": {
    "group": "Clientes",
    "label": "Suporte WhatsApp",
    "aliases": "WhatsApp Clientes Clientes"
  },
  "/admin/clientes/integracoes": {
    "group": "Clientes",
    "label": "Conexões dos clientes",
    "aliases": "Integracoes Clientes"
  },
  "/admin/api-whatsapp": {
    "group": "Sistema",
    "label": "API WhatsApp",
    "aliases": "API WhatsApp APIs e serviços"
  },
  "/admin/api-ia": {
    "group": "Sistema",
    "label": "API de AI",
    "aliases": "API de AI APIs e serviços"
  },
  "/admin/voz": {
    "group": "Sistema",
    "label": "Voz e áudio",
    "aliases": "Estúdio de Voz e Áudio APIs e serviços"
  },
  "/admin/infrastructure": {
    "group": "Sistema",
    "label": "Infraestrutura",
    "aliases": "Infraestrutura Sistema"
  },
  "/admin/maintenance": {
    "group": "Sistema",
    "label": "Configurações e manutenção",
    "aliases": "Manutenção Sistema"
  },
  "/admin/auditoria": {
    "group": "Sistema",
    "label": "Auditoria",
    "aliases": "Auditoria Sistema"
  },
  "/admin/financeiro": {
    "group": "Financeiro",
    "label": "Financeiro",
    "aliases": "Financeiro Sistema"
  },
  "/admin/configuracoes": {
    "group": "Sistema",
    "label": "Configurações e manutenção",
    "aliases": "Configurações Sistema"
  },
  "/dashboard": {
    "group": "Início",
    "label": "Início",
    "aliases": "Dashboard Vendas"
  },
  "/dashboard/empresa": {
    "group": "Conta",
    "label": "Empresa",
    "aliases": "Minha Empresa Vendas"
  },
  "/dashboard/whatsapp": {
    "group": "Atendimento",
    "label": "Agentes",
    "aliases": "Agentes Vendas"
  },
  "/dashboard/atendimento": {
    "group": "Atendimento",
    "label": "Atendimento",
    "aliases": "Atendimento Vendas"
  },
  "/dashboard/agenda": {
    "group": "Atendimento",
    "label": "Agenda",
    "aliases": "Agenda Vendas"
  },
  "/dashboard/redes-sociais/publicacoes": {
    "group": "Divulgação",
    "label": "Publicações",
    "aliases": "Publicações Redes sociais"
  },
  "/dashboard/redes-sociais/calendario": {
    "group": "Divulgação",
    "label": "Calendário de posts",
    "aliases": "Calendário de posts Redes sociais"
  },
  "/dashboard/redes-sociais/biblioteca": {
    "group": "Divulgação",
    "label": "Biblioteca de mídias",
    "aliases": "Biblioteca de mídias Redes sociais"
  },
  "/dashboard/redes-sociais/contas": {
    "group": "Conta",
    "label": "Conexões sociais",
    "aliases": "Contas conectadas Redes sociais"
  },
  "/dashboard/meta": {
    "group": "Conta",
    "label": "Conexão Meta",
    "aliases": "Central Meta Meta"
  },
  "/dashboard/trafego/meta-ads": {
    "group": "Divulgação",
    "label": "Meta Ads",
    "aliases": "Meta Ads Meta"
  },
  "/dashboard/chat-meta": {
    "group": "Atendimento",
    "label": "WhatsApp oficial",
    "aliases": "Chat Meta oficial Meta"
  },
  "/dashboard/meta/analise": {
    "group": "Divulgação",
    "label": "Análise orgânica",
    "aliases": "Análise orgânica Meta"
  },
  "/dashboard/meta/atendimento": {
    "group": "Atendimento",
    "label": "Direct e Messenger",
    "aliases": "Direct e Messenger Meta"
  },
  "/dashboard/links": {
    "group": "Vendas",
    "label": "Catálogo e pedidos",
    "aliases": "Catálogo de Vendas Crescimento"
  },
  "/dashboard/campanhas-comerciais": {
    "group": "Vendas",
    "label": "Ofertas e benefícios",
    "aliases": "Campanhas e benefícios Crescimento"
  },
  "/dashboard/automacoes": {
    "group": "Automações",
    "label": "Automações",
    "aliases": "Automações Crescimento"
  },
  "/dashboard/produtos": {
    "group": "Vendas",
    "label": "Produtos para revender",
    "aliases": "Produtos Crescimento"
  },
  "/dashboard/integracoes": {
    "group": "Conta",
    "label": "Conexões",
    "aliases": "Integrações Crescimento"
  },
  "/dashboard/infraestrutura": {
    "group": "Ferramentas",
    "label": "Meus projetos",
    "aliases": "Minha infraestrutura Crescimento"
  },
  "/dashboard/api-whatsapp": {
    "group": "Ferramentas",
    "label": "API WhatsApp",
    "aliases": "API WhatsApp Crescimento"
  },
  "/dashboard/api-ia": {
    "group": "Ferramentas",
    "label": "API de AI",
    "aliases": "API de AI Crescimento"
  },
  "/dashboard/voz": {
    "group": "Ferramentas",
    "label": "Voz e áudio",
    "aliases": "Estúdio de Voz e Áudio AI Crescimento"
  },
  "/dashboard/creditos": {
    "group": "Conta",
    "label": "Créditos e recargas",
    "aliases": "Créditos e recargas Crescimento"
  },
  "/dashboard/planos": {
    "group": "Conta",
    "label": "Planos",
    "aliases": "Planos Crescimento"
  },
  "/dashboard/minha-conta": {
    "group": "Conta",
    "label": "Dados e cobrança",
    "aliases": "Minha Conta Crescimento"
  },
  "/admin/meta/atendimento": {
    "group": "Operação",
    "label": "Direct e comentários",
    "aliases": "Instagram Messenger Facebook atendimento Meta"
  }
};

export function normalizeMenuSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}
export function matchesMenuSearch(section: string, item: { href: string; label: string }, query: string) {
  const aliases = panelNavigation[item.href]?.aliases ?? "";
  const attendance = ["/dashboard/atendimento", "/admin/whatsapp/atendimento", "/dashboard/chat-meta", "/admin/meta", "/dashboard/meta/atendimento", "/admin/meta/atendimento"].includes(item.href) ? "atender atendimento conversas inbox whatsapp interno" : "";
  return normalizeMenuSearch(`${section} ${item.label} ${item.href} ${aliases} ${attendance}`).includes(normalizeMenuSearch(query));
}
/** Only regroup links supplied by the authorized shell, retaining gates and metadata. */
export function groupPanelNavigation<T extends { href: string; label: string }>(sections: { label: string; items: T[] }[], mode: PanelMode) {
  const groups = new Map<string, T[]>();
  const all=sections.flatMap(s=>s.items);
  for (const item of all) {
    // Both existing URLs remain valid; one visible editor when both aliases are present.
    if(item.href==="/admin/configuracoes" && all.some(x=>x.href==="/admin/maintenance")) continue;
    const definition=panelNavigation[item.href];
    const group=definition?.group ?? (mode==="admin"?"Sistema":"Ferramentas");
    groups.set(group,[...(groups.get(group)??[]),{...item,label:definition?.label??item.label}]);
  }
  const order=mode==="admin"?["Início","Clientes","Operação","Comercial","Divulgação","Financeiro","Sistema","Conta"]:["Início","Atendimento","Vendas","Divulgação","Automações","Conta","Ferramentas"];
  return order.filter(label=>groups.has(label)).map(label=>({label,items:groups.get(label)!}));
}

export function panelDockHrefs(mode: PanelMode) {
  return mode === "admin" ? ["/admin", "/admin/clientes", "/admin/whatsapp/atendimento", "/admin/infrastructure"] : ["/dashboard", "/dashboard/atendimento", "/dashboard/links", "/dashboard/whatsapp"];
}

export function panelContextLinks(active: string, mode: PanelMode) {
  const channels=mode==="admin"?[{href:"/admin/whatsapp/atendimento",label:"WhatsApp"},{href:"/admin/meta",label:"WhatsApp oficial"},{href:"/admin/meta/atendimento",label:"Direct e Messenger"}]:[{href:"/dashboard/atendimento",label:"WhatsApp"},{href:"/dashboard/chat-meta",label:"WhatsApp oficial"},{href:"/dashboard/meta/atendimento",label:"Direct e Messenger"}];
  if(channels.some(x=>x.href===active))return {label:"Canais de atendimento",items:channels};
  if(mode==="client"&&["/dashboard/integracoes","/dashboard/meta","/dashboard/redes-sociais/contas"].includes(active))return {label:"Conexões",items:[{href:"/dashboard/integracoes",label:"Todas as conexões"},{href:"/dashboard/redes-sociais/contas",label:"Redes sociais"},{href:"/dashboard/meta",label:"Permissões Meta"}]};
  if(mode==="client"&&["/dashboard/minha-conta","/dashboard/creditos","/dashboard/planos","/dashboard/meus-produtos","/dashboard/empresa"].includes(active))return {label:"Sua conta",items:[{href:"/dashboard/minha-conta",label:"Dados e cobrança"},{href:"/dashboard/creditos",label:"Saldo"},{href:"/dashboard/planos",label:"Plano"},{href:"/dashboard/meus-produtos",label:"Compras"},{href:"/dashboard/empresa",label:"Empresa"}]};
  if(mode==="admin"&&["/admin/financeiro","/admin/planos"].includes(active))return {label:"Financeiro",items:[{href:"/admin/financeiro",label:"Visão geral"},{href:"/admin/planos",label:"Planos"},{href:"/admin/automacoes#financeiro",label:"Cobrança e renovação"}]};
  return null;
}
