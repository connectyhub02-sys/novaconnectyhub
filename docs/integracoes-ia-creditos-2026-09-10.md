# Integrações de IA e créditos — versão 1.4.0

Implementação em 10/09/2026. Este relatório é técnico e interno; a referência
entregue aos clientes é [o guia público](guia-integracao-api-llm.md), também servido
em `/docs/api/ia/guide.md`, junto ao OpenAPI JSON e à página unificada `/docs/api`.

## Aplicação do banco em 10/09/2026

As migrations **0119 a 0128** foram aplicadas no Supabase de produção pelo SQL
Editor, em uma única transação, com registro do SQL no histórico de migrations.
O banco estava na versão 0118; por isso também foram aplicadas as dependências
0119 a 0122, já presentes no Git. Após a aplicação, foram confirmados 55 modelos,
180 tarifas de operações e RLS nas novas tabelas verificadas. As tarifas e a
função de liquidação permanecem sem acesso anônimo.

Essa aplicação do SQL não publica o serviço WebSocket. Continuam necessárias
a configuração desse serviço, a verificação do reconciliador e a validação de
acesso, tarifas experimentais e chamadas reais descritas abaixo.

## Entrega

A referência pública passou a ter **31 caminhos e 50 operações HTTP**, além do
protocolo WebSocket. O catálogo mantém 55 identidades públicas. Disponibilidade de
um modelo exige habilitação, acesso operacional e tarifas válidas; a existência
de um item no catálogo não constitui promessa de acesso no fornecedor.

| Integração | Operação pública | Registro financeiro |
| --- | --- | --- |
| Conversas, multimodal, funções e saída estruturada | Chat Completions e generateContent | Entrada, saída, raciocínio e contexto de ferramentas |
| Geração incremental | streamGenerateContent | Reserva antes do envio, consumo final e recuperação da solicitação |
| Imagem e voz | generateContent | Separação de saída textual e mídia |
| Música, transcrição e vídeo Omni | Interactions | Modalidades reportadas ou músicas produzidas |
| Vídeo assíncrono e extensão | videos | Duração, resolução e quantidade de saídas |
| Pesquisa, mapas, código, URLs, computador e MCP | Interactions; ferramentas nativas compatíveis | Consultas de pesquisa/mapas separadas do processamento |
| Vetores de texto e mídia | embeddings; lotes de vetores | Consumo de entrada por modalidade |
| Lotes assíncronos | batches, consulta e cancelamento | Tarifa de lote por item; ferramentas mantêm tarifa própria |
| Cache | caches, PATCH, reutilização, exclusão | Leitura e tamanho × tempo de armazenamento |
| Indexação e recuperação de documentos | stores, documents, file_search | Conteúdo importado e geração com contexto recuperado |
| Agentes especializados | agents e interactions | Inferência e ferramentas de cada execução |
| Ambientes | environments e arquivos do ambiente | Configuração não inicia inferência; execução é registrada em Interactions |
| Conversa, áudio, tradução e música em tempo real | live + serviço WebSocket | Reservas renovadas, medição e liquidação no encerramento |

Uploads, consulta de catálogo, configuração e leitura de resultados não geram
um débito de inferência adicional. Recursos gratuitos no contrato técnico não
recebem uma cobrança de processamento fictícia. Serviços externos chamados pelo
cliente, incluindo servidores MCP, podem ter suas próprias contas e cobranças.

## Integridade de cobrança

- As novas execuções passam por `ai_requests`, pela carteira compartilhada e por `usage_events`.
- A identidade da operação impede reexecução e débito duplicado na recuperação.
- Reservas são estimativas. A liquidação usa o consumo apurado, podendo ampliar a reserva sob bloqueio transacional apenas com saldo livre.
- Saldo reservado por outra solicitação não é consumido. Insuficiência mantém o resultado e o débito pendentes; não converte o custo excedente em consumo gratuito.
- O snapshot contém as tarifas usadas. Mudanças comerciais não alteram uma execução iniciada.
- Recursos e arquivos pertencem ao projeto e à conta da chave. Downloads usam autenticação ConnectyHub; credenciais e nomes privados não são distribuídos aos clientes.
- Trabalhos assíncronos são consultados por sua identidade original. O reconciliador não repete a geração.
- Cache guarda o instante de encerramento antes da liquidação e registra a intenção antes de alterar sua validade.
- Sessões em tempo real exigem um acesso descartável. Sem autorização para renovar a reserva, o serviço encerra a conexão.
- Falhas sem confirmação de consumo permanecem incertas para conferência. Uma estimativa não é apresentada como uma medição final confirmada.

A indexação usa a contagem do conteúdo de importação obtida antes do envio como
base comercial, debitada somente após a importação concluir. A API de importação
não expõe uma medição final equivalente à geração; essa base local não é uma
conciliação da fatura do fornecedor. Embeddings e gerações exigem metadados de
consumo na resposta para confirmar a liquidação.

## Administração e preços

A seção **Tarifas dos recursos da API de IA**, na configuração comercial, permite
criar versões de preço por modelo, dimensão e plano e liberar/suspender o catálogo.
A liberação exige as dimensões mínimas de cobrança. O acesso operacional ao modelo
continua sendo verificado separadamente.

`0128_ai_resource_operations.sql` instala recursos, tarifas, funções transacionais,
permissões e índices. As tarifas iniciais mantêm a regra comercial já utilizada:
câmbio de referência R$ 6/US$, multiplicador 4 e R$ 0,01 por crédito. A origem e a
data ficam nos metadados. Preços, câmbio efetivo, impostos, descontos e faturas do
fornecedor não foram conciliados; custos armazenados são estimativas comerciais.

Não foi inventada uma tarifa para modelos experimentais sem preço confirmado.
Pesquisa especializada e música experimental em tempo real têm adaptadores, mas
exigem confirmar o preço/acesso aplicável e configurá-lo antes de liberar uso.
Modelos suspensos no cadastro operacional continuam impedidos, mesmo com preço.

## Ativação operacional

Esta entrega **não aplicou migrações no banco remoto nem publicou o código**.

1. Aplicar em sequência as migrações pendentes, incluindo 0125, 0126, 0127 e 0128, junto à atualização do código. As alterações anteriores de WhatsApp 0123/0124 continuam presentes na árvore de trabalho.
2. Conferir credenciais, disponibilidade dos modelos e tarifas na configuração comercial. Não usar `available=true` como substituto de teste de acesso no fornecedor.
3. Publicar o processo WebSocket persistente e configurar as variáveis descritas no [roteiro do serviço](../services/ai-relay/README.md). Configurar apenas a URL não cria o servidor.
4. Manter ativo o cron Inngest que concilia solicitações, recursos e sessões.
5. Fazer um teste controlado por família em ambiente publicado, conferindo resposta, carteira, evento de consumo, cancelamento e recuperação.

Não foram realizadas gerações pagas reais de todas as famílias nem testes de carga.
Os testes automatizados usam fronteiras externas simuladas e banco PostgreSQL local.
O serviço WebSocket foi exercitado localmente com cliente real e upstream simulado.

Recursos administrativos próprios do fornecedor, como seus webhooks e triggers,
não são publicados como um proxy irrestrito: execuções autônomas fora do gateway
poderiam ultrapassar a autorização da carteira. O contrato público desta entrega
é o conjunto de operações documentado no OpenAPI, e não uma promessa de paridade
integral com todos os endpoints administrativos do fornecedor.

## Verificação

- Testes de reservas, excesso de consumo, cobrança única, permissões e revogação com PGlite.
- Testes de medição de mídia, consultas, raciocínio, cache, lotes e vetores multimodais.
- Testes de resultados de lotes fora de ordem, falhas parciais e recuperação sem nova geração.
- Testes de reserva antes de ampliar cache e recuperação de atualização incerta.
- Testes de autorização administrativa e bloqueio de liberação sem tarifas.
- Testes de conexão WebSocket, sigilo de credenciais, modelo fixo e interrupção por falha de cobrança.
- Página e downloads públicos verificados sem login em 1440 e 390 px; sem erros de JavaScript ou transbordamento horizontal.

Resultado final local: **1.106 testes aprovados em 140 arquivos**, compilação de produção e TypeScript aprovados. ESLint sem erros; dois avisos preexistentes em funções antigas de cobrança. `git diff --check` sem erros. Não houve teste pago de todas as modalidades nem publicação remota.

## Fontes primárias consultadas

- [Geração e metadados de consumo](https://ai.google.dev/api/generate-content)
- [Interactions](https://ai.google.dev/api/interactions-api)
- [Preços](https://ai.google.dev/gemini-api/docs/pricing)
- [Lotes](https://ai.google.dev/api/batch-api)
- [Cache](https://ai.google.dev/api/caching)
- [Embeddings](https://ai.google.dev/api/embeddings)
- [Pesquisa em arquivos](https://ai.google.dev/api/file-search/file-search-stores)
- [Vídeo](https://ai.google.dev/gemini-api/docs/veo)
- [Música](https://ai.google.dev/gemini-api/docs/music-generation)
- [Live](https://ai.google.dev/api/live) e [Live Music](https://ai.google.dev/api/live_music)
- [Agentes](https://ai.google.dev/api/agents) e [ambientes](https://ai.google.dev/api/environments)
