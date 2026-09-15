import 'server-only';
export function configuration(){const url=process.env.PORTAL_DATABASE_URL,key=process.env.PORTAL_ANON_KEY,origin=process.env.PORTAL_ORIGIN;if(!url||!key||!origin)throw Error('Portal configuration missing');return {url,key,origin};}
