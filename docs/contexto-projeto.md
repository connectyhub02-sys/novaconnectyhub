# Contexto da ConnectyHub

Referência de continuidade, criada em 11/09/2026. Estado e pendências ficam em [estado-operacional.md](estado-operacional.md). Este documento descreve o produto e decisões mantidas, não garante que todos os recursos listados estejam operacionais.

## Produto e usuários

Plataforma para agentes de atendimento e vendas, WhatsApp, CRM/leads, catálogo e checkout, agenda, follow-up, automações, integrações e APIs públicas WhatsApp e IA/LLM. Há administração da plataforma e painéis de organizações clientes. Clientes podem usar agentes no painel ou apenas integrar a API em sistemas externos. Usuários, organização de execução, organização responsável pela carteira, projeto de API e agente são identidades distintas.

Decisão inicial de atendimento em 11/09: corretor de imóveis, imobiliária e revenda de veículos receberam bloqueio consultivo por atividade, após orçamento virar pedido de imóvel. Essa restrição absoluta foi refinada pelo titular no mesmo dia: profissão/empresa define identidade e ação sugerida, mas cada item revisado escolhe venda, agendamento ou site externo. Uma mercadoria explicitamente configurada para venda pode coexistir com serviços agendáveis. Orçamento/capacidade de pagar continuam sendo qualificação, não consentimento de compra. Itens antigos consultivos sem escolha explícita não devem herdar cobrança automaticamente. [Plano e estado da implementação local](plano-atendimento-por-atividade-2026-09-11.md).

Agenda por item: página pública, WhatsApp e painel compartilham os mesmos recursos, reservas, capacidade e fuso da organização. Agendamento consome disponibilidade nos três canais; não é uma agenda separada da loja. Profissão representa atendimento individual do titular; empresa representa recepção do negócio, sem atribuir ao software identidade humana ou credencial própria. Dados profissionais são informados pelo usuário e sua exposição pública é opcional.

Agente onipresente: o atendimento deve continuar nos dois sentidos entre WhatsApp, loja e página do item, mantendo o agente da conversa e o arquivo do mesmo lead. A navegação fornece contexto para comparar itens, inclusive os de agendamento, sem converter visualização em intenção de compra. Ativação e modo ficam em Comportamento do agente; profissão e identidade são herdadas, sem escolher outro playbook na loja. Preservar desativações e distinguir agente, empresa e visitante. Falas persistidas da loja devem alimentar tanto o contexto recente quanto a consolidação de memória na retomada do WhatsApp, quando habilitada; estado e limites verificados ficam no documento operacional.

O titular quer vender os recursos de IA em créditos, contabilizando o custo do fornecedor. Não é uma equivalência fixa de um crédito para um token. A aplicação usa regras por modelo, modalidade, operação e plano; ferramentas, mídia e armazenamento faturável podem ter unidades próprias. O objetivo é cobrar consumo faturável uma vez, sem débito duplicado ao consultar/repetir uma solicitação e sem apresentar custo incerto como uso gratuito.

## Arquitetura de referência

### Direção do produto

Meta explicitada pelo titular: entregar uma plataforma sofisticada a custo acessível, com agentes que atendam e vendam com qualidade, e permitir que outros projetos consumam a API de IA pagando em créditos. A migração de banco e orquestração para infraestrutura própria busca reduzir dependência de assinaturas e tornar a operação economicamente viável; não elimina custo de IA, manutenção ou consumo na Vercel.

O código sustenta duas frentes complementares: operação de empresas dentro do painel e integração de sistemas externos via API. Ambas devem compartilhar controles consistentes de organização, acesso, créditos, registro de consumo e entrega. Evitar tratar catálogo de recursos como entrega comercial pronta. Antes da próxima fase de produção, priorizar os percursos essenciais de cadastro/acesso, conexão do agente, resposta, agendamento, entrega e débito correto, com recuperação de falhas.

Essa priorização é uma avaliação técnica da revisão de 11/09, não uma decisão de remover módulos nem de substituir o escopo solicitado pelo titular. Painel multiprojetos e serviços adicionais continuam possibilidades futuras. Não há previsão comprovada de receita, número de clientes suportados ou margem garantida sem validação de carga e custos reais.

| Componente | Destino registrado | Fontes principais |
|---|---|---|
| Aplicação, painéis, APIs e handlers de automações | Next.js 16 / React 19 na Vercel | `src/app`, `src/components`, `package.json` |
| Banco, Auth, RLS e Supabase Storage | Supabase em Docker na VPS Contabo | `src/lib/supabase`, `supabase/migrations` |
| Agendamento e orquestração | Inngest na mesma VPS; chama handlers da aplicação | `src/lib/inngest`, `src/lib/automations` |
| Mídias em object storage | Cloudflare R2 permanece | referências `R2_` em `.env.example` e fontes |
| WhatsApp | UAZAPI; integrações Meta conforme configuração/ativação | `src/lib/uazapi`, `src/lib/whatsapp` |
| IA | Adaptadores Gemini; voz também ElevenLabs | `src/lib/gemini`, `src/lib/ai-api`, `src/lib/voice` |
| Pagamentos | Adaptadores Asaas, PagBank e Mercado Pago; verificar seleção por fluxo | `src/lib/billing`, `src/lib/sales-catalog` |
| E-mail de autenticação | Resend SMTP configurado na migração | relatório da migração Supabase |

Endereços operacionais registrados: aplicação `https://www.connectyhub.com.br`, Supabase `https://supabase.connectyhub.com.br`, Inngest `https://inngest.connectyhub.com.br`. Confirme os destinos no ambiente alvo antes de operar. Valores secretos não pertencem a este documento. Configurações reais podem combinar ambiente e credenciais criptografadas no banco; não basta ler `.env.example`.

O Inngest da VPS não transfere a execução dos handlers para a VPS: os handlers continuam na Vercel. A migração atual não é uma migração da hospedagem. Supabase self-hosted não inclui toda a camada comercial/multiprojetos do Cloud. Um novo projeto independente exige planejamento de isolamento e capacidade; isso ficou para etapa posterior. n8n foi discutido como possibilidade, sem decisão de instalação.

## Mapa para investigar um pedido

| Área | Entrada e caminhos | Referência |
|---|---|---|
| Painéis e escopo do cliente | `src/app/dashboard`, `src/app/api/dashboard`, `src/lib/client-os` | testes de escopo/auth em `tests` e `src/lib/client-os` |
| Agentes, histórico e atendimento | `src/lib/whatsapp/agent-runtime.ts`, `src/lib/whatsapp/client-workspace.ts`, rotas de conversations/attendance | [auditoria das automações](auditoria-automacoes-vps-2026-09-11.md) |
| Agenda, follow-up e retorno | `src/lib/automations`, `src/lib/whatsapp/proactive-followup.ts`, `src/lib/inngest/functions.ts` | mesma auditoria, testes `customer-agenda`, `follow-up-runtime`, `intelligent-automations` |
| API IA/LLM e modelos | `src/lib/ai-api`, `src/app/api/v1/ai`, `services/ai-relay` | [integrações/créditos](integracoes-ia-creditos-2026-09-10.md), [segunda rodada](segunda-rodada-api-ia-2026-09-10.md) |
| Carteira e custo | `src/lib/billing`, `src/lib/ai-api/operation-ledger.ts`, `operation-pricing.ts`, SQL de reservas/liquidação | [auditoria financeira histórica](auditoria-creditos-recursos-ia-2026-09-10.md) |
| Documentação pública IA | `src/lib/ai-api/openapi.ts`, documentação/esquemas/guias, `/docs/api#ia` | [guia público](guia-integracao-api-llm.md); use fonte geradora ao editar |
| Catálogo e checkout | `src/lib/sales-catalog`, rotas sales-catalog/checkout e adaptadores | testes `sales-catalog-*`, `whatsapp-*checkout*`, pagamentos |
| Infraestrutura e retorno | configurações privadas da VPS e ambiente de implantação | [Supabase](migracao-supabase-vps-2026-09-11.md), [Inngest](migracao-inngest-vps-2026-09-11.md) |

## Regras de negócio a preservar

- Agentes WhatsApp: o padrão inicial de comportamento segue o painel definido pelo titular (espelho, sempre online, rapport suave, citação inteligente, emojis/figurinhas, mídia proativa, conversa leve, memória do clone e qualidade). Voz própria é escolhida pelo cliente. As preferências editáveis devem ser preservadas ao pausar/salvar/reativar; configurações armazenadas e bloqueios efetivos de execução são separados. Estado de publicação e limites da recuperação de configurações antigas ficam no estado operacional.
- A carteira pode ser compartilhada entre organizações vinculadas. Selecione a tarifa pelo plano da organização responsável e atribua consumo ao executor correto. Custos internos da plataforma usam classificação própria; não criar débito fictício por tarefa administrativa determinística.
- Tarifas ausentes não autorizam geração gratuita. Recursos experimentais exigem acesso e tarifa confirmados. Preserve consumo pendente, reserva e recuperação após falha. Os preços de referência e multiplicadores dos relatórios são históricos, não garantia de margem atual.
- A documentação pública usa ConnectyHub, sem expor credenciais ou nomes privados do fornecedor. A documentação interna pode nomear o provedor para permitir manutenção correta. Não prometa paridade integral apenas por haver catálogo ou endpoints.
- Avisos de plano, pagamento e créditos priorizam o agente escolhido/do cliente; agente indisponível ou ausência de agente no painel usam o remetente da plataforma. Instâncias de clientes que só usam a API não são apropriadas para enviar avisos por conta própria.
- A comunicação do agente ao administrador pode usar primeira pessoa; avisos do remetente global falam do painel/conta. Preserve preferências e opt-out existentes. Não contorne opt-out nem derive autorização para campanhas da mera existência de um telefone.
- Envios WhatsApp devem passar pelos caminhos centralizados de rastreamento, botão/link quando suportado, e arquivo do lead. Confirme limitações do provedor e fallback implementado; a presença de um helper não prova cobertura de todos os caminhos.

## Trabalho e evidência

### Qualidade de atendimento dos agentes

Diretriz do titular em 11/09/2026: todos os agentes do ecossistema devem conversar com naturalidade, entender o contexto e resolver a necessidade do lead, reduzindo abandono causado por respostas mecânicas. Aplicar essa diretriz ao revisar prompts, configurações, fluxos e respostas; não é uma promessa de aprovação em teste de Turing.

Preservar histórico e intenção, responder ao que foi perguntado, evitar repetições e perguntas já respondidas, ajustar extensão e vocabulário à conversa e ao negócio e manter continuidade entre atendimento, agenda e compra. Confirmar ações apenas quando efetivamente concluídas. Quando faltar informação ou autonomia, explicar a limitação e usar o encaminhamento humano configurado.

Naturalidade não exige fingir ser humano: não inventar experiências pessoais, corpo, sentimentos ou ações para convencer o lead de que fala com uma pessoa. Se perguntado sobre a natureza do atendimento, informar que é um assistente de IA. Não inserir avisos repetitivos e desnecessários sobre IA a cada mensagem. Avaliar resolução, precisão, continuidade, honestidade e adequação de tom, em vez de avaliar sucesso pelo engano do interlocutor.

Antes de escrever código Next.js, siga `AGENTS.md` e os guias da versão instalada em `node_modules/next/dist/docs`. Consulte `git status` para preservar mudanças de outros trabalhos. Testes Vitest podem ser locais/simulados; registros de produção e testes de entrega são evidências diferentes.

Crie migrations novas e confira histórico/permissões/RLS no destino quando necessário. Mudança no código não aplica SQL nem publica automaticamente um processo WebSocket. Revise `services/ai-relay/README.md` ao trabalhar com Live.

Atualize o estado operacional após mudanças verificadas e mantenha links para relatórios datados. Uma conversa nova deve conseguir explicar o que funciona, onde roda e quais testes faltam, sem depender de ler transcrições anteriores.
