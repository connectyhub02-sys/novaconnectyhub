import {it,expect} from 'vitest';
import {coexistenceGraphPath,coexistenceAnalyticsParams} from '../src/lib/connectyhub-api/coexistence-policy';
const params={start:'1794412800',end:'1794499200',granularity:'DAILY',metric_types:'sent,delivered,read,clicked',template_ids:'["2052410958794632"]'};
it('limits analytics to the bound WABA and read operations',()=>{
 expect(coexistenceGraphPath('/12345/template_analytics','12345','67890','GET')).toBe('12345/template_analytics');
 expect(()=>coexistenceGraphPath('/99999/template_analytics','12345','67890','GET')).toThrow();
 expect(()=>coexistenceGraphPath('/12345/template_analytics','12345','67890','POST')).toThrow();
});
it('accepts bounded analytics and rejects credentials, unbounded periods and query injection',()=>{
 expect(()=>coexistenceAnalyticsParams(params)).not.toThrow();
 for(const change of [{access_token:'secret'},{start:'0'},{end:'1994499200'},{granularity:'HOURLY'},{template_ids:'["123&fields=token"]'},{metric_types:'read,access_token'},{limit:'10000'}]) expect(()=>coexistenceAnalyticsParams({...params,...change})).toThrow();
});
