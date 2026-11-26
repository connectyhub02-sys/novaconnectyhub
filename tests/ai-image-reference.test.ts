import {describe,it,expect} from 'vitest';
import {aiModelDefinition} from '../src/lib/ai-api/model-catalog';
import {parseNativeAiInput} from '../src/lib/ai-api/native-input';

describe('image editing references',()=>{
  it.each(['pro-3-image','pro-3-image-preview','image-pro-preview','flash-2.5-image','flash-3.1-image','flash-3.1-image-preview','flash-lite-3.1-image'])('%s admits photo references alongside image output',id=>{
    const model=aiModelDefinition(id)!;
    const input=parseNativeAiInput({contents:[{role:'user',parts:[{text:'Place the reference car in the reference showroom.'},{inlineData:{mimeType:'image/jpeg',data:'aGVsbG8='}},{inlineData:{mimeType:'image/png',data:'d29ybGQ='}}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio:'4:5',imageSize:'2K'},maxOutputTokens:8192}},model.outputCapacity);
    expect(input.capabilities).toEqual(['image_input','image_output']);
    expect(input.capabilities.every(c=>model.capabilities.includes(c))).toBe(true);
  });
  it('keeps unsupported modalities rejected by image models',()=>{
    const model=aiModelDefinition('pro-3-image')!;
    expect(model.capabilities).not.toContain('audio_input');
    expect(model.capabilities).not.toContain('functions');
  });
});
