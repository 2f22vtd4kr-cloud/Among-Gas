import {useEffect,useState} from 'react';
export type JoystickSide='left'|'right';
export const CONTROL_IDS=['joystick','kill','report','task','emergency','map','tasks','sabotage','vent','admin','settings'] as const;
export type ControlId=(typeof CONTROL_IDS)[number];
export interface ControlPoint{x:number;y:number}
export type ControlLayout=Record<ControlId,ControlPoint>;
export interface AudioSettings{masterVolume:number;musicVolume:number;effectsVolume:number}
export interface GameSettings extends AudioSettings{joystickSide:JoystickSide;controlLayout:ControlLayout}
const STORAGE_KEY='amongGas.settings',CHANGE_EVENT='among-gas-settings-change';
const DEFAULT_CONTROL_LAYOUT:ControlLayout={
 joystick:{x:.80,y:.83},kill:{x:.39,y:.74},report:{x:.65,y:.74},task:{x:.28,y:.57},
 emergency:{x:.84,y:.18},map:{x:.16,y:.08},tasks:{x:.16,y:.18},sabotage:{x:.18,y:.74},
 vent:{x:.80,y:.55},admin:{x:.80,y:.43},settings:{x:.84,y:.08},
};
export const DEFAULT_SETTINGS:GameSettings={joystickSide:'right',controlLayout:DEFAULT_CONTROL_LAYOUT,masterVolume:1,musicVolume:1,effectsVolume:1};
let cache:GameSettings|null=null;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(v)?v:min));
function cloneLayout(layout:ControlLayout):ControlLayout{return Object.fromEntries(CONTROL_IDS.map(id=>[id,{...layout[id]}])) as ControlLayout}
function clone(settings:GameSettings):GameSettings{return {...settings,controlLayout:cloneLayout(settings.controlLayout)}}
function normalize(value:unknown,fallback:GameSettings=DEFAULT_SETTINGS):GameSettings{
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const rawLayout=raw.controlLayout&&typeof raw.controlLayout==='object'?raw.controlLayout as Record<string,unknown>:{};
 const layout=cloneLayout(fallback.controlLayout);
 for(const id of CONTROL_IDS){const p=rawLayout[id];if(p&&typeof p==='object'){const q=p as Record<string,unknown>;
  layout[id]={x:clamp(typeof q.x==='number'?q.x:layout[id].x,.08,.92),y:clamp(typeof q.y==='number'?q.y:layout[id].y,.08,.92)};}}
 const side:JoystickSide=raw.joystickSide==='left'?'left':raw.joystickSide==='right'?'right':fallback.joystickSide;
 return {joystickSide:side,controlLayout:layout,
  masterVolume:clamp(typeof raw.masterVolume==='number'?raw.masterVolume:fallback.masterVolume,0,1),
  musicVolume:clamp(typeof raw.musicVolume==='number'?raw.musicVolume:fallback.musicVolume,0,1),
  effectsVolume:clamp(typeof raw.effectsVolume==='number'?raw.effectsVolume:fallback.effectsVolume,0,1)};
}
function readStored(fallback:GameSettings):GameSettings{
 if(typeof window==='undefined')return clone(fallback);
 try{const stored=window.localStorage.getItem(STORAGE_KEY);return stored?normalize(JSON.parse(stored),fallback):clone(fallback)}
 catch{return clone(fallback)}
}
export function getGameSettings():GameSettings{if(!cache)cache=readStored(clone(DEFAULT_SETTINGS));return clone(cache)}
function commit(next:GameSettings):void{
 // Cache first: denied writes must not revert the visible setting.
 cache=normalize(next,getGameSettings());
 try{if(typeof window!=='undefined')window.localStorage.setItem(STORAGE_KEY,JSON.stringify(cache))}catch{/* in-memory state remains usable */}
 if(typeof window!=='undefined')window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function setJoystickSide(joystickSide:JoystickSide):void{
 const current=getGameSettings();
 commit({...current,joystickSide,controlLayout:{...current.controlLayout,joystick:{...current.controlLayout.joystick,x:joystickSide === 'left' ? 0.20 : 0.80}});
}
export function setControlLayout(controlLayout:ControlLayout):void{
 const current=getGameSettings(),normalized=normalize({...current,controlLayout},current);
 commit({...current,controlLayout:normalized.controlLayout,joystickSide:normalized.controlLayout.joystick.x<.5?'left':'right'});
}
export function setControlPosition(id:ControlId,point:ControlPoint):void{
 const current=getGameSettings(),layout=cloneLayout(current.controlLayout);
 layout[id]={x:clamp(point.x,.08,.92),y:clamp(point.y,.08,.92)};setControlLayout(layout);
}
export function resetControlLayout():void{
 const current=getGameSettings(),layout=cloneLayout(DEFAULT_CONTROL_LAYOUT);
 layout.joystick.x=current.joystickSide === 'left' ? 0.20 : 0.80;setControlLayout(layout);
}
export function setAudioSettings(patch:Partial<AudioSettings>):void{
 const current=getGameSettings();
 commit({...current,masterVolume:clamp(patch.masterVolume??current.masterVolume,0,1),
  musicVolume:clamp(patch.musicVolume??current.musicVolume,0,1),effectsVolume:clamp(patch.effectsVolume??current.effectsVolume,0,1)});
}
export function useGameSettings():GameSettings{
 const [settings,setSettings]=useState<GameSettings>(getGameSettings);
 useEffect(()=>{
  const sync=()=>setSettings(getGameSettings());
  const syncStorage=(event:StorageEvent)=>{if(event.key!==null&&event.key!==STORAGE_KEY)return;cache=readStored(cache??clone(DEFAULT_SETTINGS));sync()};
  window.addEventListener(CHANGE_EVENT,sync);window.addEventListener('storage',syncStorage);
  return()=>{window.removeEventListener(CHANGE_EVENT,sync);window.removeEventListener('storage',syncStorage)};
 },[]);
 return settings;
}
