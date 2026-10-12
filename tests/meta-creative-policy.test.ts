import { describe, expect, it } from "vitest";
import { parseCreativeBrief, parseCreativeReport, creativeCriteria } from "../src/lib/meta/creative-policy";
const mediaId = "11111111-1111-4111-8111-111111111111";
const brief = (extras = {}) => parseCreativeBrief({ mode: "campaign", prompt: "Crie minha campanha", adCount: 3, currency: "USD", ...extras });
const generated = { title: "Proposta", summary: "Diagnóstico", score: 99, criteria: creativeCriteria.map(name => ({ name, score: 60, evidence: "Texto visível no criativo", improvement: "Melhorar contraste" })), campaign: { dailyBudget: 9999, budgetMode: "ABO", destination: "https://malicioso.test", adSets: [{name:"A"},{name:"B"},{name:"C"}], ads: [1,2,3].map(i => ({name:`Anúncio ${i}`,primaryText:"Texto da oferta"})) } };
describe("creative studio policies", () => {
  it("does not score unseen media or a draft script", () => expect(parseCreativeReport(generated, brief()).score).toBeNull());
  it("calculates score from evidence instead of accepting the free-form total", () => expect(parseCreativeReport(generated, brief({mediaId})).score).toBe(60));
  it("does not label missing evidence as a score", () => expect(parseCreativeReport({...generated,criteria:[]}, brief({mediaId})).score).toBeNull());
  it("respects the option to skip scoring", () => expect(parseCreativeReport(generated, brief({mediaId,analyze:false})).score).toBeNull());
  it("does not invent budget or accept a generated destination", () => {const r=parseCreativeReport(generated,brief());expect(r.campaign?.dailyBudget).toBeNull();expect(r.campaign?.destination).toBe("");expect(r.campaign?.budgetMode).toBe("CBO");});
  it("splits ABO without increasing the total by rounding", () => {const r=parseCreativeReport(generated,brief({dailyBudget:10,budgetMode:"ABO"}));expect(r.campaign?.adSets.map(a=>a.dailyBudget)).toEqual([3.34,3.33,3.33]);});
  it("keeps CBO budget only at campaign level", () => expect(parseCreativeReport(generated,brief({dailyBudget:50})).campaign?.adSets.every(a=>a.dailyBudget===null)).toBe(true));
  it("requires all requested ads", () => expect(()=>parseCreativeReport({...generated,campaign:{...generated.campaign,ads:[]}},brief())).toThrow());
  it("requires actual media for media analysis", () => expect(()=>parseCreativeBrief({mode:"analysis",prompt:"analise"})).toThrow());
  it("requires explicit currency when there is a budget",()=>expect(()=>brief({dailyBudget:50,currency:null})).toThrow(/moeda/));
  it("does not accept the model's currency",()=>expect(parseCreativeReport({...generated,campaign:{...generated.campaign,currency:"BRL"}},brief({dailyBudget:50})).campaign?.currency).toBe("USD"));
  it("does not carry hidden campaign fields into a script or media diagnosis",()=>{
    for(const mode of ["script","analysis"]){
      const b=brief({mode,mediaId,dailyBudget:50,currency:"USD",destination:"https://example.com",budgetMode:"ABO",adCount:8});
      expect(b.dailyBudget).toBeNull();expect(b.currency).toBeNull();expect(b.destination).toBe("");expect(b.budgetMode).toBe("CBO");expect(b.adCount).toBe(3);
    }
  });
  it("rejects invalid numbers and insecure destinations", () => { for(const x of [{dailyBudget:-1},{dailyBudget:"abc"},{adCount:50},{destination:"http://example.com"}])expect(()=>brief(x)).toThrow(); });
});
