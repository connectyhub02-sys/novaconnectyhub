# Centro de custo e créditos — auditoria de 02/10/2026

Verificação de código e migrations, **sem leitura do banco de produção** (a
consulta de leitura foi bloqueada pelo controle de permissões desta sessão) e
sem nenhuma alteração. Preços abaixo vêm das migrations e dos registros de
14/09; podem ter sido editados depois pelo painel Financeiro. Os exemplos por
mensagem usam tamanhos **ilustrativos**, não medidos.

## Como a cobrança funciona hoje

1. Cada chamada de IA gera um `usage_events` por `meterUsageEvent`
   (`src/lib/billing/metered-usage.ts`).
2. A tarifa é escolhida por `resolveActiveBillingRates`: centro de custo do
   fornecedor → recurso (`feature_code`) → modelo → plano da organização
   pagadora. Ganha a linha mais específica por unidade.
3. Valor = Σ unidades × preço; aplica o mínimo do recurso. Tarifa ausente →
   consumo pendente e a operação falha (não sai grátis).
4. `debit_credit_wallet` debita a carteira do contrato (compartilhada), atualiza
   o ciclo, cria `credit_transactions` e é idempotente por evento.
5. Regra de preço registrada: custo em USD × R$ 6 × 4 ÷ R$ 0,01 por crédito.
   Receita "estimada" = créditos × R$ 0,01; margem = receita − custo da tabela.

Modelo atual dos agentes: `gemini-3.6-flash` (`src/lib/gemini/models.ts`).
Tarifas de texto copiadas da API pela 0127: custo R$ 0,0000045 / R$ 0,0000225
por token de entrada/saída; preço 0,0018 / 0,009 crédito (4x). Em 01/01/2027
entra a versão já cadastrada com o dobro do preço do fornecedor.

## O que é cobrado numa conversa WhatsApp

| Etapa | Recurso | Quando acontece | Mínimo |
|---|---|---|---|
| Resposta do agente (inclui rodadas de ferramentas de pedido somadas) | `chat_completion` | toda mensagem respondida | 1 cr |
| Reparo de resposta sobre mídia | `chat_completion` | quando a resposta ignora a mídia | 1 cr |
| Aviso "estou ouvindo/vendo" | `chat_completion` | mídia recebida, se ativo | 1 cr |
| Áudio recebido → transcrição | `audio_transcription` + taxa de mídia 2 cr | cada áudio | 2 cr |
| Imagem / vídeo / documento | `media_*_analysis` + taxa 2 / 8 / 4 cr | cada mídia | 3 / 10 / 5 cr |
| Qualificação do lead | `lead_analysis` | cada mensagem, se o roteiro estiver ativo | 1 cr |
| Detecção de pedido de humano | `human_handoff_detection` | se a detecção por IA estiver ativa | 1 cr |
| Citação inteligente | `conversation_state` | mensagens agrupadas | 1 cr |
| Memórias (aprendizado, lead, clone, arco, negociação) | 5 recursos | a cada 3 mensagens recebidas ou 20 min | 1 cr cada |
| Nota de qualidade (Turing) | `conversation_state` | se métricas de qualidade ativas | 1 cr |
| Resposta em áudio ElevenLabs | `voice_reply_whatsapp` | resposta por voz | 50 cr (v2) / 5 (Flash) |
| Resposta em áudio Gemini | `voice_generation_audio` | resposta por voz | 1 cr |
| Follow-up, status, campanhas, prompt, importações | recursos próprios | quando executados | 1–10 cr |

Organização `internal` → `internal_shadow` (registra custo, não debita).
Trial → `trial_billable` (debita créditos de cortesia).

### Exemplo ilustrativo (tamanhos supostos)

| Situação | Custo estimado | Cobrado | Relação |
|---|---:|---:|---:|
| Resposta de texto: 8.000 tokens de entrada, 300 de saída | R$ 0,043 | 17,1 cr = R$ 0,171 | 4x |
| + qualificação (3.000 / 150) | R$ 0,017 | 6,8 cr | 4x |
| + memórias a cada 3 mensagens (5 × 2.000 / 200) | ≈ R$ 0,023 por mensagem | ≈ 9 cr | 4x |
| Áudio recebido de 30 s | R$ 0,008 (se cobrado como texto) | ≈ 5 cr | 6x; cai se áudio custar mais que texto |
| Resposta em voz v2 com 200 caracteres | R$ 0,12 | 50 cr = R$ 0,50 | 4,2x |

O maior custo é o tamanho do prompt (instruções + catálogo + histórico),
repetido a cada mensagem. Isso precisa ser medido no banco.

## Achados

### Cobertura (o que está bem)

- Todas as 16 chamadas ao Gemini do atendimento (`agent-runtime.ts`) e as dos
  módulos de follow-up, agenda, loja, status, campanhas, prompt, importação e
  tráfego registram consumo.
- Raciocínio (thinking) e entrada de ferramentas entram como tokens cobrados.
- Débito idempotente; falha de débito fica pendente e é reconciliada.
- Resposta principal só é enviada depois do débito.

### Vazamentos de custo (gasto sem cobrança)

1. Rodadas de ferramentas que falham no meio perdem o uso das rodadas anteriores.
2. Geração acontece antes do registro; se o processo cair entre os dois, o custo
   não é registrado (não há diário de despacho fora da API e do Estúdio).
3. Caminhos com `.catch(() => null)` (ex.: citação inteligente) descartam falha
   de registro depois da geração.
4. Trial e cortesia consomem custo real sem receita.
5. `internal_shadow` (agentes da própria plataforma) é custo sem receita.
6. Custos fixos sem rateio: VPS, assinatura ElevenLabs (paga mesmo sem uso; sem
   excedente habilitado, o áudio para quando a franquia acaba), UAZAPI por
   instância, R2, e-mail, taxas de gateway e impostos.

### Medição imprecisa ("centro de custo obscuro")

1. **Receita não é caixa.** `connecty_revenue_estimate` = crédito × R$ 0,01.
   Pacotes vendem mais barato (R$ 0,0083 a 0,01/cr), planos incluem créditos e
   trial/bônus são grátis. A margem do painel fica superestimada.
2. **Custo não é fatura.** O custo vem da tabela (R$ 6/US$), sem conciliação
   com o Google Cloud nem com a ElevenLabs. O desconto de cache implícito do
   Gemini não aparece, e o áudio/vídeo de entrada é cobrado com o preço de
   texto do mesmo modelo — conferir na tabela oficial se a modalidade custa mais.
3. Não há um demonstrativo mensal: caixa recebido, créditos vendidos ×
   consumidos, passivo de créditos em carteira, custo real e margem por
   cliente/recurso.
4. Estúdio debita fora da função central (ver
   [paridade do Estúdio](auditoria-paridade-elevenlabs-estudio-2026-10-02.md)).

### Justiça com o cliente

- Mesmo markup (4x) em todos os recursos de texto; mínimos pequenos (1 cr).
- O cliente paga recursos invisíveis (memórias, qualificação, detecção) sem
  saber; Minha conta agrupa quase tudo em "Atendimento IA".
- Tokens em cache são cobrados cheios do cliente.
- Preço por áudio em voz v2 no WhatsApp tem mínimo de 50 cr (R$ 0,50), alto
  para áudios curtos; Estúdio usa mínimo de 5 com o mesmo preço por caractere.

## Números reais do histórico (leitura autorizada, 02/10/2026)

Leitura somente de agregados de `usage_events`, `credit_transactions`,
`billing_invoices`, carteiras, planos e pacotes, de julho a 02/10/2026 (8.611
eventos). Custo da tabela convertido para US$ pela taxa de cadastro (R$ 6) e
reconvertido a **R$ 5,23** (cotação de 02/10). Receita a R$ 0,01 por crédito.

| Modo | Tokens entrada | Tokens saída | Créditos | Custo US$ | Custo R$ hoje | Receita R$ | Lucro R$ | Multiplicador |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Clientes (cobrados) | 24.205.709 | 2.173.308* | 73.280,65 | 26,42 | 138,16 | 732,81 | 594,65 | 5,3x |
| Trial (sem receita) | 1.542.976 | 156.331* | 5.321,11 | 1,97 | 10,32 | — | −10,32 | — |
| Interno ConnectyHub | 755.149 | 156.470* | 4.392,71 | 1,38 | 7,20 | — | −7,20 | — |
| Respostas sem custo nem cobrança (01–10/09) | 3.867.098 | 20.877 | 0 | ≈ 2,98 | ≈ 15,58 | 0 | −15,58 | — |

\* Inclui caracteres de voz ElevenLabs registrados como saída.

Por crédito cobrado de cliente: custo ≈ R$ 0,0019, lucro bruto ≈ R$ 0,0081.
Gemini: 4,6x (4x × 6 / 5,23). ElevenLabs: 8,3x na tabela por causa do mínimo de
50 cr por áudio, mas o custo real é a assinatura mensal, maior que os US$ 5,5
da tabela — conferir fatura.

Por mês (clientes): agosto 11.961 cr / US$ 3,00; setembro 56.253 cr / US$ 21,36
(R$ 562,53 contra R$ 111,74, 5,0x); outubro até dia 2: 5.067 cr / US$ 2,05.

Maiores custos (clientes): resposta do agente 3.6 Flash (485 cobradas, média
≈ 21 mil tokens de entrada e ≈ 41 cr = R$ 0,41 por resposta; US$ 8,27); análise
de lead (US$ 4,40); voz ElevenLabs (US$ 4,21); API de IA (US$ 2,92); memórias e
estado (≈ US$ 3,9).

Vazamentos medidos: 245 respostas de 01 a 10/09 sem custo e sem cobrança
(corrigido pela 0127); 2 eventos de rotina de tráfego pendentes por tarifa
ausente em 27/09 (`whatsapp_traffic_routine_ai`); 5 de `whatsapp_growth_plan_ai`
zerados em agosto; 56 débitos que falharam por saldo em agosto (custo ≈ R$ 1,61).

Caixa: faturas pagas R$ 994 (2 × Scale); 5 faturas abertas somam R$ 12.185.
Créditos concedidos: 225 mil de planos Scale, 150 mil administrativos, 10 mil
de trial. Saldo em carteiras: 229.682 cr (≈ R$ 434 de custo futuro se usado).
A maior parte dos 73 mil créditos consumidos veio de créditos concedidos, não
de compra avulsa; "receita" a R$ 0,01 não é dinheiro recebido.

## Custos fixos informados e composição do prompt (02/10)

Titular: VPS US$ 20/mês (≈ R$ 105) e UAZAPI R$ 138/mês para 100 instâncias
(R$ 1,38 por instância). Plano Start (R$ 97, 3.000 cr): IA ≤ R$ 6,30 se todo o
saldo for usado + R$ 1,38 de instância + parcela da VPS, ElevenLabs e impostos.

Medição real com Gemini 3.6 Flash desde 11/09 (leitura de `usage_events`):

| Tarefa | Entrada média | Raciocínio médio | Cache |
|---|---:|---:|---:|
| Resposta do agente | 20.983 (p90 27.167) | 29 | 6,1% |
| Análise de lead | 3.036 | 577 | 0% |
| Memória do lead / do agente | 1.544 / 1.421 | 247 / 215 | 0% |
| Follow-up | 2.402 | 267 | 0% |

Tamanhos reais: regras globais ≈ 2 mil tokens; prompt do agente p50 ≈ 140 e
p90 ≈ 1,6 mil; histórico de até 80 mensagens com ~82 caracteres (≤ 2 mil
tokens); catálogo até 40 itens (≈ 3 mil). O restante (≈ 12–15 mil) é estimado
como regras de comércio, checkout, frete, comportamento e contexto,
montadas em `buildSystemInstruction`. Trechos que mudam a cada mensagem (nome
do lead, agenda, memória, emoção, completude, arco, negociação, carrinho)
ficam no meio do prompt e quebram o cache implícito do Gemini.

Alavancas sem tirar informação: reordenar para cache; raciocínio mínimo nas
tarefas de extração; juntar as cinco memórias numa chamada; enviar regras de
comércio só quando aplicáveis; resumo da conversa no lugar do histórico antigo.
Toda redução passa antes por avaliação com conversas reais e flag por agente.

## Plano de melhoria do centro de custo (revisado em 02/10, sem impostos)

Linha de base medida: custo por resposta R$ 0,14; 68,6 cr por resposta;
cache 6%; voz ElevenLabs perto do equilíbrio (assinatura US$ 22); fixos
VPS US$ 20 e UAZAPI R$ 138/100 instâncias. Nenhuma etapa altera cobrança
passada nem cria débito retroativo.

**Fase 1 — Números verdadeiros (não muda cobrança).**
1. Guardar o custo em US$ e a cotação usada em cada evento; cotação de
   referência atualizável no admin no lugar do R$ 6 fixo.
2. Custos fixos mensais no centro de custo (VPS, UAZAPI por instância,
   ElevenLabs com franquia) e rateio por cliente ativo.
3. Origem e preço real de cada lote de crédito (pacote, plano, contrato,
   administrativo, trial); consumo abate lotes em ordem para reconhecer receita.
4. Separar no registro: tokens em cache, raciocínio e modalidade (texto, áudio,
   imagem); caracteres da ElevenLabs contra a franquia.
5. Medir o tamanho de cada seção do prompt.
6. Painel Financeiro mensal: caixa, créditos vendidos/concedidos/consumidos,
   saldo a consumir, custo variável e fixo, margem por cliente, recurso e modelo;
   custo e créditos por resposta; uso da franquia de voz.

**Fase 2 — Fechar vazamentos.**
1. Tarifas para `whatsapp_traffic_routine_ai` e `whatsapp_growth_plan_ai`;
   alerta automático em todo `billing_rate_missing`.
2. Estúdio e API de Voz pelo débito central; consumo na organização executora;
   categorias corretas em Minha conta.
3. Uso parcial das ferramentas de pedido; registro antes de chamar o
   fornecedor; fim dos descartes silenciosos de falha de registro.

**Fase 3 — Reduzir custo por resposta, com qualidade protegida.**
O alvo são as regras montadas pela plataforma (prompt global e regras de
comportamento, comércio, checkout e frete, ≈ 14–17 mil tokens), não o prompt
escrito pelo cliente (p50 ≈ 140 tokens), que fica intacto. Histórico e
catálogo do cliente não são removidos: o histórico antigo passa a ir resumido.
Bateria de avaliação com conversas reais (32 perfis e benchmark de humanidade),
cada mudança atrás de flag por agente:
1. Prompt reordenado para cache (fixo antes, variável depois).
2. Raciocínio mínimo nas tarefas de extração e classificação.
3. Cinco memórias numa única chamada; qualificação por cadência.
4. Regras de comércio/checkout/frete só quando a conversa estiver nessa fase.
5. Resumo da conversa + mensagens recentes no lugar das 80 completas.

**Fase 4 — Preço justo.**
1. Tokens em cache cobrados com desconto.
2. Nova tabela a partir do custo medido, mantendo a margem-alvo sobre custo
   variável; meta de dobrar as respostas do plano Start.
3. Voz: custo pela franquia, mínimo revisto com volume, voz Gemini como opção.
4. Painel do cliente simples: saldo e "respostas restantes" estimadas, sem
   tokens, tabelas por milhão ou detalhe técnico. Os detalhes ficam só no admin.
   O aviso de créditos acabando já existe e é mantido.
5. Trial suficiente para um teste real: com o custo por resposta reduzido,
   dimensionar os créditos do teste em respostas (hoje 1.000 cr ≈ 15 respostas).

**Fase 5 — Conciliação contínua.** Comparar todo mês o custo estimado com as
faturas Google e ElevenLabs; alertas de margem abaixo do alvo e de 80% da
franquia de voz.

Decisões do titular pendentes: margem-alvo sobre custo variável; quanto da
economia repassar ao cliente; franquia mensal do plano ElevenLabs.
