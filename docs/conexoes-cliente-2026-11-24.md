# Conexões do painel do cliente — 24/11/2026

## Alteração

Revisão de aplicação: `54575794da606668cac3b327ab8959bc1c4c64bd`.
Base: `8b8dac9a` (manutenção de 24/11, com os recursos sociais já publicados).

A página `/dashboard/integracoes` usa os mesmos componentes de cartão e diálogo das
contas conectadas do admin. Instagram/Facebook, WhatsApp, Google, Asaas, YouTube e
TikTok aparecem em cartões compactos, quatro por linha no desktop e dois no celular.
As ações e configurações ficam em **Gerenciar**, incluindo Google Tag dentro de Google.
Links anteriores como `#meta-ads-guiado`, `#google-ads-guiado` e `#google-tag` abrem o diálogo.
Formulários, autorizações, escopo por empresa e rotas de integração foram preservados.

## Validação local

- TypeScript (`npx tsc --noEmit`): aprovado.
- ESLint nos cinco arquivos alterados: aprovado.
- 51 testes relevantes de acesso, OAuth, provedores e armazenamento social: aprovados.
- Prévia com dados fictícios em 1440×1000 e 390×844: cartões e diálogos conferidos;
  largura da página e do viewport móvel de 390 px, sem transbordamento horizontal.
- Conferida a abertura por link direto para Gerenciar Google e seu fechamento.
- A rota temporária da prévia foi removida antes do commit e não integra a release.

## Publicação e validação em produção

- Publicada em 24/11/2026, 17h38 BRT, no slot A. Health público confirmou o SHA completo.
- Slot B anterior (`87eaae164d07aa1006cc8d51a6387b81cce13176`) preservado para retorno.
- Build de produção aprovado, inclusive TypeScript e geração de 131 páginas.
- Smoke no candidato e no domínio público: páginas 200, 25 assets 200, rotas protegidas
  com 307/401 esperados e Inngest autenticado via GET assinado (61 funções).
- Painel autenticado de Buffalo Mass/Luna conferido pelo acesso assistido do admin:
  seis cartões compactos, quatro por linha no computador e dois em viewport móvel de 390 px.
- Aberto e fechado Gerenciar para Meta, WhatsApp, Google, Asaas, YouTube e TikTok.
  Google Tag aparece dentro de Google; os seletores e ações existentes continuam acessíveis.
- Link `#meta-ads-guiado` abriu o diálogo correto em produção; fechar removeu o hash.
- No celular, página de 375 px com barra de rolagem e diálogo de 358 px dentro do viewport
  de 390 px; sem transbordamento horizontal. O tamanho normal do navegador foi restaurado.
- A sessão assistida foi encerrada com Voltar ao Admin OS; nenhuma configuração foi salva.
- Google aparece autorizado, mas sem conta de anúncios encontrada/selecionada nesse cliente.
  YouTube mostra ConnectyHub e TikTok mostra vestebrasilshop.com.br como contas selecionadas.
  Esses estados são os exibidos pela aplicação, não uma nova validação de entrega nas redes.
- Código salvo em `origin/codex/client-connections-20261124`.

## Limites

Esta alteração organiza a interface. Não aprova os aplicativos junto às redes e não
valida entrega de anúncios ou publicação de vídeos. A conferência não deve reconectar,
desconectar, publicar conteúdos ou alterar credenciais do cliente.
