const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-api-'));
let child,base,admin,cashier,cook,product,shift,savedSale,key;
const adminPin=String(crypto.randomInt(100000,999999));
async function start(){
 child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:dataDir,POS_ADMIN_PIN:adminPin,PORT:'0'}});
 let output='';child.stderr.on('data',()=>{});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server startup timeout: '+output)),10000);child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/listening on port (\d+)/);if(match){base='http://127.0.0.1:'+match[1];clearTimeout(timeout);resolve();}});child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Startup failed '+code+output));});});
}
async function stop(){if(!child || child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});}
async function request(route,{token,method='GET',body,headers={}}={}){
 const response=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};
}
const auth=async(id,pin)=>request('/api/auth/login',{method:'POST',body:{id,pin}});
function payload(qty=1){const subtotal=Math.round(product.price*100)*qty,tax=Math.round(subtotal*.13);return {items:[{id:product.id,name:'Untrusted name',price:product.price,qty}],paymentMethod:'efectivo',subtotal:subtotal/100,tax:tax/100,total:(subtotal+tax)/100,receivedAmount:100,employeeName:'Forged name'};}
before(start);after(async()=>{await stop();fs.rmSync(dataDir,{recursive:true,force:true});});
test('public bootstrap never exposes secrets; protected API and source files are private',async()=>{
 assert.equal((await request('/api/health')).data.service,'pos-control');
 const settings=(await request('/api/settings')).data.settings;assert.equal(settings.smtp_password,undefined);assert.equal(settings.executive_pin_hash,undefined);
 for(const route of ['/api/sync','/api/customers','/api/orders','/api/reports/sales','/api/invoices/1/pdf'])assert.equal((await request(route)).status,401,route);
 for(const route of ['/server/pos.db','/server/jwt.key','/server/server.js','/.git/config','/package.json'])assert.equal((await request(route)).status,404,route);
 assert.equal((await request('/api/sales',{method:'POST',body:{}})).status,401);
});
test('server rejects wrong PIN and provides HttpOnly cookie; roles enforced',async()=>{
 assert.equal((await auth(1,'000000')).status,401);
 const login=await auth(1,adminPin);assert.equal(login.status,200);admin=login.data.token;assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 for(const [name,role,pin] of [['Caja','cajero','345678'],['Cocina','cocina','456789']]){
  const r=await request('/api/users',{token:admin,method:'POST',body:{name,role,pin}});assert.equal(r.status,200);
  const t=(await auth(r.data.user.id,pin)).data.token;if(role==='cajero')cashier=t;else cook=t;
 }
 assert.equal((await request('/api/products',{token:cashier,method:'POST',body:{name:'x',category:'x',price:1,stock:1}})).status,403);
 assert.equal((await request('/api/sales',{token:cook,method:'POST',body:{}})).status,403);
 assert.equal((await request('/api/reports/sales',{token:cook})).status,403);
 const r=await request('/api/products',{token:admin,method:'POST',body:{name:'Café',category:'Bebidas',price:4.5,stock:6}});assert.equal(r.status,201);product=r.data.product;
});
test('opening shared shift prevents duplicate opening; correct change calculated by server',async()=>{
 const r=await request('/api/shifts/open',{token:cashier,method:'POST',body:{openingCash:10}});assert.equal(r.status,200);shift=r.data.shift;
 assert.equal((await request('/api/shifts/open',{token:admin,method:'POST',body:{openingCash:0}})).status,409);
 key=crypto.randomUUID();const r2=await request('/api/sales',{token:cashier,method:'POST',headers:{'Idempotency-Key':key},body:payload()});assert.equal(r2.status,200,JSON.stringify(r2.data));savedSale=r2.data.sale;
 assert.equal(savedSale.total,5.09);assert.equal(savedSale.change_amount,94.91);assert.equal(savedSale.employee_name,'Caja');assert.equal(savedSale.items[0].name,'Café');
});
test('same sale key is replay-safe, including simultaneous retries',async()=>{
 const results=await Promise.all(Array.from({length:4},()=>request('/api/sales',{token:cashier,method:'POST',headers:{'Idempotency-Key':key},body:payload()})));
 for(const r of results){assert.equal(r.status,200);assert.equal(r.data.sale.id,savedSale.id);assert.equal(r.data.replayed,true);}
 const snapshot=(await request('/api/sync',{token:admin})).data;assert.equal(snapshot.sales.length,1);assert.equal(snapshot.products[0].stock,5);assert.equal(snapshot.shift.currentCash,15.09);
 const changed=await request('/api/sales',{token:cashier,method:'POST',headers:{'Idempotency-Key':key},body:payload(2)});assert.equal(changed.status,409);
});
test('negative quantities, stale prices/totals, insufficient stock and payment never mutate data',async()=>{
 const cases=[{...payload(),items:[{...payload().items[0],qty:-1}]},{...payload(),total:1},{...payload(),items:[{...payload().items[0],price:1}]},payload(20),{...payload(),receivedAmount:0}];
 for(const body of cases){const r=await request('/api/sales',{token:cashier,method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body});assert.ok([400,409].includes(r.status),JSON.stringify(r));}
 const snapshot=(await request('/api/sync',{token:admin})).data;assert.equal(snapshot.sales.length,1);assert.equal(snapshot.products[0].stock,5);
});
test('two registers cannot sell the same last units; stale inventory edit is rejected',async()=>{
 const results=await Promise.all([1,2].map(()=>request('/api/sales',{token:cashier,method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:payload(4)})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await request(`/api/products/${product.id}`,{token:admin,method:'PUT',body:{...product,stock:10,expectedStock:6}})).status,409);
 assert.equal((await request('/api/sync',{token:cashier})).data.products[0].stock,1);
});
test('orders, kitchen statuses, and table state synchronize through API',async()=>{
 const r=await request('/api/orders',{token:cashier,method:'POST',body:{items:[{id:product.id,qty:1}],tableId:1,customerName:'Prueba'}});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal((await request(`/api/orders/${r.data.order.id}/status`,{token:cook,method:'PATCH',body:{status:'ready'}})).status,200);
 const snapshot=(await request('/api/sync',{token:admin})).data;assert.equal(snapshot.orders[0].status,'ready');assert.equal(snapshot.tables[0].status,'pedido');
 assert.equal((await request('/api/orders/99999/status',{token:cook,method:'PATCH',body:{status:'ready'}})).status,404);
});
test('settings redact secrets, executive PIN is verified server-side, and old session revoked',async()=>{
 assert.equal((await request('/api/settings',{token:admin,method:'PUT',body:{smtp_password:'fake-test-secret'}})).status,200);
 assert.ok(!JSON.stringify((await request('/api/settings',{token:admin})).data).includes('fake-test-secret'));
 assert.equal((await request('/api/auth/executive-pin',{token:admin,method:'POST',body:{pin:'567890'}})).status,200);
 assert.equal((await request('/api/settings',{token:admin,method:'PUT',body:{company_name:'Changed'}})).status,403);
 assert.equal((await request('/api/settings',{token:admin,method:'PUT',headers:{'x-exec-pin':'567890'},body:{company_name:'Changed'}})).status,200);
 const users=(await request('/api/users')).data.users;const user=users.find(u=>u.role==='cocina');
 assert.equal((await request(`/api/users/${user.id}`,{token:admin,method:'PUT',headers:{'x-exec-pin':'567890'},body:{pin:'678901'}})).status,200);
 assert.equal((await request('/api/sync',{token:cook})).status,401);
});
test('restart preserves sales, inventory, session and idempotency ledger',async()=>{
 await stop();await start();
 const snapshot=(await request('/api/sync',{token:admin})).data;assert.equal(snapshot.sales.length,2);assert.equal(snapshot.products[0].stock,1);
 const replay=await request('/api/sales',{token:cashier,method:'POST',headers:{'Idempotency-Key':key},body:payload()});assert.equal(replay.status,200);assert.equal(replay.data.sale.id,savedSale.id);
 const pdf=await request(`/api/invoices/${savedSale.id}/pdf`,{token:admin});assert.equal(pdf.status,200);assert.match(pdf.data,/^%PDF/);
});
test('closing shift and logout are authoritative',async()=>{
 assert.equal((await request('/api/shifts/close',{token:cashier,method:'POST',body:{observedCash:35.43,shiftId:shift.id}})).status,200);
 assert.equal((await request('/api/sales',{token:cashier,method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:payload()})).status,409);
 assert.equal((await request('/api/auth/logout',{token:cashier,method:'POST',body:{}})).status,200);
 assert.equal((await request('/api/sync',{token:cashier})).status,401);
});

test('accounting validates amounts, dates and immutable monthly closure',async()=>{
 const purchase={supplier_name:'Prueba',fecha:'2020-02-01',subtotal:10,iva:1.3,total:11.3};
 assert.equal((await request('/api/purchases',{token:admin,method:'POST',body:{...purchase,total:-1}})).status,400);
 assert.equal((await request('/api/purchases',{token:admin,method:'POST',body:{...purchase,fecha:'2020-02-31'}})).status,400);
 assert.equal((await request('/api/purchases',{token:admin,method:'POST',body:purchase})).status,200);
 assert.equal((await request('/api/expenses',{token:admin,method:'POST',body:{description:'Prueba',fecha:'2020-02-01',amount:5,iva:0,total:5}})).status,200);
 const close=await request('/api/admin/close-month',{token:admin,method:'POST',body:{year:2020,month:2}});assert.equal(close.status,200);
 const repeated=await request('/api/admin/close-month',{token:admin,method:'POST',body:{year:2020,month:2}});assert.equal(repeated.data.closure.id,close.data.closure.id);assert.equal(repeated.data.replayed,true);
 assert.equal((await request('/api/purchases',{token:admin,method:'POST',body:purchase})).status,409);
 assert.equal((await request('/api/admin/monthly-summary?month=2020-99',{token:admin})).status,400);
 assert.equal((await request('/api/reports/sales?start=broken',{token:admin})).status,400);
});

test('inventory counts use server stock and adjustments are auditable',async()=>{
 const body={product_id:product.id,fecha:'2020-03-01',expected_qty:1,counted_qty:3,adjustStock:true,notes:'Conteo verificado'};
 assert.equal((await request('/api/inventory/check',{token:admin,method:'POST',body:{...body,expected_qty:9}})).status,409);
 assert.equal((await request('/api/inventory/check',{token:admin,method:'POST',body:{...body,notes:''}})).status,400);
 assert.equal((await request('/api/inventory/check',{token:admin,method:'POST',body})).status,200);
 const snapshot=(await request('/api/sync',{token:admin})).data;assert.equal(snapshot.products[0].stock,3);
 const movements=(await request('/api/inventory/movements',{token:admin})).data.movements;
 assert.equal(movements[0].delta,2);assert.equal(movements[0].user_id,1);assert.ok(movements.some(m=>m.reason==='Venta #'+savedSale.id));
});

test('order terminal states cannot regress; CSV and Excel exports remain valid',async()=>{
 const order=(await request('/api/sync',{token:admin})).data.orders[0];
 assert.equal((await request(`/api/orders/${order.id}/status`,{token:admin,method:'PATCH',body:{status:'served'}})).status,200);
 assert.equal((await request(`/api/orders/${order.id}/status`,{token:admin,method:'PATCH',body:{status:'pending'}})).status,409);
 const csv=await request('/api/reports/sales/export',{token:admin});assert.equal(csv.status,200);assert.match(csv.data,/"Caja"/);
 const xlsx=await request('/api/reports/sales/export?format=xlsx',{token:admin});assert.equal(xlsx.status,200);assert.match(xlsx.data,/^PK/);
 assert.equal((await request(`/api/invoices/${savedSale.id}/email`,{token:admin,method:'POST',body:{customerEmail:'a@example.test,b@example.test'}})).status,400);
});

test('offline backup verifies integrity, refuses live data and restores into a fresh directory',async()=>{
 const {spawnSync}=require('child_process');
 const dest=fs.mkdtempSync(path.join(os.tmpdir(),'pos-backup-test-')),backup=path.join(dest,'copy'),restored=path.join(dest,'restored');
 const script=path.resolve(__dirname,'../../scripts/data-backup.cjs');
 const run=(action,dir)=>spawnSync(process.execPath,[script,action,backup],{env:{...process.env,POS_DATA_DIR:dir},encoding:'utf8'});
 try{
  assert.equal(run('backup',dataDir).status,1);
  await stop();let result=run('backup',dataDir);assert.equal(result.status,0,result.stderr);
  result=run('restore',restored);assert.equal(result.status,0,result.stderr);assert.ok(fs.existsSync(path.join(restored,'pos.db')));
  assert.equal(run('restore',restored).status,1);
  fs.appendFileSync(path.join(backup,'pos.db'),'tamper');assert.equal(run('restore',path.join(dest,'invalid')).status,1);
 }finally{await start();fs.rmSync(dest,{recursive:true,force:true});}
});

test('deleted product identifiers are not reused and fiscal activation cannot be faked through settings',async()=>{
 const create=()=>request('/api/products',{token:admin,method:'POST',body:{name:'Temporal',category:'Prueba',price:1,stock:2}});
 const first=await create();assert.equal(first.status,201);
 assert.equal((await request('/api/products/'+first.data.product.id,{token:admin,method:'DELETE'})).status,200);
 const second=await create();assert.ok(second.data.product.id>first.data.product.id);
 assert.equal((await request('/api/settings',{token:admin,method:'PUT',headers:{'x-exec-pin':'567890'},body:{business_active:true}})).status,501);
});
