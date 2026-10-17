# Estúdio de Voz: interpretação, prévia e roteiro recuperável — 17/10/2026

## Escopo

Primeira entrega autorizada: capacidades por modelo, pausas/emoções no cursor,
perfis de interpretação para vozes comuns e clonadas, prévia paga de um trecho,
rascunho pessoal e histórico com roteiro/configurações das novas gerações.

## Implementação

- `performance.ts` centraliza compatibilidade e compilação determinística. Pausas
  em segundos (0,5 / 1 / 2 / 3) nos modelos SSML; emoções, reações e pausas
  expressivas no v3. Marcações incompatíveis/incompletas são rejeitadas antes da
  reserva. v4 não foi habilitado: acesso/tarifa ainda precisam de conferência.
- Editor usa marcações legíveis `⟦Pausa · 2 s⟧`, preserva texto selecionado,
  desfazer/refazer e oferece edição/remoção de marcações. Não reescreve o roteiro.
- Perfis Natural, Narrador, Contador de histórias, Vendedor consultivo,
  Publicitário e Dramático/cinematográfico. Perfis expressivos requerem v3;
  intensidade ajusta estabilidade e não representa emoção garantida.
- Modelo compacto, ajustes recolhíveis, pronúncia por até três dicionários do
  projeto; configurações/histórico e um único player preservados.
- Prévia de seleção ou início (até 600 caracteres), cotação no servidor e ação
  explícita com custo. Usa a mesma reserva, liquidação e idempotência do TTS;
  não usa a prévia gratuita incluída na clonagem. X-Max-Credits protege a cotação.
- Roteiro e configurações são gravados antes de solicitar áudio curto. Falha ao
  salvar encerra/libera a reserva sem chamada paga. Operações longas guardam o
  roteiro atomicamente na reserva via trigger. Áudios antigos não ganham texto
  inventado. Reuso restaura voz/modelo/ajustes/perfil/idioma/dicionários.
- Novos textos longos preservam tags inteiras e reaplicam o perfil em cada parte;
  cotação e liquidação contam os caracteres efetivamente enviados. Jobs antigos
  sem script continuam com o divisor anterior, preservando partes em andamento.
- Histórico paginado por data+ID, busca no texto salvo, filtros por voz/modelo/data,
  e leitura somente de TTS/audiolivros. Poll de operações pendentes independente.
- Rascunhos por usuário+projeto+organização no servidor, sem texto em localStorage.
  Controle de versão evita sobrescrita entre abas; aviso ao sair com alterações
  não salvas. Endpoints revalidam sessão, contrato e acesso ao projeto.

## Banco e publicação

Migration `0208_voice_studio_scripts.sql`: coluna JSON de roteiro no recibo,
trigger para audiolivros, view privada de histórico e tabela de rascunhos com RLS
e acesso exclusivo do serviço. É aditiva e deve ser aplicada antes de ativar a
nova versão. Não altera tarifas, carteiras, vozes nem áudios existentes.

Aplicação/ativação e evidências finais serão registradas após as verificações.
Um retorno à versão antiga não deve processar novos audiolivros com script:
concluir os jobs novos ou manter o worker compatível antes do rollback.

## Validação e limites

Testes cobrem compilação/compatibilidade, seleção/limites de prévia, tags atômicas,
contagem dos trechos, isolamento, conflito de rascunhos, migration/RLS, reserva,
falha de persistência antes do provedor e preço acima do limite autorizado.
Navegador com componentes reais e APIs simuladas: 1920/1366/390 px, cursor,
desfazer/refazer, edição de pausa, estilo, prévia, reload, reuso, paginação,
busca no servidor e troca de projeto. Evidências em `.codex-screens` local.

Nenhum áudio pago foi gerado durante esses testes. Qualidade emocional e
semelhança do clone do André ainda precisam de escuta real. Tags/perfis são
orientações generativas; pausas expressivas não garantem duração exata. Efeitos
de áudio, novos formatos e atuação por áudio de referência ficam fora desta entrega.
