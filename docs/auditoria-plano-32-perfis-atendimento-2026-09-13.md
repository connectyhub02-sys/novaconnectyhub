# Auditoria e plano integrado dos 32 perfis de atendimento — 13/09/2026

**Estado da auditoria: concluída para revisão do titular, com implementação então pausada.** A autorização daquela rodada abrangia leitura de código/documentação e escrita deste plano, sem commit, publicação, migration, alteração de cliente, mensagem ou transação real. O rascunho funcional anterior, em seis arquivos, foi preservado e não era a base funcional aprovada desta auditoria. Após a revisão, o titular autorizou executar e publicar o plano; acompanhe os fatos posteriores e as pendências no [registro de execução](execucao-atendimento-32-perfis-2026-09-13.md). As lacunas e propostas deste documento não são alegações de implementação.

## 1. Conclusão e alcance

Há **32 perfis registrados no código: 19 empresas, 12 profissionais e um geral**. O sistema já tem uma base compartilhada de identidade, qualificação, catálogo, pedidos, pagamentos, agenda, encaminhamento e entrega WhatsApp. Os perfis configuram principalmente identidade, linguagem, perguntas e próximos passos. Isso **não equivale a 32 operações especializadas completas**.

A direção recomendada é manter essa base e criar contratos operacionais compartilhados, acionados conforme necessidade, item e configuração. Pizzaria precisa de montagem e entrega local; barbearia precisa de agenda de profissionais/serviços; imóveis precisam de seleção, galeria e visita. Nenhum desses casos exige uma cópia integral do agente. Também não devem atravessar todos o mesmo questionário ou uma sequência obrigatória de compra.

Principais achados adicionais à auditoria Gustavo/Renata:

1. **Catálogo grande:** carregamento WhatsApp padrão de 80 itens, ordenados pelos mais recentes; o prompt lista até 40. Há seleção textual sobre o conjunto carregado, mas não foi encontrado nesse caminho um mecanismo de busca paginada sob demanda para recuperar um item antigo fora do conjunto. Não se pode responder “não temos” com base nesse recorte.
2. **Entrega local:** bairros, raio, polígono, taxa e mínimo existem no cadastro. O resolvedor inicial WhatsApp aceita correspondência por nome da zona **ou cidade**, e pode recorrer a texto depois de uma coordenada fora da área. Já a cotação compartilhada do checkout/revisão usa apenas bairros textuais, exige CEP e verifica mínimo/isenção. É uma divergência concreta de regras no código, não uma prova de entrega incorreta a um cliente específico.
3. **Composição de alimentos:** existem SKUs, atributos e acréscimos extraídos de texto cadastrado, mas não foi encontrado um modelo de montagem com frações de sabores, limites por tamanho, incompatibilidades, preço de meia-meia configurável, adicionais por unidade e estoque de ingredientes. “Usar regras do cardápio” no prompt não implementa essas regras.
4. **Agenda:** reserva real de um recurso, duração fixa, capacidade, faixas semanais e bloqueios. Não há comprovação de exclusão conjunta por profissional compartilhado entre vários recursos, composição de serviços, buffers de deslocamento/limpeza, séries de aulas ou ocupação simultânea de sala e equipamento.
5. **Barbearia:** nenhum preset próprio encontrado. **Hamburgueria:** menção comercial/importação de cardápio e afinidade com restaurante/lanchonete; nenhum perfil próprio nem contrato especializado encontrado. Não apresentar essa afinidade como implementação completa.
6. **Links e avisos:** permanecem os defeitos publicados registrados na auditoria anterior, inclusive URL textual duplicada com botão. A regra decidida vale para **lead e responsável**, em texto, legenda e rodapé. Cancelamento pelo painel precisa avisar ambos, com controle de versão e entrega; o código publicado prepara eventos para responsável e lembretes para lead.

“Registrados” neste documento significa **perfis oferecidos pelo código**, não contagem de empresas/clientes que efetivamente os selecionaram. Não houve inventário de agentes de produção por perfil nesta rodada. Nenhuma configuração real de estabelecimento foi alterada ou presumida.

## 2. Evidência, base e legenda

Base funcional lida: commit `2301a69311e006348e35052f5899425902ebd491`, que coincidia com `origin/master` no último fetch desta tarefa. Nos seis arquivos com rascunho, a conclusão sobre comportamento publicado usa `git show HEAD:<arquivo>`. Não foi revalidada uma implantação externa nesta rodada documental.

A [auditoria real de Gustavo/Renata](C:/Users/conne/Documents/ConnectyHub/docs/auditoria-conversas-gustavo-renata-2026-09-13.md) foi lida integralmente e preservada no caminho original. Ela comprova aqueles percursos e suas limitações, não os demais perfis. Preservar especialmente: primeiro checkout e revisão explícita funcionaram; nome fornecido explicitamente não foi troca indevida; nova visita foi reservada e responsável avisado; **o titular cancelou pelo painel**; mensagem gerada e suprimida não é mensagem enviada; pagamento pendente não é pagamento realizado.

Referências de continuidade: [contexto](contexto-projeto.md), [estado operacional](estado-operacional.md), [plano por atividade de 11/09](plano-atendimento-por-atividade-2026-09-11.md). Planos históricos expressam intenção e precisam ser confrontados com implementação; não são recibos de execução.

Legenda usada na matriz e nas fichas:

- **E — existente em código:** configuração, contrato ou caminho identificado. Não significa operação externa retestada.
- **P — preset:** orientação editorial e dados de qualificação; não é validação determinística.
- **L — lacuna:** ausência no caminho examinado, diferença entre módulos ou evidência insuficiente. Não implica inexistência absoluta em todo sistema externo possível.
- **S — sugestão:** proposta desta auditoria, ainda sem implementação.
- **D — decisão necessária:** regra comercial/produto que não deve ser inventada pelo agente.
- **T+ / T− / TL:** testes positivos, negativos e de limite **propostos**, não executados nesta rodada.

## 3. Mapa rastreável das fontes

Os identificadores abaixo são usados em todas as fichas. Símbolos e linhas referem-se à base indicada; o rascunho local pode deslocar linhas. Os arquivos não alterados têm o mesmo conteúdo da base.

| ID | Fonte e pontos relevantes | O que sustenta |
|---|---|---|
| S01 | [activity-presets.ts](../src/lib/whatsapp/activity-presets.ts), 32 entradas entre linhas 23–446 | Identidade, objetivo, playbook, perguntas, entrega, encaminhamento e limites editoriais individuais |
| S02 | [activity-profile.ts](../src/lib/whatsapp/activity-profile.ts), `activityDefaultDestination`, `activityRepresentation`, `activityClosing` | Default de venda/agenda; diferenças profissional/empresa; sobreposições de fechamento; registro informado não verificado |
| S03 | [agent-prompt-templates.ts](../src/lib/whatsapp/agent-prompt-templates.ts), [activity-setup.ts](../src/lib/whatsapp/activity-setup.ts), [qualification.ts](../src/lib/leads/qualification.ts) | Geração, modo manual, personalizações, qualificação e pausas; primeiras duas perguntas padrão marcadas required não devem virar bloqueio transacional |
| S04 | [client-os/sales-catalog.ts](../src/lib/client-os/sales-catalog.ts), `listOrganizationSalesCatalog` (~597), `mapSalesCatalogItem` (~1000) | Consulta padrão 80; escopo; mapeamento de itens/SKUs; catálogo não é busca exaustiva |
| S05 | [agent-runtime.ts](../src/lib/whatsapp/agent-runtime.ts), `loadRunContext`, `buildSalesCatalogLines` (~6045), seleção/renderização | Filtro de organização/agente/instância, até 40 itens no prompt, histórico de 80 mensagens, seleção por texto/tags |
| S06 | [shared.ts](../src/lib/sales-catalog/shared.ts), `SalesCatalogSku`, `SalesCatalogItemAttribute`, `SalesCatalogProductInventory`, `SalesCatalogProductFulfillment` | Atributos/SKUs, estoque, duração textual, execução, quatro destinos, cobrança pontual/recorrente |
| S07 | S05, `resolveRuntimeOrderSelectedAttributes`, `parseRuntimeAttributeModifierAmount`, `multiplyRuntimeOrderItemTotal`; [produto público](../src/components/checkout/sales-catalog-product-actions.tsx) | Correspondência textual de atributos; acréscimo cadastrado `+valor`/`mais valor`, somado à base e multiplicado pela quantidade; não modela meia-meia |
| S08 | [order-shipping.ts](../src/lib/sales-catalog/order-shipping.ts), [shipping-calculator.ts](../src/lib/sales-catalog/shipping-calculator.ts) | Frete agregado, UF/faixa CEP/peso, bairros no endereço, mínimo/isenção, retirada explícita |
| S09 | S05, `resolveInitialSalesCatalogOrderShipping` (~2933), `resolveRuntimeLocalDeliveryMatch` (~3208), `runtimeLocalDeliveryZoneMatchesText`; `maybeAttachSalesCatalogLocalDeliveryToOrder` (~2150) | Caminho inicial/anexação WhatsApp: geometria e fallback textual; seleção da primeira zona; divergência de taxa/mínimo |
| S10 | [sales-catalog-console.tsx](../src/components/connectyhub-os/sales-catalog-console.tsx), zonas (~8526–9140); S06, `SalesCatalogLocalDeliveryZone` (~683) | Cadastro e edição de bairros/cidades, raio/base, polígono, taxa, mínimo e prazo em dias |
| S11 | [checkout-delivery.ts](../src/lib/sales-catalog/checkout-delivery.ts), [public-order-delivery.ts](../src/lib/sales-catalog/public-order-delivery.ts), [checkout-guards.ts](../src/lib/sales-catalog/checkout-guards.ts) | Recalcular entrega, dados faltantes, versão, invalidar pagamento; endereço textual completo não prova cobertura geográfica |
| S12 | [order-revision-intent.ts](../src/lib/whatsapp/order-revision-intent.ts), S05 `maybeHandleSalesCatalogOrderRevision`, [order-revision.ts](../src/lib/sales-catalog/order-revision.ts), [0132](../supabase/migrations/0132_sales_catalog_order_revisions.sql) | Revisão persistida, prévia/aceite, versão, idempotência, incerteza e bloqueios; causas auditadas de intenção/pendência |
| S13 | [payment-sessions.ts](../src/lib/sales-catalog/payment-sessions.ts), [transparent-checkout.ts](../src/lib/sales-catalog/transparent-checkout.ts), [post-payment.ts](../src/lib/sales-catalog/post-payment.ts), [0133](../supabase/migrations/0133_sales_catalog_payment_recovery.sql) | Sessões, recuperação, consulta de estoque, baixa pós-pagamento, estados financeiros e entrega separados |
| S14 | [agenda.ts](../src/lib/automations/agenda.ts), [0136](../supabase/migrations/0136_direct_customer_agenda.sql), [0130](../supabase/migrations/0130_catalog_item_appointments.sql), [0131](../supabase/migrations/0131_explicit_agenda_activation.sql) | Ativação, recurso, reserva atômica, capacidade, fuso, horários, bloqueios e item → recurso |
| S15 | [agenda-agent.ts](../src/lib/automations/agenda-agent.ts), `processAgendaTurn`, `bookingReply`; S05 `resolveCatalogAgendaFocus` | Aceite direto, oferta válida, nome, retomada e confirmação; item não aparece como vínculo persistido na reserva atual |
| S16 | [agenda-notifications.ts](../src/lib/automations/agenda-notifications.ts), [0116](../supabase/migrations/0116_customer_agenda_notifications.sql), [rota do painel](../src/app/api/dashboard/agenda/route.ts) | Eventos/versões, lead/reminder e responsible/event, lease, retries e opt-out; cancelamento pelo painel |
| S17 | [outbound-links.ts](../src/lib/whatsapp/outbound-links.ts), [outbound-delivery.ts](../src/lib/whatsapp/outbound-delivery.ts), [public-urls.ts](../src/lib/sales-catalog/public-urls.ts), [redirect /w](../src/app/w/[key]/route.ts) | Rastreio, menu/links, três botões por grupo e falhas; rastrear não valida entidade/destino |
| S18 | [lead-names.ts](../src/lib/whatsapp/lead-names.ts), [0134](../supabase/migrations/0134_lead_reset.sql), [0135](../supabase/migrations/0135_lead_reset_legacy_memory.sql) | Evidência de nome, reset integral e bloqueio de recriação obsoleta; configuração empresarial preservada |
| S19 | [human-handoff.ts](../src/lib/whatsapp/human-handoff.ts), [handoff-notifications.ts](../src/lib/whatsapp/handoff-notifications.ts), [agenda-handoff.ts](../src/lib/automations/agenda-handoff.ts), [responsible-human.ts](../src/lib/agents/responsible-human.ts) | Pedido humano, destinos configurados, aviso e estado de encaminhamento; não comprova distribuição por especialidade |
| S20 | [store-campaigns.ts](../src/lib/commerce/store-campaigns.ts), [store-recurring-policy.ts](../src/lib/commerce/store-recurring-policy.ts), S13 `hasRecurringSalesCatalogOrderItem` | Acordos e consentimento de cobrança recorrente; não equivalem a matrícula, turma ou série de reservas |
| S21 | [company-locations/shared.ts](../src/lib/company-locations/shared.ts), [server.ts](../src/lib/company-locations/server.ts) | Endereços/unidades e sede pública, privada, galpão ou sem sede; não contém janela de pedidos/preparo/deslocamento |
| S22 | [commerce-offers.ts](../src/lib/sales-catalog/commerce-offers.ts), [checkout-order-bumps.ts](../src/lib/sales-catalog/checkout-order-bumps.ts), [checkout-cart.ts](../src/lib/sales-catalog/checkout-cart.ts) | Ofertas/complementos, elegibilidade, consentimento e recálculo; não confundir oferta complementar com montagem interna do item |

## 4. Base compartilhada proposta

**S:** evoluir os módulos atuais, sem reescrita integral, para um contrato de turno com: assunto/ato de fala; operação pretendida ou nenhuma; alvo comprovado; fatos e origem; campos realmente faltantes; proposta e versão; aceite aplicável; resultado persistido; entrega por destinatário. Cada etapa deve carregar organização, agente, instância, lead, conversa, mensagem e versão do estado.

Não transformar essa estrutura em formulário exposto ao cliente. “A pizza é grande, dois sabores, retirada às 20h” deve preencher o que for reconhecido e pedir só a informação ainda necessária. “Ótimo atendimento” não é nova compra. “Quero visitar” não aceita Pix. A frase “isso mesmo” responde à última pergunta pertinente, não ao último pagamento encontrado no histórico.

| Módulo | Ativa quando | Pré-condições de execução e saídas |
|---|---|---|
| Conversa/identidade | Sempre | Responder dúvida/elogio/suporte; nome com evidência; transparência sobre IA quando perguntado; memória não autoriza ação |
| Descoberta de catálogo | Busca, comparação, foto ou referência de item | Recuperação pelo escopo, filtro/consulta completa quando necessário, identidade única e dados reais; indicar dado ausente sem negar existência fora do recorte |
| Montagem de item | Produto exige escolhas | SKU e opções válidos, obrigatoriedade/quantidade/restrições/preço configurados; observação sem preço não vira adicional; gerar seleção normalizada |
| Entrega local/envio/retirada | Item físico ou serviço domiciliar conforme configuração própria | Validar modo e destino, política vigente, área, taxa/mínimo, janela e prazo; serviço domiciliar não herda automaticamente frete de mercadoria |
| Venda/revisão/pagamento | Item de venda escolhido e consentimento correto | Prévia atual, total recalculado, mesma ordem, sessão reconciliada, estados financeiro e entrega independentes |
| Agenda | Serviço/item agendável e aceite do horário | Calendário ativo, recursos necessários livres, duração/local válidos; reservar atomicamente sem aprovação prévia do responsável na rotina já configurada |
| Orçamento/encaminhamento | Escopo não tarifado, limite técnico, pedido humano ou exceção | Resumo factual e destino existente; registrar pedido/aviso; “encaminhado” e “entregue” dependem de seus resultados; não prometer prazo de retorno inexistente |
| Destino externo | Item explicitamente configurado assim | Link aprovado, correspondente à entidade e rota; botão; clique não comprova venda, pagamento ou reserva externa |
| Avisos/retorno | Evento permitido e atual | Versão, destinatário, preferências, rastreamento, recibo, reconciliação e supressão de evento obsoleto |

**E:** quatro destinos em S06: `connectyhub_checkout`, `appointment`, `external_site`, `manual_handoff`. S02 sugere checkout para dez IDs de varejo/geral e agenda para os demais. **D:** isso é default de cadastro, não permissão para cobrar tudo na farmácia, matricular qualquer curso ou reservar qualquer visita técnica. A ação efetivamente salva e as condições operacionais devem prevalecer. Produtos e serviços podem coexistir no mesmo agente; pedido e reserva continuam operações separadas.

### 4.1 Pizzaria, restaurante e hamburgueria: descoberta e montagem

**E/P:** S01 fala em tamanhos, sabores, bordas, adicionais, observações e combos. S06/S07 suportam itens, SKU com preço/estoque e atributos textuais; S22 suporta complemento ao carrinho. Há importação de cardápios, inclusive referência a hamburgueria em S10. O default `food` cria exemplos de atributos, não regras universais de preparo.

**L:** limite 80/40 no WhatsApp; descrições reduzidas a 180 caracteres no bloco do catálogo; SKU/atributo carregado no runtime não significa que toda opção esteja visível nesse bloco ao modelo. Não foi encontrada busca específica por sabores/alérgenos/tamanho fora do lote. Correspondência de atributo por token pode aceitar fragmentos comuns; preço textual `+5` não determina multiplicidade, isenção, ordem de aplicação, incompatibilidade ou se adicional está vinculado a uma só unidade. Observações ficam sujeitas à passagem pelo resumo/metadata; não há evidência de ficha de produção completa por unidade de pizza/lanche.

**S:** busca por categoria/consulta com paginação e distinção entre ausência, ambiguidade e catálogo indisponível. Montagem por grupos configurados, quantidade mínima/máxima, opções permitidas por tamanho, preço estruturado e disponibilidade. Preservar produto, variante, componentes, observações e adicionais separados. Revalidar catálogo antes da conclusão, sem usar valores do texto do lead/modelo como fonte de preço.

**D:** para meia-meia, o estabelecimento define maior sabor, média, soma proporcional ou outra política explícita; quantidade máxima de sabores por tamanho; borda por pizza ou fração; adicional por metade/unidade; combos fixos ou substituíveis; desconto já embutido ou aplicado ao conjunto. Não escolher um padrão silencioso. Um SKU “pizza grande X/Y” de preço fixo cadastrado pode representar uma combinação existente, mas não comprova combinador livre nem estoque de ingredientes.

Exemplos de continuidade esperada: “Grande, metade sabor A e metade B, sem cebola na primeira” mantém duas frações de **uma** pizza; “inclua borda C” só cobra se opção e valor estiverem cadastrados; “duas iguais, uma sem cebola” exige observação por unidade; “não quero bacon” não remove o lanche; “pode ser o combo?” não autoriza substituir sem apresentar a diferença de composição/preço.

### 4.2 Cobertura local e logística

| Aspecto | E no código | L / risco e correção proposta |
|---|---|---|
| Bairros/cidades | S10 cadastra ambos. S08 exige bairro no endereço e cidade se a zona a listar | S09 aceita qualquer cidade ou nome da zona por substring; “Cidade Exemplo” pode validar bairro fora da área. Normalizar componentes, exigir correspondência suficiente e evitar rua chamada “Centro” como prova de bairro |
| CEP | S08 calcula por UF/faixa CEP e tabela de peso, com prioridades de faixa | Identifica UF; não verifica existência do logradouro nem área local por si só. CEP geral/ambíguo deve pedir bairro/localização, sem “atendemos toda a cidade” |
| Raio | S09 compara distância geográfica ao centro usando coordenadas | Não é distância de trajeto. Caminho inicial passa `latestInbound: null` em certas chamadas; localização só no payload pode se perder. S08 não aceita coordenadas. Resolver no mesmo contrato em todos os canais |
| Polígono | S09 contém teste de ponto no polígono; S10 permite desenhar | Não há política explícita de borda/precisão encontrada. Após coordenada fora da área, S09 pode fazer match pelo nome textual da zona. Coordenada contraditória não pode ser substituída por correspondência frouxa |
| Zonas sobrepostas | S09 usa primeira ocorrência; S08 oferece várias, ordenadas por preço | **D:** prioridade, menor taxa, maior especificidade ou necessidade de confirmação. Registrar zona e versão escolhidas; não depender da ordem do array |
| Mínimo e isenção | S10 cadastra `orderMinimum` e `freeDeliveryThreshold`; S08 aplica ao subtotal | S09 usa `zone.price` sem a mesma validação de mínimo/isenção. Definir base do mínimo (antes/depois de descontos, excluindo frete) e aplicar nos quatro caminhos: prévia, criação, revisão, checkout público |
| Frete versus área local | Envio nacional pode coexistir com zonas locais | **D:** itens apenas locais precisam de elegibilidade por modo; não oferecer envio nacional como escape para pizza fora de área. “Frete grátis” é preço, não permissão de entregar em todo lugar |
| Horários | Agenda tem faixas; comportamento possui janelas de contato; frete guarda dias de manuseio/prazo | Não foi encontrado contrato específico de abertura de pedidos, corte, preparo, expedição e retirada em minutos. Não usar “agente sempre online” como “cozinha aberta” nem prazo postal como tempo de forno |
| Endereço modificado | S11/S12 recalculam e versionam; há consentimento para endereço salvo | Auditar caminhos de anexação anteriores à revisão e impedir taxa antiga/aceite antigo. Alterar bairro/CEP/coordenada reavalia área, mínimo, taxa, janela, total e nova confirmação quando necessário |
| Retirada | `localPickup` e seleção explícita existem | Só oferecer se habilitada e sede pública apropriada. Não assumir retirada ao falhar entrega, nem exigir endereço de entrega como se fosse necessário; dados de cobrança do meio de pagamento são outra exigência |

**S:** resultado único de elegibilidade com `elegível`, `fora da área`, `dados insuficientes`, `fechado`, `mínimo não atingido` ou `falha na consulta`, além de motivos e campos faltantes. Esses nomes são proposta de contrato, não estados já persistidos. Guardar origem da localização, zona, política/versão, preço e janela. Pedir “Qual é o bairro?” quando apenas bairro falta; “O ponto fica na entrada X ou Y?” quando a localização de limite não basta; não repetir cardápio/nome/pedido inteiro.

Sem regra suficiente: informar que ainda não há confirmação da entrega e encaminhar a dúvida específica ao responsável configurado. Não criar taxa, raio, bairros, prazo ou retirada. Um cálculo correto em memória ainda não prova disponibilidade real de entregador/cozinha.

### 4.3 Agenda, serviços e atendimento domiciliar

**E:** S14 valida duração de 5–720 minutos, capacidade de 1–100, até 14 faixas semanais, bloqueio de datas e intervalos/compromissos manuais. Cada reserva usa um recurso e sua duração; `service` contabiliza sobreposições e `table` ocupa a mesa inteira, com número de pessoas limitado à capacidade. A consulta avança em passos de 15 minutos a partir do marco inicial, oferece até 12 sugestões ou 100 em dia público; a escrita SQL revalida disponibilidade, empresa, lead, conversa, versão e repetição. Agenda inativa impede nova ação. O vínculo item→recurso aceita recurso ativo de tipo `service` em S14/appointment-policy.

**L:** recurso não é entidade de profissional com identidade/competências compartilhadas entre serviços. Dois recursos “corte” e “barba” podem representar o mesmo barbeiro sem um bloqueio comum comprovado. Duração textual do catálogo não altera automaticamente duração da reserva. Não há composição atômica de vários serviços, reserva conjunta de profissional/sala/equipamento, intervalo entre clientes, deslocamento entre domicílios, recorrência de agenda ou matrícula em turma. Fechamento no outro dia é rejeitado nas faixas examinadas; serviço noturno requer decisão/modelagem própria. Retorno em dias não equivale a reserva futura confirmada.

**S:** primeiro tornar confiável uma reserva simples com nome/oferta/item/local preservados; depois adicionar apenas capacidades realmente necessárias: profissional compartilhado, composição de duração e buffers; endereço do atendimento domiciliar com elegibilidade própria; serviços com escopo incerto viram avaliação/visita técnica, não prazo fechado para todo reparo.

**D:** profissional escolhido versus “qualquer disponível”; serviço composto previamente cadastrado versus combinação livre; duração por profissional/item; capacidade de turma versus atendimento individual; tolerância, sinal/pagamento e políticas de mudança. Cobrança de sinal não está autorizada por uma decisão genérica de agenda: reservar e cobrar devem ter consentimentos/estados separados.

### 4.4 Links, mídia, cancelamento e entrega confiável

**Decidido pelo titular:** todo link WhatsApp deve estar em botão, para lead **e responsável**. Nenhum HTTP/HTTPS cru ou duplicado em corpo, legenda ou rodapé; revisar também títulos, textos de cards e mensagens divididas. Endereço físico pode ficar por extenso; mapa vai no botão. Galeria: botão válido sozinho ou primeira imagem real + botão. Falha não autoriza URL textual como escape.

**E/L:** S17 rastreia URLs e divide grupos de três, mas a base publicada preserva a URL no texto ao criar o menu. Não valida entidade/rota antes de rastrear. Há três fallbacks em S05 (produto, localização, pagamento). A base pode devolver recibo positivo da mensagem principal mesmo com falha da complementar. S16 inclui `wa.me` no texto de aviso ao responsável, portanto está no alcance desta correção. O rascunho pausado iniciou mudanças nesses pontos, mas não foi concluído/revisado e não sana a base publicada.

**S:** validar origem autorizada + entidade/escopo/rota antes do renderer; construir URL canônica a partir do item confirmado, sem consertar UUID por semelhança. Uma URL fornecida por IA não vira confiável por ganhar `/w`. Usar apenas rotas/fontes esperadas para pagamento/galeria/mapa/site externo; falha de destino recebe alternativa comprovada ou explicação factual, sem “estou ajustando” sem ação. Preferir validação pela entidade/rota interna, não requisições arbitrárias a URL do modelo.

**S:** evento de cancelamento pelo painel cria entregas separadas para lead/responsável, relacionadas ao mesmo booking/versão/evento e com idempotência por público/destinatário. Não reprocessar retroativamente a visita do teste. Reconciliar `pending`, `processing`, `sending`, `sent`, `failed`, `uncertain` e avisos obsoletos; preservar opt-out, permissão do remetente, contrato e arquivo do lead. Registro de `sent` não comprova leitura. Responsável e lead com o mesmo telefone exigem política explícita de deduplicação; hoje a unicidade de notices não inclui `audience`.

**S:** nova verificação de booking/lead/versão antes do envio, compatível com reset; chaves estáveis por operação/parte; jamais recomeçar cobrança ou reenviar a primeira parte porque a segunda ficou incerta. Timeout após aceitação do provedor exige reconciliação. Estabelecer cancelamento/supressão de lembretes antigos e comportamento de entrega já em voo; não prometer atomicidade entre rede externa e transação de banco.

## 5. Matriz e fichas dos 32 perfis

A matriz abaixo lista todos os IDs encontrados. **V** é default de checkout, **A** é default de agenda. O destino salvo do item prevalece; suporte/orçamento/encaminhamento e destino externo não precisam desses finais. Cada ficha contém orientação do preset, configuração operacional, lacunas, exemplo e testes propostos.

| Nº | Perfil / ID | Tipo | Default | Referências operacionais |
|---|---|---|---|---|
| 1 | [Outra atividade / atendimento geral](#perfil-generic_sales) · `generic_sales` | Geral | V | S03/S06/S19 |
| 2 | [Pizzaria e delivery](#perfil-pizzaria_delivery) · `pizzaria_delivery` | Empresa | V | S04–S13/S22 |
| 3 | [Restaurante e lanchonete](#perfil-restaurante_lanchonete) · `restaurante_lanchonete` | Empresa | V | S04–S13/S14/S22 |
| 4 | [Farmácia e drogaria](#perfil-farmacia) · `farmacia` | Empresa | V | S04–S13/S19 |
| 5 | [Loja de roupas, calçados e acessórios](#perfil-moda_varejo) · `moda_varejo` | Empresa | V | S04–S13 |
| 6 | [Clínica de estética](#perfil-estetica_clinica) · `estetica_clinica` | Empresa | A | S14–S16/S19/S21 |
| 7 | [Academia e estúdio de treino](#perfil-academia_suplementos) · `academia_suplementos` | Empresa | V | S02/S13–S16/S20 |
| 8 | [Empresa de manutenção e instalações](#perfil-servicos_locais) · `servicos_locais` | Empresa | A | S14–S16/S19/S21 |
| 9 | [Escola e empresa de cursos](#perfil-educacao_cursos) · `educacao_cursos` | Empresa | V | S13–S16/S20 |
| 10 | [Imobiliária](#perfil-imobiliaria) · `imobiliaria` | Empresa | A | S04/S05/S14–S17/S19/S21 |
| 11 | [Loja de autopeças](#perfil-autopecas) · `autopecas` | Empresa | V | S04–S13/S19 |
| 12 | [Loja virtual / e-commerce](#perfil-ecommerce) · `ecommerce` | Empresa | V | S04–S13/S17–S19 |
| 13 | [Corretor de imóveis](#perfil-corretor_imoveis) · `corretor_imoveis` | Profissional | A | S02/S04/S05/S14–S17/S21 |
| 14 | [Advogado](#perfil-advogado) · `advogado` | Profissional | A | S02/S14–S16/S19 |
| 15 | [Escritório de advocacia](#perfil-escritorio_advocacia) · `escritorio_advocacia` | Empresa | A | S02/S14–S16/S19/S21 |
| 16 | [Contador](#perfil-contador) · `contador` | Profissional | A | S02/S14–S16/S19 |
| 17 | [Escritório de contabilidade](#perfil-escritorio_contabilidade) · `escritorio_contabilidade` | Empresa | A | S02/S14–S16/S19/S20 |
| 18 | [Dentista](#perfil-dentista) · `dentista` | Profissional | A | S02/S14–S16/S19 |
| 19 | [Clínica odontológica](#perfil-clinica_odontologica) · `clinica_odontologica` | Empresa | A | S14–S16/S19/S21 |
| 20 | [Esteticista](#perfil-esteticista) · `esteticista` | Profissional | A | S02/S14–S16/S19/S21 |
| 21 | [Personal trainer](#perfil-personal_trainer) · `personal_trainer` | Profissional | A | S02/S14–S16/S20/S21 |
| 22 | [Professor particular](#perfil-professor_particular) · `professor_particular` | Profissional | A | S02/S14–S16/S20/S21 |
| 23 | [Arquiteto](#perfil-arquiteto) · `arquiteto` | Profissional | A | S02/S14–S16/S19/S21 |
| 24 | [Escritório de arquitetura](#perfil-escritorio_arquitetura) · `escritorio_arquitetura` | Empresa | A | S14–S16/S19/S21 |
| 25 | [Eletricista](#perfil-eletricista) · `eletricista` | Profissional | A | S02/S14–S16/S19/S21 |
| 26 | [Encanador](#perfil-encanador) · `encanador` | Profissional | A | S02/S14–S16/S19/S21 |
| 27 | [Técnico de ar-condicionado](#perfil-tecnico_ar_condicionado) · `tecnico_ar_condicionado` | Profissional | A | S02/S14–S16/S19/S21 |
| 28 | [Corretor de seguros](#perfil-corretor_seguros) · `corretor_seguros` | Profissional | A | S02/S14–S16/S19 |
| 29 | [Corretora de seguros](#perfil-corretora_seguros) · `corretora_seguros` | Empresa | A | S14–S16/S19 |
| 30 | [Loja de suplementos](#perfil-loja_suplementos) · `loja_suplementos` | Empresa | V | S04–S13/S19 |
| 31 | [Oficina mecânica](#perfil-oficina_mecanica) · `oficina_mecanica` | Empresa | A | S14–S16/S19/S21 |
| 32 | [Revenda de veículos](#perfil-revenda_veiculos) · `revenda_veiculos` | Empresa | A | S04/S05/S14–S17/S19/S21 |

Os campos abaixo são **configuração a confirmar ou estruturar**, não fatos sobre empresas reais. Quando a ficha pede algo ainda não modelado, isso integra a sugestão, e a lacuna permanece. Perguntas de qualificação são aproveitáveis, mas não devem ser repetidas se já respondidas nem exigidas para uma dúvida simples. As linhas de preset são referência editorial; a representação efetiva e o fechamento também passam por S02.

<a id="perfil-generic_sales"></a>

### 5.1 Outra atividade / atendimento geral

**Evidência:** S01, `generic_sales`, linha 23; S02/S03; S03/S06/S19.

**P — orientação existente:** Identificar a demanda e orientar o próximo passo usando os serviços realmente cadastrados. Qualificação padrão: necessidade; contexto; prazo. Regra editorial de conclusão: “Confirme escopo, valor e próximo passo apenas quando constarem no cadastro; se faltar uma regra, encaminhe a dúvida específica.”

**E — caminho existente:** Catálogo com quatro destinos e encaminhamento configurável.

**Configuração / D:** Produtos/serviços efetivos, canais, horários informados, responsável e destino de cada item.

**L / S — diferença a resolver:** O fallback genérico não identifica regras operacionais de um negócio desconhecido; default checkout pode induzir cadastro inadequado. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Só quero saber como funciona.” → explicar o serviço identificado; se houver dois, pedir qual, sem abrir checkout.

- **T+:** Dúvida respondida sem pedido; compra de item explícito usa destino salvo.
- **T−:** Mensagem de suporte não vira qualificação comercial nem reserva.
- **TL:** Atividade desconhecida mantém personalizações e pede só a informação que impede responder.

<a id="perfil-pizzaria_delivery"></a>

### 5.2 Pizzaria e delivery

**Evidência:** S01, `pizzaria_delivery`, linha 39; S02/S03; S04–S13/S22.

**P — orientação existente:** Montar a pizza e os acompanhamentos, conferir entrega ou retirada e fechar um pedido único. Qualificação padrão: tamanho; sabores; recebimento. Regra editorial de conclusão: “Valide bairro, endereço e taxa na ferramenta antes do total. Tempo de preparo e área de entrega só quando disponíveis. Pedido pago não significa pedido entregue.”

**E — caminho existente:** Itens/SKUs, atributos, carrinho, revisão, retirada e zonas locais cadastráveis.

**Configuração / D:** Cardápio completo, tamanhos/frações, preço de combinações, bordas/adicionais por unidade, combos, disponibilidade, área, taxa/mínimo, janelas e retirada.

**L / S — diferença a resolver:** Busca 80/40; montagem sem contrato estruturado; entrega diverge entre conversa e checkout; prazo em dias não representa preparo. Detalhamento nas seções 4.1/4.2. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Grande, metade A e B, borda C, entrega na rua X.” → consultar opções/preço e cobertura; perguntar número/localização que falta, sem supor atendimento pela cidade.

- **T+:** Duas pizzas com montagens distintas, bebida e endereço coberto geram um total e pedido com composição íntegra.
- **T−:** Sabor indisponível, combinação não cadastrada, bairro fora da área ou preço meia-meia ausente impedem promessa/total inventado.
- **TL:** Produto 81, fronteira de polígono, zonas sobrepostas, mínimo exato, troca para fora da área e pedido no fechamento.

<a id="perfil-restaurante_lanchonete"></a>

### 5.3 Restaurante e lanchonete

**Evidência:** S01, `restaurante_lanchonete`, linha 55; S02/S03; S04–S13/S14/S22.

**P — orientação existente:** Montar refeições ou lanches com variações corretas, sem perder adicionais e restrições informadas. Qualificação padrão: pedido; preferências; recebimento. Regra editorial de conclusão: “Calcule adicionais e entrega com dados do cardápio. Confirme endereço quando necessário e envie um checkout único depois da conferência.”

**E — caminho existente:** Itens com variação, complementos e checkout; agenda tem recurso table quando configurado.

**Configuração / D:** Pratos/lanches, porção, opções removíveis, acréscimos, combos, horários do cardápio, cozinha, entrega/retirada; mesa apenas se ofertada.

**L / S — diferença a resolver:** Observação versus adicional ainda depende de texto; falta composição por unidade e janela de preparo. Mesa existente não é comanda nem capacidade somada do salão. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Dois lanches, um sem cebola, outro com bacon; vou retirar.” → separar observações por unidade e cobrar só bacon cadastrado; pedir horário apenas se suportado.

- **T+:** Pedido misto conserva personalizações, valor de adicionais e modo retirada; reserva de mesa fica independente.
- **T−:** “Sou alérgico” não vira promessa de ausência de contaminação; opção grátis não recebe acréscimo.
- **TL:** Prato fora da janela, último item, duas unidades com diferenças, grupo igual/maior que capacidade da mesa.

<a id="perfil-farmacia"></a>

### 5.4 Farmácia e drogaria

**Evidência:** S01, `farmacia`, linha 70; S02/S03; S04–S13/S19.

**P — orientação existente:** Localizar o produto e sua apresentação, consultar disponibilidade e encaminhar dúvidas de uso ao farmacêutico. Qualificação padrão: produto; apresentação; recebimento. Regra editorial de conclusão: “Siga as condições cadastradas de venda e entrega; quando houver necessidade de receita, encaminhe para conferência humana antes da conclusão.”

**E — caminho existente:** Busca comercial, SKU/apresentação, estoque e entrega; encaminhamento ao responsável.

**Configuração / D:** Nome, apresentação/concentração cadastrada, embalagem, quantidade, disponibilidade, condições de venda por item e conferência humana quando exigida.

**L / S — diferença a resolver:** Não foi identificado bloqueio transacional estruturado de receita/conferência por produto neste caminho; instrução no preset é insuficiente para garanti-lo. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Tem X 20 mg com 30 comprimidos?” → localizar apresentação exata; pedir só quantidade se faltar e acionar conferência prevista antes de concluir.

- **T+:** Apresentação exata e item habilitado seguem estoque/entrega; dúvida de uso é direcionada ao farmacêutico.
- **T−:** Similaridade de nome não autoriza substituição de concentração nem liberação de item pendente de conferência.
- **TL:** Mesma marca em três embalagens, estoque parcial, ausência de informação exigida e falha no aviso humano.

<a id="perfil-moda_varejo"></a>

### 5.5 Loja de roupas, calçados e acessórios

**Evidência:** S01, `moda_varejo`, linha 83; S02/S03; S04–S13.

**P — orientação existente:** Encontrar uma peça adequada à ocasião e conferir tamanho, cor e disponibilidade antes da compra. Qualificação padrão: ocasião; tamanho; preferência. Regra editorial de conclusão: “Confirme tamanho e cor disponíveis, frete ou retirada e política de troca cadastrada. Não reserve estoque sem ferramenta ou confirmação.”

**E — caminho existente:** SKUs combinam tamanho/cor com preço e estoque; fotos, checkout e frete existem.

**Configuração / D:** Grade por marca/modelo, medidas reais, fotos da variante, estoque, envio/retirada e política cadastrada de troca.

**L / S — diferença a resolver:** Descoberta limitada; atributos textuais podem conflitar; não há prova de reserva de estoque pelo simples aceite na conversa. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Esse vestido azul no M.” → resolver o item citado e SKU; se inequívoco, conferir estoque e perguntar apenas recebimento.

- **T+:** Cor/tamanho corretos chegam ao pedido e troca de variante recalcula preço/estoque.
- **T−:** Foto de outro modelo não serve como evidência; “visto M” não garante caimento.
- **TL:** Última unidade concorrente, numeração diferente por marca, variante desativada entre consulta e pagamento.

<a id="perfil-estetica_clinica"></a>

### 5.6 Clínica de estética

**Evidência:** S01, `estetica_clinica`, linha 96; S02/S03; S14–S16/S19/S21.

**P — orientação existente:** Entender o interesse e direcionar uma avaliação com a equipe habilitada da clínica. Qualificação padrão: interesse; unidade; disponibilidade. Regra editorial de conclusão: “Agende avaliação apenas com disponibilidade verificada; sessões e valores seguem o cadastro e o plano definido pelo profissional.”

**E — caminho existente:** Avaliação em recurso ativo, unidade/local cadastrado e avisos.

**Configuração / D:** Serviço, avaliação versus sessão, profissional habilitado informado, unidade/sala/equipamento, duração/buffer, valores e orientações aprovadas.

**L / S — diferença a resolver:** Recurso único não garante disponibilidade conjunta de profissional/sala/aparelho; pacote não controla sessões consumidas nesse fluxo. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero conhecer o procedimento X na unidade Y.” → apresentar informação cadastrada e horários de avaliação; não repetir unidade.

- **T+:** Avaliação aceita reserva o recurso e confirma unidade/profissional reais.
- **T−:** Interesse não agenda sessão invasiva nem promete resultado; convênio/preparo ausente não é inventado.
- **TL:** Mesmo profissional em unidades diferentes, sessão com equipamento compartilhado, remarcação perto do início.

<a id="perfil-academia_suplementos"></a>

### 5.7 Academia e estúdio de treino

**Evidência:** S01, `academia_suplementos`, linha 109; S02/S03; S02/S13–S16/S20.

**P — orientação existente:** Relacionar rotina e objetivo às modalidades e planos reais da academia, conduzindo à visita ou matrícula. Qualificação padrão: objetivo; horário; unidade. Regra editorial de conclusão: “Confirme cobertura do plano, horários, adesão e cancelamento cadastrados. Matrícula ou aula só ficam confirmadas após a ferramenta correspondente.”

**E — caminho existente:** Default checkout para planos; cobrança recorrente e agenda de visita/aula isolada existem.

**Configuração / D:** Unidade, modalidade, cobertura do plano, taxas, vigência/cancelamento, horários; turma/vagas e frequência quando ofertadas.

**L / S — diferença a resolver:** ID histórico contém suplementos, mas o perfil efetivo é academia. Pagamento recorrente não comprova matrícula, acesso, capacidade de turma ou reservas semanais. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero a turma de terça à noite nessa unidade.” → consultar turma e vaga por fonte real; se não integrada, registrar consulta sem confirmar matrícula.

- **T+:** Plano comercial configurado é distinguido de visita experimental; consentimento da recorrência é explícito.
- **T−:** Comprar plano não reserva todas as aulas nem libera acesso por inferência.
- **TL:** Última vaga concorrente, troca de unidade/plano, suspensão da assinatura e retorno sem recriar matrícula.

<a id="perfil-servicos_locais"></a>

### 5.8 Empresa de manutenção e instalações

**Evidência:** S01, `servicos_locais`, linha 122; S02/S03; S14–S16/S19/S21.

**P — orientação existente:** Classificar o serviço, verificar cobertura e preparar uma visita ou orçamento para a equipe técnica. Qualificação padrão: serviço; local; urgência. Regra editorial de conclusão: “Informe taxa de visita apenas se cadastrada. Serviços dependentes de vistoria recebem orçamento após avaliação; não garanta despacho sem confirmação.”

**E — caminho existente:** Qualificação de serviço/bairro, agenda de visita e encaminhamento da empresa.

**Configuração / D:** Cobertura por tipo de serviço, endereço, deslocamento, taxa de vistoria, equipe/especialidade, duração, materiais e aprovação de orçamento.

**L / S — diferença a resolver:** Não há roteirização, despacho ou regra regional específica de serviço comprovada; frete de produto não representa deslocamento técnico. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Instalar ventilador no bairro X amanhã.” → verificar cobertura/equipe; pedir dado técnico faltante para escolher serviço ou vistoria.

- **T+:** Visita suportada em área cadastrada confirma local/taxa informada e horário.
- **T−:** Estar na cidade não prova cobertura; pedido urgente não significa técnico despachado.
- **TL:** Endereço limítrofe, equipe ocupada em outro recurso, serviço extra alterando duração e custo.

<a id="perfil-educacao_cursos"></a>

### 5.9 Escola e empresa de cursos

**Evidência:** S01, `educacao_cursos`, linha 135; S02/S03; S13–S16/S20.

**P — orientação existente:** Relacionar o objetivo do aluno à turma, modalidade e nível adequados, conduzindo à matrícula informada. Qualificação padrão: objetivo; nível; disponibilidade. Regra editorial de conclusão: “Confirme turma e vagas na fonte disponível. Explique matrícula, material e parcelamento registrados; não prometa bolsa sem regra.”

**E — caminho existente:** Venda de curso/plano, cobrança recorrente configurável e reunião/aula simples.

**Configuração / D:** Curso, nível, modalidade, unidade/link, turma, datas, vagas, material, carga horária, preço e regras de matrícula.

**L / S — diferença a resolver:** Não foi comprovado módulo de turma/matrícula com vaga atômica e calendário recorrente. Item com estoque não substitui sem decisão a vaga acadêmica. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Inglês iniciante, só sábado online.” → filtrar curso/turma reais; perguntar apenas dado de matrícula ainda necessário na etapa suportada.

- **T+:** Curso digital com destino cadastrado segue compra; consulta de turma responde dados verificados.
- **T−:** Pagamento ou link de reunião não comprovam matrícula, certificação ou bolsa.
- **TL:** Última vaga, turma cancelada, pacote de aulas, mudança de nível sem perder histórico.

<a id="perfil-imobiliaria"></a>

### 5.10 Imobiliária

**Evidência:** S01, `imobiliaria`, linha 148; S02/S03; S04/S05/S14–S17/S19/S21.

**P — orientação existente:** Relacionar o perfil do interessado aos imóveis cadastrados e encaminhar à equipe responsável pela região ou operação. Qualificação padrão: operação; região; faixa de valor; perfil do imóvel. Regra editorial de conclusão: “Confirme referência do imóvel, encargos disponíveis e corretor responsável. Visita depende da agenda e do acesso ao imóvel; proposta depende de negociação humana.”

**E — caminho existente:** Imóvel no catálogo, galeria canônica e recurso de visita; identidade de equipe.

**Configuração / D:** Referência/ID, operação, preço/encargos, mídia, disponibilidade, acesso, local autorizado e responsável por imóvel/região.

**L / S — diferença a resolver:** Roteamento especializado não é garantido pelo preset; booking não persiste snapshot do imóvel e confirmação perde contexto. Registro profissional informado não é verificação. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero ver as fotos desse apartamento e visitar sábado.” → resolver imóvel único, botão da galeria real, horários e reserva após aceite.

- **T+:** Galeria e confirmação mantêm o mesmo imóvel; visita confirmada sem aprovação prévia do responsável quando calendário habilitado.
- **T−:** Imóvel parecido não substitui referência; ausência de rua não permite inventar endereço.
- **TL:** Dois imóveis semelhantes, mesmo corretor em recursos distintos, item desativado antes da visita, cancelamento no painel para ambos.

<a id="perfil-autopecas"></a>

### 5.11 Loja de autopeças

**Evidência:** S01, `autopecas`, linha 161; S02/S03; S04–S13/S19.

**P — orientação existente:** Identificar a peça compatível com o veículo e evitar venda incorreta antes de consultar estoque e pagamento. Qualificação padrão: peça; veículo; motorização. Regra editorial de conclusão: “Confirme código, aplicação, quantidade e disponibilidade; condições de garantia e troca seguem o cadastro.”

**E — caminho existente:** Catálogo/SKU/código, atributos, estoque e envio.

**Configuração / D:** Código original/equivalente validado, fabricante, modelo/ano/versão/motor quando necessários, aplicação, quantidade e política de garantia.

**L / S — diferença a resolver:** Não há prova de base relacional de compatibilidade veículo→peça; título/tags não garantem aplicação técnica. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Filtro código ABC para modelo X 2020.” → consultar aplicação cadastrada; perguntar motor só se necessária para eliminar ambiguidade.

- **T+:** Código e aplicação comprovados geram item exato no pedido.
- **T−:** Não inferir compatibilidade por peça parecida nem substituir equivalente sem confirmação.
- **TL:** Mesmo ano com motores distintos, kit versus unidade, variante de lado esquerdo/direito e estoque parcial.

<a id="perfil-ecommerce"></a>

### 5.12 Loja virtual / e-commerce

**Evidência:** S01, `ecommerce`, linha 174; S02/S03; S04–S13/S17–S19.

**P — orientação existente:** Ajudar a encontrar produtos e montar o carrinho, ou resolver a consulta de um pedido existente. Qualificação padrão: motivo; referência; destino. Regra editorial de conclusão: “Use cotação real de frete e prazo. Envie checkout único quando houver vários itens; troca, devolução e rastreio seguem o pedido e as políticas cadastradas.”

**E — caminho existente:** Carrinho multi-item, variantes, frete, pagamento, status interno e revisão.

**Configuração / D:** Catálogo completo, destino dos itens, políticas, regiões/prazos, transportadora e fonte de rastreio se disponível.

**L / S — diferença a resolver:** Busca limitada; não há evidência nesta auditoria de execução completa de devolução/reembolso/rastreio externo pelo chat; status interno não é evento logístico externo. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Cadê meu pedido?” → localizar pedido do próprio lead e informar evento real, sem oferecer checkout novo.

- **T+:** Compra multi-item produz um total; consulta usa pedido correto e dado atual.
- **T−:** Número de pedido de outra empresa/lead não revela dados; pago não vira entregue.
- **TL:** Carrinho físico+digital, prazo por item, endereço alterado com sessão vigente, retry de webhook fora de ordem.

<a id="perfil-corretor_imoveis"></a>

### 5.13 Corretor de imóveis

**Evidência:** S01, `corretor_imoveis`, linha 187; S02/S03; S02/S04/S05/S14–S17/S21.

**P — orientação existente:** Selecionar imóveis conforme as preferências e conduzir a consulta de horários para uma visita. Qualificação padrão: objetivo; região desejada; investimento; prioridade. Regra editorial de conclusão: “Sugira visita ao imóvel identificado e valide a agenda do corretor. Valor, encargos e disponibilidade devem vir do cadastro ou confirmação do profissional.”

**E — caminho existente:** Mesma base imobiliária com representação individual efetiva e visita direta.

**Configuração / D:** Identidade/registro informado, imóvel correto, fotos, agenda do profissional, local de encontro real e acesso autorizado.

**L / S — diferença a resolver:** Galeria/referência, nome, retomada e confirmação são falhas comprovadas no caso Renata; profissional compartilhado e snapshot do imóvel precisam evolução. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Com quem eu falo?” / resposta com nome; depois “inclua a visita a esse imóvel.” → preservar identidade do lead e distinguir visita de compra.

- **T+:** Nome após pergunta natural é aceito; horário escolhido e imóvel aparecem na confirmação correta.
- **T−:** Não afirmar presença humana na conversa nem inventar endereço/mapa; visita não ativa checkout.
- **TL:** Nome de uma palavra, aceite após breve pausa, duas referências próximas, aviso de cancelamento obsoleto após remarcar.

<a id="perfil-advogado"></a>

### 5.14 Advogado

**Evidência:** S01, `advogado`, linha 200; S02/S03; S02/S14–S16/S19.

**P — orientação existente:** Acolher o contato e organizar uma consulta inicial com o advogado, sem analisar o mérito do caso. Qualificação padrão: tipo de contato; assunto; prazo informado. Regra editorial de conclusão: “Informe formato e condições da consulta apenas quando cadastrados. Não confirme contratação nem prazo processual; agenda precisa de confirmação.”

**E — caminho existente:** Identidade individual, triagem editorial, consulta em recurso e encaminhamento.

**Configuração / D:** Área atendida, relação com contato, prazo informado sem validação jurídica automática, formato, agenda, valor aprovado e canal documental.

**L / S — diferença a resolver:** Não há gestão processual/contratação ou verificação automática de prazo demonstrada; reserva não é contratação profissional. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Já sou cliente; recebi uma data para amanhã.” → acolher informação e direcionar ao responsável configurado, sem reiniciar venda de consulta.

- **T+:** Primeira consulta aceita reserva agenda; cliente com assunto existente segue suporte.
- **T−:** Não analisar mérito nem declarar prazo/ato processual cumprido; pedido de humano não fica preso na qualificação.
- **TL:** Documento sem data legível, profissional indisponível, aviso incerto e retorno do mesmo cliente com nova demanda.

<a id="perfil-escritorio_advocacia"></a>

### 5.15 Escritório de advocacia

**Evidência:** S01, `escritorio_advocacia`, linha 213; S02/S03; S02/S14–S16/S19/S21.

**P — orientação existente:** Identificar a área da demanda e encaminhar ao profissional ou equipe cadastrada do escritório. Qualificação padrão: atendimento; área da demanda; urgência. Regra editorial de conclusão: “Confirme unidade, formato e disponibilidade para consulta. Documentos seguem o canal definido pelo escritório e honorários dependem de informação aprovada.”

**E — caminho existente:** Identidade empresarial, área/unidade na qualificação e destinatário humano configurável.

**Configuração / D:** Áreas/equipe responsáveis, unidade, formato, canais de documentos, honorários informados, prioridades aprovadas.

**L / S — diferença a resolver:** Classificar área em texto não implementa distribuição para várias equipes; consulta pode ocupar profissional em mais de um recurso. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Sou cliente do trabalhista e quero falar sobre meu caso.” → reutilizar vínculo conhecido, pedir referência mínima e direcionar à equipe existente.

- **T+:** Novo assunto recebe equipe cadastrada; consulta confirma unidade e profissional quando definidos.
- **T−:** Não inventar departamento nem enviar documento a destinatário não configurado.
- **TL:** Duas unidades, prazo informado urgente, funcionário/responsável também como lead e isolamento de casos.

<a id="perfil-contador"></a>

### 5.16 Contador

**Evidência:** S01, `contador`, linha 226; S02/S03; S02/S14–S16/S19.

**P — orientação existente:** Entender a necessidade fiscal ou contábil e preparar o atendimento pessoal do contador. Qualificação padrão: perfil; serviço; período. Regra editorial de conclusão: “Documentos e honorários seguem a orientação cadastrada do contador. Não confirme envio de declaração, guia ou regularização sem retorno efetivo.”

**E — caminho existente:** Identidade individual, classificação PF/MEI/empresa, consulta e aviso.

**Configuração / D:** Serviço/período, prazo informado, honorários aprovados, documentos mínimos por serviço e canal cadastrado.

**L / S — diferença a resolver:** Não foi demonstrada transmissão de declarações/guias ou consulta fiscal integrada; encaminhar não significa regularizar. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Já mandei meus documentos; a declaração foi enviada?” → consultar registro/comprovante real ou pedir verificação ao contador.

- **T+:** Consulta nova usa formato/horário; dúvida de andamento conserva período e pessoa atendida.
- **T−:** Não pedir novamente documentos conhecidos sem motivo nem dizer transmitido por receber pagamento.
- **TL:** Dois exercícios fiscais, retorno após prazo, anexo ilegível e repetição do mesmo encaminhamento.

<a id="perfil-escritorio_contabilidade"></a>

### 5.17 Escritório de contabilidade

**Evidência:** S01, `escritorio_contabilidade`, linha 239; S02/S03; S02/S14–S16/S19/S20.

**P — orientação existente:** Classificar a demanda e direcionar a proposta ou atendimento ao responsável contábil, fiscal ou de pessoal cadastrado. Qualificação padrão: vínculo; demanda; atividade; prazo. Regra editorial de conclusão: “Proposta considera escopo cadastrado e validação humana. Documentos seguem o canal do escritório; não confirme obrigações transmitidas sem comprovante.”

**E — caminho existente:** Triagem empresarial por vínculo/serviço, atendimento e cobrança recorrente genérica.

**Configuração / D:** Empresa atendida, escopo contábil/fiscal/pessoal, equipe, período, canal documental, proposta e condições aprovadas.

**L / S — diferença a resolver:** Departamentos e obrigações não têm workflow demonstrado; mensalidade recorrente não prova entrega contábil. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Preciso de uma segunda via da folha desta empresa.” → tratar suporte e validar referência/escopo acessível, sem oferecer abertura de CNPJ.

- **T+:** Demanda atual vai ao destino cadastrado com empresa/período preservados.
- **T−:** Não consultar/expor outra empresa do mesmo telefone sem escopo; proposta não inclui serviços presumidos.
- **TL:** Contato com mais de uma empresa, troca de responsável, documento repetido e assinatura comercial cancelada.

<a id="perfil-dentista"></a>

### 5.18 Dentista

**Evidência:** S01, `dentista`, linha 252; S02/S03; S02/S14–S16/S19.

**P — orientação existente:** Organizar consulta com o dentista individual e encaminhar dúvidas clínicas ao profissional. Qualificação padrão: consulta; motivo; horário. Regra editorial de conclusão: “Valores e condições da consulta seguem o cadastro. Tratamento, duração e orçamento dependem da avaliação odontológica.”

**E — caminho existente:** Agenda individual, primeira consulta/retorno, valores cadastrados e avisos.

**Configuração / D:** Motivo geral, tipo de consulta, duração, local, agenda, retorno aplicável e instruções aprovadas.

**L / S — diferença a resolver:** Duração fixa do recurso não diferencia todos os procedimentos; retorno automático configurado não equivale a diagnóstico/indicação de tratamento. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero retornar com o dentista sexta.” → identificar retorno e ofertar calendário adequado, pedindo só horário/nome faltante.

- **T+:** Consulta com duração cadastrada reserva e confirma local/profissional.
- **T−:** Motivo do paciente não vira diagnóstico, tratamento ou preço inventado.
- **TL:** Consulta que atravessa intervalo, mudança de procedimento após reserva, retorno já agendado e cancelamento concorrente.

<a id="perfil-clinica_odontologica"></a>

### 5.19 Clínica odontológica

**Evidência:** S01, `clinica_odontologica`, linha 265; S02/S03; S14–S16/S19/S21.

**P — orientação existente:** Direcionar o paciente à unidade e ao atendimento odontológico adequado entre os serviços cadastrados. Qualificação padrão: atendimento; serviço; unidade. Regra editorial de conclusão: “Confirmar agenda, unidade e profissional com dados reais. Não prometer cobertura de convênio ou orçamento de tratamento antes da validação.”

**E — caminho existente:** Serviços/unidade/profissional como informações e recurso reservável.

**Configuração / D:** Serviço de entrada, unidade, profissional/especialidade, cadeira/sala, duração/buffer, convênios e fonte de elegibilidade.

**L / S — diferença a resolver:** Não há verificação de cobertura de convênio nem bloqueio conjunto cadeira+profissional demonstrados. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Limpeza com a dra. X na unidade Y; aceita meu plano?” → responder cobertura apenas da fonte e consultar avaliação/serviço permitido.

- **T+:** Atendimento confirmado mantém unidade e profissional escolhidos.
- **T−:** Não trocar profissional/unidade silenciosamente nem confirmar cobertura por nome da operadora.
- **TL:** Profissional atende duas unidades, cadeira compartilhada, mesma pessoa remarcando enquanto aviso é enviado.

<a id="perfil-esteticista"></a>

### 5.20 Esteticista

**Evidência:** S01, `esteticista`, linha 278; S02/S03; S02/S14–S16/S19/S21.

**P — orientação existente:** Apresentar os cuidados oferecidos pela profissional e organizar uma avaliação ou sessão compatível com o serviço cadastrado. Qualificação padrão: cuidado; experiência; agenda. Regra editorial de conclusão: “Agende a sessão apenas quando o serviço e a disponibilidade forem confirmados; orientações de preparo devem vir da profissional.”

**E — caminho existente:** Representação individual, serviço e agenda simples.

**Configuração / D:** Cuidados oferecidos, avaliação/sessão, duração, intervalo, local fixo/domiciliar, orientações aprovadas e preço/pacote.

**L / S — diferença a resolver:** Pacotes e sessões compostas não têm controle operacional completo; atendimento domiciliar exige cobertura/deslocamento adicional. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero limpeza e massagem em seguida.” → verificar combinação cadastrada e duração total; se não suportada, solicitar definição factual sem reservar dois horários conflitantes.

- **T+:** Sessão simples cadastrada é reservada com valor e local corretos.
- **T−:** Não garantir resultado nem combinar duração por suposição.
- **TL:** Dois serviços consecutivos, limpeza entre sessões, pacote parcialmente usado e visita domiciliar limítrofe.

<a id="perfil-personal_trainer"></a>

### 5.21 Personal trainer

**Evidência:** S01, `personal_trainer`, linha 291; S02/S03; S02/S14–S16/S20/S21.

**P — orientação existente:** Entender a rotina e o objetivo e organizar uma conversa inicial com o personal para avaliar o acompanhamento. Qualificação padrão: objetivo; formato; rotina. Regra editorial de conclusão: “Sessões, local e pacote seguem a disponibilidade real do personal. Avaliação e plano de treino dependem do profissional.”

**E — caminho existente:** Agenda de encontro/sessão, cobrança recorrente genérica e identidade individual.

**Configuração / D:** Presencial/online, local autorizado, duração, agenda do personal, frequência, pacote, política de reposição e capacidade se grupo.

**L / S — diferença a resolver:** Série semanal, consumo/reposição de aulas e deslocamento não demonstrados; recorrência financeira é separada. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero terça e quinta na academia X.” → conferir atendimento nesse local e disponibilidade; diferenciar consulta inicial de série ainda não suportada.

- **T+:** Sessão isolada aceita é agendada; pacote informa condições reais.
- **T−:** Não vender disponibilidade semanal permanente com base numa terça livre nem produzir treino como ação do personal.
- **TL:** Mudança de unidade, feriado em série proposta, sessão dupla e pausa/cancelamento da cobrança.

<a id="perfil-professor_particular"></a>

### 5.22 Professor particular

**Evidência:** S01, `professor_particular`, linha 304; S02/S03; S02/S14–S16/S20/S21.

**P — orientação existente:** Identificar matéria, nível e objetivo para organizar aulas com o professor individual. Qualificação padrão: matéria; nível; objetivo. Regra editorial de conclusão: “Confirme duração, formato e valor cadastrado da aula; materiais e atividades dependem da orientação do professor.”

**E — caminho existente:** Matéria/nível no preset, aula/reunião simples e cobrança de serviço.

**Configuração / D:** Disciplina/nível, aluno/contato responsável quando aplicável, formato/local, duração, agenda, material, pacote e reposição.

**L / S — diferença a resolver:** Sem matrícula/aluno separado/série recorrente demonstrados; agenda simples não garante todas as datas ou professor simultâneo em cursos diferentes. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Matemática, 8º ano, online para prova sexta.” → usar matéria/nível/prazo já dados e consultar aula compatível.

- **T+:** Aula única confirma duração, professor e formato cadastrado.
- **T−:** Não repetir nível nem prometer aprovação; pagamento de pacote não cria série por inferência.
- **TL:** Contato agenda para dois alunos, aula de 90 minutos, link ainda inexistente e remarcação de uma ocorrência.

<a id="perfil-arquiteto"></a>

### 5.23 Arquiteto

**Evidência:** S01, `arquiteto`, linha 317; S02/S03; S02/S14–S16/S19/S21.

**P — orientação existente:** Preparar um briefing inicial para o arquiteto avaliar projeto, reforma ou interiores. Qualificação padrão: projeto; espaço; prioridade. Regra editorial de conclusão: “Proposta e cronograma dependem de escopo validado pelo arquiteto; visita e reunião exigem agenda real.”

**E — caminho existente:** Briefing editorial, reunião/visita e identidade individual.

**Configuração / D:** Tipo/área aproximada do imóvel, local, escopo, formato, taxa de visita, etapas e proposta aprovada.

**L / S — diferença a resolver:** Não há orçamento técnico automático nem gestão de obra demonstrados; agenda não resolve deslocamento ou duração de vistoria. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Reforma de apartamento de 70 m² no bairro X.” → registrar briefing e confirmar atendimento/local; perguntar prioridade faltante, se útil ao próximo passo.

- **T+:** Reunião inicial usa escopo e local corretos.
- **T−:** Não dar preço por m² ou prazo de obra sem regra, nem confundir projeto com execução.
- **TL:** Área estimada muda, visita fora de região, serviço composto e cliente pedindo apenas portfólio em botão.

<a id="perfil-escritorio_arquitetura"></a>

### 5.24 Escritório de arquitetura

**Evidência:** S01, `escritorio_arquitetura`, linha 330; S02/S03; S14–S16/S19/S21.

**P — orientação existente:** Classificar o projeto e encaminhar o briefing à equipe responsável pelo tipo de empreendimento. Qualificação padrão: uso; escopo; localização; prazo desejado. Regra editorial de conclusão: “Proposta depende de escopo e análise da equipe; não incluir execução, taxas ou acompanhamento se não estiverem contratados.”

**E — caminho existente:** Briefing de empresa, encaminhamento e reuniões por recurso.

**Configuração / D:** Residencial/comercial, projeto/interiores/acompanhamento, área/local, equipe, unidades, etapas, entregáveis e exclusões aprovadas.

**L / S — diferença a resolver:** Distribuição de projetos por equipe e cronograma contratual não implementados por preset; vários recursos não coordenam a equipe sozinhos. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Loja de 120 m², só projeto, começar em novembro.” → preservar escopo sem incluir obra; direcionar ao responsável real.

- **T+:** Briefing completo acompanha reunião/proposta humana.
- **T−:** Não incluir taxas, execução ou aprovação externa no valor sem configuração.
- **TL:** Múltiplas especialidades na reunião, conflito entre unidades, alteração de escopo e anexos de outro cliente.

<a id="perfil-eletricista"></a>

### 5.25 Eletricista

**Evidência:** S01, `eletricista`, linha 343; S02/S03; S02/S14–S16/S19/S21.

**P — orientação existente:** Entender a ocorrência ou instalação elétrica e organizar contato ou visita do eletricista. Qualificação padrão: demanda; bairro; ocorrência. Regra editorial de conclusão: “Valor final depende da avaliação; informe taxa de visita somente se cadastrada e confirme disponibilidade do eletricista.”

**E — caminho existente:** Coleta de ocorrência/bairro, contato e agenda do profissional.

**Configuração / D:** Serviços atendidos, região, taxa/deslocamento, urgência conforme capacidade real, duração de avaliação, materiais e local.

**L / S — diferença a resolver:** Sem despacho, roteirização ou avaliação elétrica automatizada comprovados; cobrança final não pode derivar só da descrição. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Disjuntor desarma no bairro X.” → registrar relato sem pedir manipulação da instalação, verificar cobertura e acionar o contato configurado.

- **T+:** Vistoria autorizada confirma taxa cadastrada/local/horário.
- **T−:** Urgência não vira chegada prometida; visita paga não é reparo concluído.
- **TL:** Fora de área, relato insuficiente, profissional em deslocamento e mesmo serviço aberto em duas mensagens.

<a id="perfil-encanador"></a>

### 5.26 Encanador

**Evidência:** S01, `encanador`, linha 356; S02/S03; S02/S14–S16/S19/S21.

**P — orientação existente:** Classificar a demanda hidráulica e preparar visita do encanador com informações do local. Qualificação padrão: problema; ponto afetado; local. Regra editorial de conclusão: “Visita, materiais e reparos dependem do escopo. Não inclua quebra, acabamento ou peças em preço sem regra cadastrada.”

**E — caminho existente:** Classificação vazamento/entupimento/instalação, visita e encaminhamento.

**Configuração / D:** Ponto afetado, acesso, endereço/região, taxa, materiais, limites de acabamento/quebra e duração estimada aprovada.

**L / S — diferença a resolver:** Não há orçamento por diagnóstico nem composição de materiais e serviço comprovados; falta agenda com deslocamento. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Vazamento na pia, endereço X, pode hoje?” → consultar cobertura e visita; pedir só acesso/horário ainda necessário.

- **T+:** Visita em área atendida preserva ponto afetado e taxa.
- **T−:** Não incluir peças, quebra e acabamento no preço por suposição.
- **TL:** Vários pontos no imóvel, endereço sem número, cancelamento após saída do profissional e alteração do escopo.

<a id="perfil-tecnico_ar_condicionado"></a>

### 5.27 Técnico de ar-condicionado

**Evidência:** S01, `tecnico_ar_condicionado`, linha 369; S02/S03; S02/S14–S16/S19/S21.

**P — orientação existente:** Reunir informações do equipamento e do serviço para avaliação e agenda do técnico. Qualificação padrão: serviço; equipamento; local. Regra editorial de conclusão: “Confirme itens incluídos no serviço e taxa de visita cadastrada; materiais, acesso especial e carga de fluido exigem avaliação.”

**E — caminho existente:** Coleta de tipo de serviço/equipamento/quantidade, recurso e agenda.

**Configuração / D:** Marca/modelo/capacidade quando relevante, quantidade, acesso/altura, região, duração por aparelho, materiais e taxa.

**L / S — diferença a resolver:** Duração textual do item não multiplica automaticamente a reserva; falta composição de múltiplos aparelhos, deslocamento e restrições técnicas. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Limpar três aparelhos na rua X.” → identificar serviço/quantidade e cobertura; consultar duração cadastrada, sem reservar um único bloco insuficiente.

- **T+:** Serviço simples configurado confirma aparelho(s), local e itens incluídos.
- **T−:** Não garantir carga de fluido/peças inclusas nem horário para três aparelhos com duração de um.
- **TL:** Aparelhos diferentes, acesso especial, mudança de quantidade depois do aceite e viagem entre bairros.

<a id="perfil-corretor_seguros"></a>

### 5.28 Corretor de seguros

**Evidência:** S01, `corretor_seguros`, linha 382; S02/S03; S02/S14–S16/S19.

**P — orientação existente:** Identificar a proteção buscada e preparar uma cotação para o corretor responsável. Qualificação padrão: motivo; seguro; vigência. Regra editorial de conclusão: “Proposta, aceitação, pagamento e início de cobertura dependem de confirmação documental; utilize canal cadastrado para documentos.”

**E — caminho existente:** Identidade individual, motivo/produto/vigência no preset, conversa e consulta.

**Configuração / D:** Cotação/renovação/suporte, tipo de seguro, data informada, documentos mínimos, canal, responsável e fontes de proposta/apólice.

**L / S — diferença a resolver:** Não há emissão, subscrição, sinistro ou início de cobertura integrado demonstrado; default agenda não deve tomar o lugar de suporte. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Meu seguro vence amanhã; quero renovar.” → preservar data e direcionar renovação, sem dizer cobertura renovada.

- **T+:** Cotação é registrada/encaminhada com ramo e data; reunião só se desejada.
- **T−:** Pagamento/consulta agendada não significa aceitação, apólice emitida ou cobertura vigente.
- **TL:** Data expirada, duas apólices, resposta incompleta da equipe e retry de encaminhamento.

<a id="perfil-corretora_seguros"></a>

### 5.29 Corretora de seguros

**Evidência:** S01, `corretora_seguros`, linha 395; S02/S03; S14–S16/S19.

**P — orientação existente:** Direcionar a demanda ao atendimento de seguros adequado e organizar cotação, renovação ou suporte. Qualificação padrão: atendimento; produto; perfil; data. Regra editorial de conclusão: “Cotação não ativa cobertura. Encaminhe documentação e condições à equipe e só informe emissão ou vigência com resultado confirmado.”

**E — caminho existente:** Triagem empresarial por ramo/perfil e encaminhamento configurado.

**Configuração / D:** Equipe/ramo, PF/PJ, cotação/renovação/apólice atual, canais documentais e assistência realmente cadastrada.

**L / S — diferença a resolver:** Roteamento multiequipe e consulta a seguradoras não comprovados; não há garantia de despacho/assistência por mensagem. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Preciso de ajuda com minha apólice empresarial.” → tratar suporte, localizar referência acessível e encaminhar ao destino existente.

- **T+:** Demanda de apólice não reinicia captação nem cria venda.
- **T−:** Não inventar seguradora, telefone de assistência, franquia ou cobertura.
- **TL:** Contato com apólice pessoal e empresarial, mesma data em duas renovações e aviso parcial para equipe.

<a id="perfil-loja_suplementos"></a>

### 5.30 Loja de suplementos

**Evidência:** S01, `loja_suplementos`, linha 408; S02/S03; S04–S13/S19.

**P — orientação existente:** Localizar o suplemento procurado e comparar informações comerciais do rótulo cadastrado. Qualificação padrão: produto; preferência; recebimento. Regra editorial de conclusão: “Confirme produto, variação e estoque real; envio e pagamento seguem as condições da loja.”

**E — caminho existente:** Venda de produtos, sabores/embalagens via SKU, estoque, frete e retirada.

**Configuração / D:** Marca/produto, sabor, peso/quantidade, informação real do rótulo, disponibilidade e políticas comerciais.

**L / S — diferença a resolver:** Sem estrutura especializada de ingredientes/lotes/validade por unidade demonstrada; não confundir com ID histórico de academia. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Whey X de 900 g sabor Y.” → buscar variante exata e comparar rótulo cadastrado se solicitado.

- **T+:** SKU correto mantém preço/estoque e recebimento.
- **T−:** Não inferir indicação clínica, composição ausente ou substituição de sabor.
- **TL:** Tamanhos semelhantes, kit promocional, último estoque e ingrediente relevante não informado no cadastro.

<a id="perfil-oficina_mecanica"></a>

### 5.31 Oficina mecânica

**Evidência:** S01, `oficina_mecanica`, linha 421; S02/S03; S14–S16/S19/S21.

**P — orientação existente:** Organizar a entrada do veículo para avaliação e manter o cliente informado sobre o serviço real. Qualificação padrão: veículo; motivo; disponibilidade. Regra editorial de conclusão: “Agende diagnóstico com disponibilidade real. Prazo de reparo e custo dependem da avaliação, peças e autorização; status só a partir de registro.”

**E — caminho existente:** Agenda de avaliação e informações comerciais; status genéricos existem.

**Configuração / D:** Veículo/modelo/ano, sintoma ou revisão, entrada/retirada, box/técnico/equipamento, taxa diagnóstica, autorização e fonte de status.

**L / S — diferença a resolver:** Não há ordem de serviço automotiva completa nem reserva conjunta de elevador/técnico demonstradas; agenda de entrada não garante término do reparo. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero levar o carro amanhã; está fazendo barulho.” → agendar avaliação real e separar taxa/escopo de eventual orçamento.

- **T+:** Entrada confirmada preserva veículo/motivo; orçamento exige aceite específico.
- **T−:** Não declarar reparado/pronto nem encomendar peças só pelo agendamento.
- **TL:** Carro permanece dias no box, falta de peça, dois veículos do mesmo lead e revisão do orçamento já aprovado.

<a id="perfil-revenda_veiculos"></a>

### 5.32 Revenda de veículos

**Evidência:** S01, `revenda_veiculos`, linha 434; S02/S03; S04/S05/S14–S17/S19/S21.

**P — orientação existente:** Selecionar veículos reais do estoque conforme o perfil e conduzir a visita ou avaliação de troca. Qualificação padrão: veículo desejado; faixa de valor; troca. Regra editorial de conclusão: “Visita, test-drive e reserva exigem confirmação. Valor da troca, crédito e condições finais dependem da equipe e dos dados verificados.”

**E — caminho existente:** Veículos como itens consultivos, fotos, visita e encaminhamento.

**Configuração / D:** Identificador único, modelo/ano/versão/km/preço/mídia reais, situação de estoque, local, vendedor, disponibilidade para test-drive e política de reserva.

**L / S — diferença a resolver:** Não há avaliação de troca, aprovação de crédito ou bloqueio simultâneo veículo+vendedor demonstrados; estoque comercial não prova reserva de veículo. A correção deve acionar os módulos pertinentes das seções 4 e 8, mantendo a dúvida/consulta livre de ação transacional indevida.

**Exemplo esperado (proposto):** “Quero ver esse modelo e dar meu carro na troca.” → resolver veículo, galeria em botão e visita; avaliação da troca segue fonte humana.

- **T+:** Visita confirma unidade e veículo; compra/financiamento ficam como processos distintos.
- **T−:** Não inventar km, aprovação de crédito, valor da troca nem exclusividade após mero interesse.
- **TL:** Duas unidades com modelos iguais, veículo vendido entre consulta/visita, test-drive concorrente e retomada de referência antiga.

## 6. Atividades ausentes e cobertura que não deve ser presumida

### 6.1 Barbearia — inclusão proposta, fora dos 32 atuais

**Evidência:** não há chave/entrada de barbearia em S01. Ocorrência do termo em reconhecimento de nome comercial não implementa atividade. A base S14 permite cadastrar recurso de serviço e agendar um atendimento simples, mas isso não constitui uma experiência completa de barbearia.

**S:** acrescentar perfil empresarial de barbearia, usando identidade/conversa, descoberta de serviços e agenda compartilhadas. Um barbeiro autônomo pode precisar de representação individual; decidir se isso será perfil separado ou configuração de representação antes de criar IDs. Não reutilizar silenciosamente o profissional de estética: serviços, linguagem e informações operacionais diferem.

**Configuração / D:** profissionais e serviços que cada um executa; preço/duração por serviço e, quando aplicável, profissional; corte, barba e combinações; intervalo de limpeza; unidade; cadeiras/equipamentos que limitam atendimento; profissional escolhido ou qualquer disponível; dias/horários/bloqueios; local, política de atraso/cancelamento e eventual sinal somente se configurado. Não exigir cadeira como recurso separado se ela não restringe a operação daquele estabelecimento.

**L:** separar “corte João” e “barba João” em dois recursos hoje pode liberar sobreposição do mesmo profissional. Um recurso “João” evita parte do conflito, mas mantém duração fixa e não representa automaticamente cada serviço/combinação. Agenda precisa resolver oferta de serviço → profissionais elegíveis → duração/intervalo → recursos necessários, com exclusão conjunta no banco. Aceitar “qualquer um” deve selecionar somente profissional habilitado e livre, informar quem foi escolhido e persistir essa escolha.

**Exemplo:** “Corte e barba amanhã depois das 18h com o João.” → reconhecer serviço composto, profissional e faixa já fornecidos; procurar bloco contínuo com duração real; oferecer horários válidos ou alternativa identificada. Não perguntar novamente serviço/profissional nem confirmar duas reservas independentes com duração insuficiente.

- **T+:** corte simples; corte+barba cadastrado; qualquer profissional; cliente mantém profissional ao remarcar.
- **T−:** João ocupado na barba não aparece livre no corte; barbeiro que não executa serviço não é selecionado; não cobrar sinal inexistente.
- **TL:** combinação encosta no fechamento/intervalo, dois clientes aceitam último horário, troca de serviço aumenta duração, cancelamento libera recursos e suprime avisos antigos.

### 6.2 Hamburgueria — especialização proposta

**Evidência:** S10 menciona hamburgueria na orientação de importação de cardápio; S01 contém restaurante/lanchonete, sem ID de hamburgueria. Preset vizinho dá orientação útil, mas não comprova montagem especializada nem entrega local uniforme.

**S:** usar o mesmo módulo de alimentação da pizzaria/restaurante, com configuração de grupos para pão, carne/ponto quando ofertado, queijo, adicionais, retirada de ingredientes, molhos, acompanhamento e bebida do combo. Decidir perfil próprio versus rótulo/variante editorial de restaurante sem duplicar a lógica. A cobertura dos 32 não deve contar essa sugestão como 33º perfil existente.

**Configuração / D:** opções por lanche, inclusões e acréscimos, limites/multiplicidade, substituições do combo, disponibilidade por turno, observações por unidade, área/taxa/mínimo, preparo e retirada. Remover cebola não implica desconto; adicional em um de dois lanches não incide nos dois; regra de ponto ou ingrediente ausente exige esclarecimento factual. Restrições alimentares registradas não comprovam segurança de produção.

**Exemplo:** “Dois combos, um sem queijo, outro com bacon; bebidas diferentes, entrega no bairro X.” → manter cada montagem, cobrar apenas opções configuradas, validar cobertura real e pedir só endereço/dado necessário restante.

- **T+:** dois combos com substituições autorizadas e diferenças por unidade; retirada cadastrada sem frete.
- **T−:** adicional incompatível, entrega fora da região apesar da mesma cidade, opção ausente e indisponibilidade de ingrediente não podem ser ignorados.
- **TL:** último insumo compartilhado entre lanches, combo alterado após checkout, pedido perto do fechamento e mudança de endereço que elimina a isenção.

## 7. Plano de testes compartilhados e evidências de aceitação

Os testes abaixo são **propostos**. Fixtures devem ser sintéticas, com organizações/agentes/instâncias independentes e provedores simulados controláveis. Conversas Gustavo/Renata dão regressões concretas, sem repetir cobranças ou avisos reais. Cada cenário deve verificar resposta, operação persistida, ausência de efeitos proibidos, versão/idempotência e entregas por destinatário; checar apenas texto/prompt é insuficiente.

| ID | Cenário e variações | Resultado verificável esperado |
|---|---|---|
| C01 | Primeiro pedido e revisão explícita já bem-sucedidos | Mesmos itens/consentimentos válidos; um pedido; total/frete recalculados; sem regressão do caminho auditado |
| C02 | Elogio, agradecimento, dúvida antes de pagar, negação de mudança | Nenhuma nova cobrança, remoção, reserva ou repetição de checkout; responder à necessidade atual |
| C03 | “Esse”, “ele também”, resposta citada, duas recomendações, referência antiga | Item único comprovado é resolvido; ambiguidade pede identificação; não escolher pelo preço/proximidade do nome |
| C04 | Intenção repartida em mensagens, correção rápida e duas operações reais | Agregar fatos compatíveis dentro de contexto vigente; distinguir repetição de intenção de operações diferentes; conflito pede esclarecimento |
| C05 | “Troca por Pix… troca pra mim” com pendência antiga de produto | Uma intenção de pagamento; pendência incompatível não bloqueia indefinidamente; não aplicar alteração de produto negada |
| C06 | Aceite curto, versão antiga, negativa e alteração de assunto | Aceite só vale para proposta atual e pertinente; conflito de versão gera nova prévia, nunca aplicação silenciosa |
| C07 | Troca de método com sessão ativa, falha/timeout ao invalidar, pagamento chega durante revisão | Reconciliar sessão e estado real; não criar cobrança concorrente diante de incerteza; pago não continua tratado como editável por memória antiga |
| C08 | Reenvio do mesmo inbound, concorrência de workers e retomada após falha | Chave estável evita duplicação; replay devolve resultado existente; lease antigo não executa ação nova |
| C09 | Texto, card, imagem, legenda, rodapé, mapa, galeria, checkout, aviso humano e responsável | Todo link somente em botão; nenhum duplicado/solto; destino é entidade/rota autorizada; galeria opcionalmente com primeira imagem real |
| C10 | URL inventada, UUID errado, produto de outro escopo, destino removido e external_site configurado | Não validar só por `/w`; bloquear destino inválido, permitir destino externo autorizado; responder ausência factual sem inventar reparo |
| C11 | Mais de três botões, falha da primeira/segunda parte, timeout após aceite externo | Registrar partes e recibos; sucesso parcial/incerto não vira sucesso completo; retry não repete partes já confirmadas nem usa URL textual |
| C12 | Nome após “com quem eu falo?”, nome de uma palavra e nome em título de produto/citação | Capturar identidade somente com evidência da resposta; não trocar nome por marca/personagem nem repetir pergunta já respondida |
| C13 | Oferta de agenda dentro/fora de validade, retorno após nome e aceites concorrentes | Retomar oferta válida; reconsultar expirada; uma reserva quando último slot disputado; confirmação usa item/data/hora/local reais |
| C14 | Profissional em dois serviços/unidades, duração composta, buffer e recurso conjunto | Após extensão aprovada, nenhuma sobreposição dos recursos necessários; versão simples deve recusar configuração que não consegue garantir |
| C15 | Cancelar/remarcar no painel, repetir requisição, aviso e lembrete antigos em fila | Lead e responsável avisados conforme evento atual; idempotência por público; lembrete cancelado não sai; nenhuma repetição retroativa do teste real |
| C16 | Cancelamento/reset durante processing/sending, mensagem externa já em voo | Worker revalida estado/lease e não recria lead/reserva; registrar resultado incerto quando necessário, sem prometer recolher mensagem aceita pelo provedor |
| C17 | Reset de lead com pedidos, agenda, pendências e memórias legadas | Limpar escopo autorizado e impedir revival; preservar configurações da empresa; não chamar cancelamento financeiro externo por inferência |
| C18 | Mesmo telefone/nome/item aparente entre empresas, agentes e instâncias | Nenhum catálogo, pedido, foto, reserva ou aviso cruza o escopo; manter visibilidade explicitamente compartilhada por configuração |
| C19 | Catálogo com 0/1/40/41/80/81+ itens, SKU antigo, item arquivado e atribuição de agente | Buscar fora do lote quando necessário; distinguir ausência de erro/falta de acesso; não negar item só por recorte |
| C20 | Endereço só com cidade/bairro, CEP incompatível, geometria fora com texto dentro | Dados insuficientes pedem só o que falta; evidência contraditória não cai em fallback permissivo; mesma regra em conversa, checkout e revisão |
| C21 | CEP no limite, raio/polígono na borda, zonas sobrepostas/inativas, mínimo e isenção no centavo | Política explícita e determinística; preço elegível consistente em todos os caminhos; sem depender da ordem incidental do array |
| C22 | Troca de endereço/mode, retirada indisponível, fechado, janela de preparo/entrega | Recalcular cobertura/taxa/prazo/resumo antes de aceitar; retirada só se habilitada; não fabricar prazo com dias de frete |
| C23 | Pizza meia-meia, borda/adicional por metade/unidade, combo e observação grátis | Aplicar somente regra configurada; total reproduzível; observação não vira cobrança; composição permanece no pedido operacional |
| C24 | Estoque/SKU muda após oferta, dois checkouts concorrentes, webhook duplicado | Revalidar e não baixar estoque duas vezes; testar todos os caminhos de pagamento utilizados, sem afirmar proteção universal só por um teste |
| C25 | Pedido de humano, dúvida de suporte, orçamento e destino externo | Próximo passo pertinente; não exigir venda/agenda; aviso “enviado” só com resultado; link externo não prova conclusão externa |
| C26 | Assinatura, curso, turma e pacote com agenda | Separar consentimento financeiro, matrícula/vaga e ocorrência da agenda; só confirmar estados que possuem integração/resultado |
| C27 | 32 perfis, pares profissional/empresa, modo manual, atividade alterada e overrides | Preservar personalizações e identidade efetiva; não reintroduzir roteiro rígido nem executar default de destino contra configuração salva |

### 7.1 O que os testes existentes já cobrem e o que não provam

Foram lidos cenários existentes de configuração de atividade, comércio, revisão, entrega e agenda. `tests/agent-activity-setup.test.ts` percorre os 32 presets e verifica geração/personalização/diferenças de representação. Isso comprova o contrato testado de configuração, não uma operação completa por profissão. Alguns testes de atendimento humanizado verificam presença de instruções no código/prompt, insuficiente para afirmar uma ação real correta.

Há cenários de entrega em `tests/order-shipping-commerce-scenarios.test.ts`, de revisão em `tests/whatsapp-order-revision-runtime.test.ts`, de agenda em `tests/agenda-direct-turn.test.ts` e `tests/customer-agenda.test.ts`, além de testes de links, retomada, encaminhamento, reset e SQL. Os testes de pizza lidos usam produtos sintéticos simples; não certificam o combinador meia-meia proposto. Os testes de recurso/capacidade não certificam exclusão conjunta entre profissionais e calendários diferentes. A existência de estoque e baixa pós-pagamento também não comprova ausência de overselling em todos os provedores.

**Histórico anterior à pausa:** houve resultado de 259 testes aprovados em três arquivos de intenção/revisão/cortesia. Esse resultado antecede as últimas edições parciais de links/fallbacks. Não certifica o rascunho atual. **Nesta rodada documental não foram executados testes funcionais, lint, TypeScript, build ou ensaios de produção.**

## 8. Plano de correção priorizado para aprovação posterior

O plano combina correções comuns e extensões específicas. As etapas abaixo não autorizam implementação/publicação nesta tarefa. Preservar checkout, revisão explícita e reserva atômica que já funcionaram; evoluir os componentes existentes com contratos claros, sem substituir tudo nem copiar um agente por atividade.

| Prioridade / pacote | Escopo proposto | Dependências e critério para considerar concluído |
|---|---|---|
| P0.1 — Base e regressões | Revisar as seis alterações pausadas contra os achados; contrato de intenção/referência/consentimento; separar elogio/dúvida/compra/revisão/agenda/suporte; resolver pendência incompatível | C01–C08/C12/C25; operação persistida e ausência de ação indevida, não só resposta bonita; passar revisão de código antes de reaproveitar rascunho |
| P0.2 — Fatos e entrega WhatsApp | Validar entidade/URL antes do rastreio; renderer comum de botões para todos os públicos; galeria real; remover fallbacks; recibos por parte e reconciliação | C09–C11/C18; cobrir mensagens geradas pelo runtime e avisos fora dele; nenhum sucesso total para envio incompleto |
| P0.3 — Agenda e eventos já suportados | Corrigir nome/retomada; persistir vínculo/snapshot mínimo de item/local/profissional quando aplicável; confirmação legível; cancelamento do painel para lead e responsável | C12/C13/C15–C18; manter reserva atômica/versão; migração eventual só em fase futura autorizada; sem aviso retroativo |
| P1.1 — Descoberta e escolhas | Busca paginada/filtrada sob demanda no catálogo com escopo; distinguir opções/atributos/SKU e item indisponível; referências robustas | C03/C18/C19/C24; achar item antigo sem expor catálogo de outro agente; eliminar seleção por fragmento ambíguo |
| P1.2 — Entrega local consistente | Unificar elegibilidade/cotação de conversa, criação, edição pública e revisão; suportar explicitamente bairros/CEPs/raio/polígono escolhidos; taxa/mínimo/isenção; endereço e retirada | C20–C22, com geometria/limites/overlap e valores no centavo; cadastro e motor precisam expressar a mesma regra; não anunciar suporte ao modo apenas por existir UI |
| P1.3 — Horários de operação | Configurar janelas de pedido, preparo, entrega e retirada separadas da agenda/frete em dias; modo de estimativa e indisponibilidade | C22; nenhuma promessa sem configuração/fonte; observar pausas, virada do dia, feriados e capacidade se fizer parte da oferta |
| P2.1 — Alimentação | Modelo estruturado de montagem/preço/restrições/observações por unidade; meia-meia/bordas/combos; disponibilidade; preservar composição em carrinho/pagamento/revisão e resumo operacional | Decisões D01–D03 abaixo e P1; C23/C24 mais fichas pizza/restaurante/hamburgueria; não vender combinação livre como suportada antes dessa etapa |
| P2.2 — Serviços e barbearia | Profissionais elegíveis, duração variável/composta, buffers, recursos simultâneos e local; introduzir perfil de barbearia após decisão de representação | P0 agenda + D06; C14 e fichas de serviços; testes SQL de concorrência e persistência do profissional/serviço escolhido |
| P2.3 — Domicílio e equipes | Cobertura específica de atendimento, taxa de visita/deslocamento, agenda compatível com locais, encaminhamento por equipe quando cadastrado | D07; C14/C20/C25; não herdar preço de frete de mercadoria nem prometer despacho pelo aceite da visita |
| P3 — Extensões dependentes de produto | Turmas/vagas/matrícula, séries e reposição, consumo de pacotes, ordens de serviço, compatibilidade automotiva, integrações externas específicas | Definir quais serão capacidades nativas e quais permanecerão encaminhamento/destino externo; cada capacidade exige fonte, estado e recibo; não é requisito de todos os perfis |

**Prioridade não dispensa completude:** P2.1 é necessária para anunciar montagem livre de pizza/hambúrguer; P2.2 é necessária para anunciar agenda completa por profissional/serviço. Até lá, limitar a oferta às combinações e recursos simples efetivamente suportados ou encaminhar a exceção explicitamente. O mínimo aceitável não é esconder ausência de regra com um prompt mais forte.

**Sequência de validação futura:** testes focados por componente alterado → regressões integradas comuns e fichas afetadas → TypeScript/lint/build exigidos pelo repositório → revisão do diff → homologação controlada autorizada com configuração representativa. Resultados externos devem ter horário, ambiente, versão, IDs sem dados sensíveis e recibos; só então atualizar o estado operacional como verificado. Nem simulação nem cobertura documental autorizam marcar todas as integrações como operacionais.

## 9. Decisões de produto e dados que precisam existir

### 9.1 Já decidido pelo titular

- Base comum de conversa/contexto/ações com módulos por necessidade, mantendo particularidades de cada atividade.
- Links somente em botões para lead e responsável; sem URL duplicada em corpo/legenda/rodapé e sem fallback solto. Galeria em botão ou primeira foto real + botão.
- Cancelamento pelo painel avisa lead e responsável; confirmação da visita usa item, data/hora e local reais, sem timezone técnico.
- Preservar consentimento, verdade financeira, revisão funcional, reserva sem conflitos, reset e isolamento. Não afirmar ação executada sem resultado.
- Entrega de pizzaria exige área efetivamente atendida; município igual não basta. Não inventar regra comercial ausente.
- Implementação fica pausada até a revisão deste levantamento.

### 9.2 Decisões ainda abertas

| ID | Decisão | Quem define / efeito |
|---|---|---|
| D01 | Política de preço de pizza por fração, limites de sabores e borda/adicional por unidade/fração | Estabelecimento escolhe dentre modos realmente suportados; produto define schema/cálculo/validação. Sem regra, não calcular combinação livre |
| D02 | Combos fixos/substituíveis, adicionais repetidos, descontos e observações | Estabelecimento informa; produto precisa separar preço/seleção/observação e auditar alteração |
| D03 | Estoque só de SKU versus componentes/ingredientes e disponibilidade por turno | Produto define alcance nativo e fonte; não presumir que baixa de produto controla cozinha |
| D04 | Autoridade entre bairro/CEP/coordenada, tolerância geográfica, borda e zonas sobrepostas | Produto define política explícita configurável/testável; estabelecimento delimita áreas reais. Não escolher “mais barato” ou primeira zona sem decisão |
| D05 | Mínimo/isenção por zona, base do subtotal, horários/preparo/capacidade e retirada | Estabelecimento configura fatos; produto define fórmula/precedência e indisponibilidade. Caso incompleto pede dado ou encaminha, sem inventar |
| D06 | Profissional específico/qualquer disponível, duração, recursos conjuntos, combinação de serviços e buffers | Operação cadastra; produto resolve alocação atômica. Definir representação/perfil de barbearia e rótulo de hamburgueria |
| D07 | Domicílio: área de serviço, visita tarifada, deslocamento, orçamento, janela versus horário exato | Operação define; produto decide consulta/agenda/despacho suportados, mantendo estados distintos |
| D08 | Matrícula, turma, vaga, série, reposição, pacote e recorrência | Produto decide módulos nativos/integrações; estabelecimento fornece calendário/regras. Cobrança existente não supre esses contratos |
| D09 | Snapshot e privacidade de local: endereço público, ponto de encontro e dados do item na reserva | Titular/estabelecimento define o local comunicável; produto persiste referência/versionamento sem fabricar rua ou expor sede privada |
| D10 | Aviso por público quando lead e responsável têm o mesmo telefone; eventos em voo e revisão de notice | Produto define deduplicação/recibo e limite da garantia; manter prevenção de aviso obsoleto sem fingir atomicidade com rede externa |
| D11 | Restrições e conferência humana por item/serviço | Operação informa condições aprovadas; produto define bloqueio verificável antes de vender/agendar onde necessário. Este documento não é validação jurídica/clínica de regras comerciais |
| D12 | Catálogo consultivo grande: filtros, relevância, limite de opções e informação ausente | Produto define busca e UX; carregar só 80/mostrar 40 não pode fundamentar negativa exaustiva |

Não é preciso coletar todas as decisões numa conversa com o lead. Dados estáveis pertencem ao cadastro do estabelecimento; no turno, pedir apenas o dado que falta para a intenção atual. Exemplo: endereço completo já conhecido e contraditório com geolocalização pede confirmação do local, não nova coleta de todo o cadastro. Falta de taxa é configuração da empresa, não uma pergunta para o consumidor inventar preço.

## 10. Encerramento desta rodada e limites

Entregável: matriz dos 32 perfis, 32 fichas individuais, duas especializações ausentes propostas, mapa de fontes, diferenças de implementação, configurações/decisões, exemplos e testes por atividade, testes comuns e plano priorizado. O inventário é de código; não comprova quais perfis estão ativos em clientes reais.

Somente este documento foi escrito durante a ampliação da auditoria. As seis alterações funcionais anteriores permanecem pausadas e devem ser revisadas antes de qualquer reaproveitamento. Não houve commit, deploy, migração, edição de configuração de cliente, mensagem WhatsApp ou transação real nesta rodada. O estado operacional não recebeu afirmação de nova capacidade funcionando.

Verificação documental final: os 32 IDs do arquivo de presets possuem ficha e entrada na matriz; todos os links locais e caminhos de testes citados resolvem; os hashes SHA-256 dos seis arquivos funcionais coincidem com o registro anterior à escrita do plano. `git diff --check` não apontou erro de whitespace nos arquivos rastreados, apenas avisos de conversão LF/CRLF. Essas verificações não são testes funcionais.

Esta é uma auditoria de código/documentação orientada aos percursos relevantes, apoiada pela auditoria real anterior nos casos delimitados. Ausência de um contrato nos caminhos examinados está marcada como lacuna/evidência insuficiente, não como prova sobre todos os sistemas externos. Testes aqui descritos são critérios futuros; não há garantia de zero erros. **Trabalho encerrado na entrega do plano para revisão do titular; implementação não retomada.**
