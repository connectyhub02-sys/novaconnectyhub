# Precisão decimal dos créditos da API de IA

Correção delimitada, 14/09/2026. Base publicada conferida: `508953c`, master remota igual ao checkout isolado; alterações documentais anteriores preservadas. Sem mudança de tarifa, plano, pacote, mínimo por operação, migration ou dados históricos.

## Problema e resultado

A soma `16 × 0,0036 + 61 × 0,0216` é 1,375200 crédito. A multiplicação e soma em ponto flutuante produziam 1,3752000000000002; o arredondamento para cima em seis casas cobrava 1,375201. A auditoria operacional encontrou essa diferença em uma operação real. O detalhamento também podia conter artefatos como `0.1 * 0.2 = 0.020000000000000004`.

`priceAiUnits` passa a interpretar a representação decimal das quantidades e tarifas recebidas, multiplicar e somar coeficientes inteiros com escala decimal e arredondar uma única vez o total para cima em seis casas. O detalhamento usa os mesmos produtos decimais. Não há tolerância epsilon nem corte arbitrário de casas: uma fração legítima acima do limite, mesmo pequena, continua subindo para o próximo milionésimo. Notação científica e unidades fracionárias são aceitas. Nenhuma dependência nova.

O mínimo de um crédito para operação com consumo continua igual; orçamento sem mínimo e consumo zero mantêm suas regras. O custo do fornecedor continua com seu cálculo anterior. A precisão parte dos números já recebidos pelo calculador; não recupera dígitos perdidos antes dessa entrada nem altera toda a aritmética de outros módulos da plataforma.

## Validação

- Antes da alteração, dois testes novos falharam reproduzindo a cobrança 1,375201 e o artefato do detalhamento.
- Nove casos numéricos cobrem o exemplo real, ordem das parcelas, limites imediatamente abaixo/no/acima do milionésimo, valores em notação científica, unidades fracionárias, agregação antes de arredondar, mínimo e consumo zero.
- Um caso de liquidação em PostgreSQL local simulado confere saldo 98,624800, único débito -1,375200, único evento e reserva zero após repetir a liquidação.
- **136 testes em 30 arquivos da API de IA passaram**, com dois processos. Na primeira rodada paralela, sete testes de inicialização/execução de bancos locais excederam cinco segundos; a repetição com concorrência reduzida e limite de 15 segundos passou integralmente, sem alterar asserções ou configurações do repositório.
- ESLint dos arquivos alterados e build de produção Webpack com TypeScript aprovados (compilação em 38,5 s, TypeScript em 16,9 s, 103 páginas geradas). Publicação e verificação posterior serão registradas ao terminar.

## Pendência histórica e limites

O acréscimo histórico observado de **0,000001 crédito permanece no registro e no saldo original**. Não foi estornado, recalculado ou compensado. Uma eventual reconciliação histórica exige escopo próprio; esta correção afeta cálculos futuros.

Nenhuma geração, arquivo de cliente, compra, recarga ou envio WhatsApp foi executado para testar. Testes locais não equivalem a nova liquidação faturável em produção nem a paridade completa com Gemini.

## Publicação confirmada

Commit `4c84800` enviado à master. Vercel `dpl_5tUEuN5Uw7ZD8FqcRGJnoiUkKKr9` concluiu às **14:02:06 UTC / 11:02:06 BRT**, em 14/09/2026. Logs confirmaram o commit, compilação Turbopack e TypeScript; inspeção do domínio principal confirmou a nova implantação Ready/Production e os aliases com/sem www.

Às 14:03 UTC, oito verificações passaram: login, os dois OpenAPI e preços HTTP 200; arquivos, lotes, coleções File Search e consulta de requisição sem credencial HTTP 401. As 35 entradas de preços públicos eram idênticas à referência capturada antes da publicação. Isso comprova disponibilidade/controle básico, não uma nova geração faturável.

Às 14:03:49 UTC, a leitura do projeto Betel ainda não encontrou solicitações criadas depois desta publicação. Testes adicionais foram autorizados pelo titular e pertencem à tarefa implementadora Betel; não foram duplicados aqui. A conciliação de uma chamada real posterior permanece pendente. Consumo adicional desta tarefa: zero. O dado histórico permanece intacto. Registro pós-publicação mantido local para evitar outro deploy apenas documental.

Às 14:06 UTC, três testes adicionais da tarefa Betel foram conciliados por leitura: todos com STOP, recibo/consumo/débito consistentes, um débito por operação e reservas liberadas. Porém foram executados entre 14:01:10 e 14:01:22 UTC, antes da correção; não equivalem a uma liquidação real na nova versão. O detalhamento de um deles ainda contém o artefato decimal histórico esperado. Resultado e identificadores ficam no relatório privado local de auditoria, sem publicar informações financeiras do cliente no repositório. Não houve nova geração para duplicar a bateria da Betel.

## Liquidação real posterior confirmada — 14/09, 14:13 UTC

A tarefa Betel executou uma única prova adicional com entrada sintética após a publicação. A consulta independente no Supabase confirmou criação às 14:11:15 UTC e conclusão às 14:11:16 UTC, STOP, JSON válido, recibo igual ao valor liquidado e um único evento/débito na mesma carteira e projeto. O detalhamento decimal ficou consistente, o mínimo por operação foi aplicado e as reservas da operação e da carteira estavam zeradas. A leitura do resumo usado pelo painel também conciliou com os registros.

Está encerrada a pendência de observar **uma liquidação real após a publicação**. Esse teste valida o caminho publicado e o mínimo; não reproduz exatamente a combinação numérica histórica que disparava o acréscimo, coberta pelas regressões locais. Não declara paridade ampla Gemini ou homologação integral da Betel. Identificadores, saldo e valores privados permanecem no relatório local fora do Git. Nenhuma geração adicional, ajuste histórico ou implantação documental realizada por esta tarefa.
