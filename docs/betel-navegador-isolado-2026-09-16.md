# Betel: navegador próprio isolado — 16/09/2026

## Resultado

Camada publicada às 14:38:55 UTC (11:38 BRT), fonte
`9a9ac303d756bc0cd573ab79066dbe144836faab09f3bc7ee4e871589c7380e1`, 418 arquivos.

| Artefato | Imagem |
|---|---|
| App `betel-production:20260916-p` | `22be73326732fb8b9298ca43c410933ae8ea7299b72b146830dcd01f744a0d65` |
| Worker `betel-browser-worker:20260916-p` | `74fd0f34c26ec870501dd9974dc062441d35ff495db488fb3d1cd79e6070f402` |

Build Linux e TypeScript passaram. A tarefa responsável pelo código relatou
dez suítes offline e lint/tipos aprovados. App, Auth, REST, Storage e health do
worker responderam 200 após a publicação. Definições das 12 funções Betel e
45 ConnectyHub preservadas; banco, motor e broker não reiniciados. Imagem o
mantida para reversão. Nenhuma migration ou novo plano pago.

A primeira passagem de publicação detectou ausência da variável URL do worker
no ambiente e reverteu o app à imagem o. O script de implantação foi corrigido;
a publicação final confirmou URL/token no backend. Não foi necessário novo
build. O teste final partiu do ambiente efetivo do app: health 200 e requisição
autenticada com URL privada recusada com 400/unsafe_url.

## Coleta única autorizada

Às 14:35:42 UTC, uma requisição ao worker tentou somente
`https://www.machadoleiloeiro.com.br/item/14921/detalhes?page=1`.

- O worker respondeu, mas a origem retornou **403**, título **Just a moment...**,
  diagnóstico **challenge**, `ok:false`.
- Recebidos 6.242 caracteres de HTML de desafio e nenhum texto do imóvel.
  O URL final manteve o item 14921 e acrescentou parâmetro de challenge.
- 2,905 s de tempo total, 2,73 s de CPU, pico de memória 193,59 MiB de 1 GiB;
  duas conexões e 131.689 bytes recebidos. Sem OOM; oito PIDs antes e depois.
- Sem importação, análise de IA, Gecko, mensagem, retry, solver ou execução
  Apify nesse teste. Não se executou a cadeia completa de fallback em produção.

**Machado 14921 continua bloqueado.** Instalação, sandbox e limites funcionaram;
não há captura útil que valide título, fotos, documentos ou valores do imóvel.
Não inferir bloqueio permanente nem atribuir a causa exclusivamente ao IP.

O código diferencia challenge, vazio, redirecionamento para outro lote e falha
de transporte antes de encaminhar conteúdo à IA. A camada de busca de
comparáveis com Gecko não foi substituída. O actor Apify Playwright incompatível
é recusado localmente; a configuração está no actor anterior
`apify/website-content-crawler`, cuja recuperação para Machado também não foi
comprovada. Provas FREE permanecem até 22:06:13 UTC, sem renovação automática.

## Isolamento verificado

Worker independente da imagem Next.js, sem credenciais de banco/IA nem cookies
do navegador do titular. Nonroot, sandbox Chromium ativo, capabilities removidas,
no-new-privileges, filesystem somente leitura e temporários limitados. Limites:
1 CPU, 1 GiB sem swap adicional, 256 PIDs, shm privado 256 MiB, concorrência um,
job 40 s, navegação 25 s, corpo 8 KiB/5 s, HTML 2 MiB, resposta 10 MiB e rede
20 MiB. Saída HTTPS por gateway local que resolve e fixa IPv4 público; sem
serviço externo de proxy, solver ou rotação.

Sandbox validado primeiro com `about:blank` e `network=none`. O perfil seccomp
oficial precisou permitir `chroot` no namespace interno com capabilities
removidas; não houve SYS_ADMIN, unconfined nem alteração global do host.

Rede separada sem porta publicada. Regras permitem somente app → worker:3001,
respostas estabelecidas e saída HTTPS pública. Testes reais de rede negaram
acesso iniciado pelo worker ao banco, host, IP público do host e metadados.
Token ausente recebeu 401; URLs loopback, metadados e HTTP foram recusadas com
400. Acesso app → health retornou 200. Firewall e worker ativos/habilitados;
systemd inicia o worker depois da política e limita reinícios em falha.

Definições sem segredos em [services/betel-browser-worker](../services/betel-browser-worker/README.md).
Não desligar o stack compartilhado para operar esse componente.

## Evidências e limites

Arquivos privados sob `/opt/betel-isolated-rehearsal/audit`, com cópias no
computador do titular em `.codex/private/betel-migration-catalog`:

- `browser-package-p-build.json` e `package-p-publication.json`;
- `browser-sandbox-smoke.json`, `browser-seccomp-adjustment.json`;
- `browser-worker-start.json`, `browser-worker-preflight.json`;
- `browser-machado14921-single-attempt.json`, `browser-machado14921-result.json`
  e `browser-machado14921-dataset.json`;
- `browser-publication-finalcheck.json`.

O teste mínimo não é teste de carga nem prova de todos os sites. Nenhuma
garantia de coleta integral ou custo congelado: CPU, disco, rede e manutenção
continuam consumindo a capacidade contratada da VPS.

A tarefa Betel confirmou QA autenticada após p em `/admin/scraper`: lote
histórico `7a286fd7` com seis links, dois em revisão e quatro falhas, sem novo
lote/resultado. Nenhuma ação de iniciar, repetir, limpar, aprovar ou enviar.
O guard offline rejeitou o HTML real de challenge, inclusive simulando status
200; o verificador de campos recusou o 403 antes de tratar dados inexistentes
como imóvel. Evidência no projeto Betel:
`docs/acompanhamento-lote-7a286fd7/browser-machado14921-qa.json`.
