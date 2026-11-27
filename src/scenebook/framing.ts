// ── Dreamland 삽화: 장면별 화면 비율 · 구도 태그 · 그림체 · 줄 단위 삽화 지시 읽기 ──
// 옛 js/scenebook-framing.js 를 동작 그대로 옮긴 것 (illust.js 는 아직 옛 파일을 쓴다)
export type Orientation=''|'portrait'|'landscape'|'square';
export interface SizeBase{width:number;height:number;budgetGuard?:boolean}
export interface PlanCharacter{name:string;x?:number;y?:number;action?:string;outfit?:string;appearance?:string;profileId?:string}
/** 만화 · 웹툰 한 칸: 그 칸의 글과 그 칸에 보이는 인물 (좌표는 칸 안에서) */
export interface PlanPanel{text:string;height?:string;characters:PlanCharacter[]}
export interface PlanScene{characters:PlanCharacter[];camera?:string;prompt?:string;negative?:string;evidence?:string;title?:string;size?:string;after?:string|number;grid?:string;layout?:string;panels?:PlanPanel[]}
type Slot=Record<string,string|undefined>;
import { t } from '../i18n';
export function orientation(value:unknown):Orientation{
    const v=String(value??'').toLowerCase();
    return /land|wide|horizontal|가로/.test(v)?'landscape':/port|tall|vertical|세로/.test(v)?'portrait':/square|정사각/.test(v)?'square':'';
}
// Keep roughly the configured pixel count and only change the shape.
export function sizeFor(config:SizeBase,size:string):{width:number;height:number}{
    const long=Math.max(config.width,config.height),short=Math.min(config.width,config.height);
    if(size==='portrait')return{width:short,height:long};
    if(size==='landscape')return{width:long,height:short};
    if(size==='square'){
        let side=Math.round(Math.sqrt(long*short)/64)*64;
        if(config.budgetGuard&&side*side>1048576)side-=64;
        return{width:side,height:side};
    }
    return{width:config.width,height:config.height};
}
export const ORIENTATIONS:[string,string][]=[['','scenebook.orient.default'],['portrait','scenebook.orient.portrait'],['landscape','scenebook.orient.landscape'],['square','scenebook.orient.square']];
/** 화면에 그릴 화면 비율 선택지 (ORIENTATIONS 의 둘째 값은 번역 키) */
export const orientations=():[string,string][]=>ORIENTATIONS.map(([id,k])=>[id,t(k)]);
// [tag, label, group]. One viewpoint and one shot size apply at a time.
export const CAMERA_TAGS:[tag:string,label:string,group:'view'|'shot'][]=[
    ['from side','scenebook.cam.fromSide','view'],['three-quarter view','scenebook.cam.threeQuarter','view'],['from above','scenebook.cam.fromAbove','view'],['from below','scenebook.cam.fromBelow','view'],['from behind','scenebook.cam.fromBehind','view'],['straight-on','scenebook.cam.straightOn','view'],['pov','scenebook.cam.pov','view'],
    ['close-up','scenebook.cam.closeUp','shot'],['upper body','scenebook.cam.upperBody','shot'],['cowboy shot','scenebook.cam.cowboy','shot'],['full body','scenebook.cam.fullBody','shot'],['wide shot','scenebook.cam.wide','shot'],
];
const tags=(text:unknown)=>String(text??'').split(',').map(x=>x.trim()).filter(Boolean);
export const hasCameraTag=(camera:unknown,tag:string)=>tags(camera).some(x=>x.toLowerCase()===tag);
export function toggleCameraTag(camera:unknown,tag:string):string{
    const group=CAMERA_TAGS.find(x=>x[0]===tag)?.[2],siblings=CAMERA_TAGS.filter(x=>x[2]===group).map(x=>x[0]),on=hasCameraTag(camera,tag);
    const kept=tags(camera).filter(x=>!siblings.includes(x.toLowerCase()));
    return(on?kept:[tag,...kept]).join(', ');
}
// Built-in looks. Tags are generic medium and rendering terms, added in front
// of the user's own main prompt.
export const LOOKS:[id:string,label:string,style:string,negative:string][]=[
    ['','scenebook.look.none','',''],
    ['semi','scenebook.look.semi','semi-realistic, detailed skin, soft shading, depth of field','flat color, chibi'],
    ['cinema','scenebook.look.cinema','cinematic lighting, dramatic shadows, depth of field, film grain, wide aspect composition','flat color, simple background'],
    ['watercolor','scenebook.look.watercolor','watercolor (medium), traditional media, soft edges, paper texture, pastel colors','3d, photorealistic'],
    ['manga','scenebook.look.manga','monochrome, greyscale, manga, screentone, ink lines, high contrast','color, 3d'],
    ['webtoon','scenebook.look.webtoon','flat color, clean lineart, thick outlines, cel shading, vivid colors','sketch, painterly'],
    ['retro','scenebook.look.retro','retro artstyle, 1990s (style), anime screenshot, cel shading, film grain','3d, photorealistic'],
    ['sketch','scenebook.look.sketch','sketch, graphite (medium), traditional media, rough lines, unfinished, monochrome','3d, color'],
    ['pixel','scenebook.look.pixel','pixel art, limited palette, dithering, low resolution look','blurry, 3d, photorealistic'],
    ['chibi','scenebook.look.chibi','chibi, super deformed, big head, small body, cute, simple shading','realistic, tall'],
    ['oil','scenebook.look.oil','oil painting (medium), impasto, visible brushstrokes, rich colors, classical lighting','flat color, lineart'],
    ['pastel','scenebook.look.pastel','soft pastel colors, storybook illustration, gentle lighting, rounded shapes, dreamy','dark, high contrast'],
];
const joinTags=(a:unknown,b:unknown)=>[a,b].map(x=>String(x??'').trim()).filter(Boolean).join(', ');
// Takes a built-in look back out of a rendered config: its tags from the front
// of the main prompt and its exclusions from the end of the UC. A picture's
// saved config has the look applied, and regenerating could apply it again,
// so every stacked copy is removed.
export function splitLook(config:{style?:string;negative?:string}|null|undefined):{style:string;negative:string;look:string}{
    let style=String(config?.style??'').trim(),negative=String(config?.negative??'').trim(),look='';
    for(let found=true;found;){
        found=false;
        for(const [id,,tags,exclude]of LOOKS){
            if(!id||(style!==tags&&!style.startsWith(`${tags}, `)))continue;
            style=style.slice(tags.length).replace(/^,\s*/,'');look||=id;found=true;
            if(negative===exclude||negative.endsWith(`, ${exclude}`))negative=negative.slice(0,negative.length-exclude.length).replace(/,\s*$/,'');
        }
    }
    return{style,negative,look};
}
// Applies a look exactly once, whatever the config already carries.
export function withLook<T extends{style?:string;negative?:string}>(config:T,id:string):T{
    const plain=splitLook(config),look=LOOKS.find(x=>x[0]===id);
    if(!look||!look[0])return{...config,style:plain.style,negative:plain.negative};
    return{...config,style:joinTags(look[2],plain.style),negative:joinTags(plain.negative,look[3])};
}
export const FRAMES:[string,string][]=[['soft','scenebook.frame.soft'],['none','scenebook.frame.none'],['line','scenebook.frame.line']];

// Line-based illustration plan: one "key: value" field per line, each scene
// opened by a line reading "scene". It costs fewer reply tokens than JSON and
// has no brackets or escapes for a model to get wrong. A page adds "grid:", then
// "panel:" lines, each followed by the char lines of the people in that panel.
const SCENE_KEYS:Record<string,string>={camera:'camera',view:'camera',shot:'camera',prompt:'prompt',negative:'negative',uc:'negative',quote:'evidence',evidence:'evidence',title:'title',size:'size',ratio:'size',after:'after',para:'after',paragraph:'after',grid:'grid',layout:'layout'};
const CHARACTER_KEYS:Record<string,string>={action:'action',outfit:'outfit',appearance:'appearance',profile:'profileId',profileid:'profileId'};
// 머리 줄: scene · Scene 2 · ### scene · [scene] · **scene**
const header=/^[\s#[\-=*_>]*scene\s*\d*[\s\]:\-=*_]*$/i;
// 이름 앞뒤의 꾸밈(**camera**: · `camera`: · - camera: · panel 2:)도 받는다
const field=/^\s*(?:[-*>]\s*)?[*_`]{0,2}([A-Za-z]+)(?:[ #]*\d+)?[*_`]{0,2}\s*[:=]\s*(.*)$/;
const clean=(value:string)=>{let v=value.trim().replace(/^[*_`]{1,2}\s*|\s*[*_`]{1,2}$/g,'').trim();if(v.length>1&&/^["“]/.test(v)&&/["”]$/.test(v))v=v.slice(1,-1).trim();return v;};
export function parsePlanText(input:unknown):{value:{scenes:PlanScene[]};repairs:string[]}{
    if(typeof input!=='string'||input.length>60000)throw new Error(t('scenebook.plan.tooLong'));
    const scenes:PlanScene[]=[],repairs:string[]=[];let scene=null as PlanScene|null,character=null as PlanCharacter|null,last=null as [Slot,string]|null,panel=null as PlanPanel|null;
    const open=():PlanScene=>{const s:PlanScene={characters:[]};scene=s;character=null;last=null;panel=null;scenes.push(s);return s;};
    for(const line of input.replace(/\r\n?/g,'\n').split('\n')){
        if(!line.trim()||/^\s*(`{3,}|~{3,})/.test(line))continue;
        if(header.test(line)){open();continue;}
        const match=line.match(field),key=match?match[1].toLowerCase():'';
        // "scene: 옥상, 밤" 처럼 머리 줄에 내용을 붙여 쓴 것: 새 장면을 열고 그 내용을 공유 장면으로 (뒤에 prompt 줄이 오면 그것을 쓴다)
        if(match&&key==='scene'){const sc=open(),v=clean(match[2]);if(v&&!/^\d+$/.test(v)){sc.prompt=v;last=[sc as unknown as Slot,'prompt'];}continue;}
        // 칸: 그 뒤의 char 줄은 이 칸에 보이는 사람이다
        if(match&&key==='panel'){
            const sc:PlanScene=scene??open();
            panel={text:clean(match[2]),characters:[]};(sc.panels??=[]).push(panel);character=null;last=[panel as unknown as Slot,'text'];continue;
        }
        // 웹툰 칸의 높이는 그 칸 안 어디에 적어도 그 칸의 것이다
        if(match&&panel&&key==='height'){panel.height=clean(match[2]).toLowerCase();last=null;continue;}
        if(match&&['char','character','name','person'].includes(key)){
            const sc:PlanScene=scene??open();
            character={name:clean(match[2])};(panel?panel.characters:sc.characters).push(character);last=null;continue;
        }
        if(match&&character&&['pos','position','xy'].includes(key)){
            const [x,y]=(match[2].match(/-?\d*\.?\d+/g)??[]).map(Number);
            if(Number.isFinite(x)&&Number.isFinite(y)){character.x=Math.max(0,Math.min(1,x));character.y=Math.max(0,Math.min(1,y));}
            else{const w=match[2].toLowerCase(),side=/left/.test(w)?0.3:/right/.test(w)?0.7:/cent(er|re)|middle/.test(w)?0.5:NaN;if(Number.isFinite(side)){character.x=side;character.y=/top|back|far/.test(w)?0.35:/bottom|front|near/.test(w)?0.65:0.5;}}   // "pos: left" 처럼 말로 적은 자리
            last=null;continue;
        }
        if(match&&character&&Object.hasOwn(CHARACTER_KEYS,key)){last=[character as unknown as Slot,CHARACTER_KEYS[key]];last[0][last[1]]=clean(match[2]);continue;}
        if(match&&Object.hasOwn(SCENE_KEYS,key)){
            const name=SCENE_KEYS[key];
            // A repeated shared field means the model forgot the "scene" line.
            let sc:PlanScene|null=scene;
            if(!sc||(['camera','prompt'].includes(name)&&((sc as unknown as Slot)[name]!==undefined&&(sc.characters.length||sc.panels?.length)))){if(sc)repairs.push(t('scenebook.plan.repairSplit'));sc=open();}
            character=null;if(name!=='grid'&&name!=='layout')panel=null;last=[sc as unknown as Slot,name];last[0][name]=clean(match[2]);continue;
        }
        // An unlabelled line continues the previous value.
        if(last)last[0][last[1]]=`${last[0][last[1]]} ${line.trim()}`.trim();
    }
    const usable=scenes.filter(s=>s.prompt||s.camera||s.characters.length||s.panels?.length);
    if(!usable.length)throw new Error(t('scenebook.plan.noScene'));
    return{value:{scenes:usable},repairs:[...new Set(repairs)]};
}

// ════════ 카메라가 자세와 맞는지 ════════
// 카메라는 기분이 아니라 공간으로 고른다. 누운 사람 아래(매트리스 · 바닥 밑)나 물 밑에는 카메라가 갈 수 없고,
// 나란히 누운 둘을 옆에서 보면 한 사람이 다른 사람에 가린다 — 이때는 위에서(top-down)만 둘 다 온전히 보인다
const LYING=/\b(lying|lie|lies|laying|sleeping|asleep|on (?:his |her |their )?(?:back|stomach)|spooning|in bed|on (?:the |a )?(?:bed|futon|mattress))\b/i;
const WATER=/\b(bath|bathtub|bathing|onsen|hot spring|pool|jacuzzi|partially submerged|waist[- ]deep|in water)\b/i;
const UNDER=/\b(underwater|glass floor|transparent floor)\b/i;
const CLOSE=/\b(hug|hugging|embrac\w*|kiss\w*|face to face|forehead to forehead)\b/i;
const TOGETHER=/\b(side by side|together|next to each other|cuddl\w*|spooning)\b/i;
const PAIR=/\b(?:[2-9]\s*(?:girls|boys|others)|two (?:people|girls|boys)|1boy\s*,?\s*1girl|1girl\s*,?\s*1boy)\b/i;
const words=(v:unknown)=>Array.isArray(v)?v.join(' '):String(v??'');
export type CameraIssue=''|'below'|'side'|'behind';
/**
 * 장면의 카메라가 인물 자세와 어긋나는지 본다 → { issue, fix }
 * below: 누운 사람 · 물에 든 사람을 아래에서 (카메라가 갈 수 없는 자리) · side: 둘 이상 나란히 누웠는데 옆에서 (한 사람이 가린다)
 * behind: 껴안기 · 입맞춤을 뒤에서 (얼굴 · 맞닿은 곳이 안 보인다). fix 는 고칠 카메라 (behind 는 일부러일 수 있어 알리기만 한다)
 * panel 을 주면 그 칸의 글(카메라 태그가 글 안에 있다)과 그 칸의 인물로 본다
 */
export function cameraIssue(scene:{camera?:unknown;prompt?:unknown;characters?:unknown},panelText?:string):{issue:CameraIssue;fix:string}{
    const cam=(panelText??words(scene?.camera)).toLowerCase(),list=Array.isArray(scene?.characters)?scene.characters as Record<string,unknown>[]:[];
    const acts=list.map(c=>[c?.action,c?.prompt].map(words).join(' ')),all=[words(scene?.prompt),panelText??'',...acts].join(' ');
    if(!cam||UNDER.test(all))return{issue:'',fix:''};
    const lyingN=acts.filter(a=>LYING.test(a)).length,lying=lyingN>0||LYING.test(words(scene?.prompt))||(!!panelText&&LYING.test(panelText));
    const swap=(from:string,to:string)=>panelText!==undefined?cam.replace(new RegExp(`\\b${from}\\b`,'g'),to):toggleCameraTag(tags(cam).filter(x=>x!==from).join(', '),to);
    if(/\bfrom below\b/.test(cam)&&(lying||WATER.test(all)))return{issue:'below',fix:swap('from below','from above')};
    const together=lyingN>=2||(lying&&TOGETHER.test(all)&&(list.length>=2||PAIR.test(all)));
    if(together&&/\bfrom side\b/.test(cam))return{issue:'side',fix:swap('from side','from above')};
    if((list.length>=2||PAIR.test(all))&&/\bfrom behind\b/.test(cam)&&CLOSE.test(acts.join(' ')||all))return{issue:'behind',fix:''};
    return{issue:'',fix:''};
}

// ════════ 태그 정리 ════════
/** 쉼표로 나누되 괄호 {} [] () 안과 NovelAI 숫자 강조(1.2::a, b ::) 안의 쉼표에서는 나누지 않는다 */
export function splitTags(text:unknown):string[]{
    const s=String(text??''),out:string[]=[];let depth=0,cur='';
    for(const ch of s){
        if('{[('.includes(ch))depth++;else if('}])'.includes(ch))depth=Math.max(0,depth-1);
        if(ch===','&&!depth&&(cur.match(/::/g)||[]).length%2===0){out.push(cur.trim());cur='';continue;}
        cur+=ch;
    }
    out.push(cur.trim());
    return out.filter(Boolean);
}
export const tagKey=(x:string)=>x.toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ').trim();
/** 같은 태그를 두 번 넣지 않는다 (앞의 것을 남긴다). skip 에 든 태그는 뺀다. 강조 · 문장은 그대로 둔다 */
export function tidyTags(parts:unknown[],skip:Set<string>=new Set()):string[]{
    const seen=new Set(skip),out:string[]=[];
    for(const p of parts.flatMap(splitTags)){const k=tagKey(p);if(!k||seen.has(k))continue;seen.add(k);out.push(p);}
    return out;
}
/** 인원수 태그 (1girl · 2boys · no humans · solo …) */
export const isCountTag=(x:string)=>/^(?:\d+\+?\s*(?:girls?|boys?|others?)|no humans|solo|multiple (?:girls|boys|others))$/.test(tagKey(x));
/** 카메라 칸에 이미 든 시점 · 크기와 겹치는 다른 시점 · 크기 태그 (장면 프롬프트에서 뺄 것) */
export function cameraClashes(camera:unknown):Set<string>{
    const have=tags(camera).map(tagKey),out=new Set<string>();
    for(const g of ['view','shot'] as const){const own=CAMERA_TAGS.filter(x=>x[2]===g).map(x=>x[0]);if(own.some(x=>have.includes(x)))for(const x of own)if(!have.includes(x))out.add(x);}
    return out;
}
