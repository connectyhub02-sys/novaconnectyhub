# Retomada do Pix após intervalo na conversa

## Falha observada

Na consulta de leitura de 09/09/2026, as tentativas das 01h13–01h19 (Brasília) concluíram apenas mensagens de texto. Não houve criação de pedido, sessão de pagamento ou tentativa de envio de botão nessas execuções. Portanto, essas ocorrências não demonstram rejeição do novo formato de cobrança pela Uazapi.

A confirmação anterior havia ocorrido mais de quatro horas antes. O fechamento determinístico utiliza uma janela de duas horas, enquanto o modelo ainda recebia mensagens anteriores no histórico. O modelo lembrava os itens, mas não executava o pagamento. A proteção anterior respondia “Vamos retomar...” sem associar esse aceite a uma recuperação do carrinho. Além disso, as expressões “liberando o botão” e “clicar no botão abaixo” escapavam da proteção contra anúncios sem execução.

## Correção

- Reconhecer pedidos de reenvio, “cadê?”, “não apareceu o botão” e o aceite contextual da retomada.
- Recuperar um rascunho do carrinho por até sete dias. Para conversas anteriores à correção, aproveitar o resumo estruturado ainda disponível no histórico. O rascunho não comprova autorização nem pagamento.
- Persistir itens e quantidades no arquivo do lead, com escopo da empresa, conversa e instância. Atualizações preservam os demais dados e não sobrescrevem um rascunho mais recente.
- Revalidar todos os itens, disponibilidade, preços e frete. O endereço salvo pode ser usado para apresentar uma cotação; a cobrança continua exigindo confirmação atual. A janela de autorização de duas horas permanece.
- Mostrar um único resumo com endereço e total para obter nova confirmação. Após o aceite, executar o fluxo real de pedido, pagamento e envio da cobrança.
- Invalidar rascunhos cancelados ou alterados. Não recuperar somente parte de um carrinho nem reenviar uma cobrança histórica de outros produtos quando o carrinho atual é conhecido ou está sem correspondência válida.
- Impedir anúncios de botão, código ou QR sem execução do passo de pagamento. Manter o formato nativo de cobrança e os mecanismos existentes de reutilização e tratamento de falhas de transporte.

## Validação

- 99 arquivos, 791 testes aprovados com `npx vitest run --maxWorkers=4`.
- Novos testes cobrem retomada após quatro horas, confirmação seguida de geração e envio nativo, histórico truncado, preços e frete alterados, cancelamento, indisponibilidade de item, outra conversa, perguntas e cobrança antiga de outros produtos.
- `npm run build` aprovado, incluindo TypeScript; ESLint dos arquivos alterados e `git diff --check` aprovados.
- Uma reprodução somente em memória, com os dados consultados da conversa reportada, recuperou um item, total de R$ 2.590,10 e frete zero, propondo confirmação atual do endereço. Não houve cobrança nem mensagem real nessa reprodução.

O transporte e o provedor foram substituídos nos testes automatizados. A validação final no WhatsApp deve ser feita na mesma conversa pelo usuário, solicitando o Pix e confirmando o resumo apresentado; não é necessário apagar o histórico.
