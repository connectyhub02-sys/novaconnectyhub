# Rotinas WhatsApp por destino e carrossel explícito — 15/10/2026

## Decisão do titular

Status, Grupos e Canais devem ter rotinas independentes na mesma tela, cada uma
com conteúdo, produtos, programação e pausa próprios. O titular confirmou esse
formato no chat. Carrossel deve ser uma escolha explícita nos grupos, sem depender
de a IA decidir utilizá-lo. No privado, foi pedida a verificação de viabilidade
para uma futura opção de carrossel no follow-up.

## Implementação

- Três entradas de criação por destino. Status mostra público, sequência/cor e,
  logo abaixo, os produtos e a ideia. Grupos/canais mostram seus destinos antes
  de liberar os campos de conteúdo. Nenhum grupo aparece dentro do editor de Status.
- Programação em listas compactas: uma vez agora, diária por sete dias, diária
  por trinta dias ou contínua. Quantidade por dia, data de início e horário de
  Brasília separados. Os rótulos deixam explícito que semana/mês são duração,
  não uma postagem semanal/mensal. Busca de produtos sem o antigo corte nos 40
  primeiros; limite de 12 selecionados e 50 destinos continua explícito.
- Carrossel explícito de grupos usa `target_carousel`, preserva a legenda manual
  no envio único e força o formato no planejamento recorrente. Ativa as capacidades
  necessárias pelo fluxo existente. Até quatro produtos por publicação, com
  mídia; um produto gera um cartão. Envio segue as proteções e cobrança existentes.
- O servidor confere organização e instância dos grupos. Carrossel explícito
  não é aceito para Status/canais nesta rotina. Não substitui silenciosamente
  carrossel indisponível por texto.
- `starts_at` passa a respeitar a data escolhida no planejamento. Novos períodos
  de sete/trinta dias usam esse início; registros existentes não são reescritos.
- Migration `0205`: permite `carousel` e adiciona trigger transacional que cancela
  apenas posts ainda `scheduled` daquela rotina/organização ao editar conteúdo,
  destinos ou programação, reiniciando o planejamento. Histórico e outras
  rotinas preservados; atualizações do próprio planejador não cancelam a fila.
- Rotinas antigas com vários destinos continuam identificadas como compartilhadas.
  Não houve divisão automática, criação, ativação ou envio real de campanha.

## Validação e publicação

48 testes passaram, incluindo carrossel explícito contra sugestões de outro
formato, legenda manual sem geração, data futura, isolamento, duração e edição
transacional com rollback. TypeScript e ESLint passaram. Prévia local com dados
fictícios validada por navegador em desktop e 390 px: campos progressivos,
Status sem grupos, carrossel explícito, busca do 48º produto, payload independente
e ausência de transbordamento horizontal/erros de execução.

Migration aplicada em produção em 15/10 às 13h19 BRT, com backup de esquema em
`/var/backups/connectyhub/manual/pre-0205-20261015T161945Z`. SHA256
`5ff3932883dfd9cf7b88d0726511b305da36d8cfa175622e23cf879110935f74`.
Antes/depois: uma rotina e 14 posts pendentes. Restrição e trigger ativos conferidos.
Código `c8b44d98` publicado no slot b/3131; fallback `174e10c1` no slot a/3130.
Build de produção com 120 páginas concluído. Candidato e endereço HTTPS público
passaram nas verificações de saúde/versão, páginas, Inngest e métricas. GET/POST
sem sessão nas rotas de canais retornaram 401. Builder parado após publicação.

Envio real de carrossel e apresentação no WhatsApp dos destinatários não foram
testados nesta alteração. Nenhuma mensagem de teste enviada a grupos/contatos.

## Follow-up privado

O [endpoint oficial do provedor](https://docs.uazapi.com/endpoint/post/send~carousel)
documenta destinatário individual e grupo, com mídia e botões. Portanto há suporte
de transporte para carrossel no privado. O follow-up atual da ConnectyHub usa
`sendLeadContactMessage` com texto e botões, inclusive saída da lista; não recebeu
um seletor de carrossel nesta entrega. Implementação futura precisa selecionar
produtos no contexto do lead e manter janela, preferências, descadastro, histórico,
isolamento e deduplicação de entregas. Compatibilidade documentada não comprova
envio real em todas as versões do aplicativo WhatsApp.
