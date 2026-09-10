# Saída dos avisos e contato da ConnectyHub

## Comportamento implementado

Todos os avisos automáticos da conta enviados pelo fluxo financeiro comum passam a incluir **Sair da lista**, sejam enviados pelo agente do cliente ou pela ConnectyHub. Inclui os avisos de cadastro/teste, créditos, planos, pagamentos e recargas desse fluxo. O texto também contém um link de saída para continuar utilizável quando o provedor recusar botões.

O botão abre `/avisos/[chave]`, uma página pública sem login. Somente o envio do formulário de confirmação desativa os avisos. Visitar a página, abrir uma prévia de link ou baixar o contato não muda a preferência. A página não exibe nome, telefone do destinatário, saldo ou dados financeiros.

A saída vale para o número destinatário dentro da conta de faturamento compartilhada e suas empresas. Não depende de qual agente enviou a mensagem. Não altera assinatura, cobrança, carteira, agentes ou atendimentos aos clientes dessa conta.

O controle é conferido antes do envio e novamente ao preparar uma tentativa pelo remetente alternativo. Avisos pendentes ou com falha, ainda não reservados para envio, são cancelados. Mensagens já despachadas não podem ser recolhidas; envios de resultado incerto permanecem para conferência. A troca para o WhatsApp da ConnectyHub não contorna uma saída da lista.

O titular pode desativar ou reativar o recebimento em **Minha conta → Quem envia os avisos da sua conta?**. Reativar habilita os próximos eventos; também descarta avisos antigos ainda aguardando que foram acumulados durante a pausa. O controle continua acessível com restrição financeira. Responsáveis adicionais recebem sua própria opção de saída por número.

## Salvar contato no início

Quando o evento de início do teste (`trial_started`) é enviado pela ConnectyHub, e a conexão usada informa um telefone válido, a mesma mensagem também oferece **Salvar contato**. O link baixa um arquivo `ConnectyHub.vcf` com o número do remetente real da plataforma. A pessoa abre o cartão e confirma o salvamento conforme as opções do aparelho.

Não há inclusão automática na agenda, nem uma segunda mensagem adicional só para enviar o cartão. O botão não é repetido nas cobranças seguintes, não aparece quando o aviso inicial vem do agente do cliente e não é criado com um número ausente ou inventado. Instâncias avulsas da API continuam fora da seleção de remetente.

## Botões e cobrança

O formato de menu documentado na especificação Uazapi do repositório admite botões de URL e de cópia. O aviso reúne até três ações: ação do checkout ou cópia do Pix, salvar contato quando aplicável e sair da lista. Para acomodar a saída na mesma mensagem, esse fluxo usa menu em lugar do cartão nativo de solicitação de pagamento. O Pix e o link do checkout continuam disponíveis; nenhum valor ou estado de pagamento é alterado.

Se o menu retornar rejeição definitiva compatível com formato não suportado, tenta texto com os links e, quando existir, o código Pix. Recusa de autenticação do remetente segue para a contingência da plataforma. Timeout ou resultado incerto não provocam um segundo envio automático.

## Alcance

Esta mudança cobre os avisos automáticos da conta no fluxo comum auditado. Não aplica mensagens da ConnectyHub às conversas dos clientes dos clientes, não altera respostas de atendimento nem códigos de autenticação solicitados pelo usuário. Novos fluxos independentes de campanha/follow-up deverão consultar essa preferência quando seu propósito for enviar avisos da ConnectyHub ao titular.

## Validação e ativação

- 66 testes distintos aprovados em oito arquivos nesta etapa.
- Testes de entrega: botão/link em avisos, saída antes do envio, saída entre remetentes, contingência de formato e ausência de repetição em timeout.
- Testes das rotas públicas: GET sem alteração, confirmação POST, proteção de origem, chave inválida, download sem dados do destinatário e ausência de reativação pública.
- SQL executado em banco local de teste: isolamento por conta/número, cancelamento da fila, preservação de avisos enviados/em processamento/incertos, persistência da saída e permissões restritas ao servidor.
- Playwright: confirmação e download em 390 e 1440 pixels; preferências do painel em 360, 390, 768 e 1440 pixels, incluindo desativação, reativação, persistência, membro sem permissão e recuperação de erro. Sem overflow ou erros JavaScript. Dados simulados e página temporária do painel removida após QA.
- ESLint sem erros; aviso preexistente de função `addMonths` não utilizada.
- Compilação final de produção aprovada, incluindo TypeScript, rotas públicas de avisos/contato e 93 páginas estáticas, sem a rota temporária de QA.

Implementação local, ainda sem publicação. Aplicar a migração `0122_account_notice_opt_out.sql` junto das pendências anteriores `0120` e `0121` antes de publicar o código. Nenhum WhatsApp real foi disparado nem foi alterada a preferência de um cliente real. A renderização dos botões e a abertura do cartão dentro do WhatsApp real ainda exigem validação operacional no aparelho.
