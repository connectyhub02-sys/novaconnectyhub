import {it,expect} from 'vitest';
import {serverModuleHarness} from './helpers/server-module-harness';
const ui=serverModuleHarness<{hasUnreadThreadSignal(thread:unknown):boolean}>('src/components/connectyhub-os/leads-crm-console.tsx',{},['hasUnreadThreadSignal']);
it('does not call an outbound-only new contact a lead reply',()=>{
 expect(ui.hasUnreadThreadSignal({lead:{status:'new'},latestMessage:{direction:'outbound',author:'ai'}})).toBe(false);
 expect(ui.hasUnreadThreadSignal({lead:{status:'new'},latestMessage:null})).toBe(false);
 expect(ui.hasUnreadThreadSignal({lead:{status:'active'},latestMessage:{direction:'inbound',author:'lead'}})).toBe(true);
});
