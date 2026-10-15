# API WhatsApp da Vision após liberação de contrato — 15/10/2026

## Evidência e diagnóstico

O titular relatou painel liberado até 11/11/2026, mas API WhatsApp bloqueada.
A leitura em produção confirmou contrato permitido por `admin_manual_access`,
organização ativa/Scale, chave e webhook ativos e instância conectada. Porém,
o cliente principal da API permanecia `paused`, sem o marcador
`connectyhub_api_access_guard` usado para identificar suspensões por cobrança.

Chave e webhook preservavam suspensão automática em 10/10 às 03h UTC e
restauração em 13/10 às 01h30 UTC. O cliente principal preservava uma liberação
anterior de contrato em 01/10, mas não o marcador de suspensão. Usando a
credencial já configurada na Vision, `GET /api/v1/usage` e
`GET /api/v1/instances` retornavam 403 `api_client_inactive`.

Foi identificado e reproduzido um caminho capaz de produzir essa divergência:
o healthcheck sobrescrevia todos os metadados com o retrato carregado antes da
consulta ao provedor. Uma suspensão concorrente podia perder seu marcador,
embora o status continuasse pausado. A evidência disponível não comprova a
sequência histórica exata de gravações; o defeito concorrente e a inconsistência
atual foram confirmados separadamente.

## Correção aplicada

Às 11h45 BRT, reparado exclusivamente o cliente API da Vision, em transação com
bloqueio da linha, pré-condições e auditoria `connectyhub_api_contract_access_repaired`.
O contrato foi consultado antes e depois e permaneceu idêntico. Acesso até
`2026-11-12T01:21:29.672906Z` (11/11 às 22h21 BRT). Nenhuma fatura, carteira,
assinatura, chave ou vínculo de infraestrutura alterado. Metadados anteriores
preservados na auditoria privada; credenciais não copiadas para este documento.

As duas consultas públicas, usando a mesma chave existente, passaram a retornar
200; a instância retornou `connected`. Foram somente consultas, sem envio de
mensagem nem reprocessamento manual de filas.

A correção de código `174e10c1` lê os metadados atuais após a consulta de saúde
e mescla o resultado com esses dados. A gravação é condicionada à mesma versão
`updated_at` dessa leitura: se outra gravação ocorrer nesse intervalo, descarta
o resultado e aguarda a próxima coleta. Assim, preserva decisões de acesso e
permite registrar saúde mesmo quando a própria entrega atualiza o timestamp do
webhook. Aplicado ao cliente API, webhook e instância.
As regras de liberação de contrato continuam preservando pausas administrativas,
chaves revogadas e isolamento entre organizações.

## Validação

- 27 testes passaram: dezesseis regressões de concorrência/saúde e onze de contratos.
- TypeScript e ESLint dos arquivos alterados passaram.
- Correção publicada às 12h02 BRT no slot a/3130, versão `174e10c1`;
  fallback `d7c403cc` no slot b/3131. Build completo de 120 páginas passou.
- Candidato e HTTPS público passaram em saúde/versão, páginas/assets, autorização
  das rotas, Inngest assinado (58 funções), métricas e socket privado. Builder parado.
- Na nova versão, repetidas as duas consultas autenticadas com a chave existente
  da Vision: ambas 200, instância conectada. Nenhuma credencial girada/criada.
- Envio/recebimento real de mensagem e confirmação pelo titular ainda não testados.
