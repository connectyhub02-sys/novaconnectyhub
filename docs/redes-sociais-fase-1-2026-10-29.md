# Redes sociais — primeira fase, 29/10/2026

## Entrega local

O titular aprovou uma área única de publicação nos painéis do cliente e do admin.
Esta entrega prepara a navegação e as conexões YouTube/TikTok. Não implementa o
publicador dessas redes e não comprova aprovação de aplicativo ou autorização real.

| Área | Cliente | Admin, operação própria |
| --- | --- | --- |
| Publicações | `/dashboard/redes-sociais/publicacoes` | `/admin/redes-sociais/publicacoes` |
| Calendário | `/dashboard/redes-sociais/calendario` | `/admin/redes-sociais/calendario` |
| Biblioteca | `/dashboard/redes-sociais/biblioteca` | `/admin/redes-sociais/biblioteca` |
| Contas | `/dashboard/redes-sociais/contas` | `/admin/redes-sociais/contas` |

O editor, a biblioteca, o calendário e a análise de mídia Meta existentes são
reutilizados. Links antigos de publicações/calendário/biblioteca redirecionam às
novas áreas. Os registros, aprovações, controles financeiros e workers existentes
foram preservados. Agentes continuam na área Agentes; anúncios e atendimento Meta
permanecem na seção Meta. Integrações e Central Meta apontam para a nova área.

Contas conectadas apresenta o estado cadastrado da Meta e permite iniciar OAuth
de YouTube/TikTok quando configuração e banco estiverem disponíveis. Ausência de
schema é indicada como preparação; falha de consulta não aparece como lista vazia
ou como conexão operacional. Conectar não publica. A conta autorizada deve ser
selecionada pelo gestor antes de qualquer uso futuro.

## Preparação do banco e dos aplicativos

Aplicar [0220_social_connections.sql](../supabase/migrations/0220_social_connections.sql)
no Supabase da ConnectyHub antes de habilitar conexões. Migration ensaiada em
PostgreSQL local via PGlite, **não aplicada ao banco de produção nesta entrega**.
Cria `social_connections`, `social_oauth_attempts` e RPC transacional de conclusão.
São tabelas exclusivas do servidor: RLS habilitado, sem acesso anon/authenticated,
inclusive ao RPC. Original de mídia continua no R2; esta fase não altera storage.

Configurar em Admin → Manutenção, nas novas integrações YouTube e TikTok, ou nas
variáveis correspondentes. Nunca incluir valores secretos neste documento.

| Aplicativo | Configuração | Retorno OAuth a cadastrar |
| --- | --- | --- |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | `https://www.connectyhub.com.br/api/dashboard/social/youtube/callback` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `https://www.connectyhub.com.br/api/dashboard/social/tiktok/callback` |

O servidor deriva o retorno de sua URL canônica (`NEXT_PUBLIC_APP_URL`); não aceita
retorno arbitrário fornecido pelo navegador. Usar aplicativo/projeto dedicado ao
YouTube para evitar acoplamento com os grants do Google Ads. A chave de criptografia
da aplicação continua obrigatória. Credenciais do cofre prevalecem sobre ambiente.

YouTube: habilitar YouTube Data API, cliente OAuth Web, domínio e consentimento;
escopos `youtube.readonly` e `youtube.upload`. O primeiro permite identificar o
canal via `channels.list?mine=true`; o segundo prepara o futuro envio. Não pede
Developer Token nem escopos de Ads. Verificar a configuração do projeto, quotas e
requisitos de verificação no portal; não inferir liberação a partir das chaves.

TikTok: configurar Login Kit Web e Content Posting API, escopos `user.info.basic`
e `video.publish`, callback HTTPS estático. A conta é identificada por `open_id`
e `display_name`. Preparar verificação do domínio/prefixo usado pelo R2 antes da
fase de envio por URL. Auditoria de Direct Post e sua demonstração integral ficam
dependentes do publicador e da experiência final de consentimento; não submeter
esta tela de conexão como demonstração de publicação já implementada.

## Segurança e ciclo da conexão

- Início por POST de mesma origem, nunca por link com prefetch. Rate limit e
  tamanho de payload limitados. Papel owner/admin e organização ativa conferidos.
- Admin usa somente a operação interna; painel cliente usa o workspace atual,
  inclusive no acesso assistido. Não aceita ID de outra empresa no payload.
- Estado aleatório, hash no banco, cookie HttpOnly separado por provedor, TTL de
  dez minutos e vínculo ao usuário, empresa e painel. Callback exige sessão atual.
- Consumo atômico impede replay. Conclusão transacional só salva tokens se a
  tentativa ainda existir; desconectar ou começar outra conexão cancela a anterior.
- Access/refresh tokens criptografados juntos. Não chegam aos componentes,
  respostas JSON de gestão, URLs de retorno ou logs deste módulo.
- Verificar conexão renova token próximo de expirar, preserva refresh token Google
  quando omitido e persiste rotação TikTok antes de consultar o perfil. Reserva da
  operação impede verificações concorrentes. Falha incerta pede reconexão, sem
  repetição automática da troca. Renovação periódica será ligada ao worker futuro.
- Desconectar remove acesso local e tentativas pendentes e tenta revogação oficial.
  Se ela não for confirmada, orienta remoção do acesso no provedor, sem afirmar
  revogação concluída. Nenhuma publicação é enviada por conectar/verificar/remover.
- Grant isolado de review Meta permite apenas as novas rotas do editor/calendário/
  biblioteca; não libera Contas, OAuth YouTube/TikTok ou administração.

## Validação e limites

- 69 testes focados em oito arquivos passaram, excluindo cópias de `tmp/**`:
  contratos de provedor, autorização/escopo, callback/replay/CSRF, migration/RLS,
  cancelamento concorrente e regressão do publicador/OAuth Meta.
- TypeScript e ESLint dirigidos passaram. Build Next.js de produção passou,
  incluindo as novas páginas e endpoints.
- Prévia dos componentes reais com contas fictícias em desktop 1440 px e celular
  390 px, cliente e admin: sem erros JavaScript nem overflow horizontal. Menu móvel
  aberto nos dois painéis. Arquivos em `output/redes-sociais-20261029/`.
  Esta prévia valida apresentação; não equivale a login ou OAuth real.
- Uma verificação adicional do teste existente `connecty-shell-responsive-layout`
  encontrou expectativa textual antiga de largura. O mesmo trecho já está assim
  no HEAD anterior (Chat Meta/voz também usam largura total). Não foi causado pela
  seção social; teste antigo não foi alterado e não se afirma suíte inteira verde.

Sem deploy, push, aplicação de migration em produção, cadastro/alteração nos
portais, conexão real, publicação ou consumo de IA nesta fase. O teste local não
comprova concessões externas. Não houve alteração nas mudanças paralelas da API IA.

## Próximo marco

Aplicar SQL e configurar os dois aplicativos, validar conexão/seleção/renovação/
revogação em contas próprias e depois em uma organização cliente real. Preparar
as evidências de review conforme a funcionalidade disponível. Em seguida, criar
publicação com entregas independentes, validar mídia e implementar os transportes.
Ainda faltam publicação YouTube/TikTok, worker social, upload retomável de vídeo,
inspeção técnica completa e avaliação editorial por plataforma.

Referências oficiais consultadas nesta implementação:

- [TikTok Login Kit Web](https://developers.tiktok.com/doc/login-kit-web)
- [TikTok: tokens, renovação e revogação](https://developers.tiktok.com/doc/oauth-user-access-token-management)
- [Google OAuth para aplicações Web](https://developers.google.com/identity/protocols/oauth2/web-server)
- [YouTube channels.list](https://developers.google.com/youtube/v3/docs/channels/list)
