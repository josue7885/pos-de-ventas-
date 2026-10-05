const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-commerce-'));
let child,base,admin,cashier,cook,cashierId,product,service,quote,sale;
const quoteKey=crypto.randomUUID(),receiptKey=crypto.randomUUID(),saleKey=crypto.randomUUID();
async function start(){
 child=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});
 let out='';child.stderr.on('data',d=>{out+=d;});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(out)),10000);child.stdout.on('data',d=>{out+=d;const m=out.match(/listening on port (\d+)/);if(m){base='http://127.0.0.1:'+m[1];clearTimeout(timer);resolve();}});child.once('exit',()=>{clearTimeout(timer);reject(Error(out));});});
}
async function stop(){if(child?.exitCode===null && child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
async function request(route,{token=admin,method='GET',body,key}={}){
 const r=await fetch(base+'/api'+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};
}
async function ok(route,options,status=200){const r=await request(route,options);assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const checkout=()=>({items:[{id:product.id,price:3.33,qty:.333},{id:service.id,price:2.5,qty:1.25}],discountPercent:10,discountReason:'Promoción de apertura',subtotal:3.82,tax:.50,total:4.32,customerName:'Cliente <script>prueba</script>',customerNit:'1234',customerDepartment:'San Miguel',paymentMethod:'tarjeta'});
const receipt=()=>({productId:product.id,expectedStock:1,qty:.5,cost:1.8,tax:.12,supplier:'Proveedor',reference:'COMPRA-001',notes:'Entrada fraccionaria'});
before(async()=>{
 await start();admin=(await ok('/auth/login',{method:'POST',body:{id:1,pin:'729184'}})).token;
 for(const role of ['cajero','cocina']){
  const {user}=await ok('/users',{method:'POST',body:{name:role,role,pin:'654321'}});
  const token=(await ok('/auth/login',{method:'POST',body:{id:user.id,pin:'654321'}})).token;
  if(role==='cajero'){cashier=token;cashierId=user.id;}else cook=token;
 }
});
after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});
test('catalog supports unique SKU, fractional units, services and category validation',async()=>{
 const body={name:'Café por peso',category:'Granel',code:'CAFE-001',unit:'kg',type:'producto',price:3.33,cost:1.2,stock:1,min_stock:.5};
 product=(await ok('/products',{method:'POST',body},201)).product;
 service=(await ok('/products',{method:'POST',body:{...body,name:'Servicio por hora',code:'SERV01',unit:'hora',type:'servicio',price:2.5,cost:.8}},201)).product;
 assert.equal(service.stock,0);
 assert.equal((await request('/products',{method:'POST',body:{...body,code:'cafe-001'}})).status,409);
 assert.equal((await request('/products',{method:'POST',body:{...body,code:'bad',unit:'unidad',stock:1.5}})).status,400);
 await ok('/inventory/categories',{method:'POST',body:{name:'Vacía'}});
 await ok('/inventory/categories/'+encodeURIComponent('Vacía'),{method:'DELETE'});
 assert.equal((await request('/inventory/categories/Granel',{method:'DELETE'})).status,409);
 assert.equal((await request('/inventory/history',{token:cashier})).status,403);
});
test('quotes are durable, replay-safe and never open shifts, charge or consume stock',async()=>{
 quote=(await ok('/quotes',{method:'POST',body:checkout(),key:quoteKey})).quote;
 assert.equal(quote.total,4.32);assert.equal(quote.discount,.42);assert.equal(quote.kind,'quote');assert.equal(quote.customer_department,'San Miguel');
 const replay=await ok('/quotes',{method:'POST',body:checkout(),key:quoteKey});assert.equal(replay.quote.id,quote.id);assert.equal(replay.replayed,true);
 assert.equal((await request('/quotes',{method:'POST',body:{...checkout(),customerName:'changed'},key:quoteKey})).status,409);
 const sync=await ok('/sync');assert.equal(sync.shift.isOpen,false);assert.equal(sync.sales.length,0);assert.equal(sync.products.find(p=>p.id===product.id).stock,1);
 assert.equal((await request('/documents',{token:null})).status,401);assert.equal((await request('/documents',{token:cook})).status,403);
 assert.match((await ok(`/documents/quote/${quote.id}/pdf`)),/^%PDF/);
 assert.equal((await ok(`/documents/quote/${quote.id}/json`)).customer_name,checkout().customerName);
});
test('receiving stock computes weighted cost and journals exactly one purchase and movement',async()=>{
 const result=await ok('/inventory/receive',{method:'POST',body:receipt(),key:receiptKey});
 const again=await ok('/inventory/receive',{method:'POST',body:receipt(),key:receiptKey});assert.equal(again.replayed,true);assert.equal(again.receipt.id,result.receipt.id);
 const sync=await ok('/sync'),p=sync.products.find(p=>p.id===product.id);assert.equal(p.stock,1.5);assert.equal(p.cost,1.4);
 const history=await ok('/inventory/history');assert.equal(history.receipts.length,1);assert.equal(history.movements.filter(m=>m.reason.startsWith('Recepción')).length,1);
 const purchases=(await ok('/purchases')).purchases.filter(p=>p.notes.includes('COMPRA-001'));assert.equal(purchases.length,1);assert.equal(purchases[0].iva,.12);assert.equal(purchases[0].total,1.02);
 assert.equal((await request('/inventory/receive',{method:'POST',body:receipt(),key:crypto.randomUUID()})).status,409);
 assert.equal((await request('/inventory/receive',{token:cashier,method:'POST',body:receipt(),key:crypto.randomUUID()})).status,403);
 const csv=await ok('/inventory/export');assert.match(csv,/CAFE-001/);assert.match(csv,/1.5/);
});
test('discounts and price changes are authorized, fractional totals match and quotes convert once',async()=>{
 await ok('/shifts/open',{method:'POST',body:{openingCash:0}});
 assert.equal((await request('/sales',{token:cashier,method:'POST',body:checkout(),key:crypto.randomUUID()})).status,403);
 const special={...checkout(),items:[{id:service.id,price:2.4,catalogPrice:2.5,priceReason:'Precio de promoción',qty:1.25}],discountPercent:0,subtotal:3,tax:.39,total:3.39};
 assert.equal((await request('/sales',{token:cashier,method:'POST',body:special,key:crypto.randomUUID()})).status,409);
 const specialSale=await ok('/sales',{method:'POST',body:special,key:crypto.randomUUID()});assert.equal(specialSale.sale.items[0].price_reason,'Precio de promoción');assert.equal(specialSale.sale.items[0].catalog_price,2.5);
 assert.equal((await request('/sales',{method:'POST',body:{...checkout(),total:4.31},key:crypto.randomUUID()})).status,409);
 assert.equal((await request('/sales',{method:'POST',body:{...checkout(),items:[{id:product.id,price:3.33,qty:.3334}]},key:crypto.randomUUID()})).status,400);
 sale=(await ok('/sales',{method:'POST',body:{...checkout(),quoteId:quote.id},key:saleKey})).sale;
 assert.equal(sale.total,4.32);assert.equal(sale.discount,.42);assert.equal(sale.items[0].cost,1.4);
 assert.equal((await request('/sales',{method:'POST',body:{...checkout(),quoteId:quote.id},key:crypto.randomUUID()})).status,409);
 const sync=await ok('/sync');assert.equal(sync.products.find(p=>p.id===product.id).stock,1.167);assert.equal(sync.products.find(p=>p.id===service.id).stock,0);
 assert.equal((await ok(`/documents/quote/${quote.id}/json`)).converted_sale_id,sale.id);
 const order=await ok('/orders',{method:'POST',body:{items:[{id:product.id,qty:.333}]}});assert.equal(order.order.total,1.11);
});
test('report exports share filters and historical cost snapshots survive catalog edits and restart',async()=>{
 const report=await ok('/reports/sales?payment=tarjeta&employee=Administrador');assert.equal(report.count,2);assert.equal(report.sales.find(s=>s.id===sale.id).profit,2.35);
 assert.equal((await ok('/reports/sales?payment=efectivo')).count,0);
 const csv=await ok('/reports/sales/export?payment=efectivo');assert.equal(csv.trim().split('\n').length,1);
 assert.equal((await request('/reports/sales/export?payment=fake')).status,400);
 const p=(await ok('/sync')).products.find(p=>p.id===product.id);
 await ok('/products/'+p.id,{method:'PUT',body:{...p,cost:9,expectedStock:p.stock,expectedVersion:p.version}});
 assert.equal((await ok('/reports/sales')).sales.find(s=>s.id===sale.id).profit,2.35);
 await stop();await start();
 assert.equal((await ok('/quotes',{method:'POST',body:checkout(),key:quoteKey})).quote.id,quote.id);
 assert.equal((await ok('/inventory/receive',{method:'POST',body:receipt(),key:receiptKey})).replayed,true);
 assert.equal((await ok('/sales',{method:'POST',body:{...checkout(),quoteId:quote.id},key:saleKey})).sale.id,sale.id);
});
test('deactivated accounts cannot log in or keep sessions and the last active administrator is protected',async()=>{
 await ok('/users/'+cashierId,{method:'PUT',body:{active:false}});
 assert.equal((await request('/sync',{token:cashier})).status,401);
 assert.equal((await request('/auth/login',{method:'POST',body:{id:cashierId,pin:'654321'}})).status,401);
 assert.ok(!(await ok('/users')).users.some(u=>u.id===cashierId));
 assert.equal((await request('/users?includeInactive=1',{token:null})).status,401);
 assert.equal((await ok('/users?includeInactive=1')).users.find(u=>u.id===cashierId).active,0);
 assert.equal((await request('/users/1',{method:'PUT',body:{active:false}})).status,409);
 await ok('/users/'+cashierId,{method:'PUT',body:{active:true}});
 assert.equal((await request('/sync',{token:cashier})).status,401);
 assert.equal((await request('/auth/login',{method:'POST',body:{id:cashierId,pin:'654321'}})).status,200);
});
