# Portal Betel: coleta do histórico retido — 15/09/2026

O login e a navegação autenticada funcionavam, mas o portal conservava uma coleta
antiga. O serviço agendado falhava com `SQLITE_CANTOPEN` ao consultar o contador
de recibos retidos. A leitura SQLite em `mode=ro` ainda podia precisar de arquivos
auxiliares do WAL/SHM na pasta protegida por `ProtectSystem=strict`.

A consulta agora lê uma captura consistente de DB e WAL, limitada a16MiB, em
arquivos temporários privados descartados ao terminar. Duas leituras iguais são
exigidas antes da consulta; mudanças concorrentes ou limite excedido fazem a
coleta falhar preservando o snapshot anterior. SQLite verifica integridade e a
identidade da caixa de entrada; somente a quantidade de recibos held é publicada.
Os bancos originais permanecem apenas em leitura. Não foi concedida escrita à
pasta de origem, alterada a unidade systemd ou reduzida sua proteção.

Três testes passaram: leitura de registros ainda no WAL e depois de checkpoint,
imutabilidade dos bytes da fonte, rejeição de captura instável e limite de bytes.
Diagnóstico registra apenas classe do erro, código SQLite/HTTP e localização no
código; não registra SQL, mensagens privadas, corpos ou credenciais.

Publicação atômica de `count-inbox.py` e `collect-betel.py`; serviço real terminou
com sucesso às23:55:10UTC. A correção não reinicia o aplicativo Betel nem o inbox,
não reprocessa eventos, não envia mensagens e não altera cobrança.

O ciclo automático seguinte também terminou com sucesso às23:56:15UTC.
Na sessão autenticada do titular, a página passou a mostrar coleta20:56:09BRT,
sem aviso de desatualização.
