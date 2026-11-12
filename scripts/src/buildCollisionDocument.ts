import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CollisionWorld, validateCollisionDocument, type CollisionDocument, type CollisionShape, type Point } from "../../lib/shared/src/collision/vectorCollision.js";
import { MAP_H, MAP_W } from "../../lib/shared/src/coords.js";
import {
  MANUAL_BLOCKED_POLYGONS,
  MANUAL_WALKABLE_REPLACEMENT_ZONES,
} from "../../lib/shared/src/collisionOverrides.js";

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
function editorZone(points: readonly Point[]): "A" | "B" | "C" | "D" | "E" {
  const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const centers = [
    { zone: "A" as const, x: MAP_W * 0.25, y: MAP_H * 0.24 },
    { zone: "B" as const, x: MAP_W * 0.75, y: MAP_H * 0.24 },
    { zone: "C" as const, x: MAP_W * 0.50, y: MAP_H * 0.50 },
    { zone: "D" as const, x: MAP_W * 0.25, y: MAP_H * 0.80 },
    { zone: "E" as const, x: MAP_W * 0.75, y: MAP_H * 0.80 },
  ];
  return centers.reduce((best, current) =>
    Math.hypot(x - current.x, y - current.y) < Math.hypot(x - best.x, y - best.y)
      ? current
      : best,
  ).zone;
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
    shapes.push({id:"redline-"+String(shapes.length+1).padStart(4,"0"),points,closed,blocksMove:true,blocksSight:false,label:closed?"red-line solid footprint":"red-line boundary",zone:editorZone(points)});
  }
  // The red-line reference does not author a statue-pedestal contour.
  // Do not promote the old estimated rectangle as production movement geometry;
  // keep the area unclassified until an owner-traced outline is reviewed.
  return shapes;
}
type ReplacementBounds = readonly [number, number, number, number];

function pointAt(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Return the segment's parameter interval inside an axis-aligned rectangle. */
function segmentRectInterval(
  a: Point,
  b: Point,
  bounds: ReplacementBounds,
): readonly [number, number] | null {
  const [minX, minY, maxX, maxY] = bounds;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  const tests: readonly [number, number][] = [
    [-dx, a[0] - minX], [dx, maxX - a[0]],
    [-dy, a[1] - minY], [dy, maxY - a[1]],
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > t1) return null;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return null;
      if (ratio < t1) t1 = ratio;
    }
  }
  return t1 - t0 > 1e-7 ? [t0, t1] : null;
}

/**
 * Remove red-line barriers only inside explicitly measured, source-reviewed
 * walkable replacement zones. Segments outside each zone are retained and
 * terminated exactly at the rectangle edge; this does not delete a nearby
 * room wall or broaden the opening beyond the reviewed coordinates.
 */
function applyWalkableReplacementZones(
  sourceShapes: readonly CollisionShape[],
): CollisionShape[] {
  const zones = MANUAL_WALKABLE_REPLACEMENT_ZONES.map(zone => ({
    id: zone.id,
    bounds: zone.bounds as ReplacementBounds,
  }));
  const output: CollisionShape[] = [];

  for (const shape of sourceShapes) {
    const segmentCount = shape.closed ? shape.points.length : shape.points.length - 1;
    let wasClipped = false;
    const paths: Point[][] = [];
    let current: Point[] | null = null;
    const flush = () => {
      if (current && current.length >= 2) paths.push(current);
      current = null;
    };

    for (let index = 0; index < segmentCount; index++) {
      const a = shape.points[index];
      const b = shape.points[(index + 1) % shape.points.length];
      let pieces: Array<{ start: Point; end: Point }> = [{ start: a, end: b }];

      for (const zone of zones) {
        const nextPieces: Array<{ start: Point; end: Point }> = [];
        for (const piece of pieces) {
          const interval = segmentRectInterval(piece.start, piece.end, zone.bounds);
          if (!interval) {
            nextPieces.push(piece);
            continue;
          }
          wasClipped = true;
          const [insideStart, insideEnd] = interval;
          const clippedStart = pointAt(piece.start, piece.end, insideStart);
          const clippedEnd = pointAt(piece.start, piece.end, insideEnd);
          if (insideStart > 1e-7 && Math.hypot(
            clippedStart[0] - piece.start[0], clippedStart[1] - piece.start[1],
          ) > 0.01) {
            nextPieces.push({ start: piece.start, end: clippedStart });
          }
          if (insideEnd < 1 - 1e-7 && Math.hypot(
            piece.end[0] - clippedEnd[0], piece.end[1] - clippedEnd[1],
          ) > 0.01) {
            nextPieces.push({ start: clippedEnd, end: piece.end });
          }
        }
        pieces = nextPieces;
      }

      if (pieces.length === 0) {
        flush();
        continue;
      }
      for (const piece of pieces) {
        const joins = current !== null && Math.hypot(
          current[current.length - 1][0] - piece.start[0],
          current[current.length - 1][1] - piece.start[1],
        ) <= 0.01;
        if (!joins) flush();
        if (current === null) current = [[piece.start[0], piece.start[1]]];
        current.push([piece.end[0], piece.end[1]]);
        // A clipped segment ends at a replacement boundary. Do not reconnect
        // the far side of that removed interval into one continuous wall.
        if (Math.hypot(piece.end[0] - b[0], piece.end[1] - b[1]) > 0.01) flush();
      }
    }
    flush();

    if (!wasClipped) {
      output.push(shape);
      continue;
    }
    for (let index = 0; index < paths.length; index++) {
      const points = paths[index];
      if (points.length < 2) continue;
      output.push({
        ...shape,
        id: shape.id + "-outside-replacement-" + String(index + 1).padStart(2, "0"),
        points,
        closed: false,
      });
    }
  }

  // The original authored van footprint is kept as its own compact movement
  // polygon. It replaces the coarse red-line outline inside the van-bay zone.
  for (const [index, polygon] of MANUAL_BLOCKED_POLYGONS.entries()) {
    output.push({
      id: "manual-blocked-" + String(index + 1).padStart(3, "0") + "-" + polygon.id,
      points: polygon.points.map(([x, y]) => [x, y] as Point),
      closed: true,
      blocksMove: true,
      blocksSight: false,
      label: polygon.id,
      zone: "E",
    });
  }
  return output;
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
  const tracedShapes=makeShapes(paths,info.width,info.height);
  const shapes=applyWalkableReplacementZones(tracedShapes);
  const points=shapes.reduce((n,s)=>n+s.points.length,0);
  if(shapes.length<80||points<500) throw new Error("insufficient red-line geometry: "+shapes.length+" shapes / "+points+" points");
  const document:CollisionDocument={
    version:1,mapW:MAP_W,mapH:MAP_H,shapes,
    source:{
      kind:"redline-vector",generatorVersion:6,
      sourceFiles:{
        redlineReference:{path:"attached_assets/IMG_2907_1783590932507.jpeg",sha256:await hash("attached_assets/IMG_2907_1783590932507.jpeg")},
        generator:{path:"scripts/src/buildCollisionDocument.ts",sha256:await hash("scripts/src/buildCollisionDocument.ts")},
        collisionEngine:{path:"lib/shared/src/collision/vectorCollision.ts",sha256:await hash("lib/shared/src/collision/vectorCollision.ts")},
        collisionOverrides:{path:"lib/shared/src/collisionOverrides.ts",sha256:await hash("lib/shared/src/collisionOverrides.ts")},
      },
      geometryOverrides:{
        walkableReplacementZones:MANUAL_WALKABLE_REPLACEMENT_ZONES.map(zone=>({id:zone.id,bounds:zone.bounds})),
        movementOnlyBlockedPolygons:MANUAL_BLOCKED_POLYGONS.map(polygon=>polygon.id),
      },
      referenceImage:{width:info.width,height:info.height},
      vectorization:{redPixelCount:redCount,skeletonPixelCount:skeletonCount,tracedPathCount:paths.length,simplifiedPointCount:points,simplificationToleranceSourcePx:TOLERANCE,closedSolidCount:shapes.filter(s=>s.closed).length,openBoundaryCount:shapes.filter(s=>!s.closed).length},
      shapeCounts:{
        total:shapes.length,
        tracedAfterReplacementClipping:tracedShapes.length,
        closedSolids:shapes.filter(s=>s.closed).length,
        openBoundaries:shapes.filter(s=>!s.closed).length,
        manualBlockedPolygons:MANUAL_BLOCKED_POLYGONS.length,
      },
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
    const d=s.points.map((p,i)=>(i?"L ":"M ")+(p[0]/MAP_W*info.width)+" "+(p[1]/MAP_H*info.height)).join(" ")+(s.closed?" Z":"");
    return '<path d="'+d+'" fill="none" stroke="#00ff68" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';
  }).join("");
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+info.width+'" height="'+info.height+'" viewBox="0 0 '+info.width+" "+info.height+'">'+svgPaths+"</svg>");
  await sharp(referencePath).composite([{input:svg}]).png().toFile(qaPath);

  // Produce a 4×3 close-up atlas of the entire map. Each cell is rendered at
  // 3× source zoom so the owner can inspect every traced wall/prop boundary,
  // not just the tiny full-map overview. The same vector paths are overlaid
  // on the untouched red reference; no collision geometry is inferred from
  // the presentation image.
  const detailDir=path.join(root,"artifacts/telegram-game/collision-redline-detail-qa");
  await mkdir(detailDir,{recursive:true});
  const detailLabels=[
    ["NW service bay","North-west storage","North atrium west","North atrium east"],
    ["West pipe room","West service corridor","Central atrium","East control room"],
    ["South-west garage","South loading bay","South utility room","East generator bay"],
  ];
  const detailWidth=1020,detailHeight=784,labelHeight=42,detailScale=3;
  const detailComposites:{input:Buffer,left:number,top:number}[]=[];
  for(let row=0;row<3;row++) for(let col=0;col<4;col++) {
    const left=Math.floor(col*info.width/4),top=Math.floor(row*info.height/3);
    const right=Math.floor((col+1)*info.width/4),bottom=Math.floor((row+1)*info.height/3);
    const cropWidth=right-left,cropHeight=bottom-top;
    const localPaths=shapes.map(shape=>{
      const d=shape.points.map((point,index)=>(index?"L ":"M ")+
        ((point[0]/MAP_W*info.width-left)*detailScale).toFixed(2)+" "+
        ((point[1]/MAP_H*info.height-top)*detailScale).toFixed(2)).join(" ");
      return '<path d="'+d+'" fill="none" stroke="#00ff68" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>';
    }).join("");
    const overlay=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+(cropWidth*detailScale)+'" height="'+(cropHeight*detailScale)+'">'+localPaths+'</svg>');
    const detail=await sharp(referencePath).extract({left,top,width:cropWidth,height:cropHeight})
      .resize(cropWidth*detailScale,cropHeight*detailScale,{fit:"fill",kernel:"lanczos3"})
      .composite([{input:overlay}]).png().toBuffer();
    const filename="collision-redline-detail-r"+(row+1)+"-c"+(col+1)+".png";
    await writeFile(path.join(detailDir,filename),detail);
    const label=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+detailWidth+'" height="'+labelHeight+'"><rect width="100%" height="100%" fill="#101820"/><text x="18" y="29" fill="#ffffff" font-size="22" font-family="sans-serif" font-weight="600">'+String(row*4+col+1).padStart(2,"0")+'  '+detailLabels[row][col]+'</text></svg>');
    const normalized=await sharp(detail).resize(detailWidth,detailHeight,{fit:"fill"}).png().toBuffer();
    detailComposites.push({input:label,left:col*detailWidth,top:row*(detailHeight+labelHeight)});
    detailComposites.push({input:normalized,left:col*detailWidth,top:row*(detailHeight+labelHeight)+labelHeight});
  }
  const detailAtlas=path.join(root,"artifacts/telegram-game/collision-redline-detail-atlas.png");
  await sharp({create:{width:detailWidth*4,height:(detailHeight+labelHeight)*3,channels:3,background:"#101820"}})
    .composite(detailComposites).png().toFile(detailAtlas);

  console.log(JSON.stringify({ok:true,source:"owner red-line reference",dimensions:{width:info.width,height:info.height},redCount,skeletonCount,tracedPaths:paths.length,shapeCounts:document.source?.shapeCounts,edgeCount,blocked,detailZoom:detailScale,detailRegions:12,outputs:["lib/shared/src/collision/collision.v1.json","lib/shared/src/collision/generatedDocument.ts","artifacts/telegram-game/collision-redline-vector-qa.png","artifacts/telegram-game/collision-redline-detail-atlas.png","artifacts/telegram-game/collision-redline-detail-qa/*.png"]},null,2));
}
await main();
