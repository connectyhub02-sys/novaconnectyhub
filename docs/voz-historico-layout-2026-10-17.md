# Estúdio de Voz — histórico e aproveitamento da tela — 17/10/2026

## Causas e correção

A página guardava as falas curtas somente em estado React e URLs blob. Ao
recarregar, consultava apenas audiolivros em `/operations`, embora os recibos e
arquivos de fala curta já fossem persistidos. Agora recupera `/generations` e
`/operations` do projeto autenticado e oferece player/download pelas rotas
privadas existentes. Não há nova geração, débito, armazenamento local de áudio,
migration ou mudança de autorização.

A lista combina até 50 áudios recentes, sem duplicar a geração da sessão,
ordena por data e atualiza trabalhos em andamento. Exibe falha de consulta e
permite tentar novamente; respostas de projetos abandonados são descartadas.
Recibos antigos não contêm a transcrição: aparecem com data, voz/modelo e custo.
Reusar texto continua disponível quando o texto existe na sessão atual.

A largura máxima foi removida somente da página cliente de Voz e de seu
Estúdio. Editor e histórico ocupam a coluna principal, sem herdar a altura dos
ajustes. O editor tem altura proporcional à tela; `Gerar fala` usa o estilo
semântico azul `ch-action`, protegido da regra global que clareava `bg-slate-900`.
No celular, ajustes precedem o histórico e não há overflow horizontal da página.

## Evidências

- Consulta somente leitura na produção encontrou as oito falas recentes da
  organização Vision concluídas e com objeto registrado no Storage.
- As três mais recentes (17/10 às 02h02, 02h03 e 09h00 BRT) foram lidas diretamente
  do Storage: HTTP 200, MIME audio/mpeg, assinatura MP3 e tamanho iguais aos
  registros (1.828.196, 1.677.313 e 700.124 bytes). Conteúdo não foi gravado no Git.
- 20 testes direcionados aprovados: apresentação/restauração do histórico,
  isolamento de voz/painel e texto longo. ESLint e TypeScript aprovados.
- Navegador com componentes reais, CSS do painel e APIs simuladas: 1920, 1440,
  1366 e 390 pixels; botão dentro da primeira tela, azul/branco e sem overflow.
  Geração sintética restaurada após reload e nova aba sem outro POST; deduplicação,
  erro/repetição do histórico, conclusão por polling e troca de projeto durante
  resposta atrasada conferidos. Nenhuma chamada paga ao fornecedor.
- Evidências visuais locais: `.codex-screens/voice-history-*-20261017.png`.
  Prévia e scripts de teste ficam em `tmp/voice-check-env` e não entram na release.

## Publicação

Pendente de build e validação da candidata na VPS. Sem teste de geração real;
confirmar a experiência final na sessão do titular após a publicação.
