# Estúdio de Voz e Áudio — custos e ativação

Leitura em 14/09/2026. Documento interno de implementação, não tabela comercial publicada. Nenhuma tarifa foi alterada ou chamada de geração realizada nesta conferência.

## Evidência disponível

A consulta autenticada de metadados confirmou plano Creator ativo, cobrança mensal em USD e extensão de franquia desabilitada. Isso não comprova elegibilidade nem preço contratual de cada modalidade. A página pública atualmente mostra preços por modalidade; não substitui fatura e tabela aplicável à conta. O custo efetivo de uma execução continua dependendo da conciliação com o fornecedor.

A economia registrada no projeto usa crédito nominal de R$0,01, câmbio de planejamento R$6/US$ e multiplicador 4 sobre custo para determinadas tarifas de IA. Esses valores não são cotação de hoje nem margem líquida. VPS, armazenamento, transferência, impostos, taxas e chamadas incertas absorvidas precisam entrar na apuração; não foram medidos por modalidade.

## Tarifas já existentes, preservadas

Leitura do cadastro ativo: TTS multilíngue avulso possui 0,008 crédito/caractere e mínimo 5, com custo estimado cadastrado de R$0,00005/caractere. Clonagem possui tarifa explícita zero por requisição. Voice changer também apresenta um cadastro zero/requisição, insuficiente para ativar processamento por duração: não reutilizar esse provisório.

Gemini 3.1 Flash TTS tem cadastros distintos: `text_to_speech` por caractere (0,002 crédito, mínimo 2) e `voice_generation_audio` por tokens (0,0024 entrada, 0,048 saída, mínimo 1). O segundo usa custos R$0,000006/entrada e R$0,00012/saída. Confirmar a política do Estúdio antes de escolher uma dessas bases; nunca somar os dois esquemas à mesma operação. Transcrição Gemini também tem tarifas por tokens para modelos específicos; isso não habilita automaticamente a transcrição de outro fornecedor.

## Base aprovada para novos recursos — não ativada

Em 14/09/2026, o titular aprovou na tarefa de origem a base R$6/US$, multiplicador 4, crédito nominal R$0,01 e mínimo 5 créditos para operações novas, condicionada à confirmação dos custos efetivos antes de ativar. Preservar tarifas atuais. A autorização não inclui compra de planos nem orçamento irrestrito para testes pagos. Não repetir a pergunta sobre esta base; informar divergências materiais de custo e decisões concretas restantes.

A coluna de referência usa preços públicos consultados. A proposta aplica `USD × 6 × 4 / 0,01`; mínimo sugerido de 5 créditos por operação nova e arredondamento final em seis casas. Duração sugerida: medir o arquivo no servidor, arredondar segundos uma vez, converter para minutos. Não arredondar cada etapa como nova cobrança. Tarifas existentes acima não são substituídas por esta proposta.

| Recurso | Referência pública em USD | Proposta de créditos | Condição de ativação |
|---|---|---|---|
| Transcrição Scribe v2 | 0,22/hora | 8,8/minuto | Confirmar tarifa da conta e acesso; resultado privado |
| Limpeza/isolamento | 0,12/minuto | 288/minuto | Confirmar custo da conta, duração e limite de upload |
| Troca de voz | 0,12/minuto | 288/minuto | Substituir provisório somente após decisão; validar posse da voz |
| Diálogo v3 | Referência TTS v3: 0,10/1.000 caracteres | 240/1.000 caracteres | Confirmar equivalência de cobrança do endpoint de diálogo |
| Dublagem v1 | 0,33/minuto | 792/minuto por destino | Confirmar acesso, linguagem e eventual multiplicador |
| Dublagem v2 | 2,20/minuto | 5.280/minuto por destino | Não selecionar automaticamente; custo e acesso específicos |
| Alinhamento | Documentação indica mesmo preço de STT | Provisoriamente 8,8/minuto | Confirmar modelo/base efetiva; exportação do resultado sem novo débito |
| Desenho de voz | Não confirmado | Pendente | Separar custo da prévia, quantidade de prévias e salvamento |
| Dicionários | Não confirmado | Pendente | Edição não será anunciada gratuita sem comprovação; versões privadas |
| Gemini TTS | US$1/milhão entrada e US$20/milhão áudio de saída | Cadastro por tokens existente acima | Selecionar política única; usar somente catálogo Gemini |

Fontes: [tabela pública de voz](https://elevenlabs.io/pricing/api), [alinhamento](https://elevenlabs.io/docs/overview/capabilities/forced-alignment), [Gemini TTS](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-tts-preview), [metadados de assinatura](https://elevenlabs.io/docs/api-reference/user/subscription/get). Valores públicos são referências, não confirmação de custo efetivo desta conta.

## Pontos que impedem ativação comercial, não desenvolvimento

Marco técnico de 14/09: adaptadores internos para transcrição, isolamento, troca de voz e alinhamento preparados em `src/lib/voice-api/audio-provider.ts`. Upload binário limitado a 20 MB, destino fixo do fornecedor, resposta limitada, sem redirect ou repetição automática; isolamento adicional não é ativado implicitamente na troca de voz. Seis testes isolados, lint, TypeScript e build aprovados. Nenhuma rota pública usa esses adaptadores: ainda faltam arquivos privados, aferição de duração, reserva/liquidação adequada e conciliação. Isso não comprova entrega comercial nem preço/acesso das quatro modalidades e não habilita geração.

- Confirmar preço aplicável por modalidade e custos de prévia/salvamento/desenho/dicionários. A referência pública atual diverge do custo antigo cadastrado de TTS; não corrigir silenciosamente nem chamar essa diferença de lucro comprovado.
- Confirmar tabela efetiva por modalidade e escolher uma única base Gemini. A fórmula e o mínimo de novas operações já foram aprovados; não há autorização para dupla cobrança nem para alterar tarifas atuais. O orçamento de testes pagos continua pendente e deve ser definido por modalidade depois do preço.
- Implementar arquivos privados e limites na VPS, jobs/recibos, reserva/liquidação única, recuperação e isolamento. Gemini não pode reutilizar diretamente o helper WhatsApp com repetição automática/R2 como se fosse o transporte privado idempotente do Estúdio.
- Todos os planos podem receber acesso ao produto, inclusive Free, preservando carteira e franquia de cada plano; acesso não significa créditos ilimitados.


## Segundo marco técnico — transportes restantes

Adaptadores internos locais adicionados para diálogo v3 (2.000 caracteres totais/10 vozes), desenho com texto explícito e salvamento separado da prévia, dicionários privados por versão e dublagem de áudio v1 para um idioma de destino. Sem URLs externas de entrada, compartilhamento de dicionário ou repetição automática de POST. Não inclui edição Enterprise de dublagem nem migração automática para v2.

Gemini possui transporte separado com vozes nativas do catálogo atual, resposta PCM limitada convertida em WAV e uso de tokens preservado. Consumo ausente fica pendente de conciliação; não vira geração gratuita. Não chama o helper WhatsApp que repete tentativas e publica em R2.18 testes isolados de contratos/transportes passaram; integração com operações, arquivos privados, tarifação e interface ainda pendente. Nenhuma geração externa ou tarifa ativada.

Contratos conferidos na documentação oficial e no SDK instalado: [diálogo](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert), [desenho](https://elevenlabs.io/docs/api-reference/text-to-voice/design), [salvamento](https://elevenlabs.io/docs/api-reference/text-to-voice/create), [dicionários](https://elevenlabs.io/docs/api-reference/pronunciation-dictionaries/create-from-rules), [dublagem v1](https://elevenlabs.io/docs/api-reference/legacy/dubbing/create), [voz Gemini](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

## Validação integrada — 14/09,20h BRT (substitui pendências técnicas anteriores)

Código local agora integra arquivos, jobs, cotações, reserva/liquidação, histórico,
resultados privados, SRT/VTT, dicionários e interface. Desenho de voz usa os caracteres
do texto explícito de prévia; salvamento é outra operação. Não reutiliza a tarifa
provisória zero/requisição de troca de voz. Modelos sem custo confirmado permanecem
bloqueados; não confundir sucesso do transporte com liberação comercial.

Titular autorizou atéUS$1 agregado para testes sintéticos reais, sem plano novo nem
habilitação de excedentes. Até esta conferência: Gemini3.1 gerou WAV e informou17
tokens de entrada/166 de saída (referênciaUS$0,003337). ElevenLabs respondeu200 para
transcrição, isolamento, troca de voz, alinhamento, diálogo, desenho e salvamento de
voz, dublagem e download. Voz fictícia salva no teste foi removida com200. Cinco
audios passaram na decodificação integral FFmpeg; transcrição/alinhamento geraram
SRT e VTT válidos. Não foram usados arquivos pessoais ou clones de clientes.

ConservadoramenteUS$0,650437 contabilizados: quando falta custo individual,
a reserva máxima permanece contada. Valores de créditos do fornecedor foram
valorizados conservadoramente e não representam fatura. A assinatura consultada
segueCreator, mensalUSD, com extensão desabilitada. Dicionário recebeu401 por falta
de `pronunciation_dictionaries_write`; acesso ao painel correto foi solicitado para
ajuste mínimo da chave existente. Nenhuma chave foi substituída ou exposta.

Tarifas atuais de TTS/clonagem preservadas. Gemini3.1 usa somente a base existente
`voice_generation_audio` entrada/saída, validada na tabela oficial; não somar tarifa
por caractere. A confirmação da tabela efetiva ElevenLabs permanece necessária
para as novas ativações, mesmo após sucesso dos testes de transporte.

## Fechamento do teste publicado — 14/09, 20:32 BRT

Gemini 3.1 foi ativado com as duas tarifas já existentes, sem alteração de preço.
O percurso real painel → Inngest VPS → Gemini → storage privado → carteira passou
em produção `47c58ab5`. Consumo informado: 16 tokens de entrada e 172 de saída;
referência de custo US$ 0,003456 / R$ 0,020736; débito único 8,2944 créditos.
A reserva máxima de 393,9696 foi liquidada e zerada. Repetição recuperou o mesmo
recibo, sem outra geração ou débito. WAV validado em hash, decodificação e player.
Resultado sintético removido, mantendo recibo/cobrança; arquivo local de evidência
continua privado. O teste exigiu sincronizar as duas funções novas no Inngest.

Total agregado conservador atualizado: **US$ 0,653893**, incluindo todos os testes
anteriores e os tetos ainda mantidos onde o fornecedor não informou custo individual.
Não é valor de fatura nem custo médio comercial comprovado. Saldo do limite
autorizado: US$ 0,346107; nenhuma nova rodada está programada.

As nove novas operações ElevenLabs continuam desabilitadas comercialmente até
confirmar a tabela efetiva da conta. Dicionários também precisam da permissão
`pronunciation_dictionaries_write`. O titular já autorizou a configuração mínima;
aguardamos login na conta que possui a chave, não nova aprovação genérica.
Gemini 2.5 permanece sem tarifa habilitada. Geração TTS e clonagem anteriores
permanecem com suas configurações preservadas.

## Conta efetiva e cadastro preparado — 14/09, 21:32 BRT

A conta Creator dona da chave foi conferida pelo titular no navegador. Acesso
mínimo de escrita de dicionários aplicado; reteste200 sem custo individual informado,
zero variação de crédito observada. Total conservadorUS$0,673893; não presumir que
dicionários são sempre gratuitos. Essa modalidade permanece bloqueada comercialmente.

Tarifas novas preparadas, com modelos ainda desabilitados até publicação/teste:

| Operação | Custo referênciaUSD | CréditosCH | Mínimo |
|---|---:|---:|---:|
| Transcrição / alinhamento | 0,22/h | 8,8/min |5|
| Limpeza / troca de voz | 0,12/min |288/min|5|
| Diálogo / desenho | 0,10/1000caracteres |0,24/caractere|5|
| Salvar desenho |0 por salvar, usa slot|0 + mínimo|5|
| Dublagemv1 sem marca |0,50/min|1200/min|5|

Fórmula autorizadaUSD×6×4/0,01; unidade por segundo arredondado para cima na duração
já aferida. Fonte de preços: página autenticada https://elevenlabs.io/app/subscription/api,
colunaCreator. [Alinhamento](https://elevenlabs.io/docs/overview/capabilities/forced-alignment)
usa preçoSTT. [Desenho](https://elevenlabs.io/docs/eleven-creative/voices/voice-design)
cobra uma vez o texto das três prévias e salvar usa slot. [Contrato daAPI](https://elevenlabs.io/docs/api-reference/text-to-voice/design)
define padrão eleven_multilingual_ttv_v2; transporte agora o explicita.
[Dublagem](https://elevenlabs.io/docs/api-reference/legacy/dubbing/create) sem marca
explicitada para corresponder ao preço; não usar valor da modalidade com marca.
Tarifas antigas deTTS, clonagem, WhatsApp eGemini foram preservadas.
