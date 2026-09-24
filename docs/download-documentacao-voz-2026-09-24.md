# Download da documentação de Voz — 24/09/2026

O JSON público de Voz respondia HTTP 200 com `Content-Disposition: inline` em
produção, abrindo o conteúdo no navegador. A rota agora declara `attachment`
com o nome `connectyhub-voz-openapi.json`, preservando o contrato OpenAPI.

Os links de JSON e Markdown no topo e na lateral da documentação declaram
`download`. O guia existente mantém o nome `connectyhub-voz.md`. A página orienta
enviar os dois arquivos ao aplicativo/chat usado para implementar a integração.

Validação local: quatro testes existentes de documentação/contrato passaram,
ESLint dos três arquivos alterados e build webpack/TypeScript com 109 páginas
aprovados. Chromium baixou os quatro links (dois formatos em duas posições),
com os nomes esperados e sem sair de `/docs/api#voz`. JSON parseado com 19
caminhos, incluindo gerações e operações; guia com autenticação e idempotência.
Prévia móvel de 390 px conferida. Nenhuma geração de áudio ou alteração financeira.

Publicação pela master e confirmação no domínio principal pendentes neste
registro pré-publicação; resultado posterior em `estado-operacional.md`.
