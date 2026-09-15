import React from 'react';
export function useRouter(){return {push:(url:string)=>{window.location.href=url;},refresh:()=>window.location.reload()};}
export default function Link(props:React.AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props}/>;}
