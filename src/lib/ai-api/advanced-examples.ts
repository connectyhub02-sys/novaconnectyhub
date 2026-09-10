export const aiStructuredExample = {
  messages:[{role:"user",content:"Extraia o nome e a quantidade: 3 cadernos."}],
  response_format:{type:"json_schema",json_schema:{name:"produto",schema:{type:"object",properties:{nome:{type:"string"},quantidade:{type:"integer"}},required:["nome","quantidade"],additionalProperties:false}}},
};
export const aiFunctionExample = {
  messages:[{role:"user",content:"Qual a situação do pedido 123?"}],
  tools:[{type:"function",function:{name:"consultar_pedido",description:"Consulta um pedido autorizado no sistema da loja.",parameters:{type:"object",properties:{pedido:{type:"string"}},required:["pedido"]}}}],
  tool_choice:"auto",
};
export const aiFunctionReturnExample = {
  ...aiFunctionExample,
  messages:[...aiFunctionExample.messages,
    {role:"assistant",content:null,tool_calls:[{id:"call_exemplo",type:"function",function:{name:"consultar_pedido",arguments:'{"pedido":"123"}'}}]},
    {role:"tool",tool_call_id:"call_exemplo",content:'{"situacao":"em entrega"}'},
  ],
};
export const aiNativeExample = {
  contents:[{role:"user",parts:[{text:"Calcule a média de 14, 27 e 43 usando código."}]}],
  tools:[{codeExecution:{}}],generationConfig:{temperature:0.3},
};
export const aiEmbeddingExample = {input:"Mochila impermeável para notebook",task_type:"RETRIEVAL_DOCUMENT",title:"Mochila",dimensions:768};
export const aiFileExample = {display_name:"horarios.txt",mime_type:"text/plain",data:"U2VndW5kYSBhIHNleHRhOiA5aCDDoHMgMThoLg=="};
export const aiFileContentExample = {contents:[{role:"user",parts:[{text:"Resuma o arquivo."},{fileData:{fileUri:"files/00000000-0000-4000-8000-000000000003"}}]}]};
