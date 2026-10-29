// Original textured Among Gas character atlas (1123×1401 PNG).
// Keep measured per-pose source windows; the rows are deliberately not uniform.
const SPRITE_SHEET_VERSION = 6;
export const CHARACTER_SHEET_PATH = `/sprites/characters.png?v=${SPRITE_SHEET_VERSION}`;
export const CHARACTER_SHEET_COLS = 7;
export const CHARACTER_SHEET_ROWS = 9;
export const CHARACTER_SHEET_WIDTH = 1123;
export const CHARACTER_SHEET_HEIGHT = 1401;
export const CHARACTER_CELL_WIDTH = CHARACTER_SHEET_WIDTH / CHARACTER_SHEET_COLS;
export const CHARACTER_CELL_HEIGHT = CHARACTER_SHEET_HEIGHT / CHARACTER_SHEET_ROWS;
export const CHARACTER_COLORS = ['teal','maroon','navy','purple','brown','dark-gray','magenta'] as const;
export type CharacterColor = (typeof CHARACTER_COLORS)[number];
export const CHARACTER_POSES = ['idle','walk-1','walk-2','run-lean','ghost','mask','hold-item','dead-body','sit-crouch'] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];
const POSE_ROW_WINDOWS: ReadonlyArray<{top:number;bottom:number}> = [
 {top:0,bottom:153},{top:172,bottom:310},{top:327,bottom:458},{top:471,bottom:620},
 {top:636,bottom:775},{top:795,bottom:903},{top:915,bottom:1051},{top:1067,bottom:1185},{top:1198,bottom:1334},
];
export function getCharacterFrameRect(color:CharacterColor,pose:CharacterPose){
 const col=CHARACTER_COLORS.indexOf(color),row=CHARACTER_POSES.indexOf(pose),window=POSE_ROW_WINDOWS[row];
 return {x:col*CHARACTER_CELL_WIDTH,y:window.top,width:CHARACTER_CELL_WIDTH,height:window.bottom-window.top,row};
}
