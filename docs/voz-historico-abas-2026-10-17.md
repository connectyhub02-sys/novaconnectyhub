# Histórico discreto do Estúdio de Voz — 17/10/2026

O titular aprovou o aproveitamento da largura e pediu que o histórico deixasse de
formar uma lista abaixo do editor, usando os prints da ElevenLabs como referência.

## Implementação

- Painel direito com abas Configurações/Histórico; Configurações abre por padrão.
- Menu Conta oferece Histórico (abre essa aba) e Uso e créditos (mantém os
  indicadores e registros de consumo existentes).
- Histórico compacto agrupado por Hoje/Ontem/data, busca por dados disponíveis,
  filtros de voz/modelo/data e atualização manual. Até 50 resultados recentes do
  projeto, com altura limitada e rolagem interna; sem promessa de busca no acervo
  completo ou de transcrição de recibos antigos.
- Abaixo do editor aparece somente um áudio: o recém-gerado ou o selecionado no
  histórico, com player/download/reuso quando disponível e opção de fechar.
- Trocar abas preserva rascunho e ajustes. Abas acessíveis por teclado; troca de
  projeto reinicia seleção e filtros. Os endpoints autenticados, persistência,
  isolamento, cobrança e largura aprovada permanecem os mesmos.

## Validação

ESLint e TypeScript aprovados; 20 testes existentes de histórico, isolamento e
texto longo passaram. Navegador com componentes/CSS reais e APIs simuladas em
1920, 1366 e 390 pixels: 50 registros escondidos inicialmente e com rolagem
interna ao abrir; busca, três filtros, seleção/download, fechamento, duas gerações
com um único player, reload, erro/repetição e resposta atrasada ao trocar projeto.
Rascunho/velocidade preservados e navegação por teclado conferidos. Nenhuma
chamada paga, áudio do cliente ou alteração de dados de produção nesses testes.
Evidências locais em `.codex-screens/voice-tabs-*-20261017.png`.

## Publicação

Pendente de build e validação da candidata na VPS. Confirmação visual pelo titular
após a publicação ainda pendente.
