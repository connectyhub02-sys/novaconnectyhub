# Chat Meta oficial — expansão de 11/10/2026

## Implementação

Versão inicial `1fad48f50e7b245402373e4b4b32b5c7eb2dcd77`; correção de histórico
`9660d8994ade14e76d5db7cc3e1fa4d15865189a`. Substitui o
laboratório por atendimento, números, modelos, campanhas e relatórios em
`/dashboard/chat-meta` e `/admin/meta`. O admin opera na empresa interna fixa;
o cliente opera somente na própria empresa, com papel owner/admin.

- Vários números oficiais por organização, com conexão pela janela da Meta,
  nome de operação, registro por PIN e desconexão que pausa campanhas.
  O mesmo remetente não pode ser transferido entre empresas por reconexão.
- Conversas por número + contato, busca na página, filtros de não lidas,
  abertas e atribuídas ao operador, resolução/reabertura e notas internas.
  Histórico paginado, janela de atendimento apurada por remetente e aliases
  somente quando confirmados pelo provedor.
- Texto, até três respostas rápidas e anexos JPG/PNG, PDF, MP4 e áudio
  MP3/OGG/MP4. Imagens até 5 MB; demais arquivos até 16 MB. Downloads autenticados
  e restritos à mensagem da empresa, sem entregar token ao navegador.
- Quatro sugestões de modelos editáveis: novidades, pedido, agendamento e
  retorno solicitado. Texto, variáveis posicionais com exemplos e respostas
  rápidas; criação na conta WhatsApp do número escolhido e status real da Meta.
- Campanhas com remetente explícito, até 10.000 telefones, TXT/CSV contendo
  somente telefones sem cabeçalho, deduplicação e registro de consentimento.
  Primeiro salva rascunho; depois exige revisão e confirmação dos custos Meta.
  Suporta agendamento, pausa, retomada, cancelamento e resultados CSV.
- Recibos reais alimentam contagens de entrega/leitura. A fila usa 20 destinatários
  por rodada de cron a cada minuto, concorrência 1 e sem repetição automática
  de mensagens reservadas com resultado incerto. Erros de provedor pausam a
  campanha; opt-out descarta o contato. Cada envio revalida conta, conexão,
  modelo aprovado e decisões de saída. Não há fallback UAZAPI.

Migration `0192_meta_whatsapp_workspace.sql`: chave da conexão por
`phone_number_id`, threads, notas, mídia, campanhas e destinatários. RPCs
reservam conexões/campanhas atomicamente e recuperam reservas interrompidas.
Tabelas e funções privadas para service_role; RLS não expõe tokens nem conteúdo
diretamente ao cliente. Dados existentes foram mantidos.

## Operação e limites

1. Abra **Meus números → Conectar WhatsApp oficial**. Autorize a empresa e o
   número pela Meta; complete verificação/registro quando solicitado.
2. Em **Modelos**, personalize uma sugestão e envie para análise. A categoria
   indicada é proposta, não garantia de aprovação ou classificação pela Meta.
3. Em **Campanhas**, selecione número/modelo aprovado, importe os telefones
   autorizados e salve para revisão. Somente **Confirmar e iniciar** libera a fila.
4. Acompanhe respostas em **Conversas** e recibos em **Campanhas/Relatórios**.
   Cancelar/pausar não recolhe mensagens já em processamento ou enviadas.

Continuam separados os números Cloud API e QR/UAZAPI. Não foi homologada
coexistência. Modelos com mídia, carrossel, botões de URL e componentes especiais
não são enviados por esta versão; texto e respostas rápidas são suportados.
URLs em texto continuam sujeitas à política existente de links rastreáveis.
Anexos deste chat dependem da disponibilidade da mídia na Meta; não constituem
backup permanente no R2. Não foi ativada resposta autônoma por IA neste chat.

Não há nova margem por mensagem, débito de créditos nem tarifa fixa garantida.
Custos da Meta dependem da conta/categoria/país. Empresas externas ainda dependem
do acesso avançado e das permissões aprovadas. O número de teste fica exclusivamente
na conta de revisão; não reimportar no admin para evitar mover ativos da avaliação.
Múltiplos números reais e envio de lotes a público externo precisam de piloto
com números/contatos autorizados depois das liberações da Meta.

## Validação e publicação

- 76 testes relevantes passaram: política, banco PGlite, recuperação da fila,
  identidade do destinatário, autorização, OAuth, histórico após transferência,
  mídia autenticada e isolamento da conta de revisão.
- TypeScript, ESLint e build da primeira versão passaram. Publicada no slot a/3130
  às 13h00 BRT; health/SHA, páginas/assets, logout 303 para a home, rotas
  protegidas e GET assinado do Inngest verificados na candidata e no domínio.
- Conta real de revisão: GET de números/modelos sem campos secretos; remetente
  estrangeiro negado e admin negado. Rascunho criado uma vez apesar da repetição
  da chave, tentativa de início sem aceite bloqueada, CSV consultado e campanha
  cancelada. Banco confirmou 1 campanha/1 destinatário cancelados e zero envios.
- Interface publicada validada na conta de revisão: histórico real, nota interna
  persistida, assumir/liberar atendimento, quatro sugestões editáveis, modelos
  aprovados e seleção de remetente/modelo da campanha. Desktop 1440 e celular
  390 sem overflow horizontal; override de viewport restaurado.
- PUT Inngest confirmou registro da nova função no app existente da ConnectyHub,
  URL pública preservada. Cron executou com resultado real `processed: 0`,
  coerente com a campanha cancelada; não é prova de envio de lote externo.
- QA encontrou histórico interno de remetente transferido sem conexão atual.
  Correção permite somente consultar/organizar o histórico da própria empresa;
  nunca lê o token da empresa atual nem libera envio pelo remetente transferido.
  Também abre a conversa nas mensagens mais recentes e mantém appsecret_proof
  no upload de mídia. Correção publicada no slot b/3131 às 13h15 BRT, SHA
  `9660d8994ade14e76d5db7cc3e1fa4d15865189a`; build/TypeScript, health, assets,
  logout, Inngest assinado e smoke autenticado passaram. Builder parado.
  Histórico antigo do admin conferido no navegador, com mensagens preservadas
  e envio desabilitado para o remetente desconectado. Upload real do ícone
  público da ConnectyHub na Meta retornou ID e registro de propriedade; nenhuma
  mensagem foi enviada por esse teste.
- Migration aplicada transacionalmente na VPS; backup privado de schema e
  dados de conexão/mensagens em `meta-before-0192-20261011.sql`, modo 600.
  Conferidos: 1 remetente preservado, 2 threads históricas, nenhuma campanha
  antes da validação. PostgREST recebeu recarga de schema.
- Fallback no slot a/3130: `1fad48f5`, compatível com a migration 0192.
  O retorno ao código anterior a essa primeira versão não é transparente para reconectar números,
  pois a chave única por organização foi substituída. Em caso de incidente,
  pausar campanhas e corrigir para frente; não restaurar banco para desfazer
  publicação de interface, nem executar o conector antigo com vários números.

O estado do App Review não foi alterado por esta publicação. Os vídeos anteriores
demonstram os mesmos endpoints no laboratório antigo; as instruções de navegação
da revisão devem ser atualizadas para as novas abas antes do envio final.
