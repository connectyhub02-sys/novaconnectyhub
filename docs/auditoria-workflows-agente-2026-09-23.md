# Auditoria dos workflows do agente — 23/09/2026

Auditoria somente leitura, autorizada pelo titular: código atual da master e banco de produção (Supabase VPS). Nenhuma mensagem, pedido, pagamento, reserva ou configuração foi alterado. Contagens de 01–23/09/2026, salvo indicação. Dados pessoais omitidos.

## Mapa dos fluxos que falam com o lead

| # | Fluxo | Gatilho | Onde está |
|---|---|---|---|
| 1 | Atendimento | Webhook UAZAPI → `whatsapp-agent-response`; varredura a cada 1 min; recuperação após reconexão | `webhook-ingest.ts`, `agent-runtime.ts` (~20 mil linhas), `outbound-delivery.ts`, `outbound-links.ts` |
| 2 | Rotas determinísticas dentro do atendimento | Regex sobre o texto do lead: revisão de pedido, checkout, pagamento, agenda, links, mídia | `order-revision-intent.ts`, `agent-runtime.ts`, `agenda-agent.ts` |
| 3 | Intervenção humana | Mensagem enviada pelo WhatsApp conectado pausa o agente; se o lead ficar 5 min sem resposta, o agente retoma | `human-intervention.ts` |
| 4 | Follow-up de conversa e recuperação de carrinho | Cada execução grava `automation_dispatches`; varredura a cada 2 min; ~40 verificações; Gemini gera o texto; botões "Continuar pagamento" + "Sair da lista" | `automations/dispatch.ts`, `proactive-followup.ts` |
| 5 | Pós-pagamento | Webhooks Asaas/PagBank/Mercado Pago + reconciliação a cada 5 min | `sales-catalog/post-payment.ts` |
| 6 | Agenda | Rota no atendimento + avisos a cada 2 min | `agenda-agent.ts`, `agenda-notifications.ts` |
| 7 | Grupos, canais e status | Campanhas em `content_pipeline_items` → dispatcher/varredura de saída | `channel-operations.ts` |
| 8 | Agentes de crescimento (notícias, blog, SEO, AEO, GEO) | Cron várias vezes ao dia → conteúdo e execuções aguardando aprovação | `inngest/functions.ts`, `growth` |
| 9 | Plataforma → clientes (trial, cobrança, créditos) | Varredura a cada 5 min; 29 fluxos ativos | `platform-automation-sweep` |
| 10 | Perfil de relacionamento / janela de contato | A cada 10 min | `relationship-profile.ts`, `contact-window.ts` |

Volume real: 333 execuções do agente em 14 dias; 113 follow-ups agendados no mês, **3 enviados**; 9 pedidos desde agosto, **nenhum pago**.

## Falhas da conversa de 23/09 com o Gustavo (troca de produto/pagamento)

Sequência lida no banco e interpretador reproduzido localmente com as frases exatas.

| Frase do lead | Resultado | Causa |
|---|---|---|
| "troca por pix vou pagar no pix" | Pix de R$ 1.750 gerado | Funcionou |
| "coloca um cipionato de testo junto para eu pagar tudo junto" | Pediu nome completo | Parser: produto = "cipionato de testo junto para eu pagar tudo" |
| "dura de 250 mg power lab coloca esse junto" | Pediu nome e quantidade | Parser só lê após o verbo: produto = "esse" |
| "Tem como parcelar no cartão?" | Reenviou o resumo do pedido | IA respondeu certo; trava `agent-runtime.ts:11303` trocou pela prévia |
| "?" | "O pagamento ainda não foi enviado…" | IA respondeu certo; trava de recuperação `agent-runtime.ts:8358` substituiu |
| "esse" (citando a prévia) | "alteração confirmada no Pix…" | **Alucinação**: nada aplicado; a trava de ação não executada não reconhece "confirmada" |
| "sim muda" (para cartão) | Pediu nome do produto | Parser sem contexto da pergunta: `clarify/ambiguous` |

Estado final no banco: pedido só com Mounjaro, R$ 1.750, Pix aberto; revisão com `pending_intent: clarify/ambiguous`. O lead acredita em R$ 2.001,90 com Durateston no cartão.

Falhas anteriores (20–21/09): CEP pedido 3× porque `buildSalesCatalogShippingIntentText` extrai endereço e CEP só da última mensagem que tiver um dos dois (`agent-runtime.ts:3170`); "esse" escolheu 30 mg entre duas dosagens; o pedido anterior foi substituído sem pergunta. Renata: agenda ativa com um único recurso, mas sem calendário padrão nem imóvel vinculado (`agenda-agent.ts:114`); nome do lead gravado como "então preciso mudar"; nota interna vazou no alerta ao responsável.

## Novas falhas encontradas nos workflows

| ID | Prioridade | Fluxo | Falha | Evidência |
|---|---|---|---|---|
| W1 | P1 | 2 + 4 | Pendência de revisão sem prazo silencia **todo** o follow-up e a recuperação do lead (`order_revision_pending`). Uma frase mal interpretada encerra a venda sem aviso. | 5 dispatches pendentes da conversa de 23/09 serão ignorados; 1 recuperação já ignorada no mês por esse motivo |
| W2 | P1 | 3 | Retomada automática após 5 min (constante fixa; configurado 60 min) em conversa **iniciada pelo humano**. O agente assumiu uma prospecção da própria corretora: recumprimentou, pediu o nome e tratou o vendedor dos lotes como lead. | Conversa da Renata em 22/09, 11:04 → 11:11 |
| W3 | P1 | 1 | Na mesma conversa, 4 respostas seguidas com HTTP 503 (texto e áudio) ficaram `uncertain`; o áudio do lead ficou sem resposta confirmada e a conversa parou. | `whatsapp_outbound_deliveries` 22/09 11:14–11:16 |
| W4 | P1 | 5 | Pós-pagamento nunca rodou com uma venda paga do agente nos registros atuais. | 0 pedidos pagos desde agosto |
| W5 | P2 | 4 | Follow-up de recuperação envia a URL crua no texto além do botão (texto gerado pela IA não é limpo). | Mensagem de 21/09 12:29 |
| W6 | P2 | 4 | Saída da lista provavelmente acidental: a cliente saiu 25 s após receber o follow-up e continuou conversando e comprando; ficou fora de todas as automações. | Lead de 11/09, origem `public_link` |
| W7 | P2 | 1 | Figurinhas: 100% de falha (8/8 com HTTP 500). | Setembro, três organizações |
| W8 | P2 | 7 | Grupos e canais sem operação: 20 de 22 grupos desativados, nenhum envio desde 28/08, grupo principal (154 membros) em modo observador. Geração de tráfego não validada. | `whatsapp_channel_targets`, `content_pipeline_items` |
| W9 | P3 | 8 | Agentes de crescimento **da própria ConnectyHub** (escopo `platform`, não de clientes) rodam por cron desde 06/06 sem revisão: 406 itens (214 notícias em `idea`, 110 pesquisas em `researching`, 34 blogs em rascunho), nenhum publicado no site; 98 execuções aguardando aprovação. Custo baixo (152 execuções e ~170 mil tokens em setembro). Decidir entre revisar/publicar pelo admin (`/admin/conteudo`, `/admin/aprovacoes`) ou pausar os crons. | `agent_runs`, `content_pipeline_items` |
| W10 | P2 | 4 | 4 follow-ups falharam com "Não foi possível conferir os responsáveis do agente" (18/09). | `responsible-attendance.ts:77` |
| W11 | P3 | 4 | Dispatches criados para leads que já saíram da lista (35 para 2 leads). | Desperdício de processamento |
| W12 | P3 | 1 | "Requests ending with a model turn are not supported" do Gemini (2 execuções, última em 11/09); o builder principal já protege. Monitorar outros caminhos. | `agent_runs.error_message` |

## Causa comum e direção

A maioria das falhas de atendimento vem de regras de texto decidindo ações e substituindo respostas corretas da IA. Direção proposta: ferramentas (function calling) para pedido, pagamento e agenda, com as garantias atuais preservadas no servidor, e a IA só declarando uma ação após sucesso da ferramenta. W1–W3 e W5 devem entrar na mesma leva: expiração da pendência, retomada que respeita conversas iniciadas pelo humano e o histórico, reconciliação de envio incerto e remoção de URL do texto gerado.

## Limites

Não foram enviados testes reais. O modo e os envios dos grupos foram inferidos de configuração e registros, sem abrir o WhatsApp. A intenção da saída da lista (W6) é inferida do comportamento posterior, não confirmada pela cliente. Contagens refletem os registros atuais, após resets de teste.
