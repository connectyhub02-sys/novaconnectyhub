# Controles por modelo no Estúdio de Voz — 22/10/2026

O titular pediu que o painel mostre somente os ajustes aplicáveis ao modelo e
explique melhor sua função. Sotaques continuam fora desta entrega.

## Compatibilidade

| Modelo | Ajustes oferecidos no painel |
| --- | --- |
| Multilíngue v2 | Velocidade, estabilidade, semelhança, exagero de estilo e reforço da voz |
| Rápida v2.5 e Expressa v2.5 | Velocidade, estabilidade e semelhança |
| Expressiva v3 | Estabilidade Criativa/Equilibrada/Robusta no estilo Natural; intensidade da interpretação nos estilos expressivos |

No v3, intensidade determina a estabilidade: Suave = 1, Equilibrada = 0,5,
Marcante = 0. O painel evita apresentar os dois controles simultaneamente.
Estilos, emoções, reações e regras de pausas existentes foram preservados.

As ajudas distinguem atuação, semelhança e filtros. Percentual de semelhança não
é medição de fidelidade nem garantia de sotaque; exagero de estilo no v2 deve
partir de zero. Filtros e ambientes alteram o áudio gerado, sem recuperar sotaques.

## Evidência e escopo

Consulta autenticada somente de leitura a `GET /v1/models` em 22/10 confirmou
`can_use_style` e `can_use_speaker_boost`: ambos verdadeiros no Multilíngue v2,
ambos falsos no Flash v2.5, Turbo v2.5 e v3. Sem geração nessa consulta.
O [guia oficial de texto para fala](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech)
informa que velocidade e semelhança não estão disponíveis no v3.

`model-controls.ts` centraliza a apresentação e filtra os ajustes enviados pelo
painel para geração, cotação e prévia. O rascunho mantém valores para voltar ao
modelo anterior. A normalização de estabilidade v3 continua em 0/0,5/1.
Contratos legados do servidor, valores padrão, identificadores de idempotência,
cobrança, clones e histórico não foram alterados. O filtro do painel não é uma
mudança dos contratos públicos do backend.

## Verificação

- 22 testes aprovados: controles, interpretação, contratos e configurações.
- TypeScript e ESLint aprovados. Foi removido do caminho de compilação somente
  um validador gerado obsoleto de uma antiga página local `agent-settings-check`;
  tipos de rotas regenerados, sem alteração no código desse módulo.
- Navegador com componentes reais e APIs simuladas: matriz dos quatro modelos,
  prévia e geração sem parâmetros ocultos, intensidade v3, rascunho após recarga,
  preservação de texto/voz/ajustes, ajuda e ausência de transbordamento em
  1366 e 390 px. Capturas locais `.codex-screens/voice-controls-{1366,390}.png`.
- Nenhum áudio pago foi gerado. Qualidade da voz e preservação de sotaque ainda
  dependem da avaliação do titular com suas prévias.

## Publicação

Publicado em 22/10/2026 às 12h14 BRT: `3c5bfb17`, slot b/3131. Anterior
`5a0c0c2f` preservado no a/3130 para retorno. Build e TypeScript de produção,
120 páginas e verificações candidata/HTTPS aprovados: saúde e SHA, 19 assets,
bundle com os novos controles/ajudas, APIs protegidas, fixture local 404 e
Inngest assinado 200 com 58 funções. Builder e servidor local de testes parados.
Sem migration ou mudança de tarifa. Interação validada localmente com APIs
simuladas; disponibilidade e proteção verificadas em produção. Teste auditivo
com a voz clonada fica para o titular.
