import {voiceRoute} from '@/lib/voice-api/routes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
type Context={params:Promise<{path:string[]}>};
export async function GET(r:Request,c:Context){return voiceRoute(r,(await c.params).path);}
export async function POST(r:Request,c:Context){return voiceRoute(r,(await c.params).path);}
export async function PATCH(r:Request,c:Context){return voiceRoute(r,(await c.params).path);}
export async function DELETE(r:Request,c:Context){return voiceRoute(r,(await c.params).path);}
