# Estúdio de Voz e Áudio — custos e ativação

Leitura em 14/09/2026. Documento interno de implementação, não tabela comercial publicada. Nenhuma tarifa foi alterada ou chamada de geração realizada nesta conferência.

## Evidência disponível

A consulta autenticada de metadados confirmou plano Creator ativo, cobrança mensal em USD e extensão de franquia desabilitada. Isso não comprova elegibilidade nem preço contratual de cada modalidade. A página pública atualmente mostra preços por modalidade; não substitui fatura e tabela aplicável à conta. O custo efetivo de uma execução continua dependendo da conciliação com o fornecedor.

A economia registrada no projeto usa crédito nominal de R$0,01, câmbio de planejamento R$6/US$ e multiplicador 4 sobre custo para determinadas tarifas de IA. Esses valores não são cotação de hoje nem margem líquida. VPS, armazenamento, transferência, impostos, taxas e chamadas incertas absorvidas precisam entrar na apuração; não foram medidos por modalidade.

## Tarifas já existentes, preservadas

Leitura do cadastro ativo: TTS multilíngue avulso possui 0,008 crédito/caractere e mínimo 5, com custo estimado cadastrado de R$0,00005/caractere. Clonagem possui tarifa explícita zero por requisição. Voice changer também apresenta um cadastro zero/requisição, insuficiente para ativar processamento por duração: não reutilizar esse provisório.

Gemini 3.1 Flash TTS tem cadastros distintos: `text_to_speech` por caractere (0,002 crédito, mínimo 2) e `voice_generation_audio` por tokens (0,0024 entrada, 0,048 saída, mínimo 1). O segundo usa custos R$0,000006/entrada e R$0,00012/saída. Confirmar a política do Estúdio antes de escolher uma dessas bases; nunca somar os dois esquemas à mesma operação. Transcrição Gemini também tem tarifas por tokens para modelos específicos; isso não habilita automaticamente a transcrição de outro fornecedor.

## Proposta para novos recursos — não ativada

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

- Confirmar preço aplicável por modalidade e custos de prévia/salvamento/desenho/dicionários. A referência pública atual diverge do custo antigo cadastrado de TTS; não corrigir silenciosamente nem chamar essa diferença de lucro comprovado.
- Aprovar novas tarifas, mínimo e base Gemini. Não autoriza geração paga de teste; orçamento de teste deve ser definido por modalidade depois do preço.
- Implementar arquivos privados e limites na VPS, jobs/recibos, reserva/liquidação única, recuperação e isolamento. Gemini não pode reutilizar diretamente o helper WhatsApp com repetição automática/R2 como se fosse o transporte privado idempotente do Estúdio.
- Todos os planos podem receber acesso ao produto, inclusive Free, preservando carteira e franquia de cada plano; acesso não significa créditos ilimitados.
