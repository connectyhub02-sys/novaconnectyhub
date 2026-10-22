import {describe,it,expect} from 'vitest';
import {studioVoiceSettings} from '../src/lib/voice-api/model-controls';
import {prepareSpeech,defaultPerformance} from '../src/lib/voice-api/performance';

const settings={speed:0.9,stability:0.65,similarity_boost:0.8,style:0.2,use_speaker_boost:true};
describe('Voice Studio model controls',()=>{
  it('retains Multilingual v2 settings and does not mutate saved settings',()=>{
    expect(studioVoiceSettings('eleven_multilingual_v2',settings)).toEqual(settings);
    studioVoiceSettings('eleven_v3',settings);
    expect(settings).toEqual({speed:0.9,stability:0.65,similarity_boost:0.8,style:0.2,use_speaker_boost:true});
  });
  it.each(['eleven_flash_v2_5','eleven_turbo_v2_5'])('omits unsupported style and boost for %s',model=>{
    expect(studioVoiceSettings(model,settings)).toEqual({speed:0.9,stability:0.65,similarity_boost:0.8});
  });
  it.each([[0.1,0],[0.65,0.5],[0.9,1]])('maps restored v3 stability %s to %s and omits other controls',(input,expected)=>{
    expect(studioVoiceSettings('eleven_v3',{...settings,stability:input})).toEqual({stability:expected});
  });
  it('lets expressive intensity determine v3 stability while keeping the selected voice settings intact',()=>{
    const filtered=studioVoiceSettings('eleven_v3',settings);
    const prepared=prepareSpeech('Uma história.','eleven_v3',filtered,{...defaultPerformance,style:'cinematic',intensity:'strong'});
    expect(prepared.voiceSettings).toEqual({stability:0});
    expect(filtered).toEqual({stability:0.5});
  });
});
