// ── Dreamland 삽화: 선 장식 액자. 그림 비율에 맞춰 SVG 로 그린다 ──
// 옛 js/scenebook-ornaments.js 를 동작 그대로 옮긴 것
interface Box{x0:number;y0:number;x1:number;y1:number}
export const ORNAMENTS:[string,string][]=[['sparkle','별 장식'],['notch','이중선'],['offset','겹선 별'],['scroll','덩굴 코너'],['sprig','잎 가지'],['vintage','빈티지 코너'],['nouveau','아르누보'],['crest','문양 띠']];
export const INKS:[string,string][]=[['','글자색'],['#ffffff','흰색'],['#16130f','검정'],['#c9a45c','금색'],['#23407a','남색'],['#7a1f2b','와인'],['#d98fa3','분홍']];
export const ORNAMENT_PAD=.09;

const n=(v:number)=>Number(v.toFixed(1));
const line=(d:string,width=2.4)=>`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot=(x:number,y:number,r=3)=>`<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="currentColor"/>`;
// Four-point star with concave sides.
const star=(x:number,y:number,s:number,hollow=false)=>`<path transform="translate(${n(x)} ${n(y)})" d="M0 ${-s}C${n(s*.12)} ${n(-s*.12)} ${n(s*.12)} ${n(-s*.12)} ${s} 0C${n(s*.12)} ${n(s*.12)} ${n(s*.12)} ${n(s*.12)} 0 ${s}C${n(-s*.12)} ${n(s*.12)} ${n(-s*.12)} ${n(s*.12)} ${-s} 0C${n(-s*.12)} ${n(-s*.12)} ${n(-s*.12)} ${n(-s*.12)} 0 ${-s}Z" ${hollow?'fill="none" stroke="currentColor" stroke-width="1.6"':'fill="currentColor"'}/>`;
const diamond=(x:number,y:number,w:number,h:number,hollow=false)=>`<path d="M${n(x)} ${n(y-h)}L${n(x+w)} ${n(y)}L${n(x)} ${n(y+h)}L${n(x-w)} ${n(y)}Z" ${hollow?'fill="none" stroke="currentColor" stroke-width="1.8"':'fill="currentColor"'}/>`;
// Teardrop leaf from its base, pointing along `angle`.
const leaf=(x:number,y:number,angle:number,length:number,hollow=false)=>`<path transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})" d="M0 0C${n(length*.3)} ${n(-length*.3)} ${n(length*.78)} ${n(-length*.2)} ${length} 0C${n(length*.78)} ${n(length*.2)} ${n(length*.3)} ${n(length*.3)} 0 0Z" ${hollow?'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"':'fill="currentColor"'}/>`;
// Draws `content`, designed for the top-left corner, at each listed corner by mirroring.
const corners=(box:Box,content:string,which=[0,1,2,3])=>which.map(i=>`<g transform="translate(${[box.x0,box.x1,box.x1,box.x0][i]} ${[box.y0,box.y0,box.y1,box.y1][i]}) scale(${i===1||i===2?-1:1} ${i>=2?-1:1})">${content}</g>`).join('');
// Straight sides between corner ornaments that each take `gap` of the line.
const sides=(box:Box,gap:number,width=2.4,inset=0)=>line(`M${box.x0+gap} ${box.y0+inset}H${box.x1-gap}M${box.x0+gap} ${box.y1-inset}H${box.x1-gap}M${box.x0+inset} ${box.y0+gap}V${box.y1-gap}M${box.x1-inset} ${box.y0+gap}V${box.y1-gap}`,width);
// Scrolling corner: two arms that curl inward, a knot outside, small leaves.
const SCROLL=line('M150 0C104 0 70-3 50 13 33 27 37 54 58 54 73 54 78 37 65 32M0 150C0 104-3 70 13 50 27 33 54 37 54 58 54 73 37 78 32 65',2.8)
    +line('M26 26C8 8-20 12-18-9-16-24 6-24 9-9M26 26C8 8 12-20-9-18-24-16-24 6-9 9',2.4)
    +leaf(96,-3,-24,34)+leaf(-3,96,114,34)+leaf(118,4,22,20)+leaf(4,118,68,20)+leaf(70,10,-58,18)+leaf(10,70,148,18)
    +diamond(-26,-26,6,6)+dot(166,0,2.6)+dot(0,166,2.6)+dot(42,42,3);
// Lighter corner used by the diagonal design: long sweeping curl with a trail.
const SWEEP=line('M210 0C150 0 96-2 66 8 38 18 30 46 50 58 68 68 86 52 74 38M0 210C0 150-2 96 8 66 18 38 46 30 58 50 68 68 52 86 38 74',2.4)
    +line('M40 40C22 22 0 16-6-6M40 40C22 22 16 0-6-6',2)
    +star(-12,-12,13)+diamond(96,22,8,8,true)+diamond(22,96,8,8,true)+leaf(120,-2,-16,30)+leaf(-2,120,106,30)+leaf(150,2,14,18)+leaf(2,150,76,18)
    +dot(228,0,3)+dot(242,0,2.2)+dot(254,0,1.6)+dot(0,228,3)+dot(0,242,2.2)+dot(0,254,1.6);
// Centre motif for a horizontal side: two mirrored curls around a diamond.
const centre=(x:number,y:number,flip=1)=>`<g transform="translate(${n(x)} ${n(y)}) scale(1 ${flip})">${line('M-14 0C-40 0-58-16-78-6-92 1-88 18-76 16M14 0C40 0 58-16 78-6 92 1 88 18 76 16',2.4)}${line('M-92-2H-150M92-2H150',2)}${diamond(0,0,9,13)}${leaf(-44,-6,196,20)}${leaf(44,-6,-16,20)}${dot(-162,-2,2.4)}${dot(162,-2,2.4)}</g>`;
// Botanical stem with outlined leaves, growing from (0,0) up and to the right.
function stem(length:number,lean:number){
    let out=line(`M0 0Q${n(length*.1)} ${n(-length*.55)} ${n(lean)} ${n(-length)}`,2);
    for(let i=1;i<=7;i++){const t=i/8,x=2*(1-t)*t*length*.1+t*t*lean,y=-(2*(1-t)*t*length*.55+t*t*length),size=length*.2*(1-t*.55),tilt=-90+lean/length*40*t;
        out+=leaf(x,y,tilt+(i%2?52:-52),size,true);}
    return out+leaf(lean,-length,-90+lean/length*40,length*.16,true)+dot(lean*.3-12,-length*.42,2.6)+dot(lean*.6+14,-length*.7,2.2);
}

const DESIGNS:Record<string,(box:Box)=>string>={
    sparkle(box){
        const {x0,y0,x1,y1}=box,my=(y0+y1)/2;let out=sides(box,46,2.2);
        out+=corners(box,star(0,0,20)+star(0,44,6)+star(0,62,4)+dot(0,78,2));
        for(const x of [x0,x1])out+=dot(x,my-9,2.6)+dot(x,my+9,2.6);
        return out+line(`M${x0} ${y0+92}V${my-24}M${x0} ${my+24}V${y1-92}M${x1} ${y0+92}V${my-24}M${x1} ${my+24}V${y1-92}`,2.2).replace('<path','<path data-over="1"');
    },
    notch(box){
        const shape=(o:number,r:number)=>{const x0=box.x0+o,y0=box.y0+o,x1=box.x1-o,y1=box.y1-o;return `M${x0+r} ${y0}H${x1-r}A${r} ${r} 0 0 0 ${x1} ${y0+r}V${y1-r}A${r} ${r} 0 0 0 ${x1-r} ${y1}H${x0+r}A${r} ${r} 0 0 0 ${x0} ${y1-r}V${y0+r}A${r} ${r} 0 0 0 ${x0+r} ${y0}Z`;};
        return line(shape(-6,30),3.6)+line(shape(6,24),1.6);
    },
    offset(box){
        const {x0,y0,x1,y1}=box,s=18,w=x1-x0,h=y1-y0;
        // Outer frame, open where the sparkles sit.
        let out=line(`M${x0+70} ${y0-s}H${x0+w*.55}M${x0+w*.62} ${y0-s}H${x1-s}V${y0+h*.62}M${x1-s} ${y0+h*.7}V${y1-s-64}M${x1-s-64} ${y1-s}H${x0+w*.45}M${x0+w*.38} ${y1-s}H${x0-s}V${y0+h*.38}M${x0-s} ${y0+h*.3}V${y0-s+64}`,2);
        out+=line(`M${x0-s} ${y0-s+64}A64 64 0 0 0 ${x0-s+64} ${y0-s}M${x1-s} ${y1-s-64}A64 64 0 0 0 ${x1-s-64} ${y1-s}`,2);
        // Inner frame, shifted down and right.
        out+=line(`M${x0+s} ${y0+s}H${x0+w*.5}M${x0+w*.57} ${y0+s}H${x1+s}V${y0+h*.66}M${x1+s} ${y0+h*.74}V${y1+s}H${x0+w*.5}M${x0+w*.43} ${y1+s}H${x0+s}V${y0+h*.34}M${x0+s} ${y0+h*.26}V${y0+s}`,2);
        out+=star(x0-s+10,y0-s+10,15)+star(x1+s-10,y1+s-10,15);
        out+=star(x0+w*.6,y0-s,10)+star(x0+w*.565,y0-s,7,true)+dot(x0+w*.535,y0+s,3);
        out+=star(x1+s,y0+h*.7,10)+star(x1+s,y0+h*.735,7,true)+dot(x1-s,y0+h*.66,3);
        out+=star(x0+w*.4,y1+s,10)+star(x0+w*.435,y1+s,7,true)+dot(x0+w*.465,y1-s,3);
        return out+star(x0-s,y0+h*.3,10)+star(x0-s,y0+h*.265,7,true)+dot(x0+s,y0+h*.34,3);
    },
    scroll(box){return sides(box,176,3.4)+sides(box,176,1.4,12)+corners(box,SCROLL);},
    sprig(box){
        const {x0,y0,x1,y1}=box,mx=(x0+x1)/2,r=70;
        let out=line(`M${mx-70} ${y1}H${x0+r+60}C${x0+r+20} ${y1} ${x0+r} ${y1-10} ${x0+r-10} ${y1-34}C${x0+r-22} ${y1-60} ${x0+26} ${y1-70} ${x0} ${y1-70}V${y0}H${x1}V${y1-70}C${x1-26} ${y1-70} ${x1-r+22} ${y1-60} ${x1-r+10} ${y1-34}C${x1-r} ${y1-10} ${x1-r-20} ${y1} ${x1-r-60} ${y1}H${mx+70}`,2);
        out+=line(`M${x0+12} ${y1-96}V${y0+12}M${x1-12} ${y1-96}V${y0+12}`,1.2);
        out+=`<g transform="translate(${mx} ${y1})">${line('M-58 0C-40 0-34-12-22-12-10-12-12 4-22 2M58 0C40 0 34-12 22-12 10-12 12 4 22 2',2)}${diamond(0,-2,6,9)}${dot(-74,0,2.2)}${dot(74,0,2.2)}</g>`;
        const plant=`<g transform="translate(58 -8)">${stem(170,46)}</g><g transform="translate(86 4) rotate(34)">${stem(120,30)}</g><g transform="translate(40 -30) rotate(-22)">${stem(110,-20)}</g>`;
        return out+`<g transform="translate(${x0} ${y1})">${plant}</g><g transform="translate(${x1} ${y1}) scale(-1 1)">${plant}</g>`;
    },
    vintage(box){
        const {x0,y0,x1,y1}=box;
        return line(`M${x0+270} ${y0}H${x1}V${y1-270}M${x1-270} ${y1}H${x0}V${y0+270}`,2.2)+corners(box,SWEEP,[0,2])+corners(box,dot(0,0,3.4),[1,3]);
    },
    nouveau(box){
        const {x0,y0,x1,y1}=box,mx=(x0+x1)/2,drop=y0+(y1-y0)*.72;
        let out=`<g transform="translate(${mx} ${y0})">${diamond(0,0,9,24)}${diamond(0,0,4,12,true)}${line('M-18 0C-60-12-110 12-160 0-200-10-236 6-270 0M18 0C60-12 110 12 160 0 200-10 236 6 270 0',2.2)}${line('M-18 0C-60 12-110-10-160 0M18 0C60 12 110-10 160 0',1.6)}${dot(-284,0,2.6)}${dot(284,0,2.6)}</g>`;
        const curl=line('M150 0C100 0 60 2 34 18 12 32 8 62 0 96M0 96C-6 64-20 44-8 22 2 4 26 2 34 18M60 6C44-12 18-16 4-2M0 96C10 80 22 76 30 84',2.4)+leaf(14,40,104,30)+leaf(84,2,-22,24)+leaf(40,10,-70,18)+dot(0,112,3)+dot(0,126,2.2)+dot(166,0,2.6);
        out+=corners(box,curl,[0,1]);
        out+=line(`M${x0} ${y0+150}V${drop}M${x1} ${y0+150}V${drop}`,1.8)+diamond(x0,drop+26,7,22,true)+diamond(x1,drop+26,7,22,true)+dot(x0,drop+62,2.4)+dot(x1,drop+62,2.4);
        return out+line(`M${x0+60} ${y1}H${x1-60}`,1.8)+dot(x0+44,y1,2.4)+dot(x1-44,y1,2.4)+diamond(mx,y1,6,6);
    },
    crest(box){
        const {x0,y0,x1,y1}=box,mx=(x0+x1)/2;
        return corners(box,SCROLL)+line(`M${x0} ${y0+176}V${y1-176}M${x1} ${y0+176}V${y1-176}`,2)+centre(mx,y0,1)+centre(mx,y1,-1)
            +line(`M${x0+176} ${y0}H${mx-176}M${mx+176} ${y0}H${x1-176}M${x0+176} ${y1}H${mx-176}M${mx+176} ${y1}H${x1-176}`,2);
    },
};
// Returns the SVG for a picture of the given pixel size. The picture sits in
// the middle; ORNAMENT_PAD of the width is left on every side, and the frame
// line runs halfway through that margin.
/** 그 액자의 SVG 좌표 틀과 안쪽 그림 (React 에서 <svg> 를 직접 그릴 때 쓴다) */
export function ornamentParts(style:string,width:number,height:number):{viewBox:string;inner:string}|null{
    if(!Object.hasOwn(DESIGNS,style))return null;
    const W=1000,pad=W*ORNAMENT_PAD,H=Math.round((W-pad*2)*height/width+pad*2),m=pad*.42,box={x0:m,y0:m,x1:W-m,y1:H-m};
    return{viewBox:`0 0 ${W} ${H}`,inner:DESIGNS[style](box)};
}
export function ornamentSvg(style:string,width:number,height:number):string{
    const p=ornamentParts(style,width,height);
    return p?`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.viewBox}" class="sb-ornament" aria-hidden="true" focusable="false">${p.inner}</svg>`:'';
}
