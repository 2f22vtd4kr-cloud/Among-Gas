import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CollisionWorld, validateCollisionDocument, type CollisionDocument, type CollisionShape, type Point } from "../../lib/shared/src/collision/vectorCollision.js";
import { MAP_H, MAP_W } from "../../lib/shared/src/coords.js";

const root = path.resolve(import.meta.dirname, "../..");
const referencePath = path.join(root, "attached_assets/IMG_2907_1783590932507.jpeg");
const outputDir = path.join(root, "lib/shared/src/collision");
const qaPath = path.join(root, "artifacts/telegram-game/collision-redline-vector-qa.png");
const TOLERANCE = 1.25;

async function hash(relative: string): Promise<string> {
  return createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex");
}
function red(data: Buffer, offset: number): boolean {
  const r=data[offset], g=data[offset+1], b=data[offset+2];
  return r>=90 && r-g>=42 && r-b>=34 && r>g*1.35 && r>b*1.25;
}
function thin(mask: Uint8Array, w: number, h: number): Uint8Array {
  let changed=true, rounds=0;
  const p=new Int32Array(8);
  while(changed) {
    changed=false;
    if(++rounds>32) throw new Error("red-line thinning did not converge");
    for(let phase=0;phase<2;phase++) {
      const remove:number[]=[];
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
        const i=y*w+x; if(!mask[i]) continue;
        p[0]=mask[i-w]; p[1]=mask[i-w+1]; p[2]=mask[i+1]; p[3]=mask[i+w+1];
        p[4]=mask[i+w]; p[5]=mask[i+w-1]; p[6]=mask[i-1]; p[7]=mask[i-w-1];
        let n=0,a=0;
        for(let k=0;k<8;k++){ n+=p[k]; if(!p[k]&&p[(k+1)%8]) a++; }
        if(n<2||n>6||a!==1) continue;
        const [p2,p3,p4,p5,p6,p7,p8,p9]=p;
        const keep=phase===0 ? p2*p4*p6===0&&p4*p6*p8===0 : p2*p4*p8===0&&p2*p6*p8===0;
        if(keep) remove.push(i);
      }
      for(const i of remove) mask[i]=0;
      if(remove.length) changed=true;
    }
  }
  return mask;
}
function edgeKey(a:number,b:number,total:number):number { const lo=Math.min(a,b),hi=Math.max(a,b); return lo*total+hi; }
function graphOf(s:Uint8Array,w:number,h:number):Map<number,number[]> {
  const g=new Map<number,number[]>();
  const dirs:readonly [number,number][]=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) {
    const i=y*w+x; if(!s[i]) continue;
    const ns:number[]=[];
    for(const [dx,dy] of dirs) {
      const nx=x+dx,ny=y+dy,j=ny*w+nx; if(!s[j]) continue;
      if(dx&&dy&&(s[y*w+nx]||s[ny*w+x])) continue;
      ns.push(j);
    }
    g.set(i,ns);
  }
  return g;
}
function trace(g:Map<number,number[]>,total:number):number[][] {
  const used=new Set<number>(),paths:number[][]=[];
  const walk=(start:number,next:number)=>{
    const path=[start,next]; used.add(edgeKey(start,next,total));
    let prev=start,cur=next;
    while((g.get(cur)?.length??0)===2) {
      const n=g.get(cur)!.find(v=>v!==prev); if(n===undefined) break;
      const key=edgeKey(cur,n,total); if(used.has(key)) break;
      used.add(key); path.push(n); prev=cur; cur=n;
    }
    return path;
  };
  for(const [i,ns] of g) if(ns.length!==2) for(const n of ns)
    if(!used.has(edgeKey(i,n,total))) paths.push(walk(i,n));
  for(const [i,ns] of g) for(const n of ns) if(!used.has(edgeKey(i,n,total))) {
    const path=[i,n]; used.add(edgeKey(i,n,total)); let prev=i,cur=n;
    while(cur!==i) {
      const next=g.get(cur)?.find(v=>v!==prev); if(next===undefined) break;
      const key=edgeKey(cur,next,total); if(used.has(key)) break;
      used.add(key); path.push(next); prev=cur; cur=next;
    }
    paths.push(path);
  }
  return paths;
}
function simplify(p:readonly Point[],tol:number):Point[] {
  if(p.length<=2) return p.map(q=>[q[0],q[1]]);
  const a=p[0],b=p[p.length-1],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  let max=-1,split=-1;
  for(let i=1;i<p.length-1;i++) {
    const q=p[i],t=den?Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/den)):0;
    const d=Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy);
    if(d>max){max=d;split=i;}
  }
  if(max<=tol||split<0) return [[a[0],a[1]],[b[0],b[1]]];
  const l=simplify(p.slice(0,split+1),tol),r=simplify(p.slice(split),tol);
  return [...l.slice(0,-1),...r];
}
function area(p:readonly Point[]):number {
  let a=0; for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length];a+=q[0]*r[1]-r[0]*q[1];}
  return Math.abs(a)/2;
}
function makeShapes(paths:number[][],w:number,h:number):CollisionShape[] {
  const shapes:CollisionShape[]=[];
  for(const path of paths) {
    if(path.length<4) continue;
    const raw:Point[]=path.map(i=>[i%w,Math.floor(i/w)]);
    let length=0; for(let i=1;i<raw.length;i++) length+=Math.hypot(raw[i][0]-raw[i-1][0],raw[i][1]-raw[i-1][1]);
    if(length<4) continue;
    const simple=simplify(raw,TOLERANCE),loop=path[0]===path[path.length-1];
    const unique=loop?simple.slice(0,-1):simple; if(unique.length<(loop?3:2)) continue;
    const cx=unique.reduce((s,p)=>s+p[0],0)/unique.length,cy=unique.reduce((s,p)=>s+p[1],0)/unique.length;
    const statueRing=Math.abs(cx/w-.54)<.09&&Math.abs(cy/h-.27)<.10;
    const closed=loop&&area(unique)>=20&&area(unique)<=8000&&!statueRing;
    const selected=closed?unique:simple;
    const points=selected.map(([x,y])=>[(x/(w-1))*MAP_W,(y/(h-1))*MAP_H] as Point);
    if(closed&&area(points)<1) continue;
    shapes.push({id:"redline-"+String(shapes.length+1).padStart(4,"0"),points,closed,blocksMove:true,blocksSight:false,label:closed?"red-line solid footprint":"red-line boundary",zone:statueRing?"statue-garden-boundary":"owner-redline-reference"});
  }
  // The reference traces the garden perimeter but intentionally leaves the
  // statue base itself unoutlined. Plan 2's measured pedestal footprint is
  // restored as its own solid while the surrounding planter remains walkable.
  shapes.push({
    id:"statue-pedestal",
    points:[[1700,480],[1710,464],[1780,464],[1790,480],[1790,515],[1780,531],[1710,531],[1700,515]],
    closed:true,blocksMove:true,blocksSight:false,
    label:"measured statue pedestal footprint",zone:"statue-pedestal",
  });
  return shapes;
}
async function main():Promise<void> {
  const {data,info}=await sharp(referencePath).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.channels<3||info.width<100||info.height<100) throw new Error("red-line reference is missing/invalid");
  const mask=new Uint8Array(info.width*info.height); let redCount=0;
  for(let i=0;i<mask.length;i++) if(red(data,i*info.channels)){mask[i]=1;redCount++;}
  if(redCount<1500) throw new Error("too few red reference pixels: "+redCount);
  const skeleton=thin(mask,info.width,info.height); let skeletonCount=0;
  for(const v of skeleton) skeletonCount+=v;
  if(skeletonCount<1000) throw new Error("red-line skeleton unexpectedly sparse: "+skeletonCount);
  const paths=trace(graphOf(skeleton,info.width,info.height),skeleton.length);
  const shapes=makeShapes(paths,info.width,info.height);
  const points=shapes.reduce((n,s)=>n+s.points.length,0);
  if(shapes.length<80||points<500) throw new Error("insufficient red-line geometry: "+shapes.length+" shapes / "+points+" points");
  const document:CollisionDocument={
    version:1,mapW:MAP_W,mapH:MAP_H,shapes,
    source:{
      kind:"redline-vector",generatorVersion:3,
      sourceFiles:{
        redlineReference:{path:"attached_assets/IMG_2907_1783590932507.jpeg",sha256:await hash("attached_assets/IMG_2907_1783590932507.jpeg")},
        generator:{path:"scripts/src/buildCollisionDocument.ts",sha256:await hash("scripts/src/buildCollisionDocument.ts")},
        collisionEngine:{path:"lib/shared/src/collision/vectorCollision.ts",sha256:await hash("lib/shared/src/collision/vectorCollision.ts")},
      },
      referenceImage:{width:info.width,height:info.height},
      vectorization:{redPixelCount:redCount,skeletonPixelCount:skeletonCount,tracedPathCount:paths.length,simplifiedPointCount:points,simplificationToleranceSourcePx:TOLERANCE,closedSolidCount:shapes.filter(s=>s.closed).length,openBoundaryCount:shapes.filter(s=>!s.closed).length},
      shapeCounts:{total:shapes.length,closedSolids:shapes.filter(s=>s.closed).length,openBoundaries:shapes.filter(s=>!s.closed).length},
    },
  };
  const errors=validateCollisionDocument(document); if(errors.length) throw new Error("invalid red-line geometry: "+errors.join("; "));
  const world=new CollisionWorld(shapes,MAP_W,MAP_H);
  let edgeCount=0,blocked=0;
  for(const shape of shapes) {
    const count=shape.closed?shape.points.length:shape.points.length-1;
    for(let i=0;i<count;i++) {
      const a=shape.points[i],b=shape.points[(i+1)%shape.points.length];
      edgeCount++; if(!world.isWalkable((a[0]+b[0])/2,(a[1]+b[1])/2,0)) blocked++;
    }
  }
  if(edgeCount<500||blocked/edgeCount<.995) throw new Error("red-line edge self-check failed: "+blocked+"/"+edgeCount);
  await mkdir(outputDir,{recursive:true}); await mkdir(path.dirname(qaPath),{recursive:true});
  await writeFile(path.join(outputDir,"collision.v1.json"),JSON.stringify(document,null,2)+"\n");
  await writeFile(path.join(outputDir,"generatedDocument.ts"),
    'import type { CollisionDocument } from "./vectorCollision.js";\n'+
    "const COLLISION_DOCUMENT_JSON = "+JSON.stringify(JSON.stringify(document))+";\n"+
    "export const COLLISION_DOCUMENT = JSON.parse(COLLISION_DOCUMENT_JSON) as CollisionDocument;\n");
  const svgPaths=shapes.map(s=>{
    const d=s.points.map((p,i)=>(i?"L ":"M ")+(p[0]/MAP_W*info.width)+" "+(p[1]/MAP_H*info.height)).join(" ");
    return '<path d="'+d+'" fill="none" stroke="#00ff68" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';
  }).join("");
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+info.width+'" height="'+info.height+'" viewBox="0 0 '+info.width+" "+info.height+'">'+svgPaths+"</svg>");
  await sharp(referencePath).composite([{input:svg}]).png().toFile(qaPath);
  console.log(JSON.stringify({ok:true,source:"owner red-line reference",dimensions:{width:info.width,height:info.height},redCount,skeletonCount,tracedPaths:paths.length,shapeCounts:document.source?.shapeCounts,edgeCount,blocked,outputs:["lib/shared/src/collision/collision.v1.json","lib/shared/src/collision/generatedDocument.ts","artifacts/telegram-game/collision-redline-vector-qa.png"]},null,2));
}
await main();
