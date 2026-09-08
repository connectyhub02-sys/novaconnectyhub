import type {MetadataRoute} from "next";
import {loadPublicCatalogIndex,publicCatalogSitemapIds} from "@/lib/seo/public-index";
export const revalidate=3600;
export const runtime="nodejs";
export async function generateSitemaps(){return publicCatalogSitemapIds();}
export default async function sitemap({id}:{id:Promise<string>}):Promise<MetadataRoute.Sitemap>{
 const page=Number(await id);if(!Number.isSafeInteger(page)||page<0)return [];
 const catalog=await loadPublicCatalogIndex({productLimit:5000,offset:page*5000});
 const modified=(v:string|null)=>v&&!Number.isNaN(Date.parse(v))?new Date(v):undefined;
 return [...catalog.stores.flatMap(s=>[{url:s.url,lastModified:modified(s.updatedAt),changeFrequency:"daily" as const,priority:0.72},{url:s.productsUrl,lastModified:modified(s.updatedAt),changeFrequency:"daily" as const,priority:0.68}]),...catalog.products.map(p=>({url:p.url,lastModified:modified(p.updatedAt),changeFrequency:"weekly" as const,priority:0.62,images:p.imageUrl?[p.imageUrl]:undefined}))];
}
