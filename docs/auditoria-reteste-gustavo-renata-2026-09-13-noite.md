# Auditoria do reteste noturno — Gustavo e Renata

## Alcance e resultado

Leitura autorizada no WhatsApp pessoal do titular, nas duas conversas, até o início visível do histórico atual. Gustavo: 21:44–22:34 BRT de 13/09/2026; Renata: 21:44–22:29. Não havia mensagens anteriores a esse teste carregadas antes da primeira saudação nas duas conversas. O WhatsApp também informa limite de histórico no dispositivo; isto não comprova exclusão nem inexistência de conversas antigas. A auditoria anterior permanece em `auditoria-conversas-gustavo-renata-2026-09-13.md` no checkout principal, e não substitui a inspeção deste reteste.

Os textos, citações, ordem, horários, fotos com legendas e botões foram conferidos no WhatsApp pessoal. Os áudios foram complementados pelas transcrições armazenadas; não houve escuta independente de sua reprodução. Banco consultado apenas para leitura, com escopo das conversas correspondentes: Gustavo 48 mensagens (16 recebidas, 32 enviadas), Renata 43 (12 recebidas, 31 enviadas, incluindo uma mensagem humana externa). Nenhuma mensagem, cobrança, reserva, alteração de contato ou configuração foi criada para testar.

**Ambos os atendimentos reprovam o reteste.** Execução técnica concluída não equivale a venda ou agendamento concluído. Não foi encontrada evidência de conflito de navegador. Houve uma seleção de conversa sem efeito pelo índice de acessibilidade; a linha visível foi selecionada e o cabeçalho de Gustavo confirmado antes da leitura.

## Gustavo

| Período | Evidência recebida | Avaliação |
|---|---|---|
| 21:44–21:46 | Saudação, áudio do titular e cinco respostas em áudio | Transcrições registram indicação de anabolizantes para objetivo corporal. Essa recomendação personalizada é inadequada; a correção não deve facilitar compra ou automedicação. |
| 22:02–22:10 | Identificação, preferência citada, recomendações e kit de dois produtos | O agente faz promessas de resultado e transforma seu próprio conselho em proposta comercial. |
| 22:13–22:15 | Endereço recebido, subtotal de R$ 584,98, escolha de pagamento e solicitação de dados | O texto primeiro cogita frete grátis acima de R$ 800, corrige-se, mas não informa cotação final. A regra consultada para SC está ativa: tarifa R$ 70 e gratuidade a partir de R$ 800. |
| 22:19–22:25 | Cartão, documento, citação da prévia, e-mail e autorização de fechamento | Apesar dos dados e da referência explícita, o atendimento pede os produtos novamente. |
| 22:32–22:34 | Nova citação da mesma prévia, resposta “Tudo confirmado”, frete grátis e “sim” | Nenhum botão de pagamento foi recebido; o agente volta a pedir produtos e quantidades. |

Os 32 envios registrados estão `sent`. Não há pedido para o lead atual nem link de saída de pagamento. Portanto, não há evidência de um botão pronto que simplesmente falhou no transporte.

O nome de um item na prévia recebeu o sufixo de marca que não existe em seu título cadastrado. O comparador de linhas exige todos os termos pedidos no título/SKU/código, e uma linha não resolvida invalida o conjunto. Essa proteção evita cobrar item adivinhado, mas o fluxo não oferece uma recuperação clara e permite que o texto do modelo volte a chamar a prévia de confirmada. A seleção por citação também não é usada por todos os caminhos determinísticos. Não se deve afrouxar a correspondência para aceitar marca ou versão inexistente.

Limite material: auditoria e correções genéricas de integridade podem usar catálogo fictício comum; não será otimizado o fechamento da venda de anabolizantes observada. Recomendações médicas indevidas e afirmações sem ação devem ser contidas. A classificação dessas substâncias consta da [lista de controle especial da Anvisa](https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/controlados/lista-substancias); esta auditoria de software não substitui análise regulatória da operação.

## Renata

| Período | Evidência recebida | Avaliação |
|---|---|---|
| 21:44–22:03 | Interesse em moradia, identificação e pergunta sobre finalidade | A mensagem “Oi” de 22:02 consta como humana externa; não foi atribuída ao agente. |
| 22:03–22:09 | “Morar” seguido de resposta cerca de cinco minutos depois | Log registra retomada após atendimento humano (`lead_unanswered_after_handoff`), não erro de geração pendente. |
| 22:10–22:12 | Duas ofertas; titular cita Ipiranga de R$ 850 mil pedindo fotos | O texto responde Ipiranga, mas a foto e o botão apontam para Pioneiros de R$ 420 mil. |
| 22:17–22:22 | Duas novas ofertas; titular cita Vila Ipiranga de R$ 950 mil | O texto responde Vila Ipiranga, mas a foto e o botão apontam para Vilas Boas/TV Morena de R$ 850 mil. |
| 22:26–22:29 | Interesse, pedido de terça às 15h e complemento “na próxima terça” | O agente promete checar e confirmar, mas a execução termina sem reserva ou solicitação registrada. |

Os dois botões reais têm rótulo “Ver detalhes e fotos”, sem URL crua no texto visível. Seus destinos registrados correspondem aos imóveis errados das respectivas fotos; não foram clicados nesta auditoria. O registro já continha um clique em cada link. Dos 32 registros de entrega, 30 estão `sent` e dois stickers estão `uncertain`; não há evidência de que esses stickers expliquem fotos trocadas ou ausência de reserva.

Causas encontradas no código publicado:

- O texto entregue ao modelo pode incluir a mensagem citada, mas a seleção de anexos reconstrói a intenção só com texto recebido; ao não encontrar título, busca a última menção no histórico, selecionando a segunda oferta.
- `agendaRequest` não reconhece “na próxima terça” como continuação. A primeira mensagem com data/hora foi suplantada pelo complemento mais recente; a execução final não entrou na interpretação de agenda. Não há `customer_agenda_turns`, reserva ou solicitação para a tentativa atual.
- A proteção contra promessas sem ação não reconhece “deixa eu só checar” / “já te confirmo”. O texto contradiz a própria instrução de não prometer retorno futuro.
- A agenda está habilitada e possui um recurso com atendimento de segunda a sexta, 09h–18h. Os imóveis consultados não têm recurso vinculado e a empresa não definiu calendário padrão. Isso exige resposta factual/encaminhamento, sem inventar vínculo ou configurar a empresa durante a correção. Mesmo corrigindo a interpretação, não se deve anunciar uma reserva sem configuração e gravação válidas.

## Publicado, local e tempo de execução

P0 estava publicado às 21:27:48 BRT (`c4010b1`); entrega regional às 22:05:10 (`96bfae2`); horários às 22:32:21 (`cd9f5b5`). Os erros deste reteste ocorreram depois da publicação de P0. Não são explicados apenas por “ainda falta publicar”. Vercel foi conferido com commit e estado Ready/Production. Alimentação permanece trabalho local incompleto, preservado e fora do pacote prioritário.

A demora do trabalho incluiu testes, builds e publicações das etapas do plano amplo, enquanto os testes locais de P0 não cobriam estas formas reais de citação, nomes acrescentados pelo modelo e continuação de data. Avançar para extensões antes de obter este reteste deixou lacunas de prioridade. O plano foi corrigido: interromper extensões, reproduzir os casos, corrigir a execução e validar/publicar pacote isolado. Aguardar o restante do plano não é pré-requisito.

Nos logs, as respostas comuns levam dezenas de segundos e são divididas em várias mensagens com intervalos. O atraso específico de cinco minutos da Renata possui causa registrada de retomada após intervenção humana. Não se atribui todo tempo percebido a uma única causa nem se altera temporização configurada sem necessidade demonstrada.

## Correção prioritária em andamento

1. Referência de mensagem citada validada contra histórico da mesma conversa antes de escolher imóvel, foto ou link; ambiguidade deve gerar esclarecimento.
2. Continuidade de agenda em mensagens sucessivas, preservando dia/hora e distinguindo pergunta, aceite, mudança e negação; sem promessa de consulta pendente quando execução já terminou.
3. Integridade de catálogo/seleção, resposta factual sobre dados não resolvidos e frete calculado, sem transformar prosa em pedido ou cobrança. Proteção para não recomendar nem automatizar compra dos medicamentos observados.
4. Regressões locais com dados fictícios, TypeScript, lint e build. Publicação somente do pacote validado, seguida de confirmação da versão. Teste real permanece com o titular.

Este documento registra a auditoria antes da correção. Não declara os atendimentos operacionais nem o pacote já publicado.

## Pacote prioritário validado

Implementado na cópia isolada `codex/reteste-prioritario`, a partir de `cd9f5b5`:

- Fotos e botões usam a citação encontrada no histórico da mesma conversa. Citação ausente/ambígua pede identificação e não envia anexos. Títulos sobrepostos, como Ipiranga/Vila Ipiranga, não viram dois imóveis. Contradição anterior entre legenda de foto e texto exige nova escolha explícita antes de agenda.
- A agenda recebe o conjunto atual de mensagens recebidas e ainda não respondidas, preservando a hora antes do complemento de dia. Continuações temporais entram na interpretação. Negação e pergunta não se tornam aceite. Promessas “deixa eu checar”/“já te confirmo” são substituídas pelo resultado factual quando nenhuma ação ocorreu.
- Prévias geradas pelo modelo são conferidas novamente contra o catálogo e a cotação determinística. Nome/versão inexistente não é aceito como marca equivalente nem produz coleta de dados, confirmação ou cobrança. Proposta válida conserva quantidades e passa por frete/endereço e nova confirmação, com memória estruturada.
- O atendimento contém recomendação e fechamento automático dos anabolizantes identificados. Produtos comuns explicitamente escolhidos em catálogo misto continuam separados dessa restrição. Não é uma auditoria regulatória completa da plataforma.

Validação final: 101 testes direcionados aprovados. A suíte completa final executou 2.653 casos: 2.652 passaram e um teste SQL de automação apresentou falha durante execução concorrente. O arquivo desse teste foi reexecutado isoladamente: 10/10 aprovados, sem alterar código SQL/financeiro. Na rodada geral anterior, esse caso havia passado; a única falha era uma asserção textual que exigia o seletor antigo, retirada por estar coberta pelos testes funcionais de saída. Nenhuma falha permanece reproduzida, mas o resultado da rodada concorrente está registrado, sem atribuir causa não demonstrada.

Build final Next/webpack aprovado, compilação em 34,3s, TypeScript em 23,2s e 100 páginas geradas. ESLint sem erros. Testes e HTTP de saída exclusivamente simulados; nenhuma mensagem, pedido, cobrança ou reserva real de teste. Sem migration ou alteração de configuração de empresa neste pacote. Publicação ainda deve ser confirmada pelo commit e estado Ready/Production.
