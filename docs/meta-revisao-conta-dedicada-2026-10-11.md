# Revisão Meta — demonstrações e conta exclusiva, 11/10/2026

## Atualização às 19h26 BRT — novos ativos conectados

O titular mudou a sessão Facebook e os ativos para Magno Macedo. Após autorização
específica, o perfil `61582521060298` foi adicionado como Testador ao app. Foi
necessário concluir o cadastro de desenvolvedor e reenviar o convite pendente;
o portal confirmou o aceite. Não foi concedido papel administrativo.

Na configuração de login `1530551425223156`, contas de anúncios passaram a ser
opcionais: a conta disponível estava desativada e impedia a conexão social.
Escopos preservados, sem selecionar anúncios/pixels, cadastrar pagamento ou
criar campanhas. A configuração WhatsApp não foi alterada.

Nova autorização concluída na organização exclusiva de revisão:

- Portfólio BuffaloMass: `1604084310967369`.
- Página `buffalomass.life`: `839794832549513`.
- Instagram `@buffalomasseliteclub`: `17841423784354535`.
- 13 escopos retornados, incluindo comentários e mensagens de Instagram/Facebook.
- Leitura real do perfil pela API oficial confirmada no painel, zero publicações.
- Conta de anúncios selecionada: nenhuma (`selected_ad_account_id = null`).

Inventários antigos ainda aparecem no painel e a credencial antiga de Ads ainda
existe no cofre; não usá-los como evidência de seleção/autorização atual. A seleção
social atual foi conferida no banco; roteamento usa os ativos selecionados.
Agente e regras permanecem pausados, sem ativação social live ou assinatura de
webhooks da nova Página. Falta validar atendimento real nessa conta isolada e
concluir os requisitos/anexos do App Review. Não confundir 13 escopos concedidos
ao testador com aprovação para clientes externos.

Evidência: `.codex-screens/meta-reconexao-magno-instagram-20261011.png`.

## Atualização às 18h43 BRT

Facebook Login concluído na sessão de Carla Silva para a conta exclusiva de
avaliação. Página selecionada `522348677619837` (Pod Cast Pé na Areia), portfólio
`423637757459767`; duas Páginas e uma conta de anúncios retornaram no inventário,
zero Instagram. O titular confirmou que ambas as Páginas são somente de teste.
Conexão devolveu 13 escopos, incluindo os de mensagens/comentários; isso não
comprova aprovação de acesso avançado. Agente continua pausado, sem ativação live.

O Instagram ativo confirmado pelo titular é `@podcastpeareia`, com painel
profissional, zero posts/seguidores. O nome `P0dcastpenaareia` é do portfólio.
A inclusão pela Página falhou e a inclusão direta em Contas do Instagram também
falhou após autenticar a conta correta: “Não foi possível adicionar a conta do
Instagram / Ocorreu um erro desconhecido. Tente novamente”. Não afirmar vínculo
concluído. Evidência local `.codex-screens/meta-instagram-erro-vinculo-20261011.png`.

Vídeo `pages_messaging` confirmado salvo por link “View uploaded screencast”,
inclusive após reabrir. Restam anexos em `pages_manage_metadata`,
`pages_read_user_content` e `pages_manage_engagement`. Tentativa pelo input real
de arquivo também terminou sem filechooser; automação nativa indisponível nesta
sessão. IG basic/comments e quatro permissões Facebook ainda exibem 0/1 chamadas;
solicitação ainda não enviada.

Roteamento de webhooks corrigido e publicado em `63386ecd` (slot b, fallback a
`304c52df`): somente ativos selecionados em conexão conectada, sem usar inventário
de descoberta, e recusa de mais de uma organização correspondente. 33 testes,
TypeScript, ESLint, build e smoke candidata/domínio passaram; sem migration.

## Atualização às 18h10 BRT

Messenger e resposta pública Facebook agora possuem demonstrações reais completas
nos ativos internos, com revisão humana, HTTP 200 e entrega visível. Vídeos novos
prontos, ainda sem anexo. Quatro formulários Facebook salvos com justificativas
e aceites; contadores permanecem 0/1. A conta isolada ainda não reproduz o envio
social. App Review não enviado. [Registro e publicação](meta-messenger-facebook-validacao-2026-10-11.md).

## Atualização às 17h28 BRT

Os registros abaixo descrevem a primeira rodada. A solicitação continua não
enviada, agora com pedidos adicionais de comentários/Direct e Facebook.
Vídeos de comentário → Direct e resposta pública IA foram anexados pelo titular
e os aceites salvos; Direct aparece concluído. instagram_basic e
instagram_manage_comments continuam 0/1 chamada contabilizada. Facebook e
Messenger ainda não têm demonstração real completa.

`a00de7b4` publicado adicionou `/dashboard/meta/revisao` para esta conta e APIs
sociais exatas (agente de revisão, disponibilidade, automações, inbox e
aprovações). Admin/cobrança/ativação operacional continuam negados. Agente e
duas regras de exemplo salvos pausados pela sessão real. Esta é uma área de
inspeção/configuração: reprodução de envio exige ainda conexão social e
ativação própria. Não foi transferido ativo social ou histórico interno.
Instruções gerais da Meta atualizadas e reabertas para confirmar essa distinção.
[Evidências, versões e pendências](meta-automacoes-comentarios-2026-10-11.md).

## Situação da solicitação

App ConnectyHub Connect `1002348522666389`; solicitação `1078832598351314`.
**Ainda não enviada para App Review.** A tela final mantém `Submit for review`
desabilitado. Verificação, configurações, tratamento de dados e instruções aos
avaliadores aparecem completos. Em Allowed usage, somente `instagram_basic`
permanece incompleto: `0 of 1 API call(s) required`. O portal informa que chamadas
bem-sucedidas podem levar até 24 horas para aparecer. Não confundir esse estado
com a Access Verification enviada anteriormente ou com o app já publicado.

Escopo autorizado nesta rodada: `whatsapp_business_messaging`,
`whatsapp_business_management`, `instagram_basic` e renovações de
`pages_show_list`, `business_management`, `ads_read`, `pages_read_engagement` e
`public_profile`. Messenger, leads e Ads MCP ficaram para outra rodada.

As duas justificativas WhatsApp, os vídeos e os aceites foram salvos. A
justificativa Instagram, seu vídeo e o aceite também persistiram ao reabrir o
formulário; falta o requisito de teste contabilizado pelo portal. Renovações
aparecem completas. Foram atualizadas as instruções e credenciais de avaliação;
nenhuma senha ou token é registrada neste documento.

## Demonstrações reais

- `output/meta-review-20261011/whatsapp-modelos-envio.mp4`: criação de modelo,
  lista real e envio consentido com entrega confirmada. O modelo
  `connectyhub_revisao_oficial_20261011` retornou inicialmente PENDING e depois
  apareceu como APPROVED na consulta real.
- `output/meta-demo-20261011/whatsapp-resposta-real.mp4`: recebimento da mensagem
  do titular e resposta livre com recibo delivered.
- `output/meta-review-20261011/instagram/instagram-login-perfil.mp4`: autorização
  real dos ativos próprios e exibição do perfil/mídias pela API oficial.
- Os três vídeos foram anexados às instruções gerais; os vídeos específicos
  também foram anexados às permissões correspondentes. Duas gravações antigas
  já existentes foram preservadas e identificadas como históricas nas instruções.

Após autorização específica, `instagram_basic` foi incluída no login e concedida
na reconexão. Leitor de perfil/mídias publicado em `5dd9b433`; perfil
`connectyhub.ai`, 22 publicações e 12 registros recentes consultados com sucesso.
Isso comprova leitura para os ativos autorizados, não publicação, comentários,
Direct ou acesso avançado para empresas externas.

## Conta exclusiva

Por escolha do titular, foi criada uma conta própria de avaliação, em vez de
compartilhar a conta BuffaloMass com integração financeira de produção.

- E-mail de login: `meta-review@connectyhub.com.br`; login por e-mail e senha,
  separado do Facebook Login usado para conectar ativos.
- Empresa isolada `ConnectyHub — Revisão Meta`, ID
  `4cd0a6bd-4e3c-4773-a9ef-511c802b48df`; usuário sem papel de administrador da
  plataforma e sem outras empresas.
- Acesso até `2027-10-12T23:59:59Z`, concedido por `app_metadata` confiável da
  Auth API, com verificação de associação à empresa. `user_metadata` não concede
  esse acesso. Ciclo trial estendido, sem compra ou cobrança.
- Permitidos `/dashboard/integracoes`, `/dashboard/chat-meta` e endpoints
  específicos de conexão/WhatsApp. Demais rotas administrativas, de conta,
  cobrança e APIs protegidas retornam 403. Não foram inventados CPF, telefone
  verificado ou dados jurídicos para passar pelo cadastro comum.
- Senha aleatória guardada criptografada no cofre Meta da manutenção, nos campos
  `META_REVIEW_LOGIN_EMAIL` e `META_REVIEW_LOGIN_PASSWORD`; cópia operacional
  privada fora do Git. Credencial específica fornecida à Meta no formulário.
- Apenas credenciais do Instagram próprio e o remetente oficial de teste foram
  disponibilizados. Nenhuma credencial Asaas ou conta de anúncios foi copiada.

O número oficial de teste foi **transferido da organização interna para a empresa
de revisão**, pois o Phone Number ID é único. O histórico anterior ficou na
organização original. O painel admin interno, portanto, não mantém simultaneamente
esse remetente de teste. Não reimportar o piloto durante a revisão: isso retiraria
o remetente do avaliador. Não é um número de cliente em produção.

## Publicação e verificações

`aa261387` implementou o acesso restrito e `8fd5203b83aec6487abde824dcad737066a9b546`
corrigiu a abrangência das APIs de conta, removendo o bloqueio visual do formulário
de cadastro comum. Última versão publicada às 11h59 BRT no slot b/3131; slot a com `aa261387`
preservado para retorno. Builder parado após a publicação.

Nove testes de autorização/proxy passaram, além de ESLint e build de produção.
TypeScript passou na implementação do grant. Candidata e domínio público passaram
em health/SHA, assets, login, logout 303 para `/`, proteção de rotas e Inngest
assinado. Testes autenticados confirmaram Instagram/chat/WhatsApp 200 e bloqueios
403 de admin, planos, APIs de cadastro/segurança e tentativa `admin=1`.

Validação real no navegador da conta dedicada: integrações abriram sem o modal
obrigatório de cadastro, perfil Instagram retornou dados reais, chat carregou o
número oficial e sete modelos aprovados. O aviso opcional de notificações foi
fechado sem conceder permissões do navegador.

Novo envio individual pela conta de revisão confirmado como **Entregue às
12h01 BRT**, usando o modelo aprovado e o telefone exatamente fornecido/verificado
pelo titular. A tentativa anterior com o `wa_id` sem nono dígito foi recusada com
131030 e ficou registrada como falha. A organização nova não herdou os aliases
internos; a associação passa a ser comprovada pelo envio aceito nesta empresa.
Não foi introduzida normalização heurística de números nem reenvio automático.

## Pendências explícitas

- Aguardar o portal contabilizar o teste `instagram_basic`, reabrir sua
  justificativa, salvar e concluir o envio; confirmar visualmente `In review`.
  Não registrar como enviada antes dessa evidência.
- Token WhatsApp de teste expira em **10/12/2026 07:15:32 UTC**. A validade de um
  ano da conta de revisão não torna esse token permanente; renovar/manter a
  conexão durante a avaliação.
- Onboarding Embedded Signup de empresa externa e número real não homologados.
- Sem publicação social, Direct/Messenger, automação IA no chat oficial,
  disparo em lote, margem por mensagem ou coexistência nesta entrega.

Evidência local do bloqueio final:
`.codex-screens/meta-revisao-pendente-instagram-2026-10-11.png`.
