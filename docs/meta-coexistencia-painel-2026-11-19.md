# Coexistência pelo painel (admin e cliente) — 19/11/2026

Decisão do titular em 19/11: a ConnectyHub usa um único número, +55 11 91018-8233,
para atendimento por QR (UAZAPI/Global, agente interno Eliane/Atendimento),
Google, Meta e disparos oficiais pela Cloud API em coexistência com o app
WhatsApp Business. Para a própria ConnectyHub, isso substitui a regra de dois
números de 11/10. Na Meta, o número está na conta “App WhatsApp Business”
2133522687196167 (renomeada pelo titular para Eliane da ConnectyHub).

## O que mudou no código

- `Conectar WhatsApp` em `/admin/meta` e `/dashboard/chat-meta` oferece
  **Número novo** (fluxo comum, `featureType: ""`) ou **Número que já uso no app
  WhatsApp Business** (Embedded Signup v4, `featureType:
  "whatsapp_business_app_onboarding"`, `sessionInfoVersion: "3"`).
- O modo fica gravado na tentativa de uso único (`meta_whatsapp_oauth_attempts.mode`),
  mas quem decide é a Meta: o servidor lê `is_on_biz_app` e `platform_type` do
  número. Número do app no fluxo comum é recusado; coexistência exige
  `is_on_biz_app=true` e `CLOUD_API`. O evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`
  pode trazer só o WABA; o servidor escolhe o único número do app nesse WABA.
- Coexistência **nunca chama `/register`**; o botão de PIN some e o servidor recusa
  registro. A separação UAZAPI é substituída por: aceita a instância QR da mesma
  empresa; recusa instância ativa de outra empresa (arquivadas são histórico) e
  vínculo existente do piloto por API (`connectyhub_meta_coexistence`).
- Depois de `subscribed_apps`, pede uma vez contatos (`smb_app_state_sync`) e
  histórico (`history`) em `/{phone}/smb_app_data`, dentro de 24 h do vínculo.
  Reserva antes da chamada; resultado incerto não é repetido.
- Webhook oficial: `smb_message_echoes` vira registro `outbound/sent` com
  `content.source=business_app_echo`, sem arquivo no CRM, sem opt-out e sem IA.
  `history` com progresso 100 marca histórico recebido; erro 2593109, recusado.
  `state_sync` marca contatos recebidos. `PARTNER_REMOVED`/`ACCOUNT_OFFBOARDED`
  desconectam o número em coexistência e pausam campanhas em execução.
- Migration 0224: `mode` na tentativa; `coexistence`, `coexistence_linked_at`,
  `history_sync_state`, `contacts_sync_state` na conexão. Sem novos grants.

## Respostas duplicadas e ecos

O pipeline oficial (`ingestOfficialWhatsApp`) nunca dispara resposta de IA: só grava
para a caixa oficial e o CRM. A IA continua só na UAZAPI. Num número em coexistência,
cada mensagem do cliente chega pelos dois caminhos, mas só a UAZAPI responde.
As respostas da Eliane enviadas pela sessão QR voltam como eco na Cloud API e são
apenas registradas. Mensagens digitadas no celular continuam pausando a IA na UAZAPI
como intervenção humana (comportamento já existente).

Limite conhecido: mensagens enviadas pela Cloud API (campanha ou Chat Meta) aparecem
na sessão QR como enviadas pelo próprio número e, pela regra atual, também pausam a
IA naquela conversa pelo tempo configurado de intervenção humana. Revisar antes de
liberar campanhas nesse número. A mensagem recebida também fica em duas conversas do
CRM (QR e oficial), sem entrar duas vezes no contexto do agente.

## Requisitos da Meta (documentação oficial consultada em 19/11)

- Fonte: developers.facebook.com, “Onboarding WhatsApp Business app users”
  (custom flows do Embedded Signup), versão 5 e referência `account_update`.
- App WhatsApp Business **2.24.17 ou superior**; parceiro precisa ser Tech Provider
  ou Solution Partner. País/Brasil e regras de atividade do número não estavam
  explícitos nas páginas lidas.
- Não registrar o número; assinar `account_update`, `history`, `smb_app_state_sync`
  e `smb_message_echoes`. Sincronizações: uma vez cada, em até 24 h; senão é preciso
  desconectar e refazer.
- Ao concluir, **todos os aparelhos conectados são desvinculados**: WhatsApp Web e a
  sessão QR da UAZAPI precisam ser conectados de novo. WhatsApp para Windows e WearOS
  não são suportados como acompanhantes.
- Vazão fixa de 20 mensagens/s. Grupos, listas de transmissão (só leitura), mensagens
  temporárias, visualização única, chamadas, status e catálogo não passam pela API.
- Mensagens pelo app seguem gratuitas; pela Cloud API seguem a tarifa da Meta e não
  abrem janela de atendimento. Inatividade do celular por cerca de 14 dias pode
  desconectar (`PRIMARY_INACTIVITY`).
- Embedded Signup v2/v3 foram descontinuados em 15/10/2026; o painel usa v4.
