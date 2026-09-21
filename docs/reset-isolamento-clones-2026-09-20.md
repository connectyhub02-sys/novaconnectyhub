# Reset e isolamento de clones de voz — 20/09/2026

## Reset concluído na VPS

O titular solicitou que todos os painéis refaçam seus clones após a troca da
conta ElevenLabs. A chave salva havia sido comparada em memória com a informada
pelo titular, sem registrá-la em arquivos; autenticação aceita pelo fornecedor.
O clone de Renata continuava `ready` no cadastro local, mas a consulta pela chave
atual retornou `voice_not_found`. Trocar a chave não remove cadastros locais.

Após inventário e ensaio integral com rollback, foi aplicado um reset transacional:

- Sete registros ativos de `customer_voices` em quatro organizações foram
  arquivados, retirando a indicação de voz padrão. Representavam seis IDs do
  fornecedor; um registro já excluído permaneceu como estava.
- Um vínculo de clone importado da API de Voz foi marcado `deleted`, com motivo
  de reset de conta. Deixa de ser elegível no catálogo e nas operações por ID.
- Três configurações em `agent_registry` e cinco em `whatsapp_instances` tiveram
  ID, nome, origem, proprietário público e modelo da voz limpos. Esses registros
  ficaram em resposta por texto até cadastrar/escolher uma nova voz.
- Foram incluídas referências por ID mesmo quando a origem estava rotulada
  `elevenlabs`, além das seleções explicitamente `customer`.

As outras configurações dos agentes e conexões foram comparadas dentro da
transação e preservadas. Nenhum clone foi apagado no fornecedor, nenhum áudio
histórico ou recibo financeiro foi removido e nenhuma carteira recebeu ajuste.
Não havia operação de voz reservada, em processamento ou incerta no momento do
reset. Vozes comuns/Gemini sem vínculo com os clones foram preservadas.

Backup restrito na VPS: `/opt/connectyhub/maintenance/voice-clone-reset-20260920`.
Contém estado anterior, SQL exato e resultado; não versionar esses dados privados.
A gravação exige que os registros ainda coincidam com o backup e registra auditoria
administrativa sem segredos. Pós-escrita: zero clones locais/API ativos, três
registros de agente e cinco de conexão afetados confirmados em modo texto.

O reset é uma alteração pontual de dados, não uma migration reaplicável sobre
clones novos. Painéis abertos devem ser recarregados para descartar estado antigo.
Novas clonagens continuam exigindo amostras, consentimento e as regras de acesso
e cobrança existentes; nenhuma clonagem paga foi feita nesta verificação.

## Isolamento por criador e organização

O endpoint de clonagem usa o usuário da sessão e valida acesso à empresa. O
cliente não escolhe outro proprietário no formulário. Seleção de voz ao salvar
o agente consulta o catálogo permitido; exclusão filtra organização e criador.
Na API de Voz, a autorização adicional é por organização e projeto.

A revisão encontrou exceções antigas: registros sem proprietário eram tratados
como compartilhados entre membros da organização, e um clone definido como
padrão global podia escapar do filtro de vozes remotas. Foram preparados:

- Migration 0160: exige proprietário autenticado e vínculo com a organização nas
  políticas de leitura/escrita de clones; mantém a administração da plataforma
  e a regra restritiva de contrato existentes.
- Lista do painel com proprietário exato, sem incluir legados sem dono. Prévia
  é obtida apenas dos mesmos registros autorizados e ativos, evitando a leitura
  separada que incluía clones arquivados.
- Vozes da conta do fornecedor só entram como comuns quando classificadas como
  `premade`; clones privados precisam estar entre os registros autorizados.
  ID padrão não concede acesso. Uma voz privada recusada também não reaparece
  pelo resultado da biblioteca. Durante falha do catálogo, somente o ID público
  embutido pode ser criado como opção de fallback.

Testes sintéticos da lista cobrem proprietário, outro usuário da mesma empresa,
outra empresa do mesmo usuário, legado sem dono, arquivado, prévia, ID padrão
privado, biblioteca duplicada e falha do fornecedor. Testes PostgreSQL/PGlite
usam as migrations e verificam leitura/escrita por usuário e organização,
tentativas de forjar proprietário, excluir/alterar clone alheio e acesso anônimo.
Regressões da API mantêm isolamento por projeto, inclusive amostras e download.

25 testes direcionados, ESLint e build webpack/TypeScript com 109 páginas
passaram. Ensaio adicional na VPS, integralmente descartado, usou dois usuários
na mesma organização e três registros sintéticos: próprio, alheio e sem dono.
Cada usuário leu somente seu clone; alteração alheia e transferência de
proprietário foram bloqueadas. Nenhum vínculo ou clone de teste permaneceu.

Migration 0160 aplicada e registrada no banco. Políticas publicadas relidas;
registros de clone preservados integralmente e regra de contrato intacta.
O reset e o reforço de RLS já estão ativos; publicação da lista da aplicação
pela master em andamento. Não foi realizado novo clone real nem ensaio de
navegador com duas contas nesta rodada; o teste de catálogo usa respostas
sintéticas do fornecedor.
