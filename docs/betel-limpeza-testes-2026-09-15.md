# Betel: limpeza do domínio de análises de teste — 15/09/2026

## Autorização e publicação

O titular confirmou pela tarefa coordenadora que o domínio de análises ainda era
de teste e autorizou sua remoção, incluindo versões aprovadas, sem novas cópias.
A hipótese inicial de arquivamento foi descartada. Não restauramos as imagens
ausentes. As cópias privadas concluídas antes dessa orientação foram preservadas.

Aplicação publicada às 23:42:56 UTC: fonte `a558db57`, imagem `b7e6d2ff`.
Compilação na VPS passou; a tarefa do aplicativo informou TypeScript, lint e onze
suítes offline aprovadas. App, Auth, REST e Storage responderam HTTP200; guard das
dependências não precisou retomar serviços. Banco, motor e broker não foram
reiniciados; 12 funções Betel e 45 ConnectyHub permaneceram registradas.

## Correção e escopo

A rotina anterior podia remover imagens antes de uma falha de FK no banco.
A nova rotina usa prévia com hash, transação no banco e checkpoint de arquivos.
Os produtores ficam bloqueados enquanto o checkpoint de armazenamento está
pendente; a retomada não executa uma segunda purga do banco.

A imutabilidade de versões continua ativa. Sua exceção administrativa permite
somente DELETE dos IDs do plano, na transação e processo PostgreSQL da rotina
privilegiada de limpeza. O trigger não foi desativado; UPDATE continua proibido.
RPCs disponíveis apenas ao serviço administrativo. Referências fora do domínio
permitido bloqueiam a transação; carteiras, recibos, usuários, agentes,
configurações e credenciais ficam fora da seleção. Os logs de auditoria são
preservados; referências anuláveis a oportunidades removidas ficam nulas.

Migration `20260915233000_market_analysis_cleanup.sql` aplicada separadamente.
O SQL no pacote a558 precede apenas dois ajustes finais: permitir lotes ainda
não iniciados/cancelados e calcular a contagem de dependências removidas.
A aplicação não executa esse arquivo embutido; o contrato RPC não mudou.
SHA256 do SQL final aplicado: `e2055f9b5421b24fc8d144786f191d56b419a4448cf7a35b67140ca505a6f6cf`.

## Execução e verificação

Transação confirmada às 23:43:47 UTC. O único run marcado running era legado,
de 03:51 UTC, anterior ao corte. Motor da VPS consultado sem execução ativa;
esse run foi encerrado individualmente dentro da mesma transação de limpeza.
Nenhum recibo incerto foi repetido ou liberado.

Foram zerados os lotes (3), linhas (11), oportunidades (3), análises (3), versões
(11), coletas (11), assets (35), snapshots (4) e seus dependentes de qualificação
e fluxo. Comparáveis já estavam zerados. Algumas dependências foram removidas
por cascatas previamente inspecionadas; contagens de DELETE explícito não
representam, isoladamente, todas as linhas removidas.

Validação independente do aplicativo às 23:46:17 UTC confirmou domínio zerado,
**72 recibos financeiros e 863 logs de auditoria preservados**, app/login/Auth
HTTP200 e checkpoint concluído com zero pendências.

R2: 18 imagens referenciadas já estavam ausentes antes desta execução. A
comparação com a cópia de 19:26 comprovou a ausência, sem atribuir a cada DELETE
uma causa que os logs não demonstraram. Outras 40 fotos legadas, nos três
prefixos explicitamente inventariados, não tinham referências nas 117 tabelas
públicas pesquisadas. Foram removidas após o commit, com HEAD, condição de ETag
e confirmação de ausência. Cinco objetos externos ao domínio de análises
permaneceram com ETag e tamanho iguais. Nenhuma cópia nova no R2.

Checkpoint: `27305b7a-7e59-402c-b908-2a1a5cd9450f`. A lista das 40 imagens órfãs
é evidência separada do checkpoint dos 18 assets; não confundir seus contadores.

## Evidência e limites

Antes da orientação para não produzir novas cópias, o dump de 23:24 UTC foi
restaurado numa base privada: 154 tabelas e 217 FKs sem violações; cópia local
fora da VPS conferida por SHA. A restauração usou roles do mesmo cluster.
Os testes de purga, guard, permissões, hash obsoleto e imutabilidade ocorreram
nessa base isolada, sem efeito no R2 ou chamadas comerciais.

Artefatos privados ficam no catálogo local de migração Betel e em
`/opt/betel-isolated-rehearsal/audit/`: publicação h, commit do banco,
manifesto/resultados R2 e checkpoint final. Segredos e dumps não estão no Git.

Gecko mostrou saldo de 10.000 créditos no plano Developer em consulta à UI.
Isso não comprova que uma nova coleta ou análise comercial será bem-sucedida;
nenhuma foi executada nesta validação.
