# Acesso administrativo a clientes após a migração — 29/09/2026

## Diagnóstico comprovado

O painel `/admin/clientes` carregava normalmente, mas **Acessar painel** devolvia
`403 {"error":"Origem não autorizada."}`. Reproduzido por HTTP e no navegador
autenticado, antes da publicação da correção.

`isSameOriginRequest`, em `src/lib/admin-assisted-access.ts`, comparava o header
`Origin` diretamente com `new URL(request.url).origin`. No Next.js standalone da
VPS, essa URL representa o endereço interno do contêiner, enquanto o navegador
envia `https://www.connectyhub.com.br`. O Caddy termina o HTTPS e encaminha ao
app por HTTP local. A comparação rejeitava a chamada antes da autenticação do
administrador. Não era perda do papel administrativo nem dos cadastros.

Na versão anterior, POST público com origem oficial devolveu 403. POST local
ao contêiner com origem `http://0.0.0.0:3000` ultrapassou a proteção de origem e
devolveu 401 (sem sessão). `NEXT_PUBLIC_APP_URL` estava corretamente configurada
para o domínio oficial tanto no ambiente de compilação quanto no runtime.

## Correção

Commit `c1a649b054c7ec61b231525c502a4809adde96e8`, baseado no `master` que já incluía
a alteração de cumprimento das campanhas `c5bd05ca`.

- A origem esperada passa a ser a origem de `NEXT_PUBLIC_APP_URL`.
- Origem ausente, `null`, externa, com protocolo/porta diferentes ou malformada
  continua recusada. Host e headers de proxy fornecidos pelo chamador não
  autorizam a operação.
- Produção sem URL pública válida falha fechada. Apenas desenvolvimento sem
  configuração pública conserva a comparação com a URL da requisição.
- O helper é compartilhado por início, encerramento e reset de lead durante
  acesso assistido. Não mudou papéis, escopo de organização, duração do acesso,
  verificação da sessão Auth, auditoria ou proteções do reset.
- Nenhuma migration, alteração de DNS, envio de mensagem ou cobrança faz parte
  desta correção.

## Validação antes da publicação

47 testes em cinco arquivos passaram: origem, rota de início, sessão assistida,
SQL/RLS e visibilidade do reset. O teste da rota passou a usar a proteção real
com URL interna HTTP e origem pública HTTPS; anteriormente ele simulava a
própria comparação antiga, deixando essa regressão passar. Incluídos testes de
origens externas, falsificação de headers/URL, configuração inválida e
encerramento antes de qualquer escrita indevida. ESLint dos arquivos alterados
e `git diff --check` passaram.

## Limites e continuidade

A validação da migração em 28/09 abriu o painel com sessão existente; não testou
o início de uma nova sessão assistida. Esta ocorrência cobre essa lacuna.

A busca de código também encontrou comparações diretas semelhantes em rotas
de cobrança, infraestrutura e capacidades de voz. Elas não são chamadas por
**Acessar painel** e não foram alteradas nesta correção focada. Revisão e
validação próprias dessas operações ficam pendentes; não considerar todos os
fluxos de escrita validados pela migração ou por este teste.

## Publicação e teste real concluídos

- Build Linux/TypeScript e geração de 109 páginas concluídos; candidato b
  saudável e com versão conferida em `/api/health`.
- Seis sondas HTTP no candidato: origem oficial sem sessão → 401; origem
  externa, ausente, `null`, interna do contêiner e externa com Host/forwarded
  falsificados → 403.
- Slot **b**, porta local **3131**, ativado em 29/09 aproximadamente **13h07 BRT**.
  Health público confirmou `c1a649b054c7ec61b231525c502a4809adde96e8`.
  Sondas públicas repetiram 401 para origem oficial sem sessão e 403 para externa.
- No navegador autenticado, **Acessar painel** abriu `/dashboard` da
  Pizzaria Macedo&Dias com a faixa **Acesso administrativo ativo**. O botão
  **Voltar ao Admin OS** restaurou `/admin/clientes` e a sessão administrativa,
  sem o erro de origem. Nenhuma ação comercial foi executada nessa conta.
- Reserva **a**, porta 3130, preserva `c5bd05cac38f8b8a44b3a04ea2a077fee01978ec`.
  Builder parado após a publicação. Nenhuma alteração nos demais projetos da VPS.

Não houve reset destrutivo de lead, cobrança ou envio para validar a correção.
O titular ainda não fez o reteste após esta publicação; o teste descrito acima
foi executado pelo agente na sessão administrativa já autenticada.
