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
