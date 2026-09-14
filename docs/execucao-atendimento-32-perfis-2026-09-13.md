# Execução do plano de atendimento — 13/09/2026

Autorização de implementação/publicação retomada pelo titular após revisão da [auditoria](auditoria-plano-32-perfis-atendimento-2026-09-13.md). Gustavo e Renata são prioridades de entrega; demais módulos permanecem no escopo. Sem mensagens, reservas, pagamentos ou alterações de contatos reais de teste.

Base remota conferida por fetch na retomada: `2301a69311e006348e35052f5899425902ebd491`, sem novos commits em `origin/master`. Rascunho anterior em seis arquivos está sendo revisado, não considerado validado pelo resultado antigo de testes.

| Etapa | Cobertura | Estado / evidência |
|---|---|---|
| P0.1 | C01–C08/C12/C25; intenção, referência, pagamento | Publicado; validação sintética e deploy verificados |
| P0.2 | C09–C11/C18; links e entrega para todos os emissores | Implementado na fronteira comum e nos emissores; integrações sintéticas aprovadas |
| P0.3 | C12–C18; agenda factual e eventos para ambos | Implementado; reserva/contexto e claim de aviso verificados em SQL; cancelamento para ambos verificado no preparador real |
| P1.1 | C03/C18/C19/C24; busca e variantes | Busca indexada/paginada implementada; 105 itens sintéticos, variantes e isolamento verificados |
| P1.2 | C20–C22; área e cotação única | Publicado em 96bfae2; migrations 0140–0141 aplicadas e verificadas |
| P1.3 | C22; horários de operação | Implementado; validação e publicação em conclusão |
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

A transação conferiu hashes dos registros anteriores de reservas, ofertas, avisos e eventos, excluindo apenas as novas colunas vazias: todos preservados. Conferência posterior mostrou uma reserva anterior e zero novos snapshots, dois índices de busca, RLS ativo na nova tabela e quatro RPCs restritas ao serviço (anon/authenticated sem execução). O corpo de `reset_lead_data` permaneceu com hash `c451b2107b57810d176abea29ee8871a`. Nenhuma reserva, cobrança ou mensagem foi executada pela publicação. Aplicativo publicado conforme verificação abaixo.

Resultados de testes e publicação serão registrados conforme realizados, distinguindo simulação, artefato publicado e experiência real do titular.

## Aplicativo publicado — 13/09/2026

Commits `8a4d893` e `c4010b1` enviados à master. Vercel `dpl_UTuojL48rHZGLvvcHEQsECVpYGgn` Ready / Latest / Production, concluída às 21:27:48 BRT, com domínio principal vinculado e fonte `c4010b1aba381e636d6be7ac30441add358740bf` conferida. Home/login HTTP 200 e status de checkout inexistente HTTP 404 esperado. Inngest após a primeira publicação: GET assinado HTTP 200, autenticação aprovada, 43 funções. O complemento de reserva legada sem snapshot passou 13 testes e ESLint. P0 e P1.1 disponíveis para reteste do titular, sem alegação de novo atendimento real validado. P1.2 em desenvolvimento; demais pendências da tabela permanecem.

## Entrega regional compartilhada — P1.2

Conversa, pedido inicial, endereço salvo, checkout público, edição de entrega, ofertas adicionais e revisão usam o mesmo cálculo regional. Configuração inclui bairro e cidade, faixa fechada de CEP, raio ou polígono; critério explícito (automático/localização/CEP/endereço), prioridade de sobreposição, mínimo e isenção sobre o subtotal completo. No automático, localização recebida prevalece quando há geometria; depois faixa de CEP; depois bairro e cidade. Um resultado fora da área não usa outro critério para liberar a mesma entrega local. Sobreposição de maior prioridade empatada exige conferência. Uma alternativa de frete nacional continua disponível somente se habilitada e atendida na tabela da loja. Entrega local aplicável é a opção inicial; retirada exige habilitação e escolha explícita.

Coordenadas são vinculadas ao endereço e CEP confirmados; mudar o destino invalida o ponto anterior. Checkout permite informar o ponto ou solicitar a própria localização por ação do comprador, sem geocodificação automática nem localização presumida. A confirmação no WhatsApp preserva o pin recebido depois do endereço da compra atual. A revisão salva o snapshot dentro da transação existente, mantendo claims, bloqueio de pagamento e idempotência. Frete personalizado permanece pendente. As faixas não representam novas áreas ativadas para empresas reais.

Validação: 2.612 testes gerais aprovados; após os complementos finais, 98 testes focados e 54 SQL aprovados. TypeScript, ESLint sem erros e build Next/webpack aprovados. Conferência visual dos componentes reais em prévia isolada, desktop e 390px; HTTP fictício no checkout, sem banco/contatos/transações reais. Alterar endereço removeu coordenadas e a opção antiga; novo cálculo solicitou localização.

Migration `0140_revision_delivery_snapshot` aplicada em transação, MD5 do SQL normalizado `b5fc785ab7597a585615fdba84abe3da`, idêntico ao arquivo. Alteração restrita a dois corpos de função, com hashes antes/depois; nenhuma atualização de registros de pedidos/clientes na publicação. O hash do corpo de reset normalizado permaneceu `263f7828053dc20e10505a043f79f84d`. Aplicativo desta etapa ainda em preparação de publicação; horários, alimentação e serviços permanecem pendentes.

Conferência posterior à 0140 encontrou `set_checkout_delivery` com execução também por anon/authenticated, apesar do contrato local de serviço. Migration adicional `0141_checkout_delivery_rpc_permissions` restringe o acesso a service_role; único chamador no aplicativo é a rota validada de checkout via serviço. MD5 do SQL normalizado `2bc6c3a2336860a4cdbce0f8506ff894`; 29 testes SQL, incluindo permissões, aprovados. Nenhum corpo financeiro ou registro de cliente foi alterado por essa correção de acesso.

P1.2 publicado na master em `96bfae204c15969782ff79093d65e6c8dd4c19e2`: Vercel `dpl_9aeetRfhCprBQ4sjSEhG1iHuTVtX` Ready / Latest / Production em 13/09 às 22:05:10 BRT (14/09 01:05:10 UTC), domínio principal vinculado. 0141 confirmada com anon/authenticated sem execução e service_role com execução. Reteste real de clientes permanece com o titular. P1.3 continua nesta tarefa.

## Horários operacionais — P1.3

Configuração opcional, inicialmente desativada, no painel do catálogo: fuso IANA, janelas distintas de recebimento, preparo, entrega e retirada, intervalos, virada da meia-noite, datas fechadas e pausa temporária. Nenhum horário, feriado ou tempo de produção foi ativado para empresa real. Estimativas opcionais de preparo/entrega são conferidas contra as janelas; não inferem disponibilidade de equipe ou capacidade de cozinha e não substituem a agenda de serviços.

O cálculo determinístico atua na proposta e no novo pedido WhatsApp, criação de pedido público, revisão confirmada, edição de entrega/ofertas e início de cobrança. Configuração ativada inválida bloqueia o fechamento. Revisão recusada libera seu claim antes de tentar aposentar pagamentos; replay concluído e consulta de tentativa de cartão em andamento continuam disponíveis após fechar. A página do cartão mostra indisponibilidade antes de coletar dados e permite consultar novamente. Alterar horários não cancela pedidos ou pagamentos anteriores, nem revoga um código Pix já emitido no provedor. Não há agendamento de pedidos futuros nesta etapa; combinação fora da janela depende de atendimento.

Complemento P1.2: a criação inicial agora grava também `shipping_quote`; leitura aceita o snapshot legado `initial_shipping` somente quando não existe o snapshot posterior. Um snapshot vazio de entrega atualizado não ressuscita a localização antiga. Duas regressões de leitura conferem essa precedência.

Validação: suíte geral com 2.632 testes aprovada; complementos de horários, integração, revisão e WhatsApp aprovados (59 testes na rodada direcionada, mais dois casos de cartão). TypeScript, ESLint e build Next/webpack aprovados. Prévia dos componentes reais em desktop e celular, dados fictícios, sem overflow horizontal, campos sem horários presumidos, janela 18:00–02:00 e pausa/validação conferidas. Sem nova migration, envio ou transação real de teste. Alimentação, recursos de serviços e domicílio continuam no escopo.
