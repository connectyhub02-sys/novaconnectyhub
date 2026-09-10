# API de IA simples e painel de uso

## Experiência do cliente

- Criar projeto pede somente um nome. Projeto e primeira chave são criados em uma única transação; a chave completa é exibida apenas nessa criação.
- Navegação entre **Painel de uso** e **Projetos e chaves**.
- Gráficos de créditos por dia, solicitações por dia, resultados e distribuição do consumo por projeto.
- Filtros de projeto e períodos de 7, 30 ou 90 dias. Os totais agregam todo o período no banco, sem depender das 50 atividades recentes exibidas na lista.
- Datas dos gráficos seguem o calendário de São Paulo. Há tabela acessível com os valores dos gráficos, estados vazios e tratamento de falhas de carregamento.
- Teste de conexão apresenta resposta, créditos e identificador. Tentativas incertas preservam a identidade original para consulta, sem nova geração automática.
- Histórico da API, explicação dos créditos, extrato da conta, documentação unificada e OpenAPI apresentam consumo em créditos e não expõem a medição interna ou o fornecedor de IA.

## API e banco

A migração `0119_simple_ai_usage.sql`:

1. Retira os valores legados de teto do projeto e frequência de chamadas.
2. Atualiza claim e reserva para não bloquear a API externa por frequência, orçamento de projeto ou tetos diários/mensais de gasto. Continuam as verificações de saldo disponível, acesso, chave ativa, carteira e liquidação idempotente.
3. Cria `create_ai_project_with_key` para cadastro atômico de projeto/chave.
4. Cria `ai_usage_summary` para totais e séries diárias por conta/projeto, acessível somente pelo servidor.

As rotas do painel resolvem a conta no servidor e não aceitam uma organização informada pelo cliente. O acesso a criação/revogação continua restrito aos administradores autorizados da conta.

O catálogo público passa a identificar apenas `connectyhub-auto`. Gerações e consultas, inclusive replays históricos, passam por uma lista explícita de campos públicos. Informações internas continuam nos registros operacionais para conferência de custo e cobrança, fora da resposta ao cliente.

O contrato público de resposta foi simplificado: o consumidor deve ler `connectyhub.credits`; campos antigos de medição técnica deixam de ser retornados. Campos de entrada legados continuam aceitos pelo adaptador para compatibilidade, mas o caminho público documentado exige somente `messages`, com `model` e `stream` opcionais.

O serviço continua dependente de capacidade técnica de processamento e disponibilidade de infraestrutura; a interface não promete capacidade infinita. A mudança elimina configurações e cotas comerciais de chamada, preservando a cobrança baseada em saldo.

## Validação

- 27 testes aprovados em sete arquivos, incluindo reservas e liquidação, idempotência, criação atômica, autorização de administrador, isolamento entre contas/projetos, agregação de 125 solicitações, períodos, retorno de créditos com precisão decimal e sanitização de respostas históricas.
- ESLint nos arquivos principais alterados, checagem TypeScript e build de produção Next.js aprovados.
- QA da interface em 360, 390, 768 e 1440 pixels, sem overflow horizontal ou erros JavaScript. Os gráficos e interações foram verificados com dados de demonstração interceptados no navegador, sem consumir saldo ou criar projetos reais.
- QA conferiu criação enviando somente nome, filtros, estado sem dados, recuperação de erro e teste de conexão exibindo somente resposta/créditos mesmo diante de um payload de demonstração com campos internos.
- Evidências em `tmp/ai-simple-qa/`; dados de demonstração identificados nas capturas. O endpoint temporário de prévia foi removido do código entregue.

## Publicação

Alteração preparada e validada localmente. A migração não foi aplicada em produção e o código não foi publicado. Aplicar a migração 0119 junto à publicação da documentação unificada e desta experiência de IA. Não publicar somente a interface: os novos endpoints dependem das funções SQL.

Antes de ativar integrações novas, verificar no ambiente publicado a criação do projeto/chave, a atualização dos gráficos com uso real e o consumo em créditos. A validação visual desta entrega não representa um novo piloto de geração autenticada em produção.
