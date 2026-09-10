# Documentação pública unificada — WhatsApp e IA / LLM

## Alteração

As duas APIs já tinham páginas públicas, mas a navegação do site levava somente ao WhatsApp (`/docs/api`), enquanto o painel de IA abria `/docs/ia`. A referência agora reúne ambas em `/docs/api`, com seleção de API no menu lateral e identificação das credenciais de cada serviço.

- `/docs/api`: referência principal, com WhatsApp e IA / LLM visíveis na navegação.
- `/docs/api#ia`: introdução da IA, exemplos e acesso à geração de chaves.
- `#ia-models`, `#ia-chat`, `#ia-requests`: endpoints de IA com parâmetros, exemplos e respostas.
- `#ia-creditos`, `#ia-falhas`: carteira compartilhada, limites, estados e idempotência.
- `/docs/api/openapi.json`: JSON WhatsApp preservado.
- `/docs/api/ia/openapi.json`: novo download público OpenAPI 3.1 de IA, com nome `connectyhub-ia-openapi.json`.
- `/docs/ia`: redirecionamento permanente para `/docs/api#ia`, mantendo o endereço antigo acessível.

Links do painel, explicação de créditos, planos, soluções personalizadas e índices llms apontam para a referência unificada. Metadados e dados estruturados descrevem as duas APIs; o sitemap aponta para a página canônica.

O JSON de IA usa a base direta com `www`, autenticação Bearer própria, os três endpoints implementados, schemas de mensagens, imagens inline, geração, consumo, catálogo, consulta e erros. O modo SSE é descrito como entrega após a geração. Não são anunciadas capacidades inexistentes de tools/function calling ou streaming incremental.

## Validação

- Build de produção, incluindo TypeScript e geração estática. O build requer rede para consultar o catálogo público no Supabase durante a geração do sitemap.
- ESLint nos componentes, especificação, rotas, configuração, metadados e testes alterados.
- 8 testes aprovados em `ai-api-docs`, `ai-api-input` e `connectyhub-api-docs-buttons`: referências internas do JSON, endpoints implementados, exemplo aceito pelo gateway, resposta pública para download e regressão da documentação WhatsApp.
- QA com Playwright, sessão anônima e servidor local de produção: navegação das seis seções de IA e retorno ao WhatsApp em 360, 390, 768 e 1440 pixels; ausência de overflow horizontal; links diretos, reload e histórico do navegador; download real do JSON; abertura de endpoint WhatsApp; redirecionamento legado; sitemap canônico.
- Evidências em `tmp/docs-unification/` e script reproduzível em `tmp/docs-unification-qa.mjs` (arquivos temporários ignorados pelo Git).

Esta entrega altera documentação e navegação. Não executa gerações, não cria chaves, não altera contas, tarifas ou saldo. A validação é local; publicação em produção não foi realizada nesta tarefa.
