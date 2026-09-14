/** Only server configuration can select a branded tracking origin. */
export function whatsappTrackingOrigin(organizationId:string,fallback:string,raw=process.env.WHATSAPP_TRACKING_ORIGINS_JSON){
 if(!raw?.trim())return fallback.replace(/\/$/,'');
 const map:unknown=JSON.parse(raw);
 if(!map||typeof map!=='object'||Array.isArray(map))throw new Error('Invalid tracking origin configuration');
 const origin=(map as Record<string,unknown>)[organizationId];
 if(origin===undefined)return fallback.replace(/\/$/,'');
 if(typeof origin!=='string')throw new Error('Invalid tracking origin configuration');
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.port||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname.includes(':')||/^\d+(\.\d+){3}$/.test(url.hostname))throw new Error('Invalid tracking origin configuration');
 return url.origin;
}
