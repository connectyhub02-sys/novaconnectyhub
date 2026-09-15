# Broker isolado da Betel — ensaio

Camada de acesso restrita a um projeto no Inngest existente. Não instala outro
motor e não transforma a chave global do servidor numa credencial de cliente.
O estágio atual só admite a função sintética `betel-ai-rehearsal-synthetic-analysis`,
com evento `betel/rehearsal.analysis.requested`, concorrência um e nenhuma cron.
Não é um gateway genérico nem comprovação de isolamento de todos os recursos
comerciais do Inngest.

## Contrato

- Chaves de evento e assinatura próprias para a Betel. A chave global permanece
  na credencial privada do processo de infraestrutura.
- Registro compara o manifesto completo calculado pelo SDK 4.6.0 com a cópia
  revisada no servidor. App, função, callback, idempotência e retries são fixos.
- Entrada de eventos aceita uma fixture UUID, cenário e espera de até 360 segundos.
  Limite de vinte fixtures por ensaio; entrega incerta não é reenviada automaticamente.
- Somente callback autenticado pelo motor associa run, função, fila e dispatch à
  fixture previamente submetida. O vínculo persiste em arquivo privado atômico.
- `actions`, `batch` e checkpoints assíncronos exigem o vínculo real. Checkpoint
  inicial/síncrono, realtime, GraphQL, cancelamento e replay são negados.
- Callback é re-assinado com a chave da Betel; a resposta assinada pelo SDK é
  validada como string literal e re-assinada para o motor. Não recanonicalizar
  strings de resposta. O hash de chave usa bytes hex; HMAC usa texto sem prefixo.
- Alvos HTTP são fixos e privados. Redirecionamentos, URLs arbitrárias, payloads
  grandes, envio de outros eventos e opcodes de invocação são negados.

## Execução e validação

`main.mjs` lê `BROKER_CONFIG` e `BROKER_LEDGER`. Configuração nunca pertence ao Git.
`live` e `allowRegistration` começam falsos. A implantação usa serviço systemd
com usuário dinâmico, filesystem protegido, limites de CPU/memória e filtro de
endereços. Listeners ficam apenas no loopback e nas duas interfaces privadas
aprovadas; o ambiente da Betel acessa o host da própria rede.

Execute `node --test services/managed-inngest-broker/broker.test.mjs services/managed-inngest-broker/http.test.mjs`.
Os testes cobrem assinatura, tradução de chave, persistência, repetição/entrega
incerta, manifesto, callback, vínculo de execução, checkpoint, SSRF e negações.
A paridade das primitivas foi comparada também ao SDK 4.6.0 instalado na Betel.
Testes simulados não substituem registro controlado, execução sintética real,
ensaio de reinício e conferência de ausência de efeitos externos.

O aplicativo de ensaio deve rodar na rede Docker interna, com guardas HTTP e sem
egresso. Chaves de provedores preservadas no banco não autorizam seu uso. Expansão
para os doze fluxos reais exige novo manifesto revisado, limites e testes; não
adicionar curingas para contornar uma recusa.

No ensaio de 15/09/2026, 18 testes Windows/Linux passaram. Registro controlado,
espera de 360 segundos com reinício, deduplicação e resultado funcional incerto
foram verificados no motor existente. As 45 funções anteriores permaneceram
iguais. Inscrição está novamente bloqueada; o modo live admite somente fixtures.
Preservar `x-inngest-sdk` e `x-inngest-sdk-handled` na resposta do handler: além da
assinatura, o motor verifica esses cabeçalhos. Mais detalhes e limites no
[relatório](../../docs/betel-ensaio-isolado-2026-09-15.md).

## Instância de produção separada

`production.mjs` e `betel-production-manifest.json` definem exatamente12 contratos
revisados da Betel. A unidade28111 tem chaves e ledger próprios; não substitui o
ensaio28110. Eventos são prefixados no motor e traduzidos somente após validar
recibo, função interna, assinatura e propriedade do run/checkpoint. Identidade
estável do evento é obrigatória; timeout permanece incerto sem reenvio automático.
`live=false` bloqueia execução mesmo com manifesto registrado; registro tem
controle separado, fechado após preparação. Não liberar os12 por um cutoff global:
as consultas dos handlers também precisam de elegibilidade dos registros antigos.

Limites atuais:100.000 eventos/runs no ledger,2.000 dispatches/run,120requests/min,
32steps/128KiB e sleeps até366dias. O ledger é um arquivo privado com fsync e
rename; não é uma solução de volume ilimitado. Monitorar tamanho e limites antes
de ampliar uso. Os26 testes cobrem o ensaio e esse contrato, sem comprovar geração,
pagamento ou envio real. Estado e restrições do corte:
[migração Betel](../../docs/betel-migracao-vps-2026-09-15.md).
