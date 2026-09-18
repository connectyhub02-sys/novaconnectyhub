# Checkout e relacionamento — 17/09/2026

## Orientação de produto

Cadastro inicial leve. Endereço completo é coletado no contexto de faturamento,
contratação, pagamento, entrega ou validação que realmente o exija. Checkout
Asaas recebe CEP, logradouro, número, complemento opcional, bairro, cidade, UF
e país Brasil, com busca ViaCEP e alternativa manual. Outros países não são
oferecidos nesta jornada. Consulta externa envia apenas o CEP. Endereço salvo
em dados privados de faturamento da organização e reutilizado em Minha Conta.

Asaas aceita CEP e número e pode derivar outros dados do CEP; não tratar a falta
de rua no antigo formulário como prova de erro da API. O cadastro completo é
uma decisão de produto para confirmação e reutilização dos dados.
Referências: [cliente Asaas](https://docs.asaas.com/reference/criar-novo-cliente)
e [ViaCEP](https://viacep.com.br/).

## Dono do relacionamento

O contratante da ConnectyHub é lead comercial da plataforma. O consumidor de
uma pizzaria cliente é lead da pizzaria: compra de pizza, itens, valor, método,
datas e status pertencem ao histórico daquela organização. Não cruzar esses
domínios nem copiar consumidores para a base comercial da ConnectyHub.

Esta rodada integra o checkout de planos da plataforma à jornada existente
`platform_customer_journey`: comprador resolvido pelo owner da organização;
worker vincula/cria o lead no CRM do agente de faturamento da ConnectyHub após
verificação do telefone. Reutiliza a identidade existente e a unicidade por
organização/canal/telefone. Sem identidade verificada, evento permanece pendente
com auditoria explícita; não adivinhar associação por nome/e-mail/documento.

Endereço e contato confirmado produzem eventos imutáveis. Campos vazios podem
ser enriquecidos; conflitos mantêm o dado existente e o novo valor no histórico.
CPF/CNPJ entra mascarado. Escolha do método é evento separado; pagamento e
assinatura reutilizam os eventos já emitidos pela rotina financeira. A projeção
para o lead permite fatos comerciais e exclui identificadores financeiros,
PAN, CVV, tokens e Pix Copia e Cola. Referências internas ficam na auditoria.

O padrão para checkouts dos clientes permanece uma regra de produto e deve ser
reutilizado com o owner de cada checkout. Esta rodada não altera o checkout de
catálogo da pizzaria nem declara que todos esses percursos foram auditados.

## Validação e limites

- QA local: desktop 1280×900, celular 390×844, sem overflow horizontal.
- Endereço incompleto rejeitado, campos por CEP preenchidos com resposta simulada;
  salvar recolhe a seção e libera o formulário escolhido.
- Pix Automático indisponível mantém Pix manual; autorização CANCELLED mantém
  trava, sem botão para gerar outro QR. Consentimentos financeiros preservados.
- Testes de isolamento usam a função real de arquivamento, lead comercial e lead
  de cliente com o mesmo telefone, conflito de endereço e identidade não verificada.
- Nenhum dado real de faturamento foi preenchido/salvo para validar a UI. Nenhum
  novo pagamento, QR ou autorização real foi criado nesta rodada.
- Cancelamento autorizado do QR anterior: 22:06 BRT, Asaas 200/CANCELLED e local
  CANCELLED, zero pagamentos, instruções, créditos e ativação.
- Migration 0155 aplicada às 22:36 BRT após backup/ensaio; RLS/grants verificados,
  contagens financeiras/relacionamento preservadas. Build webpack/TypeScript,
  ESLint e 66 testes aprovados. Confirmar deploy no estado operacional.
