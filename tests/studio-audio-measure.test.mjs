import {it,expect} from 'vitest';
import {measureStudioAudio} from '../services/ai-relay/audio-measure.mjs';

function wav(seconds=1){
 const size=Math.round(seconds*16000)*2,b=Buffer.alloc(44+size);
 b.write('RIFF');b.writeUInt32LE(36+size,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(size,40);return b;
}
it('measures synthetic audio from decoded samples, including fractional seconds',async()=>{
 expect(await measureStudioAudio(wav(1.125))).toEqual({duration_seconds:1.125,channels:1,sample_rate:16000});
});
it('rejects containers that exceed the decoded duration cap',async()=>{
 await expect(measureStudioAudio(wav(2),{maxSeconds:1})).rejects.toThrow('audio_invalid_or_limit');
});
it('rejects invalid, empty and oversized sources before accepting any duration',async()=>{
 await expect(measureStudioAudio(Buffer.from('#EXTM3U\nhttps://example.com/private.mp3'))).rejects.toThrow();
 await expect(measureStudioAudio(Buffer.alloc(0))).rejects.toThrow('audio_size_invalid');
 await expect(measureStudioAudio(Buffer.alloc(20_000_001))).rejects.toThrow('audio_size_invalid');
});
it('rejects a truncated WAV rather than trusting its declared duration',async()=>{
 await expect(measureStudioAudio(wav().subarray(0,400))).rejects.toThrow();
});
