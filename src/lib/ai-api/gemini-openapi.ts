import {advancedAiSchemas} from './advanced-openapi';
import {geminiContractVersion} from './gemini-contract';
import {geminiResourcePaths,geminiResourceSchemas} from './gemini-resource-openapi';
import {geminiBatchPaths,geminiBatchSchemas} from './gemini-batch-openapi';
import {geminiFileSearchPaths,geminiFileSearchSchemas} from './gemini-file-search-openapi';
const ref=(name:string)=>({$ref:`#/components/schemas/${name}`});
const json=(schema:object)=>({'application/json':{schema}});
const model={name:'model',in:'path',required:true,schema:{type:'string'},example:'flash-3.5'};
const identity={name:'Idempotency-Key',in:'header',schema:{type:'string',maxLength:128},description:'Preserve corpo e identidade para recuperar sem repetir geração.'};
const failures=Object.fromEntries([400,401,402,403,404,409,413,422,429,502,503].map(code=>[code,{description:code===429?'Limite atingido; aguarde Retry-After':'Falha; consulte error.details e request_id',headers:code===429?{'Retry-After':{schema:{type:'string'}}}:{},content:json(ref('Error'))}]));
const post=(method:string,request:string,response:string,stream=false)=>({operationId:`gemini${method}`,parameters:[model,identity],requestBody:{required:true,content:json(ref(request))},responses:{200:{description:'Resultado do contrato versionado',content:stream?{'text/event-stream':{schema:{type:'string'},description:'Eventos GenerateContentResponse incrementais, sem marcador [DONE]. Créditos no evento final.'}}:json(ref(response))},...failures}});
export const geminiOpenApiSpec={openapi:'3.1.0',info:{title:'ConnectyHub · contrato Gemini',version:geminiContractVersion,description:'Compatibilidade versionada para geração, streaming, contagem, embeddings, consulta de arquivos e ciclo de caches. Não inclui todo o SDK; upload e Live usam transporte ConnectyHub próprio.'},servers:[{url:'https://www.connectyhub.com.br/api/v1beta'}],security:[{Bearer:[]},{SDKKey:[]}],paths:{
  ...geminiResourcePaths,
  ...geminiBatchPaths,
  ...geminiFileSearchPaths,
  '/models':{get:{operationId:'geminiListModels',parameters:[{name:'pageSize',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:50}},{name:'pageToken',in:'query',schema:{type:'string'}}],responses:{200:{description:'Catálogo configurado',content:json({type:'object',properties:{models:{type:'array',items:ref('Model')},nextPageToken:{type:'string'}}})},...failures}}},
  '/models/{model}':{get:{operationId:'geminiGetModel',parameters:[model],responses:{200:{description:'Modelo',content:json(ref('Model'))},...failures}}},
  '/models/{model}:generateContent':{post:post('GenerateContent','ContentRequest','GenerateContentResponse')},
  '/models/{model}:streamGenerateContent':{post:post('StreamGenerateContent','ContentRequest','GenerateContentResponse',true)},
  '/models/{model}:countTokens':{post:post('CountTokens','CountRequest','CountResponse')},
  '/models/{model}:embedContent':{post:post('EmbedContent','EmbedRequest','EmbedResponse')},
  '/models/{model}:batchEmbedContents':{post:post('BatchEmbedContents','BatchEmbedRequest','BatchEmbedResponse')},
},components:{securitySchemes:{Bearer:{type:'http',scheme:'bearer'},SDKKey:{type:'apiKey',in:'header',name:'x-goog-api-key'}},schemas:{...advancedAiSchemas,...geminiResourceSchemas,...geminiBatchSchemas,...geminiFileSearchSchemas,
  Model:{type:'object',properties:{name:{type:'string'},displayName:{type:'string'},version:{type:'string'},inputTokenLimit:{type:'integer'},outputTokenLimit:{type:'integer'},supportedGenerationMethods:{type:'array',items:{type:'string'}}}},
  Error:{type:'object',properties:{error:{type:'object',properties:{code:{type:'integer'},status:{type:'string'},message:{type:'string'},details:{type:'array',items:{type:'object',properties:{reason:{type:'string'},request_id:{type:'string'}}}}}}}},
  CountRequest:{oneOf:[{type:'object',additionalProperties:false,required:['contents'],properties:{contents:advancedAiSchemas.ContentRequest.properties.contents}},{type:'object',additionalProperties:false,required:['generateContentRequest'],properties:{generateContentRequest:ref('ContentRequest')}}]},
  CountResponse:{type:'object',properties:{totalTokens:{type:'integer'},cachedContentTokenCount:{type:'integer'},promptTokensDetails:{type:'array',items:{type:'object'}},cacheTokensDetails:{type:'array',items:{type:'object'}}}},
  GenerateContentResponse:{type:'object',properties:{candidates:{type:'array',items:{type:'object',properties:{index:{type:'integer'},content:{type:'object',properties:{role:{type:'string'},parts:{type:'array',items:ref('ContentPart')}}},finishReason:{type:'string'},finishMessage:{type:'string'},safetyRatings:{type:'array',items:{type:'object'}},citationMetadata:{type:'object'},groundingMetadata:{type:'object'},logprobsResult:{type:'object'}}}},usageMetadata:{type:'object'},promptFeedback:{type:'object'},modelVersion:{type:'string'},responseId:{type:'string'},connectyhub:ref('Credits')}},
  Credits:{type:'object',properties:{request_id:{type:'string'},project_id:{type:'string'},credits:{type:'number',minimum:0},metering_basis:{enum:['provider_usage','provider_countTokens']}}},
  CreditUsage:ref('Credits'),
  EmbedRequest:{type:'object',additionalProperties:false,required:['content'],properties:{model:{type:'string'},content:{type:'object',required:['parts'],properties:{role:{type:'string'},parts:{type:'array',items:ref('ContentPart')}}},taskType:{type:'string'},title:{type:'string'},outputDimensionality:{type:'integer',minimum:1,maximum:3072},embedContentConfig:{type:'object',additionalProperties:false,properties:{autoTruncate:{const:false},taskType:{type:'string'},title:{type:'string'},outputDimensionality:{type:'integer',minimum:1,maximum:3072},documentOcr:{type:'boolean'},audioTrackExtraction:{type:'boolean'}}}}},
  BatchEmbedRequest:{type:'object',additionalProperties:false,required:['requests'],properties:{requests:{type:'array',minItems:1,maxItems:100,items:ref('EmbedRequest')}}},
  EmbedResponse:{type:'object',properties:{embedding:{type:'object',properties:{values:{type:'array',items:{type:'number'}}}},usageMetadata:{type:'object'},connectyhub:ref('Credits')}},
  BatchEmbedResponse:{type:'object',properties:{embeddings:{type:'array',items:{type:'object',properties:{values:{type:'array',items:{type:'number'}}}}},usageMetadata:{type:'object'},connectyhub:ref('Credits')}},
}}};
