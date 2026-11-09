// Shared by the home and public pages, including their mobile menus.
export const publicSiteNavItems = [
  { href: "/#inicio", label: "Início", key: "home" },
  { href: "/#teste-turing", label: "Teste", key: "home" },
  { href: "/#diferencial", label: "Diferenciais", key: "home" },
  { href: "/#idiomas", label: "Idiomas", key: "home" },
  { href: "/#como-funciona", label: "Como funciona", key: "home" },
  { href: "/#redes-sociais", label: "Redes sociais", key: "home" },
  { href: "/#planos", label: "Planos", key: "home" },
  { href: "/solucoes", label: "Soluções", key: "solutions" },
  { href: "/docs/api", label: "API", key: "api" },
  { href: "/#faq", label: "FAQ", key: "home" },
] as const;

export const solutionNavItems = [
  { href: "/solucoes/agente-ia-whatsapp", label: "Agentes de IA para WhatsApp", description: "Atendimento e vendas com inteligência artificial", key: "agents" },
  { href: "/solucoes-personalizadas", label: "Desenvolvimento sob medida", description: "Software pensado para o seu negócio", key: "custom" },
  { href: "/solucoes/producao-de-videos", label: "Produção e edição de vídeos", description: "Sua próxima ideia, pronta para dar play", key: "video" },
  { href: "/solucoes", label: "Todas as soluções", description: "Conheça o ecossistema ConnectyHub", key: "solutions" },
] as const;
