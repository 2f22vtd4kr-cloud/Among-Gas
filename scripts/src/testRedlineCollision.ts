import assert from "node:assert/strict";
import {
  GENERATED_COLLISION_PREVIEW_DOCUMENT,
  GENERATED_COLLISION_PREVIEW_WORLD,
  getProductionCollisionDocument,
  getProductionCollisionWorld,
  PRODUCTION_COLLISION_DOCUMENT,
  PRODUCTION_COLLISION_WORLD,
  replaceProductionCollisionDocument,
} from "@workspace/shared/collision/productionWorld";
import { COLS, ROWS } from "@workspace/shared/collisionMap";
import { FEET_OFFSET_Y, MAP_W, MAP_H, PLAYER_SPAWN_X, PLAYER_SPAWN_Y } from "@workspace/shared/coords";
import { TASK_DEFS, TASK_INTERACTION_RANGE_PX } from "@workspace/shared/tasks";
import { VENT_DEFS, VENT_INTERACTION_RANGE_PX } from "@workspace/shared/vents";
import { SABOTAGE_DEFS, SABOTAGE_INTERACTION_RANGE_PX } from "@workspace/shared/sabotage";
import { ADMIN_TABLE_DEFS, ADMIN_TABLE_INTERACTION_RANGE_PX } from "@workspace/shared/adminTable";

const document = getProductionCollisionDocument();
const world = getProductionCollisionWorld();
assert.equal(document.source?.kind, "redline-vector");
assert.ok(document.shapes.length >= 80);
assert.equal(world.shapes.length, document.shapes.length);
assert.ok(document.shapes.every(shape => !shape.blocksSight),
  "movement-only red-line traces must not silently become vision occluders");
assert.ok(world.isPlayerSpawnPositionClear(PLAYER_SPAWN_X, PLAYER_SPAWN_Y),
  "the real player spawn must be clear under the same red-line geometry used at runtime");
const statuePedestal = document.shapes.find(shape => shape.id === "statue-pedestal");
assert.ok(statuePedestal?.closed, "the measured statue pedestal must be a solid footprint");
assert.equal(world.insideSolid(1745, 497), true, "the statue pedestal interior must block movement");
assert.equal(world.isPlayerWalkableAtFeet(1745, 550), true,
  "the decorative garden floor outside the pedestal remains walkable");
const editorZones = new Set(document.shapes.map(shape => shape.zone));
assert.deepEqual([...editorZones].sort(), ["A", "B", "C", "D", "E"],
  "the production seed must be assigned across all five spatial editor zones");
assert.equal(statuePedestal.zone, "C",
  "the statue pedestal belongs to the central editor zone");

const cols = COLS * 2, rows = ROWS * 2;
const nav = world.rasterizePlayerNav(cols, rows);
const startCol = Math.floor(PLAYER_SPAWN_X / nav.cellX);
const startRow = Math.floor((PLAYER_SPAWN_Y + FEET_OFFSET_Y) / nav.cellY);
assert.ok(startCol >= 0 && startCol < cols && startRow >= 0 && startRow < rows);
const start = startRow * cols + startCol;
assert.equal(nav.walk[start], 1, "spawn cell must be walkable in vector-derived navigation");

const seen = new Uint8Array(cols * rows);
const queue = [start];
seen[start] = 1;
const directions: readonly (readonly [number, number, boolean])[] = [[0,-1,false],[0,1,false],[-1,0,false],[1,0,false],[-1,-1,true],[-1,1,true],[1,-1,true],[1,1,true]];
for (let head=0;head<queue.length;head++) {
  const index=queue[head], row=Math.floor(index/cols), col=index-row*cols;
  for (const [dx,dy,diagonal] of directions) {
    const x=col+dx,y=row+dy;
    if(x<0||x>=cols||y<0||y>=rows) continue;
    const next=y*cols+x;
    if(seen[next]||nav.walk[next]!==1) continue;
    if(diagonal&&(nav.walk[row*cols+x]!==1||nav.walk[y*cols+col]!==1)) continue;
    seen[next]=1; queue.push(next);
  }
}
assert.ok(queue.length > 500, "the red-line collision graph must preserve a substantial connected play area");
const reachablePoints=queue.map(index=>{
  const row=Math.floor(index/cols),col=index-row*cols;
  return {x:(col+0.5)*nav.cellX,y:(row+0.5)*nav.cellY};
});
function nearestDistance(point:{x:number;y:number}):number {
  let nearest=Infinity;
  for(const candidate of reachablePoints) nearest=Math.min(nearest,Math.hypot(candidate.x-point.x,candidate.y-point.y));
  return nearest;
}
const anchors = [
  ...TASK_DEFS.map(task=>({kind:"task",id:task.id,name:task.name,x:task.x,y:task.y,max:TASK_INTERACTION_RANGE_PX-30})),
  ...VENT_DEFS.map(vent=>({kind:"vent",id:vent.id,name:vent.name,x:vent.x,y:vent.y,max:VENT_INTERACTION_RANGE_PX-30})),
  ...Object.values(SABOTAGE_DEFS).flatMap(def=>def.pads.map((pad,index)=>({kind:"sabotage",id:def.id,name:def.name+" "+index,x:pad.x,y:pad.y,max:SABOTAGE_INTERACTION_RANGE_PX-30}))),
  ...ADMIN_TABLE_DEFS.map(table=>({kind:"admin",id:table.id,name:table.name,x:table.x,y:table.y,max:ADMIN_TABLE_INTERACTION_RANGE_PX})),
];
for(const anchor of anchors) {
  const distance=nearestDistance(anchor);
  assert.ok(distance<=anchor.max,
    anchor.kind+" "+anchor.name+" is "+Math.round(distance)+"px from vector-reachable floor (limit "+Math.round(anchor.max)+"px)");
}
for(const [index,shape] of document.shapes.entries()) {
  const edgeCount=shape.closed?shape.points.length:shape.points.length-1;
  assert.ok(edgeCount>=1,"shape "+index+" has no boundary edges");
}
// Replacing a validated candidate must update every exported singleton alias.
// This catches stale ESM `const` exports that otherwise keep consumers on the old world.
const replacement = {
  ...document,
  shapes: document.shapes.map(shape => ({ ...shape, points: shape.points.map(point => [point[0], point[1]] as const) })),
};
replaceProductionCollisionDocument(replacement);
assert.strictEqual(getProductionCollisionDocument(), replacement);
assert.strictEqual(PRODUCTION_COLLISION_DOCUMENT, replacement);
assert.strictEqual(GENERATED_COLLISION_PREVIEW_DOCUMENT, replacement);
assert.strictEqual(PRODUCTION_COLLISION_WORLD, getProductionCollisionWorld());
assert.strictEqual(GENERATED_COLLISION_PREVIEW_WORLD, getProductionCollisionWorld());
assert.throws(() => replaceProductionCollisionDocument({ ...replacement, mapW: 0 }), /invalid collision candidate/i);
assert.strictEqual(getProductionCollisionDocument(), replacement,
  "a rejected replacement must leave the current production world intact");

console.log(JSON.stringify({
  ok:true,
  source:document.source?.sourceFiles.redlineReference.path,
  shapes:document.shapes.length,
  connectedWalkableNavCells:queue.length,
  totalNavCells:cols*rows,
  anchors:anchors.length,
  spawn:{x:PLAYER_SPAWN_X,y:PLAYER_SPAWN_Y},
  map:{width:MAP_W,height:MAP_H},
},null,2));
