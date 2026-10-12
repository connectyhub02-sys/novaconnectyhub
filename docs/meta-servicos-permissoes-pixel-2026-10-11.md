# Serviços Meta e plano de conexão para a ConnectyHub

Decisão do titular em 11/10/2026: construir um gestor de tráfego por IA que use os
resultados autorizados de cada empresa, da descoberta à venda, reunindo anúncios,
conteúdo orgânico, atendimento, loja e CRM. A conexão deve oferecer seleção de
Página, Instagram, conta de anúncios, Pixel/Dataset e catálogo, sem exigir que o
cliente crie um aplicativo Developer ou copie credenciais. WhatsApp oficial
mantém seu fluxo de conexão de números dentro dessa central.

Não existe uma permissão que habilite todo o ecossistema. Aprovação do aplicativo,
escopos concedidos pelo cliente, acesso ao ativo e implementação do recurso são
condições diferentes. A própria [referência oficial de permissões](https://developers.facebook.com/documentation/development/permissions)
orienta solicitar somente usos implementados, com demonstração; pedir escopos
sem necessidade pode causar rejeição. O mapa abaixo é um plano de cobertura,
não uma declaração de aprovação ou disponibilidade comercial.

## Estado confirmado

- MCP oficial: descoberta de ferramentas, consulta de campanhas e oportunidades
  funcionaram no painel publicado da organização interna. A conta retornou zero
  campanhas e score de oportunidade 100, sem recomendações. Esse score não
  significa retorno financeiro, qualidade de rastreamento ou campanhas rentáveis.
- `ads_mcp_management`, `leads_retrieval` e `pages_manage_ads` estão concedidos
  ao token próprio de teste. `ads_management` está selecionado na configuração
  do login, mas não apareceu entre os escopos concedidos. Gerenciamento de
  campanhas ainda não está homologado.
- Lead Ads: formulário próprio sem anúncio, assinatura `leadgen` e webhook real
  recebido. O relatório [Ads MCP e Lead Ads](meta-ads-mcp-lead-ads-2026-10-11.md)
  registra o resultado da importação e a situação final da demonstração.
- Publicação atual: Facebook feed/foto e imagem Instagram têm código e fila de
  agendamento. Reels, Stories, carrossel e insights completos ainda precisam de
  implementação/homologação. Perfil e mídias não equivalem a métricas completas.
- Comentários, Direct e Messenger têm testes reais anteriores em ativos próprios
  e isolados de revisão; a liberação externa depende do App Review e dos controles
  de ativação por organização. WhatsApp tem chat, modelos e fila de campanhas;
  lotes e múltiplos números reais ainda exigem piloto.
- Pixel atual: existe `META_PIXEL_ID` na manutenção e sua exibição no dashboard.
  A busca no código não encontrou instalação `fbq`, seleção de Pixel por cliente
  nem envio CAPI para as lojas/páginas. Portanto, rastreamento não está pronto.
- O dashboard antigo do admin ainda consulta credenciais de plataforma, enquanto
  o novo painel MCP usa a conexão da organização interna. Unificar essa origem
  é necessário para eliminar indicadores conflitantes, sem copiar tokens de
  clientes para o cofre global.

## Serviços principais e permissões

Escopos abaixo seguem o login atual via Facebook Login for Business. Dependências
de leitura de Página e descoberta de ativos devem acompanhar cada solicitação.
Os nomes e condições foram conferidos na referência oficial em 11/10/2026;
a documentação mostrava atualização de 29/09/2026.

| Serviço para o cliente | Permissões principais | Próxima entrega e demonstração |
| --- | --- | --- |
| Conectar ativos da empresa | `business_management`, `pages_show_list`, `pages_read_engagement`, `instagram_basic` | Seleção explícita por organização, acesso real e reconexão preservando escolhas |
| Relatórios de anúncios e análise por IA | `ads_read`; `ads_mcp_management` para MCP | Painel legível com período, conta e origem dos dados; separar ausência de dados de erro |
| Criar, editar, pausar e otimizar anúncios | `ads_management`, `ads_mcp_management`; `pages_manage_ads` para operações da Página | Campanha inicialmente pausada, revisão do plano/orçamento, execução auditada e limites; não ativar no teste atual |
| Anúncios que abrem WhatsApp, Direct ou Messenger | `ads_management`, `pages_manage_ads`, mais a integração do canal de destino | Associar destino e campanha, receber conversa e medir resultado; não confundir anúncio com disparo |
| Lead Ads para CRM | `leads_retrieval`, `pages_manage_ads`, `ads_read`, `ads_management`, `business_management`; `pages_manage_metadata` para webhook | Formulário selecionado → evento → cadastro idempotente; demonstrar na conta isolada |
| Pixel e API de Conversões da loja | `ads_read`, `ads_management`, `pages_read_engagement`, acesso ao Pixel; `business_management` para ativos | Seleção do Pixel/Dataset, eventos de teste, deduplicação e diagnóstico por cliente |
| Publicar/agendar conteúdo Facebook | `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` | Publicação real pelo painel, resultado na Página e status do agendamento |
| Publicar/agendar fotos, vídeos, Reels e Stories Instagram | `instagram_content_publish`, `instagram_basic`, escopos de Página | Expandir formatos e validar limites de mídia/conta; Stories dependem de conta Business |
| Análise orgânica Facebook | `read_insights`, `pages_read_engagement`, `pages_show_list` | Coletar métricas disponíveis, histórico, período e relatórios |
| Análise orgânica Instagram | `instagram_manage_insights`, `instagram_basic`, escopos de Página | Insights de perfil/mídia, histórico e recomendações; métricas dependem da versão e do conteúdo |
| Comentários Instagram e comentário → Direct | `instagram_manage_comments`, `instagram_manage_messages`, `instagram_basic`, escopos de Página/webhook | Regras explícitas, revisão, resposta privada elegível e continuação após interação |
| Comentários Facebook | `pages_read_user_content`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_show_list` | Moderação e respostas configuradas; evitar respostas duplicadas e loops |
| Atendimento Direct/Messenger pelo mesmo agente | `instagram_manage_messages`, `pages_messaging`, `pages_manage_metadata`, dependências de Página/Instagram | Melhorar compositor, mídia, botões e ferramentas do agente; preservar janela de atendimento |
| WhatsApp oficial com números, modelos, mídia e campanhas | `whatsapp_business_management`, `whatsapp_business_messaging` | Conexão guiada, modelos aprovados, público autorizado, recibos e piloto de lote/múltiplos números |
| Catálogo da loja e anúncios dinâmicos | `catalog_management`, `business_management`, escopos de Ads | Sincronizar produtos, preço, estoque, imagens, conjuntos e diagnóstico; usar IDs iguais nos eventos |
| Marcação de produtos no Instagram | `instagram_shopping_tag_products`, `instagram_basic`, dependências de Página | Conferir elegibilidade comercial, catálogo e marcação real; não prometer Shops a toda conta/país |

A [coleção oficial do Instagram](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login)
confirma a exigência de conta profissional vinculada à Página nesse tipo de login.
O login direto pelo Instagram usa outra família de escopos `instagram_business_*`;
não basta acrescentá-los ao fluxo Facebook atual. Pode ser uma opção futura para
clientes que desejam apenas Instagram, sem substituir a conexão de anúncios.

## Oportunidades adicionais

Estas capacidades aparecem na referência oficial, mas ainda precisam de produto,
endpoint validado, elegibilidade da empresa e demonstração. Não adicionar todas
ao rascunho atual apenas para reservar acesso.

| Oportunidade | Permissões ou mecanismo | Condição de oferta |
| --- | --- | --- |
| Remarketing, públicos próprios e semelhantes | Marketing API/MCP, `ads_management` | Fontes autorizadas, termos aplicáveis e limites de categoria; nenhum upload de listas nesta etapa |
| Testes A/B e medição de incremento | Ferramentas MCP de experimentos e Marketing API | Elegibilidade e amostra suficientes; sem prometer resultado com conta vazia |
| Diagnóstico de qualidade das conversões | Ferramentas MCP `ads_get_datasets`, `ads_get_dataset_quality`, `ads_get_dataset_stats` | Descobertas no servidor oficial; precisam ser integradas e testadas, hoje fora da allowlist de execução |
| Eventos de vendas no atendimento para otimização | `whatsapp_business_manage_events`, `instagram_manage_events`, `pages_events` conforme canal | Integrar CAPI de Business Messaging e registrar somente eventos comerciais válidos |
| Mensagens utilitárias no Messenger | `pages_utility_messaging`, integração Messenger | Modelos e elegibilidade específicos; não é autorização genérica para marketing |
| Marketing pago no Messenger com adesão | `marketing_messages_messenger` e/ou modalidade `paid_marketing_messages`, com dependências | Confirmar modalidade vigente, beta/termos/custos e adesão; não ativado neste teste sem gastos |
| Excluir mídia própria do Instagram | `instagram_manage_contents` | Implementar confirmação e demonstrar com mídia descartável; permissão não é a de publicação |
| Curtidas gerenciadas no Instagram | `instagram_manage_engagement` | Ações úteis de relacionamento com controles; evitar estímulo a engajamento artificial |
| Eventos futuros no Instagram | `instagram_manage_upcoming_events` | Módulo de evento e prova de criação/edição; diferente de eventos de conversão |
| Campanhas com criadores/Partnership Ads | `facebook_branded_content_ads_brand`, `instagram_branded_content_ads_brand`, `instagram_branded_content_brand`, `instagram_branded_content_creator` | Escolher só os papéis usados pelo produto e obter autorização do criador |
| Descoberta de criadores | `instagram_creator_marketplace_discovery`, `facebook_creator_marketplace_discovery`; mensagens de parceria: `instagram_creator_marketplace_messaging` | Acesso/elegibilidade ao marketplace e novo módulo de parcerias |
| Threads orgânico | `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_read_replies`, `threads_manage_replies` | OAuth Threads e adaptador próprios |
| Threads: pesquisa, menções, exclusão e compartilhamento | `threads_keyword_search`, `threads_profile_discovery`, `threads_manage_mentions`, `threads_delete`, `threads_share_to_instagram`, `threads_location_tagging` | Habilitar conforme funções efetivamente construídas; não misturar com anúncios |
| Anúncios Threads | `threads_business_basic` mais Ads | Identidade Threads para anúncio; não habilita publicação orgânica |
| Pedidos e relatórios de Commerce | `commerce_account_read_orders`, `commerce_account_manage_orders`, `commerce_account_read_reports`, `commerce_account_read_settings`, `commerce_manage_accounts` | Somente contas/mercados elegíveis; catálogo com checkout próprio pode ser entregue antes |
| Vídeo ao vivo e conteúdo comercial em live | `publish_video`, `live_shopping_manage_video` conforme operação | Validar disponibilidade do produto e superfícies atuais antes de solicitar |
| Chamadas oficiais WhatsApp/Messenger | Permissões de mensagens correspondentes, configurações e APIs de chamadas | Novo módulo de telefonia, consentimento/regras e custo; texto funcionando não comprova chamadas |
| Idioma, fuso e CTA de Página | `pages_user_locale`, `pages_user_timezone`, `pages_manage_cta` | Somente quando necessários ao atendimento/configuração, não à segmentação indiscriminada |

Permissões de jogos, dados pessoais sem uso de negócio e produtos fora desse
escopo não tornam a ConnectyHub mais completa. Canais de transmissão, grupos,
status, capacidades especiais e extensões de janela precisam de verificação
específica; não são garantidos pelo simples aceite de todos os escopos. Acesso
de atendimento humano não deve ser usado para liberar automação fora da janela.

## Conexão única com seleção de recursos

1. Cliente clica em **Conectar Meta** e escolhe os módulos desejados: conteúdo,
   atendimento, anúncios e vendas. O painel pode reunir tudo, mas não deve exigir
   conta de anúncios para alguém que deseja somente atendimento.
2. Janela oficial autoriza os ativos existentes. A ConnectyHub confirma escopos
   realmente concedidos e os IDs acessíveis, sem presumir que o pedido foi aceito.
3. Cliente escolhe conta de anúncios e Pixel/Dataset; catálogo é associado quando
   disponível. Não escolher automaticamente o primeiro ativo da lista.
4. Cliente escolhe em quais lojas/páginas da própria organização o Pixel opera.
   Para sites externos, oferecer instalação própria e confirmação de domínio.
5. WhatsApp abre Embedded Signup para empresa/número. Threads pode exigir seu
   OAuth específico. Uma central única pode conter mais de uma etapa oficial.
6. Diagnóstico mostra cada recurso como conectado, sem permissão, não elegível,
   aguardando revisão ou ainda não implementado. Reconexão/revogação deve suspender
   operações dependentes sem apagar histórico ou transferir ativos.

Para não exigir tokens manuais, avaliar a
[Facebook Business Extension no fluxo CAPI para plataformas](https://developers.facebook.com/documentation/ads-commerce/conversions-api/set-up-conversions-api-as-a-platform).
A Meta a recomenda como opção de autorização dos Pixels dos clientes. O guia
também exige App Review, acesso avançado, Marketing API Access Tier e lista
representante Meta entre os pré-requisitos. Essa habilitação não foi confirmada
para a ConnectyHub; não prometer que um ajuste no OAuth atual resolve tudo.

## Pixel e conversões por empresa

**Atualização de 12/10/2026:** seleção por empresa, consentimento, fila CAPI e
integração nas lojas/páginas próprias implementados. PageView, ViewContent e
AddToCart confirmados em Eventos de teste da Meta; dois Pixels isolados usados.
Compra real, deduplicação em modo normal e sites externos permanecem fora da
validação desta rodada. Ver [entrega e evidências](meta-pixel-conversoes-2026-10-12.md).
As observações de ausência de implementação acima retratam a auditoria de 11/10.

- Persistir seleção e vínculo de loja/domínio por organização. Tokens no cofre
  do servidor, nunca em HTML, JavaScript público ou parâmetros visíveis.
- Reutilizar Pixel/Dataset existente quando autorizado; criação é uma etapa
  explícita para quem não tem, sem duplicar ativos por reconexão.
- Eventos iniciais: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`,
  `Lead` e `Purchase`. Compra só após confirmação efetiva do pagamento; abertura
  de checkout, Pix gerado ou pedido criado não são venda paga.
- Browser e servidor devem compartilhar `event_name` e `event_id` para
  [deduplicação](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events).
  Fila persistente e chave idempotente também impedem reenvios indevidos.
- Aplicar a escolha de consentimento ao Pixel e à CAPI. Não usar envio pelo
  servidor como forma de contornar recusa. Minimizar campos e normalizar/hash
  quando exigido; não enviar conversas integrais, informações sensíveis ou dados
  de outra organização para criar públicos.
- Testar no Events Manager com evento marcado como teste, verificar recepção,
  deduplicação e isolamento entre duas lojas. Diagnóstico deve distinguir evento
  recebido de correspondência/atribuição e venda atribuída.
- Integrar produtos ao catálogo com identificadores estáveis, para que o item
  visualizado/comprado corresponda ao mesmo produto no anúncio dinâmico.

## Gestor de tráfego por IA

O fluxo será **dados autorizados → diagnóstico → plano → revisão → execução →
medição**. Começar em modo consultivo, com relatórios reais e propostas de campanha.
Depois liberar criação pausada, revisão de criativo/público/orçamento e execução
controlada. O teste atual permanece sem gastos.

O usuário escolhe objetivo, produtos, região comercial, orçamento máximo e grau
de autonomia. O servidor deve impor limites por campanha e organização, registrar
cada ação, exigir reconfirmação quando mudar o plano aprovado e permitir pausa
imediata. A IA não pode escolher outra conta ou aumentar verba por uma instrução
encontrada em comentário, lead ou página externa.

Análises combinam métricas orgânicas, anúncios e estágios do CRM. Publicação com
bom engajamento pode virar sugestão de anúncio; venda confirmada pode alimentar
medição. Curtidas, score MCP e receita cadastrada não comprovam causalidade nem
retorno sobre investimento. Mostrar período, origem, atraso e limitações dos dados.

## Ordem de implementação e revisão

1. **Fechar Ads MCP e Lead Ads:** validar importação real, registro do cron,
   demonstrações e reprodução nos ativos isolados do avaliador. Resolver escopo
   `ads_management` ausente antes de prometer criação de campanhas.
2. **Pixel/Dataset e CAPI:** seleção por cliente, consentimento, eventos de loja,
   deduplicação, diagnóstico e definição da conexão FBE/alternativa oficial.
3. **Publicação e insights:** completar os formatos e métricas, acrescentar
   `pages_manage_posts`, `instagram_content_publish`, `read_insights` e
   `instagram_manage_insights` às solicitações quando as demonstrações existirem.
4. **Gestor de anúncios:** criação pausada, orçamento/objetivo, criativos,
   públicos, aprovação, execução limitada e rastreio de resultados.
5. **Catálogo e vendas:** sincronização, produto nos eventos, anúncios dinâmicos,
   marcação de produtos e eventos de conversão do atendimento.
6. **Expansões elegíveis:** criadores, Threads, chamadas, mensagens comerciais
   Messenger, Commerce e demais oportunidades conforme demanda e acesso.

Cada lote de revisão deve conter uso concreto, login completo, recurso executado
no painel, resultado real na Meta, credenciais de avaliação isoladas e instruções
reproduzíveis. Não misturar funcionalidades apenas planejadas com demonstrações
concluídas. Publicação do aplicativo e uso por administrador/testador não
substituem aprovação para clientes externos.
