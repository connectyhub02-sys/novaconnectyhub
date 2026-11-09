# Coexistência gerenciada para a Vision — 09/11/2026

Magno escolheu adaptar a ConnectyHub para o mesmo número de WhatsApp Business,
Global e campanhas oficiais. A regra anterior de dois números permanece no
cadastro tradicional; este fluxo depende de habilitação explícita por cliente
API e instância. Piloto: Global da Vision Comex. Nenhum número foi cadastrado ou
mensagem enviada na preparação.

## Contrato

`GET /api/v1/instances/{instanceId}/meta-coexistence` consulta o preparo;
`?inspect=1` confere assinatura do aplicativo e o número na Meta.
`POST` aceita `action: start | finish | resume | graph`. Todas as ações exigem
chave API ativa, escopos de instância, propriedade da organização e habilitação
operacional. O start verifica a conexão QR e vincula nonce de 20 minutos à chave,
instância, telefone e configuração. O finish consome o nonce antes da troca do
código e exige o mesmo número com `is_on_biz_app` e `CLOUD_API`.

O callback deve ser HTTPS, corresponder à origem aprovada e a um webhook ativo
do cliente, no caminho `/api/webhooks/meta?company=<uuid>`. A Vision fornece um
segredo dedicado pelo servidor. Tokens Meta e esse segredo são cifrados no
provedor; o navegador não recebe credenciais. Nunca é chamado `/register`.
O proxy Graph aceita somente operações explícitas no WABA/número vinculado,
retira URLs de paginação com tokens e bloqueia `/messages` nesta fase.

## Eventos e banco

Migration 0223 cria vínculos e recibos privados com RLS e sem grants de leitura
para anon/authenticated. Um WABA e um remetente não podem pertencer a dois vínculos.
O webhook central valida a assinatura Meta antes de separar os eventos por
WABA/telefone; mudanças desse WABA ficam fora do processamento oficial comum.
Recibos deduplicados são entregues à Vision com HMAC dedicado pelo Inngest,
com tentativas e recuperação. Só IDs de recibos entram na fila. A entrega
revalida titularidade, habilitação e destino e não segue redirects. Cópias já
entregues são removidas após sete dias; a Vision mantém seu arquivo autorizado.

Sincronizações de contatos e histórico são reservadas uma vez em 24 horas.
Falhas de resultado incerto não são repetidas automaticamente. Históricos e
mensagens enviadas pelo aplicativo não são entrada de IA na Vision.

## Evidência e limites

36 testes dirigidos de coexistência, persistência e WhatsApp oficial passaram;
TypeScript e lint dirigidos passaram. Migration ensaiada com rollback e aplicada
na VPS, com backup do schema e confirmação de grants privados. Habilitação
restrita ao piloto e preservação dos demais metadados verificadas. Webhook Meta
recebe os cinco campos de coexistência, preservando outras assinaturas. Domínio
canônico da Vision adicionado ao SDK do aplicativo provedor; HTTPS e modo estrito
preservados. Isso não altera a submissão de revisão de outros produtos Meta.

Release da aplicação ainda em preparação; atualizar abaixo após ativação.
A Meta confirmou o aplicativo como Tech Provider no painel, mas a elegibilidade
do número depende do cadastro real. O titular precisa concluir a autorização no
Business e permitir o histórico. Pode ser necessário refazer o QR da ConnectyHub.
Só o teste real pode confirmar a continuidade do Global; campanhas permanecem
bloqueadas até essa validação e a revisão específica do envio.
