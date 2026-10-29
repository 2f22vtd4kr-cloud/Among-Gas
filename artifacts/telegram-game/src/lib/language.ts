import {useEffect,useState} from 'react';
export type AppLanguage='ru'|'en';
const STORAGE_KEY='amongGas.language',CHANGE_EVENT='among-gas-language-change';
let cache:AppLanguage|null=null;
function readStored(fallback:AppLanguage='ru'):AppLanguage{
 if(typeof window==='undefined')return fallback;
 try{return window.localStorage.getItem(STORAGE_KEY)==='en'?'en':'ru'}catch{return fallback}
}
export function getLanguage():AppLanguage{if(cache===null)cache=readStored();return cache}
export function setLanguage(language:AppLanguage):void{
 cache=language;
 try{if(typeof window!=='undefined')window.localStorage.setItem(STORAGE_KEY,language)}catch{/* keep the in-memory selection */}
 if(typeof window!=='undefined')window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function useLanguage():{language:AppLanguage;setLanguage:(language:AppLanguage)=>void}{
 const [language,setCurrentLanguage]=useState<AppLanguage>(getLanguage);
 useEffect(()=>{
  const sync=()=>{const next=getLanguage();setCurrentLanguage(next);document.documentElement.lang=next};
  const syncStorage=(event:StorageEvent)=>{if(event.key!==null&&event.key!==STORAGE_KEY)return;cache=readStored(cache??'ru');sync()};
  document.documentElement.lang=getLanguage();window.addEventListener(CHANGE_EVENT,sync);window.addEventListener('storage',syncStorage);
  return()=>{window.removeEventListener(CHANGE_EVENT,sync);window.removeEventListener('storage',syncStorage)};
 },[]);
 return {language,setLanguage};
}
