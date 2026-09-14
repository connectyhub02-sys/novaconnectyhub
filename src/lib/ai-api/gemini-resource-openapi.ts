const ref=(name:string)=>({$ref:`#/components/schemas/${name}`});
const content=(schema:object)=>({'application/json':{schema}});
const id={name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'},description:'Identificador ConnectyHub pertencente ao projeto da chave.'};
const result=(schema:object)=>({200:{description:'Recurso autorizado',content:content(schema)}});
const paging=(maximum:number)=>[{name:'pageSize',in:'query',schema:{type:'integer',minimum:1,maximum,default:10}},{name:'pageToken',in:'query',schema:{type:'string'}}];
const expiration={ttl:{type:'string',pattern:'^\\d+(\\.\\d{1,9})?s$',example:'3600s'},expireTime:{type:'string',format:'date-time'}};
export const geminiResourcePaths={
  '/files':{get:{operationId:'geminiListFiles',parameters:paging(100),responses:result({type:'object',properties:{files:{type:'array',items:ref('NativeFile')},nextPageToken:{type:'string'}}})}},
  '/files/{id}':{
    get:{operationId:'geminiGetFile',parameters:[id],responses:result(ref('NativeFile'))},
    delete:{operationId:'geminiDeleteFile',parameters:[id],responses:result({type:'object'})},
  },
  '/cachedContents':{
    get:{operationId:'geminiListCaches',parameters:paging(1000),responses:result({type:'object',properties:{cachedContents:{type:'array',items:ref('NativeCache')},nextPageToken:{type:'string'}}})},
    post:{operationId:'geminiCreateCache',parameters:[{name:'Idempotency-Key',in:'header',schema:{type:'string'}}],description:'Mesmo ciclo de reserva e liquidação do contrato ConnectyHub. ttl e expireTime são mutuamente exclusivos; máximo sete dias.',requestBody:{required:true,content:content({type:'object',additionalProperties:false,properties:{model:{type:'string'},contents:{type:'array',items:{type:'object'}},systemInstruction:{type:'object'},tools:{type:'array',items:{type:'object'}},toolConfig:{type:'object'},displayName:{type:'string'},...expiration}})},responses:result(ref('NativeCache'))},
  },
  '/cachedContents/{id}':{
    get:{operationId:'geminiGetCache',parameters:[id],responses:result(ref('NativeCache'))},
    delete:{operationId:'geminiDeleteCache',parameters:[id],responses:result({type:'object'})},
    patch:{operationId:'geminiUpdateCache',parameters:[id,{name:'updateMask',in:'query',schema:{enum:['ttl','expireTime','expire_time']}}],description:'Atualiza somente a expiração, contabilizando eventual extensão pelo ciclo existente. Informe ttl ou expireTime.',requestBody:{required:true,content:content({type:'object',additionalProperties:false,properties:{name:{type:'string'},...expiration}})},responses:result(ref('NativeCache'))},
  },
};
export const geminiResourceSchemas={
  NativeFile:{type:'object',properties:{name:{type:'string'},uri:{type:'string',description:'files/UUID ConnectyHub; aceito como fileData.fileUri na geração.'},displayName:{type:'string'},mimeType:{type:'string'},sizeBytes:{type:'string'},createTime:{type:'string'},updateTime:{type:'string'},expirationTime:{type:['string','null']},state:{enum:['PROCESSING','ACTIVE','FAILED']},sha256Hash:{type:'string'},videoMetadata:{type:'object'},error:{type:'object'},source:{const:'UPLOADED'}}},
  NativeCache:{type:'object',properties:{name:{type:'string'},model:{type:'string'},displayName:{type:'string'},createTime:{type:'string'},updateTime:{type:'string'},expireTime:{type:['string','null']},usageMetadata:{type:'object'},connectyhub:{type:'object'}}},
};
