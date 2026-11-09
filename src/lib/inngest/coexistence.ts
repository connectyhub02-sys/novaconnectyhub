import {inngest} from './client';
import {coexistenceEvent,deliverCoexistenceEvent,recoverCoexistenceEvents} from '@/lib/connectyhub-api/coexistence-events';
export const coexistenceFunctions=[
 inngest.createFunction({id:'connectyhub-meta-coexistence-delivery',name:'Entrega da coexistência aos clientes API',retries:5,concurrency:{limit:1,key:'event.data.receiptId'},triggers:[{event:coexistenceEvent}]},async({event,step})=>step.run('deliver',()=>deliverCoexistenceEvent(String(event.data.receiptId)))),
 inngest.createFunction({id:'connectyhub-meta-coexistence-recovery',name:'Recuperação de eventos da coexistência',retries:2,concurrency:{limit:1},triggers:[{cron:'*/5 * * * *'}]},async({step})=>step.run('recover',()=>recoverCoexistenceEvents()))
];
