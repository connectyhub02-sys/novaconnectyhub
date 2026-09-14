import {geminiOpenApiSpec} from '@/lib/ai-api/gemini-openapi';
export function GET(){return Response.json(geminiOpenApiSpec,{headers:{'Cache-Control':'public, max-age=300'}});}
