# Betel: ativação operacional — 15/09/2026

A hospedagem e os dados já haviam sido migrados. Após autorização do titular, a operação normal foi habilitada às **20:29:45.762 UTC (17:29 BRT)**. Este registro substitui o estado global de HOLD da etapa anterior; trabalhos históricos incertos continuam retidos individualmente.

## Publicação e execução

- Aplicação: `betel.connectyhub.com.br`; Supabase dedicado: `betel-supabase.connectyhub.com.br`. A ConnectyHub principal permanece na Vercel.
- Imagem app `74cbb6994a3316796989689c2e10ee39cd75ca787ede7466d86981957a701df7`, bundle SHA256 `e853d2ee1d51dc5f2e92bc20333b944efd70e9fe18267706a990e180c658e0b3`.
- Broker exclusivo ativo, 12 funções e UUIDs preservados, registro novamente fechado. Novos webhooks assinados chegam ao handler nativo; não há replay dos oito recibos históricos retidos.
- Pausas de automações, entrega de análises e scraper desativadas; fornecedor WhatsApp liberado. Corte de elegibilidade do app: `2026-09-15T19:25:50.000Z`; corte do broker: instante de ativação, recusando disparos antigos acumulados.
- Saída web pública IPv4 TCP80/443 permitida para provedores e coleta de links. Destinos privados, metadados, host e outros projetos continuam bloqueados. Verificação real de rede passou.
- Correção do executor publicada às 20:46 UTC: lote de links com zero tentativas adicionais; callback de produção com 310s para respeitar o limite de 300s do app, mantendo chamadas de controle em 30s. Registro retornou200 sem mudar outras aplicações ou os 12 UUIDs. Esse ajuste de broker não exigiu build do app. O inbox síncrono também recebeu 310s; o proxy desta rota não configura prazo menor, e o diagnóstico HTTPS foi repetido com sucesso às 20:51:24.

## Validação e limites

- 27 testes do broker passaram; oito testes do inbox passaram em Windows e Linux.
- Webhook HTTPS de diagnóstico: sucesso200, repetição bloqueada pelo ledger do app, assinatura inválida401, recibo antigo mantido202. Nenhuma mensagem comercial ou geração paga foi criada para esses testes.
- Portal publicado e navegação autenticada conferida: Betel exibe automações habilitadas e encaminhamento novo ativo. 40 verificações HTTP Betel e69 de regressão ConnectyHub passaram, incluindo isolamento por cliente, recusa de escrita e dados recentes.
- Agenda SDR e processamento de grupos retornaram `ok:true` em execuções naturais após20:34. A amostra de grupos processou/enviou zero itens; isso comprova execução da rotina, não entrega comercial.
- O cron legado de scraper permanece no-op por regra existente do produto. O caminho ativo é o lote de links importados. Meta tem zero remetentes e foi explicitamente deixada para outra etapa.
- Auditoria de histórico do WhatsApp às 20:45 UTC retornou `instance_not_found` (HTTP 404). Causa confirmada: três instâncias locais arquivadas ainda entravam na seleção. A instância atual Evelyn retornou 200/connected com a mesma chave. O app responsável preparou o filtro `status != archived`, com typecheck e teste de seleção aprovados; nenhum registro ou escopo de acesso foi alterado. A confirmação da publicação está no complemento abaixo. A próxima execução natural permanece necessária para comprovar o resultado integral.
- Outros fluxos dependentes de horário/evento/fornecedor ainda precisam de testes reais específicos. Cadastro de função e teste simulado não comprovam todos os cenários comerciais.

## Incidente de publicação resolvido

A recriação do container do app deixou Auth/REST/Storage/Gateway existentes parados entre 20:29 e 20:34 UTC. O banco não foi recriado e não houve OOM. Os quatro serviços foram retomados e a saúde da API voltou a200; novo diagnóstico HTTPS passou às 20:34:46. Falhas transitórias desse intervalo permanecem no histórico.

Após cada publicação do app, executar `services/betel-runtime/resume-dependencies.py` na VPS e verificar API/Auth além da página de login. O script valida a identidade deste ambiente, exige banco já ativo e retoma somente os quatro containers conhecidos. Não usar a disponibilidade do HTML como prova de saúde do banco.

Uma coleta do portal falhou durante o fechamento; duas execuções subsequentes do serviço e a bateria HTTP passaram com dados recentes. A falha preservou o snapshot anterior. A causa específica não foi confirmada; recorrência deve ser investigada.

## Recuperação

O dump final `final-20260915T194845Z` foi restaurado, validado e copiado para o computador privado fora da VPS. A configuração operacional inclui compose, segredos privados, código do broker, ingress e seus recibos/ledger, com cópia externa e SHA verificado no arquivo de evidência. Segredos e conteúdo dos eventos não são versionados.

Essa cópia externa é local, não um serviço de backup remoto recorrente. A restauração do banco usou roles existentes no mesmo cluster, não demonstra reconstrução de um servidor vazio. Cloud anterior preservado e callbacks antigos 503; nenhum cancelamento ou exclusão executado nesta etapa.

[Evidências sanitizadas](evidencias/betel-operational-activation-2026-09-15.json). [Etapa anterior de hospedagem e dados](betel-migracao-vps-2026-09-15.md).

## Resposta app ao erro404 do historico — pacote pronto20:50Z

Comprovado GETstatus usando mesma chave Betel: instancia atual ae7fe8da-9151-47f2-983c-8486fd0aedf6 respondeu200connected;3instancias locais archived responderam404. Causa: activeInstances excluia deleted mas nao archived. Corrigido filtro `.neq("status", "archived")`; registros/chave/escopos preservados. TSC e teste de selecao passaram. Publicar novo bundle `C:/Users/conne/.codex/private/betel-migration-catalog/app-source-2026-09-15T20-50-00-125Z/betel-app-source.tar.gz`, SHA256 `0e0412d5021e2af16f0c89d46a168fd39c597b6ef06c02e35585f567ee6d6e8d`,1433377bytes379files. Contrato e manifest indicam READY. Manter todasflagsativas e guard de retomada dos irmaosSupabase no deploy. Nenhuma alteracao de escopo do cliente nem mensagem real.

## Correção do histórico publicada — 20:57:34 UTC

Imagem `a3111e663c398e31e6eb971579360c393168baf29c5a33739af010118512d452`, fonte SHA256 `0e0412d5021e2af16f0c89d46a168fd39c597b6ef06c02e35585f567ee6d6e8d`. Exclui as três instâncias arquivadas da sincronização de histórico. A leitura de mensagens da instância atual retornou200 antes da publicação, com a mesma chave e sem importar/enviar mensagens. O build passou; após publicar, login200, Auth200 e seis containers ativos. O guard de dependências foi executado, sem recriar banco nem alterar os cortes operacionais.

Às20:57:56, novo webhook diagnóstico passou, repetição foi impedida e assinatura inválida retornou401. Ainda é necessário observar a execução natural completa do histórico após este ajuste. Nenhuma campanha artificial foi iniciada.
