> Registro histórico da versão 1.2.0. A ampliação posterior de modelos e endpoints está em [implementacao-modelos-api-ia-2026-09-10.md](implementacao-modelos-api-ia-2026-09-10.md) e exige as migrações 0125/0126 antes da publicação.

# Auditoria e ampliação da documentação de IA — 10/09/2026

## Resultado

A documentação estava superficial em relação ao contrato já implementado, mas a diferença de quantidade de recursos também decorre do backend. A API pública expõe somente três operações: GET /models, POST /chat/completions e GET /requests/{request_id}. A atualização de documentação não adiciona modalidades nem encaminha livremente as requisições para todos os recursos do fornecedor.

A documentação pública foi ampliada de 6 para 16 seções, usando somente ConnectyHub como marca do serviço e créditos como medida de consumo. Exemplos e explicações foram escritos para o contrato ConnectyHub, sem copiar a referência externa nem trocar nomes de campos que a API não implementa.

## Evidências desta verificação

Em consultas HTTP somente de leitura ao domínio público em 10/09/2026:

| Consulta | Resultado |
| --- | --- |
| /docs/api | HTTP 200 |
| /docs/api/ia/openapi.json | HTTP 200; versão publicada 1.1.0; três caminhos |
| /api/v1/ai/models sem chave | HTTP 401 |

A versão nova 1.2.0 foi validada localmente. Não foi publicada e não houve geração autenticada nova, alteração de chaves/projetos nem consumo de créditos nesta auditoria. Os resultados demonstram disponibilidade da documentação e exigência de autenticação, não a saúde ponta a ponta de uma geração real.

## Contrato encontrado no código

- `src/lib/ai-api/gateway.ts`: autenticação por chave do projeto, acesso da conta, preparação idempotente, seleção de processamento, reserva de créditos, geração, liquidação e retenção de resultados incertos para conferência.
- `src/lib/ai-api/public-response.ts`: identificação pública connectyhub-auto, créditos e respostas filtradas, inclusive na recuperação de registros antigos.
- `src/app/api/v1/ai/chat/completions/route.ts`: corpo JSON com até 2.000.000 bytes e SSE entregue após a conclusão, com texto completo, encerramento com créditos e [DONE].
- `src/app/api/v1/ai/requests/[requestId]/route.ts`: consulta restrita ao mesmo projeto. Recupera operação, sem criar uma sessão de conversa.
- `src/lib/ai-api/reconciliation.ts`: tratamento de operações pendentes/incertas. A execução real do agendamento não foi observada nesta verificação.
- `supabase/migrations/0119_simple_ai_usage.sql`: simplificação de projetos, reservas por saldo e resumos de uso. O estado de aplicação dessa migração no banco não foi novamente auditado nesta entrega.

O adaptador aceita texto, mensagens system/user/assistant e imagens inline PNG/JPEG/WebP em mensagens user. Também aceita temperature e stream_options, que não estavam descritos na referência pública anterior. Entradas legadas de compatibilidade permanecem no adaptador; não foram alteradas nem promovidas a configurações exigidas do cliente.

A existência de recursos nos agentes internos, como ferramentas comerciais e áudio, não implica que um cliente externo consiga usá-los em /api/v1/ai.

## Comparação técnica e lacunas reais

A referência externa foi usada para identificar categorias de recursos e comparar responsabilidades. Não foi usada como texto para republicação. Fontes primárias consultadas em 10/09/2026:

- [Referência geral de APIs](https://ai.google.dev/api): diferencia geração REST, SSE incremental, comunicação em tempo real, lotes, vetores e serviços auxiliares.
- [Referência de geração](https://ai.google.dev/api/generate-content): conteúdo, configurações e estruturas do serviço de origem.
- [Chamada de funções](https://ai.google.dev/gemini-api/docs/function-calling): funções declaradas, argumentos e integração com ferramentas.
- [Saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output): configuração de formato e validação estrutural.

| Categoria | API pública ConnectyHub atual | Trabalho necessário para ampliar |
| --- | --- | --- |
| Texto e histórico | Disponível em /chat/completions | Documentação ampliada nesta entrega |
| Análise de imagens | Disponível inline com resposta textual | Documentação, exemplo de arquivo e regras ampliados |
| SSE | Formato de eventos após conclusão | Entrega incremental exigiria mudança de execução, cancelamento e liquidação |
| Funções/ferramentas | Não disponível | Contrato de ferramentas, mensagens/resultados, preservação de contexto e cobrança por rodada |
| JSON com schema imposto | Não disponível | Validação de schema, adaptação do pedido, resposta e erros verificáveis |
| Arquivos/PDF | Não disponível | Upload ou entrada apropriada, autorização, ciclo de vida e tratamento de conteúdo |
| Áudio/vídeo/geração de imagens | Não disponível | Adaptadores, catálogo elegível, contabilização, schemas e testes de cada modalidade |
| Embeddings/busca | Não disponível | Endpoints, índice ou vetores, acesso aos dados e contabilização |
| Lotes, sessões persistentes, tempo real e cache | Não disponível | Novas rotas, estados, armazenamento e controle de operações |

Portanto, oferecer cobertura semelhante à referência comparada é uma evolução de produto/API, não uma simples ampliação de texto. Uma ordem técnica possível seria saída estruturada e ferramentas, depois arquivos/áudio e, por fim, modalidades e operações especializadas. Essa sequência é uma proposta de priorização, não uma promessa pública ou trabalho implementado nesta entrega.

## Conteúdo entregue

1. Início e primeira chamada.
2. Recursos disponíveis e indisponíveis.
3. Autenticação e projetos.
4. GET /models.
5. POST /chat/completions, campos e respostas.
6. Texto e instruções.
7. Conversas e histórico.
8. Análise de imagens.
9. Contexto próprio e documentos convertidos em texto.
10. JavaScript/Node.js.
11. Python.
12. Eventos SSE com sequência de protocolo real.
13. GET /requests/{request_id}, estados e recuperação.
14. Créditos e painel de uso.
15. Erros, identidade das operações e diagnóstico.
16. Schemas e downloads.

A navegação agora tem grupos e busca por conteúdo; os exemplos têm botão de copiar. A página oferece downloads OpenAPI JSON e Markdown. O guia público em /docs/api/ia/guide.md e o arquivo local `docs/guia-integracao-api-llm.md` são gerados a partir da mesma fonte da página.

O OpenAPI 1.2.0 inclui exemplos de texto, conversa, imagem, contexto e SSE; tipos e dependências dos campos opcionais; tamanho do corpo; exemplo de consulta em conferência; schema de evento SSE; e respostas HTTP por operação. O link de entrada pela referência WhatsApp foi corrigido para dizer “análise de imagens”, sem sugerir geração de imagens.

## Validação

- 21 testes aprovados em quatro arquivos: contrato público, parser, sanitização pública e reservas de créditos.
- Todos os exemplos de requisição passam pelo parser real do gateway; campos de recursos indisponíveis são rejeitados no teste.
- A sequência SSE documentada foi comparada com o handler real, substituindo apenas a geração por resposta de teste.
- Exemplo JavaScript executado com HTTP simulado; dois exemplos Python com sintaxe validada.
- Guia local conferido contra a fonte da página; referências de schema resolvidas e ausência de marca do fornecedor/medição interna verificada nos artefatos públicos.
- ESLint aprovado nos arquivos desta alteração.
- Build de produção aprovado; a nova rota Markdown é pública e estática.
- QA local em 390, 768 e 1440 pixels: sem overflow horizontal de página, sem erro JavaScript, busca, copiar, downloads e retorno à documentação WhatsApp funcionando.
- Capturas e resultados locais em `tmp/ai-docs-expanded-qa/`.

## Publicação e manutenção

Esta ampliação de documentação não exige uma nova migração de banco. O workspace contém alterações anteriores de WhatsApp com migrações próprias; elas continuam exigindo sua ordem de publicação se forem entregues junto.

Para atualizar o guia após editar a referência: `node scripts/generate-ai-guide.mjs`. Alterar os schemas em `src/lib/ai-api/openapi.ts` quando o contrato efetivamente mudar. Novos recursos devem entrar na documentação pública somente quando tiverem rota/adaptador e validação correspondentes.
