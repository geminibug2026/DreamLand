// ── Dreamland 삽화: 장면별 화면 비율 · 구도 태그 · 그림체 · 줄 단위 삽화 지시 읽기 ──
// 옛 js/scenebook-framing.js 를 동작 그대로 옮긴 것 (illust.js 는 아직 옛 파일을 쓴다)
export type Orientation=''|'portrait'|'landscape'|'square';
export interface SizeBase{width:number;height:number;budgetGuard?:boolean}
export interface PlanCharacter{name:string;x?:number;y?:number;action?:string;outfit?:string;appearance?:string;profileId?:string}
export interface PlanScene{characters:PlanCharacter[];camera?:string;prompt?:string;negative?:string;evidence?:string;title?:string;size?:string}
type Slot=Record<string,string|undefined>;
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
export const ORIENTATIONS:[string,string][]=[['','설정값'],['portrait','세로'],['landscape','가로'],['square','정사각']];
// [tag, label, group]. One viewpoint and one shot size apply at a time.
export const CAMERA_TAGS:[tag:string,label:string,group:'view'|'shot'][]=[
    ['from side','옆에서','view'],['from above','위에서','view'],['from below','아래에서','view'],['from behind','뒤에서','view'],['straight-on','정면','view'],['pov','1인칭','view'],
    ['close-up','클로즈업','shot'],['upper body','상반신','shot'],['cowboy shot','무릎 위','shot'],['full body','전신','shot'],['wide shot','멀리서','shot'],
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
    ['','사용 안 함','',''],
    ['semi','반실사','semi-realistic, detailed skin, soft shading, depth of field','flat color, chibi'],
    ['cinema','시네마틱','cinematic lighting, dramatic shadows, depth of field, film grain, wide aspect composition','flat color, simple background'],
    ['watercolor','수채화','watercolor (medium), traditional media, soft edges, paper texture, pastel colors','3d, photorealistic'],
    ['manga','흑백 만화','monochrome, greyscale, manga, screentone, ink lines, high contrast','color, 3d'],
    ['webtoon','웹툰','flat color, clean lineart, thick outlines, cel shading, vivid colors','sketch, painterly'],
    ['retro','레트로 애니','retro artstyle, 1990s (style), anime screenshot, cel shading, film grain','3d, photorealistic'],
    ['sketch','연필 스케치','sketch, graphite (medium), traditional media, rough lines, unfinished, monochrome','3d, color'],
    ['pixel','도트','pixel art, limited palette, dithering, low resolution look','blurry, 3d, photorealistic'],
    ['chibi','치비','chibi, super deformed, big head, small body, cute, simple shading','realistic, tall'],
    ['oil','유화','oil painting (medium), impasto, visible brushstrokes, rich colors, classical lighting','flat color, lineart'],
    ['pastel','파스텔 동화','soft pastel colors, storybook illustration, gentle lighting, rounded shapes, dreamy','dark, high contrast'],
];
export function withLook<T extends{style?:string;negative?:string}>(config:T,id:string):T{
    const look=LOOKS.find(x=>x[0]===id);if(!look||!look[0])return config;
    const join=(a:unknown,b:unknown)=>[a,b].map(x=>String(x??'').trim()).filter(Boolean).join(', ');
    return{...config,style:join(look[2],config.style),negative:join(config.negative,look[3])};
}
export const FRAMES:[string,string][]=[['soft','기본'],['none','없음'],['line','라인']];

// Line-based illustration plan: one "key: value" field per line, each scene
// opened by a line reading "scene". It costs fewer reply tokens than JSON and
// has no brackets or escapes for a model to get wrong.
const SCENE_KEYS:Record<string,string>={camera:'camera',view:'camera',prompt:'prompt',negative:'negative',uc:'negative',quote:'evidence',evidence:'evidence',title:'title',size:'size',ratio:'size'};
const CHARACTER_KEYS:Record<string,string>={action:'action',outfit:'outfit',appearance:'appearance',profile:'profileId',profileid:'profileId'};
const header=/^[\s#\[\-=*]*scene\s*\d*[\s\]:\-=*]*$/i,field=/^\s*(?:[-*]\s*)?([A-Za-z]+)\s*[:=]\s*(.*)$/;
const clean=(value:string)=>{const v=value.trim();return v.length>1&&v.startsWith('"')&&v.endsWith('"')?v.slice(1,-1).trim():v;};
export function parsePlanText(input:unknown):{value:{scenes:PlanScene[]};repairs:string[]}{
    if(typeof input!=='string'||input.length>60000)throw new Error('삽화 지시의 길이가 너무 큽니다.');
    const scenes:PlanScene[]=[],repairs:string[]=[];let scene=null as PlanScene|null,character=null as PlanCharacter|null,last=null as [Slot,string]|null;
    const open=():PlanScene=>{const s:PlanScene={characters:[]};scene=s;character=null;last=null;scenes.push(s);return s;};
    for(const line of input.replace(/\r\n?/g,'\n').split('\n')){
        if(!line.trim()||/^\s*(`{3,}|~{3,})/.test(line))continue;
        if(header.test(line)){open();continue;}
        const match=line.match(field),key=match?match[1].toLowerCase():'';
        if(match&&['char','character','name'].includes(key)){
            const sc:PlanScene=scene??open();
            character={name:clean(match[2])};sc.characters.push(character);last=null;continue;
        }
        if(match&&character&&['pos','position','xy'].includes(key)){
            const [x,y]=(match[2].match(/-?\d*\.?\d+/g)??[]).map(Number);
            if(Number.isFinite(x)&&Number.isFinite(y)){character.x=Math.max(0,Math.min(1,x));character.y=Math.max(0,Math.min(1,y));}
            last=null;continue;
        }
        if(match&&character&&Object.hasOwn(CHARACTER_KEYS,key)){last=[character as unknown as Slot,CHARACTER_KEYS[key]];last[0][last[1]]=clean(match[2]);continue;}
        if(match&&Object.hasOwn(SCENE_KEYS,key)){
            const name=SCENE_KEYS[key];
            // A repeated shared field means the model forgot the "scene" line.
            let sc:PlanScene|null=scene;
            if(!sc||(['camera','prompt'].includes(name)&&((sc as unknown as Slot)[name]!==undefined&&sc.characters.length))){if(sc)repairs.push('장면 구분 복구');sc=open();}
            character=null;last=[sc as unknown as Slot,name];last[0][name]=clean(match[2]);continue;
        }
        // An unlabelled line continues the previous value.
        if(last)last[0][last[1]]=`${last[0][last[1]]} ${line.trim()}`.trim();
    }
    const usable=scenes.filter(s=>s.prompt||s.camera||s.characters.length);
    if(!usable.length)throw new Error('삽화 지시에서 장면을 찾지 못했습니다.');
    return{value:{scenes:usable},repairs:[...new Set(repairs)]};
}
