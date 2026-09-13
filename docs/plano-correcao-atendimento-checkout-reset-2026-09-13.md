# Plano completo — continuidade do checkout e reset integral do lead

Data: 13/09/2026. Estado: implementação e regressões concluídas; migration aplicada e exclusão integral simulada com rollback no banco real. Publicação da aplicação e limpeza autorizada em conclusão. Resultados e limites em [auditoria](auditoria-reset-lead-2026-09-13.md).

## Resultado esperado

Todos os agentes que vendem produtos devem atender o mesmo lead antes, durante e depois do checkout: esclarecer dúvidas, corrigir dados, alterar carrinho, trocar pagamento e iniciar outra compra. O envio do checkout encerra a etapa de preparação e envio, mas mantém o histórico e o estado real do pedido. Somente a ação explícita “Resetar lead” apaga o atendimento e permite começar como lead novo.

A correção é compartilhada por todos os agentes e organizações. Catálogo, preços, métodos habilitados, permissões e configurações de cada organização continuam sendo respeitados.

## Diagnóstico que orienta o trabalho

Evidências e limites estão em [auditoria-reset-lead-2026-09-13.md](auditoria-reset-lead-2026-09-13.md).

| Problema | Evidência | Correção necessária |
|---|---|---|
| Nome recebido, mas não utilizado | Mensagem existe; lead sem identificação e pedido sem nome; reprodução local do leitor de nomes | Captura contextual, persistência e atualização do pedido |
| Promessa de link sem botão | Resposta enviada apenas como texto; sessão pendente por nome | Resposta baseada na ação executada e no resultado de envio |
| Retomada de pagamento substitui o atendimento | Duas respostas repetidas saíram do caminho de recuperação | Encaminhamento conforme a intenção atual, sem bloquear toda a conversa |
| Revisão antiga reaparece após saudação ou agradecimento | Conversas arquivadas retomaram revisão/coleta sem pedido atual | Encerrar etapas concluídas e limitar a retomada ao contexto correto |
| Inclusão de produto não reconhecida | Produto e quantidade informados; sistema continuou pedindo os mesmos dados | Resolver a resposta usando a oferta imediatamente anterior e a revisão em andamento |
| Negação interpretada como pagamento realizado | “Nem paguei ainda” criou conferência financeira | Corrigir negações e separar relato, dúvida e evidência |
| Cartão solicitado, Pix recuperado | Histórico da Luna com Elaine mostra a troca incorreta | Preservar a preferência explícita por pedido e distinguir página de produto de checkout |
| Erro do provedor de IA | Duas execuções históricas rejeitaram conversa terminada em fala do modelo | Verificar montagem do histórico atual e cobertura de mensagens consecutivas/reexecução |

Os registros contêm versões históricas: comparar as correções já publicadas com o código e a implantação atuais antes de alterar novamente. Execução marcada como completed não comprova resolução do atendimento.

## Etapa 1 — Reproduzir e mapear o fluxo comum

1. Identificar as decisões que ocorrem antes da resposta do modelo: conferência financeira, revisão de pedido, recuperação de checkout e coleta de dados.
2. Relacionar cada decisão ao estado persistido do lead, conversa, pedido e sessão de pagamento.
3. Criar regressões com nomes e produtos fictícios a partir dos episódios auditados. Evitar dados pessoais dos prints em testes e relatórios versionados.
4. Conferir o que já foi corrigido e publicado em outros trabalhos, preservando mudanças existentes e evitando duas implementações concorrentes para a mesma regra.

Entrega: reprodução dos defeitos atuais e mapa das transições que precisam mudar. Distinguir defeito reproduzido de hipótese ainda em investigação.

## Etapa 2 — Corrigir os dados do cliente

- Reconhecer respostas à solicitação efetivamente enviada pelo checkout, inclusive nome completo isolado.
- Persistir dados confirmados antes de reavaliar o pagamento e atualizar o pedido correspondente.
- Recuperar informações já fornecidas pelo lead sem promover nomes de terceiros, citações ou texto inventado pelo agente a identidade confirmada.
- Em falha de gravação, informar uma dificuldade real; não afirmar que registrou dados nem insistir automaticamente na mesma pergunta.
- Respeitar correções posteriores do cliente e evitar sobrescrita por memória antiga ou execuções concorrentes.

Aceite: dado válido recebido e persistido deixa de ser solicitado; falhas de persistência não produzem confirmação falsa.

## Etapa 3 — Restabelecer a continuidade depois do checkout

- Separar intenção atual e estado da compra. Saudação, agradecimento e dúvida não constituem consentimento para gerar ou revisar cobrança.
- Após envio do checkout, concluir a etapa de coleta/envio. Manter o pedido consultável e permitir atendimento normal imediatamente.
- Retomar pendências apenas quando forem relevantes à mensagem atual. Uma pendência antiga não deve assumir toda resposta do agente.
- Tratar adição, remoção e mudança de quantidade usando a oferta e o pedido corretos. Aceites curtos devem ser interpretados com o contexto da pergunta anterior.
- Distinguir alteração do pedido existente de uma compra nova. Confirmar com o cliente quando a distinção for materialmente ambígua.
- Apresentar resumo, frete e total atualizados e obter confirmação antes de executar uma alteração financeira.

Aceite: o lead consegue continuar conversando após o link, alterar a compra ou comprar novamente, sem repetição e sem mistura de pedidos.

## Etapa 4 — Corrigir pagamento e entrega do acesso

- Distinguir página de produto, reenvio de checkout, troca de pagamento e criação de cobrança.
- Preservar a preferência explícita por cartão ou Pix. Método indisponível exige resposta adequada, sem troca silenciosa.
- Separar pagamento não realizado, intenção de pagar, pergunta sobre pagamento, alegação de pagamento e comprovante.
- Corrigir as negações, incluindo “nem paguei ainda”; manter a verificação necessária para alegações reais e tentativas de resultado incerto.
- Revisões financeiras verdadeiras protegem a operação financeira envolvida; dúvidas comerciais não relacionadas devem continuar recebendo atendimento apropriado.
- Verificar o estado real de sessões antigas antes de substituir, cancelar ou reenviar cobranças. Evitar duplicação em mensagens repetidas, reprocessamento ou concorrência.
- Só afirmar que há link ou botão enviado quando houver a ação correspondente. Registrar separadamente preparação, tentativa e aceitação pelo provedor.
- Cobrir erros do provedor de IA e histórico terminado em fala do modelo, verificando se o defeito histórico ainda é reproduzível na versão atual.

Aceite: nenhuma promessa sem ação, nenhuma negação classificada como pagamento feito e nenhuma cobrança duplicada por recuperação ou repetição.

## Etapa 5 — Implementar “Resetar lead” com exclusão integral

### Experiência no painel

Disponibilizar a ação na Central de Atendimento para usuários autorizados da organização, inclusive em conversas arquivadas. O alvo é o lead inteiro naquela empresa, com suas conversas entre os agentes; não apenas a conversa selecionada.

Modal proposto:

> **Resetar lead definitivamente?**
>
> Esta ação excluirá permanentemente o cadastro e todos os dados deste lead nesta empresa, incluindo conversas ativas e arquivadas, memória dos agentes, arquivos, carrinhos, pedidos e solicitações.
>
> Não será possível desfazer. Se o lead entrar em contato novamente, será criado um cadastro novo, do zero. O histórico excluído não será recuperado.
>
> A exclusão no sistema não apaga mensagens nos aparelhos dos participantes nem cancela ou estorna pagamentos nos provedores externos.

Ações: **Cancelar** e **Excluir tudo e resetar**. Mostrar o nome/contato do alvo, bloquear confirmação duplicada durante o processamento e apresentar sucesso somente após a conclusão verificada.

### Operação no servidor

1. Mapear todas as dependências do lead: identidade, conversas, arquivos de mensagens e versões arquivadas, memória, loja, carrinhos, pedidos, sessões, evidências, revisões, agenda, retornos, automações, rastreamento e registros de solicitações. Incluir vínculos em JSON e arquivos fora do banco; não se limitar às chaves estrangeiras.
2. Validar sessão, autorização para exclusão, empresa e alvo no servidor. A ação nunca pode atingir outra organização, o catálogo compartilhado, a configuração dos agentes ou a conta de acesso do usuário por associação indevida.
3. Impedir novas operações sobre o alvo durante a exclusão; cancelar tarefas pendentes e impedir resposta, gravação ou recriação por execuções antigas já em andamento.
4. Excluir efetivamente o cadastro e seus registros relacionados. Não transformar o lead em um cadastro arquivado oculto nem conservar sua memória como atalho de implementação.
5. Usar uma operação transacional para o banco. Coordenar exclusão de objetos armazenados com retomada segura: falha parcial não pode ser apresentada como exclusão completa.
6. Tratar reentrega de webhooks e eventos antigos para que não reconstruam automaticamente o histórico removido. Um contato novo deve ser distinguido de uma repetição de evento antigo, sem conservar o conteúdo apagado.
7. Invalidar sessões da loja, vínculos de navegação, caches e seleção do painel associados ao lead removido. Uma aba antiga não pode recuperar identidade ou memória do cadastro apagado.
8. Comprovar que novo contato pelo mesmo número cria outro cadastro sem herdar dados, pedidos, revisões ou restrições de fluxo do anterior.

Dados de provedores externos exigem operações próprias. A confirmação do modal autoriza a exclusão no sistema; não autoriza implicitamente estornos, cancelamentos de transações externas ou apagamento dos aparelhos dos participantes.

Aceite: o lead e seus dados vinculados deixam de existir no escopo definido; a nova mensagem inicia cadastro e atendimento novos. Não basta esconder o registro da lista.

## Etapa 6 — Validação integrada

| Percurso | Resultado exigido |
|---|---|
| Primeira compra com dados em mensagens separadas | Dados aproveitados e checkout entregue após confirmação |
| Agradecimento e saudação após o botão | Atendimento normal, sem reabrir coleta ou revisão |
| Adicionar/remover produto e mudar quantidade | Resumo correto, confirmação e pedido coerente |
| Trocar cartão/Pix e pedir página de produto | Ação correspondente à intenção e método correto |
| Negar pagamento versus alegar débito | Negação não abre conferência; alegação real é verificada |
| Sessão paga, vencida ou incerta | Estado respeitado e nenhuma cobrança duplicada |
| Mensagens consecutivas e tarefas repetidas | Sem respostas antigas nem efeitos duplicados |
| Reset com conversa ativa e arquivada | Exclusão completa do lead, com confirmação no modal |
| Reset durante envio ou com evento antigo repetido | Nenhuma recriação ou resposta tardia do atendimento apagado |
| Falha durante exclusão de banco/arquivo | Falha explícita e recuperação consistente |
| Novo contato após reset | Novo cadastro sem memória ou pedidos antigos |
| Organizações e agentes diferentes | Mesmas regras e isolamento de dados |

Executar testes de comportamento, integração e banco; checagem de tipos e lint; verificar o modal em computador e celular, teclado, foco, cancelamento e confirmação. Usar provedores simulados para regressões e identificar explicitamente o que ainda depende de teste real.

## Etapa 7 — Publicação, limpeza autorizada e reteste

1. Concluir a auditoria e preservar apenas o diagnóstico técnico sem conteúdo pessoal antes de limpar os exemplos.
2. Revisar código, migrations, rotas e interface. Publicar após autorização para a implantação e conferir a versão efetivamente ativa.
3. Executar a limpeza já solicitada no escopo dos leads de teste identificados, incluindo suas conversas arquivadas. A instrução não deve ser ampliada para excluir todos os leads arquivados de todas as empresas.
4. Conferir a ausência dos registros e objetos previstos, tarefas antigas e memória. Não marcar limpeza como concluída com base apenas na resposta HTTP.
5. Retestar ponta a ponta com o titular: novo contato, novo cadastro, compra, entrega do checkout, agradecimento, alteração, troca de pagamento e outra compra.
6. Atualizar o estado operacional com implantação, evidência observada, limites e eventuais pendências. Uma falha em produção exige diagnóstico e recuperação, sem tratar reset como substituto da correção do atendimento.

## Ordem de execução e conclusão

Começar pelas regressões e pelos defeitos já confirmados; depois corrigir continuidade, revisão e pagamento. Implementar o reset integral como recurso separado, validar as duas frentes e então publicar/limpar/retestar. A exclusão é irreversível: uma reversão de código não recupera dados removidos.

O trabalho só estará concluído quando as correções globais estiverem verificadas e o reset cumprir o efeito prometido no modal. Até lá, manter separados: planejado, implementado, testado localmente, publicado e observado em produção.
