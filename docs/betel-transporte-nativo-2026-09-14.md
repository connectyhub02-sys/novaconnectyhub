# Betel: transporte independente de WhatsApp

Decisão explícita de 14/09: a Betel administra links, cliques e dossiê dos leads no próprio sistema. A ConnectyHub transporta mensagens; não cria CRM ou rastreamento paralelo para esse fluxo. Substitui a proposta anterior de ampliar o resolvedor CH com eventos de cliques. Nenhuma migration dessa proposta foi criada/aplicada.

## Contrato

- `WHATSAPP_NATIVE_LINK_ORIGINS_JSON` é um mapa exclusivo do servidor, organização autenticada → origem HTTPS. Entrada pretendida: organização Betel `66cb4c5a-35f2-4c08-9982-38bd72d2b9be`, origem `https://betel-leil-es.vercel.app`.
- O gateway deriva a organização da chave WhatsApp e verifica a instância antes de selecionar o modo. Não há opt-out de CRM por campo do payload ou Host.
- Novos envios exigem `track_id` estável. Texto, legendas, URLs e escolhas de menu usam links da origem nativa autorizada e chegam ao provedor sem reescrita, envelope ou botão complementar. Navegação externa é rejeitada com 422; a Betel precisa convertê-la em seu próprio link antes do envio.
- `file` de imagem/áudio/documento e demais recursos de mídia podem permanecer externos. A regra de origem se aplica à navegação, não ao armazenamento de mídia.
- Apenas recibo técnico de operação/idempotência é criado na saída; sem `prepare_whatsapp_outbound`, lead, arquivo de entrega ou link CH. Resultado incerto não autoriza reenvio automático. Payload diferente com mesma chave conserva a proteção contra conflito.
- Replays e retomadas de entregas antigas usam seus recibos/arquivo original. Links antigos e o resolvedor publicado permanecem disponíveis.
- Webhooks de instâncias vinculadas a cliente API dessa organização mantêm deduplicação técnica e encaminhamento para o webhook Betel. A ingestão não cria lead, conversa, mensagem, notificação ou execução de agente CH; não dispara importação de histórico ao reconectar. O recibo de ingestão contém apenas marcador de transporte, hash e identificadores técnicos. A fila/entrega técnica de webhook ainda precisa transportar o payload ao cliente; isso não representa CRM na ConnectyHub.
- Instâncias internas sem vínculo com cliente API e outras organizações mantêm os controles atuais. Uso, quota, cobrança e autorização do gateway permanecem nos caminhos existentes.

## Verificação e ativação

Testes isolados cobrem URL original, mídia externa, rejeição de origem/credencial inválida, idempotência, resultado incerto, replay anterior à ativação, ausência de CRM na saída e nos webhooks, atualização da conexão e isolamento de instâncias/organizações. Não houve envio, clique ou cobrança real.

Código preparado localmente. Ativação requer publicação CH e confirmação da tarefa Betel de que seus links nativos estão Ready; só então adicionar o mapa nativo em produção. A configuração antiga `WHATSAPP_TRACKING_ORIGINS_JSON` foi ativada para o adaptador anterior, após teste HEAD conjunto em 14/09; não significa que o novo modo já esteja ativo. Datas/deploys e observação real devem ser registrados após a ativação.
