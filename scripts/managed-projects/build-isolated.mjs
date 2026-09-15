// Build-only empty catalog fixture. Never publish its output or use these keys as credentials.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
const fixture=createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)||!req.url.startsWith('/rest/v1/')){res.writeHead(403);res.end();return;}
 res.writeHead(200,{'Content-Type':'application/json','Content-Range':'*/0'});res.end(req.method==='HEAD'?'':'[]');
});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const endpoint=`http://127.0.0.1:${fixture.address().port}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{stdio:'inherit',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:endpoint,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'local-build-fictional-public',SUPABASE_SECRET_KEY:'local-build-fictional-service',MANAGED_PROJECTS_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1'}});
child.once('exit',code=>{fixture.close();process.exitCode=code??1;});
