import type {AiDocBlock,AiDocPage} from './documentation';
import {aiOpenApiSpec} from './openapi';
type Node=Record<string,unknown>;
const object=(v:unknown):Node=>v&&typeof v==='object'&&!Array.isArray(v)?v as Node:{};
const schemas=aiOpenApiSpec.components.schemas as unknown as Record<string,Node>;
const resolve=(n:Node):Node=>typeof n.$ref==='string'?{...schemas[n.$ref.split('/').pop()!],...n}:n;
function typeName(n:Node):string {
  if(n.$ref)return String(n.$ref).split('/').pop()!;
  if(n.oneOf||n.anyOf)return ((n.oneOf??n.anyOf) as Node[]).map(typeName).join(' ou ');
  return Array.isArray(n.type)?n.type.join(' ou '):String(n.type??(n.const!==undefined?typeof n.const:'valor JSON'));
}
export function describeAiSchema(raw:unknown,prefix='',depth=0,seen:string[]=[]):string[][] {
  const initial=object(raw),name=String(initial.$ref??'');
  if(depth>5||name&&seen.includes(name))return [];
  const n=resolve(initial),trail=name?[...seen,name]:seen,rows:string[][]=[];
  for(const [key,value] of Object.entries(object(n.properties))) {
    const child=object(value),resolved=resolve(child),path=prefix?prefix+'.'+key:key;
    const required=Array.isArray(n.required)&&n.required.includes(key)?'Sim':'Não';
    const constraints=['minimum','maximum','minLength','maxLength','minItems','maxItems','format','pattern'].filter(k=>resolved[k]!==undefined).map(k=>`${k}: ${resolved[k]}`);
    if(resolved.enum)constraints.push('Aceita: '+(resolved.enum as unknown[]).join(', '));
    if(resolved.const!==undefined)constraints.push('Valor: '+JSON.stringify(resolved.const));
    if(resolved.default!==undefined)constraints.push('Padrão: '+JSON.stringify(resolved.default));
    rows.push([path,typeName(child),required,[resolved.description,...constraints].filter(Boolean).join(' · ')||'Consulte o tipo e os campos relacionados.']);
    rows.push(...describeAiSchema(child,path,depth+1,trail));
  }
  for(const [i,variant] of ((n.oneOf??n.anyOf??[]) as unknown[]).entries())rows.push(...describeAiSchema(variant,prefix+(prefix?'.':'')+`alternativa${i+1}`,depth+1,trail));
  if(n.items)rows.push(...describeAiSchema(n.items,prefix+'[]',depth+1,trail));
  return rows;
}
export function aiHttpReferencePages():AiDocPage[] {
  const pages:AiDocPage[]=[];
  for(const [path,pathRaw] of Object.entries(aiOpenApiSpec.paths))for(const [method,value] of Object.entries(object(pathRaw))) {
    if(!['get','post','patch','delete'].includes(method))continue;
    const op=object(value),blocks:AiDocBlock[]=[];
    const parameters=Array.isArray(op.parameters)?op.parameters as Node[]:[];
    if(parameters.length)blocks.push({kind:'table',title:'Cabeçalhos e parâmetros',columns:['Nome','Local','Obrigatório','Uso'],rows:parameters.map(p=>[String(p.name),String(p.in),p.required?'Sim':'Não',String(p.description??'')+' '+JSON.stringify(p.schema)])});
    const content=object(object(op.requestBody).content);
    for(const [mime,value] of Object.entries(content)) {
      const body=object(value),rows=describeAiSchema(body.schema);
      if(rows.length)blocks.push({kind:'table',title:'Corpo · '+mime,columns:['Campo','Tipo','Obrigatório no objeto','Descrição'],rows});
      if(body.example)blocks.push({kind:'code',title:'Exemplo do corpo',language:'json',code:JSON.stringify(body.example,null,2)});
    }
    for(const [status,raw] of Object.entries(object(op.responses))) {
      const response=object(raw);
      blocks.push({kind:'text',text:`HTTP ${status}: ${response.description??''}`});
      if(Number(status)>=300)continue;
      for(const [mime,rawContent] of Object.entries(object(response.content))) {
        const rows=describeAiSchema(object(rawContent).schema);
        if(rows.length)blocks.push({kind:'table',title:`Resposta ${status} · ${mime}`,columns:['Campo','Tipo','Obrigatório no objeto','Descrição'],rows});
      }
    }
    blocks.push({kind:'note',title:'Cobrança e recuperação',text:method==='get'?'Consultar configuração, estado ou resultado não inicia outra geração. Use a chave do mesmo projeto.':'Gerações, ferramentas, indexação e armazenamento faturável usam créditos. Configurar ou pausar uma integração não é uma geração. Preserve a identidade de cada execução; consulte seu estado após uma falha de conexão.'});
    pages.push({id:`ia-http-${method}-${path.replace(/[{}:]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()}`,label:path,group:'Referência HTTP',title:String(op.summary),description:String(op.description??'Referência dos campos públicos desta operação.'),method:method.toUpperCase(),path,blocks});
  }
  return pages;
}
