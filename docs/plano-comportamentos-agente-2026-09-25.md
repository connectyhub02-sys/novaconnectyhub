# Plano de implementação — comportamentos do agente (25/09/2026)

Base: [auditoria de 25/09](auditoria-comportamentos-agente-2026-09-25.md) e a especificação da UAZAPI
em `uazapi-openapi-spec.yaml`. Nada foi implementado ainda; cada fase depende de aprovação.

## Decisões do usuário (25/09)

- **Janela da IA**: continua configurável pelo usuário. Desligada, o agente atende 24 h; ligada, tem de funcionar.
- **Intervenção humana**: padrão do sistema em todos os agentes, sem botão.
- **Follow-up**: liga/desliga por agente, visível no painel. A orientação é manter ligado.
- **Temporização inteligente e os 15 temporizadores**: padrão do sistema, sempre ligados e fora do painel.
- **Áudio e mídia com IA**: um botão liga/desliga (nasce ligado), mantendo os limites de imagens, vídeos e documentos.
- **Digitando, gravando e citação**: sempre presentes.
- Vale para **todos os agentes**: atuais, antigos e novos.

## Princípio de segurança

1. Os padrões do sistema são aplicados na leitura da configuração (`forceStandardBehaviorForActiveAgents`),
   não com alteração no banco. Vale na hora para todos os agentes, e um `git revert` desfaz tudo.
2. Nada muda nos prompts, nas regras de venda, nas ferramentas de pedido ou no fluxo de pagamento.
3. Cada fase é um commit separado, com teste que falha antes e passa depois, suíte completa verde,
   deploy conferido em `/api/health` e reteste com o número 554788577996.
4. Mudanças em quem recebe mensagem (Janela da IA, chamadas) têm teste de "não responder duas vezes"
   e "não responder quando um humano assumiu".

## Fase A — correções no atendimento (sem mudança no painel)

- **A1. Envio das ferramentas igual ao envio normal.** `sendOrderToolTurn` passa a usar a mesma entrega por
  blocos do `sendAgentResponse`: "digitando" com pausa entre blocos (`resolveChunkDelayMs`), citação pela
  regra inteligente (`resolveOutboundReplyTargets`), sem corte em 4 blocos e com reaproveitamento de blocos
  já enviados num retry (`loadPersistedOutboundChunks`). Áudio continua com "gravando". Teste: 3 blocos saem
  com pausa, citação, sem repetir em retry.
- **A2. Intervenção humana fixa.** `humanIntervention`, `detectHumanRequest` e `humanHandoffAiDetection`
  forçados para agente ativo. Corrige a Luna. Teste: humano responde → agente pausa 60 min; lead pede humano →
  handoff.
- **A3. Temporização inteligente fixa.** `smartTiming` forçado e os 15 tempos fixados nos padrões do sistema
  (texto 6 s, textos seguidos 9 s, áudio 10 s, foto 16 s, vídeo 18 s…). "Reativar agente" fica em 60 min pela
  regra de negócio. Teste: rajada de mensagens agrupada; tempos do painel antigo ignorados.

## Fase B — painel mais simples

- **B1.** Remover a seção Temporizadores e o botão Temporização inteligente (e o item do resumo lateral).
- **B2.** Seção Follow-up visível no painel do cliente, por agente: ligar/desligar, espera e máximo por conversa.
  Agentes novos nascem com follow-up ligado; os atuais mantêm o que têm (Gustavo ligado, Luna desligado).
- **B3.** "Áudio e mídia com IA" ganha liga/desliga (nasce ligado), controlando imagens, vídeos e documentos e
  mantendo os três limites. Hoje esses três estão forçados ligados no código; o forçamento sai. A transcrição de
  áudio continua sempre ligada. Desligado, o agente não analisa o arquivo e pede ao cliente, com naturalidade,
  que diga o que precisa.
- **B4.** Figurinhas aparecem como "indisponível no momento" enquanto o provedor falhar.
- **B5. Janela da IA funcionando de verdade.** Hoje a mensagem fora do horário é descartada e nunca respondida.
  Proposta: fora do horário o agente não responde; quando a janela abre, responde as conversas que ficaram sem
  resposta, desde que nenhum humano tenha respondido e que a mensagem tenha menos de 24 h.

## Fase C — comportamentos novos com a UAZAPI (teste de Turing)

Ordem pelo impacto na percepção humana e pelo risco:

- **C1. "Digitando…" durante o raciocínio.** Hoje o cliente vê "lido" e fica até 40 s sem nenhum sinal enquanto
  o modelo pensa (turnos com ferramentas), e só então aparece "digitando". A UAZAPI mantém a presença por até
  5 min e a cancela sozinha ao enviar (`/message/presence`). Mostrar "digitando" (ou "gravando", quando a
  resposta for áudio) durante a geração, com pausas naturais.
- **C2. Ligação recebida.** Hoje, se o cliente liga para o número do agente, nada acontece. Um vendedor recusaria
  e escreveria "tô sem conseguir atender ligação agora, me fala por aqui?". Assinar o evento `call`, recusar
  (`/call/reject`) e mandar uma mensagem curta no estilo do agente, uma vez por conversa.
- **C3. Esperar o cliente terminar de digitar.** O evento `presence` já chega no webhook, mas é ignorado. Se o
  cliente está digitando ou gravando, o agente espera antes de responder, como uma pessoa faria. Antes de tudo,
  confirmar com o número de teste que a UAZAPI entrega esse evento para contatos.
- **C4. Prévia de link.** Links enviados como texto saem hoje sem prévia (`linkPreview: false`); os de uma pessoa
  saem com prévia. Ligar a prévia nos links em texto; os botões continuam iguais.
- **C5. Etiquetas do WhatsApp Business (opcional).** Sincronizar a etapa do CRM em etiquetas (`/chat/labels`),
  para o humano ver no celular. Não muda o que o cliente vê.

### Avaliados e não recomendados agora

- **Corrigir mensagem já enviada** (`/message/edit`, o antigo "correções no meio da mensagem"): parece humano,
  mas pode editar preço ou resumo de pedido. Só com regra estrita (nunca em mensagens comerciais), depois das fases A–C.
- **Botão Pix nativo** (`/send/pix-button`, `/send/request-payment`): aceita só chave estática; o Pix da Asaas é
  dinâmico e rastreado por pedido. Trocaria a confirmação automática por conferência manual.
- **Erros de digitação intencionais**: já desligados; mantidos assim.
