# Auditoria da API de LLM — 09/09/2026

## Parecer

A API externa de IA está implementada, a documentação pública está disponível e há um piloto de geração bem-sucedida em produção de 08/09/2026. As verificações de 09/09 confirmaram disponibilidade pública, autenticação obrigatória, configuração do catálogo/tarifas e aprovação dos testes selecionados. Não há evidência suficiente para afirmar que todas as modalidades funcionam integralmente hoje: não foi executada nova geração autenticada nesta auditoria, e não há integração de cliente ativa no banco consultado.

## Evidência atual

Consultas HTTP ao domínio público e leituras sem mutação no Supabase configurado em `.env.local`, iniciadas aproximadamente às 22h41, horário de São Paulo:

| Verificação | Resultado |
| --- | --- |
| `GET https://www.connectyhub.com.br/docs/ia` | HTTP 200, HTML com documentação de IA |
| `GET /api/v1/ai/models` sem chave | HTTP 401 |
| `POST /api/v1/ai/chat/completions` com JSON válido, sem chave | HTTP 401, `invalid_api_key` |
| `GET /api/v1/ai/requests/{uuid}` sem chave | HTTP 401 |
| POST no domínio sem `www`, sem seguir redirecionamento | HTTP 307 para o domínio com `www` |
| Projetos existentes | 3, todos pausados |
| Chaves existentes | 3, todas revogadas |
| Solicitações consultadas | 3: uma concluída e duas falhas históricas |
| Pendências `preparing/reserved/processing/uncertain` | Contagem exata zero |
| Reservas das três solicitações | Zero |
| Modelo elegível para geração externa | `gemini-3.6-flash`; modelos 2.5 explicitamente excluídos da API externa e modelo TTS filtrado pelo adaptador |
| Feature `external_ai` | Habilitada e cobrável |
| Configuração de credenciais | Registros `GEMINI_API_KEY` e `GEMINI_DEFAULT_MODEL` presentes; validade da chave no fornecedor não foi retestada |

O catálogo/tarifas foi consultado diretamente no banco, não por uma chamada autenticada à rota pública. O destino da configuração local foi usado conforme o workspace; não foi inspecionada a configuração privada atual do deployment para comparar os ambientes.

Tarifas comerciais cadastradas e vigentes para o modelo consultado: 0,0018 crédito por token de entrada, 0,009 por token de saída, mínimo configurado de 1 crédito. Há outra vigência cadastrada a partir de 01/01/2027. Estes são valores encontrados na configuração ConnectyHub, não uma nova verificação de preços oficiais do fornecedor. O raciocínio medido compõe a saída.

## Evidência histórica confirmada

O artefato `tmp/custom-review/ai-pilot-production.json` registra catálogo HTTP 200, geração HTTP 200 com texto `OK`, replay HTTP 200 com resposta idêntica e `Idempotency-Replayed: true`, além de HTTP 401 após revogação. O registro concluído permanece no banco com reserva e débito zerados, em modo `internal_shadow`.

As duas falhas anteriores continuam encerradas, sem reserva/débito, com códigos `token_count_failed` e `provider_unavailable`. A entrega de 08/09 registra falha local de acesso ao fornecedor e sucesso pelo ambiente de produção. Nenhuma geração ou nova chamada ao fornecedor foi executada em 09/09 nesta auditoria.

Não há demonstração de débito real de cliente em produção. A proteção de carteira e liquidação foi exercitada nos testes locais transacionais.

## Testes executados

```text
npm test -- tests/ai-api-input.test.ts tests/ai-credit-reservations.test.ts tests/custom-contracts-topups-meetings.test.ts tests/custom-resource-limits.test.ts
4 arquivos aprovados; 15 testes aprovados.
```

Cobertura inclui parsing de texto/imagem inline, rejeição de URLs remotas/ferramentas/saída excedente, geração e hash de segredos, reservas compartilhadas, proteção do débito legado, liquidação única, idempotência/conflito, retenção/liberação de reservas, teto por projeto, revogação e restrição de mutações SQL, além de contratos e limites relacionados.

Os testes de carteira usam PGlite e a migração real; não constituem teste de carga com conexões simultâneas à produção. Não foram executados build, suíte completa, testes ponta a ponta de SDK/SSE/imagens em produção ou entrega real de alertas nesta auditoria.

## Funcionamento conferido no código

1. `src/lib/ai-api/gateway.ts` autentica a chave, verifica projeto, acesso contratual e permissão independente `llm_api`.
2. Registra a operação por projeto/Idempotency-Key; valida conteúdo, seleciona modelo habilitado e consulta contagem de tokens no Gemini.
3. Reserva créditos em transação antes da geração, respeitando saldo e limites. A carteira é compartilhada com os agentes.
4. Gera pelo Gemini; mede entrada, saída e raciocínio; grava snapshot e liquida sem cobrar acima da reserva.
5. Retorna formato Chat Completions, consumo e UUID. Reenvio concluído recupera o resultado sem nova geração.
6. Falhas definitivas liberam reserva. Resultados incertos aguardam conciliação; o código agenda varredura pelo Inngest a cada cinco minutos. A execução real desse agendamento não foi observada nesta auditoria; não havia pendências para acompanhar.

Principais fontes: `src/app/api/v1/ai/`, `src/lib/ai-api/`, `src/app/api/dashboard/ai/route.ts`, `src/components/connectyhub-os/ai-console.tsx`, `src/lib/billing/metered-usage.ts`, `supabase/migrations/0106_ai_credit_reservations.sql`, `supabase/migrations/0113_external_ai_current_model.sql`.

## Documentação e pontos para integração

- Existe documentação pública em `/docs/ia` com autenticação, parâmetros, imagens, créditos, idempotência e erros. Há também plano e relatório de entrega de 08/09 no repositório.
- A base publicada nessa página usa o domínio sem `www`. Como ele retorna 307 para outro hostname, clientes podem perder `Authorization` no redirecionamento. Recomenda-se a base direta `https://www.connectyhub.com.br/api/v1/ai`.
- Não foram encontradas rotas de IA no OpenAPI JSON/YAML existente; esses artefatos documentam WhatsApp. A IA ainda não tem especificação OpenAPI própria encontrada nesta inspeção.
- A documentação pública não detalha completamente os schemas de resposta, os estados de consulta, `stream_options` e o tratamento de uma tentativa previamente falha. O novo guia local complementa esses pontos.
- A integração aceita apenas o subconjunto documentado de Chat Completions. Não há tools/function calling, JSON schema, endpoints Responses/embeddings ou outros fornecedores no adaptador atual.
- SSE é entregue após a geração, não token a token; imagens precisam estar inline. Esses limites já são declarados na página pública.
- Os erros não têm formato uniforme: geração retorna objeto com código/mensagem; catálogo e consulta retornam string.
- Só existem projetos pausados e chaves revogadas do piloto no banco consultado. Para conectar um sistema, é necessário criar/ativar um projeto da conta desejada e gerar uma chave válida, com contrato, permissão e saldo adequados.

## Entrega desta auditoria

Criado `docs/guia-integracao-api-llm.md`, pronto para compartilhar com implementadores, e este relatório, ambos vinculados no README. A auditoria não alterou código de aplicação, projetos, chaves, contratos ou saldo e não publicou mudanças. A correção da URL e os complementos estão no guia local; a página pública permanece como estava.
