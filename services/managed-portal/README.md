# Portal de infraestrutura (homologação)

Aplicação Next independente, com adaptadores próprios de sessão e rotas selecionadas do módulo `managed-projects`. Não publicar este diretório como a aplicação principal. Não reutilizar as credenciais do Supabase de produção.

Estado publicado, evidências e limitações: [relatório de 15/09/2026](../../docs/portal-persistente-gerenciado-2026-09-15.md).

## Build

Use uma cópia de trabalho Linux com Node 22 contendo este diretório, os módulos compartilhados `src/lib/managed-projects`, `src/components/managed-projects`, rotas managed-projects/managed-infrastructure e os serviços managed-objects/managed-worker. A raiz de tracing é a raiz dessa cópia. Copie o `package.json` e `package-lock.json` deste diretório para a raiz **somente dessa cópia de build**, execute `npm ci --no-audit --no-fund` e `node node_modules/next/dist/bin/next build services/managed-portal`.

Depois use `docker build -f services/managed-portal/runtime/Dockerfile -t connectyhub-managed-portal:homolog-20260915 .` na raiz dessa cópia. A tag é histórica; para uma nova publicação prefira outra tag e confira a imagem efetiva no Compose antes de ativar. Compilações devem manter limites de CPU/memória para não disputar o host com os serviços existentes.

## Runtime e verificações

`runtime/storage.py`, `bootstrap.py` e `install-units.py` são scripts administrativos da instalação inicial em `/opt/connectyhub-managed-portal`. Conferem marcadores de propriedade e não são ferramentas genéricas para instalações arbitrárias. Não executar bootstrap contra banco existente ou contra outra raiz. O bootstrap depende dos arquivos de migrations 0150–0153 e da base exclusiva descrita no próprio script.

`compose.yml` depende dos segredos privados já provisionados; não versionar `.env`, diretório `secrets`, dumps ou dados. A origem pública HTTPS é configurada explicitamente para validar mutações atrás do proxy. Signup público está desabilitado e o admin deste portal é explícito no banco independente.

`verify.mjs` cria empresas e usuários de QA e recebe a credencial administrativa por stdin. Não rodá-lo com credenciais de produção. `verify-persistence.mjs` recebe por stdin o registro privado de QA criado pelo ensaio, sem imprimir senhas. `verify-backup.py` restaura o último backup em container temporário sem rede e remove apenas o container identificado pelo próprio ensaio.

`backup.py` pausa o portal para exportar banco e arquivos de forma consistente. O timer roda diariamente às 05:30 UTC; a cópia externa e a retenção ainda exigem operação manual. Não apagar uma cópia local antes de verificar outra recuperável fora da VPS. A restauração de teste é independente do banco ativo.

As métricas são coletadas por `telemetry.py` a cada minuto e enviadas ao receptor interno. O worker `diagnostic-fleet.mjs` processa somente diagnóstico e até 50 projetos ativos: não é o runtime Inngest. Integração real de outros sistemas e importação de bancos completos são etapas posteriores.
