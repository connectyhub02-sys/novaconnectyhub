-- Agent personas: every AI worker gets a human name and photo/avatar.

alter table public.agent_registry
  add column if not exists persona_name text,
  add column if not exists avatar_url text,
  add column if not exists avatar_alt text,
  add column if not exists profile_bio text;

update public.agent_registry
set
  persona_name = seed.persona_name,
  avatar_url = seed.avatar_url,
  avatar_alt = seed.avatar_alt,
  profile_bio = seed.profile_bio,
  metadata = coalesce(public.agent_registry.metadata, '{}'::jsonb) || jsonb_build_object('persona_seeded', true),
  updated_at = now()
from (
  values
    (
      'ceo-digital-connectyhub',
      'Helena Moura',
      'https://api.dicebear.com/9.x/personas/svg?seed=Helena%20Moura',
      'Foto de Helena Moura',
      'Executiva IA responsavel por coordenar gerentes, prioridades e relatorios da ConnectyHub.'
    ),
    (
      'gerente-atendimento',
      'Rafael Nunes',
      'https://api.dicebear.com/9.x/personas/svg?seed=Rafael%20Nunes',
      'Foto de Rafael Nunes',
      'Gerente IA do setor de atendimento, qualidade conversacional e funis comerciais.'
    ),
    (
      'agente-whatsapp-sistema',
      'Nina Almeida',
      'https://api.dicebear.com/9.x/personas/svg?seed=Nina%20Almeida',
      'Foto de Nina Almeida',
      'Atendente IA de WhatsApp focada em capturar leads, entender intencao e conduzir vendas.'
    ),
    (
      'agente-analise-leads',
      'Caio Martins',
      'https://api.dicebear.com/9.x/personas/svg?seed=Caio%20Martins',
      'Foto de Caio Martins',
      'Analista IA que transforma conversas, objecoes e sinais de compra em dados estruturados.'
    ),
    (
      'agente-pesquisa-web',
      'Lara Batista',
      'https://api.dicebear.com/9.x/personas/svg?seed=Lara%20Batista',
      'Foto de Lara Batista',
      'Pesquisadora IA para temas de mercado, tendencias, concorrentes e oportunidades externas.'
    ),
    (
      'agente-noticias',
      'Bruno Leal',
      'https://api.dicebear.com/9.x/personas/svg?seed=Bruno%20Leal',
      'Foto de Bruno Leal',
      'Curador IA de noticias sobre IA, WhatsApp, automacao, trafego e mercado digital.'
    ),
    (
      'agente-blog',
      'Sofia Campos',
      'https://api.dicebear.com/9.x/personas/svg?seed=Sofia%20Campos',
      'Foto de Sofia Campos',
      'Redatora IA que transforma a central de inteligencia em pautas, artigos e posts.'
    ),
    (
      'agente-trafego-pago',
      'Diego Torres',
      'https://api.dicebear.com/9.x/personas/svg?seed=Diego%20Torres',
      'Foto de Diego Torres',
      'Gestor IA de midia paga para campanhas, criativos, custo por lead e recomendacoes de budget.'
    ),
    (
      'agente-auditoria',
      'Marina Rocha',
      'https://api.dicebear.com/9.x/personas/svg?seed=Marina%20Rocha',
      'Foto de Marina Rocha',
      'Auditora IA de conexoes, custos, credenciais, webhooks e riscos operacionais.'
    ),
    (
      'agente-financeiro',
      'Henrique Vale',
      'https://api.dicebear.com/9.x/personas/svg?seed=Henrique%20Vale',
      'Foto de Henrique Vale',
      'Controller IA que calcula custo real, margem, creditos e consumo por provedor.'
    )
) as seed(agent_code, persona_name, avatar_url, avatar_alt, profile_bio)
where public.agent_registry.scope = 'platform'
  and public.agent_registry.agent_code = seed.agent_code;

update public.agent_registry
set persona_name = coalesce(nullif(persona_name, ''), name)
where persona_name is null or persona_name = '';

alter table public.agent_registry
  alter column persona_name set default '',
  alter column persona_name set not null;
