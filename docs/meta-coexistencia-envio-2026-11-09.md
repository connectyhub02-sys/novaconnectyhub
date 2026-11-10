# Coexistência: preparação de envio — 09/11/2026

O titular solicitou preparar o envio oficial da Vision mantendo o Global e a IA
pausada. A definição da mensagem e o cadastro do pagamento ficaram para depois.
Não houve autorização de destinatário de teste nem envio de campanha nesta etapa.

## Publicação

Release `a9eb4bf6ce7a517f9959d50397c8b441ca2d869a`, slot a, baseada na produção
`fa4e3d9a6aea4c5e3168cdf17e7f468d997767e6`. Slot b anterior preservado.
Build e TypeScript concluídos; dez testes de coexistência, relay e banco passaram.
Smoke candidato e público validou versão, páginas/arquivos, acesso anônimo negado,
vínculo oficial, identidade do telefone e rejeição de payload inválido sem envio.
Inngest registrou novamente com sucesso. Nenhuma migration nova.

## Comportamento

`enable_sending` exige escopo `messages:send`, vínculo concluído, webhook pronto,
telefone verificado e Global conectado com a mesma identidade. Habilita apenas
o vínculo pertencente ao cliente/instância autenticados. O proxy permite texto,
modelo, áudio e confirmação de leitura exclusivamente no telefone vinculado,
com credencial válida. Caminhos arbitrários e envio anterior à habilitação são
negados. Tokens permanecem no servidor; controles de eventos históricos e ecos
continuam independentes da liberação de envio manual.

## Limites

Testes de envio foram simulados. Leitura real da Meta confirmou vínculo e telefone,
mas não comprova entrega de mensagem. A conta nova não tinha forma de pagamento
na verificação visual; o titular adiou seu cadastro para amanhã. O novo modelo
da campanha também foi adiado. Não criar ou ativar campanha automaticamente.
Antes do primeiro disparo: pagamento, modelo adequado aprovado, destinatário de
teste autorizado e confirmação de recebimento. A seleção da agenda não presume
autorização de marketing para todos os contatos.
