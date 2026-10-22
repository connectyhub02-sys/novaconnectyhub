# Áudios no atendimento: metadados confundidos com transcrição — 22/10/2026

## Diagnóstico

O titular mostrou um áudio do WhatsApp interno com JSON de transporte exibido
sob o título Transcrição. Consulta de leitura confirmou que era uma mensagem
histórica externa, sem `media_transcription`: `text_content` e o `content` do
provedor continham JSON serializado com URL, MIME, hashes, chave de mídia e
demais descritores do arquivo. Não era texto produzido por transcrição.

Na consulta direcionada aos áudios cujo texto começa com JSON, foram encontrados
23 registros em cinco organizações: dois na organização interna e 21 nas demais
quatro. Isso comprova ocorrência em clientes, sem constituir auditoria exaustiva
de todos os formatos e períodos. Identificadores, conteúdo privado, endereços de
arquivos e chaves não são registrados neste relatório.

Admin (`/admin/whatsapp/atendimento`) e cliente (`/dashboard/atendimento`) usam
`LeadCrmConsole`, o mesmo mapeamento de mensagens e o mesmo player de áudio.

## Correção

- Leitor compartilhado reconhece descritores de mídia serializados, incluindo
  codificação dupla; extrai somente texto/legenda quando houver. Prosa, emoji,
  links comuns e JSON sem assinatura de transporte continuam legíveis.
- Ingestão deixa de salvar esses descritores como fala; mantém o payload técnico
  original e reconhece áudio mesmo quando o tipo genérico recebido é `media`.
- Histórico existente é corrigido na leitura, incluindo prévias, resumos de
  conversas e mensagens citadas, sem migração ou reescrita dos registros.
- Resolução de mídia passa a interpretar o `content` serializado para reconhecer
  MIME e endereço do arquivo. Links criptografados do WhatsApp continuam atrás
  do endpoint protegido, com escopo de organização preservado.
- O chat só mostra o bloco Transcrição quando existe texto legível. Na ausência,
  mostra o player e “Sem transcrição disponível”. Falha de reprodução ganha aviso
  e botão Tentar novamente. Balões e texto quebram dentro da largura disponível.

## Validação

- 86 testes de regressão em oito arquivos, com cobertura de mapeamento histórico,
  webhook de entrada/saída, citações, mídia, histórico e isolamento; TypeScript
  e ESLint aprovados. Os testes afetados foram repetidos após o ajuste de citações.
- Navegador local com o componente real e APIs simuladas: JSON técnico ausente,
  transcrição real preservada, ausência de áudio identificada, erro/retry e
  reprodução de WAV de teste; sem transbordamento em 1366 e 390 px.
  Capturas locais `.codex-screens/chat-audio-{1366,390}.png`.
- O novo leitor foi aplicado em memória ao registro real do print, sem escrita:
  texto legível nulo, áudio OGG/Opus reconhecido, URL criptografada identificada
  e reprodução direcionada ao endpoint protegido.
- Sem envio WhatsApp, geração ou transcrição paga, exclusão de mensagens ou
  alteração de carteiras. A disponibilidade do arquivo antigo no provedor não
  foi testada por download; a correção não promete recuperar arquivo expirado.

## Publicação

Publicado em 22/10/2026 às 15h39 BRT: `77265430`, slot a/3130. Anterior
`3c5bfb17` mantido no b/3131 para retorno. Build, TypeScript de produção e 120
páginas aprovados. Candidata e HTTPS público: saúde/SHA, 19 assets, páginas
admin/cliente redirecionando para login sem sessão, APIs de atendimento e
histórico/mídia protegidas (401/403), fixture local 404, bundle com a correção
e Inngest assinado 200 com 58 funções. Builder e servidor local de teste parados.
Interação validada localmente; não foi feita reprodução do arquivo privado
antigo ou conferência visual autenticada no navegador de produção.
