# Criativos e campanhas com IA — incorporação do Viral Check

## Escopo

Solicitação do titular em 12/10: analisar o projeto local ViralCheck e incorporar análise opcional de criativos, score com melhorias, roteiros e campanhas orientadas por prompt à ConnectyHub. Testes sem anúncios ou gastos publicitários.

## Auditoria do projeto de origem

`C:/Users/conne/Documents/ViralCheck` foi consultado sem modificações. O pipeline real em `inngest/functions/analyzeVideo.ts` envia imagem/vídeo ao Gemini Files, aguarda processamento e produz relatório, legendas, roteiro e fala. Esse fluxo e os critérios editoriais são a base da adaptação.

Não copiar `actions/generate-analysis.ts`: contém resposta demonstrativa com score fixo. `actions/discovery.ts` agrega análises sem isolamento por organização; não foi transportado. `actions/trends.ts` usa busca externa Tavily: radar de tendências exige fonte, data, tarifa e isolamento próprios antes de integrar. Não transportar autenticação, planos, chaves nem carteiras do ViralCheck.

## Implementação

- Card recolhível compartilhado em Publicações/Calendário e Meta Ads, admin e usuário.
- Análise real de JPG/MP4 da biblioteca da organização, com cinco critérios, evidências e melhorias. Score geral derivado dos critérios, sem promessa de viralização ou vendas.
- Roteiro, cenas, fala para gravação e legendas Facebook/Instagram.
- Proposta por prompt ou criativo: CBO/ABO, quantidade de anúncios, objetivo, contexto de público, destino e orçamento total. Valores estruturados prevalecem sobre a IA. ABO divide o total entre conjuntos.
- Histórico persistente por empresa, exportação de relatório e preparação de rascunho orgânico para posterior aprovação.
- Endpoint verifica sessão, organização, papel de gestão, contrato, plano, origem e limite de requisições. RLS bloqueia acesso direto à tabela; retorno nunca inclui resposta bruta do fornecedor.
- Chave/modelo vêm da manutenção central. Contagem de tokens e tarifa são conferidas antes de gerar; consumo usa o metering central idempotente. Não há reserva específica deste módulo: saldo é pré-conferido e o débito central precisa concluir antes de entregar o resultado. Concorrência com outros consumos pode deixar execução em conferência.
- Uma geração ativa por organização; mesma identidade não regenera. Resultado bruto persiste antes da cobrança. Timeout/falhas incertas não são repetidos automaticamente. Cópia temporária no Gemini é excluída ao concluir; original continua na biblioteca.

## Limites explícitos

Esta etapa gera propostas, não cria nem ativa campanhas na Meta. Ainda faltam o compilador de proposta para objetos reais de anúncio, validação de objetivo/Pixel/posicionamentos/criativos, prévia final e execução idempotente com autorização de verba. Não é um gestor autônomo em produção.

Comparação com métricas reais de posts, resultados orgânicos por período, radar de tendências, análise de vários arquivos/carrosséis em conjunto, reserva de créditos e recuperação assistida das execuções incertas permanecem evolução separada. Histórico atual mostra as 40 análises mais recentes. Rascunho orgânico exige revisão antes de publicar. A análise por IA não concede permissões Meta nem acelera o App Review.

## Validação

23 testes automatizados passaram: regras de score/orçamento, isolamento de acesso e tabela, identidade e concorrência. TypeScript e lint conferidos. Publicação e teste com provedor real serão registrados após verificação; testes unitários não comprovam inferência real.
