"use client";
import type {ReactNode} from "react";
export function MeetingLink({children,className}:{children:ReactNode;className?:string}){
 return <a href="/solucoes-personalizadas/conversar" rel="nofollow" className={className} onClick={e=>{
   const from=new URL(window.location.href),to=new URL("/solucoes-personalizadas/conversar",from);
   for(const key of ["utm_source","utm_medium","utm_campaign","utm_content"]){const v=from.searchParams.get(key);if(v)to.searchParams.set(key,v.slice(0,150));}
   e.currentTarget.href=to.pathname+to.search;
 }}>{children}</a>;
}
