# Pix com ação única e recuperação de pedidos por áudio

## Diagnóstico

A leitura dos registros de 09/09 confirmou dois problemas distintos. Uma venda criou uma sessão Pix pendente com código copia e cola, mas o envio por `/send/request-payment`, incluindo `paymentLink`, exibiu **Revisar e pagar** no WhatsApp. A resposta HTTP aceita pela integração não comprovava que a interface oferecia a cópia do código; a captura do cliente mostrou a revisão e o acesso ao checkout externo.

Em outra conversa, o áudio foi transcrito corretamente. A frase “não tô conseguindo não. Manda de novo o Pix” perdia a pontuação na interpretação comercial. O trecho resultante “não manda” ativava indevidamente a proteção de recusa, impedindo o reenvio e a recuperação do carrinho. Além disso, a afirmação “O botão do Pix tá logo aí em cima” não era reconhecida pela proteção contra promessas de pagamento sem execução.

Não foi necessário apagar mensagens, memórias ou dados do lead para reproduzir e corrigir esses casos. O histórico pode conter afirmações antigas incorretas; essas afirmações não são comprovantes de geração ou envio.

## Comportamento implementado

- Todos os agentes que vendem pelo checkout integrado enviam Pix por `/send/menu`, com exatamente uma opção `Copiar Pix|copy:<código da sessão>`. O texto informa o valor e orienta a colar no banco. Não contém ação de revisão nem URL de checkout.
- A identificação da cobrança e os links internos continuam nos metadados para conciliação e rastreamento. O checkout do cartão segue disponível pelo fluxo de cartão.
- Quando o provedor rejeita definitivamente o botão, o sistema envia uma orientação e o código isolado em texto. Uma resposta ambígua, como timeout ou HTTP 500, não dispara uma segunda mensagem automaticamente.
- O reconhecimento de recusas mantém as fronteiras das frases. Perguntas, objeções e ordens reais como “não manda o Pix” continuam interrompendo o fechamento.
- A proteção de saída remove a afirmação falsa de que o botão está acima e sua instrução de pagamento, preservando a saudação e o tom do agente. O pedido explícito de reenvio volta ao fluxo de pagamento; um carrinho antigo ainda exige a confirmação necessária de dados e total.

O contrato do botão de cópia está documentado na [especificação oficial Uazapi](https://docs.uazapi.com/openapi-bundled.json), endpoint `/send/menu`.

## Validação e limites

Testes executam o runtime real com banco, gateway, envio e dados de compra fictícios. Cobrem o áudio transcrito seguido de confirmação e envio, a saudação com promessa falsa, recusas verdadeiras, a única ação de cópia, integridade do código, rejeição definitiva, entrega incerta, Pix e cartão, recuperação e prevenção de duplicidade.

Validação local: 834 testes em 100 arquivos. Na execução geral, 98 arquivos passaram e dois testes antigos ainda exigiam o formato removido; após atualizar essas expectativas, os dois arquivos passaram integralmente (32 testes). Build de produção do Next.js, incluindo TypeScript, e ESLint dos arquivos alterados passaram.

Os registros de produção foram apenas consultados. A validação automatizada não envia cobranças ou mensagens reais e não substitui a confirmação visual no WhatsApp após a publicação. Cartões antigos já enviados não são alterados; o novo formato vale para novos envios e reenvios.

Sem migration SQL. Sem alteração na configuração de personalidade, voz ou follow-up dos agentes.
