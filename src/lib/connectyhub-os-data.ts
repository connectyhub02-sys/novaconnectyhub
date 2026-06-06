export type Tone = "green" | "cyan" | "amber" | "rose" | "violet" | "zinc";

export type StatusTone = "online" | "warning" | "critical" | "idle";

export type Metric = {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: Tone;
  series: number[];
};

export type ClientAccount = {
  id: string;
  company: string;
  owner: string;
  plan: string;
  health: string;
  mrr: string;
  tokens: string;
  agents: number;
  status: StatusTone;
};

export type PlatformHealth = {
  name: string;
  status: StatusTone;
  latency: string;
  detail: string;
};

export type InternalAgent = {
  name: string;
  sector: string;
  role: string;
  status: StatusTone;
  autonomy: string;
  task: string;
  accuracy: number;
};

export type Sector = {
  name: string;
  manager: string;
  agents: number;
  tokens: string;
  sla: number;
  result: string;
};

export type Approval = {
  id: string;
  client: string;
  request: string;
  risk: Tone;
  submitted: string;
};

export type AuditEvent = {
  time: string;
  actor: string;
  action: string;
  tone: Tone;
};

export type MaintenanceItem = {
  area: string;
  target: string;
  status: StatusTone;
  detail: string;
};

export type Lead = {
  name: string;
  channel: "WhatsApp" | "Instagram" | "Link" | "Organico";
  status: string;
  score: number;
  location: string;
  device: string;
  value: string;
  lastEvent: string;
};

export type Conversation = {
  lead: string;
  channel: string;
  sentiment: string;
  nextStep: string;
  summary: string;
  score: number;
};

export type TrackerLink = {
  alias: string;
  destination: string;
  clicks: string;
  unique: string;
  conversion: string;
  source: string;
};

export type Campaign = {
  name: string;
  platform: string;
  budget: string;
  spent: string;
  leads: number;
  roas: string;
  status: StatusTone;
};

export type Automation = {
  trigger: string;
  action: string;
  runs: string;
  status: StatusTone;
};

export const adminMetrics: Metric[] = [
  {
    label: "MRR ativo",
    value: "R$ 48.720",
    detail: "+18% nos ultimos 30 dias",
    trend: "Receita recorrente",
    tone: "green",
    series: [34, 38, 36, 42, 45, 51, 55],
  },
  {
    label: "Margem IA",
    value: "64%",
    detail: "Tokens revendidos com margem media",
    trend: "Custo controlado",
    tone: "cyan",
    series: [48, 50, 54, 56, 61, 59, 64],
  },
  {
    label: "Clientes ativos",
    value: "312",
    detail: "29 contas em onboarding",
    trend: "Base SaaS",
    tone: "violet",
    series: [210, 224, 238, 260, 284, 301, 312],
  },
  {
    label: "Aprovacoes",
    value: "17",
    detail: "Itens aguardando humano",
    trend: "Fila de controle",
    tone: "amber",
    series: [8, 11, 9, 14, 12, 18, 17],
  },
];

export const clientMetrics: Metric[] = [
  {
    label: "Leads captados",
    value: "1.284",
    detail: "WhatsApp, Instagram e links inteligentes",
    trend: "+22% semana",
    tone: "cyan",
    series: [110, 128, 180, 240, 310, 420, 520],
  },
  {
    label: "Conversas IA",
    value: "8.913",
    detail: "Atendimentos conduzidos pelo agente",
    trend: "24/7 ativo",
    tone: "green",
    series: [320, 480, 460, 690, 720, 880, 1010],
  },
  {
    label: "Vendas atribuidas",
    value: "R$ 38.450",
    detail: "Links, carrinho e follow-up",
    trend: "ROAS 4.8x",
    tone: "violet",
    series: [18, 21, 28, 34, 36, 44, 52],
  },
  {
    label: "Tokens restantes",
    value: "2.4M",
    detail: "Plano Pro + creditos extras",
    trend: "Consumo saudavel",
    tone: "amber",
    series: [82, 79, 76, 70, 66, 61, 58],
  },
];

export const clients: ClientAccount[] = [
  {
    id: "CLI-001",
    company: "Veloce Digital",
    owner: "Marina Torres",
    plan: "Enterprise PRO",
    health: "Excelente",
    mrr: "R$ 1.497",
    tokens: "8.2M / 30M",
    agents: 12,
    status: "online",
  },
  {
    id: "CLI-044",
    company: "Aest Brasil Shop",
    owner: "Carlos Mendes",
    plan: "Growth",
    health: "Bom",
    mrr: "R$ 497",
    tokens: "2.8M / 5M",
    agents: 5,
    status: "online",
  },
  {
    id: "CLI-087",
    company: "ClinicPro Leads",
    owner: "Renata Lima",
    plan: "Starter",
    health: "Atencao",
    mrr: "R$ 197",
    tokens: "950k / 1M",
    agents: 2,
    status: "warning",
  },
];

export const platformHealth: PlatformHealth[] = [
  { name: "WhatsApp Gateway", status: "online", latency: "92ms", detail: "Uazapi cluster sincronizado" },
  { name: "Instagram Graph", status: "online", latency: "118ms", detail: "DMs e comentarios em escuta" },
  { name: "Gemini Tokens", status: "warning", latency: "fila 03", detail: "Pico de consumo no horario comercial" },
  { name: "Supabase", status: "online", latency: "41ms", detail: "Banco e auth operacionais" },
  { name: "Cloudflare R2", status: "online", latency: "64ms", detail: "Midias e audios prontos" },
  { name: "Inngest", status: "online", latency: "cron ok", detail: "Rotinas de remarketing ativas" },
];

export const internalAgents: InternalAgent[] = [
  {
    name: "CEO Digital Connecty",
    sector: "Diretoria",
    role: "Orquestracao executiva",
    status: "online",
    autonomy: "42%",
    task: "Consolidando relatorio diario para o dono humano",
    accuracy: 92,
  },
  {
    name: "Athena Leads",
    sector: "Marketing",
    role: "Analise de conversas e oportunidades",
    status: "online",
    autonomy: "68%",
    task: "Pontuando leads com alta intencao de compra",
    accuracy: 88,
  },
  {
    name: "Hermes Ads",
    sector: "Trafego Pago",
    role: "Google Ads e Meta Ads",
    status: "warning",
    autonomy: "31%",
    task: "Aguardando aprovacao humana para subir budget",
    accuracy: 81,
  },
  {
    name: "Oraculo Conteudo",
    sector: "Organico",
    role: "Pesquisa, blog e posts",
    status: "online",
    autonomy: "55%",
    task: "Montando pauta semanal com noticias do nicho",
    accuracy: 90,
  },
];

export const sectors: Sector[] = [
  { name: "Atendimento IA", manager: "Gerente Hera", agents: 18, tokens: "42.1M", sla: 98, result: "Tempo medio de resposta 12s" },
  { name: "Marketing Proprietario", manager: "Gerente Atlas", agents: 9, tokens: "18.7M", sla: 91, result: "34 campanhas organicas ativas" },
  { name: "Trafego Pago", manager: "Gerente Hermes", agents: 6, tokens: "11.4M", sla: 86, result: "ROAS medio 3.9x" },
  { name: "Produto e Plataforma", manager: "Gerente Vulcan", agents: 7, tokens: "7.2M", sla: 94, result: "Fila critica zerada" },
];

export const approvals: Approval[] = [
  { id: "APR-1182", client: "ClinicPro Leads", request: "Comprar 10M tokens extras", risk: "amber", submitted: "ha 12 min" },
  { id: "APR-1183", client: "Veloce Digital", request: "Aumentar budget Meta Ads em 28%", risk: "green", submitted: "ha 21 min" },
  { id: "APR-1184", client: "Aest Brasil Shop", request: "Ativar disparo de recuperacao para 4.200 leads", risk: "rose", submitted: "ha 43 min" },
];

export const auditEvents: AuditEvent[] = [
  { time: "16:41", actor: "CEO Digital", action: "Gerou parecer de margem IA para planos Growth", tone: "cyan" },
  { time: "16:29", actor: "Hermes Ads", action: "Pausou conjunto com CPA acima do limite", tone: "green" },
  { time: "16:13", actor: "Sala de Manutencao", action: "Rotacionou chave secundaria do gateway WhatsApp", tone: "amber" },
  { time: "15:58", actor: "Athena Leads", action: "Sinalizou 28 conversas com risco de churn", tone: "rose" },
];

export const maintenanceItems: MaintenanceItem[] = [
  { area: "APIs", target: "Gemini, ElevenLabs, Uazapi", status: "online", detail: "Chaves versionadas e limites definidos" },
  { area: "Conexoes", target: "WhatsApp e Instagram", status: "online", detail: "Instancias com heartbeat em tempo real" },
  { area: "Webhooks", target: "WordPress, WooCommerce, Carrinho", status: "warning", detail: "2 endpoints sem resposta ha 6 min" },
  { area: "Seguranca", target: "VAPID, Push, Auditoria", status: "online", detail: "Eventos assinados e trilha ativa" },
];

export const leads: Lead[] = [
  { name: "Joao Pereira", channel: "WhatsApp", status: "Em atendimento", score: 92, location: "Sao Paulo, SP", device: "iPhone / 4G", value: "R$ 497", lastEvent: "Perguntou sobre teste gratis" },
  { name: "Mariana Costa", channel: "Instagram", status: "Qualificado", score: 87, location: "Curitiba, PR", device: "Android / Wi-Fi", value: "R$ 297", lastEvent: "Veio de comentario no Reels" },
  { name: "Carlos M.", channel: "Link", status: "Carrinho recuperado", score: 78, location: "Belo Horizonte, MG", device: "Desktop / Chrome", value: "R$ 1.290", lastEvent: "Clicou no botao WhatsApp" },
  { name: "Ana Paula", channel: "Organico", status: "Novo", score: 64, location: "Florianopolis, SC", device: "Android / 5G", value: "R$ 197", lastEvent: "Baixou material gratuito" },
];

export const conversations: Conversation[] = [
  {
    lead: "Joao Pereira",
    channel: "WhatsApp",
    sentiment: "Quente",
    nextStep: "Enviar link de pagamento com bonus",
    summary: "Lead quer comecar hoje, pediu garantia e perguntou se precisa cartao do Google.",
    score: 92,
  },
  {
    lead: "Mariana Costa",
    channel: "Instagram DM",
    sentiment: "Curiosa",
    nextStep: "Perguntar nicho e volume de leads",
    summary: "Veio de comentario QUERO. Tem clinica e quer automatizar agendamentos.",
    score: 81,
  },
  {
    lead: "Carlos M.",
    channel: "Link rastreavel",
    sentiment: "Recuperacao",
    nextStep: "Aplicar cupom de 12h",
    summary: "Abandonou carrinho, retornou por webhook WooCommerce e respondeu ao audio.",
    score: 76,
  },
];

export const trackerLinks: TrackerLink[] = [
  { alias: "/zap/oferta-pro", destination: "WhatsApp agente Pro", clicks: "4.812", unique: "3.901", conversion: "12.8%", source: "Meta Ads" },
  { alias: "/ig/comentou-quero", destination: "Instagram Direct", clicks: "2.104", unique: "1.840", conversion: "9.4%", source: "Reels organico" },
  { alias: "/checkout/recuperar", destination: "Carrinho WooCommerce", clicks: "936", unique: "711", conversion: "18.2%", source: "Webhook carrinho" },
];

export const campaigns: Campaign[] = [
  { name: "Clone WhatsApp - Search", platform: "Google Ads", budget: "R$ 220/dia", spent: "R$ 3.820", leads: 412, roas: "4.1x", status: "online" },
  { name: "Reels Comentou QUERO", platform: "Instagram", budget: "R$ 0", spent: "Organico", leads: 186, roas: "8.7x", status: "online" },
  { name: "Carrinho 24h", platform: "WhatsApp", budget: "R$ 80/dia", spent: "R$ 980", leads: 94, roas: "6.2x", status: "warning" },
];

export const automations: Automation[] = [
  { trigger: "Lead clicou no botao WhatsApp", action: "Criar lead, iniciar conversa e marcar UTM", runs: "8.412", status: "online" },
  { trigger: "Carrinho abandonado no WordPress", action: "Enviar audio + cupom com validade", runs: "1.206", status: "online" },
  { trigger: "Comentario com palavra QUERO", action: "Responder comentario e chamar no direct", runs: "3.771", status: "online" },
  { trigger: "Lead quente sem resposta por 2h", action: "Escalar para humano ou gerente IA", runs: "284", status: "warning" },
];
