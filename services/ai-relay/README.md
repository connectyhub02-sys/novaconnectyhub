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
docker run --env-file /caminho/seguro/relay.env -p 3120:3120 connectyhub-ai-relay
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
O endpoint HTTP da porta do serviço retorna apenas `{ok:true}` para liveness;
isso não comprova disponibilidade de modelo, saldo ou comunicação com o controle.

Testes locais: `npx vitest run tests/ai-relay.test.mjs tests/ai-resource-billing.test.ts --maxWorkers=2`.
