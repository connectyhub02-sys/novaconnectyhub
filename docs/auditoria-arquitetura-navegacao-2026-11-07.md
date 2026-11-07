# Auditoria de organização e simplificação da ConnectyHub

Data: 07/11/2026. Painéis cliente e administrador. **Entrega de auditoria e proposta; não aplicada à navegação nem publicada.** Complementa o [refinamento local](refinamento-paineis-2026-11-07.md) e a [auditoria de uso no celular](auditoria-ux-navegacao-inicio-atendimento-2026-11-07.md).

## Conclusão

A plataforma pode ser simplificada principalmente pela organização das tarefas, por nomes mais claros e pela redução das configurações expostas. A melhoria anterior de cores, espaço e atendimento continua útil, mas o agrupamento atual ainda depende do endereço da página. Isso coloca conversas de canais Meta dentro de “Divulgação” e automações dentro de “Ferramentas” ou “Plataforma”.

A recomendação é **uma entrada por tarefa, uma fonte de configuração por responsabilidade e execução técnica em segundo plano**. Reunir a apresentação de uma tarefa não implica fundir provedores, filas, permissões ou cobranças.

Antes dessa reorganização, corrigir o risco de sobrescrita de configurações descrito em IA-01. Não houve gravação em contas reais para demonstrá-lo.

## Cobertura e evidências

| Camada | Cobertura desta auditoria | Limite |
|---|---|---|
| Páginas dos painéis | 78 arquivos `page.tsx`: 40 admin e 38 cliente; imports, componentes, redirecionamentos e destino proposto para cada um | Arquivos de rotas, não 78 telas independentes. Rotas dinâmicas produzem vários destinos |
| Menu principal | 36 entradas admin + 26 cliente; mais 4 entradas do modo restrito, analisadas separadamente | Contagem da configuração completa; acesso efetivo depende do perfil/estado |
| Compatibilidade | 16 páginas de redirecionamento sem conteúdo próprio, além de redirects condicionais | Alias não é funcionalidade duplicada nem deve ser apagado indiscriminadamente |
| Automações | Registro Inngest completo: 50 definições fixas + 8 geradas de Growth = 58; rastreamento aprofundado dos grupos descritos abaixo | Registro no código não comprova implantação ou execução de cada rotina |
| Uso | Leitura de eventos agregados e perfil administrativo atual, sem alterações no banco | Não comprova sucesso de tarefas, representatividade ou uso por pessoas externas |
| Celular | Reutilizada a evidência anterior de navegação, início e atendimento; análise estática das outras entradas | Não foram exercitados todos os formulários/fluxos em aparelho físico nesta etapa |
| Segurança e operação | Conferidos limites relevantes de organização, canais, envios e políticas nos caminhos examinados | Não é auditoria integral de segurança, desempenho, infraestrutura ou todos os endpoints |

O inventário cobre todas as entradas de página de `/admin` e `/dashboard` existentes no checkout. Site público, lojas públicas, cada endpoint de API e integrações externas não foram submetidos a teste funcional integral. O checkout tem alterações locais anteriores; não foi estabelecida equivalência com a versão publicada.

Artefatos reproduzíveis em [output/auditoria-arquitetura-20261107](../output/auditoria-arquitetura-20261107):

- [Todos os menus: atual → proposto](../output/auditoria-arquitetura-20261107/menus-atual-proposto.csv).
- [Todas as rotas: atual → proposto](../output/auditoria-arquitetura-20261107/rotas-atual-proposto.csv).
- [58 rotinas e gatilhos](../output/auditoria-arquitetura-20261107/rotinas-inngest.csv).
- [Uso agregado](../output/auditoria-arquitetura-20261107/usage-aggregate.json), [inventário de fonte](../output/auditoria-arquitetura-20261107/routes.json) e [manifesto com hashes](../output/auditoria-arquitetura-20261107/manifest.json).

## O que os dados dizem sobre prioridade

Consulta feita em 07/11/2026. Janela: **08/10 a 06/11**, dias completos no fuso de Brasília. Fonte: `intelligence_events`, evento `dashboard_page_view`, apenas os hosts de produção da ConnectyHub. Resultado: **845 eventos**, sendo **400 no painel cliente ligados a 6 perfis não administrativos**, **407 ligados a 1 perfil administrativo**, **11 em caminhos `/admin` ligados a 2 perfis atualmente não administrativos** e **27 sem perfil identificado**. As quatro categorias de eventos são exclusivas e reconciliam o total; as contas podem aparecer em mais de uma categoria. Todos os eventos retornados passaram pelo filtro de host. Os 11 eventos ficam separados do ranking: visitar um endereço não comprova acesso permitido ou tarefa executada, e o papel histórico não foi recuperado.

Só **1 evento foi classificado como mobile**, no início do cliente em 06/11. Como coincide com o período de auditoria e o navegador emulado não representa necessariamente o dispositivo real, **não há base suficiente para um ranking de uso no celular**. Ausência de eventos mobile não prova ausência de usuários mobile.

Para reduzir a influência da auditoria de 06/11, a tabela abaixo usa apenas **08/10 a 05/11**. Não elimina testes anteriores ou acessos assistidos: o tracker não fornece uma marca confiável para separá-los. “Conta-dia” conta uma vez cada par perfil/data com visita àquela rota; evita que recarregar muitas vezes uma página determine sozinho a prioridade. Os totais de contas das linhas não devem ser somados.

| Cliente: rota/área | Visitas | Contas | Contas-dia |
|---|---:|---:|---:|
| Início | 101 | 5 | 36 |
| Agentes | 36 | 3 | 12 |
| Voz e áudio | 32 | 2 | 11 |
| Automações | 27 | 3 | 9 |
| Minha conta | 13 | 5 | 8 |
| Integrações | 19 | 4 | 8 |
| Atendimento | 11 | 2 | 7 |
| Catálogo de vendas | 12 | 3 | 5 |
| Planos | 5 | 3 | 5 |

| Admin: rota/área | Visitas | Contas | Contas-dia |
|---|---:|---:|---:|
| Clientes | 141 | 1 | 22 |
| Início | 52 | 1 | 22 |
| Infraestrutura | 44 | 1 | 13 |
| Atendimento interno | 13 | 1 | 4 |
| Manutenção | 4 | 1 | 3 |
| Meta/WhatsApp oficial | 37 | 1 | 2 |
| Meta Ads | 19 | 1 | 2 |

**Interpretação:** Clientes e Infraestrutura merecem acesso rápido no admin observado. Agentes e Automações têm sinal de uso no cliente; Voz deve poder ser fixada como favorita, em vez de ser enterrada como “pouco usada”. Atendimento continua prioridade de projeto por urgência operacional, não por liderar este ranking. Agenda ganha destaque por perfil de negócio de agendamento, não por um uso alto demonstrado.

Limitações: mudanças na query string podem emitir novas visitas; consentimento, bloqueadores, falhas de coleta e retenção afetam cobertura; contas internas de teste podem ter perfil de cliente; o cookie de sessão é duradouro, por isso não foi usado para contar sessões. Não foram extraídos e-mails, nomes, mensagens, telefones, IPs ou credenciais para os artefatos. Identificadores de perfil ficaram apenas em memória durante a agregação; IDs em rotas dinâmicas foram normalizados.

## Achados e decisões propostas

| ID | Prioridade | Evidência | Decisão proposta |
|---|---|---|---|
| IA-01 | P0 — integridade | `ClientAutomationsCenter` salva `save_catalog_settings` sem `storefront` e `commerceAgent`. O handler normaliza esses campos ausentes para vazio/default e substitui `metadata` | Separar salvamento de automações do catálogo; preservar campos não enviados e controlar revisão concorrente antes de reorganizar os formulários |
| IA-02 | P1 — navegação | `groupPanelNavigation` classifica por regex de href; Meta/Chat Meta cai em Divulgação antes de considerar atendimento | Catálogo explícito de navegação com tarefa, público, capacidade, rótulo, aliases e destino canônico |
| IA-03 | P1 — atendimento | Atendimento, Chat Meta oficial e Direct/Messenger são três destinos; admin ainda tem Atendimento interno e Meta separados | Uma entrada “Atendimento”, com seletor de canal e contexto; primeiro integrar navegação, depois avaliar lista agregada |
| IA-04 | P1 — conexões | Integrações, Central Meta, Contas conectadas e números oficiais apresentam partes da conexão | Um diretório “Conexões”, organizado por canal/provedor; ações contextuais abrem o mesmo editor correto |
| IA-05 | P1 — entendimento | Catálogo de Vendas, Produtos, Produtos CH e Meus produtos representam coisas diferentes | Nomes: “Catálogo”, “Produtos para revender”, “Produtos ConnectyHub” e “Minhas compras”; preservar seus domínios |
| IA-06 | P1 — automações | Uma página longa reúne política de relacionamento, comentários, grupos/canais/status e mensagens de pedidos; outras regras ficam em agente, agenda e cobrança | Central por objetivo, com resumo, política efetiva, origem da configuração, resultados e editor específico |
| IA-07 | P1 — escopo administrativo | WhatsApp Clientes/Integrações são suporte às contas; WhatsApp Interno atende a própria ConnectyHub | Separar “Clientes → Suporte” de “Operação → Atendimento”; empresa e tipo de acesso sempre visíveis |
| IA-08 | P2 — redundância visual | CEO, Aprovações e Auditoria redirecionam a âncoras do início; Configurações vai para Manutenção | Aprovações em Pendências; CEO em Resumo executivo; Auditoria em Sistema; Configurações/Manutenção com uma entrada |
| IA-09 | P2 — conta | Créditos, Planos e Minha Conta competem no mesmo menu; Meus produtos aparece no admin e no modo restrito, mas não no menu completo de cliente | “Conta” reúne plano, saldo, faturas e compras. Compra avulsa continua acessível sem assinatura ativa |
| IA-10 | P2 — conteúdo | Publicações, Calendário e Biblioteca já compartilham workspace; Criativos IA usa outra visão no admin | Uma área Divulgação com criação, publicações, calendário e biblioteca; reaproveitar fluxo social existente, sem recriar o antigo módulo Meta |
| IA-11 | P2 — especialização | APIs, infraestrutura e estúdio aparecem para o cliente geral; uso de Voz é relevante na pequena amostra | Ferramentas específicas e favoritos por perfil; desenvolvedor tem API em destaque. Não esconder serviço contratado sem caminho claro |
| IA-12 | P2 — rotinas técnicas | Reconciliações, retentativas, importações, arquivo de mídia e sincronizações já possuem jobs | Expor progresso, falha e ação de recuperação; não exigir que cliente entenda cron, webhook ou job |
| IA-13 | P2 — coordenação de jobs | Dois sweeps chamam `processQueuedWhatsappCatalogImportReviews`; há claim condicional por status | Candidato a reduzir varredura redundante, após medir fila/latência. Não há prova nesta auditoria de importação duplicada |
| IA-14 | P2 — resultado verdadeiro | Daily Admin Report apenas registra janela e retorna `ready`, sem gerar/entregar relatório | Não anunciá-lo como relatório automático entregue; implementar resultado ou identificá-lo como rotina diagnóstica |

P0 significa resolver antes de ampliar o uso do salvamento afetado; P1 é a primeira reorganização; P2 vem em seguida. São prioridades de risco e benefício, não frequência medida de todos os recursos.

### IA-01: cadeia de evidência e correção necessária

1. `src/components/connectyhub-os/client-automations-center.tsx:122`: requisição inclui campos do catálogo copiados do estado carregado e as automações, mas não a aparência da loja nem o agente da loja.
2. `src/app/api/dashboard/sales-catalog/route.ts:1183`: aparência é normalizada a partir do campo ausente; `:1203` faz o mesmo para o agente, usando defaults.
3. `:3933` mostra que dados visuais ausentes viram campos vazios/nulos/padrão; `:4230` devolve fallback para agente ausente.
4. `:1206` monta um novo objeto de metadados e `:1278` substitui o registro. Não há preservação geral de campos ausentes nesse caminho.

**Confirmado no fluxo do código; dano em produção não investigado nem reproduzido.** Além dos campos omitidos, dados antigos de catálogo mantidos na página podem sobrescrever uma edição feita em outra aba. Correção sugerida: operação própria por domínio, merge no servidor de campos permitidos, controle de versão e teste com loja previamente personalizada. Verificar que salvar mensagens não muda cores, texto da loja, agente, pagamentos ou catálogo, e que conflito concorrente é informado.

## Navegação proposta

### Cliente

Menu completo por tarefa; grupos não significam sete botões permanentes no celular:

| Grupo | Conteúdo | Prioridade de acesso |
|---|---|---|
| Início | Pendências, atalhos, próximos compromissos e resultados resumidos | Permanente |
| Atendimento | Conversas por canal, contatos/oportunidades, agentes e agenda | Permanente para operação comercial |
| Vendas | Pedidos, catálogo, loja, ofertas/benefícios e produtos para revender | Principal para comércio |
| Divulgação | Publicações, calendário de posts, biblioteca, resultados e anúncios | Secundária; pode virar favorito |
| Automações | Retomar conversas, recuperar vendas, pós-venda/retornos, comentários, grupos/canais/status e avisos de pedidos | Secundária com atalho na tarefa relacionada |
| Conta | Empresa, conexões, plano, créditos, faturas e minhas compras | Secundária; pendência financeira tem atalho no início |
| Ferramentas | APIs, voz/áudio e projetos de infraestrutura | Por serviço/perfil, sempre encontrável |

**Barra móvel inicial sugerida:** `Início · Atender · Vendas · Agentes · Menu`. É hipótese de desenho a testar. Em negócio de serviços, Agenda pode ocupar o lugar de Vendas; para desenvolvedor, API ocupa um atalho principal; Voz pode ser fixada por quem a usa. Evitar reordenar automaticamente a barra a cada mudança de frequência.

Os 26 destinos continuam localizáveis; não são substituídos por apenas cinco funcionalidades. “Menu” abre o mapa completo e a busca. Dentro da conversa, usar a composição focada já preparada: voltar, destinatário, histórico e resposta; detalhes sob demanda.

### Administrador

| Grupo | Conteúdo |
|---|---|
| Início | Pendências/aprovações, resumo executivo e incidentes |
| Clientes | Contas, acesso assistido e suporte de WhatsApp/conexões no contexto da conta |
| Operação | Atendimento da ConnectyHub, agentes internos, setores, memória/eventos e automações da plataforma |
| Comercial | Leads, contratos, reuniões, ofertas, produtos CH e revisão de produtos |
| Divulgação | Criação com IA, publicações, calendário, biblioteca, anúncios e resultados |
| Financeiro | Receitas, planos, cobrança e política de renovação |
| Sistema | Infraestrutura, serviços/API, conexões internas, manutenção e auditoria |

**Barra móvel sugerida para o perfil observado:** `Início · Clientes · Atender · Sistema · Menu`. Infraestrutura deve aparecer no primeiro nível de Sistema e como favorito, pois há sinal concreto de uso recorrente. A seleção final precisa de teste de tarefas; não há amostra de múltiplos administradores.

“Clientes → conta → WhatsApp” deve abrir a operação daquela conta já filtrada. O atendimento interno não pode trocar silenciosamente de organização ao entrar em uma conta. “Minhas compras” do administrador é acesso à conta pessoal, fora de “Clientes”.

### Regras de disposição e linguagem

- Uma função tem um destino canônico. Atalhos contextuais apontam para ele; não mantêm outro formulário com estado próprio.
- “Campanhas” sempre informa a finalidade: **Ofertas**, **Anúncios pagos**, **Mensagens oficiais** ou **Grupos e status**. Não combinar todos esses fluxos num único botão de ativação.
- Agenda de compromissos e calendário editorial ficam distintos. Compartilhar visual de calendário não torna os dados equivalentes.
- Nomes curtos e compreensíveis: Atender, Vendas, Agenda, Conta, Menu. Evitar siglas inventadas para caber.
- Compactar cabeçalhos e decoração, mantendo alvos de toque de aproximadamente 44 px e texto legível; não reduzir tudo proporcionalmente.
- Ocultar configurações irrelevantes por capacidade/serviço, com explicação e caminho para ativar quando aplicável. Isso não substitui autorização no servidor.
- Manter busca com aliases antigos (“links”, “CRM”, “Meta”, “produtos”) e deep links/redirects compatíveis. Não remover rotas apenas porque tiveram zero visitas.
- Benefício de até dois passos para localizar uma área principal é **meta do novo desenho**, ainda não resultado medido.

## Automações: juntar a experiência e preservar as regras

| Família atual | Responsável pela configuração proposto | O que simplificar | O que preservar / evidência |
|---|---|---|---|
| Follow-up de conversa, recuperação, pós-venda, aniversários, retornos e reativação | Automações → Relacionamento, com origem por empresa/agente/item | Mostrar objetivos, ligado/desligado, próxima ação e resultados; editor avançado recolhido | `automations/dispatch.ts` e `whatsapp/proactive-followup.ts` já compartilham persistência/claim; não criar outro dispatcher |
| Política central versus configuração antiga por agente | Mesmo editor de Relacionamento | Mostrar valor efetivo e “herdado do agente”/“definido pela empresa”; migração explícita | `proactive-followup.ts:194` usa política central quando existente; painel já avisa sobre essa precedência |
| Comentários → Direct, respostas públicas e retomada social | Automações → Redes sociais | Mesmo catálogo de objetivos e componentes de status | `meta/social-follow-up.ts` tem regras próprias de canal/janela e conversa atual; não reutilizar cegamente limites WhatsApp |
| Grupos, canais, status e rotinas de tráfego WhatsApp | Automações → Divulgação no WhatsApp | Um editor de objetivo/destinos/agenda, opções técnicas avançadas | Campanhas, alvos e capacidade do canal continuam explícitos; criar planejamento não equivale a envio |
| Avisos de pedido/pagamento | Vendas → Configurações de pedidos; atalho em Automações | Templates padrão, apenas exceções editáveis; salvar só este domínio | `client-automations-center.tsx` e handler de catálogo; corrigir IA-01 antes |
| Ofertas, descontos, benefícios e adicionais de checkout | Vendas → Ofertas e benefícios | Um local para regras comerciais e respectivos resultados | `commerce/campaign-console.tsx` e `sales-catalog-console.tsx` tratam domínios complementares; oferta não é disparo de mensagem |
| Agenda, lembretes, retornos e transferência humana | Agenda para disponibilidade/avisos; Relacionamento para retornos comerciais | Configurar uma vez; mostrar próximo lembrete e falha | `agenda-notifications`, `agenda-handoff`; eventos/sweep são partes da mesma execução, não dois recursos para o usuário |
| Campanhas oficiais WhatsApp | Automações → Mensagens oficiais; conversas em Atendimento | Entrada contextual comum, remetente e modelo já selecionados quando seguro | `meta-whatsapp-console.tsx` já reúne conversas/modelos/campanhas; preservar aprovação, consentimento, cobrança e Cloud API |
| Cobrança ConnectyHub, renovação e recuperação de assinatura | Admin → Financeiro; histórico em Operação → Automações | Política financeira com uma fonte e resumo operacional | `platform-automations-center.tsx` usa API de automações e API própria de renewal-policy; cliente não edita política da plataforma |
| Reconciliação de pagamento, consumo IA, créditos e voz | Bastidores; exceções em Financeiro/Sistema | Exibir “processando”, “concluído”, “precisa de atenção”; eliminar jargão de job | Não ocultar cobrança, autorização de recarga ou resultado incerto; idempotência e razão contábil permanecem |
| Webhooks, retentativas, sincronização, reconexão e arquivo de mídia | Bastidores; diagnóstico em Sistema | Cliente acompanha saúde da conexão e falhas acionáveis | Não pedir acionamento manual recorrente de tarefas que já possuem fila/sweep |
| Importações de catálogo | Vendas → Importar, com progresso | Uma ação de importação e histórico | Dois sweeps atingem importação WhatsApp; `whatsapp-sync.ts:388` faz claim `uploaded → extracting`. Medir antes de consolidar agendadores |
| Growth/IA interna e relatório diário | Admin → Operação/Resultados | Expor missão, execução e entrega verificável | Oito agendas Growth não são oito menus necessários; Daily Admin Report atual só retorna `ready` |
| Agendamentos/webhooks da API de IA e geração de áudio | Ferramentas/API para desenvolvedor; execução nos bastidores | Templates e operações com recibo; avançado continua acessível | São capacidades de produto para desenvolvedores, não configurações a apagar para todos |

**Pode ficar nos bastidores:** escolha técnica de worker, retentativa segura, conciliação, arquivo de mídia, sincronização já autorizada e progresso de importação. Mostrar somente exceções e resultado útil.

**Precisa continuar como decisão visível:** ativar contato proativo, destinatários/canais, horários, pausas, preferências do contato, aprovação de publicação/campanha, verba, descontos, pagamentos/recargas e exclusão. Simplificação não transforma opção comercial em comportamento automático novo.

Não foi constatado que todas as automações “parecidas” sejam duplicadas. Exemplo: o sweep de follow-up encontra tarefas e emite eventos; o handler executa a tarefa com reserva. Fundi-los sem preservar recuperação e idempotência pode piorar a operação.

## Arquitetura de implementação sugerida

1. **Navegação declarativa:** trocar classificação por regex por itens explícitos com `id`, `taskGroup`, `label`, `searchAliases`, `canonicalHref`, público e capacidade necessária. Reaproveitar o filtro de links autorizados. Rotas legadas continuam como aliases.
2. **Contexto consistente:** empresa, perfil e acesso assistido acompanham navegação e editores. Identidade de rascunho/configuração inclui empresa e canal. Trocar empresa não pode salvar no contexto anterior.
3. **Uma gravação por domínio:** ajustes de pedido, aparência da loja, agente, conexão e automação com contratos próprios; edição parcial preserva o restante; versão protege contra outra aba aberta.
4. **Uma visão de automações:** registro de objetivos e estado efetivo, apontando para os serviços atuais. Cada canal mantém execução e política próprias. Histórico mostra agendado, enviado, falhou, cancelado e resultado incerto, sem reduzir tudo a “executado”.
5. **Apresentação progressiva:** resumo operacional primeiro; detalhes/configurações por demanda; opções avançadas com URL direta e busca. Reusar o tema de cores local já preparado.

Nenhuma biblioteca ou skill resolve sozinha essa arquitetura de tarefas. Ferramentas de design podem ajudar a aplicar o padrão depois; a decisão sobre onde cada função fica vem deste mapa e dos testes com usuários.

## Ordem de execução e critérios para testar

| Etapa | Entrega | Critério verificável |
|---|---|---|
| 0 — integridade | Corrigir IA-01 e proteger concorrência | Salvar automação preserva loja/agente/pagamentos; troca de empresa e duas abas não causam sobrescrita silenciosa |
| 1 — mapa e nomes | Catálogo explícito de navegação, aliases, grupos, favoritos e barra móvel | Todos os 62 links atuais continuam alcançáveis por menu/busca ou redirecionamento; 4 acessos restritos preservados |
| 2 — tarefas | Atendimento com entradas por canal; Conta e Conexões com proprietários únicos | Usuário identifica onde responder, conectar canal, pagar e consultar compra sem explorar menus de provedor |
| 3 — automações | Central por objetivo e política efetiva, editores específicos | Uma configuração alterada aparece com mesma revisão em todos os atalhos; nenhum envio/recarga liga implicitamente |
| 4 — bastidores | Reduzir controles técnicos e avaliar varreduras redundantes | Menos passos sem perder fila, recibos, recuperação, bloqueios ou alertas de falha |
| 5 — validação | Prévia completa, dados de teste, depois validação do titular | Aprovação visual e funcional antes de publicar; não transformar esta auditoria em release |

Teste de tarefas no celular, em cliente e admin: encontrar conversa por canal; voltar preservando filtro/rascunho; ajustar horário de agente; cadastrar produto; localizar pedido; agendar atendimento; criar oferta; achar publicação; conectar canal; pausar automação; consultar fatura/compra; resolver pendência. Incluir comércio, serviço com agenda, usuário de API, operador e admin. Medir sucesso, tempo, passos, retornos errados e necessidade de ajuda. Na fase visual, conferir 320/360/390/430 px, teclado real, zoom, contraste, foco e área de toque.

Para decidir a ordem definitiva, melhorar a instrumentação com ID de navegação, origem menu/atalho/busca, tarefa iniciada/concluída/abandonada, categoria de viewport e marca de teste/acesso assistido, sem registrar texto de conversa ou dados pessoais. Coletar uma janela de uso normal e comparar por perfil. Esses novos eventos **não foram implementados** nesta auditoria.

## Estado final

Auditoria de arquitetura documentada, 78 rotas mapeadas, 62 entradas principais e 4 restritas reconciliadas, 58 rotinas inventariadas e uso agregado consultado. **Nenhum menu removido, automação ativada ou configuração de cliente alterada nesta etapa.** As alterações locais de interface da entrega anterior foram preservadas. Execução real de cada automação, testes em telefone físico e validação da nova organização com usuários continuam pendentes.
