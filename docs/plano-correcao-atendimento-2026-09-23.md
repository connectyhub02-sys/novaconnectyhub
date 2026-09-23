# Plano de correção do atendimento — 23/09/2026

Base: [auditoria-workflows-agente-2026-09-23.md](auditoria-workflows-agente-2026-09-23.md). Plano aprovado para elaboração pelo titular; implementação ainda não iniciada.

## Regra de globalidade (vale para todas as fases)

Nenhuma correção é feita para um cliente específico. Tudo precisa valer para os painéis de teste existentes e para qualquer empresa que se conectar depois.

| Onde a regra fica | Alcance | Decisão |
|---|---|---|
| Motor compartilhado (`agent-runtime.ts`, `proactive-followup.ts`, `human-intervention.ts`, `agenda-agent.ts`) | Todas as empresas, após o deploy | Toda correção de comportamento vai aqui |
| Instrução montada em tempo de execução (`buildSystemInstruction`) | Todos os agentes, antigos e novos | Regras das ferramentas e de honestidade de ação ficam aqui |
| Prompt salvo por agente (`agent_registry.prompt`) | Só o agente onde foi salvo; é copiado na criação | **Não usar** para as correções; agentes antigos não receberiam |
| Configuração por empresa (agenda, pausa humana, follow-up) | Uma empresa | Comportamento padrão seguro no código; nunca depender de ajuste manual |

Proibido nesta leva: consertar registros de um cliente no banco para "fazer funcionar" (por exemplo, preencher o calendário padrão da Renata). A regra geral deve resolver. Situação atual: 3 empresas com WhatsApp conectado e 21 agentes de clientes, todos no mesmo motor.

## Status em 23/09/2026 (branch `fix/atendimento-fase1`, local, não publicado)

| Item | Status |
|---|---|
| 1.1 CEP antes do endereço | Feito, com testes |
| 1.2 Calendário único usado automaticamente (WhatsApp e página pública) | Feito, com testes |
| 1.3 Pendência não silencia o follow-up de conversa; recuperação segue bloqueada; trava contra "alteração confirmada" | Feito, com testes |
| 1.4 Retomada humana (5 min só após despedida; janela configurada no meio da conversa; instrução de continuidade) | Feito, com testes |
| 1.5 URL fora do texto do follow-up (só botão) | Feito |
| 1.6 Frase não é gravada como nome | Feito, com testes |
| 1.7 Nota interna fora do alerta ao responsável | Feito, com teste |
| 1.8 Figurinhas desligadas para todos | Feito (interruptor `stickerDeliveryEnabled`) |
| 1.9 Reconciliação de envio incerto | **Pendente**: exige consulta ao provedor; pacote separado |
| 1.10/1.11 Despedida (tipo de mensagem, vocabulário, joinha conforme contexto, confirmação de espera) | Feito, com testes; nas mensagens reais, 22 de 85 cortesias tratadas (antes 0) |

Validação: suíte completa com 3.483 testes aprovados; 17 falhas sob carga, das quais 15 (SQL/IA/voz) passaram isoladas e 2 dependem do decodificador de áudio ausente na máquina local. TypeScript, ESLint dos arquivos alterados e build de produção (webpack) aprovados. Nenhum teste real no WhatsApp.

## Status da Fase 2 em 23/09/2026 (branch `feat/atendimento-ferramentas`, local)

Implementada para pedidos já abertos, atrás da chave `order_tools: true` nos metadados da instância de WhatsApp (desligada por padrão; nenhuma mudança de comportamento sem ela).

- Seis ferramentas: `ver_pedido`, `buscar_produtos`, `propor_alteracao`, `confirmar_alteracao`, `trocar_forma_pagamento`, `reenviar_pagamento`.
- O cálculo e a aplicação da proposta foram extraídos (`computeRuntimeRevisionProposal`, `applyRuntimeRevisionProposal`) e são os mesmos da rota antiga; 1.444 testes de pedido/checkout passaram após a extração.
- Garantias no servidor: produto e versão do catálogo, quantidade 1–99, confirmação só da proposta enviada (código = início do fingerprint), nunca no mesmo turno em que foi montada, versão do pedido conferida, valores recalculados antes de aplicar, pagamento reaproveitando a sessão ativa.
- A IA escreve só a frase de transição; o resumo oficial e o botão de pagamento são enviados pelo sistema depois dela. Links são removidos do texto.
- Trava de honestidade: se a resposta afirmar uma ação sem ferramenta bem-sucedida no mesmo turno, a IA reescreve uma vez.
- Com a chave ligada, as rotas antigas de revisão e de reenvio de link não rodam para esse pedido, e a resposta não passa pelas travas que substituíam o texto da IA.
- Fora do escopo: pedidos com montagem (alimentação) ou versões repetidas do mesmo produto continuam na rota antiga; primeira compra (Fase 4) e agenda (Fase 3) ainda não usam ferramentas. Em reprocessamento após falha, ações adiadas (resumo/botão) não são reenviadas.

Validação: 10 testes novos (roteiro de 23/09 em versão fictícia), suíte completa 3.497 aprovados; 13 falhas sob carga passaram isoladas (exceto 2 que exigem decodificador de áudio local). TypeScript, ESLint e build aprovados.

## Fase 0 — Regressões antes de mexer

Converter as conversas reais em testes automáticos, com dados fictícios:

- Gustavo 23/09: "cipionato de testo junto…", "dura de 250 mg power lab coloca esse junto", "Tem como parcelar no cartão?", "?", "esse" citando a prévia, "sim muda".
- Gustavo 20–21/09: CEP e endereço em mensagens separadas; "esse" com duas dosagens; pedido anterior substituído sem pergunta.
- Casos de 13/09 já documentados (elogio reenvia checkout, "tirar dúvida" vira remoção, troca exclusiva para Pix).
- Renata: agenda com um recurso e sem calendário padrão; nome gravado errado; nota interna no alerta.
- Retomada humana em conversa iniciada pelo WhatsApp conectado (caso de 22/09).

Critério: os testes reproduzem as falhas atuais antes das correções.

## Fase 1 — Correções rápidas e independentes

Baixo risco; podem ser publicadas antes da Fase 2.

| # | Correção | Ponto no código |
|---|---|---|
| 1.1 | Endereço e CEP combinados de mensagens diferentes do lead | `buildSalesCatalogShippingIntentText` (`agent-runtime.ts:3155`) |
| 1.2 | Empresa com um único calendário ativo usa esse calendário sem configuração extra | `agenda-agent.ts:114` |
| 1.3 | Pendência de revisão expira e não silencia follow-up/recuperação para sempre; o follow-up retoma a pendência em vez de desistir | `hasPendingFollowUpOrderRevision`, estado `checkout_order_revision` |
| 1.4 | Retomada humana conforme a regra do titular (ver abaixo) | `webhook-ingest.ts:319`, `human-intervention.ts:10`, `conversation-ending.ts` |
| 1.5 | URL nunca vai no texto do follow-up; só no botão | `proactive-followup.ts` (validação do texto gerado) |
| 1.6 | Frase que não é nome não é gravada como nome do lead | `lead-names.ts` |
| 1.7 | Nota interna não aparece no alerta ao responsável | fluxo de handoff da agenda |
| 1.8 | Figurinha desativada enquanto o provedor falha em 100% dos envios | envio de sticker |
| 1.9 | Envio com HTTP 503/500 incerto é reconciliado antes de uma nova tentativa, sem duplicar | `outbound-delivery.ts` |
| 1.10 | Despedida: o detector nunca funciona em produção (ver abaixo) | `conversation-ending.ts`, `handleConversationEnding` |
| 1.11 | "Ok" do lead após a despedida disparou "Não consegui concluir a reserva…" da agenda | rota de agenda em `agent-runtime.ts` |

### 1.10 — Despedida

Evidência (23/09): nas mensagens desde 15/08, 85 cortesias curtas do lead ("ok", "obrigado", "tchau", "blz", "👍"…); o detector reconheceu **0**. Causa: ele compara o tipo da mensagem com `conversation`/`extendedTextMessage` em minúsculas, mas a UAZAPI grava `Conversation`/`ExtendedTextMessage`; toda mensagem de texto é tratada como mídia e a conversa "reabre". Os testes passam porque usam tipos em minúsculas ou omitem o tipo. O mesmo erro afeta a verificação `conversation_ended` do follow-up, que pode escrever para quem já se despediu.

Mesmo com o tipo corrigido, só 6 das 85 seriam reconhecidas: as listas de palavras não cobrem "top", "blz", "abraços", "fique com Deus", nem as despedidas geradas pela IA ("Um abraço e boa noite!"). Casos reais: "Obrigado" → "Por nada! Até mais!" → "Ok" → resposta de agenda; "👍" → resposta → "👍" → resposta.

Correção, válida para todos os agentes:

1. Comparar o tipo sem diferenciar maiúsculas; testes com os tipos reais da UAZAPI.
2. Regra dura: depois que o agente se despediu, cortesia ou emoji do lead não recebe resposta. No máximo uma despedida do agente por encerramento.
3. Reconhecimento de encerramento feito pela IA com o contexto (na Fase 2, a opção "não responder"), e não só por lista de palavras. A lista fica como proteção mínima.
4. Cortesia junto com uma pergunta nova continua sendo respondida.
6. O significado de "👍", "ok", "sim", "beleza" e da reação 👍 depende da última mensagem do agente (regra do titular, 23/09):
   - depois de pergunta ou proposta ("vamos levar esse produto?") é **resposta/confirmação** e segue para o atendimento (na Fase 2, vale como aceite da prévia vigente);
   - depois de despedida do agente, sem nada pendente, é **encerramento** e não recebe resposta;
   - em qualquer outro caso, na dúvida, é tratado como resposta, nunca como despedida.
   Regressões: "vamos levar esse produto?" → 👍 segue a venda; "Até mais!" → 👍 silêncio; reação 👍 aplicada a uma pergunta = confirmação.
5. Encerramento reconhecido não aciona agenda, checkout nem follow-up; o follow-up respeita o encerramento feito pelo lead.

### 1.4 — Regra da retomada humana (decidida pelo titular em 23/09)

Regra de negócio: o humano assume e o agente para. Cada mensagem do humano reinicia a janela configurada (60 min). O fallback de 5 min existe só para quando o humano **já encerrou** a conversa e o lead volta a perguntar dentro da janela.

Hoje o código aplica os 5 min a qualquer mensagem do lead sem resposta, mesmo no meio da negociação (`webhook-ingest.ts:319`, constante `HUMAN_INTERVENTION_UNANSWERED_LEAD_MINUTES = 5`). Isso causou a entrada do agente na conversa da Renata em 22/09, sete minutos depois da pergunta "Pede quanto".

Correção:

1. Fallback de 5 min somente se a última fala do humano encerrou a conversa (despedida/agradecimento sem pergunta pendente), reaproveitando `conversation-ending.ts` sobre as mensagens do humano. Na dúvida, considerar a conversa ativa.
2. Conversa ativa (sem despedida): o lead aguarda o fim da janela configurada; o agente só assume depois disso.
3. Conversas iniciadas pelo próprio cliente (prospecção) seguem a mesma regra, sem exceção.
4. Ao assumir, o agente recebe na instrução que um humano conduzia a conversa, quem a iniciou e o assunto em andamento. Continua a partir da última pergunta do lead, sem cumprimentar de novo nem pedir dados já informados, e sem inverter papéis (por exemplo, quando o cliente era quem prospectava).
5. Janela configurada por instância preservada; comportamento vale para todas as empresas.

Regressões: caso Renata/Vagner (conversa ativa → agente não entra antes de 60 min); humano se despede e o lead pergunta depois → agente responde em 5 min, com contexto.

## Fase 2 — Ferramentas para pedido e pagamento (núcleo)

Objetivo: a IA interpreta a conversa e o servidor executa e valida.

Ferramentas (Gemini function calling), todas limitadas à empresa, ao lead e à conversa atuais:

- `buscar_produtos(texto)` devolve itens do catálogo com IDs, versões e preços reais.
- `ver_pedido()` devolve itens, total, frete, forma de pagamento, pendências e se o pagamento foi enviado.
- `propor_alteracao(itens, forma_pagamento)` gera a prévia com fingerprint; não altera o pedido.
- `confirmar_alteracao(fingerprint)` só aplica a prévia vigente, depois de aceite do cliente no turno.
- `gerar_pagamento(metodo)` e `trocar_forma_pagamento(metodo)` reutilizam sessão, revisão e idempotência atuais.

Regras:

1. Reutilizar as funções existentes de revisão, prévia, cancelamento do checkout anterior, sessão de pagamento e idempotência. Não reescrever o financeiro.
2. As regex de revisão deixam de interceptar a mensagem nos caminhos cobertos pelas ferramentas. As travas que substituem a resposta da IA por texto fixo (`agent-runtime.ts:11303`, `:8358`) são retiradas nesses caminhos.
3. Nova garantia estrutural, sem regex de verbo: a IA só pode declarar pedido alterado, pagamento gerado ou método trocado se a ferramenta correspondente retornou sucesso no mesmo turno. Caso contrário, a resposta é regenerada com o estado real.
4. Dúvida no meio da compra ("tem como parcelar?") é respondida sem mexer no pedido.
5. Limites por turno: número máximo de chamadas de ferramenta, tempo e custo medidos.

Aceite: o roteiro de 23/09 (trocar para Pix, incluir Durateston falando naturalmente, perguntar parcelamento, mudar para cartão) termina com pedido correto, um link válido e nenhuma afirmação falsa.

## Fase 3 — Agenda por ferramentas

`consultar_horarios(item)`, `reservar(item, horario)`, `cancelar(reserva)`, com a reserva atômica e as notificações atuais. Vínculo do imóvel escolhido na reserva; local real ou pergunta explícita, sem inventar endereço.

## Fase 4 — Primeira compra por ferramentas

Montagem do carrinho, frete, dados de cobrança e checkout inicial no mesmo modelo, removendo as regex restantes de intenção de compra.

## Publicação para todos

1. Chave por organização (`runtime_tools`) apenas para a transição: ligar primeiro em BuffaloMass e Renata Macedo e testar com o número do titular.
2. Se o roteiro de aceite passar, ligar para todas as empresas e deixar ligada por padrão para empresas novas. Remover a chave e o caminho antigo quando estável.
3. Fase 1 não usa chave: vale para todos no deploy.
4. Monitorar: execuções com falha, respostas substituídas, ações declaradas sem ferramenta, follow-ups pulados por pendência e envios incertos.

## Fora desta leva

Agentes de conteúdo (pausados em 23/09), grupos e canais, blog. Compliance dos produtos vendidos continua como risco de negócio registrado, fora do escopo técnico deste plano.
