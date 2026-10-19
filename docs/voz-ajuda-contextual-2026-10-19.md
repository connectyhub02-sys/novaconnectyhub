# Ajuda contextual e botão TXT — 19/10/2026

O titular pediu o padrão dos ícones de interrogação da tela de agentes no Estúdio
de Voz, para entender a escolha dos modelos e estilos, além de tornar Importar
TXT visualmente reconhecível como botão.

## Alteração

- `VoiceHelp` usa o mesmo componente Radix Tooltip da aplicação, com ícone de
  interrogação, nome acessível e suporte a mouse, foco, Enter e toque. As dicas
  longas têm largura e altura limitadas ao espaço disponível, com rolagem interna.
  Escape fecha a dica. Nenhuma mudança no componente compartilhado dos agentes.
- Modelo: comparação entre as opções disponíveis e explicação persistente do
  modelo selecionado, distinguindo Expressa v2.5 de Expressiva v3.
- Estilo de interpretação: explicação dos seis estilos (Natural, Narrador,
  Contador de histórias, Vendedor consultivo, Publicitário e Dramático /
  cinematográfico), com exemplos de uso e descrição da escolha atual. As dicas
  explicam a dependência de v3, a variação do resultado e que o roteiro não é
  reescrito nem recebe trilha automaticamente.
- Ajuda para voz/clones, intensidade, velocidade, estabilidade, semelhança,
  exagero de estilo, reforço da voz, idioma, dicionários, pausas, emoções, reações,
  prévia paga, filtros, ambientes, som de fundo, distância, reverberação, estéreo,
  formato MP3, histórico e atuação por áudio de referência.
- Importar TXT virou um botão real com ícone, fundo, borda, foco e altura de
  toque. Abre o seletor de arquivo por clique ou teclado e mantém o fluxo atual
  de importação. A ajuda informa que substitui o texto do editor e não gera áudio.

As explicações respeitam o comportamento implementado no painel. Referências
consultadas em 19/10: [modelos do provedor](https://elevenlabs.io/docs/overview/models)
e [orientações de fala](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).
Nenhum modelo novo foi habilitado ou tarifa alterada.

## Verificação

TypeScript e ESLint dos componentes aprovados. Navegador com componentes reais
e APIs simuladas conferiu os seis estilos, todas as dicas principais, abertura
por hover/foco/Enter/toque e fechamento por Escape. Em 1920/1366/390 px não houve
transbordamento; a dica longa cabe na altura disponível e permite rolagem no
celular. Seletor de arquivo acionado pelo teclado importou TXT com duas linhas,
mantendo o modelo escolhido. Histórico e referência também conferidos.
Sem erros de navegador, geração paga ou envio de áudio ao provedor.

Evidências locais em `.codex-screens/voice-help-{1920,1366,390}.png` e
`.codex-screens/voice-import-{1920,1366,390}.png`.

## Publicação

Publicado em 19/10/2026 às 11h16 BRT: `1d6ffdb4`, slot b/3131. Anterior
`ed4c048e` preservado no a/3130. Build/TypeScript de produção e 120 páginas
aprovados. Candidata e domínio público conferidos: saúde/SHA, 19 assets,
ajudas e Importar TXT no bundle, APIs protegidas, fixture 404, Inngest assinado
200 autenticado com 58 funções. Builder e servidor local de teste parados.
Sem migration ou alteração de cobrança. A interação foi validada com APIs
simuladas; a publicação e os acessos foram verificados em produção.
