# Agente Onipresente Ativo — primeira entrega local, 16/09/2026

## Implementado

O `CommerceAgentDock` recebe texto e um comando de dados opcional da rota
`/api/public/commerce-agent/message`. Pedidos como “Não encontro Café Especial”
localizam um título público do catálogo da organização. O navegador destaca o
produto quando presente ou navega para sua página interna, preservando os vínculos
de organização, lead, conversa, agente e link rastreado.

O planejamento é determinístico: não chama modelo para decidir uma ação, não aceita
JavaScript, seletor CSS ou URL do lead/modelo e não faz nova operação de IA. Falas
comuns continuam no atendimento existente, incluindo histórico WhatsApp/loja e
contabilização preexistente. Falha na consulta opcional de ações usa esse fluxo.

`session` e o resolvedor canônico de identidade permanecem como antes. Assistente e
Vendedor ativo podem responder a pedidos do lead nas superfícies loja, produto e
carrinho. Observador continua sem comandos; checkout mantém seu comportamento
anterior e não recebe as novas ações nesta entrega.

| Comando | Comportamento |
|---|---|
| `open_product` | Destaca alvo presente ou abre `/produto/{uuid}` na mesma origem. |
| `highlight_product` | Destaca alvo conhecido presente; ausência retorna falha. |
| `scroll_to_section` | Rola apenas para produtos, categorias, descrição, envio ou perguntas frequentes marcados na própria página. |
| `open_cart` / `open_checkout` | Abre o drawer existente para revisão e preenchimento manual; não chama criação de pedido/checkout. |
| `suggest_cart_item` | Contrato disponível para mostrar o produto; não adiciona e não é emitido pelo planejador inicial. |
| `request_add_to_cart_confirmation` | Mostra produto, quantidade e botões “Sim, adicionar ao carrinho” / “Agora não”. |
| `add_to_cart_after_confirmation` | Emitido exclusivamente após validar o aceite específico no servidor; atualiza o carrinho local pelo adaptador da página. |

O aceite exige ID da proposta, ID do produto, quantidade e `accepted: true` enviados
pelo botão. Um “sim” isolado em texto não é interpretado como autorização nesta
entrega. Nova mensagem descarta a proposta anterior. Somente produtos de venda,
com preço, disponíveis e sem montagem de composição entram na inclusão assistida;
agendamento, destino externo e composição permanecem no fluxo próprio. Quantidade
inteira de 1 a 20 e total da linha até 20; validações comerciais finais continuam
nos fluxos existentes.

## Registro e isolamento

`web-actions.ts` contém o contrato; `web-actions-server.ts` prepara, registra e
autoriza; `web-actions-client.ts` executa por meio de capacidades explícitas da
loja e do controlador de carrinho da página do produto. Nenhum controle de compra,
pagamento, envio ou agendamento é clicado/programaticamente submetido.

Cada proposta é salva antes de ser devolvida. `/action` recebe apenas seu ID e a
etapa solicitada e carrega o comando armazenado. Exige a mesma organização, sessão
de comércio, lead, conversa, agente, visitante, sessão do navegador, superfície e
caminho de origem. Revalida disponibilidade do produto ao executar; o navegador
também verifica o contexto atual e o marcador da organização na página.

Propostas expiram em cinco minutos. A transição condicional `suggested → accepted`
permite somente uma autorização de execução, inclusive sob concorrência. Recusa
usa `rejected`; o resultado do navegador usa `applied` ou `failed`. O comprovante
de resultado pode ser repetido sem duplicar eventos; a autorização não pode ser
reemitida para a mesma proposta.

Compatibilidade com a migration 0067: usa `action_type = add_to_cart` para a proposta
de inclusão e `suggest_product` para a assistência visual/navegação, com o comando
preciso em `request_payload.web_action`. Não há migration nova. Produto alvo,
quantidade, motivo, superfície, horários e identidade são preservados; o resultado
mantém produto/quantidade e método do aceite.

Eventos `commerce_agent.assisted_action` são gravados em `intelligence_events`, com
visibilidade de organização, `source_id` do lead identificado e IDs de lead/conversa
no payload. O leitor existente do Arquivo do Lead os encontra por esses vínculos.
Os IDs por ação/status são determinísticos para permitir repetição do registro.
Eventos de aceite incluem o consentimento; conclusão/falha ficam explicitamente
identificadas como relato do navegador. Abrir uma página significa solicitação de
navegação, não comprovação de que o destino terminou de carregar.

Falha no registro da proposta ou do aceite impede entregar a autorização de
execução. Falha de registro depois do efeito mostra aviso para conferir o carrinho
antes de repetir. Banco e armazenamento do navegador não formam uma transação:
uma perda de resposta pode deixar ação aceita sem resultado confirmado. Não há
reexecução automática nem alegação de execução exatamente uma vez entre sistemas.
Um novo pedido explícito gera outra proposta.

## Verificação local inicial

- 172 testes direcionados aprovados em 11 arquivos: contrato/parser, consentimento,
  concorrência/replay, isolamento, persistência, executor, rotas públicas, modos,
  tracking, continuidade WhatsApp/checkout e suspensão de loja.
- Navegador local com componentes reais e APIs interceptadas/dados fictícios:
  destaque de produto, carrinho vazio antes do aceite, recusa registrada, inclusão
  de exatamente duas unidades após confirmação, uma chamada de aceite, nenhuma
  criação de checkout e nenhum erro de runtime. Desktop 1280×900 e celular
  390×844; capturas conferidas, sem transbordamento horizontal.
- Página temporária de prévia removida após a conferência. Não houve chamada de
  fornecedor, envio WhatsApp, pagamento, agendamento, acesso a dados reais ou deploy.
- ESLint e `git diff --check` aprovados. Build webpack final compilou em 35,9s e
  passou no TypeScript em 18,1s. A coleta de páginas falhou no sitemap do catálogo:
  “Supabase service role nao esta configurado.” O worktree não tem essa configuração;
  não foram importadas credenciais de produção. Não declarar build completo aprovado.
- Após ajustar os rótulos dos eventos para leitura no Arquivo do Lead, os 23 testes
  do servidor e o lint desse módulo passaram novamente.

## Limites e pendências

Busca por título completo normalizado, entre até 200 itens ativos mais recentemente
atualizados. Títulos ambíguos e pedidos fora desse parser continuam no atendimento
textual; não é busca semântica nem automação geral do navegador. Seções ausentes
retornam falha. O destaque/abertura não altera filtros de catálogo. Itens sem
composição usam o carrinho já existente por organização, sem migrar sua estrutura.

Histórico de visitante anônimo fica associado à sessão; esta entrega não acrescenta
backfill de eventos antigos para outro lead nem extração autônoma de memória.
Persistência e isolamento foram exercitados inicialmente com banco simulado e,
na finalização abaixo, também com PostgreSQL local, sem escrita no Supabase de
produção. Navegação real entre páginas de produto com catálogo real, teste de
ida e volta WhatsApp/loja e conferência no Arquivo do Lead real continuam pendentes.

**Local, não publicado.** Publicação e reteste no ambiente real constituem etapa
posterior. APIs de Voz/LLM, billing, gateways, pagamentos, agenda e infraestrutura
não foram alterados.

## Finalização autorizada — 16/09/2026

Esta etapa supera o bloqueio de build registrado acima. A configuração necessária
já estava no `.env.local` do checkout principal; URL e chaves Supabase foram
carregadas em memória e passadas apenas ao processo filho do build. Nenhum segredo
foi impresso ou incluído em arquivo/commit. Não houve alteração do sitemap, código
de Supabase, gateways ou infraestrutura. O build leu o catálogo público pelo fluxo
existente; não houve escrita em clientes nem operação de agente/pagamento/agenda.

**Build completo webpack aprovado, 108 páginas**, incluindo sitemap. TypeScript,
ESLint, diff-check e **181 testes em 12 arquivos** aprovados. A revisão acrescentou
negações explícitas de navegação, lista fechada de modos e validação no cliente de
que ID, tipo, produto, título, quantidade e seção autorizados correspondem à
proposta apresentada. A transformação para adicionar ao carrinho continua exigindo
o aceite específico.

Novo teste `commerce-agent-web-actions-sql.test.ts` usa PostgreSQL/PGlite descartável
com as definições/políticas de eventos da migration 0006 e a migration 0067 inteira.
Os payloads das funções reais do servidor são enviados ao SQL. Foram conferidos
insert/upsert/update condicional, repetição de comprovante, concorrência de aceite,
constraints, FK do produto, bloqueio anônimo, leitura da organização correta,
bloqueio de outra organização e uso pelo leitor real do Arquivo do Lead. Funções de
identidade e tabelas de referência do ambiente de teste são fixtures; isso não
equivale a reproduzir todo o Supabase de produção.

Leitura de esquema em `supabase.connectyhub.com.br`, em 16/09 às 15h12 BRT: OpenAPI
expõe as duas tabelas com todas as colunas usadas, e consultas de colunas com
`limit=0` retornaram HTTP 200 tanto para service role quanto para anônimo, sem dados.
O retorno anônimo vazio por esse limite **não prova RLS**; RLS foi exercitada no
PostgreSQL local. Métodos expostos no OpenAPI também não comprovam uma escrita
autorizada. Nenhum insert/update/delete nem migration foi executado no destino.

`TRACKING_PUBLIC_TOKEN_SECRET` continua ausente no ambiente local. A tentativa de
listar variáveis Production pelo CLI falhou ao recuperar as configurações do
projeto; não houve relink nem deploy. Conferência alternativa por GET do sitemap
e HTML de uma loja pública, às 15h13 BRT, retornou HTTP 200 e confirmou um token
assinado cujo ID corresponde à organização. Não foi lido/divulgado o segredo,
executado JavaScript da página ou enviado POST de sessão/tracking. A aplicação
publicada já apresenta o requisito; a nova entrega não foi publicada por isso.

A worktree partiu exatamente de `origin/master` (`e597e610`) conferida com fetch.
Preparação do commit limitada a código, testes e documentos desta frente. Sem
arquivo de migration novo, sem pendência de SQL planejada, sem push ou deploy.
Após eventual publicação autorizada, permanece pendente o reteste funcional real
de navegação, consentimento, Arquivo do Lead e continuidade WhatsApp/loja.
