# ConnectyHub

ConnectyHub e um app Next.js para operar agentes de WhatsApp, CRM, catalogo de vendas, billing, integracoes e a API publica ConnectyHub/UAZAPI.

## Stack

- Next.js 16 App Router e React 19
- Supabase Auth, Postgres, RLS e service role para rotinas server-side
- Inngest para filas, crons e rotinas de agente
- UAZAPI para instancias e operacoes WhatsApp
- Mercado Pago para checkout do catalogo de vendas
- R2/Cloudflare para storage de midias
- Vitest para testes unitarios

## Scripts

```bash
npm run dev        # servidor local
npm run lint       # ESLint
npm test           # testes unitarios
npx tsc --noEmit   # checagem TypeScript
npm run build      # build de producao
npm run api:docs   # gera OpenAPI publica
npm run api:audit  # audita cobertura ConnectyHub x UAZAPI
```

## Ambiente

Copie `.env.example` para `.env.local` e preencha conforme o ambiente.

Variaveis obrigatorias para o nucleo:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `CREDENTIAL_ENCRYPTION_KEY`

Variaveis importantes por modulo:

- `INNGEST_EVENT_KEY` e `INNGEST_SIGNING_KEY` para jobs
- `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`, `UAZAPI_WEBHOOK_SECRET` para WhatsApp
- `TRACKING_ALLOWED_ORIGINS` para liberar origens extras de tracking publico
- `TRACKING_PUBLIC_TOKEN_SECRET` para assinar atribuicao publica por organizacao
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` para push
- `R2_*` para storage
- `META_*`, `GOOGLE_*`, `GEMINI_*`, `ELEVENLABS_API_KEY` conforme integracoes ativas

## Banco

As migrations ficam em `supabase/migrations`. A base atual cria tabelas com RLS habilitado e politicas por perfil, organizacao ou admin de plataforma.

Antes de promover mudancas de schema:

1. Criar nova migration sequencial.
2. Validar RLS para tabelas novas.
3. Rodar `npm run build`.
4. Rodar fluxos afetados em ambiente de teste.

## API WhatsApp

A API publica e documentada por:

- `src/lib/connectyhub-api/openapi.generated.json`
- `docs/connectyhub-openapi-spec.yaml`
- `docs/connectyhub-uazapi-coverage.md`

Use `npm run api:audit` depois de mudar rotas `/api/v1/*` ou o proxy de provider. A auditoria deve continuar sem gaps inesperados.

## Seguranca

- Segredos persistidos passam por AES-256-GCM em `src/lib/security/credentials-crypto.ts`.
- Rotas admin devem passar por `requirePlatformAdmin`.
- Rotas de workspace devem carregar `getCurrentWorkspace` e validar role/organizacao antes de usar `createServiceClient`.
- Tracking e Push anonimos gravam em escopo de plataforma por padrao. Para atribuir a uma organizacao, use sessao autorizada ou token assinado com `TRACKING_PUBLIC_TOKEN_SECRET`.
- Nao rode `npm audit fix --force` sem revisar o plano, porque o npm pode sugerir downgrade quebrado do Next.

## Checklist Antes De Deploy

```bash
npm run lint
npm test
npx tsc --noEmit
npm run api:audit
npm run build
npm audit --omit=dev
```

O audit pode listar vulnerabilidades transitivas do pacote `next` enquanto nao houver versao upstream corrigida. Documente o resultado no release quando isso acontecer.
