# Piloto local de projetos gerenciados — 15/09/2026

## Entrega revisável

Implementação isolada na branch `codex/managed-projects`, base `9d864e13`. Prévia em `http://127.0.0.1:3026/infraestrutura`, enquanto o processo local estiver ativo. O seletor de identidade pertence exclusivamente ao servidor de ensaio Vite; não existe bypass equivalente no aplicativo Next.js. Os dados são fictícios e em memória. Reiniciar o processo apaga esses dados.

O projeto possui entrada própria `/infraestrutura`, hierarquia administrador de infraestrutura → empresas → projetos e áreas de banco, arquivos, acessos, logs, automações e limites. ConnectyHub, Betel e Vision são nomes de referência no piloto, sem cadastro ou migração de clientes reais. O administrador do produto não herda acesso global de infraestrutura.

As capturas são do navegador real, sem geração de imagens:

- [Banco](evidencias/managed-pilot-banco.png).
- [Execuções](evidencias/managed-pilot-runs.png).
- [Infraestrutura](evidencias/managed-pilot-infraestrutura.png).

O layout foi observado em desktop e viewport de 390 px. Na conferência móvel, a página não teve transbordamento horizontal; tabelas mantêm rolagem própria. O editor foi usado para inserir registro fictício. A navegação do Supabase Cloud foi inspecionada autenticada; o Inngest Cloud apresentou falha de carregamento/hidratação, portanto seu inventário visual completo continua pendente. Não há comparação pixel a pixel nem paridade funcional integral.

## O que funciona no piloto

| Recurso | Implementação e limite |
|---|---|
| Autorização | RLS real da migration 0150 em PGlite; membro precisa continuar vinculado à organização. Infraestrutura exige concessão explícita. Adaptador Next reutiliza `auth.getUser`; login real em Supabase de ensaio ainda falta. |
| Registros | CRUD de coleções JSON, com organização derivada no servidor, limite por registro e quantidade. Não equivale a schemas SQL arbitrários ou SQL Editor. |
| Arquivos | Upload/download/exclusão privados, bytes reais e quota serializada. Até 1 MB por arquivo em bytea; é implementação de piloto, não adaptador final de object storage. |
| Automação | Enfileiramento idempotente, lease, concorrência por projeto, resultado/logs/uso registrados uma vez. Somente `diagnostic.ping`, sem efeitos externos. Lease vencida fica incerta; não repete automaticamente. |
| Worker | Processo Node separado, chave restrita ao projeto. Gateway privado chama apenas RPCs permitidas, com chave de serviço exclusiva do gateway. Modelo para executar na VPS, sem polling na Vercel. Docker ainda não ensaiado nesta máquina. |
| Projetos de API existentes | Vínculo opcional de AI/voz com FK composta da mesma organização; sem mudar proprietário, carteira, tarifa ou recriar voz. Não é migração desses recursos. |
| Métricas | Duas amostras reais coletadas em leitura da VPS, arquivos de evidência separados. UI identifica amostra antiga e intervalo inválido; nenhum coletor contínuo foi instalado. |
| Cobrança | Registro de unidades do piloto. Nenhum débito, preço ou consumo de provedor gerado. |

## QA e recuperação

Em 15/09 às 02:13 BRT, passaram novamente **22 testes em quatro arquivos**: isolamento, quotas, permissões, revogação de vínculo, fila/lease, métricas, sessão e recuperação. As **20 verificações HTTP** passaram contra os endpoints reais carregados pelo servidor local, com contexto de autenticação fictício e migration SQL real. O worker foi executado em outro processo.

O ensaio de recuperação exportou o diretório do banco PGlite e abriu uma **segunda instância**, recuperando bytes dos arquivos, job pendente, papéis e restrição de leitura entre clientes. Isso não comprova backup externo da VPS nem recuperação de toda a ConnectyHub.

O processo real do gateway passou teste adicional com PostgREST simulado: credencial ausente negada, claim/finish imediato aceitos, chave do worker enviada ao banco somente como hash, ações arbitrárias negadas, limite de frequência e rota inexistente. A limitação anterior de 50 ms foi substituída por janela com rajada, para permitir finalização imediata.

Build inicial compilou e passou TypeScript, mas falhou na coleta do sitemap legado, que exige Supabase configurado. Foi preparado um executor de build com catálogo vazio servido em loopback e chaves fictícias, sem copiar `.env.local`. Resultado final desse executor deve constar no complemento abaixo. Seu artefato **não pode ser publicado**, pois contém configuração fictícia.

## Pendências reais e sequência

1. Validar Next + autenticação/PostgREST de Supabase de ensaio, além da atual injeção de contexto no piloto; ensaiar Docker e rotação/revogação de chaves.
2. Implementar adaptador privado de objetos e recuperação correspondente; definir namespace por projeto sem filtrar permissões apenas no navegador.
3. Mapear apps/functions/runs do Inngest instalado e comprovar escopo, resultados e idempotência. A fila de diagnóstico atual não substitui a operação Inngest existente. A licença SSPL da versão instalada requer avaliação para oferta gerenciada; não foi copiado seu código para o piloto.
4. Completar histórico de métricas, latência, histerese/silêncio dos alertas, retenção, carga e quotas operacionais. Amostra de RAM livre não comprova capacidade comercial.
5. Ensaiar backup privado fora da VPS, RPO/RTO e recuperação conjunta de banco, objetos, configuração e filas.
6. Só então preparar migrações reais; Betel por último, Vision com inventário próprio. Nenhum desses cortes está autorizado ou executado neste piloto.

## Reprodução local

Na raiz deste worktree:

```powershell
node node_modules/vite/bin/vite.js --config scripts/managed-projects/vite.config.ts
node scripts/managed-projects/smoke.mjs
node scripts/managed-projects/gateway-smoke.mjs
node node_modules/vitest/vitest.mjs run tests/managed-projects-isolation.test.ts tests/managed-metrics.test.ts tests/managed-recovery.test.ts tests/managed-session.test.ts
node scripts/managed-projects/build-isolated.mjs
```

Produção permanece desabilitada por padrão (`MANAGED_PROJECTS_ENABLED`), sem migration aplicada. Para abandonar o piloto basta encerrar seus processos; não há dados de produção a reverter. O exemplo Compose é material de implantação futura, não uma instrução para iniciá-lo na VPS agora.

## Complemento final de validação — 02h18 BRT

Build isolado **concluído com exit 0**, incluindo TypeScript e geração de 112 páginas, usando exclusivamente catálogo fictício em loopback. ESLint dos módulos, rotas, testes, worker e scripts passou. O servidor Next compilado foi iniciado em loopback e conferido com o recurso desligado: API 404 e página exibindo indisponibilidade, sem portal. Em resposta HTML transmitida por streaming, o Next iniciou HTTP 200 antes de renderizar a página de não encontrado; isso não liberou dados nem UI. O ensaio verifica conteúdo negado e status 404 da API separadamente.

A saída desse build contém configuração local fictícia e não é material de publicação. Todos os ensaios desta etapa tiveram zero chamadas pagas e zero mutações de produção. O gateway interno foi corrigido e validado; o próximo desenvolvimento independente é o adaptador privado de objetos, mantendo o ensaio local antes de conectar infraestrutura real.
