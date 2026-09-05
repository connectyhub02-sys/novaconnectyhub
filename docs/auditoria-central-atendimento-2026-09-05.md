# Correções na Central de Atendimento — 05/09/2026

O painel exibia respostas de texto como áudio, aceitava trechos de conversa como nome e reduzia o histórico durante a atualização automática. A auditoria encontrou 54 mensagens persistidas na conversa examinada, sem partes ausentes nas respostas divididas: 43 textos e 11 áudios reais.

## Causas e correções

- **Mídia:** a identificação procurava palavras como `audio` em todas as chaves e valores do payload. O campo `generated_audio_media_id: null`, presente em respostas de texto, criava um player inexistente. Agora o tipo efetivamente enviado prevalece; apenas descritores e estruturas de mídia são considerados. Textos, respostas a áudios citados e tentativas de voz que terminaram em texto não criam players. Os áudios reais continuam disponíveis com sua transcrição.
- **Nome:** a classificação aceitava frases curtas como “Qual o valor”. Elas agora são rejeitadas. O nome cadastrado tem prioridade sobre a memória inferida; o nome do perfil do WhatsApp serve apenas como alternativa visual. Respostas com “Pix”, nome e e-mail em linhas separadas preservam o nome informado. Sobrenomes como “Sá” também são aceitos.
- **Histórico:** a carga inicial de 50 mensagens era substituída por 40 a cada atualização. As mensagens agora são reunidas por identidade, preservando mensagens antigas e atualizando as já conhecidas. A consulta paginada permite acessar mensagens anteriores do WhatsApp e da loja, com ordenação estável mesmo em horários iguais.
- **Arquivo do lead:** a Central desativava a carga de eventos e abria o CRM sem buscá-los. Ao abrir o arquivo, o painel consulta as atividades persistidas. Eventos mais antigos e os itens além dos dez primeiros podem ser consultados. O vínculo também reconhece eventos pelo ID do lead e pelo ID da conversa no payload.
- **Checkouts:** atualizações sem consulta de vendas devolviam listas vazias e apagavam temporariamente os cartões de checkout na tela. Esses campos agora são omitidos até a próxima consulta de vendas.

## Validação

- 431 testes aprovados, incluindo mídia, identidade, paginação, autorização por empresa e as regressões anteriores de venda, frete e Pix.
- Conferência de leitura com os dados reais: páginas de 50 + 4 mensagens, sem duplicação ou perda; 11 players correspondem aos 11 áudios persistidos.
- Erros de consulta são exibidos com opção de tentar novamente, sem apresentar falha como histórico vazio.
- Correção pontual do nome inválido usando a mensagem de dados enviada pelo próprio lead, preservando outros campos e registrando um evento no CRM.

A consulta não envia mensagens, não gera cobranças e não altera pedidos. A contagem apresentada é dos registros carregados; o botão de histórico permite consultar páginas anteriores. A verificação confirma a integridade da conversa examinada e o acesso aos eventos persistidos, não constitui uma certificação de todos os produtores de eventos da plataforma.
