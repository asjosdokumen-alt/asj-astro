import { chromium } from 'playwright';
import { ensureServer, stopServer } from '../e2e/lib/server.mjs';
const BASE='http://localhost:4321';
await ensureServer();
const b=await chromium.launch({args:['--no-proxy-server']});
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.addInitScript(()=>{try{localStorage.setItem('asjTheme','dark');localStorage.setItem('asj_auth',JSON.stringify({sessionToken:'x',refreshToken:'',isLoggedIn:true,role:'admin',wa:'081234567890',name:'P',lastChecked:Date.now()}))}catch{}});
const p=await ctx.newPage();
await p.route('**/.netlify/functions/**',(r)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,sessionInvalid:false,candidates:[],schedules:[],messages:[],waTemplates:[]})}));
await p.goto(BASE+'/admin#config',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(2000);
const out=await p.evaluate(()=>{
  const rows=[];
  for(const el of document.querySelectorAll('*')){
    const cs=getComputedStyle(el);
    const o=parseFloat(cs.opacity);
    if(o>0&&o<1){
      let text='';for(const n of el.childNodes)if(n.nodeType===3)text+=n.textContent;
      text=text.replace(/\s+/g,' ').trim();
      if(!text)continue;
      rows.push({tag:el.tagName.toLowerCase(),cls:(el.getAttribute('class')||'').slice(0,60),opacity:o,text:text.slice(0,25)});
    }
  }
  return rows;
});
console.log('elements with 0<opacity<1 carrying text:',out.length);
for(const r of out.slice(0,12))console.log(' ',r.opacity,r.tag,r.cls,'|',r.text);
await b.close();await stopServer();process.exit(0);
