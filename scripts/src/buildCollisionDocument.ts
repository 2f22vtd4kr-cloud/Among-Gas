import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CollisionWorld, validateCollisionDocument, type CollisionDocument, type CollisionShape, type Point } from "../../lib/shared/src/collision/vectorCollision.js";
import { MAP_H, MAP_W } from "../../lib/shared/src/coords.js";
import { assignMapAuthoringZonesByCentroid } from "../../lib/shared/src/collision/mapZones.js";
import {
  CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS,
  MANUAL_BLOCKED_POLYGONS,
  MANUAL_WALKABLE_REPLACEMENT_ZONES,
  SOURCE_ART_ISOLATED_REGION_CANDIDATES,
  SOURCE_ART_SEALED_REGION_CANDIDATES,
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
interface FreeComponent {
  readonly id: number;
  readonly area: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly touchesBorder: boolean;
  readonly pixels: number[];
}

function closeBinaryMask(mask: Uint8Array, w: number, h: number, kernel: number): Uint8Array {
  if (kernel < 3 || kernel % 2 === 0) throw new RangeError("closing kernel must be an odd value >=3");
  const radius = Math.floor(kernel / 2);
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let found = false;
    for (let dy = -radius; dy <= radius && !found; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w && mask[ny * w + nx] === 1) { found = true; break; }
      }
    }
    if (found) dilated[y * w + x] = 1;
  }
  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let full = true;
    for (let dy = -radius; dy <= radius && full; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w && dilated[ny * w + nx] === 0) { full = false; break; }
      }
    }
    if (full) closed[y * w + x] = 1;
  }
  return closed;
}

function labelFreeComponents(barrier: Uint8Array, w: number, h: number): {
  labels: Int32Array;
  components: FreeComponent[];
} {
  const labels = new Int32Array(barrier.length);
  labels.fill(-1);
  const queue = new Int32Array(barrier.length);
  const components: FreeComponent[] = [];
  const neighbours: readonly (readonly [number, number])[] = [
    [-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1],
  ];
  for (let start = 0; start < barrier.length; start++) {
    if (barrier[start] === 1 || labels[start] !== -1) continue;
    const id = components.length;
    let head = 0, tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    let minX = w, minY = h, maxX = -1, maxY = -1, touchesBorder = false;
    const pixels: number[] = [];
    while (head < tail) {
      const index = queue[head++];
      pixels.push(index);
      const x = index % w, y = Math.floor(index / w);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      for (const [dx, dy] of neighbours) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (barrier[next] === 1 || labels[next] !== -1) continue;
        labels[next] = id;
        queue[tail++] = next;
      }
    }
    components.push({ id, area: tail, minX, minY, maxX, maxY, touchesBorder, pixels });
  }
  return { labels, components };
}

function signedArea(points: readonly Point[]): number {
  let value = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    value += a[0] * b[1] - b[0] * a[1];
  }
  return value / 2;
}

function sourcePointInPolygon(x: number, y: number, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) &&
        x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function componentOuterContours(
  labels: Int32Array, w: number, h: number, component: FreeComponent,
): Point[][] {
  type Edge = { ax: number; ay: number; bx: number; by: number; direction: number };
  const edges: Edge[] = [];
  const outgoing = new Map<string, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number, direction: number) => {
    const index = edges.length;
    edges.push({ ax, ay, bx, by, direction });
    const key = ax + "," + ay;
    const bucket = outgoing.get(key);
    if (bucket) bucket.push(index); else outgoing.set(key, [index]);
  };
  for (const pixelIndex of component.pixels) {
    const x = pixelIndex % w, y = Math.floor(pixelIndex / w);
    if (y === 0 || labels[(y - 1) * w + x] !== component.id) add(x, y, x + 1, y, 0);
    if (x === w - 1 || labels[y * w + x + 1] !== component.id) add(x + 1, y, x + 1, y + 1, 1);
    if (y === h - 1 || labels[(y + 1) * w + x] !== component.id) add(x + 1, y + 1, x, y + 1, 2);
    if (x === 0 || labels[y * w + x - 1] !== component.id) add(x, y + 1, x, y, 3);
  }
  const used = new Uint8Array(edges.length);
  const priority = [1, 0, 3, 2];
  const loops: Point[][] = [];
  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue;
    const first = edges[start];
    const loop: Point[] = [];
    let edgeIndex = start, closed = false, guard = 0;
    while (!used[edgeIndex] && guard++ <= edges.length + 2) {
      used[edgeIndex] = 1;
      const edge = edges[edgeIndex];
      loop.push([edge.ax, edge.ay]);
      if (edge.bx === first.ax && edge.by === first.ay) { closed = true; break; }
      const candidates = (outgoing.get(edge.bx + "," + edge.by) ?? []).filter(index => !used[index]);
      if (!candidates.length) break;
      candidates.sort((a, b) => {
        const da = (edges[a].direction - edge.direction + 4) % 4;
        const db = (edges[b].direction - edge.direction + 4) % 4;
        return priority.indexOf(da) - priority.indexOf(db);
      });
      edgeIndex = candidates[0];
    }
    if (closed && loop.length >= 3 && signedArea(loop) > 0) loops.push(loop);
  }
  return loops;
}

function simplifySourceLoop(loop: Point[]): Point[] {
  const simplified = simplify([...loop, loop[0]], TOLERANCE);
  if (simplified.length > 1 &&
      simplified[0][0] === simplified[simplified.length - 1][0] &&
      simplified[0][1] === simplified[simplified.length - 1][1]) simplified.pop();
  return simplified;
}

function extractSourceWalkableRegions(mask: Uint8Array, w: number, h: number): {
  shapes: CollisionShape[];
  metadata: NonNullable<CollisionDocument["source"]>["walkableRegionExtraction"];
} {
  const barrier = closeBinaryMask(mask, w, h, 5);
  const { labels, components } = labelFreeComponents(barrier, w, h);
  const interior = components.filter(component => !component.touchesBorder);
  const main = [...interior].sort((a, b) => b.area - a.area)[0];
  if (!main || main.area < 100_000) throw new Error("red-line source did not produce a substantial spawn-connected floor region");

  const isolatedReference = SOURCE_ART_ISOLATED_REGION_CANDIDATES[0].islandSideReferenceImage;
  const referenceX = isolatedReference[0], referenceY = isolatedReference[1];
  let isolatedId = labels[referenceY * w + referenceX];
  if (isolatedId < 0 || isolatedId === main.id) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius <= 8 && (isolatedId < 0 || isolatedId === main.id); radius++) {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const x = referenceX + dx, y = referenceY + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const id = labels[y * w + x];
        if (id < 0 || id === main.id) continue;
        const d = dx * dx + dy * dy;
        if (d < nearest) { nearest = d; isolatedId = id; }
      }
    }
  }
  const isolated = components.find(component => component.id === isolatedId);
  if (!isolated || isolated.touchesBorder || isolated.area < 10_000 || isolated.id === main.id) {
    throw new Error("C38 source-art reference point did not resolve to a separate enclosed floor component");
  }

  const mainId = "main-spawn-connected-floor";
  const isolatedIdName = "east-office-vehicle-service-bay";
  const selected = [
    { component: main, id: mainId, role: "spawn-connected-floor" as const, label: "source-derived spawn-connected playable floor" },
    { component: isolated, id: isolatedIdName, role: "isolated-interior-candidate" as const, label: "source-derived isolated bay interior; no entry authored" },
  ];
  const shapes: CollisionShape[] = [];
  const regionLoops = new Map<string, Point[][]>();
  const regionWorldLoops = new Map<string, Point[][]>();

  for (const region of selected) {
    const loops = componentOuterContours(labels, w, h, region.component);
    if (!loops.length) throw new Error("source floor region has no closed outer contour: " + region.id);
    const sourceLoops = loops.map(simplifySourceLoop).filter(loop => loop.length >= 3);
    regionLoops.set(region.id, sourceLoops);
    const worldLoops: Point[][] = [];
    sourceLoops.forEach((loop, loopIndex) => {
      const points = loop.map(([x, y]) => [(x / w) * MAP_W, (y / h) * MAP_H] as Point);
      if (area(points) < 100) return;
      worldLoops.push(points);
      shapes.push({
        id: "walkable-region-" + region.id + "-" + String(loopIndex + 1).padStart(2, "0"),
        points,
        closed: true,
        blocksMove: false,
        blocksSight: false,
        castsShadow: false,
        walkableRegion: true,
        walkableRegionId: region.id,
        label: region.label,
      });
    });
    regionWorldLoops.set(region.id, worldLoops);
  }

  // C38 is a separate interior region, not an extension of the spawn-connected
  // floor. Explicitly subtract it from the main region while preserving its
  // internal floor as a separately reviewable walkable island.
  for (const [loopIndex, loop] of (regionLoops.get(isolatedIdName) ?? []).entries()) {
    const points = loop.map(([x, y]) => [(x / w) * MAP_W, (y / h) * MAP_H] as Point);
    if (area(points) < 100) continue;
    shapes.push({
      id: "walkable-hole-" + mainId + "-C38-" + String(loopIndex + 1).padStart(2, "0"),
      points,
      closed: true,
      blocksMove: false,
      blocksSight: false,
      castsShadow: false,
      walkableRegionHole: true,
      walkableRegionId: mainId,
      label: "C38 isolated interior excluded from spawn-connected floor",
    });
  }

  let holeCount = regionLoops.get(isolatedIdName)?.length ?? 0;
  for (const component of interior) {
    if (component.id === main.id || component.id === isolated.id || component.area < 16) continue;
    const centerX = (component.minX + component.maxX + 1) / 2;
    const centerY = (component.minY + component.maxY + 1) / 2;
    const inIsolated = (regionLoops.get(isolatedIdName) ?? []).some(loop => sourcePointInPolygon(centerX, centerY, loop));
    const inMain = (regionLoops.get(mainId) ?? []).some(loop => sourcePointInPolygon(centerX, centerY, loop));
    const parentRegionId = inIsolated ? isolatedIdName : inMain ? mainId : null;
    if (!parentRegionId) continue;
    const loops = componentOuterContours(labels, w, h, component);
    for (const [loopIndex, loop] of loops.entries()) {
      const simplified = simplifySourceLoop(loop);
      if (simplified.length < 3) continue;
      const points = simplified.map(([x, y]) => [(x / w) * MAP_W, (y / h) * MAP_H] as Point);
      if (area(points) < 100) continue;
      shapes.push({
        id: "walkable-hole-" + parentRegionId + "-component-" + component.id + "-" + String(loopIndex + 1).padStart(2, "0"),
        points,
        closed: true,
        blocksMove: false,
        blocksSight: false,
        castsShadow: false,
        walkableRegionHole: true,
        walkableRegionId: parentRegionId,
        label: "source-derived enclosed non-walkable object/fixture interior",
      });
      holeCount++;
    }
  }

  return {
    shapes,
    metadata: {
      morphologyKernelSourcePx: 5,
      connectivity: 8,
      selectedRegions: selected.map(region => ({
        id: region.id,
        role: region.role,
        pixelArea: region.component.area,
        sourceBounds: [region.component.minX, region.component.minY, region.component.maxX + 1, region.component.maxY + 1] as const,
        ownerDecisionRequired: region.role === "isolated-interior-candidate",
      })),
      excludedDetachedCandidates: SOURCE_ART_SEALED_REGION_CANDIDATES.map(candidate => candidate.id),
      holeCount,
      excludedComponentCount: interior.length - selected.length,
    },
  };
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
    shapes.push({id:"redline-"+String(shapes.length+1).padStart(4,"0"),points,closed,blocksMove:true,blocksSight:false,label:closed?"red-line solid footprint":"red-line boundary"});
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
    });
  }
  for (const polygon of CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS) {
    output.push({
      id: "source-art-candidate-" + polygon.id,
      points: polygon.points.map(([x, y]) => [x, y] as Point),
      closed: true,
      blocksMove: true,
      blocksSight: false,
      label: "provisional source-art movement contour: " + polygon.id,
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
  const walkableRegionExtraction=extractSourceWalkableRegions(mask.slice(),info.width,info.height);
  const skeleton=thin(mask,info.width,info.height); let skeletonCount=0;
  for(const v of skeleton) skeletonCount+=v;
  if(skeletonCount<1000) throw new Error("red-line skeleton unexpectedly sparse: "+skeletonCount);
  const paths=trace(graphOf(skeleton,info.width,info.height),skeleton.length);
  const tracedShapes=makeShapes(paths,info.width,info.height);
  const clippedShapes=applyWalkableReplacementZones(tracedShapes);
  const shapes=assignMapAuthoringZonesByCentroid({
    shapes:[...clippedShapes,...walkableRegionExtraction.shapes],
  }).shapes;
  const points=shapes.reduce((n,s)=>n+s.points.length,0);
  if(shapes.length<80||points<500) throw new Error("insufficient red-line geometry: "+shapes.length+" shapes / "+points+" points");
  const document:CollisionDocument={
    version:1,mapW:MAP_W,mapH:MAP_H,shapes,
    source:{
      kind:"redline-vector",generatorVersion:8,
      sourceFiles:{
        redlineReference:{path:"attached_assets/IMG_2907_1783590932507.jpeg",sha256:await hash("attached_assets/IMG_2907_1783590932507.jpeg")},
        generator:{path:"scripts/src/buildCollisionDocument.ts",sha256:await hash("scripts/src/buildCollisionDocument.ts")},
        collisionEngine:{path:"lib/shared/src/collision/vectorCollision.ts",sha256:await hash("lib/shared/src/collision/vectorCollision.ts")},
        collisionOverrides:{path:"lib/shared/src/collisionOverrides.ts",sha256:await hash("lib/shared/src/collisionOverrides.ts")},
      },
      geometryOverrides:{
        walkableReplacementZones:MANUAL_WALKABLE_REPLACEMENT_ZONES.map(zone=>({id:zone.id,bounds:zone.bounds})),
        movementOnlyBlockedPolygons:[
          ...MANUAL_BLOCKED_POLYGONS.map(polygon=>polygon.id),
          ...CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS.map(polygon=>polygon.id),
        ],
      },
      referenceImage:{width:info.width,height:info.height},
      walkableRegionExtraction:walkableRegionExtraction.metadata,
      vectorization:{
        redPixelCount:redCount,
        skeletonPixelCount:skeletonCount,
        tracedPathCount:paths.length,
        simplifiedPointCount:points,
        simplificationToleranceSourcePx:TOLERANCE,
        closedSolidCount:shapes.filter(s=>s.closed&&s.blocksMove).length,
        openBoundaryCount:shapes.filter(s=>!s.closed&&s.blocksMove).length,
      },
      shapeCounts:{
        total:shapes.length,
        tracedAfterReplacementClipping:clippedShapes.length,
        closedSolids:shapes.filter(s=>s.closed&&s.blocksMove).length,
        openBoundaries:shapes.filter(s=>!s.closed&&s.blocksMove).length,
        walkableRegions:shapes.filter(s=>s.walkableRegion===true).length,
        walkableRegionHoles:shapes.filter(s=>s.walkableRegionHole===true).length,
        manualBlockedPolygons:MANUAL_BLOCKED_POLYGONS.length,
        provisionalSourceArtBlockedPolygons:CANDIDATE_SOURCE_ART_BLOCKED_POLYGONS.length,
      },
      zoneShapeCounts:Object.fromEntries(Array.from({length:12},(_,index)=>{const id="Z"+String(index+1).padStart(2,"0");return [id,shapes.filter(shape=>shape.zone===id).length];})),
    },
  };
  const errors=validateCollisionDocument(document); if(errors.length) throw new Error("invalid red-line geometry: "+errors.join("; "));
  const world=new CollisionWorld(shapes,MAP_W,MAP_H);
  let edgeCount=0,blocked=0;
  const unblockedSamples:Array<{id:string;walkableRegion:boolean|undefined;point:Point;radius:number}>=[];
  for(const shape of shapes) {
    const count=shape.closed?shape.points.length:shape.points.length-1;
    for(let i=0;i<count;i++) {
      const a=shape.points[i],b=shape.points[(i+1)%shape.points.length];
      edgeCount++;
      const edgeRadius=shape.walkableRegion===true||shape.walkableRegionHole===true?4:0;
      const midpoint:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      if(!world.isWalkable(midpoint[0],midpoint[1],edgeRadius)) blocked++;
      else if(unblockedSamples.length<12) unblockedSamples.push({id:shape.id,walkableRegion:shape.walkableRegion,point:midpoint,radius:edgeRadius});
    }
  }
  if(edgeCount<500||blocked/edgeCount<.995) throw new Error("red-line edge self-check failed: "+blocked+"/"+edgeCount+"; unblocked="+JSON.stringify(unblockedSamples));
  await mkdir(outputDir,{recursive:true}); await mkdir(path.dirname(qaPath),{recursive:true});
  await writeFile(path.join(outputDir,"collision.v1.json"),JSON.stringify(document,null,2)+"\n");
  await writeFile(path.join(outputDir,"generatedDocument.ts"),
    'import type { CollisionDocument } from "./vectorCollision.js";\n'+
    "const COLLISION_DOCUMENT_JSON = "+JSON.stringify(JSON.stringify(document))+";\n"+
    "export const COLLISION_DOCUMENT = JSON.parse(COLLISION_DOCUMENT_JSON) as CollisionDocument;\n");
  const svgPaths=shapes.map(s=>{
    const d=s.points.map((p,i)=>(i?"L ":"M ")+(p[0]/MAP_W*info.width)+" "+(p[1]/MAP_H*info.height)).join(" ")+(s.closed?" Z":"");
    const stroke=s.walkableRegion===true?"#00d7ff":"#00ff68";
    const strokeWidth=s.walkableRegion===true?2.4:1.4;
    return '<path d="'+d+'" fill="none" stroke="'+stroke+'" stroke-width="'+strokeWidth+'" stroke-linecap="round" stroke-linejoin="round"/>';
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
