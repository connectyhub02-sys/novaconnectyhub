# Checkout de cartão, dados do WhatsApp e ficha técnica do CRM

## Problemas e correções

- **Asaas rejeitava o campo `name`.** O limite de 30 caracteres é do nome de cada item do checkout. O adaptador enviava até 80. Os itens e o item consolidado com frete agora respeitam esse limite; o nome completo do comprador continua separado e preservado.
- **Dados já coletados não apareciam corretamente.** Pedidos antigos podiam manter uma pergunta da conversa como nome do cliente. A página e a geração do pagamento consultam o lead da mesma organização, recuperam dados ausentes e corrigem nomes inválidos. Dados válidos específicos do pedido continuam prevalecendo. A persistência compara os valores anteriores para não sobrescrever uma correção concorrente.
- **Número do endereço incorreto.** O parser interpretava o número de uma rua numerada como número do imóvel. Agora prioriza a indicação explícita de número e separa rua, imóvel e complemento. O checkout envia os dados pessoais, telefone com DDD, CEP e endereço ao Asaas. Uma consulta de CEP com tempo limitado completa bairro e código IBGE quando disponível.
- **Coleta antes do checkout.** O agente aproveita o telefone da conversa, pede somente os dados pessoais ausentes e exige CEP e número para cartão. Endereço e CEP podem chegar em mensagens separadas. Dados de cartão, validade, CVV e senha ficam exclusivamente na etapa segura de pagamento. O fluxo Pix e as verificações de frete continuam ativos.
- **Ficha técnica vazia apesar de eventos gravados.** O histórico carregado sob demanda não retornava o resumo técnico, e atualizações posteriores podiam apagar campos válidos com valores nulos. A resposta agora inclui dispositivo, navegador, sistema, localização registrada, IP e último clique. A interface combina e preserva esses valores e atualiza eventos enquanto a ficha estiver aberta e a página visível. Não foi necessário inventar ou recriar dados de localização; usam-se as observações já existentes.
- **Checkout longo no celular.** Foram removidos cartões duplicados, descrições extensas de produtos, métricas truncadas e rodapé promocional. Total, frete, estado do pedido e ação de cartão ficam primeiro. Dados recebidos pelo WhatsApp e resumo de itens aparecem em blocos compactos. O ícone de espera é estático; a consulta automática do pagamento permanece.

## Fluxo resultante

WhatsApp coleta e confirma os dados → botão rastreado abre o checkout da loja → comprador confere pedido e dados → “Continuar para o cartão” abre a etapa segura do Asaas com `customerData` preenchido → confirmação do gateway atualiza o pedido e os eventos existentes do CRM.

O formulário de cartão continua hospedado no Asaas. Este ajuste não implementa captura direta dos dados do cartão no servidor da loja. Eventuais verificações adicionais do emissor ou do gateway continuam sob controle deles.

## Validação

- 457 testes em 66 arquivos passaram, incluindo envio de dados ao Asaas com transporte simulado, total com frete, limite de nome dos itens, número de imóvel em rua numerada, isolamento por organização, eventos técnicos e coleta em mensagens separadas.
- Build de produção e análise TypeScript concluídos; lint dos arquivos alterados sem erros ou avisos.
- Auditoria de API: zero caminhos inesperadamente ausentes e zero lacunas de métodos.
- Playwright em 360, 390 e 1440 pixels: sem rolagem horizontal e sem erros JavaScript. Em 390 pixels, a página ficou com aproximadamente 1.325 pixels de altura, contra 3.681 da captura fornecida. A ação de cartão aparece na primeira tela.
- A verificação visual local bloqueou requisições de escrita do navegador. Os testes não enviaram mensagens WhatsApp, não criaram cobranças reais e não submeteram dados de cartão. A aceitação final de um pagamento real depende de teste do comprador.

## Referências do provedor

- [Criar novo checkout — referência Asaas](https://docs.asaas.com/reference/criar-novo-checkout): contrato de itens e dados do cliente.
- [Como informar os dados do cliente — Asaas](https://docs.asaas.com/docs/como-informar-os-dados-do-cliente): preenchimento por `customerData`.

Este relatório não contém identificadores de leads, pedidos ou sessões de produção, documentos, IPs reais, tokens ou mensagens privadas.
