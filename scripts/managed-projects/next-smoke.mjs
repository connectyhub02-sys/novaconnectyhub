import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3027'],{stdio:'ignore',env:{...process.env,MANAGED_PROJECTS_ENABLED:'false',NEXT_TELEMETRY_DISABLED:'1'}});
try{
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:3027/api/managed-projects')).status===404;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'disabled API returns 404');
 const page=await fetch('http://127.0.0.1:3027/infraestrutura',{redirect:'manual'});const html=await page.text();
 // Next may have begun streaming before notFound; assert the denied content as well as API status.
 assert.ok(html.includes('Esta pagina nao existe ou foi movida.'));assert.ok(!html.includes('Novo projeto'));
 console.log(JSON.stringify({passed:true,server:'Next production build on loopback',feature_disabled:true,production_access:false}));
}finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));}
