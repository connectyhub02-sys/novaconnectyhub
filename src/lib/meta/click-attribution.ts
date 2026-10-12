// Call only after this tenant's visitor has opted in to Meta measurement.
export function metaClickAttribution(search:string,previous:string|null,now=Date.now()) {
  const click=new URLSearchParams(search).get("fbclid");
  if(click&&/^[A-Za-z0-9_-]{1,500}$/.test(click)) {
    if(previous?.endsWith(`.${click}`)&&/^fb\.1\.\d{13}\./.test(previous))return previous;
    return `fb.1.${now}.${click}`;
  }
  const match=previous?.match(/^fb\.1\.(\d{13})\.[A-Za-z0-9_-]{1,500}$/);
  return match&&Number(match[1])<=now&&now-Number(match[1])<90*86400000?previous:undefined;
}
