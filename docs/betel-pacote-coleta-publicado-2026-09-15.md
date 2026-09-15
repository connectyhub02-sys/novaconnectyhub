# Betel: pacote de coleta publicado — 15/09/2026

Publicado às **22:28:18.950 UTC (19:28 BRT)**, após autorização do titular transmitida pela coordenação e liberação final pela tarefa responsável pelo app.

- Fonte: SHA256 `fe1c942ef17b94da4dcfc02a9e9eeb669354f17036b0ddf8a817ece813af88db`, 390 arquivos, 1.452.043 bytes no arquivo recebido.
- Imagem em produção: `sha256:0dbbd8c92eab0414b077c67e0d08d0064d8635f9ccef6810a23f1b86e4838f1f`.
- Imagem anterior preservada: `sha256:a3111e663c398e31e6eb971579360c393168baf29c5a33739af010118512d452`.
- O pacote anterior `03c6b0e4` foi compilado, mas **não publicado**, pois a tarefa do app encontrou e corrigiu uma incompatibilidade adicional no parser Chaves antes da promoção.

## Escopo recebido e validação

O pacote divide o lote em etapas por link e usa atualização condicional para reivindicar linhas ainda não iniciadas. Não exige migration ou RPC nova. Inclui seleção sequencial Gecko → Bright Data → Apify, bloqueio das duas últimas sem prova gratuita válida, retirada do grounding Google automático desse caminho, parser de valores/quartos/vagas e formatos oficiais da Chaves, e apresentação de três referências com venda e aluguel na composição autorizada. Versões anteriores contendo somente três aluguéis não ficam elegíveis por essa mudança.

A tarefa Betel reportou TypeScript, lint focado e 15 suítes offline aprovadas; após o último ajuste, repetiu TypeScript, lint e fixtures da Chaves. A compilação independente na VPS passou, incluindo TypeScript e geração de páginas. Esse conjunto não comprova qualidade comercial de uma próxima coleta real.

## Conferência após a promoção

Aplicação pública `/login`, Supabase Auth, leitura REST de esquema e Storage retornaram HTTP200. O guard `resume-dependencies.py` foi executado e não precisou retomar serviços: Auth/REST/Storage/Gateway continuaram disponíveis. Identidade e início dos bancos/motor foram preservados; o broker e seu corte operacional não mudaram.

O Inngest manteve as mesmas **12 funções Betel e 45 ConnectyHub**, com definições e UUIDs iguais antes/depois. Não houve novo registro do ensaio removido. A instância WhatsApp atual foi consultada por GET às22:28:39 UTC: HTTP200, `connected:true`, `loggedIn:true`, saúde `ok`. Nenhuma mensagem foi enviada nessa verificação.

## Controle de franquias ativado

As duas provas auditadas foram inseridas no ambiente efetivo do container e no arquivo de configuração usado em próximas publicações. O vínculo SHA256 com cada credencial, conteúdo das provas e prazo foram conferidos antes/depois da promoção. Credenciais e provas privadas não estão no Git.

Validade: até **16/09/2026 às22:06:13 UTC (19:06 BRT)**. Após esse horário, o app deve recusar Bright Data/Apify até nova verificação e renovação da prova. Não basta mudar a data: plano, conta, ausência de excedentes e vínculo da credencial precisam continuar válidos. Nenhuma recarga, upgrade, assinatura ou automação de renovação foi criada. [Evidências das contas e condições](betel-provedores-franquia-gratuita-2026-09-15.md).

## Recuperação e pendências

Configuração anterior preservada para reversão. Fonte publicada, compose, configuração privada, provas e evidências da promoção/saúde foram copiados fora da VPS em arquivo privado de **1.463.659 bytes**, SHA256 `3eeb07bd3408ab5607cec4519151be751363c5a29fa287578a2561476a56b404`. Esta cópia complementa o backup de banco anterior; não contém novo dump nem estabelece backup remoto recorrente.

O lote `89695f70-924c-44fe-b66a-64b5df147752` **não foi reprocessado**. Seus dois resultados parciais, três falhas e custos persistidos continuam sendo o resultado daquele teste, não uma validação desta nova versão. Nenhuma coleta paga, envio WhatsApp ou nova geração de IA foi feita para publicar. Próximos testes comerciais e conciliação da operação IA ainda incerta permanecem separados e devem respeitar idempotência e autorização.
