# Criativos e campanhas com IA — incorporação do Viral Check

## Escopo

Solicitação do titular em 12/10: analisar o projeto local ViralCheck e incorporar análise opcional de criativos, score com melhorias, roteiros e campanhas orientadas por prompt à ConnectyHub. Testes sem anúncios ou gastos publicitários.

## Auditoria do projeto de origem

`C:/Users/conne/Documents/ViralCheck` foi consultado sem modificações. O pipeline real em `inngest/functions/analyzeVideo.ts` envia imagem/vídeo ao Gemini Files, aguarda processamento e produz relatório, legendas, roteiro e fala. Esse fluxo e os critérios editoriais são a base da adaptação.

Não copiar `actions/generate-analysis.ts`: contém resposta demonstrativa com score fixo. `actions/discovery.ts` agrega análises sem isolamento por organização; não foi transportado. `actions/trends.ts` usa busca externa Tavily: radar de tendências exige fonte, data, tarifa e isolamento próprios antes de integrar. Não transportar autenticação, planos, chaves nem carteiras do ViralCheck.

A interface original também contém comparação de scores, evolução histórica e recomendações para Reels/Shorts/TikTok. São referências aproveitáveis para uma próxima camada de comparação, mas a evolução da nota editorial deve ficar separada da evolução de alcance/retorno real. Sugestão de melhor horário depende de Insights suficientes; não reutilizar valores inventados pelo modelo. Notificações de análise pronta podem usar o fluxo central da ConnectyHub, sem trazer o disparador paralelo do projeto original.

Contratos do provedor conferidos nas referências oficiais: [análise de vídeo Gemini](https://ai.google.dev/gemini-api/docs/video-understanding) e [Files API](https://ai.google.dev/api/files).

## Implementação

- Card recolhível compartilhado em Publicações/Calendário e Meta Ads, admin e usuário.
- Análise real de JPG/MP4 da biblioteca da organização, com cinco critérios, evidências e melhorias. Score geral derivado dos critérios, sem promessa de viralização ou vendas.
- Roteiro, cenas, fala para gravação e legendas Facebook/Instagram.
- Proposta por prompt ou criativo: CBO/ABO, quantidade de anúncios, objetivo, contexto de público, destino, moeda e orçamento total. Valores estruturados prevalecem sobre a IA. ABO divide o total entre conjuntos. Verba numérica exige moeda explícita (BRL/USD/EUR); Meta Ads mostra a moeda consultada, sem presumir que a proposta altera a conta.
- Histórico persistente por empresa, exportação de relatório e preparação de rascunho orgânico para posterior aprovação.
- Endpoint verifica sessão, organização, papel de gestão, contrato, plano, origem e limite de requisições. RLS bloqueia acesso direto à tabela; retorno nunca inclui resposta bruta do fornecedor.
- Chave/modelo vêm da manutenção central. Contagem de tokens e tarifa são conferidas antes de gerar; consumo usa o metering central idempotente. Não há reserva específica deste módulo: saldo é pré-conferido e o débito central precisa concluir antes de entregar o resultado. Concorrência com outros consumos pode deixar execução em conferência.
- Uma geração ativa por organização; mesma identidade não regenera. Resultado bruto persiste antes da cobrança. Timeout/falhas incertas não são repetidos automaticamente. Ao concluir, o serviço tenta excluir a cópia temporária no Gemini; original continua na biblioteca. Falha na limpeza não gera uma nova análise.

## Limites explícitos

Esta etapa gera propostas, não cria nem ativa campanhas na Meta. Ainda faltam o compilador de proposta para objetos reais de anúncio, validação de objetivo/Pixel/posicionamentos/criativos, prévia final e execução idempotente com autorização de verba. Não é um gestor autônomo em produção.

Comparação com métricas reais de posts, resultados orgânicos por período, radar de tendências, análise de vários arquivos/carrosséis em conjunto, reserva de créditos e recuperação assistida das execuções incertas permanecem evolução separada. Histórico atual mostra as 40 análises mais recentes. Rascunho orgânico exige revisão antes de publicar. A análise por IA não concede permissões Meta nem acelera o App Review.

Próxima sequência técnica: (1) fechar reserva/liquidação e recuperação assistida; (2) ligar proposta à conta Meta, Página, Pixel, destino, criativo e objetivo elegíveis, com prévia e validação oficial sem ativação; (3) execução idempotente após aprovação de verba, mantendo resultado incerto bloqueado; (4) fechar o ciclo criativo → publicação/campanha → métricas → comparação e recomendações. Análise criativa fica opcional; execução de orçamento sempre usa valores estruturados aprovados.

## Validação

29 testes automatizados passaram: regras de score/orçamento/moeda, separação de modos, isolamento de acesso e tabela, identidade, mídia da empresa e concorrência. TypeScript e lint conferidos.

Primeira publicação `837263ff` em slot a passou build, smoke de login/assets/API protegida e Inngest assinado (58 funções). Migration 0195 aplicada e registrada, com backup prévio de esquema privado `config/before-0195-schema.sql` na VPS. Nenhuma função Inngest adicionada.

Teste real na operação interna: vídeo MP4 de 5 segundos, tela estática sem áudio, identificado pelo Gemini; relatório salvo `04453ecc-aefe-4800-ad58-219a3b5f9df3`, score 3/100. Proposta CBO por prompt `866a3580-12c4-4b99-8204-f476888f5958` contém 3 anúncios e total diário proposto 50. A IA presumiu BRL no texto; essa descoberta levou à exigência de moeda explícita no commit seguinte. O relatório antigo é evidência do teste, não campanha executável; permanece com moeda não definida.

Dois usos registrados como internal_shadow, custo de fornecedor registrado, sem débito de carteira cliente. Exportação Markdown baixada e lida. Botão orgânico criou somente o rascunho Reel `c9afea18-4a75-4cae-9c70-796314ce44c2`, sem aprovação ou envio. Histórico reaparece em Meta Ads. Painel BuffaloMass abriu vazio, sem dados internos, em sessão administrativa assistida; não equivale a teste real de sessão não administrativa. Evidências em `output/meta-creative-20261012`.

Nenhum anúncio, alteração de conta/orçamento Meta ou publicação social foi executado nesses testes. Inferência tem custo de IA; não se confunde com gasto publicitário.

Validação de `c554b5fa`: imagem JPG analisada de fato (score 43/100, descrições compatíveis com o arquivo de teste); proposta `55e4acd1-acc2-4ac5-a260-b5fab26912a2` preservou USD 50, CBO e três anúncios. Roteiro `b124a1cf-c662-44de-998f-a9e93eb2ed28` gerou 470 caracteres de cenas e 351 de fala, sem score de uma mídia inexistente. Quatro execuções reais, quatro usos internal_shadow, custo total de fornecedor registrado R$ 0,14367150, sem débito de cliente. O teste de alternância mostrou orçamento herdado do modo campanha no texto do roteiro; `b4bc49e1` normaliza e descarta verba/moeda/destino/estrutura nos modos análise e roteiro, com teste específico.

Versão final publicada às 15h18 BRT: `b4bc49e1e0b9ea22bb5eaccd805d9d08a6b27bec`, slot a/3130, fallback `c554b5faf59d415ba3e5926bed19b08feea3905a` no b/3131. Build, smoke candidato/público e GET Inngest assinado passaram (58 funções); builder parado. O ajuste final de normalização foi validado por teste automatizado, sem repetir inferências desnecessárias. A criação/ativação de anúncios permanece não implementada nesta entrega.
