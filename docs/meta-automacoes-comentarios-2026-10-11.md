# Agentes unificados e automações de comentários — 11/10/2026

## Acesso isolado para inspeção social — 17h28 BRT

Release `a00de7b4484815cadb903ae8aecffce2e2c1f3e9` publicada no slot b/3131;
fallback a com `bbda4099`. Builder parado; sem migration. 21 testes dirigidos
de acesso, isolamento e editor passaram, além de ESLint, TypeScript, build e
smoke de candidata/domínio (health/SHA, assets, logout, autorização e Inngest).

A conta dedicada de revisão pode acessar `/dashboard/meta/revisao` e somente
os endpoints sociais exatos necessários. Não há prefixo genérico de acesso;
admin, cobrança, API geral de agentes e ativação operacional continuam negados.
O editor verifica grant confiável não expirado, organização correspondente e
associação antes de ler/gravar; ignora organização enviada pelo navegador,
revalida canais reais e força revisão humana privada. Não oferece ação de
ativação de webhook pela API específica da conta de revisão.

Teste na sessão real `meta-review@connectyhub.com.br`: página abriu, agente
"Assistente de avaliação Meta" salvo pausado, duas regras de exemplo salvas
como rascunho e zero envios. Tentativa de navegar ao admin foi bloqueada pelo
navegador; testes de proxy confirmam a resposta 403 esperada. Nenhum histórico
ou credencial social adicional foi transferido de outra organização.
Captura `.codex-screens/meta-revisao-social-isolada-20261011.png`.

Instruções gerais da Meta receberam o endereço e a distinção entre inspeção
da configuração nessa conta e demonstração real nos ativos próprios internos;
reabertura confirmou persistência. A conta ainda não reproduz envio social
real: exige conexão elegível e ativação operacional específica. Não contornar
esse requisito compartilhando acesso admin ou copiando conversas privadas.

## Piloto completo pelo painel e situação final — 17h BRT

Publicado `bbda4099031abf1b69ac0f2008bbb74dd97c156c`, slot a/3130 às 17h02,
sem migration. Atendimento da organização interna em `/admin/meta/atendimento`
compartilha automações, inbox, aprovações e fila dos clientes, com autorização
admin restrita à própria empresa. Status do cadastro corrigido para `online`.
Diagnósticos removem parâmetros sensíveis de endpoints e grants vêm apenas da
resposta OAuth. Limpeza de um registro de integração e um log confirmada, sem
valores secretos neste relatório. Último conjunto: 54 testes/8 arquivos,
ESLint, TypeScript, build e smoke candidata/domínio passaram; builder parado.

Sessão admin restaurada pelo titular. Perfil participante autorizado:
`lunaesindy`; destino próprio `connectyhub.ai`, publicação `DWE1hplEbXK`,
media `17936053611033325`. Piloto live usa apenas organização interna
`c5b8e371-b60d-4a17-94da-0a93e69a285d`; clientes continuam dry_run.

1. Comentário `18074298824767381`, palavra-chave `VALIDACAO CH1110`:
   regra específica gerou revisão; operador aprovou no painel. Resposta
   privada HTTP 200 às 17h04 BRT, recebida no Instagram Web.
2. O participante respondeu no Direct. Agente gerou rascunho; operador revisou
   e editou antes de aprovar. Envio HTTP 200 às 17h05, recebido no Instagram.
   Isso demonstra IA com revisão humana, não resposta autônoma sem edição.
3. Comentário `17893268277435322`: segunda regra, limitada à mesma publicação,
   gerou resposta pública IA. Aprovada sem edição; HTTP 200 às 17h07, resposta
   visível ao expandir a discussão no Instagram. Monitor: três enviados,
   zero falhas/retries. As duas regras e o agente foram pausados ao encerrar;
   follow-up permaneceu desligado. Não houve teste de opt-out neste percurso.

O botão web_url foi aceito pela API, porém não apareceu no Instagram Web.
Não afirmar homologação visual de botões, Messenger, Facebook ou clientes
externos com base neste piloto próprio.

Vídeos de capturas reais, H.264 1920×1080, sem áudio, cortes de espera e títulos
em inglês; sidebar privada excluída dos trechos de Direct:

- `output/meta-review-20261011/comments/edit/instagram-comment-to-direct.mp4`
  — 89 segundos, configuração, comentário, revisão, recebimento e continuidade.
- `output/meta-review-20261011/comments/edit/instagram-comment-ai-reply.mp4`
  — 50,53 segundos, regra, comentário, revisão e resposta pública visível.

App Review continua **não enviado**. Após o teste, instagram_manage_comments
e instagram_basic seguem 0/1 chamada; o portal informa até 24h para atualização.
Upload automatizado fechou o formulário sem anexar; fallback CDP não é suportado.
O titular anexou manualmente ambos os vídeos. Reabertura confirmou o anexo de
comentários e a declaração marcada. Mensagens passou a exibir `Edit`, com
formulário concluído após o aceite autorizado e salvamento. Descrição de Direct
atualizada para relatar a edição humana e o limite visual do botão. Isso ainda
não é submissão nem aprovação. Evidência local:
`.codex-screens/meta-video-comentarios-salvo-20261011.png`.

Pendências de avaliação: contabilização dos testes, conexão/ativação social
real na conta isolada para reprodução (inspeção já publicada), validar Messenger e comentários
Facebook antes de declarar essas permissões demonstradas. Publicação do código
e piloto próprio não equivalem à aprovação de acesso avançado de clientes.

## Ajuste de layout e controle explícito — 16h36 BRT

Release `c01806f59dc91494d1e211cee6d6d63ebb0cb0ce` publicada no slot a/3130.
Removida a seleção de canais do editor principal; criação/edição agora usa uma
linha compacta, com comentários e opções avançadas recolhidos. O modal foi
conferido em navegador, sem a rolagem anterior. A seção Instagram/Facebook em
Automações usa o mesmo Panel sanfona, fechado por padrão; abrir revelou as
configurações existentes, sem alterar o rascunho salvo do cliente.

Comentários sem correspondência com uma regra ativa não geram execução nem
envio. Marcar o canal no agente apenas autoriza a automação; conteúdo, gatilho,
filtro de publicação e revisão continuam explícitos por regra. Guards revalidam
o estado antes do envio. 104 testes relevantes, ESLint e TypeScript passaram;
build e smoke na candidata/domínio confirmaram health/SHA, assets, logout para
a home, autorização e Inngest assinado. Capturas locais:
`.codex-screens/agente-canais-compactos-20261011.png` e
`.codex-screens/automacoes-meta-sanfona-20261011.png`.

Reconsulta do App Review após a publicação: instagram_basic e
instagram_manage_comments permanecem em 0/1 chamada; o primeiro tem vídeo
anexado, o segundo ainda não. Submit continua bloqueado. A sessão admin foi
restabelecida pelo titular para prosseguir com a demonstração própria.

## Implementação

- Removidos o menu redundante **Agentes nos canais** e a aba **Redes sociais**. A rota antiga redireciona para Agentes. Criação/edição de agente da empresa e editor principal exibem WhatsApp, Direct, Messenger e comentários. O servidor exige integração, ativo selecionado, permissões concedidas e ativação de webhook para novas seleções Meta. Desativar continua permitido após desconexão.
- Em **Automações**, após follow-up e antes de grupos/canais/status, há modelos de comentário com expressão → mensagem privada com botão HTTPS opcional, e qualquer comentário → resposta pública com IA. Configuração por agente/empresa, filtros por IDs de publicação, rascunhos, pausa, revisão opcional e simulação local sem envio/consumo.
- A mensagem privada escolhida não chama IA; continuidade usa o mesmo agente somente após mensagem do contato e conforme a opção salva. Publicação de comentário com IA usa o contexto existente do agente. Revisão apresenta o destino público/privado e o botão antes do envio.
- Follow-up social permite uma retomada por resposta privada realmente enviada, entre 15 e 1.200 minutos, dentro de 23 horas desde a entrada do contato (margem para janela padrão de 24h). Não nasce de comentário ou visita. Nova mensagem, resposta humana, pausa, opt-out, conversa encerrada ou configuração alterada cancelam a retomada.
- Fila reaproveita Inngest/sweep e agent_runs existentes, com deduplicação por comentário e follow-up. Revalida regras antes de gerar e enviar; não repete resultados incertos. Metadados ficam no agente, sem migration. Clones começam sem automações/canais Meta ativos; mudança de empresa limpa automações anteriores.

## Limites explícitos

Envio social continua dependente de permissões, contrato/plano, ativo, credenciais, ativação por canal e modo global live. Esta entrega não muda o padrão dry_run nem ativa regras de clientes. Testes simulados não homologam a entrega do botão ou resposta privada na Meta.

Agentes internos de escopo platform não são selecionados pelo dispatcher social de organizações; configurar atendimento no agente da empresa pelo painel empresarial. WhatsApp mantém o controle de atendimento em Comportamento e conexão QR já existente.

Até 20 regras por agente, 50 IDs de publicações por regra e consulta de até 200 respostas privadas recentes por sweep. Seleção visual de publicações e expansão dessa paginação ficam pendentes. Canais de transmissão do Instagram não estão habilitados nem tratados como grupos WhatsApp. Publicações/Stories continuam com os limites da entrega anterior; a existência do calendário não comprova publicação de Stories pela API.

## Permissões e demonstração

Portal ConnectyHub Connect inspecionado nesta data: pedidos WhatsApp e instagram_basic ainda **Not submitted**, não aprovados. instagram_basic mostrava zero chamadas contabilizadas. Adicionados ao rascunho instagram_manage_comments, instagram_manage_messages, pages_manage_engagement e pages_read_user_content; pages_messaging e pages_manage_metadata reincluídos. Os seis pedidos foram conferidos na lista Not submitted. O formulário de pages_manage_metadata mostrava 0 de 1 chamada exigida e alerta de até 24 horas para contabilização.

O formulário exige descrição, screencast real de ponta a ponta, chamadas de teste quando indicadas e declaração de uso permitido. Submit for review estava desabilitado. As descrições de uso dos seis pedidos foram preenchidas e salvas parcialmente; não foram marcados vídeos/testes concluídos nem novas declarações finais. O Messenger também pede conta real Facebook com papel Tester, seleção de Página e instruções de reprodução. O perfil distinto de Instagram para o piloto foi solicitado ao titular. Não declarar teste executado com base na simulação local. Roteiro de homologação:

1. Reconectar somente ativos próprios com os novos escopos concedidos; verificar assinatura de eventos e canal pronto.
2. Em Agentes, selecionar comentários e Direct/Messenger. Em Automações, criar regra própria de palavra-chave e outra pública, com revisão inicialmente.
3. Conta de teste autorizada comenta em publicação própria. Mostrar entrada no painel, correspondência da regra, revisão, envio privado com botão e recebimento no Instagram/Messenger.
4. Mostrar resposta do contato e continuidade pelo mesmo agente; para público, mostrar comentário e resposta efetivamente visível na publicação.
5. Demonstrar pausa e opt-out. Gravar vídeo do percurso real, disponibilizar acesso de avaliação isolado e anexar a cada permissão correspondente.
6. Confirmar testes contabilizados e requisitos concluídos no portal antes do envio final.

Referências oficiais consultadas: [coleção Instagram da Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [templates](https://www.postman.com/meta/instagram/folder/rl2amj3/templates), [Send API Messenger](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api). Human Agent não foi usado para estender envio automatizado além da janela padrão.

## Preparação do piloto com Vision Home — continuação de 11/10

O titular autorizou usar o perfil Instagram `visionhomeoficial`, confirmado na sessão aberta, como participante do teste em `connectyhub.ai`. Localizada publicação própria com chamada “EU QUERO” (`/connectyhub.ai/p/DWE1hplEbXK/`). Nenhum comentário ou Direct foi enviado nesta preparação.

Após autorização específica, foram salvos no Facebook Login for Business do app ConnectyHub Connect, configuração `1530551425223156`, os escopos `instagram_manage_comments`, `instagram_manage_messages`, `pages_manage_metadata` e `pages_messaging`, preservando os seis anteriores. Reabertura do editor confirmou dez selecionados. Isso altera os escopos solicitados pelo login; não concede permissões ao token existente nem aprova App Review.

Auditoria somente de leitura em produção confirmou que a integração da organização ConnectyHub Interno ainda registra apenas ads_read, business_management, instagram_basic, pages_read_engagement, pages_show_list e public_profile; Página e Instagram próprios selecionados. Não há agente vinculado a essa organização na consulta a agent_registry. É necessário reconectar os ativos próprios, verificar grants/eventos, preparar agente da empresa e ativação controlada antes do comentário real. A aba administrativa acessível no Chrome Connecty continuou exibindo acesso restrito como cliente após recarga; solicitado localizar a sessão administrativa informada pelo titular. Não usar a organização BuffaloMass ou o perfil Vision Home como substituto do destino próprio.

## Validação da publicação anterior

### Continuação: entrega real com lunaesindy

O novo login administrativo foi confirmado no Admin OS e o OAuth concluído para os mesmos ativos próprios. O painel mostrou os quatro novos grants efetivamente concedidos. Em seguida, consultas oficiais mostraram apenas assinatura WhatsApp no app e nenhuma inscrição na Página. Foram configuradas e verificadas: assinatura Instagram `comments,messages,messaging_postbacks` no callback existente e inscrição da Página própria em `messages,messaging_postbacks`, preservando WhatsApp. Não foi ativado feed/Messenger de outras empresas.

O perfil ativo no Instagram havia mudado para connectyhub.ai; nenhum comentário foi enviado por ele. Vision Home já não aparecia entre as sessões salvas. O titular autorizou substituir pelo perfil `lunaesindy`, confirmado antes do envio. Comentário `18449498941120368`, na mídia `17936053611033325`, publicado às 19:07:02 UTC / 16h07 BRT: “EU QUERO — teste autorizado da integração ConnectyHub.” A Graph API confirmou autor/texto; evento `f82bdc9e-9aeb-4c48-aba4-24b597423479` chegou às 19:07:07 UTC, status processed e sem erro.

Teste isolado usando o token da Página no servidor enviou uma única resposta privada pelo endpoint Page/messages, recipient.comment_id, com template button e link para a home. Proteção por arquivo exclusivo impediu repetição automática do envio. HTTP 200 às 19:08:52 UTC; mensagem conferida nas solicitações do Instagram de lunaesindy. Aceita a conversa, foi enviada “TESTE ConnectyHub — recebi a mensagem no Direct.” e o evento de retorno `76f4f606-82b6-4c78-84c7-f3a15cec34b8` foi processado às 19:09:59 UTC, sem erro. Capturas locais em `.codex-screens/instagram-comentario-lunaesindy-20261011.png` e `instagram-direct-lunaesindy-20261011.png`.

Limites: foi teste direto e controlado da API/recepção, não execução da regra pelo painel nem resposta de IA. O texto chegou, mas o botão Conhecer plataforma não apareceu no Instagram Web; compatibilidade visual/clique ainda pendente. Não habilitado envio global live, não criado agente interno, não gravado vídeo completo nem concluída submissão. A assinatura da Página contém somente messages e messaging_postbacks; o checklist atual ainda espera outros campos. Esses resultados não devem ser apresentados como homologação de toda a automação.

Após o teste real, os formulários de instagram_manage_comments e instagram_basic foram abertos novamente: ambos ainda mostravam `0 of 1 API call(s) required`, com aviso da Meta de até 24 horas para contabilização. instagram_basic já possui screencast anexado; instagram_manage_comments ainda não. A submissão permanece incompleta e não enviada.

253 testes em 34 arquivos Meta/multicanal/editor passaram (uma asserção de texto antiga foi atualizada para a mensagem atual do botão e reexecutada). Cobertura inclui autorização por empresa, agente estrangeiro, ativação forjada, gravação de rascunho, conflito de atualização, regra pausada/alterada, mensagem pronta sem IA, janela e cancelamento de follow-up. TypeScript e ESLint passaram. Aplicação 8ce71446c7c7f59e5346798560992b6510df9535 publicada no slot b/3131 às 15h37 BRT; fallback a/3130 preservado em d4dd3736. Build, health/SHA, assets, logout, autorização e Inngest assinado passaram na candidata e no domínio. Builder parado. Credenciais temporárias do smoke removidas. Conta de revisão manteve sua allowlist. O modo global continua dry_run. Editor e modais exibiram os canais; em Automações, a simulação e gravação de rascunho pausado funcionaram, com persistência após recarga. A remoção do rascunho de teste ficou em confirmação nativa do Chrome; nenhuma mensagem foi enviada ou regra ativada.
