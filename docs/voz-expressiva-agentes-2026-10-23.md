# Voz expressiva nos agentes — 23/10/2026

## Escopo e compatibilidade

Primeira etapa solicitada pelo titular: controles em Comportamento → Voz do
agente, compartilhados por cliente/admin e agentes internos. Modelos ElevenLabs
do Estúdio, seis interpretações do v3, intensidade, ajustes avançados compatíveis
e prévia de até 600 caracteres com estimativa. Gemini continua no seletor de
baixo custo existente; os controles exclusivos ElevenLabs não são aplicados a ele.

`audioStudioSettings` é uma preferência opcional, versionada e normalizada.
Ausência/null mantém integralmente a geração e cobrança legadas. Ler, abrir a
tela, pausar, retomar ou salvar outro campo não ativa a personalização. O usuário
escolhe o modelo e salva o comportamento; “Configuração atual — manter” volta
ao caminho legado. Nenhum registro de agente é migrado automaticamente.

Runtime de respostas, teste de cliente/admin e geração de áudio de campanhas
propagam a preferência. Não habilita resposta em áudio em novos canais: mantém
os transportes, o modo texto/áudio/espelho e as regras de entrega existentes.

## Síntese, custo e repetição

Preparação usa `performance.ts` e `model-controls.ts` do Estúdio. Intensidade
determina estabilidade nos estilos expressivos; v3 Natural oferece estabilidade
discreta. Outros modelos mostram apenas controles homologados. Tags são
compiladas depois da sanitização; transcript e CRM não recebem instruções de
interpretação. No novo caminho, pontuação e parágrafos úteis à fala são mantidos.
Não há alteração automática de roteiro nem promessa de duração exata das pausas.

Cotação usa a mesma função `quoteVoice`, modelos habilitados, plano da carteira,
tarifa `text_to_speech`, mínimo e arredondamento do Estúdio. Inclui caracteres
das instruções de interpretação, conforme o contrato existente do Estúdio.
O evento mantém atribuição WhatsApp/organização/agente/conversa. Snapshot da
tarifa é congelado no recibo e usado ao registrar consumo; não há segundo débito
pelo Estúdio. Uso interno mantém sua classificação interna já existente.

Leitura de produção em 23/10: v2/v3 a 0,24 crédito/caractere; Flash/Turbo v2.5
a 0,12, mínimo 5. Não existe sobretaxa por estilo/intensidade. O novo caminho
não depende das tarifas genéricas de WhatsApp nem replica preços fixos na tela.
Tarifas/configurações existentes não são alteradas pela migration.

Migration 0211 cria recibos privados `agent_voice_generations`, com RLS e acesso
somente pelo serviço. Claim único por organização/chave evita novo dispatch em
retry concorrente. Preview guarda a chave durante a tentativa; execução usa
run/chunk e campanha usa item. SDK sem retries automáticos no novo caminho.
Replay concluído reutiliza áudio; falha no metering recupera o áudio persistido
e reaplica o mesmo identificador de débito. Valida voz autorizada da empresa,
acesso, saldo e teto da prévia antes de chamar o fornecedor.

Limite explícito: o novo recibo protege dispatch/metring, não substitui o ledger
financeiro nem cria uma reserva de saldo como a API de Voz. Consumo dos agentes
continua liquidado pelo medidor existente. Resultados incertos de síntese/storage
ficam bloqueados para nova geração nessa chave e exigem conciliação operacional;
não há busca automática no histórico do fornecedor nesta etapa.

## Verificações

- Testes de opt-in, persistência/pausa, quatro modelos, intensidade, payload do
  SDK, transcript, cotação, ownership, teto/saldo, concorrência, replay, recuperação
  de metering, carteira responsável, ACL/RLS SQL e rotas de cliente/admin.
- Regressões existentes de voz, comportamento e integridade financeira: 130
  testes aprovados em 24 arquivos. TypeScript e ESLint dos arquivos alterados
  aprovados.
- Browser com componente real e APIs simuladas: seleção, filtros por modelo,
  prévia, requisição/custo/chave, player sem nova geração, desktop 1366 px e
  celular 390 px, sem overflow ou erros de JavaScript. Capturas privadas em
  `.codex-screens/agent-voice-{1366,390}.png`.
- Um teste antigo de `whatsapp-standard-behavior-location.test.ts` depende do
  marcador da aba `channels`, ausente também em HEAD antes desta alteração.
  Falha estática preexistente, sem relação com voz; não foi alterado nesta entrega.

Não foi gerado áudio pago nem enviada mensagem para testar. A qualidade auditiva
e a latência reais continuam dependentes da prévia com a voz escolhida pelo cliente.

## Publicação

Implementação e validação locais concluídas; build, aplicação da migration e
ativação da candidata serão registrados abaixo após confirmação. A VPS tem
cerca de 8 GiB livres nesta preparação; não foram excluídos dados ou imagens.
