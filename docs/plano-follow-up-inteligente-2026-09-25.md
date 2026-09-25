# Plano — Follow-up inteligente nativo (25/09/2026)

Objetivo do titular: um follow-up que o lojista entende mas não precisa configurar. O sistema lê o
comportamento do lead (conversa, loja, pedidos, pagamentos) e escolhe sozinho a jornada, a mensagem
e o momento. A única escolha opcional é o desconto da recuperação de carrinho.

Nada foi implementado; depende de aprovação.

## O que já existe (e será reaproveitado)

| Peça | Onde | Situação |
|---|---|---|
| Liga/desliga da empresa, janela 9h–20h | Automações → `automation_policies` | Funciona; único controle desde `5b5b27d0` |
| Retomada de conversa parada | `proactive-followup.ts` | 2 h de silêncio, no máximo 2 por conversa |
| Recuperação de pedido não pago | `scheduleSalesCatalogOrderAbandonedFollowUp` | **Uma** mensagem, após o tempo de carrinho abandonado (15 min padrão) |
| Pós-venda (recomendação e recompra) | `relationship-profile.ts`, cron 10 min | Existe, mas quase nunca dispara: exige 2 compras pagas ou 3 dias vendo o produto, e só recomenda produto cadastrado nos últimos 14 dias |
| Horário habitual do lead | `observedContactWindow` | Já aprende pelos horários das mensagens, mas só é usado no pós-venda |
| Navegação na loja | `commerce_sessions`, `intelligence_events` | Registra páginas, produtos vistos e carrinho; uso em follow-up exige consentimento de rastreamento |
| Complemento de carrinho | `selectCartComplements` (runtime) | Escolhe produto complementar; hoje só dentro da conversa |
| Proteções | opt-out, pausa humana, revisão de pedido, análise de pagamento | Funcionam e continuam valendo para todas as jornadas |

## Jornadas propostas (sem configuração)

Prioridade quando mais de uma se aplica ao mesmo lead: **pagamento pendente > carrinho/navegação > conversa parada > pós-venda > reativação**. Um lead nunca recebe duas jornadas ao mesmo tempo.

1. **Pagamento não concluído** (pediu Pix/cartão e não pagou) — sequência de 3:
   1. ~30 min: ajuda ("ficou alguma dúvida no pagamento?"); se o cartão foi recusado, oferece Pix.
   2. no dia seguinte, no horário habitual do lead: reforço do benefício do produto e do prazo.
   3. 48 h: última chamada. **Se a loja definiu um desconto**, oferece X% válido por 24 h, aplicado pelo
      servidor naquele pedido (novo link de pagamento com o valor já descontado). Sem desconto definido,
      a terceira é só a última chamada.
   - Aviso antes de o Pix expirar ("quer que eu gere outro?").
2. **Navegou na loja e não comprou** (lead identificado, veio do WhatsApp ou deu consentimento):
   viu produto, colocou no carrinho ou chegou ao checkout e saiu → 1 mensagem em 1–3 h citando **um**
   produto de forma natural ("separei uma opção que combina com o que você estava procurando").
   Nunca "vi que você clicou aqui, aqui e aqui": isso expõe o rastreamento, soa como máquina e é
   arriscado pela LGPD.
3. **Conversa parada**: como hoje (2 h, até 2), mas no horário habitual do lead.
4. **Pós-venda**:
   - D+1 (ou após a entrega/serviço): como foi, se ficou alguma dúvida.
   - D+7 a D+15: cruzamento de carrinho — produto complementar ou relacionado ao comprado (mesma lógica
     do complemento que já existe na conversa, sem exigir produto novo).
   - Recompra: quando o produto acaba (ciclo aprendido das compras, ou estimado pelo tipo; ex.: suplemento
     ~30 dias).
5. **Reativação**: lead que conversou, não comprou e sumiu há 30 dias → 1 mensagem com novidade ou
   produto relacionado ao que perguntou. No máximo 1 por mês.

6. **Aniversário** (decisão de 25/09): o agente pede a data ao lead, de forma opcional, logo depois de
   fechar o pedido e enviar o pagamento (nunca antes, para não atrapalhar a compra). Exemplo: "Se quiser,
   me passa o dia do seu aniversário que eu te mando um presente nesse dia 🎁". Pergunta uma única vez por
   lead; se ele ignorar, não pergunta de novo. Guarda só dia e mês no arquivo do lead, com a data do
   consentimento. O CPF não é usado para isso (não contém a data e a consulta em bureau desviaria a
   finalidade, LGPD). No dia, 1 mensagem do agente no horário habitual do lead, com cupom se a loja tiver
   definido. Como cada lead faz aniversário num dia, os envios já saem espalhados.

## Retornos programados pelo lojista (proposta de 25/09)

Complementa o follow-up inteligente para quem precisa de datas próprias (barbearia, pizzaria, dentista,
advogado). Já existe uma base: na ficha do lead, "Registrar atendimento" com data de retorno
(`customer_lead_visits`, `lead-returns-panel.tsx`), que dispara no dia. Limites atuais: só por lead, sem
repetição, sem regra por produto e só funciona com o follow-up inteligente ligado.

Três níveis:

1. **Por produto ou serviço (regra):** no cadastro do produto, "chamar o cliente de novo X dias depois da
   compra", com opção de repetir. Já vem sugerido pela atividade: barbearia/corte 25 dias; pizzaria 7 dias;
   dentista 1 dia depois do procedimento (como está) e revisão em 6 meses; estética conforme o
   procedimento. O lojista só ajusta se quiser.
2. **Por lead (manual, já existe):** na ficha, botões rápidos (amanhã, 7, 15, 30 dias ou data), opção de
   repetir e um campo "o que falar" (ex.: "perguntar se está doendo", "avisar andamento do processo").
   Uso típico do advogado.
3. **Pelo próprio agente:** quando a conversa marca algo com data ("me chama mês que vem", "volto daqui a
   15 dias", pós-procedimento), o agente registra o retorno sozinho, visível e editável na ficha.

Regras:
- Em Automações ficam dois interruptores independentes: **Follow-up inteligente** e **Retornos
  programados** (ligado por padrão). Dá para usar só os retornos com o inteligente desligado.
- Se o cliente voltou a comprar ou agendar antes da data, o retorno é cancelado e o ciclo recomeça a
  partir da nova compra (o barbeiro não chama quem cortou ontem).
- Retorno programado tem prioridade: o inteligente não manda pós-venda para o mesmo lead 3 dias antes
  ou depois dele. Retornos programados não contam no limite semanal do inteligente (foram pedidos pelo
  lojista), mas respeitam opt-out, pausa humana e a janela da empresa.
- A mensagem é escrita pelo agente, com o produto, a nota e o histórico. Em serviços com agenda, já
  oferece horários para remarcar.

## Fora deste plano

- **Datas comemorativas** (Dia das Mães, Pais, Natal etc.): são disparo em massa. Ficam para a jornada de
  integração com a API oficial da Meta, com número oficial conectado pelo lojista. O sistema continua sem
  disparo em massa pela UAZAPI, para não arriscar bloqueio.

## Regras de segurança (valem para todas)

- Para ao primeiro sinal: o lead respondeu, pediu para sair, um humano assumiu ou o pedido foi pago.
- Limite por lead: no máximo 2 mensagens de follow-up por semana, somando todas as jornadas.
- Sempre dentro da janela da empresa e, quando conhecido, no horário habitual do lead.
- Desconto: só na 3ª tentativa de pagamento, uma vez por lead a cada 30 dias, nunca acumulado com
  outro desconto, sempre aplicado pelo servidor (o agente não inventa desconto).
- Mensagem gerada pelo agente que atendeu, no mesmo estilo, com o contexto real (pedido, produto, conversa).

## O que o lojista vê em Automações

- Liga/desliga (já existe).
- Campo opcional: **"Desconto na última tentativa de recuperação: __%"** (vazio = sem desconto).
- Painel de resultados: mensagens enviadas por jornada e vendas recuperadas (valor).

## Fases (atualizado em 25/09)

1. Pagamento não concluído em 3 passos + desconto opcional + cartão recusado → Pix + aviso de Pix vencendo.
2. Horário habitual do lead em todas as jornadas + limite de 2 follow-ups por semana por lead.
3. Retornos programados (regra por produto com sugestão da atividade, retorno manual com repetição e nota, retorno registrado pelo agente, interruptor próprio).
4. Pós-venda (D+1, cruzamento de carrinho, recompra) + pergunta do aniversário no fechamento + mensagem de aniversário.
5. Navegação na loja e reativação.
6. Painel de resultados em Automações.
