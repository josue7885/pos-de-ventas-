const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),net=require('node:net');
const {spawn}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pos-relay-'));
let source,receiver,proxy,proxyBase,device,firstEnvelope,cook,cashier,smtp,smtpPort;
let dropReply=true,recorded=0;
const messages=[],sockets=new Set();
async function start(name){
 const child=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:path.join(root,name),POS_ADMIN_PIN:'729184',PORT:'0'}});let logs='';child.stderr.on('data',d=>logs+=d);
 const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(logs)),12000);child.stdout.on('data',d=>{logs+=d;const m=logs.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.once('exit',()=>{clearTimeout(timer);reject(Error(logs));});});
 const app={child,base};app.token=(await ok(app,'/auth/login',{method:'POST',body:{id:1,pin:'729184'},token:null})).token;return app;
}
async function stop(app){if(app?.child.exitCode===null&&app.child.signalCode===null)await new Promise(r=>{app.child.once('exit',r);app.child.kill();});}
async function request(app,route,{method='GET',token=app.token,body,headers={}}={}){const r=await fetch(app.base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const buffer=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(buffer);}catch{data=buffer.toString();}return {status:r.status,data,buffer};}
async function ok(app,route,options={},status=200){const r=await request(app,route,options);assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const write=body=>({method:'POST',body,headers:{'Idempotency-Key':crypto.randomUUID()}});
before(async()=>{
 source=await start('source');receiver=await start('receiver');
 proxy=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const response=await fetch(receiver.base+req.url,{method:req.method,headers:{'Content-Type':'application/json','X-POS-Relay-Key':req.headers['x-pos-relay-key']||'','X-POS-Business':req.headers['x-pos-business']||'principal'},body});const data=await response.text();if(req.url.endsWith('/receive')){recorded++;firstEnvelope ||= JSON.parse(body);if(dropReply){dropReply=false;res.destroy();return;}}res.writeHead(response.status,{'Content-Type':'application/json'});res.end(data);}catch{res.destroy();}});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));proxyBase='http://127.0.0.1:'+proxy.address().port;
 device=await ok(receiver,'/document-relay/devices',write({name:'Teléfono de prueba'}));
 for(const [name,role] of [['Cocina','cocina'],['Cajero','cajero']]){const u=(await ok(source,'/users',write({name,role,pin:'654321'}))).user;const token=(await ok(source,'/auth/login',write({id:u.id,pin:'654321'}))).token;if(role==='cocina')cook=token;else cashier=token;}
 await ok(source,'/settings',{method:'PUT',body:{payment_methods:['efectivo','tarjeta','transferencia','credito']}});
 const customer=(await ok(source,'/customers',write({full_name:'Cliente de prueba'}))).customer;
 const product=(await ok(source,'/products',write({name:'Producto de teléfono',category:'Prueba',price:11.3,stock:10}),201)).product;
 const shift=(await ok(source,'/shifts/open',write({openingCash:100}))).shift;
 const sale={items:[{id:product.id,price:11.3,qty:1}],subtotal:10,tax:1.3,total:11.3,paymentMethod:'efectivo',receivedAmount:20,customerId:customer.id};
 const paid=(await ok(source,'/sales',write(sale))).sale;
 const credit=(await ok(source,'/sales',write({...sale,paymentMethod:'credito',creditDueDate:new Date().toISOString().slice(0,10)}))).sale;
 await ok(source,'/credit-payments',write({saleId:credit.id,amount:2,paymentMethod:'efectivo'}));
 await ok(source,'/credit-notes',write({saleId:paid.id,amount:1,reason:'Prueba de devolución',refundMethod:'efectivo'}));
 await ok(source,'/quotes',write({...sale,validUntil:new Date(Date.now()+86400000).toISOString().slice(0,10)}));
 await ok(source,'/shifts/close',write({shiftId:shift.id,observedCash:112.3}));
 await ok(source,'/document-relay/configuration',{method:'PUT',body:{url:proxyBase,business:'principal',token:device.token,autoSend:false}});
 smtp=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.write('220 localhost test\r\n');let pending='',mode=false,lines=[];socket.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+2);if(mode){if(line==='.'){messages.push(lines.join('\r\n'));lines=[];mode=false;socket.write('250 local\r\n');}else lines.push(line);continue;}if(/^EHLO|^HELO/.test(line))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');else if(/^AUTH/.test(line))socket.write('235 OK\r\n');else if(line==='DATA'){mode=true;socket.write('354 go\r\n');}else if(line==='QUIT')socket.end('221 bye\r\n');else socket.write('250 OK\r\n');}});});await new Promise(r=>smtp.listen(0,'127.0.0.1',r));smtpPort=smtp.address().port;
});
after(async()=>{await stop(source);await stop(receiver);if(proxy)await new Promise(r=>proxy.close(r));for(const socket of sockets)socket.destroy();if(smtp)await new Promise(r=>smtp.close(r));fs.rmSync(root,{recursive:true,force:true});});
test('only administrators pair destinations; scoped receiving keys never authorize normal POS APIs',async()=>{
 assert.equal((await request(source,'/document-relay/configuration',{method:'PUT',token:cashier,body:{url:proxyBase,business:'principal',token:device.token,autoSend:false}})).status,403);
 assert.equal((await request(source,'/document-relay/status',{token:cook})).status,403);
 assert.equal((await request(receiver,'/document-relay/ping',write({}))).status,401);
 assert.equal((await request(receiver,'/sync',{token:device.token})).status,401);
 const status=await ok(source,'/document-relay/status');assert.ok(!JSON.stringify(status).includes(device.token));
 assert.equal((await ok(source,'/document-relay/test',write({}))).service,'pos-document-relay');
 for(const url of ['http://example.com','file:///etc/passwd','https://user:secret@example.com','https://example.com/path','https://example.com?key=x'])assert.equal((await request(source,'/document-relay/configuration',{method:'PUT',body:{url,business:'principal',token:device.token,autoSend:false}})).status,400);
});
test('lost receive response keeps durable queue; retry after restart delivers all document types once',async()=>{
 const result=await ok(source,'/document-relay/send',write({}));assert.equal(result.sent,0);assert.equal(result.remaining,6);assert.ok(result.error);assert.equal((await ok(receiver,'/document-relay/status')).inbox.length,1);
 await stop(source);source=await start('source');await stop(receiver);receiver=await start('receiver');
 const results=await Promise.all([ok(source,'/document-relay/send',write({})),ok(source,'/document-relay/send',write({}))]);assert.ok(results.some(r=>r.sent===6));
 const sent=await ok(source,'/document-relay/status'),received=await ok(receiver,'/document-relay/status');assert.equal(sent.outbox.length,6);assert.equal(sent.outbox.filter(r=>r.status==='sent').length,6);assert.equal(received.inbox.length,6);assert.equal(new Set(received.inbox.map(r=>r.kind)).size,5);assert.equal(messages.length,0);
 assert.equal((await ok(source,'/document-relay/send',write({}))).sent,0);
 const state=await ok(receiver,'/sync');assert.equal(state.sales.length,0);assert.equal(state.products.length,0);assert.equal(state.shift.isOpen,false);
 assert.equal((await ok(source,'/sync')).products[0].stock,8);assert.equal((await ok(source,'/credit-accounts')).accounts[0].balance,9.3);
});
test('receiver rejects tampered replay and preserves exact PDF/JSON while key revocation stops reception',async()=>{
 const options=body=>({method:'POST',body,token:null,headers:{'X-POS-Relay-Key':device.token}});
 assert.equal((await request(receiver,'/document-relay/receive',options({...firstEnvelope,snapshot:{...firstEnvelope.snapshot,number:'altered'}}))).status,409);
 const response=await ok(receiver,'/document-relay/receive',options(firstEnvelope));assert.equal(response.replayed,true);
 const pdf=await request(receiver,`/document-relay/inbox/${response.id}/pdf`);assert.equal(pdf.status,200);assert.deepEqual(pdf.buffer,Buffer.from(firstEnvelope.pdf,'base64'));assert.deepEqual(await ok(receiver,`/document-relay/inbox/${response.id}/json`),firstEnvelope.snapshot);
 assert.equal((await request(receiver,'/document-relay/receive',options({...firstEnvelope,pdf:Buffer.from('bad').toString('base64')}))).status,400);
 await ok(receiver,'/document-relay/devices/'+device.id,{method:'DELETE'});
 assert.equal((await request(receiver,'/document-relay/receive',options(firstEnvelope))).status,401);assert.equal((await ok(receiver,'/document-relay/status')).inbox.length,6);
});
test('copies can email matching PDF/JSON through local SMTP once; businesses stay isolated',async()=>{
 await ok(receiver,'/settings',{method:'PUT',body:{invoice_email_enabled:true,smtp_host:'127.0.0.1',smtp_port:smtpPort,smtp_secure:false,smtp_user:'test@example.test',smtp_password:'test-secret',smtp_from:'test@example.test'}});
 const row=(await ok(receiver,'/document-relay/status')).inbox.find(r=>r.kind==='sale');
 await ok(receiver,`/document-relay/inbox/${row.id}/email`,write({recipient:'recipient@example.test'}));assert.equal(messages.length,1);
 assert.equal((await ok(receiver,`/document-relay/inbox/${row.id}/email`,write({recipient:'recipient@example.test'}))).replayed,true);assert.equal(messages.length,1);assert.match(messages[0],/application\/pdf/);assert.match(messages[0],/application\/json/);
 const business=(await ok(receiver,'/platform/businesses',write({name:'Otro negocio',business_type:'retail',adminName:'Admin',adminPin:'987654'}),201)).business.id;
 const headers={'X-POS-Business':business},token=(await ok(receiver,'/auth/login',{...write({id:1,pin:'987654'}),headers,token:null})).token;
 assert.equal((await ok(receiver,'/document-relay/status',{headers,token})).inbox.length,0);
 assert.equal((await request(receiver,`/document-relay/inbox/${row.id}/pdf`,{headers,token})).status,404);
});
