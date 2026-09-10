import {describe,it,expect} from "vitest";
import {parseAdvancedAiOptions,parseAiMessages} from "../src/lib/ai-api/advanced-input";
import {parseNativeAiInput} from "../src/lib/ai-api/native-input";
import {parseEmbeddingInput} from "../src/lib/ai-api/embedding-input";
import {aiStructuredExample,aiFunctionExample,aiFunctionReturnExample,aiNativeExample,aiEmbeddingExample,aiFileContentExample} from "../src/lib/ai-api/advanced-examples";
describe("Advanced AI inputs",()=>{
  it("maps schemas, declarations and tool results without executing client functions",()=>{
    expect(parseAdvancedAiOptions(aiStructuredExample).config.responseJsonSchema).toEqual(aiStructuredExample.response_format.json_schema.schema);
    expect(parseAdvancedAiOptions(aiFunctionExample).tools).toMatchObject([{functionDeclarations:[{name:"consultar_pedido",parametersJsonSchema:{type:"object"}}]}]);
    const parsed=parseAiMessages(aiFunctionReturnExample.messages);
    expect(parsed.contents.at(-1)?.parts[0]).toEqual({functionResponse:{id:"call_exemplo",name:"consultar_pedido",response:{situacao:"em entrega"}}});
    expect(()=>parseAiMessages([{role:"user",content:"Oi"},{role:"tool",tool_call_id:"other",content:"{}"}])).toThrow("tool_call_id");
    expect(()=>parseAdvancedAiOptions({...aiFunctionExample,tool_choice:{type:"function",function:{name:"delete_all"}}})).toThrow("Selecione");
  });
  it("preserves opaque function context through the round trip",()=>{
    const messages=structuredClone(aiFunctionReturnExample.messages);
    Object.assign(messages[1],{tool_calls:[{id:"call_exemplo",type:"function",context:"opaque-signature",function:{name:"consultar_pedido",arguments:'{"pedido":"123"}'}}]});
    expect(parseAiMessages(messages).contents[1].parts[0]).toMatchObject({thoughtSignature:"opaque-signature"});
  });
  it("accepts multimodal input and rejects remote resource bypasses",()=>{
    expect(parseNativeAiInput(aiNativeExample,65536).capabilities).toContain("code_execution");
    expect(parseNativeAiInput(aiFileContentExample,65536).providerBody.contents).toHaveLength(1);
    for(const uri of ["https://private.invalid/file","files/foreign-provider-id"]) expect(()=>parseNativeAiInput({contents:[{parts:[{fileData:{fileUri:uri}}]}]},65536)).toThrow("projeto");
    expect(()=>parseNativeAiInput({...aiNativeExample,systemInstruction:{parts:[{fileData:{fileUri:"files/anything"}}]}},65536)).toThrow("somente partes de texto");
    expect(()=>parseNativeAiInput({contents:[{parts:[{functionResponse:{name:"tool",response:{},parts:[{fileData:{fileUri:"secret"}}]}}]}]},65536)).toThrow("função inválido");
    for(const mime of ["application/pdf","audio/mpeg","video/mp4"]) expect(parseNativeAiInput({contents:[{parts:[{inlineData:{mimeType:mime,data:"YWJj"}}]}]},65536).capabilities.length).toBe(1);
    expect(()=>parseNativeAiInput({contents:[{parts:[{inlineData:{mimeType:"application/exe",data:"YWJj"}}]}]},65536)).toThrow("inline inválida");
  });
  it("validates text embedding configuration and disables silent truncation",()=>{
    const parsed=parseEmbeddingInput(aiEmbeddingExample);
    expect(parsed.providerBody.embedContentConfig).toEqual({autoTruncate:false,taskType:"RETRIEVAL_DOCUMENT",title:"Mochila",outputDimensionality:768});
    for(const input of [{input:[]},{input:" "},{input:"hello",dimensions:0},{input:"hello",title:"invalid"},{input:"hello",task_type:"OTHER"}]) expect(()=>parseEmbeddingInput(input)).toThrow();
  });
});
