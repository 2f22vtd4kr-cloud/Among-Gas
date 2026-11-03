import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

type Pt = [number, number];
type Shape = { id: string; points: Pt[]; closed: boolean; blocksMove: boolean; blocksSight: boolean; label?: string; zone?: string };
type Pixel = [number, number];

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = path.join(ROOT, 'attached_assets/IMG_2907_1783632830477.jpeg');
const OUT_JSON = path.join(ROOT, 'lib/shared/src/collision/collision.v1.json');
const OUT_TS = path.join(ROOT, 'lib/shared/src/collision/generatedDocument.ts');
const MAP_W = 3224, MAP_H = 1858, MIN_PATH_WORLD = 50, RDP_TOLERANCE = 1.5;
const N: Pixel[] = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const key = (x:number,y:number) => y * 10000 + x;

function rdp(points: Pixel[], tolerance: number): Pixel[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0]=1; keep[points.length-1]=1;
  const stack: Array<[number,number]> = [[0,points.length-1]];
  while (stack.length) {
    const [a,b]=stack.pop()!; const [ax,ay]=points[a], [bx,by]=points[b];
    const dx=bx-ax,dy=by-ay,L=Math.sqrt(dx*dx+dy*dy)||1; let md=0,mi=-1;
    for(let i=a+1;i<b;i++){const d=Math.abs((points[i][0]-ax)*dy-(points[i][1]-ay)*dx)/L;if(d>md){md=d;mi=i;}}
    if(mi>=0&&md>tolerance){keep[mi]=1;stack.push([a,mi],[mi,b]);}
  }
  return points.filter((_,i)=>keep[i]);
}

function neighbours(x:number,y:number,mask:Set<number>): Pixel[]{
  const out:Pixel[]=[]; for(const [dx,dy] of N){const nx=x+dx,ny=y+dy;if(mask.has(key(nx,ny)))out.push([nx,ny]);} return out;
}

function thin(mask: Uint8Array, w:number, h:number): Uint8Array {
  const a=mask.slice();
  for(let iteration=0;iteration<30;iteration++){
    let changed=false;
    for(let pass=0;pass<2;pass++){
      const remove:number[]=[];
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x;if(!a[i])continue;
        const p=[a[(y-1)*w+x],a[(y-1)*w+x+1],a[y*w+x+1],a[(y+1)*w+x+1],a[(y+1)*w+x],a[(y+1)*w+x-1],a[y*w+x-1],a[(y-1)*w+x-1]];
        const count=p.reduce((s,v)=>s+v,0); if(count<2||count>6)continue;
        let transitions=0;for(let n=0;n<8;n++)if(p[n]===0&&p[(n+1)%8]===1)transitions++;if(transitions!==1)continue;
        if(pass===0){if(p[0]*p[2]*p[4]!==0||p[2]*p[4]*p[6]!==0)continue;}
        else if(p[0]*p[2]*p[6]!==0||p[0]*p[4]*p[6]!==0)continue;
        remove.push(i);
      }
      for(const i of remove)a[i]=0; changed ||= remove.length>0;
    }
    if(!changed)break;
  }
  return a;
}

function components(mask:Uint8Array,w:number,h:number):Pixel[][]{
  const seen=new Uint8Array(mask.length),out:Pixel[][]=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const start=y*w+x;if(!mask[start]||seen[start])continue;
    const q:Pixel[]=[[x,y]], c:Pixel[]=[];seen[start]=1;
    for(let n=0;n<q.length;n++){const p=q[n];c.push(p);for(const [nx,ny] of neighbours(p[0],p[1],new Set(c.map(([cx,cy])=>key(cx,cy))))){const i=ny*w+nx;if(!seen[i]){seen[i]=1;q.push([nx,ny]);}}}
    if(c.length>=5)out.push(c);
  } return out;
}

function trace(c:Pixel[]):Pixel[][]{
  const set=new Set(c.map(([x,y])=>key(x,y))), get=(p:Pixel)=>neighbours(p[0],p[1],set);
  const degree=new Map<number,number>();for(const p of c)degree.set(key(p[0],p[1]),get(p).length);
  const nodes=c.filter(p=>degree.get(key(p[0],p[1]))!==2),seen=new Set<string>();
  const edge=(a:Pixel,b:Pixel)=>{const x=key(a[0],a[1]),y=key(b[0],b[1]);return x<y?`${x}:${y}`:`${y}:${x}`;};
  const out:Pixel[][]=[];
  const walk=(start:Pixel,first:Pixel)=>{const path:Pixel[]=[start];let prev=start,cur=first;seen.add(edge(start,first));for(;;){path.push(cur);const next=get(cur).find(p=>p[0]!==prev[0]||p[1]!==prev[1]);if(!next)break;const e=edge(cur,next);if(seen.has(e))break;seen.add(e);prev=cur;cur=next;if(cur[0]===start[0]&&cur[1]===start[1])break;}return path;};
  for(const node of nodes)for(const first of get(node)){const e=edge(node,first);if(!seen.has(e)){const p=walk(node,first);if(p.length>1)out.push(p);}}
  for(const start of c)for(const first of get(start)){const e=edge(start,first);if(seen.has(e))continue;const p=walk(start,first);if(p.length>2)out.push(p);}
  return out;
}

async function main(){
  const {data,info}=await sharp(SOURCE).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==1359||info.height!==784)throw new Error(`Unexpected collision reference size ${info.width}×${info.height}`);
  const mask=new Uint8Array(info.width*info.height);
  for(let i=0;i<mask.length;i++){const r=data[i*3],g=data[i*3+1];mask[i]=r>=160&&r-g>=130?1:0;}
  const skeleton=thin(mask,info.width,info.height), comps=components(skeleton,info.width,info.height), sx=MAP_W/info.width,sy=MAP_H/info.height;
  const shapes:Shape[]=[];let id=0;
  for(const c of comps)for(const raw of trace(c)){const simple=rdp(raw,RDP_TOLERANCE),points=simple.map(([x,y])=>[Math.round(x*sx*10)/10,Math.round(y*sy*10)/10] as Pt);let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);if(length>=MIN_PATH_WORLD)shapes.push({id:`reference-wall-${String(id++).padStart(3,'0')}`,points,closed:false,blocksMove:true,blocksSight:true,label:'source red-line reference',zone:'reference'});}
  shapes.push({id:'statue-planter-ring',points:[[1612.8,419.3],[1660.6,350.9],[1765,350.9],[1836.1,417],[1881.2,500.4],[1845.7,583.3],[1776.9,637.9],[1660.6,637.9],[1591.4,578.6],[1549,504.7],[1565.6,450.5]],closed:true,blocksMove:true,blocksSight:false,label:'low octagonal planter ring',zone:'lobby'});
  shapes.push({id:'statue-pedestal',points:[[1700,464.2],[1780,464.2],[1789.5,531],[1690,531]],closed:true,blocksMove:true,blocksSight:true,label:'statue pedestal',zone:'lobby'});
  const document={version:1 as const,mapW:MAP_W,mapH:MAP_H,shapes};fs.mkdirSync(path.dirname(OUT_JSON),{recursive:true});fs.writeFileSync(OUT_JSON,JSON.stringify(document,null,2)+'\n');fs.writeFileSync(OUT_TS,`// Generated; do not edit.\nexport const COLLISION_DOCUMENT = ${JSON.stringify(document)} as const;\n`);console.log(`collision: generated ${shapes.length} vector shapes from source red-line reference`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
