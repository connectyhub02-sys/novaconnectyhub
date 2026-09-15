'use client';
export function Logout(){return <button onClick={async()=>{const r=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});if(r.ok)window.location.assign('/login');}}>Sair da conta</button>;}
