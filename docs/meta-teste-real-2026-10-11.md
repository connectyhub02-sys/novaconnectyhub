# Teste real do WhatsApp oficial e vínculo social — 11/10/2026

> Atualização posterior: Instagram reconectado com leitura real, vídeos anexados
> e conta dedicada preparada. O App Review continua bloqueado pelo contador de
> teste Instagram. Ver [estado mais recente](meta-revisao-conta-dedicada-2026-10-11.md).

## Evidência externa

- Destinatário próprio fornecido pelo titular, verificado no portal da Meta com código de cinco dígitos. Código e telefone particular não são registrados neste relatório.
- Modelo `connectyhub_demo_oficial_20261011` enviado pela interface `/admin/meta` às 10h34 BRT; recibos reais confirmaram entrega e leitura. A resposta `Teste connectyhub` chegou por webhook e foi persistida às 10h35 BRT.
- Primeiro envio de resposta livre foi recusado com código `131030`: a Meta devolveu o destinatário sem o nono dígito, diferente do telefone autorizado na lista de teste. Nenhuma tentativa automática de reenvio foi feita.
- O recibo real de leitura, aberto no portal da Meta, confirmou o `recipient_id` correspondente ao mesmo ID de mensagem enviado. Essa evidência fundamentou a associação inicial do destinatário próprio, limitada ao remetente/organização internos.
- OAuth social concluído após autorização específica do titular para os três ativos e Política de Não Discriminação. Página `293615710491088` e conta `act_447324504473617` retornaram ao painel.
- Permissões efetivamente concedidas: `ads_read`, `business_management`, `pages_read_engagement`, `pages_show_list`, `public_profile`. Instagram `connectyhub.ai` foi selecionado no portal, mas não retornou como conta disponível; `instagram_basic` não foi concedida. Não declarar publicação, comentários, DMs ou gestão de anúncios operacionais com essa conexão.
- Nenhum anúncio foi criado, nem forma de pagamento adicionada.

## Correção encontrada no teste

- Commit de aplicação `d37153a2`: identidade do destinatário correlacionada somente por pares `input`/`wa_id` de respostas da Meta ou `recipient_id` de recibos assinados de mensagens conhecidas. Não há regra de acrescentar/remover dígitos por semelhança.
- Associação isolada por organização e Phone Number ID. Resposta usa o endereço confirmado no envio, consulta a janela real de 24 horas e bloqueios/opt-out de todos os identificadores associados. Associação não cria consentimento nem abre uma janela nova.
- Chat agrupa os dois formatos confirmados. Novas entradas no arquivo do lead usam o endereço associado. Histórico anterior permanece preservado; a correção não apaga nem funde leads antigos automaticamente.
- Migration `0191` aplicada transacionalmente. Tabela com RLS e acesso exclusivo de service role. Backup de esquema anterior: `/var/backups/connectyhub/manual/pre-0191-20261011.sql`.
- Validação local: 29 testes passaram em três arquivos, incluindo destino efetivo da requisição, bloqueios em ambos os identificadores, janela expirada e arquivamento. TypeScript sem erros; ESLint dos arquivos alterados sem erros.

## Pendências de homologação

- Aplicação `d37153a2fae1c7a71cc07e6472605874d975c41b` publicada às 10h50 BRT no slot a/3130. Candidata e domínio público passaram em health/SHA, assets, login, logout 303 para `/`, proteção de painéis/API e GET assinado Inngest. Slot b com `2426cede` preservado para retorno; builder parado.
- Às 10h51, resposta livre enviada pela interface corrigida e confirmada como `delivered` por recibo real. Agora estão comprovados envio do modelo, entrega/leitura, recebimento da resposta e resposta livre pelo painel. O erro anterior permanece no histórico como tentativa falha, sem ocultação nem reenvio automático.
- Captura real da resposta pelo navegador salva localmente em `output/meta-demo-20261011/whatsapp-resposta-real.mp4` (53 segundos), preservando os tempos dos quadros capturados. Não foi enviada à Meta. Ainda faltam a demonstração completa de conexão/modelos e os formulários de App Review. Teste aprovado no laboratório não representa aprovação de permissões para empresas externas.
- Preservam-se os limites do [laboratório](meta-whatsapp-laboratorio-2026-10-11.md): sem lote de mensagens, margem por mensagem, coexistência, agente de IA no chat oficial ou integrações TikTok/YouTube nesta etapa.
