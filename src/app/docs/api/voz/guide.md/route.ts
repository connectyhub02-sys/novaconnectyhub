import {voiceGuide} from '@/lib/voice-api/openapi';
export const dynamic='force-static';
export function GET(){return new Response(voiceGuide,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="connectyhub-voz.md"','X-Content-Type-Options':'nosniff'}});}
