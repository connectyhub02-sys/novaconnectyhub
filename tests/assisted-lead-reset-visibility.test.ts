import { afterEach, expect, it, vi } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

function fixture() {
  vi.useFakeTimers();
  let allowed = false;
  let start: (() => (() => void) | undefined) | undefined;
  const events = new Map<string, () => void>();
  const fetch = vi.fn(async () => Response.json({ canResetLead: true, expiresAt: new Date(Date.now()+2000).toISOString() }));
  const hook = serverModuleHarness<{useAssistedLeadReset(enabled:boolean):boolean}>("src/hooks/use-assisted-lead-reset.ts", {
    react: { useState: () => [allowed, (value:boolean) => {allowed=value;}], useEffect: (fn:typeof start) => {start=fn;} },
  }, [], {fetch,setTimeout,clearTimeout,setInterval,clearInterval,window:{addEventListener:(name:string,fn:()=>void)=>events.set(name,fn),removeEventListener:(name:string)=>events.delete(name)}});
  hook.useAssistedLeadReset(true);
  const dispose=start!();
  return {hook,fetch,events,dispose,allowed:()=>allowed};
}
afterEach(()=>vi.useRealTimers());
it("keeps reset hidden until a server decision and removes it at expiry",async()=>{
  const f=fixture(); expect(f.allowed()).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(f.allowed()).toBe(true);
  await vi.advanceTimersByTimeAsync(2000); expect(f.allowed()).toBe(false); f.dispose?.();
});
it("hides reset on revocation, server denial and internal attendance",async()=>{
  const f=fixture(); await vi.advanceTimersByTimeAsync(1); expect(f.allowed()).toBe(true);
  expect(f.hook.useAssistedLeadReset(false)).toBe(false);
  f.events.get("connectyhub:assisted-access-ended")!(); expect(f.allowed()).toBe(false);
  f.fetch.mockImplementation(async()=>Response.json({canResetLead:false,expiresAt:null}));
  await vi.advanceTimersByTimeAsync(15000); expect(f.allowed()).toBe(false); f.dispose?.();
});
it("ignores an in-flight response that completes after assisted access ends",async()=>{
  const f=fixture(); await vi.advanceTimersByTimeAsync(1);
  let finish: ((r:Response)=>void)|undefined;
  f.fetch.mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  f.events.get("focus")!(); expect(f.allowed()).toBe(false);
  f.events.get("connectyhub:assisted-access-ended")!();
  finish!(Response.json({canResetLead:true,expiresAt:new Date(Date.now()+10000).toISOString()}));
  await vi.advanceTimersByTimeAsync(1); expect(f.allowed()).toBe(false); f.dispose?.();
});
