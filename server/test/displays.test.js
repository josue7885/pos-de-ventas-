const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('fs'),path=require('path');
for(const kind of ['kitchen','customer']) test(kind+' display keeps ready orders, escapes markup and recovers from connection errors',async()=>{
 const root=path.resolve(__dirname,'../..');
 const dom=new JSDOM(fs.readFileSync(path.join(root,kind+'-display.html'),'utf8'),{url:'http://localhost/'+kind+'-display.html',runScripts:'outside-only'});
 const w=dom.window;let fail=false;const orders=[{id:1,status:'ready',table_number:'Mesa 1',customer_name:'<img src=x onerror=alert(1)>',items:[{name:'<script>oops</script>',qty:1}]}];
 w.apiRequest=async()=>{if(fail)throw Error('Offline');return {orders};};w.alert=()=>{};w.setInterval=()=>0;
 try{
  w.eval(fs.readFileSync(path.join(root,'display.js'),'utf8'));await new Promise(resolve=>setImmediate(resolve));
  const list=w.document.getElementById(kind==='kitchen'?'ready-list':'orders-list');assert.match(list.textContent,/Orden #1/);assert.equal(list.querySelector('img'),null);assert.equal(list.querySelector('script'),null);
  fail=true;await w.refreshDisplay();assert.ok(w.document.contains(list));assert.match(w.document.getElementById(kind==='kitchen'?'quick-stats':'live-status').textContent,/Sin conexión/);
  fail=false;await w.refreshDisplay();assert.match(list.textContent,/Orden #1/);
 }finally{w.close();}
});
