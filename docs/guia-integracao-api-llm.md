# Integração com a API de IA ConnectyHub

## Conectar seu sistema

1. Entre no painel de API de IA e informe o nome do projeto.
2. Copie a chave criada junto com ele. Ela aparece completa somente uma vez.
3. Guarde a chave no servidor do seu sistema e envie sua primeira mensagem.

- Documentação: https://www.connectyhub.com.br/docs/api#ia
- OpenAPI JSON: https://www.connectyhub.com.br/docs/api/ia/openapi.json
- Painel: https://www.connectyhub.com.br/dashboard/api-ia
- Base: `https://www.connectyhub.com.br/api/v1/ai`
- Autenticação: `Authorization: Bearer SUA_CHAVE`

A chave da API de IA é independente da chave WhatsApp. A conta precisa de projeto ativo, acesso válido e saldo disponível. Nas ferramentas que exigem o campo `model`, use `connectyhub-auto`. Nas chamadas diretas, esse campo pode ser omitido.

## Primeira solicitação

Exemplo Bash, com a variável secreta CONNECTYHUB_AI_API_KEY configurada no servidor:

```bash
curl 'https://www.connectyhub.com.br/api/v1/ai/chat/completions' \
  -H "Authorization: Bearer $CONNECTYHUB_AI_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: pedido-123-resposta-1' \
  --data '{"messages":[{"role":"user","content":"Explique o que é uma API em uma frase."}]}'
```

Leia o texto em `choices[0].message.content`, os créditos utilizados em `connectyhub.credits` e o identificador da solicitação em `connectyhub.request_id`.

A API usa um subconjunto de Chat Completions. Campos públicos: `messages` (obrigatório), `model` (opcional) e `stream` (opcional, false por padrão). A resposta informa o consumo exclusivamente em créditos. Integrações que calculavam consumo por outros campos devem passar a ler `connectyhub.credits`.

As mensagens usam os papéis `system`, `user` ou `assistant`, com ao menos uma `user`. Para analisar uma imagem, envie partes `text` e `image_url` no conteúdo de uma mensagem `user`. Imagens PNG/JPEG/WebP precisam estar em data URL base64; URLs remotas não são aceitas. Arquivos de áudio, vídeo e PDF não integram este contrato; documentos podem ser enviados como texto extraído.

`stream: true` entrega eventos SSE após concluir a solicitação, com créditos no evento final e `data: [DONE]`. Não é entrega incremental.

## Consultar e reenviar

| Método | Caminho relativo à base | Uso |
| --- | --- | --- |
| GET | `/models` | Identificador da API ConnectyHub |
| POST | `/chat/completions` | Enviar mensagem e receber resposta |
| GET | `/requests/{request_id}` | Consultar resposta, situação e créditos |

Envie uma Idempotency-Key por operação, de 1 a 128 caracteres ASCII imprimíveis sem espaços. Se precisar reenviar, mantenha a mesma identidade e o mesmo corpo. Uma operação concluída é recuperada sem nova execução ou débito. Sem esse cabeçalho, cada envio representa uma nova operação.

Se a conexão cair, consulte o UUID recebido em `connectyhub.request_id` ou `X-Request-Id`, sem o prefixo `chatcmpl-`. Se não recebeu o UUID, reenvie o corpo original com a mesma Idempotency-Key.

- `preparing`, `reserved`, `processing`: em andamento; aguarde.
- `completed`: resposta disponível em `response`.
- `uncertain`: em conferência; não inicie outra operação equivalente.
- `failed`: confira a causa antes de tentar novamente com uma nova identidade.

A geração retorna erros como objeto em `error`, com `code`, `message` e `request_id` quando disponível. Catálogo e consulta retornam `error` como texto. Em 401/403, confira acesso e chave; em 402, saldo e conta; em 409, identidade e estado; em 400/413/422, conteúdo enviado; em 502/503 ou falha de conexão, consulte a solicitação antes de repetir.

## Acompanhar os créditos

No painel, escolha o período e o projeto para ver consumo diário, quantidade de solicitações, resultados e distribuição dos créditos. As atividades mostram data, projeto, situação e consumo.

Todos os projetos usam a carteira compartilhada da conta. Créditos em processamento ficam separados até a conclusão. O consumo varia conforme o trabalho realizado. Recarregue a carteira pelo painel; o saldo é liberado após confirmação do pagamento.