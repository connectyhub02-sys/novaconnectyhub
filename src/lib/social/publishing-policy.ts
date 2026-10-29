export const targets = ['instagram','facebook','tiktok','youtube'] as const;
export type Target = typeof targets[number];
export const targetLabels: Record<Target,string> = { instagram:'Instagram Reels',facebook:'Facebook Reels',tiktok:'TikTok',youtube:'YouTube' };
export type VideoCheck = { version: 1; duration: number; width: number; height: number; fps: number; videoCodec: string; audioCodec: string | null; sha256: string; warnings: string[] };
export type SocialDraft = { mediaId: string; title: string; caption: string; targets: Target[]; captions: Partial<Record<Target,string>>;
 youtube: {privacy: 'private'|'unlisted'|'public'; madeForKids: boolean; synthetic: boolean};
 tiktok: {privacy: string; comments: boolean; duet: boolean; stitch: boolean; ownBrand: boolean; branded: boolean; consent: boolean; accountId?:string}; timezone: string };
export type CreatorInfo = {creator_username:string;creator_nickname:string;privacy_level_options:string[];comment_disabled:boolean;duet_disabled:boolean;stitch_disabled:boolean;max_video_post_duration_sec:number};
export function parseSocialDraft(raw: unknown): SocialDraft {
 const b = raw as SocialDraft;
 if (!b || !/^[a-f0-9-]{36}$/i.test(b.mediaId ?? '') || typeof b.title!=='string' || !b.title.trim() || b.title.length>100 || /[<>]/.test(b.title)) throw Error('Informe o vídeo e um título de até 100 caracteres, sem < ou >.');
 if(typeof b.caption!=='string'||b.caption.length>5000)throw Error('Legenda inválida (até 5.000 caracteres).');
 if(!Array.isArray(b.targets)||!b.targets.length||b.targets.some(t=>!targets.includes(t))||new Set(b.targets).size!==b.targets.length)throw Error('Escolha as redes para esta publicação.');
 if(typeof b.timezone!=='string'||!b.timezone||b.timezone.length>80)throw Error('Escolha um fuso horário.');
 try { new Intl.DateTimeFormat('pt-BR',{timeZone:b.timezone}).format(); } catch {throw Error('Fuso horário inválido.');}
 const captions: Partial<Record<Target,string>>={};
 for(const t of b.targets){const text=b.captions?.[t]??b.caption;const limit=t==='instagram'||t==='tiktok'?2200:5000;if(typeof text!=='string'||text.length>limit)throw Error(`A legenda de ${targetLabels[t]} deve ter até ${limit} caracteres.`);if(b.captions?.[t]!==undefined)captions[t]=text;}
 if(b.targets.includes('youtube')&&(!['private','unlisted','public'].includes(b.youtube?.privacy)||typeof b.youtube?.madeForKids!=='boolean'||typeof b.youtube?.synthetic!=='boolean'))throw Error('Defina privacidade, público infantil e conteúdo sintético do YouTube.');
 const tt=b.tiktok;
 if(b.targets.includes('tiktok')&&(!tt||typeof tt.privacy!=='string'||['comments','duet','stitch','ownBrand','branded','consent'].some(k=>typeof tt[k as keyof typeof tt]!=='boolean')))throw Error('Defina as opções do TikTok.');
 return {mediaId:b.mediaId,title:b.title.trim(),caption:b.caption,targets:b.targets,captions,timezone:b.timezone,youtube:b.youtube??{privacy:'private',madeForKids:false,synthetic:false},tiktok:tt??{privacy:'',comments:false,duet:false,stitch:false,ownBrand:false,branded:false,consent:false}};
}
export function videoBlocks(check: VideoCheck, target: Target): string[] {
 const errors:string[]=[];
 if(check.version!==1||check.videoCodec!=='h264'||(check.audioCodec&&check.audioCodec!=='aac'))errors.push('Use MP4 com vídeo H.264 e áudio AAC.');
 if(!Number.isFinite(check.duration)||check.duration<3)errors.push('O vídeo deve ter pelo menos 3 segundos.');
 if(target==='facebook'&&(check.duration>90||check.width>=check.height))errors.push('Para Facebook Reels, use vídeo vertical de até 90 segundos.');
 if(target==='instagram'&&(check.duration>180||check.width>check.height))errors.push('Neste fluxo, Instagram Reels aceita vídeo quadrado ou vertical de até 3 minutos.');
 if(target==='tiktok'&&(Math.min(check.width,check.height)<360||Math.max(check.width,check.height)>4096||check.fps<23||check.fps>60))errors.push('TikTok: dimensões entre 360 e 4096 e taxa entre 23 e 60 quadros/s.');
 return errors;
}
export function validateCreator(draft: SocialDraft,info: CreatorInfo,check: VideoCheck){
 const t=draft.tiktok;
 if(!t.consent)throw Error('Confirme os termos e autorize o envio ao TikTok.');
 if(!info.privacy_level_options.includes(t.privacy))throw Error('A privacidade disponível no TikTok mudou. Revise a publicação.');
 if(check.duration>info.max_video_post_duration_sec)throw Error('O vídeo excede a duração permitida para esta conta TikTok.');
 if((t.comments&&info.comment_disabled)||(t.duet&&info.duet_disabled)||(t.stitch&&info.stitch_disabled))throw Error('As permissões de interação do TikTok mudaram. Revise as opções.');
 if(t.branded&&t.privacy==='SELF_ONLY')throw Error('Conteúdo de parceria paga não pode ser privado no TikTok.');
}
export function postStatus(deliveries: {status:string}[],state:string){
 if(state==='draft')return 'Rascunho';if(state==='cancelled')return 'Cancelada';
 if(deliveries.length&&deliveries.every(d=>d.status==='published'))return 'Publicada';
 if(deliveries.some(d=>d.status==='published'))return 'Publicação parcial';
 if(deliveries.some(d=>d.status==='uncertain'))return 'Conferência necessária';
 if(deliveries.some(d=>d.status==='processing'))return 'Processando';
 if(deliveries.some(d=>d.status==='queued'))return 'Na fila';return 'Falha';
}
