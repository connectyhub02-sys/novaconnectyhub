const ref=(name:string)=>({$ref:`#/components/schemas/${name}`});
const content=(schema:object)=>({'application/json':{schema}});
const id=(name:string)=>({name,in:'path',required:true,schema:{type:'string',format:'uuid'}});
const store=id('store'),document=id('document');
const errors=Object.fromEntries([400,401,402,403,404,409,422,429,502,503].map(code=>[code,{description:'Falha com motivo em error.details.',content:content(ref('Error'))}]));
const result=(schema:string)=>({200:{description:'Recurso do próprio projeto',content:content(ref(schema))},...errors});
const force={name:'force',in:'query',schema:{type:'boolean',default:false},description:'Autoriza excluir o conteúdo. Indexação em andamento permanece protegida.'};
const pagination=[{name:'pageSize',in:'query',schema:{type:'integer',minimum:1,maximum:20,default:10}},{name:'pageToken',in:'query',schema:{type:'string'}}];
const listing=(key:string,schema:string)=>({200:{description:'Estado persistido localmente; consulte cada recurso para atualizar os dados do fornecedor.',content:content({type:'object',properties:{[key]:{type:'array',items:ref(schema)},nextPageToken:{type:'string'}}})},...errors});
export const geminiFileSearchPaths={
  '/fileSearchStores':{
    get:{operationId:'geminiListFileSearchStores',parameters:pagination,responses:listing('fileSearchStores','FileSearchStore')},
    post:{operationId:'geminiCreateFileSearchStore',description:'Cria uma coleção do projeto. embeddingModel personalizado ainda não suportado.',parameters:[{name:'Idempotency-Key',in:'header',schema:{type:'string'}}],requestBody:{required:true,content:content({type:'object',additionalProperties:false,properties:{displayName:{type:'string',maxLength:200}}})},responses:result('FileSearchStore')},
  },
  '/fileSearchStores/{store}':{
    get:{operationId:'geminiGetFileSearchStore',parameters:[store],responses:result('FileSearchStore')},
    delete:{operationId:'geminiDeleteFileSearchStore',parameters:[store,force],responses:result('EmptyFileSearchResult')},
  },
  '/fileSearchStores/{store}:importFile':{post:{operationId:'geminiImportFileSearchFile',parameters:[store,{name:'Idempotency-Key',in:'header',schema:{type:'string'}}],description:'Indexa um arquivo files/UUID já enviado pelo transporte ConnectyHub (até 20 MB), pertencente ao mesmo projeto. Reserva e liquidação de créditos usam o contrato existente. Não suporta upload binário nativo do SDK.',requestBody:{required:true,content:content(ref('FileSearchImportRequest'))},responses:result('FileSearchOperation')}},
  '/fileSearchStores/{store}/documents':{get:{operationId:'geminiListFileSearchDocuments',parameters:[store,...pagination],responses:listing('documents','FileSearchDocument')}},
  '/fileSearchStores/{store}/documents/{document}':{
    get:{operationId:'geminiGetFileSearchDocument',parameters:[store,document],responses:result('FileSearchDocument')},
    delete:{operationId:'geminiDeleteFileSearchDocument',parameters:[store,document,force],responses:result('EmptyFileSearchResult')},
  },
  '/fileSearchStores/{store}/operations/{document}':{get:{operationId:'geminiGetFileSearchOperation',parameters:[store,document],description:'Consulta e reconcilia a indexação existente sem reenviar o arquivo ou criar nova cobrança.',responses:result('FileSearchOperation')}},
};
const common={name:{type:'string'},displayName:{type:'string'},createTime:{type:'string',format:'date-time'},updateTime:{type:'string',format:'date-time'},sizeBytes:{type:'string'}};
export const geminiFileSearchSchemas={
  EmptyFileSearchResult:{type:'object',additionalProperties:false},
  FileSearchStore:{type:'object',properties:{...common,activeDocumentsCount:{type:'string'},pendingDocumentsCount:{type:'string'},failedDocumentsCount:{type:'string'}}},
  FileSearchDocument:{type:'object',properties:{...common,state:{enum:['STATE_PENDING','STATE_ACTIVE','STATE_FAILED']},mimeType:{type:'string'},customMetadata:{type:'array',maxItems:20,items:ref('FileSearchMetadata')}}},
  FileSearchMetadata:{type:'object',additionalProperties:false,required:['key'],properties:{key:{type:'string',minLength:1},stringValue:{type:'string'},numericValue:{type:'number'},stringListValue:{type:'object',additionalProperties:false,required:['values'],properties:{values:{type:'array',items:{type:'string'}}}}},oneOf:[{required:['stringValue']},{required:['numericValue']},{required:['stringListValue']}]},
  FileSearchImportRequest:{type:'object',additionalProperties:false,required:['fileName'],properties:{fileName:{type:'string',pattern:'^files/[a-fA-F0-9-]{36}$'},customMetadata:{type:'array',maxItems:20,items:ref('FileSearchMetadata')},chunkingConfig:{type:'object',additionalProperties:false,required:['whiteSpaceConfig'],properties:{whiteSpaceConfig:{type:'object',additionalProperties:false,required:['maxTokensPerChunk'],properties:{maxTokensPerChunk:{type:'integer',minimum:1,maximum:512},maxOverlapTokens:{type:'integer',minimum:0,default:0,description:'Deve ser menor que maxTokensPerChunk.'}}}}}}},
  FileSearchOperation:{type:'object',properties:{name:{type:'string'},done:{type:'boolean'},response:{type:'object',properties:{documentName:{type:'string'},parent:{type:'string'}}},error:{type:'object',properties:{code:{type:'integer'},message:{type:'string'}}},connectyhub:ref('Credits')}},
};
