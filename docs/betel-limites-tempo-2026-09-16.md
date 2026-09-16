# Limites de tempo Betel — leitura em 16/09/2026

Não foi alterada configuração. Um timeout de conexão não comprova cancelamento
do trabalho remoto, nem autoriza repetir uma operação com nova identidade.

| Camada | Evidência e limite | Consequência / limite da conclusão |
| --- | --- | --- |
| Broker de produção → callback do aplicativo | Arquivo de runtime `production.mjs`: `callbackTimeout()` 310.000 ms | Aborta o fetch após 5 min 10 s. Não existe nesse código comando para matar o processamento no aplicativo. |
| Broker recebendo HTTP | `main.mjs`: requestTimeout 35 s, headersTimeout 10 s | São limites para receber a requisição, não o orçamento completo do handler. |
| Inbox → webhook Betel | Runtime `inbox.py`: urllib timeout 310 s | Limite de operações de socket; não é um deadline global do lote. Erro de rede retorna 502 `handler_unavailable`; não comprova que o aplicativo deixou de executar. |
| Inbox recebendo HTTP | Socket timeout 15 s | Limita a leitura/atividade do socket recebido, não mata o handler remoto. |
| Proxy Caddy Betel | Arquivo montado `/opt/connectyhub/proxy/Caddyfile` | Os blocos do app e webhook não declaram timeout explícito. Não foi feito ensaio destrutivo de expiração. |
| Engine Inngest | Imagem efetiva `inngest/inngest:v1.44.0`, sem override temporal em argumentos ou variáveis | A fonte dessa tag define teto HTTP de duas horas. Na cadeia Betel, o broker tem limite inferior. Não interpretar esse teto como SLA ou prazo total garantido do lote. |
| Retry do scraper de lote | Manifest do broker contém `retries.attempts = 0` | Não há retry funcional configurado para essa função. Não significa ausência de redispatch/transporte: a auditoria anterior encontrou spans repetidos. |
| API de IA ConnectyHub | Fonte desta worktree: countTokens 20 s, geração 90 s, rota maxDuration 120 s | Valores conferidos no código, sem nova inspeção do deployment Vercel neste levantamento. Geração não usa o abort do cliente e não repete o provedor depois do despacho. Falha após despacho pode ficar `uncertain`, preservando reserva. |
| Conciliação de IA | Fonte: examina solicitações antigas há mais de 5 min | Não é cancelamento do provedor. Geração processing interrompida vira uncertain; exige conferência, não replay. |

Os arquivos de runtime foram lidos diretamente na VPS. O aplicativo estava em
Node standalone, sem variável de timeout/duração sobrescrita. `maxDuration` de
uma rota Next.js, isoladamente, não estabelece um timer de encerramento no servidor
standalone. Os limites por link, coletores e polling do aplicativo devem ser
confrontados com o pacote Betel publicado; esta leitura cobre a infraestrutura.

Referências da versão do engine: [constantes v1.44.0](https://raw.githubusercontent.com/inngest/inngest/v1.44.0/pkg/consts/consts.go),
[driver HTTP](https://raw.githubusercontent.com/inngest/inngest/v1.44.0/pkg/execution/driver/httpdriver/httpdriver.go)
e [cliente HTTP](https://raw.githubusercontent.com/inngest/inngest/v1.44.0/pkg/execution/exechttp/exechttp.go).
