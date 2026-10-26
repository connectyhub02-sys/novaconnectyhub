# Limpeza segura, retenção e monitor de disco — 26/10/2026

Execução autorizada pelo titular, preservando clientes, backups, versões de
recuperação e serviços em funcionamento. Continuação da
[auditoria de disco e R2](auditoria-disco-r2-2026-10-26.md).

## Resultado verificado

A limpeza principal, das 19h50 às 20h13 BRT, retirou 380 containers antigos já
encerrados, 276 diretórios de releases elegíveis e 50 imagens antigas da aplicação.
O espaço livre passou de 7.466.041.344 para 46.166.331.392 bytes: aumento observado
de 36,04 GiB, incluindo a atividade normal dos serviços durante a manutenção.
A ocupação saiu de aproximadamente 98% para 85,15% antes da nova redução do cache.

A execução pela unidade definitiva concluiu às 20h18 BRT, sem novos containers,
releases ou imagens elegíveis. A redução do cache liberou mais 4,87 GiB observados.
Resultado final: **83,48% ocupado e 47,82 GiB livres** (df arredonda para 84%/48G),
aproximadamente 40,86 GiB de folga recuperada desde o início. Buildx reportou
3,184 GB decimais de cache após a execução; o limite é um alvo de coleta.

Os seis backups diários existentes continuam presentes, com os mesmos tamanhos,
somando 20.327.784.809 bytes. Não foi executada restauração integral desses backups.
Os quatro bancos principais permaneceram em execução com seus horários de início
anteriores à manutenção. Não foram executados VACUUM FULL, truncamentos de tabelas,
remoção de volumes, pausa de filas, cobrança ou envio de mensagem de teste.

## Retenção instalada

- Escopo: artefatos reproduzíveis sob as duas raízes de releases revisadas.
- Preserva todas as versões recentes por sete dias e pelo menos as cinco mais
  novas de cada conjunto; preserva referências de qualquer container restante.
- Containers: apenas candidatos/retornos/falhas antigos do admin Vision, já
  encerrados, imagem Node esperada e única montagem dentro da raiz de releases.
  Sem força e sem exclusão de volumes.
- Pastas com dados, uploads, storage, backups, .git ou conteúdo de usuários ficam
  protegidas. Caminhos canônicos e montagens são conferidos antes da remoção.
- Imagens: somente connectyhub-app com tag de commit, antigas e sem referências.
- Cache: somente o builder connectyhub-build, alvo de 3 GB e reserva de 1 GB.
  Entradas em uso continuam protegidas pelo Docker; o alvo não é uma cota rígida.
- Serviço de baixa prioridade de CPU/I/O, com locks de manutenção e publicação.
  O publicador Vision revisado recebeu o mesmo lock. Publicadores alternativos
  precisam respeitá-lo; proteção por idade/referência permanece independente.
- Estado privado e histórico de execução persistidos; resumo sem credenciais no
  diretório de monitoramento. Falha é registrada como falha, não como conclusão.

A primeira validação da unidade systemd identificou que ProtectHome impedia o
Buildx de acessar seu cadastro. Corrigido com DOCKER_CONFIG dedicado, contendo
somente a definição do builder local existente, sem copiar credenciais de registry.
ProtectHome e demais restrições do serviço foram mantidos.

Unidade definitiva executada com Result=success e ExecMainStatus=0. Timer
habilitado e ativo a cada seis horas, com primeira execução agendada para
27/10 às 02h22 BRT (inclui atraso aleatório até dez minutos).

Política e instruções em [ARTIFACT-RETENTION.md](../deploy/hosting/ARTIFACT-RETENTION.md).

## Monitor verificado

O coletor de armazenamento confundia a exigência de inventário seguro para
exclusão com a atribuição somente para medição. Ele agora contabiliza também
versões e auxiliares Vision cujas montagens pertencem exclusivamente às raízes
já revisadas. Montagens externas, volumes desconhecidos e vínculos com outro
projeto continuam recusados. O broker e as regras de exclusão não foram ampliados.

Coleta real concluída às 20h11 BRT com status ok: Vision local
161.058.156.544 bytes (150 GiB), detalhados por categoria. O painel confirmou
150 GB locais, dos quais 111,19 GB em históricos e 36,9 GB em aplicações/versões.
A interface usa base 1024. R2 apareceu separado: 7,76 GB, 50.088 objetos em dois
espaços exclusivos. Esse total de mídia não é o arquivo de diagnósticos compartilhado
auditado anteriormente. O monitor global de capacidade continua coletando a cada
30 segundos e mantém avisos a partir de 80% e 90%.

Validação: seis testes de retenção e dez de armazenamento em Linux; verificação
das unidades systemd; execução real da limpeza; conferência do painel. Smoke HTTPS
ConnectyHub: health/login HTTP 200, 19 assets, APIs protegidas e GET autenticado
Inngest com 59 funções. Sem disparar funções. Aplicação continua em 0c19c471;
as mudanças desta manutenção são do host, sem novo deploy da aplicação Next.js.

## Limites e pendências

A retenção limita versões/cache, mas não torna o disco ilimitado. Históricos das
automações continuam sendo o maior consumo; o arquivo R2 diário já operava e não
transfere automaticamente todos os bancos/backups locais. A compactação inicial
parcial de 24/10 continua registrada; não foi refeita com bloqueio nesta manutenção.
Reavaliar capacidade e volume de diagnósticos conforme a carga crescer.
O disco permanece acima do aviso de 80%; esse aviso deve continuar visível,
embora tenha saído da faixa crítica de 90% e recuperado aproximadamente 48 GiB livres.

Durante a observação ocorreu uma publicação Vision por outro fluxo às 19h53 BRT;
a limpeza não executou stop/restart de serviços. O Realtime ConnectyHub já estava
encerrado desde 24/10, situação anterior e fora desta correção. A área de verificações
de integrações do painel Vision ainda indica configuração ausente; isso é separado
da medição de disco restaurada. Não se declara toda a infraestrutura saudável.

Evidências operacionais privadas preservadas em
/opt/connectyhub/maintenance/artifact-retention-20261026, incluindo inventário
anterior, cópias dos scripts alterados e resultado da limpeza inicial.
