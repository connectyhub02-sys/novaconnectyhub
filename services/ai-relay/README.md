# Serviço de sessões em tempo real

Processo Node persistente para conexões WebSocket. A aplicação Next autoriza,
reserva e liquida o consumo; este processo mantém a conexão e envia medições
ao controle interno. A credencial do provedor nunca chega ao navegador.

## Configuração

Na aplicação Next:

- `AI_RELAY_PUBLIC_URL`: URL pública `wss://` do serviço.
- `AI_RELAY_SECRET`: segredo aleatório de pelo menos 32 caracteres, compartilhado somente com o serviço.

No serviço:

- `AI_RELAY_CONTROL_URL`: `https://SEU_DOMINIO/api/internal/ai/relay`.
- `AI_RELAY_SECRET`: o mesmo segredo configurado na aplicação.
- `PORT`: porta interna, padrão 3120.

Não use variáveis `NEXT_PUBLIC_` para segredos. Configure TLS no proxy de entrada
com suporte a Upgrade/WebSocket. O controle exige HTTPS, exceto localhost.

Após `npm ci`, execute `node services/ai-relay/server.mjs`. Para contêiner,
execute na raiz do projeto:

```sh
docker build -f services/ai-relay/Dockerfile -t connectyhub-ai-relay .
docker run --restart unless-stopped --memory 512m --cpus 1 --env-file /caminho/seguro/relay.env -p 127.0.0.1:3120:3120 connectyhub-ai-relay
```

O arquivo de ambiente é operacional e não deve ser commitado. O serviço exige
as migrações até 0128, as tarifas por modalidade e o reconciliador Inngest ativo.
Não funciona hospedado somente como uma função HTTP de curta duração.

## Fluxo e recuperação

1. O cliente cria uma sessão em `/api/v1/ai/live` com sua chave ConnectyHub.
2. O saldo é reservado; o acesso de conexão é descartável e expira em 60 segundos.
3. O cliente conecta ao WebSocket e envia `{id, access_key}` como primeira mensagem.
4. O servidor configura o modelo da chave e acompanha o consumo antes de entregar eventos medidos.
5. Sem saldo para renovar, chave revogada ou falha de contabilização, encerra a conexão.
6. No encerramento, liquida o consumo confirmado. Resultado incerto permanece em conferência; não é tratado como custo zero.

Tickets não utilizados são liberados pelo reconciliador. Sessões que perdem a
conexão de controle ficam incertas, com as últimas medições preservadas.
O endpoint HTTP `/health` retorna `{ok:true,version:"2026-09-14",live:true}` para liveness;
isso não comprova disponibilidade de modelo, saldo ou comunicação com o controle.

O processo limita a 16 conexões simultâneas (incluindo handshakes) e 15 minutos
por conexão. Uma sessão expirada precisa de nova operação e ticket. Os checkpoints
de carteira continuam a cada cinco segundos; nenhuma chave Google é enviada ao cliente.
O limite de processo é adicional ao limite de concorrência por carteira da aplicação.
Não habilite `AI_RELAY_PUBLIC_URL` antes de validar TLS, controle autenticado,
conexão com ticket, encerramento e liquidação. A implantação ainda exige acesso SSH
à VPS; a presença deste código não comprova serviço publicado.

Testes locais: `npx vitest run tests/ai-relay.test.mjs tests/ai-resource-billing.test.ts --maxWorkers=2`.

## Transporte de arquivos

Habilite `AI_UPLOAD_RELAY_ENABLED=true` tanto na aplicação quanto no serviço somente
depois de publicar a migration 0144 e validar o caminho HTTPS `/uploads/*` no proxy.
O cliente prepara o envio em `POST /api/v1/ai/files/uploads` e recebe um ticket de uso
único com validade de dois minutos. Envia os bytes por PUT diretamente à VPS,
com Content-Length e Content-Type iguais aos declarados. Limite: 20.000.000 bytes,
quatro uploads simultâneos no processo, dois por carteira. A chave do provedor
permanece no controle/relay. O upload não executa geração nem débito de créditos.

Monte um volume privado persistente em `/app/state` (variável `AI_UPLOAD_STATE_DIR`):
adicione `--mount source=connectyhub-ai-relay-state,target=/app/state` ao docker run.
O diretório pertence ao usuário node, modo 0700. Ele armazena somente identificadores
de confirmações pendentes, nunca os bytes dos arquivos ou as chaves. O processo
reconcilia essas confirmações a cada 15 segundos e após reiniciar; não reenvia bytes.
Inclua o volume no backup operacional. Falha entre a criação no provedor e a gravação
do recibo pode exigir investigação pelo suporte; não instrua repetição cega do upload.

No proxy, limite o corpo a 20 MB e mantenha o endpoint interno de controle autenticado.
Preserve a publicação exclusiva no loopback. O sinal `uploads:true` de `/health`
confirma a opção habilitada, não um teste de integração real com o Google.

Testes do transporte usam servidor HTTP local e provedor simulado:
`npx vitest run tests/ai-upload-relay.test.mjs tests/ai-upload-tickets.test.ts --maxWorkers=2`.
