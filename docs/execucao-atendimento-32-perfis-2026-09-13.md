# Execução do plano de atendimento — 13/09/2026

Autorização de implementação/publicação retomada pelo titular após revisão da [auditoria](auditoria-plano-32-perfis-atendimento-2026-09-13.md). Gustavo e Renata são prioridades de entrega; demais módulos permanecem no escopo. Sem mensagens, reservas, pagamentos ou alterações de contatos reais de teste.

Base remota conferida por fetch na retomada: `2301a69311e006348e35052f5899425902ebd491`, sem novos commits em `origin/master`. Rascunho anterior em seis arquivos está sendo revisado, não considerado validado pelo resultado antigo de testes.

| Etapa | Cobertura | Estado / evidência |
|---|---|---|
| P0.1 | C01–C08/C12/C25; intenção, referência, pagamento | Implementado e validado localmente; publicação em preparação |
| P0.2 | C09–C11/C18; links e entrega para todos os emissores | Implementado na fronteira comum e nos emissores; integrações sintéticas aprovadas |
| P0.3 | C12–C18; agenda factual e eventos para ambos | Implementado; reserva/contexto e claim de aviso verificados em SQL; cancelamento para ambos verificado no preparador real |
| P1.1 | C03/C18/C19/C24; busca e variantes | Busca indexada/paginada implementada; 105 itens sintéticos, variantes e isolamento verificados |
| P1.2–1.3 | C20–C22; área/cotação única e horários | Pendente |
| P2.1 | C23/C24; composição de alimentos | Pendente |
| P2.2–2.3 | C14/C20/C25; profissional, serviços e domicílio | Pendente |
| P3 | C26; extensões dependentes de produto | Delimitar contratos e decisões materiais, sem alegação de suporte antecipada |
| Integração/publicação | C27, regressões, tipos/lint/build, SQL, diff, deploy | Pendente |

Relato da Eliane conferido em leitura no banco: dois eventos `paid_plan_renewal_reminder` enviados em 13/09 às 23:25 UTC, para destinatários de conta e de responsável da Vision Business Group. Ambos usaram `/send/menu`, com “Finalizar pagamento”, “Sair da lista” e URL no texto arquivado. A regressão percorre o emissor real de cobrança e a fronteira real de entrega, com HTTP/banco sintéticos, preservando as duas ações e removendo URL de texto/legenda/rodapé/títulos. Nenhuma assinatura, pagamento, contato ou preferência foi alterada.

## Fronteira global de mensagens e inventário

`fetchWhatsappOutbound` preserva recursos de mídia e ações de copiar Pix/ligação, rastreia destinos e remove URLs visíveis antes do HTTP. Divide botões além do limite, separa respostas rápidas de ações URL e preserva o conteúdo do carrossel. Operações com `track_id` estável ganham claim persistente por conexão, hash do pedido e recibos por parte. Retentativa após rejeição definitiva reutiliza as partes gravadas e não reenvia mídia já aceita; timeout, resultado incerto ou outra execução ativa não autoriza repetição. Sem chave estável há arquivo/recibo, mas não se promete deduplicação entre chamadas independentes. Conteúdo sensível continua protegido no arquivo.

| Emissores conferidos | Caminho até a fronteira |
|---|---|
| Agentes de clientes e plataforma, checkout, Pix/cartão, catálogo/galeria, localização | `whatsapp/agent-runtime.ts` → fronteira; fallbacks textuais de URL removidos |
| Eliane, cobrança/vencimento/renovação de plano, destinatários de conta e responsáveis | `billing/platform-billing-webhook.ts` → fronteira; `account-notice-actions.ts` preserva pagamento, cópia e saída |
| Agenda, lembretes e retorno | `automations/agenda-notifications.ts` e `lead-contact-message.ts` → fronteira; consentimento conferido antes do envio |
| Follow-up, handoff e reuniões da plataforma | `whatsapp/proactive-followup.ts`, `handoff-notifications.ts`, `custom-meeting-reminders.ts` → fronteira |
| Atendimento humano, console administrativo e workspace cliente | rotas `dashboard/conversations/reply`, `admin/platform-whatsapp-console.ts`, `whatsapp/client-workspace.ts` → fronteira |
| Campanhas/lotes/canais e API pública | `whatsapp/channel-operations.ts`, rota `whatsapp/uazapi`, `uazapi/client.ts`, `connectyhub-api/gateway.ts` → fronteira; lote convertido preserva destinatários e agendamento |
| Cadastro e pós-pagamento | `account/signup-completion.ts`, `sales-catalog/post-payment.ts`, `payment-review-resolution.ts` → fronteira |
| Respostas Meta fora do WhatsApp | `meta/social-dispatch-policy.ts`: adaptador atual só entrega texto, portanto mensagem com URL falha explicitamente antes do envio; botões Meta ainda não implementados |
| Status WhatsApp | Links rejeitados explicitamente por falta de botão nesse caminho; mensagem direta com botão é alternativa compatível |

URLs de recursos (arquivo/imagem), códigos Pix e URLs técnicas de chamadas não são texto de navegação ao destinatário. Navegação do painel, documentação, webhook de integração e leitura de mídia não foram reescritos. A verificação cobre os emissores encontrados no código; não equivale a teste real de todos os canais/provedores.

## Validação local e limites

- Suíte geral após P0: **2.573 testes aprovados**, sem falhas, em execução com dois workers; TypeScript aprovado.
- Busca de catálogo: seis cenários adicionais com PGlite, incluindo páginas além do lote de 80, item antigo, SKU/atributos, escopo e itens de pedido preservados. A paginação é reconstruída da conversa carregada; buscas genéricas extensas devem ser refinadas. Nunca se conclui ausência absoluta pelo recorte ou falha de consulta.
- Cancelamento após agenda desativada: preparador real gera um aviso para cada audiência e não repete o evento. SQL protege versão, status e claim antes do envio. Opt-out e reset continuam prevalecendo; não há promessa de cancelar um HTTP já iniciado.
- Validação de entrega: **2.581 testes aprovados** na suíte geral, build Next/webpack aprovado com TypeScript, ESLint sem erros (um aviso preexistente de `addMonths` em cobrança). Revisão final preservou o identificador da mídia original na retomada de uma entrega parcial e estreitou o descarte de rascunho para não perder variação; **83 testes complementares aprovados** nos módulos afetados. Testes não fizeram envios, reservas ou transações reais.

## Banco publicado — 13/09/2026

Migrações `0137_agenda_item_context_and_notices`, `0138_whatsapp_outbound_operations` e `0139_catalog_runtime_search` aplicadas transacionalmente no PostgreSQL 17.6 da VPS, com timeout de lock, registro único no histórico e recarga do schema. Hashes MD5 do SQL normalizado para LF: `4370eee70e6030498a7b6d1035ae1bbf`, `67683160b940a4ebaf8f3bfdc89a0b78`, `5b5ca3d0c14f746588d2a3d43e6eb9d6`, respectivamente, idênticos aos arquivos locais. O editor armazenou CRLF; nenhuma diferença de conteúdo.

A transação conferiu hashes dos registros anteriores de reservas, ofertas, avisos e eventos, excluindo apenas as novas colunas vazias: todos preservados. Conferência posterior mostrou uma reserva anterior e zero novos snapshots, dois índices de busca, RLS ativo na nova tabela e quatro RPCs restritas ao serviço (anon/authenticated sem execução). O corpo de `reset_lead_data` permaneceu com hash `c451b2107b57810d176abea29ee8871a`. Nenhuma reserva, cobrança ou mensagem foi executada pela publicação. O aplicativo ainda aguarda envio/verificação da Vercel neste marco.

Resultados de testes e publicação serão registrados conforme realizados, distinguindo simulação, artefato publicado e experiência real do titular.
