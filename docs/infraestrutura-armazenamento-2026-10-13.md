# Armazenamento exclusivo dos projetos — 13/10/2026

## Regra definida pelo titular

Os projetos de plataformas produzidas para clientes têm espaços Cloudflare R2
próprios. Não há franquia de armazenamento contratada atualmente. Exibir consumo
para acompanhamento e futura definição comercial, sem inventar cota ou ativar
cobrança. O administrador continua responsável por vincular projeto e cliente.
Clientes comuns do SaaS não recebem uma parcela presumida da VPS ou do R2 geral.

## Implementação

Revisão `0972dc2b`: dois relógios por projeto, R2 e disco local, com quantidade em
MB/GB, escala azul adaptativa e indicação explícita de ausência de limite. Barras
abaixo mostram a participação de cada categoria no total medido. CPU/RAM continuam
restritos aos serviços do projeto; seus relógios representam o serviço mais próximo
do limite configurado, não toda a VPS nem uma franquia global do cliente.

O processo web lê somente agregados de `storage.json`. A API mantém a associação
validada do usuário à organização e a liberação administrativa. O coletor root usa
a propriedade exclusiva revisada no executor, valida os espaços R2 e suas contas,
rejeita fontes compartilhadas ou alteradas e nunca publica nomes de arquivos,
buckets, chaves ou caminhos. A aplicação descarta totais inválidos ou antigos.

Coleta local horária, com prioridade baixa, no máximo meio núcleo e 384 MB;
R2 completo paginado a cada seis horas. Consultar a tela não inicia varredura.
A primeira tentativa local da Vision excedeu 180 segundos; prazo ajustado para
600 segundos e uma leitura completa posterior foi obtida. Falha não é zero.

A estimativa local inclui diretórios, volumes, logs/metadados dos containers e
suas camadas graváveis, inclusive serviços parados. As camadas graváveis usam
tamanho lógico Docker; os demais arquivos usam blocos ocupados, sem seguir links
e deduplicando hardlinks na varredura. Imagens Docker compartilhadas ficam fora.
R2 soma tamanhos de objetos concluídos; não inclui multipart incompleto e não
pretende reproduzir a fatura do fornecedor. Não foi executada limpeza de dados.

## Medições observadas

Leituras entre 12h08 e 12h17 BRT, base 1024 (interface MB/GB):

| Projeto | Disco local estimado | R2 | Maior consumo local |
| --- | ---: | ---: | --- |
| Vision | 89.819.693.056 bytes (83,65 GB) | 7.075.895.193 bytes (6,59 GB), 45.290 objetos em dois espaços | Históricos das automações: 57.769.078.784 bytes (53,80 GB); aplicações/versões: 30.814.580.736 bytes (28,70 GB) |
| Immov.ai | 37.713.637.376 bytes (35,12 GB) | 329.370.443 bytes (314,11 MB), 276 objetos em um espaço | Aplicações/versões: 37.000.278.016 bytes (34,46 GB) |

No R2 da Vision, imagens ocupam 7.055.633.603 bytes; áudios 18.012.700 e vídeos
2.248.890. No Immov.ai a leitura R2 é composta de imagens. A revisão configurada
cobre estes dois projetos. Outros projetos permanecem sem leitura até revisão
explícita de recursos exclusivos; não recebem o total da máquina como substituto.

## Validação e publicação

106 testes TypeScript de infraestrutura e seis testes Python passaram, incluindo
isolamento de projeto, escopos R2, paginação, prazo máximo, recusa de parcial,
expiração independente e medição real de hardlinks/symlinks em Linux. TypeScript
e ESLint passaram. Prévia fictícia conferida em desktop e celular de 390 px;
rota temporária retirada antes da publicação.

Publicado `0972dc2b53f3d06d1ff03b2dedeb1e2a3ca81dea` no slot a/3130, com
fallback `f36b370b` no b/3131. Build de 120 páginas concluído. Candidato e HTTPS
público passaram em saúde/versão, páginas/assets, bloqueios de acesso anônimo,
Inngest assinado (58 funções), métricas atuais e consulta ao executor como UID 1000.
Leitura de armazenamento pelo usuário do app também passou para os dois projetos,
com soma das categorias consistente e datas atuais. Timer ativo e segunda coleta
automática completa confirmada; builder parado ao final.

Não foi feita nova sessão autenticada real do cliente: isolamento coberto pelos
testes e cadeia de autorização preservada; visual conferido com dados fictícios.
Confirmação visual pelo titular permanece pendente. Disco geral estava em 96% na
verificação de 12h18 BRT. Retenção de históricos e versões requer decisão própria;
nenhuma exclusão foi executada nesta entrega.
