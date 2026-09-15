# Caixa de recepção temporária da Betel

Escopo exclusivo da migração Betel. Usa o segredo HMAC já existente no endpoint
Betel; não usa chaves de outras organizações. `POST /api/webhooks/connectyhub`
retorna 202 apenas após SQLite WAL com `synchronous=FULL` confirmar o registro.
Guarda bytes originais e cabeçalhos mínimos, em diretório privado independente
do banco que será copiado. Não executa IA, mensagens ou encaminhamento.

Mesmo identificador e corpo devolvem o recibo anterior; corpo divergente retorna
409 para conciliação. Sem ID do webhook, usa hash dos bytes. Limites: 2 MiB por
requisição, 10.000 eventos ou 128 MiB de corpos. Ao atingir o limite, responde 507;
isso requer intervenção, não significa descarte seguro na origem. Não apaga
eventos automaticamente. O banco completo e seus arquivos WAL devem ser
copiados usando a API SQLite de backup, nunca copiando somente o arquivo ativo.

Eventos permanecem `held`. Não existe autodrain: o receptor Betel atual não garante
reexecução sem duplicar custos antes da deduplicação da mensagem. Uma resposta
perdida exige conciliação; `200` do receptor, isoladamente, também não comprova
sucesso de negócio. Não liberar tráfego definitivo sem um procedimento de
entrega e reconciliação verificado. Isso protege a janela de manutenção,
não corrige falhas históricas anteriores à chegada à caixa.

`python -m unittest discover -s services/betel-webhook-inbox -p 'test_*.py' -v`
testa duplicação, conflito, autenticação, quota e morte do processo antes do
insert, antes do commit e após commit antes do ACK. Fixtures sem dados pessoais.
`install.py` recebe segredo somente via stdin, instala unidade própria pausada
em loopback28112 e recusa instalação existente. Caddy/origem são passos separados.

## Encaminhamento operacional de novos webhooks

`forward_new=true` habilita o destino fixo `http://172.21.0.2:28103/api/webhooks/connectyhub`. A validação HMAC ocorre antes de qualquer encaminhamento. Identidades já presentes na caixa histórica continuam retornando seu recibo HOLD; não há replay nem dreno automático. Fixtures novas `migration.test.*` são recusadas.

Novos eventos usam o ledger/idempotência do aplicativo Betel. O transporte preserva os bytes e a assinatura, recusa redirecionamentos e propaga o status JSON do handler. Falha/timeout retorna 502, sem declarar entrega concluída. A deduplicação de tentativas novas pertence ao handler; esta caixa não promete processamento exatamente uma vez. O gate temporal e a conciliação das filas devem estar publicados antes da ativação.

O serviço recebe apenas a permissão de destino `172.21.0.2/32` na sua restrição de rede; não ganha acesso geral à rede dos demais projetos. Oito testes cobrem persistência/restart, conflito, capacidade, autenticação e encaminhamento de novas identidades sem liberar as históricas.

Encaminhamento do handler síncrono:310s, alinhado ao app; falha continua sem ACK falso. O proxy Caddy desta rota não configura um timeout menor.
