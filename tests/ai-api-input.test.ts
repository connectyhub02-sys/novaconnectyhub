import {describe,it,expect} from "vitest";
import {serverModuleHarness} from "./helpers/server-module-harness";
import * as crypto from "node:crypto";
const api=serverModuleHarness<{parseAiInput:(raw:unknown,max:number)=>{maxTokens:number;providerBody:{contents:unknown[]}};createAiSecret:()=>{secret:string;key_hash:string};hashAiSecret:(s:string)=>string}>("src/lib/ai-api/gateway.ts",{"node:crypto":crypto});
describe("External AI request boundary",()=>{
it("accepts text and inline images with an explicit output ceiling",()=>{const body=api.parseAiInput({messages:[{role:"system",content:"Responda em português"},{role:"user",content:[{type:"text",text:"Descreva"},{type:"image_url",image_url:{url:"data:image/png;base64,YWJj"}}]}],max_tokens:20},100);expect(body.maxTokens).toBe(20);expect(body.providerBody.contents).toHaveLength(1);});
it("rejects remote URLs, hidden tools and oversized output",()=>{expect(()=>api.parseAiInput({messages:[{role:"user",content:[{type:"image_url",image_url:{url:"http://127.0.0.1/secret"}}]}]},100)).toThrow("URLs remotas");expect(()=>api.parseAiInput({messages:[{role:"user",content:"Oi"}],tools:[]},100)).toThrow("Parâmetro");expect(()=>api.parseAiInput({messages:[{role:"user",content:"Oi"}],max_tokens:101},100)).toThrow("limite");});
it("only persists a hash of a cryptographically random credential",()=>{const a=api.createAiSecret(),b=api.createAiSecret();expect(a.secret).not.toBe(b.secret);expect(a.key_hash).toBe(api.hashAiSecret(a.secret));expect(a.key_hash).not.toContain(a.secret);});
});
