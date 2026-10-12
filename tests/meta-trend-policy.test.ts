import {expect,it} from "vitest";
import {parseTrendBrief,parseTrendResult} from "../src/lib/meta/trend-policy";
it("accepts only supported platform and bounded public context",()=>{
 expect(parseTrendBrief({niche:"Academias",country:"Brasil",platform:"Instagram",organizationId:"other"})).toEqual({niche:"Academias",country:"Brasil",platform:"Instagram"});
 expect(()=>parseTrendBrief({niche:"x",country:"Brasil",platform:"Instagram"})).toThrow();
 expect(()=>parseTrendBrief({niche:"Academias",country:"Brasil",platform:"Unknown"})).toThrow();
});
it("requires real grounding and retains sources and required attribution",()=>{
 const candidate={content:{parts:[{text:"Uma ideia."}]},groundingMetadata:{webSearchQueries:["fitness","fitness",""],groundingChunks:[{web:{uri:"https://example.com/a",title:"Fonte"}}],groundingSupports:[{segment:{endIndex:10},groundingChunkIndices:[0,7]}],searchEntryPoint:{renderedContent:"<div>Google</div>"}}};
 const r=parseTrendResult({candidates:[candidate]});expect(r.queries).toEqual(["fitness"]);expect(r.text).toBe("Uma ideia. [1]");expect(r.attribution).toContain("Google");
 expect(()=>parseTrendResult({candidates:[{content:candidate.content}]})).toThrow(/fontes/);
 candidate.groundingMetadata.groundingChunks[0].web.uri="javascript:alert(1)";expect(()=>parseTrendResult({candidates:[candidate]})).toThrow(/fontes/);
});
