# Modelos por chave e ampliação da API de IA

Estado: implementação local, sem publicação nem migrações em produção. Esta entrega amplia o contrato; **não oferece ainda paridade total com a API do provedor**.

## Catálogo e escolha

A consulta autenticada ao catálogo do provedor retornou 55 modelos em 10/09/2026. Os 55 estão no catálogo público com aliases, perfis e indicação de disponibilidade. A configuração desta versão prepara 10 para liberação: Flash 3.5, Flash Lite 3.5, Flash 3.6, Flash 3.7, Flash 3.8, Pro 3.1 Preview, Pro 3.1 Preview Customtools, Embedding 001, Embedding 2 e Embedding 2 Preview.

Flash 3.5 é o recomendado por decisão solicitada pelo produto. Não é apresentado como o modelo mais recente, mais barato ou superior em todas as tarefas. O painel compara finalidade e consumo em créditos. Os modelos restantes aparecem indisponíveis, com recursos não anunciados como executáveis.

Cada chave nova fica vinculada ao modelo selecionado. A criação do projeto e da primeira chave é atômica. Uma proteção no banco impede mudar ou limpar um vínculo existente. Chaves antigas continuam com seleção automática. O gateway valida a correspondência antes de consultar a idempotência e impede usar outra tarifa/modelo por meio do corpo da requisição.

A disponibilidade exige catálogo habilitado, adaptador liberado, modelo operacional habilitado, correspondência do alias com o identificador privado e tarifas válidas para o plano. As opções não liberadas não podem ser ativadas apenas mudando uma linha do catálogo.

## Contratos implementados

- `GET /api/v1/ai/models` e `GET /api/v1/ai/models/{model}`: perfis, capabilities, escolha da chave e compatibilidade.
- `POST /api/v1/ai/chat/completions`: texto e mídia inline; funções declaradas, resultados `tool`, JSON Schema, execução de código e contexto de URL conforme o modelo.
- `POST /api/v1/ai/models/{model}:generateContent`: conteúdo multimodal, configurações, funções e resultados de ferramentas. Saída textual nesta versão.
- `POST /api/v1/ai/models/{model}:streamGenerateContent`: entrega SSE após conclusão; não é geração incremental.
- `POST /api/v1/ai/embeddings`: um texto por chamada, dimensionalidade e tarefa. Não oferece índice vetorial hospedado, mídia ou lotes.
- `POST/GET /api/v1/ai/files` e `GET/DELETE /api/v1/ai/files/{id}`: upload, processamento, consulta e exclusão com isolamento por projeto.
- `GET /api/v1/ai/requests/{request_id}`: recuperação de respostas e créditos dos formatos de conversa, conteúdo e vetores.

Arquivos não expõem URIs privadas. Arquivos de outro projeto, expirados ou ainda em processamento são recusados. Instruções de sistema aceitam somente texto, evitando referências privadas por um caminho alternativo. A exclusão concorrente não deve reativar um upload cancelado.

Funções da aplicação são executadas pelo integrador após validação. O contexto opaco recebido com chamadas de função é preservado no retorno ao modelo. Respostas públicas removem identificação privada, custos internos e contadores de consumo; o cliente recebe créditos.

OpenAPI 1.3.0: nove caminhos e onze operações HTTP. A referência pública tem 21 seções, catálogo, exemplos e downloads JSON/Markdown. O Markdown local e o download são gerados pela mesma fonte das páginas.

## Cobrança

As tarifas adicionadas seguem a política existente: proteção cambial de 6 BRL/USD, multiplicador 4, crédito equivalente a R$ 0,01 e mínimo de um crédito por operação. Flash 3.6 preserva as tarifas anteriores. Flash 3.7/3.8 têm vigências separadas para a alteração em janeiro de 2027. Pro tem tarifa própria acima de 200 mil unidades de entrada, escolhida antes da reserva e na liquidação. Embeddings de texto têm somente entrada; não recebem tarifa de saída de conversa.

A reserva continua obrigatória para proteger o saldo compartilhado. Repetições recuperam a operação sem nova execução. Raciocínio e entradas de ferramentas entram no cálculo interno. O custo real fica registrado; excedentes ao orçamento reservado são absorvidos pela operação da plataforma, conforme a política anterior. Consultas de URL e ferramentas podem aumentar esses excedentes; não existe garantia de margem por chamada. Não há novos tetos de gastos ou limites por minuto configuráveis pelo cliente.

## O que ainda falta para paridade total

- Geração/edição de imagem, fala, música e vídeo: adaptadores de saída, metering por modalidade/duração/resolução e entrega dos arquivos gerados.
- Busca na web e mapas: cobrança específica e preservação das atribuições obrigatórias das fontes.
- Cache: propriedade por projeto, tarifa de armazenamento e expiração/remoção com conciliação.
- Lotes e operações longas: workers, cancelamento, consulta de resultados e reservas que ultrapassam o reconciliador atual de cinco minutos.
- Tempo real: transporte bidirecional, sessões da plataforma, interrupção por saldo e liquidação contínua; não entregar a credencial privada ao cliente.
- Pesquisa em arquivos, agentes especializados, sessões persistentes e demais APIs de plataforma: armazenamento isolado, autorização e cobrança próprias.
- Verificar individualmente capacidades das demais variantes e tarifas atuais; uma entrada retornada por `models.list` não comprova que todas as suas operações estão disponíveis para esta conta.

Esses recursos estão explicitamente indisponíveis no contrato. Alterar a documentação ou publicar um alias não implementa os adaptadores necessários.

## Verificação

- Consulta real de catálogo: HTTP 200, 55 modelos.
- Verificação real de acesso por contagem: HTTP 200 nos dez modelos preparados. Sem geração paga e sem movimentação da carteira. Evidência local: `tmp/ai-model-access.json`.
- Testes SQL executam as migrações em PostgreSQL local via PGlite: catálogo, tarifas, chave imutável, criação atômica e acesso restrito ao servidor.
- Testes de gateway: modelo da chave, conflito antes da idempotência, replay sem nova execução, tarifa de contexto extenso, vetores, custos de ferramentas e teto da reserva.
- Testes de contrato/arquivos: schemas, exemplos, isolamento entre projetos, cancelamento de upload pendente e sanitização das respostas.
- Validação final: 1.070 testes passaram em 134 arquivos; ESLint e compilação de produção aprovados. Suíte executada com concorrência reduzida para os bancos locais. A execução inicial concorrente excedeu o timeout em quatro testes SQL; não foi um erro de migração.
- QA com dados fictícios em 390, 768 e 1440 px: seleção do modelo, criação do projeto/chave, navegação da documentação, ausência de overflow e de erros de JavaScript. Evidências: `tmp/ai-models-qa/`.

Testes HTTP de geração e upload usam respostas simuladas. Não foi realizado um teste completo de geração faturada contra o ambiente publicado.

## Publicação

Aplicar `0125_ai_models_and_keys.sql` e `0126_ai_owned_resources.sql` antes de publicar o código que consulta essas tabelas. Respeitar a ordem global das migrações pendentes do repositório; existem alterações anteriores independentes de WhatsApp. Validar permissões, tarifas ativas e um piloto de cada família após a publicação. Conferir também os limites de corpo/tempo do ambiente de hospedagem para arquivos maiores.

Não houve push para o GitHub, alteração do banco remoto ou deploy nesta implementação.

## Referências técnicas consultadas

Capacidades e formatos foram confrontados com a [referência oficial de geração](https://ai.google.dev/api/generate-content), a [referência de embeddings](https://ai.google.dev/api/embeddings) e a [referência de arquivos](https://ai.google.dev/api/files). As tarifas foram verificadas na [tabela oficial de preços](https://ai.google.dev/gemini-api/docs/pricing). Este relatório é interno; a documentação do cliente usa os nomes públicos e o contrato efetivamente implementado pela ConnectyHub.
