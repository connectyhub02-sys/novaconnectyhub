# Custos compartilhados e acompanhamento financeiro — 14/09/2026

## Decisão comercial

O titular autorizou usar o custo aproximado do fornecedor com multiplicador 4,
corrigir prospectivamente as tarifas antigas abaixo desse patamar e acompanhar
as operações no Financeiro existente. Não houve autorização para novas gerações
pagas nesta etapa. A configuração reproduzível está em
[voice-shared-costs-2026-09-14.json](voice-shared-costs-2026-09-14.json).

Na tabela API autenticada da conta Creator em
[ElevenLabs](https://elevenlabs.io/app/subscription/api), foram conferidos
USD 0,10 por mil caracteres de Multilingual v2 e USD 0,05 de Flash/Turbo.
São preços de referência da tabela, não custos efetivos conciliados com fatura.
O câmbio interno adotado é R$ 6/USD; o crédito nominal vale R$ 0,01.

| Uso | Custo estimado por caráter | Preço anterior (cr/caráter) | Preço corrigido (cr/caráter) | Mínimo preservado |
|---|---:|---:|---:|---:|
| Multilingual v2 API/Estúdio | R$ 0,0006 | 0,008 | 0,24 | 5 cr |
| Flash v2.5 agente | R$ 0,0003 | 0,006 | 0,12 | 5 cr |
| Multilingual v2 agente | R$ 0,0006 | 0,24 | 0,24 (sem alteração) | 50 cr |

O custo antigo v2 API era 12 vezes menor que esta referência e o Flash agente
era 10 vezes menor. O preço v2 API não deve copiar arbitrariamente uma margem
antiga: o novo valor resulta de `custo BRL × 4 / 0,01`.
O mínimo pode elevar a proporção em operações curtas.

## Base única e histórico

O centro de custo ElevenLabs existente é preservado. A tarifa API v2 aponta
para a base de custo do mesmo modelo usado pelos agentes, por
`metadata.provider_cost_source_rate_id`. O resolvedor confere centro, modelo,
unidade, vigência e ausência de encadeamento. A referência compartilha somente
o custo do fornecedor; preço comercial, plano e mínimo continuam separados.

O Financeiro mostra a base vinculada e impede que a edição da tarifa dependente
sobrescreva esse custo. Também impede desativar a base enquanto há dependentes
ativos. Não foram criados centros paralelos nem somados custos de atendimento
ou orquestração ao custo de áudio.

As duas correções criam novas versões de tarifa e encerram a vigência das antigas.
Recibos, snapshots reservados, débitos e estornos anteriores são preservados.
As tarifas Gemini 3.1/2.5 e o provisionamento de dicionário ativados anteriormente
permanecem. Dicionário continua com custo **provisionado**, não aferido por fatura.

## Margem ilustrativa, não lucro líquido

Por mil caracteres, antes de mínimos:

| Modelo | Custo estimado | Receita nominal | Margem nominal antes de despesas | Receita no pacote de 60 mil cr/R$ 497 |
|---|---:|---:|---:|---:|
| Multilingual v2 | R$ 0,60 | R$ 2,40 | R$ 1,80 (75%) | R$ 1,988 |
| Flash v2.5 | R$ 0,30 | R$ 1,20 | R$ 0,90 (75%) | R$ 0,994 |

Os pacotes ativos consultados foram R$ 30/3.000 cr, R$ 97/10.500 cr,
R$ 247/28.000 cr e R$ 497/60.000 cr. A quantidade já inclui o benefício
comercial; não aplicar novamente o percentual de bônus.
Créditos de plano, gratuitos e contratos específicos não têm receita individual
atribuída ao uso no ledger atual.

Somente como cenário, descontando 6% de tributos, 4% de pagamento e R$ 0,05 de
infraestrutura por mil caracteres, sobrariam R$ 1,51 no v2 e R$ 0,73 no Flash
com crédito nominal. No maior pacote, seriam R$ 1,1392 e R$ 0,5446.
Esses percentuais e o rateio de infraestrutura **não são despesas efetivas
verificadas**, nem demonstrativo contábil. Acompanhar custo efetivo, volume,
bonificações e despesas antes de afirmar lucro líquido ou oferecer descontos.

## Financeiro existente

`/admin/financeiro`, seção “Operações de IA e voz”, consulta eventos reais de
Gemini/ElevenLabs, recibos de voz/API de IA e movimentos vinculados da carteira.
Há período de 1/7/30 dias, filtro por fornecedor, origem e texto, agrupamento
por modelo, fornecedor, recurso, cliente ou origem e paginação visual.

- Custo histórico, receita nominal de débitos menos estornos e margem antes das
  despesas; custos ausentes, zerados e margens negativas ficam sinalizados.
- Tokens de entrada/saída/cache, caracteres, minutos e operações permanecem em
  suas unidades; custo por mil usa a mesma unidade, sem somar modalidades.
- Reservas pendentes ficam separadas de custo liquidado. Liberação de reserva
  não é estorno. Quando a cotação inicial não existe no recibo, não é inferida.
- Identificação de tarifa/base e câmbio vêm do snapshot; ausência é informada,
  sem aplicar retroativamente o câmbio ou preço atual.
- Atualização usa o refresh de 15 segundos existente, enquanto visível, e o
  horário de conclusão da consulta no servidor. Não cria um segundo monitor.

A consulta tem limite de 2.000 eventos e 200 recibos pendentes de cada família,
com indicação de recorte parcial. Não é um balanço integral de todas as datas.
O servidor exige administrador da plataforma antes da consulta privilegiada.
Não são enviados ao componente prompts, chaves, arquivos ou respostas privadas.

## Evidência e limites desta etapa

A consulta ao banco real carregou 237 operações, sem truncamento, com 228
movimentos vinculados e nenhuma reserva pendente no recorte observado.
A interface local exibiu totais, filtro v2 (7 operações) e layout de celular
sem rolagem horizontal da página. Isso valida leitura e apresentação, não um
novo teste pago de geração. A rota temporária de prévia foi removida antes do build.

Testes direcionados cobrem custo compartilhado, preservação de snapshots,
isolamento, carteira/idempotência e projeção financeira. A ativação comercial
deve ser conferida após o deploy do resolvedor; não basta a presença deste documento.
O total conservador de testes pagos anteriores permanece US$ 0,959893 do teto US$ 1.
