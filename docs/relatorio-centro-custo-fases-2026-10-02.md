# Centro de custo — relatório das cinco fases — 02/10/2026

Plano e diagnóstico de origem: [auditoria do centro de custo](auditoria-centro-custo-creditos-2026-10-02.md).
Tudo abaixo está publicado na VPS (`www.connectyhub.com.br`), com migrations
aplicadas e registradas. Impostos e taxas de pagamento ficaram fora por decisão
do titular. Nenhuma cobrança passada foi alterada e nenhum débito retroativo foi
criado.

## Publicações

| Fase | Commit | Migration | Slot ativado |
|---|---|---|---|
| 1. Números verdadeiros | `14e23c32` | 0179 | a |
| 2. Fechar vazamentos | `a6deddb5` | 0180 | b |
| 3. Custo por resposta | `81fdd67b` | 0181 | a |
| 4. Preço justo | `749937ee` | 0182 | b |
| 5. Conferência mensal | `0bcdd790` | 0183 | a (ativo) |

Cada migration teve ensaio com rollback no banco de produção antes da
aplicação. Backups das funções substituídas em `/opt/connectyhub/backups`
(`pre-0180-functions-*.sql`, `pre-0181-report.sql`, `pre-0183-report.sql`).
Retorno de aplicação: `release.sh activate b` (versão `749937ee`). Inngest
sincronizado após a Fase 5.

## Fase 1 — Números verdadeiros

**Admin > Financeiro > Resultado do mês** (navegação por mês, horário de Brasília):

- **Dinheiro recebido:** faturas pagas + pagamentos sem fatura − estornos.
- **Custo de IA:** em US$ e em R$ pela cotação editável (inicial R$ 5,23).
- **Custos fixos editáveis:** VPS US$ 20, UAZAPI R$ 138/100 instâncias, ElevenLabs US$ 22.
- **Resultado do mês:** recebido − IA − fixos.
- **Consumo cobrado:** créditos, custo, margem e multiplicador real contra a meta de 4x.
- **Por resposta do WhatsApp:** custo, preço, créditos e "1.000 créditos rendem N respostas".
- **Voz:** cobrado contra assinatura.
- **Créditos do mês por origem:** plano pago, compra, teste, admin, consumidos, expirados.
- **Saldo das carteiras:** com o custo futuro estimado.

Cada uso novo grava o custo em US$ e a cotação usada (`providerCostUsd`). Cada
resposta do agente grava o tamanho de cada parte do prompt (`promptSections`,
só contagem de caracteres). O texto do prompt não mudou nesta fase.

Setembro no formato novo:

| | |
|---|---|
| Recebido | R$ 12,98 (duas faturas Scale pagas a R$ 9,99) |
| IA | R$ 108,71 |
| Fixos | R$ 357,66 |
| Resultado | −R$ 453,39 |
| Consumo cobrado | 5,66x |
| Preço por resposta | R$ 0,89 (89 créditos), com custo de R$ 0,19 |

## Fase 2 — Vazamentos fechados

- Importador inteligente de catálogo e análise de tráfego por IA chamavam o
  Gemini sem tarifa: a operação gastava e falhava na cobrança. Agora usam a
  tarifa de geração de conteúdo (4x, mínimo 5 créditos).
- Estúdio de Voz e API de Voz: a lógica de débito foi mantida e envolvida. O
  consumo passa a ficar na empresa que usou (a carteira continua a do contrato)
  e o excedente do ciclo é registrado, como no débito central.
- Rodadas de ferramentas de pedido que falham no meio: o gasto vira **custo
  absorvido** (aparece no centro de custo, não debita o cliente, que ficou sem
  resposta).
- Uso sem tarifa aparece como alerta no painel.
- Minha conta agrupa Estúdio e clonagem como "Estudio de voz".

## Fase 3 — Custo por resposta, com qualidade protegida

**Problema de qualidade encontrado e corrigido.** Doze tarefas auxiliares do
atendimento estavam sem nível de raciocínio:
- memórias do lead e do agente, análise do lead, aprendizado;
- estado da conversa, detecção de pedido humano, citação inteligente;
- transcrição, leitura de mídia, aviso de mídia e benchmark de humanidade;
- mais follow-up, agenda, loja, conteúdos e importação de perfil.

No Gemini 3, o raciocínio padrão é alto e divide o limite de saída com a
resposta. O máximo de raciocínio batia no limite de cada tarefa: 673 de 700 nas
memórias, 193 de 200 no aprendizado, 116 de 120 na detecção. Respostas
cortadas, com saída de até 5 tokens:

| Tarefa | Cortadas |
|---|---|
| Aprendizado | 100 de 118 |
| Detecção de humano | 182 de 201 |
| Memória do lead | 81 de 167 |
| Análise do lead | 102 de 264 |

O benchmark de humanidade nunca registrou nenhuma nota. Agora todas usam
raciocínio baixo, como a resposta principal já usava. Resultado esperado:
memórias, qualificação e detecções voltam a funcionar, e o custo dessas tarefas
cai (o raciocínio é cobrado como saída, a unidade mais cara).

**Prompt organizado para cache.** Chave em Financeiro > Otimizações do agente:
- desligado, piloto (agentes marcados) ou todos;
- o texto é o mesmo, com as partes fixas primeiro e as que mudam a cada mensagem
  (memória, emoção, carrinho, agenda, negociação) no fim;
- o Google cobra a parte repetida a 10% do preço (US$ 0,075 contra US$ 0,75 por
  milhão no 3.6 Flash; o cache vale a partir de 4.096 tokens repetidos);
- **está desligada**;
- o relatório mensal compara, por ordem, o cache, os créditos por resposta e a
  nota de humanidade das mesmas execuções.

O prompt escrito pelo cliente não foi alterado.

## Fase 4 — Preço justo

- **Desconto do cache repassado:** a parte servida do cache é cobrada a 10%,
  tanto no custo quanto nos créditos, então os 4x continuam. Os tokens
  registrados continuam reais.
- **Cliente vê o saldo em linguagem simples:** "≈ N respostas" ao lado dos
  créditos no topo do painel e em Minha conta. Usa a média da própria empresa
  (30 dias, mínimo de 10 respostas) ou a média da plataforma. Sem tokens nem
  preço por milhão. O aviso de créditos acabando continua como estava.
- **Admin:** o painel mostra quantas respostas o teste grátis rende.

Médias reais de 30 dias:

| Empresa | Créditos por resposta |
|---|---|
| BuffaloMass | 106 |
| Imobiliária Renata Macedo | 55 |
| Pizzaria Macedo&Dias | 94 |
| Plataforma | 87 |

## Fase 5 — Conferência mensal

- **Faturas reais:** registro por mês e fornecedor (Gemini, ElevenLabs, UAZAPI,
  VPS). A tabela "Conferência com as faturas" mostra o estimado, a fatura, a
  diferença e o resultado do mês recalculado com as faturas.
- **Franquia ElevenLabs lida da conta:** só metadados, sem custo.
  - Plano Creator, **131.000 caracteres/mês**, sem excedente.
  - 7.609 usados em 02/10; renovação em 20/10.
  - Franquia gravada no custo fixo.
  - Com a franquia toda usada, a voz custa R$ 0,00088 por caractere, contra
    R$ 0,0024 cobrados (2,7x).
  - No uso atual, cerca de 24 mil caracteres por mês, a assinatura não se paga.
- **Conferência diária às 09:00 (Inngest):** gera alertas no Financeiro para:
  - multiplicador do mês abaixo da meta;
  - recurso com margem abaixo de 90% da meta;
  - uso sem tarifa;
  - franquia de voz em 80% ou 95%;
  - fatura do mês anterior com diferença acima de 15%.

  Não envia mensagens e não muda preços.

## Como funciona para cada lado

**Clientes:** não veem tokens. Veem o saldo e quanto ele rende em respostas.
Pagam 4x o custo de cada tarefa; a parte em cache sai mais barata;
falhas de ferramenta não são cobradas.

**ConnectyHub:** o Financeiro mostra o dinheiro que entrou, o custo real em
reais e dólares, os custos fixos, o resultado, o custo e o preço por resposta,
a franquia de voz, a comparação com as faturas e os alertas do dia.

## Roteiro de testes

1. **Financeiro (admin logado):** abrir Admin > Financeiro.
   - Conferir setembro (−R$ 453,39) e outubro.
   - Alterar e salvar a cotação; conferir a mudança no custo em R$.
   - Conferir a franquia da voz lida da conta (Creator, ~131 mil).
2. **Faturas:** registrar a fatura de setembro do Google e da ElevenLabs; conferir
   a diferença e o "Resultado com as faturas registradas".
3. **Atendimento real:** conversar com um agente de teste (texto, áudio e
   imagem). Em seguida conferir:
   - Respostas normais.
   - No banco, `usage_events` dessas tarefas com saída maior e raciocínio
     pequeno, e `promptSections` na resposta.
   - Memória do lead e qualificação preenchidas.
4. **Benchmark de humanidade:** ligar no agente de teste e confirmar que as notas
   passam a aparecer.
5. **Piloto do cache:** em Otimizações do agente, escolher "Piloto" e marcar o
   agente de teste.
   - Depois de algumas conversas, conferir a tabela "Prompt: ordem atual ×
     organizado para cache": cache, créditos por resposta e humanidade.
   - Se a nota se mantiver, escolher "Todos".
6. **Cliente:** entrar como cliente e conferir "≈ N respostas" no topo e em Minha
   conta.
7. **Importador de catálogo e análise de tráfego:** executar uma vez e conferir
   que concluem e debitam.
8. **Alertas:** no dia seguinte, após as 09:00, conferir a conferência diária no
   Inngest e os alertas no Financeiro.

## Pendências e decisões

- Ligar o cache em piloto e depois para todos, após comparar qualidade.
- Medir o novo custo por resposta com tráfego real e então decidir o tamanho
  do teste grátis (hoje 1.000 créditos ≈ 11 respostas).
- Voz: com a franquia de 131 mil caracteres, o equilíbrio exige cerca de 11.500
  créditos de voz por mês. Rever o mínimo de 50 créditos quando o volume crescer.
- Cortes de conteúdo do prompt global (regras de checkout só na fase de compra,
  resumo do histórico) dependem da medição de `promptSections` e da bateria
  de qualidade; não foram feitos.
- A API de IA para desenvolvedores mantém a cobrança atual (sem desconto de
  cache e sem `providerCostUsd`), por ter reserva e liquidação próprias.
- Impostos e taxas de pagamento continuam fora da conta.
