# Auditoria dos comportamentos do agente — 25/09/2026

Escopo: cada controle da aba **Comportamento** (painel do cliente), rastreado do painel até o runtime
(`src/lib/whatsapp/agent-runtime.ts`), mais a configuração gravada em produção da BuffaloMass
(Gustavo `aa799252…`, instância `66aa4603…`; Luna `6f28c4a4…`, instância `e1f1be4b…`) e as mensagens
reais da conversa de teste de 25/09 (`7b0a8712…`).

Onde o painel grava: agente (`whatsapp_behavior_config`) e conexão (`behavior_config`) ao mesmo tempo;
o runtime lê a conexão primeiro. Gustavo: agente e conexão idênticos. Luna: só a voz diverge (a conexão,
que vale, usa "Claudia - Bubbly European").

## Achados

| # | Gravidade | Controle | Situação |
|---|---|---|---|
| 1 | Alta | Temporizadores entre blocos, Citações, idempotência | Com as ferramentas de pedido ligadas (`order_tools`), quase todo turno sai por `sendOrderToolTurn`, que não pausa com "digitando" entre blocos (bolhas a ~1 s), nunca cita mensagem, corta a resposta em 4 blocos e não reaproveita blocos já enviados num retry. Evidência: todos os turnos de 25/09 com `chunk_index` 0-based e `quoted` vazio, inclusive quando o cliente mandou 3 mensagens seguidas. Introduzido nas fases 2/4. |
| 2 | Alta | Intervenção humana (oculto) | Luna está com `humanIntervention=false`, controle que não existe no painel do cliente. Efeito: se alguém da empresa responder, a Luna não pausa; se o cliente pedir um humano, ela não faz o handoff. Gustavo está `true`. Origem provável: reset antigo ao desativar o agente. |
| 3 | Média | Figurinhas | Desligadas globalmente no código (`stickerDeliveryEnabled = false`, o provedor devolvia HTTP 500), mas o painel mostra o controle ligado como se funcionasse. |
| 4 | Média | Temporizadores (campos) | Só valem com "Temporização inteligente" ligada. Na Luna está desligada: os 15 campos ficam editáveis mas não têm efeito, e ela responde sem agrupar mensagens. O painel não indica isso. |
| 5 | Média | Janela da IA | Fora do horário a mensagem é descartada (`outside_ai_schedule`) e não é respondida quando a janela abre. |
| 6 | Baixa | Follow-up proativo | A seção não aparece no painel do cliente; vale a política de Automações ou o valor salvo (Gustavo ligado, Luna desligado). |

## Controles verificados sem problema no código

Agente ativo, Marcar como lido, Presença (Só atendimento / Natural / Sempre online), Atendimento na loja
e modo (corrigido hoje em `a0ffebb3`), Modo de conversa (Texto / Áudio / Espelho, inclusive no caminho das
ferramentas), Rapport adaptativo, Estilo de conversa, Reações com emoji (enviadas antes de qualquer caminho),
Emojis nas respostas, Mídia proativa e Conversa leve (instruções do prompt, compartilhado pelos dois
caminhos), limites de Imagens/Vídeos/Documentos, Reativar agente (usa os minutos configurados quando a
intervenção humana está ativa). Testes de comportamento existentes: 6 arquivos, 57 testes verdes.

## Plano de correção proposto (aguardando aprovação)

1. `sendOrderToolTurn` passa a usar a mesma entrega do envio normal: pausa com "digitando" entre blocos
   (`resolveChunkDelayMs`), citações (`resolveOutboundReplyTargets`), sem corte em 4 blocos e com
   reaproveitamento de blocos já enviados. Teste de regressão no `whatsapp-cart-tools`.
2. Intervenção humana sempre ativa para agentes ativos (`forceStandardBehaviorForActiveAgents`), conforme
   a regra de negócio da pausa de 60 min. Vale para agentes existentes e novos, sem patch por cliente.
3. Painel: Figurinhas marcada como "indisponível no momento"; campos de temporizador esmaecidos com aviso
   quando a temporização inteligente está desligada.
4. Decisões do produto: responder quando a Janela da IA abrir? mostrar o Follow-up no painel do cliente?
