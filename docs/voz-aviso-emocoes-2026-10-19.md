# Aviso de emoções bloqueadas — 19/10/2026

O Estúdio de Voz exibia Emoções e Reações desabilitadas nos modelos sem essas
capacidades, com explicação pouco visível. Foi incluído um aviso em destaque
abaixo da barra do editor, com cadeado, fundo âmbar e o botão **Trocar para Voz
Expressiva v3**. Os controles bloqueados referenciam a explicação por
`aria-describedby`.

O botão altera somente a escolha do modelo no compositor: preserva texto,
clone, configurações e o fluxo existente de salvamento do rascunho. Ao selecionar
v3, o aviso desaparece e Emoções/Reações ficam disponíveis. Durante geração ou
recuperação do rascunho a troca permanece bloqueada. Quando o catálogo não
oferece v3, o aviso explica a indisponibilidade e o botão não permite a troca.

Pausas em segundos não são convertidas nem removidas automaticamente: a validação
existente orienta a ajustar as marcações para pausas expressivas antes de gerar
com v3. A troca de modelo não dispara geração de áudio nem débito.

## Verificação

- TypeScript e ESLint dos dois componentes aprovados.
- Navegador com componentes reais e APIs simuladas: aviso em 1920 e 390 px,
  sem transbordamento horizontal; troca direta; habilitação dos controles;
  preservação de texto/clone; recuperação do modelo salvo após recarregar;
  aviso reaparece ao voltar ao v2; v3 indisponível bloqueado; pausas em segundos
  preservadas e validadas; nenhuma chamada de geração e nenhum erro de navegador.
- Evidências locais: `.codex-screens/voice-emotion-notice-1920.png` e
  `.codex-screens/voice-emotion-notice-390.png`.

## Publicação

Publicado em 19/10/2026 às 10h49 BRT: `ed4c048e`, slot a/3130. Anterior
`7abaae00` preservado no slot b/3131. Build de produção e 120 páginas aprovados.
Smoke da candidata e do HTTPS público aprovado: saúde/SHA, 19 assets, bundle com
aviso/botão, APIs sem autenticação negadas, fixture ausente (404), Inngest assinado
200 com autenticação e 58 funções. Builder e servidor de teste local parados.

Sem migration ou mudança de tarifas. Nenhum áudio de cliente foi gerado nos
testes. A interação foi validada localmente com APIs simuladas; publicação e
acessos foram conferidos em produção. Confirmação visual do titular pendente.
