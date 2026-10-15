const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {JSDOM}=require('jsdom');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-shift-reports-'));
let server,base,admin,cashier,cook,accountant,shift,product,customer,creditSale,x,y,z;
async function start(){server=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});let out='';server.stderr.on('data',d=>out+=d);base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(out)),10000);server.stdout.on('data',d=>{out+=d;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});server.once('exit',()=>{clearTimeout(timer);reject(Error(out));});});}
async function stop(){if(server?.exitCode===null&&server.signalCode===null)await new Promise(r=>{server.once('exit',r);server.kill();});}
async function request(route,{token=admin,business='principal',method='GET',body,key}={}){const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json','X-POS-Business':business,...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});const buffer=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(buffer);}catch{data=buffer.toString();}return {status:r.status,data,buffer};}
async function ok(route,options,status=200){const r=await request(route,options);assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const write=(body,key=crypto.randomUUID(),extra={})=>({method:'POST',body,key,...extra});

const report=(type,observedCash,key=crypto.randomUUID(),extra={})=>ok('/shifts/reports',write({type,shiftId:shift.id,observedCash,note:'Arqueo <script>prueba</script>'},key,extra));
const sale=(method)=>write({items:[{id:product.id,price:113,qty:1}],subtotal:100,tax:13,total:113,paymentMethod:method,receivedAmount:150,customerId:customer.id,creditDueDate:new Date().toISOString().slice(0,10)});
before(async()=>{
 await start();admin=(await ok('/auth/login',write({id:1,pin:'729184'}))).token;
 for(const [name,role] of [['Cajero','cajero'],['Cocina','cocina'],['Contador','contador']]){const u=(await ok('/users',write({name,role,pin:'654321'}))).user;const token=(await ok('/auth/login',write({id:u.id,pin:'654321'}))).token;if(role==='cajero')cashier=token;else if(role==='cocina')cook=token;else accountant=token;}
 await ok('/settings',{method:'PUT',body:{payment_methods:['efectivo','tarjeta','transferencia','credito']}});
 customer=(await ok('/customers',write({full_name:'Cliente de prueba'}))).customer;
 product=(await ok('/products',write({name:'Artículo',category:'Pruebas',price:113,stock:30}),201)).product;
 shift=(await ok('/shifts/open',write({openingCash:100}))).shift;
 let cashSale;
 for(const method of ['efectivo','tarjeta','transferencia','credito']){const r=await ok('/sales',sale(method));if(method==='credito')creditSale=r.sale;else if(method==='efectivo')cashSale=r.sale;}
 for(const [paymentMethod,amount] of [['efectivo',20],['tarjeta',30],['transferencia',40]])await ok('/credit-payments',write({saleId:creditSale.id,paymentMethod,amount}));
 await ok('/credit-notes',write({saleId:cashSale.id,amount:13,reason:'Devolución parcial',refundMethod:'efectivo'}));
});
after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});
test('X snapshots separate tender, change, credit collections and refunds without closing',async()=>{
 x=(await report('X')).report;assert.equal(x.expectedCents,22000);assert.equal(x.observedCents,null);assert.equal(x.differenceCents,null);assert.equal(x.salesCents,45200);assert.equal(x.sales.length,4);
 assert.deepEqual(x.rows.map(r=>r.netCents),[12000,14300,15300,0]);assert.equal((await ok('/sync')).shift.isOpen,true);
 assert.equal((await ok('/sync')).shift.currentCash,220);
});
test('Y records shortages, overages and exact counts without resetting totals; retries preserve the snapshot',async()=>{
 const key=crypto.randomUUID();const results=await Promise.all([report('Y',215,key),report('Y',215,key)]);y=results[0].report;assert.equal(results[1].report.id,y.id);assert.equal(y.differenceCents,-500);
 assert.equal((await report('Y',225)).report.differenceCents,500);assert.equal((await report('Y',220)).report.differenceCents,0);
 assert.equal((await ok('/sync')).shift.currentCash,220);assert.equal((await ok('/sync')).shift.isOpen,true);
 assert.equal((await request('/shifts/reports',write({type:'Y',shiftId:shift.id,observedCash:216},key))).status,409);
});
test('invalid counts, unauthenticated users and operational roles cannot issue or read cuts',async()=>{
 for(const observedCash of [null,true,false,'',-1,'abc',1.001,1000001])assert.equal((await request('/shifts/reports',write({type:'Z',shiftId:shift.id,observedCash}))).status,400);
 assert.equal((await request('/shifts/reports',write({type:'Q',shiftId:shift.id}))).status,400);
 assert.equal((await request('/shifts/reports',write({type:'X',shiftId:shift.id},undefined,{token:cook}))).status,403);
 for(const route of ['/shifts/reports',`/shifts/reports/${x.id}/pdf`,`/shifts/reports/${x.id}/json`]){assert.equal((await request(route,{token:cook})).status,403);assert.equal((await request(route,{token:null})).status,401);assert.equal((await request(route,{token:accountant})).status,200);}
 assert.equal((await request('/shifts/reports',write({type:'X',shiftId:shift.id},undefined,{token:accountant}))).status,403);
 assert.equal((await ok('/sync')).shift.isOpen,true);
});
test('Z closes atomically, replays a lost response once and survives restart and issuer edits',async()=>{
 const key=crypto.randomUUID(),results=await Promise.all([report('Z',215,key,{token:cashier}),report('Z',215,key,{token:cashier})]);z=results[0].report;assert.equal(results[1].report.id,z.id);assert.equal(z.differenceCents,-500);assert.equal((await ok('/sync')).shift.isOpen,false);assert.equal((await ok('/sync')).shift.difference,-5);
 assert.equal((await request('/sales',sale('efectivo'))).status,409);
 assert.equal((await request('/shifts/reports',write({type:'Y',shiftId:shift.id,observedCash:220}))).status,409);
 assert.equal((await request('/shifts/close',write({shiftId:shift.id,observedCash:220}))).status,409);
 await ok('/settings',{method:'PUT',body:{company_name:'Empresa nueva'}});await stop();await start();
 assert.deepEqual((await report('Z',215,key,{token:cashier})).report,z);assert.deepEqual(await ok(`/shifts/reports/${x.id}/json`),x);
 assert.equal((await ok('/shifts/reports')).reports.filter(r=>r.type==='Z').length,1);
});
test('saved documents render PDF and escaped print HTML; next shift and other businesses stay separate',async()=>{
 const pdf=await request(`/shifts/reports/${z.id}/pdf`);assert.equal(pdf.status,200);assert.match(pdf.data,/^%PDF/);
 const dom=new JSDOM(await ok(`/shifts/reports/${z.id}/html`));assert.equal(dom.window.document.querySelectorAll('script').length,0);assert.match(dom.window.document.body.textContent,/Faltante/);assert.match(dom.window.document.body.textContent,/Transferencia/);assert.match(dom.window.document.body.textContent,/Arqueo <script>/);dom.window.close();
 if(process.env.POS_PDF_REVIEW_DIR){fs.mkdirSync(process.env.POS_PDF_REVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.POS_PDF_REVIEW_DIR,'corte-z.pdf'),pdf.buffer);}
 const next=(await ok('/shifts/open',write({openingCash:50}))).shift;
 const nextZ=(await ok('/shifts/close',write({shiftId:next.id,observedCash:50}))).report;assert.equal(nextZ.sales.length,0);assert.equal(nextZ.differenceCents,0);assert.equal(nextZ.expectedCents,5000);
 const created=await ok('/platform/businesses',write({name:'Otro negocio',businessType:'retail',currencyCode:'USD',adminName:'Dueño',adminPin:'987654'}),201),business=created.business.id;
 const token=(await ok('/auth/login',{business,method:'POST',body:{id:1,pin:'987654'},token:null})).token;
 assert.equal((await ok('/shifts/reports',{business,token})).reports.length,0);assert.equal((await request(`/shifts/reports/${z.id}/json`,{business,token})).status,404);
});
