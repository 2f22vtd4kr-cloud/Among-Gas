import {useEffect,useRef} from 'react';
interface ActiveModal{token:number;root:HTMLElement|null}
let sequence=1;const stack:ActiveModal[]=[];
const SELECTOR=['button:not([disabled])','[href]','input:not([disabled])','select:not([disabled])','textarea:not([disabled])','[tabindex]:not([tabindex="-1"])'].join(',');
/** Stack-aware keyboard focus management for custom modal surfaces. */
export function useModalFocus(open:boolean,onEscape:()=>void,getInitialFocus?:()=>HTMLElement|null){
 const rootRef=useRef<HTMLElement|null>(null),escapeRef=useRef(onEscape),initialRef=useRef(getInitialFocus);
 escapeRef.current=onEscape;initialRef.current=getInitialFocus;
 useEffect(()=>{
  if(!open)return;const root=rootRef.current;if(!root)return;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,token=sequence++;
  stack.push({token,root});
  const focusables=()=>[...root.querySelectorAll<HTMLElement>(SELECTOR)].filter(el=>el.getClientRects().length>0&&el.getAttribute('aria-hidden')!=='true'&&!el.closest('[inert]'));
  const preferred=initialRef.current?.(),first=preferred&&root.contains(preferred)?preferred:focusables()[0];
  if(first)first.focus({preventScroll:true});else{if(!root.hasAttribute('tabindex'))root.tabIndex=-1;root.focus({preventScroll:true})}
  const onKeyDown=(event:KeyboardEvent)=>{
   if(stack[stack.length-1]?.token!==token)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();escapeRef.current();return}
   if(event.key!=='Tab')return;const items=focusables();
   if(!items.length){event.preventDefault();root.focus({preventScroll:true});return}
   const active=document.activeElement,firstItem=items[0],lastItem=items[items.length-1];
   if(event.shiftKey&&(active===firstItem||!root.contains(active))){event.preventDefault();lastItem.focus({preventScroll:true})}
   else if(!event.shiftKey&&(active===lastItem||!root.contains(active))){event.preventDefault();firstItem.focus({preventScroll:true})}
  };
  document.addEventListener('keydown',onKeyDown);
  return()=>{document.removeEventListener('keydown',onKeyDown);const i=stack.findIndex(item=>item.token===token);if(i>=0)stack.splice(i,1);
   const remaining=stack[stack.length-1]?.root;
   if(previous?.isConnected&&(!remaining||remaining.contains(previous)))window.requestAnimationFrame(()=>{if(previous.isConnected&&(!remaining||remaining.contains(previous)))previous.focus({preventScroll:true})});
  };
 },[open]);
 return rootRef;
}
