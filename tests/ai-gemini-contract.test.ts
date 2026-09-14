import {describe,it,expect} from 'vitest';
import {geminiResponse,geminiContractVersion} from '../src/lib/ai-api/gemini-contract';
import {publicAiResult} from '../src/lib/ai-api/public-response';
import {parseNativeAiInput} from '../src/lib/ai-api/native-input';
describe('Versioned inference metadata and input',()=>{
  it('preserves metering, safety, citations and opaque thought context across persisted replay',()=>{
    const data={usageMetadata:{promptTokenCount:4,thoughtsTokenCount:2},promptFeedback:{blockReason:'SAFETY'},modelVersion:'version',responseId:'trace',api_key:'must-not-leak',candidates:[{index:0,finishReason:'STOP',safetyRatings:[{category:'test'}],citationMetadata:{citationSources:[]},logprobsResult:{chosenCandidates:[]},groundingMetadata:{groundingSupports:[]},content:{parts:[{text:'summary',thought:true,thoughtSignature:'signature',privateKey:'no'}]}}]};
    const native=geminiResponse(data);
    const replay=publicAiResult({id:'request',object:'content.response',contract:geminiContractVersion,model:'flash-3.8',...native,connectyhub:{credits:1}});
    expect(replay).toMatchObject({usageMetadata:data.usageMetadata,promptFeedback:data.promptFeedback,candidates:[{safetyRatings:data.candidates[0].safetyRatings,content:{parts:[{thought:true,thoughtSignature:'signature'}]}}]});
    expect(JSON.stringify(replay)).not.toMatch(/must-not-leak|privateKey/);
    expect(publicAiResult({object:'content.response',...data})).not.toHaveProperty('usageMetadata');
  });
  it('accepts tool aliases, multiple candidates and thought/code round-trip without accepting a foreign file',()=>{
    const input=parseNativeAiInput({contents:[{role:'model',parts:[{text:'summary',thought:true,thoughtSignature:'opaque'},{executableCode:{language:'PYTHON',code:'print(1)'}}]},{role:'user',parts:[{text:'continue'}]}],tools:[{googleSearch:{}}],generationConfig:{candidateCount:3},store:false},100);
    expect(input.providerBody.generationConfig.candidateCount).toBe(3);expect(input.capabilities).toContain('web_search');
    expect(()=>parseNativeAiInput({contents:[{parts:[{text:'hi'}]}],generationConfig:{candidateCount:9}},100)).toThrow('candidateCount');
    expect(()=>parseNativeAiInput({contents:[{parts:[{text:'hi'}]}],serviceTier:'PRIORITY'},100)).toThrow('STANDARD');
    expect(()=>parseNativeAiInput({contents:[{parts:[{fileData:{fileUri:'https://provider/other-tenant'}}]}]},100)).toThrow('projeto');
  });
});
