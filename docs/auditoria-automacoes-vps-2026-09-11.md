# Auditoria das automações na VPS — 11/09/2026

Foram conferidas individualmente as **43 funções** do Inngest. Nomes e gatilhos do banco da VPS coincidem com o inventário de produção, sem divergências. A aplicação continua hospedada na Vercel; Supabase e Inngest executam na VPS.

A auditoria reúne consultas realizadas aproximadamente entre 13h15 e 13h20 de Brasília. As contagens de execução começam às 06h50, após a troca do Supabase. São fotografias de consultas sucessivas, não um contador em tempo real. Os crons registrados usam UTC; próximas ocorrências abaixo foram convertidas para Brasília.

## Resultado

- **33 funções já tiveram execução na VPS**, das quais 29 tiveram alguma execução depois da troca do banco. Quatro só tinham execução anterior à troca.
- **10 funções ainda não tiveram execução observada:** duas agendas semanais ainda sem horário decorrido e oito gatilhos de eventos sem ocorrência registrada.
- Nenhuma finalização técnica Failed apareceu na janela consultada. Entretanto, **uma resposta WhatsApp falhou funcionalmente** e retornou um objeto failed sem lançar erro, ficando Completed no Inngest.
- **200 testes passaram em 20 arquivos**. São testes locais com fixtures e dependências simuladas; não comprovam entrega externa, cobrança nem todos os cenários de cada função.
- O titular enviou mensagens aos agentes **Gustavo e Kalum** e confirmou respostas normais de ambos. Nenhuma mensagem ou cobrança artificial foi disparada pelo auditor.

**Não é correto declarar todas as 43 automações integralmente validadas.** A infraestrutura e as agendas frequentes estão operando, mas execução de fila vazia, decisão de ignorar e entrega bem-sucedida são resultados distintos.

## Pontos que exigem atenção

### Resposta WhatsApp: uma falha de formato de conversa

O provedor rejeitou uma requisição com a mensagem técnica “Requests ending with a model turn are not supported.” O banco da aplicação registra uma execução failed. Outras respostas concluíram normalmente, incluindo o teste do titular.

Em [agent-runtime.ts](../src/lib/whatsapp/agent-runtime.ts), a função buildGeminiContents mapeia o histórico inteiro e só acrescenta uma mensagem de usuário quando o histórico está vazio. Portanto, permite uma requisição cujo último turno é de saída/modelo. Esse caminho é compatível com a falha observada; o payload completo da requisição rejeitada não foi capturado. Corrigir a seleção/normalização do histórico e acrescentar regressão para esse cenário antes de declarar o caso resolvido.

Além disso, processWhatsappAgentRun captura a exceção e retorna status failed. A função Inngest retorna esse objeto, de modo que o painel mostra Completed. A supervisão deve considerar também o estado funcional em agent_runs; uma alteração de retries precisa preservar os controles de duplicidade de envio. **Nenhuma correção de código deste caso foi aplicada nesta auditoria.**

### Relatório diário administrativo: função parcial

Em [functions.ts](../src/lib/inngest/functions.ts), connectyhubDailyAdminReport apenas registra o horário e devolve ready/admin-daily-operations. Não consulta indicadores, não monta um relatório e não o entrega. A agenda funciona; o relatório de negócio ainda não está implementado nessa função.

### Filas, controles e aprovações

Os sete follow-ups que pareciam antigos tinham horário futuro no evento: entre 13h21 e 13h57 de Brasília. Não estavam vencidos na inspeção. Seis dispatches correspondentes já estavam marcados skipped por opt-out; um permanecia pending. O handler verifica o estado antes de enviar. Houve também um follow-up efetivamente enviado e outro corretamente ignorado após atendimento da conversa.

Os agentes internos de conteúdo que executaram geraram resultados e registraram consumo; requires_human_approval está ativo, justificando needs_approval. O modo internal_shadow corresponde ao centro de custo da própria plataforma, não a débito de um cliente.

O Cost Guard estava fora da janela de execução. Seu motivo not_due e a mensagem de horário não representam falha técnica. Não foi acionado manualmente, pois seu modo de ação inclui exclusão de instâncias.

## Conferência individual

| Automação | Gatilho registrado (UTC) | Execuções desde a troca | Evidência e limite da validação |
|---|---|---|---|
| Agendamentos da API de IA | cron * * * * * | 402 concluídas | Execução observada após a troca. Agendador executa; nenhuma chamada de IA submetida na janela. Falta cenário com agendamento ativo. |
| ConnectyHub AEO Agent | evento connectyhub/growth.aeo.scheduled<br>cron 15 12 * * 2,4 | 0 | Sem execução observada. Sem execução na VPS ainda; cron semanal ocorre às terças e quintas. Próxima: 15/09/2026, 09:15:00. |
| ConnectyHub API Access Guard Sync | evento connectyhub/api.access_guard.sync.requested<br>cron */15 * * * * | 26 concluídas | Execução observada após a troca. Consulta 23 clientes; 5 permitidos e 18 bloqueados por política. Última execução sem erros. |
| ConnectyHub API Health Monitor | evento connectyhub/api.health.requested<br>cron */10 * * * * | 38 concluídas | Execução observada após a troca. Monitor executou; última avaliação com status ok e pontuação 100. |
| ConnectyHub Admin Ping | evento connectyhub/admin.ping | 0 | Execução anterior à troca do banco. Evento diagnóstico concluído na VPS antes da troca do Supabase. |
| ConnectyHub Agenda Notice | evento connectyhub/agenda.notice | 0 | Sem execução observada. Sem evento observado. Testar aviso de reserva com destinatário de teste. |
| ConnectyHub Agenda Notifications | cron */2 * * * * | 200 concluídas | Execução observada após a troca. Preparação/fila executam; nenhum aviso enfileirado na janela. |
| ConnectyHub Blog Agent | evento connectyhub/growth.blog.scheduled<br>cron 0 10 * * 1,3,5 | 1 concluída | Conteúdo gerado; aguarda aprovação. Gerou conteúdo; aprovação humana obrigatória confirmada no banco, sem erro da IA e com consumo registrado no centro de custo interno. |
| ConnectyHub Checkout Payment Reconciliation | cron */5 * * * * | 81 concluídas | Conciliação executa; nenhum pagamento elegível verificado nos fluxos de lojas e plataforma. Falta validar uma conciliação com pagamento real em cenário controlado. |
| ConnectyHub Competitive Intelligence Agent | evento connectyhub/growth.competitive-intel.scheduled<br>cron 30 11 * * 1,3,5 | 1 concluída | Conteúdo gerado; aguarda aprovação. Gerou conteúdo; aprovação humana obrigatória confirmada no banco, sem erro da IA e com consumo registrado no centro de custo interno. |
| ConnectyHub Daily Admin Report | cron 30 11 * * * | 1 concluída | Implementação parcial. Implementação incompleta: registra horário e retorna ready; não compila nem envia relatório. |
| ConnectyHub Eliane Ecosystem Sync | evento connectyhub/eliane.ecosystem.sync.requested<br>cron 0 9 * * * | 0 | Execução anterior à troca do banco. Sincronização anterior à troca do Supabase concluída, seis áreas alteradas e zero alertas; aguarda próxima janela diária. |
| ConnectyHub GEO AGO Agent | evento connectyhub/growth.geo-ago.scheduled<br>cron 0 14 * * 5 | 1 concluída | Conteúdo gerado; aguarda aprovação. Gerou conteúdo; aprovação humana obrigatória confirmada no banco, sem erro da IA e com consumo registrado no centro de custo interno. |
| ConnectyHub Gateway Webhook Delivery | evento connectyhub/gateway.webhook.delivery.requested | 258 concluídas | Execução observada após a troca. Eventos consumidos, zero entregas. Amostra ignora instância não pertencente ao cliente de API; validar entrega elegível. |
| ConnectyHub Growth Research Agent | evento connectyhub/growth.research.scheduled<br>cron 30 8 * * * | 0 | Conteúdo gerado; aguarda aprovação. Gerou conteúdo; aprovação humana obrigatória confirmada no banco, sem erro da IA e com consumo registrado no centro de custo interno. |
| ConnectyHub Intelligent Automation Dispatch | cron */2 * * * * | 201 concluídas | Execução observada após a troca. Varredura executa sem itens vencidos a enfileirar na janela. |
| ConnectyHub Lead Message Archive | cron * * * * * | 401 concluídas | Execução observada após a troca. Trabalho real: 4.030 operações de backfill, 2.780 salvamentos e 1.250 adiamentos na amostra de saídas. Não são necessariamente objetos únicos. |
| ConnectyHub Lead Relationships | cron */10 * * * * | 39 concluídas | Execução observada após a troca. Planejador executa; última saída sem recomendações ou retornos novos. |
| ConnectyHub Market Radar Agent | evento connectyhub/growth.market-radar.scheduled<br>cron 15 9 * * * | 0 | Conteúdo gerado; aguarda aprovação. Gerou conteúdo; aprovação humana obrigatória confirmada no banco, sem erro da IA e com consumo registrado no centro de custo interno. |
| ConnectyHub Meta Organic Publish Sweep | cron */5 * * * * | 79 concluídas | Execução observada após a troca. Varredura executa; nenhuma publicação elegível processada. |
| ConnectyHub Meta Social Agent Queue Sweep | cron */5 * * * * | 81 concluídas | Execução observada após a troca. Varredura executa; nenhuma mensagem/comentário elegível processado. |
| ConnectyHub Meta Social Approved Dispatch | evento connectyhub/meta.social.dispatch.requested | 0 | Sem execução observada. Sem evento observado; validar resposta aprovada em conta de teste. |
| ConnectyHub Meta Social Comment Queue | evento connectyhub/meta.comment.received | 0 | Sem execução observada. Sem evento observado; validar comentário recebido em conta de teste. |
| ConnectyHub Meta Social Dispatch Sweep | cron */5 * * * * | 80 concluídas | Execução observada após a troca. Varredura executa; nenhuma resposta aprovada elegível processada. |
| ConnectyHub Meta Social Message Queue | evento connectyhub/meta.message.received | 0 | Sem execução observada. Sem evento observado; validar mensagem recebida em conta de teste. |
| ConnectyHub News Agent | evento connectyhub/growth.news.scheduled<br>cron 0 7,13,18 * * * | 1 concluída | Conteúdo gerado; aguarda aprovação. Gerou conteúdo; aprovação humana obrigatória confirmada no banco, sem erro da IA e com consumo registrado no centro de custo interno. |
| ConnectyHub Platform Automation Sweep | cron */5 * * * * | 80 concluídas | Execução observada após a troca. Ciclo financeiro e conciliações executam; nenhum débito/recarga/aviso de teste foi disparado. Existem verificações de clientes, mas filas de recargas e avisos estavam vazias. |
| ConnectyHub SEO Agent | evento connectyhub/growth.seo.scheduled<br>cron 45 9 * * 2,4 | 0 | Sem execução observada. Sem execução na VPS ainda; cron semanal ocorre às terças e quintas. Próxima: 15/09/2026, 06:45:00. |
| ConnectyHub Sales Catalog Import Sweep | evento connectyhub/sales-catalog.import.process_requested<br>cron * * * * * | 402 concluídas | Execução observada após a troca. Varredura executa; nenhum job de importação processado na janela. |
| ConnectyHub Uazapi Cost Guard | cron */10 * * * * | 39 concluídas | Execução observada após a troca. Execuções ignoradas por horário (not_due); mensagem de horário em errors não é falha de execução. Modo configurado delete: não disparado artificialmente. |
| ConnectyHub WhatsApp Agent Queue Sweep | cron * * * * * | 401 concluídas | Execução observada após a troca. Fila executa; três processamentos e 15 adiamentos na amostra, com retomada de trabalho real. |
| ConnectyHub WhatsApp Agent Response | evento connectyhub/whatsapp.message.received | 19 concluídas | Falha funcional identificada. 13 saídas completed e uma failed entre 19 execuções técnicas concluídas; houve também controles de cancelamento/duplicidade. Titular confirmou Gustavo e Kalum respondendo. |
| ConnectyHub WhatsApp Catalog Import Sweep | evento connectyhub/sales-catalog.whatsapp_catalog.process_requested<br>cron */5 * * * * | 80 concluídas | Execução observada após a troca. Varredura executa; nenhum job elegível processado. |
| ConnectyHub WhatsApp Clone Profile Import | evento connectyhub/whatsapp.clone_profile.import_requested | 0 | Sem execução observada. Sem evento observado; validar importação de perfil em agente de teste. |
| ConnectyHub WhatsApp Contract Guard | cron * * * * * | 401 concluídas | Execução observada após a troca. Verifica quatro instâncias por passagem; nenhuma pausa necessária na amostra. |
| ConnectyHub WhatsApp Human Handoff Notifier | evento connectyhub/whatsapp.handoff.notify | 0 | Sem execução observada. Sem evento observado; validar transferência humana com destinatário de teste. |
| ConnectyHub WhatsApp Instance Sync | evento connectyhub/whatsapp.sync.requested<br>cron */30 * * * * | 13 concluídas | Execução observada após a troca. Quatro instâncias sincronizadas; última execução sem erro de webhook ou imagem de perfil. |
| ConnectyHub WhatsApp Outbound Dispatcher | evento connectyhub/whatsapp.outbound.requested | 0 | Sem execução observada. Sem evento observado; validar envio agendado em destinatário de teste. |
| ConnectyHub WhatsApp Outbound Sweep | cron */5 * * * * | 80 concluídas | Execução observada após a troca. Varredura executa; nenhum envio agendado elegível processado. |
| ConnectyHub WhatsApp Proactive Follow-Up | evento connectyhub/whatsapp.followup.scheduled | 7 agendadas; 2 concluídas | Execução observada após a troca. Uma saída sent e uma ignorada porque a conversa já foi atendida. Sete execuções futuras conferidas, sem atraso; seis dispatches já bloqueados por opt-out aguardam apenas a checagem final do handler. |
| ConnectyHub WhatsApp Reconnect Catch-up | evento connectyhub/whatsapp.instance.reconnected | 0 | Sem execução observada. Sem evento observado; validar retomada após reconexão de uma instância de teste. |
| Notificações da API de IA | cron * * * * * | 400 concluídas | Execução observada após a troca. Fila executa; nenhuma entrega na janela. Falta webhook de IA real ou destinatário de teste. |
| Renovações das assinaturas das lojas | cron */5 * * * * | 81 concluídas | Execução observada após a troca. Varredura executa; nenhuma renovação elegível preparada ou cobrada. |

## Testes locais executados

Passaram os arquivos relativos a agendamentos e webhooks de IA; automações inteligentes; agenda; follow-up; arquivo de mídia; importação de catálogo e revisão WhatsApp; transferência humana; clonagem; crescimento WhatsApp; reconexão; políticas de agente, envio e publicação Meta; proteção contratual; recarga automática; contratos e lembretes; entrega de notificações; ciclo e cobrança de recursos de IA. Total: 20 arquivos, 200 testes, nenhuma falha.

## Validação funcional restante

1. Corrigir e testar o histórico que termina em resposta do agente; conferir o estado funcional além do status do Inngest.
2. Definir/implementar o conteúdo e a entrega do relatório administrativo diário.
3. Usar contas, instâncias e destinatários de teste para os oito gatilhos sem execução: aviso de agenda; mensagem, comentário e envio aprovado Meta; clonagem; transferência humana; despacho WhatsApp; reconexão.
4. Validar um caso com trabalho real para as filas de IA, agenda, importação, publicação, webhook elegível e cobranças. Chamadas financeiras, de IA e envios a terceiros requerem cenário controlado, evitando cobrar clientes ou enviar mensagens apenas para testar.
5. Conferir as duas agendas semanais na próxima ocorrência, ou preparar missão de teste isolada sem publicação automática.

Evidência agregada, sem credenciais nem conversas: [inventory.json](evidencias/auditoria-automacoes-2026-09-11/inventory.json). Dados detalhados de diagnóstico permanecem restritos na VPS.
