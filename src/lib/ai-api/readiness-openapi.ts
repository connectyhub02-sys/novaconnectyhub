const ref=(name:string)=>({$ref:`#/components/schemas/${name}`});
const json=(schema:object)=>({'application/json':{schema}});
const error={description:'Confira o código de erro e o estado da operação',content:json(ref('AiError'))};
export const readinessAiPaths={
  '/prices':{get:{operationId:'listAiPrices',summary:'Consultar tarifas vigentes em créditos',tags:['Tarifas'],security:[{}, {AiBearerAuth:[]}],description:'Sem chave retorna tabela base; com chave, plano da carteira. Não altera saldo, plano ou autorização de recarga.',parameters:[{name:'model',in:'query',schema:{type:'string'}}],responses:{200:{description:'Tarifas públicas sem custo privado do provedor',content:json(ref('PriceList'))},401:error,404:error,429:{...error,headers:{'Retry-After':{schema:{type:'string'}}}},503:error}}},
  '/models/{model}:countTokens':{post:{operationId:'countAiTokens',summary:'Contar conteúdo sem gerar resposta',parameters:[{name:'model',in:'path',required:true,schema:{type:'string'}}],requestBody:{required:true,content:json({oneOf:[{type:'object',additionalProperties:false,required:['contents'],properties:{contents:{type:'array',items:{type:'object'}}}},{type:'object',additionalProperties:false,required:['generateContentRequest'],properties:{generateContentRequest:ref('ContentRequest')}}]})},responses:{200:{description:'Contagem medida pelo provedor, sem reserva/débito',content:json({type:'object',properties:{totalTokens:{type:'integer'},cachedContentTokenCount:{type:'integer'},promptTokensDetails:{type:'array',items:{type:'object'}}}})},401:error,422:error,429:error,503:error}}},
  '/files/uploads':{post:{operationId:'createAiUploadSession',summary:'Preparar transporte direto de até 20 MB',description:'Requer relay habilitado; retorna 503 quando indisponível. Envie os bytes por PUT na URL devolvida, com Authorization: Bearer access_key e Content-Type. O ticket não é a chave Google nem a chave permanente da API.',requestBody:{required:true,content:json({type:'object',additionalProperties:false,required:['size_bytes','mime_type'],properties:{size_bytes:{type:'integer',minimum:1,maximum:20000000},mime_type:{type:'string'},display_name:{type:'string'}}})},responses:{201:{description:'Ticket de uso único, válido por dois minutos',content:json({type:'object',properties:{id:{type:'string'},upload_url:{type:'string'},access_key:{type:'string'},method:{const:'PUT'},expires_at:{type:'string'},max_size_bytes:{const:20000000}}})},401:error,422:error,429:error,503:error}}},
};
export const readinessAiSchemas = {
  PriceList: {
    type: 'object',
    properties: {
      object: {const: 'price.list'},
      as_of: {type: 'string', format: 'date-time'},
      scope: {enum: ['base_rates', 'billing_plan']},
      data: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            model: {type: 'string'},
            version: {type: 'string'},
            minimum_credits_per_operation: {type: 'number'},
            rounding: {const: 'ceil_6_decimals'},
            currency: {const: 'ConnectyHub credits'},
            rates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  meter: {type: 'string'},
                  unit: {enum: ['token', 'token_hour', 'second', 'call', 'song']},
                  credits_per_unit: {type: 'number'},
                },
              },
            },
          },
        },
      },
    },
  },
};
