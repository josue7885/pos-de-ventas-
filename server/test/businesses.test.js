const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-businesses-'));
let directory=rootDir,child,base,admin,a,b,tokenA,tokenB;

async function start(){
 child=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:directory,POS_ADMIN_PIN:'729184',PORT:'0'}});
 let output='';child.stderr.on('data',d=>{output+=d;});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Startup timeout: '+output)),15000);
  child.stdout.on('data',d=>{output+=d;const match=output.match(/listening on port (\d+)/);if(match){base='http://127.0.0.1:'+match[1];clearTimeout(timer);resolve();}});
  child.once('exit',()=>{clearTimeout(timer);reject(Error(output));});
 });
}
async function stop(signal='SIGTERM'){
 if(child?.exitCode===null && child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill(signal);});
}
async function request(route,{business='principal',token=admin,method='GET',body,key,cookie}={}){
 const response=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json','X-POS-Business':business,...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data,headers:response.headers};
}
async function ok(route,options,status=200){const r=await request(route,options);assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const login=(business,pin)=>request('/auth/login',{business,token:null,method:'POST',body:{id:1,pin}});
const sale=(price,tax,extra={})=>({items:[{id:1,price,qty:1}],paymentMethod:'efectivo',subtotal:price,tax,total:Math.round((price+tax)*100)/100,receivedAmount:30,...extra});

before(async()=>{
 // Upgrade an actual legacy database; the primary business must keep its accounts and stock.
 const SQL=await require('sql.js')(),legacy=new SQL.Database();
 legacy.run("CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,role TEXT,pin TEXT); INSERT INTO users VALUES(1,'Administrador','admin','729184'); CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,category TEXT,price REAL,stock INTEGER); INSERT INTO products VALUES(7,'Producto anterior','Tienda',1,7); CREATE TABLE app_settings(id INTEGER PRIMARY KEY,key TEXT UNIQUE,value TEXT); INSERT INTO app_settings(key,value) VALUES('company_name','Mi tienda anterior');");
 fs.writeFileSync(path.join(rootDir,'pos.db'),Buffer.from(legacy.export()));legacy.close();
 await start();const result=await login('principal','729184');assert.equal(result.status,200);admin=result.data.token;
});
after(async()=>{await stop();fs.rmSync(rootDir,{recursive:true,force:true});});

test('legacy migration preserves the primary business and rejects invalid business paths',async()=>{
 const snapshot=await ok('/sync');assert.equal(snapshot.businessId,'principal');assert.equal(snapshot.products[0].id,7);assert.equal(snapshot.products[0].stock,7);assert.equal(snapshot.settings.company_name,'Mi tienda anterior');
 assert.equal((await ok('/businesses',{token:null})).businesses.length,1);
 assert.equal((await request('/sync',{business:'../../escape'})).status,400);
});

test('business creation is concurrent-retry safe and restricted to the primary administrator',async()=>{
 const key=crypto.randomUUID(),body={name:'Tienda Uno',adminPin:'654321',business_type:'retail',currency_code:'GTQ'};
 const results=await Promise.all([1,2].map(()=>request('/platform/businesses',{method:'POST',body,key})));
 for(const result of results)assert.ok([200,201].includes(result.status),JSON.stringify(result.data));
 a=results[0].data.business.id;assert.equal(results[1].data.business.id,a);
 assert.equal((await request('/platform/businesses',{method:'POST',body:{...body,name:'Otra'},key})).status,409);
 assert.equal((await ok('/platform/businesses/requests/'+key)).business.id,a);
 b=(await ok('/platform/businesses',{method:'POST',key:crypto.randomUUID(),body:{name:'Servicios Dos',adminPin:'734819',business_type:'services',currency_code:'EUR'}},201)).business.id;
 const first=await login(a,'654321'),second=await login(b,'734819');assert.equal(first.status,200);assert.equal(second.status,200);tokenA=first.data.token;tokenB=second.data.token;
 assert.equal((await ok('/sync',{business:a,token:tokenA})).products.length,0);
 assert.equal((await request('/platform/businesses',{business:a,token:tokenA})).status,403);
 assert.equal((await request('/platform/businesses',{business:a,token:tokenA,method:'POST',body,key:crypto.randomUUID()})).status,403);
 assert.ok(fs.existsSync(path.join(rootDir,'businesses',a,'pos.db')));
});

test('tokens, cookies, customers, inventory, sales and request keys stay inside their business',async()=>{
 for(const [business,token] of [[a,tokenB],[b,tokenA],['principal',tokenA],[a,admin]])assert.equal((await request('/sync',{business,token})).status,401);
 const session=await login(a,'654321'),cookie=session.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('pos_session_'+a+'='));
 assert.equal((await request('/sync',{business:b,token:null,cookie})).status,401);assert.equal((await request('/sync',{business:a,token:null,cookie})).status,200);
 const create=(business,token,price)=>ok('/products',{business,token,method:'POST',body:{name:'Producto propio',category:'Categoría propia',code:'SAME',price,stock:10}},201);
 const first=await create(a,tokenA,10),second=await create(b,tokenB,20);assert.equal(first.product.id,1);assert.equal(second.product.id,1);assert.equal(second.product.type,'servicio');assert.equal(second.product.stock,0);
 await ok('/customers',{business:a,token:tokenA,method:'POST',body:{full_name:'Cliente exclusivo A',email:'cliente-a@example.test'}});
 assert.equal((await ok('/customers',{business:b,token:tokenB})).customers.length,0);
 assert.equal((await request('/customers/1',{business:b,token:tokenB})).status,404);
 for(const [business,token] of [[a,tokenA],[b,tokenB]])await ok('/shifts/open',{business,token,method:'POST',body:{openingCash:0}});
 const key=crypto.randomUUID();await Promise.all([[a,tokenA,10,1.3],[b,tokenB,20,2.6]].map(([business,token,price,tax])=>ok('/sales',{business,token,method:'POST',body:sale(price,tax),key})));
 await Promise.all(Array.from({length:20},async(_,i)=>{const isA=i%2===0,doc=await ok('/documents/sale/1/json',{business:isA?a:b,token:isA?tokenA:tokenB});assert.equal(doc.total,isA?11.3:22.6);}));
 assert.equal((await ok('/sync')).products[0].stock,7);assert.equal((await ok('/sync',{business:a,token:tokenA})).products[0].stock,9);
});

test('configuration controls payments, taxes and modules without changing other businesses or historical currency',async()=>{
 const context={business:a,token:tokenA},user=(await ok('/users',{...context,method:'POST',body:{name:'Cajero A',role:'cajero',pin:'876543'}})).user;
 const cashier=(await ok('/auth/login',{business:a,token:null,method:'POST',body:{id:user.id,pin:'876543'}})).token;
 assert.equal((await request('/settings',{business:a,token:cashier,method:'PUT',body:{tax_label:'No permitido'}})).status,403);
 await ok('/settings',{...context,method:'PUT',body:{iva_rate:.05,tax_label:'Impuesto A',quote_validity_days:7,payment_methods:['tarjeta'],quotes_enabled:false,receipt_footer:'Gracias A'}});
 assert.equal((await request('/settings',{...context,method:'PUT',body:{currency_code:'USD'}})).status,409);
 assert.equal((await request('/settings',{...context,method:'PUT',body:{payment_methods:[]}})).status,400);
 assert.equal((await request('/quotes',{...context,method:'POST',body:sale(10,.5),key:crypto.randomUUID()})).status,403);
 assert.equal((await request('/orders',context)).status,403);
 assert.equal((await request('/inventory/receive',{business:b,token:tokenB,method:'POST',body:{},key:crypto.randomUUID()})).status,403);
 assert.equal((await request('/sales',{...context,method:'POST',body:sale(10,.5),key:crypto.randomUUID()})).status,400);
 await ok('/sales',{...context,method:'POST',body:sale(10,.5,{paymentMethod:'tarjeta'}),key:crypto.randomUUID()});
 const own=(await ok('/sync',context)).settings,other=(await ok('/sync',{business:b,token:tokenB})).settings;
 assert.equal(own.tax_label,'Impuesto A');assert.equal(own.currency_code,'GTQ');assert.deepEqual(own.payment_methods,['tarjeta']);assert.equal(other.iva_rate,.13);assert.equal(other.currency_code,'EUR');assert.equal(other.quotes_enabled,true);
 await ok('/settings',{business:b,token:tokenB,method:'PUT',body:{quote_validity_days:7}});
 const quoteKey=crypto.randomUUID(),quoteRequest={business:b,token:tokenB,method:'POST',body:sale(20,2.6),key:quoteKey};
 const quote=(await ok('/quotes',quoteRequest)).quote;
 assert.equal(quote.currency_code,'EUR');assert.equal(Date.parse(quote.valid_until)-Date.parse(quote.created_at),7*86400000);
 await ok('/settings',{business:b,token:tokenB,method:'PUT',body:{quotes_enabled:false}});
 assert.equal((await ok('/quotes',quoteRequest)).replayed,true);
 assert.equal((await request('/quotes',{...quoteRequest,key:crypto.randomUUID()})).status,403);
 const csv=await ok('/reports/sales/export',context);assert.match(csv,/"Tienda Uno","GTQ"/);assert.ok(!csv.includes('Servicios Dos'));
 assert.match(await ok('/documents/quote/'+quote.id+'/pdf',{business:b,token:tokenB}),/^%PDF/);
});

test('deactivating a business blocks existing sessions and login while preserving its data',async()=>{
 await ok('/platform/businesses/'+b,{method:'PATCH',body:{active:false}});
 assert.equal((await request('/sync',{business:b,token:tokenB})).status,404);assert.equal((await login(b,'734819')).status,404);
 assert.ok(!(await ok('/businesses',{token:null})).businesses.some(x=>x.id===b));
 assert.equal((await request('/platform/businesses/principal',{method:'PATCH',body:{active:false}})).status,409);
 await ok('/platform/businesses/'+b,{method:'PATCH',body:{active:true}});
 assert.equal((await ok('/sync',{business:b,token:tokenB})).sales.length,1);
});

test('offline backup restores all businesses, revokes their sessions and rejects corruption before writing',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'pos-business-backup-')),backup=path.join(parent,'copy'),restored=path.join(parent,'restored');
 const script=path.resolve(__dirname,'../../scripts/data-backup.cjs');
 const run=(action,dir)=>spawnSync(process.execPath,[script,action,backup],{env:{...process.env,POS_DATA_DIR:dir},encoding:'utf8'});
 try{
  assert.equal(run('backup',rootDir).status,1);
  await stop('SIGKILL');assert.ok(fs.existsSync(path.join(rootDir,'pos.lock')));
  let result=run('backup',rootDir);assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(backup,'backup.json'))).files.length,3);
  result=run('restore',restored);assert.equal(result.status,0,result.stderr);
  directory=restored;await start();assert.equal((await request('/sync',{business:a,token:tokenA})).status,401);
  const restoredA=await login(a,'654321'),restoredB=await login(b,'734819');assert.equal(restoredA.status,200);assert.equal(restoredB.status,200);
  assert.equal((await ok('/sync',{business:a,token:restoredA.data.token})).sales.length,2);assert.equal((await ok('/sync',{business:b,token:restoredB.data.token})).sales.length,1);
  fs.appendFileSync(path.join(backup,'businesses',a,'pos.db'),'tampered');
  const invalid=path.join(parent,'invalid');assert.equal(run('restore',invalid).status,1);assert.equal(fs.existsSync(path.join(invalid,'pos.db')),false);
 }finally{await stop();directory=rootDir;fs.rmSync(parent,{recursive:true,force:true});}
});
