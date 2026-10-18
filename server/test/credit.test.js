const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {spawn}=require('node:child_process');
const {JSDOM}=require('jsdom');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-credit-'));
let server,base,admin,cashier,cook,customer,product,sale,note,payment,smtp,port;
const messages=[],sockets=new Set(),date=new Date().toISOString().slice(0,10),payKey=crypto.randomUUID(),noteKey=crypto.randomUUID();
async function start(){server=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});let out='';server.stderr.on('data',d=>out+=d);base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(out)),10000);server.stdout.on('data',d=>{out+=d;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});server.once('exit',()=>{clearTimeout(timer);reject(Error(out));});});}
async function stop(){if(server?.exitCode===null&&server.signalCode===null)await new Promise(r=>{server.once('exit',r);server.kill();});}
async function request(route,{token=admin,business='principal',method='GET',body,key}={}){const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json','X-POS-Business':business,...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});const buffer=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(buffer);}catch{data=buffer.toString();}return {status:r.status,data,buffer};}
async function ok(route,options,status=200){const r=await request(route,options);assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const write=(body,key=crypto.randomUUID(),extra={})=>({method:'POST',body,key,...extra});
const creditSale=()=>({items:[{id:product.id,price:113,qty:1}],subtotal:100,tax:13,total:113,paymentMethod:'credito',customerId:customer.id,customerName:'Should use registered name',customerNit:'123456789',documentType:'credito_fiscal',creditDueDate:date});
const payBody=()=>({saleId:sale.id,amount:20,paymentMethod:'efectivo',reference:'Primer abono'});
const noteBody=()=>({saleId:sale.id,amount:30,reason:'Ajuste <script>alert(1)</script>',refundMethod:'efectivo'});
before(async()=>{
 smtp=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.write('220 localhost test\r\n');let pending='',mode=false,lines=[];socket.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+2);if(mode){if(line==='.'){messages.push(lines.join('\r\n'));lines=[];mode=false;socket.write('250 local\r\n');}else lines.push(line);continue;}if(/^EHLO|^HELO/.test(line))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');else if(/^AUTH/.test(line))socket.write('235 OK\r\n');else if(line==='DATA'){mode=true;socket.write('354 go\r\n');}else if(line==='QUIT')socket.end('221 bye\r\n');else socket.write('250 OK\r\n');}});});await new Promise(r=>smtp.listen(0,'127.0.0.1',r));port=smtp.address().port;
 await start();admin=(await ok('/auth/login',write({id:1,pin:'729184'}))).token;
 for(const role of ['cajero','cocina']){const {user}=await ok('/users',write({name:role,role,pin:'654321'}));const t=(await ok('/auth/login',write({id:user.id,pin:'654321'}))).token;if(role==='cajero')cashier=t;else cook=t;}
 customer=(await ok('/customers',write({full_name:'Cliente crédito',nit:'123456789',email:'credito@example.test',phone:'50370000000',document_type:'credito_fiscal'}))).customer;
 product=(await ok('/products',write({name:'Artículo con IVA',category:'Prueba',price:113,stock:20}),201)).product;
 await ok('/shifts/open',write({openingCash:100}));
});
after(async()=>{await stop();for(const s of sockets)s.destroy();await new Promise(r=>smtp.close(r));fs.rmSync(dir,{recursive:true,force:true});});
test('credit checkout requires enabled payment, registered customer and valid due date; does not collect cash',async()=>{
 assert.equal((await request('/sales',write(creditSale()))).status,400);
 await ok('/settings',{method:'PUT',body:{payment_methods:['efectivo','tarjeta','transferencia','credito']}});
 assert.equal((await request('/sales',write({...creditSale(),paymentMethod:'tarjeta',customerName:''}))).status,400);
 for(const patch of [{customerId:null},{customerId:999},{creditDueDate:'2026-02-30'},{creditDueDate:'2000-01-01'}])assert.equal((await request('/sales',write({...creditSale(),...patch}))).status,400);
 sale=(await ok('/sales',write(creditSale()))).sale;assert.equal(sale.received_amount,0);assert.equal(sale.change_amount,0);assert.equal(sale.customer_name,'Cliente crédito');
 const sync=await ok('/sync');assert.equal(sync.shift.currentCash,100);assert.equal(sync.products[0].stock,19);
 const doc=await ok(`/documents/sale/${sale.id}/json`);assert.equal(doc.initial_balance,113);assert.equal(doc.credit_due_date,date);assert.equal(doc.document_type,'credito_fiscal');
 assert.equal((await ok('/credit-accounts')).accounts[0].balance,113);
});
test('payments are durable, concurrent-retry safe and included once in the open shift',async()=>{
 const results=await Promise.all([ok('/credit-payments',write(payBody(),payKey,{token:cashier})),ok('/credit-payments',write(payBody(),payKey,{token:cashier}))]);payment=results[0].document;
 assert.equal(results[1].document.id,payment.id);assert.equal(payment.balance_after,93);assert.equal(payment.kind,'credit_payment');
 assert.equal((await ok('/credit-accounts')).accounts[0].balance,93);assert.equal((await ok('/sync')).shift.currentCash,120);
 assert.equal((await request('/credit-payments',write({...payBody(),amount:21},payKey,{token:cashier}))).status,409);
 for(const amount of [-1,0,0.001,true,null,94])assert.ok((await request('/credit-payments',write({...payBody(),amount}))).status>=400);
 assert.equal((await request('/credit-payments',write(payBody(),undefined,{token:cook}))).status,403);
});
test('credit notes require a manager, reduce debt, preserve stock and cannot exceed the original sale',async()=>{
 assert.equal((await request('/credit-notes',write(noteBody(),noteKey,{token:cashier}))).status,403);
 note=(await ok('/credit-notes',write(noteBody(),noteKey))).document;
 assert.equal(note.total,30);assert.equal(note.tax,3.45);assert.equal(note.applied_to_balance,30);assert.equal(note.refund_amount,0);assert.equal(note.balance_after,63);
 assert.equal((await ok('/credit-notes',write(noteBody(),noteKey))).replayed,true);
 assert.equal((await request('/credit-notes',write({...noteBody(),amount:84}))).status,409);
 assert.equal((await request('/credit-notes',write({...noteBody(),reason:''}))).status,400);
 assert.equal((await ok('/sync')).products[0].stock,19);assert.equal((await ok('/credit-accounts')).accounts[0].balance,63);
 const html=await ok(`/documents/credit_note/${note.id}/html`),dom=new JSDOM(html);assert.equal(dom.window.document.querySelectorAll('script').length,0);assert.match(dom.window.document.body.textContent,/NC-000001/);assert.match(dom.window.document.body.textContent,/Ajuste <script>/);dom.window.close();
});
test('concurrent overpayments are rejected and later notes refund only money actually collected',async()=>{
 const results=await Promise.all([request('/credit-payments',write({...payBody(),amount:63})),request('/credit-payments',write({...payBody(),amount:63}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await ok('/credit-accounts')).accounts[0].balance,0);
 const n=await ok('/credit-notes',write({...noteBody(),amount:50}));assert.equal(n.document.refund_amount,50);assert.equal(n.document.applied_to_balance,0);
 const last=await ok('/credit-notes',write({...noteBody(),amount:33}));assert.equal(last.document.refund_amount,33);
 const state=(await ok('/credit-accounts')).accounts[0];assert.equal(state.credited,113);assert.equal(state.paid,83);assert.equal(state.refunded,83);assert.equal(state.balance,0);
 const docs=(await ok('/documents')).documents.filter(d=>d.kind==='credit_note');assert.equal(Math.round(docs.reduce((s,n)=>s+n.tax,0)*100),1300);
 assert.equal((await ok('/sync')).shift.currentCash,100);assert.equal((await request('/credit-notes',write({...noteBody(),amount:.01}))).status,409);
 const summary=await ok('/admin/monthly-summary?month='+date.slice(0,7));assert.equal(summary.salesTotal,0);assert.equal(summary.ivaDebito,0);assert.equal((await ok('/vat-book')).totals.reduce((s,r)=>s+r.total,0),0);
});
test('cash sale note refunds money once and requires an open shift',async()=>{
 const paid=(await ok('/sales',write({...creditSale(),paymentMethod:'efectivo',receivedAmount:113}))).sale;
 const shift=(await ok('/sync')).shift;await ok('/shifts/close',write({shiftId:shift.id,observedCash:213}));
 const body={saleId:paid.id,amount:113,reason:'Corrección completa',refundMethod:'efectivo'};
 assert.equal((await request('/credit-notes',write(body))).status,409);await ok('/shifts/open',write({openingCash:213}));
 const key=crypto.randomUUID(),n=await ok('/credit-notes',write(body,key));assert.equal(n.document.refund_amount,113);assert.equal((await ok('/credit-notes',write(body,key))).replayed,true);assert.equal((await ok('/sync')).shift.currentCash,100);
});
test('credit documents retain issuer snapshots, generate PDFs, and email matching attachments through local SMTP',async()=>{
 const before=await ok(`/documents/credit_note/${note.id}/json`);await ok('/settings',{method:'PUT',body:{company_name:'Nuevo emisor',invoice_email_enabled:true,smtp_host:'127.0.0.1',smtp_port:port,smtp_secure:false,smtp_user:'test@example.test',smtp_password:'local-only',smtp_from:'test@example.test'}});
 assert.deepEqual(await ok(`/documents/credit_note/${note.id}/json`),before);
 for(const d of [note,payment]){
  const pdf=await request(`/documents/${d.kind}/${d.id}/pdf`);assert.equal(pdf.status,200);assert.match(pdf.data,/^%PDF/);
  await ok(`/documents/${d.kind}/${d.id}/email`,write({customerEmail:'recipient@example.test'}));
  const message=messages.at(-1);const match=message.match(/Content-Type: application\/json[^]*?\r\n\r\n([^]*?)(?=\r\n--)/i);assert.ok(match);const attached=JSON.parse(Buffer.from(match[1].replace(/\s/g,''),'base64'));assert.deepEqual(attached,await ok(`/documents/${d.kind}/${d.id}/json`));
  const pdfMatch=message.match(/Content-Type: application\/pdf[^]*?\r\n\r\n([^]*?)(?=\r\n--)/i);assert.ok(pdfMatch);assert.deepEqual(Buffer.from(pdfMatch[1].replace(/\s/g,''),'base64'),pdf.buffer);
 }
 assert.equal(messages.length,2);
});
test('restart preserves balances and idempotency; other businesses and operational roles cannot access credit data',async()=>{
 await stop();await start();assert.equal((await ok('/credit-payments',write(payBody(),payKey,{token:cashier}))).replayed,true);assert.equal((await ok('/credit-notes',write(noteBody(),noteKey))).replayed,true);assert.equal((await ok('/credit-accounts')).accounts[0].balance,0);
 assert.equal((await request('/credit-accounts',{token:cook})).status,403);assert.equal((await request('/documents/credit_note/1/json',{token:cook})).status,403);
 const created=await ok('/platform/businesses',write({name:'Otro negocio',businessType:'retail',currencyCode:'USD',adminName:'Dueño',adminPin:'987654'}),201);
 const id=created.business.id;const token=(await ok('/auth/login',{business:id,method:'POST',body:{id:1,pin:'987654'},token:null})).token;
 assert.equal((await ok('/credit-accounts',{business:id,token})).accounts.length,0);assert.equal((await request('/documents/credit_note/1/json',{business:id,token})).status,404);assert.equal((await request('/credit-notes',write(noteBody(),undefined,{business:id,token}))).status,404);
});

test('competing notes with different keys cannot over-credit the same sale',async()=>{
 const s=(await ok('/sales',write({...creditSale(),paymentMethod:'tarjeta'}))).sale;
 const body={saleId:s.id,amount:80,reason:'Ajuste simultáneo',refundMethod:'tarjeta'};
 const results=await Promise.all([request('/credit-notes',write(body)),request('/credit-notes',write(body))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const preview=await ok('/credit-sales/'+s.id);assert.equal(preview.document.credit_state.available,33);assert.equal(preview.document.credit_state.credited,80);
 assert.equal((await request('/credit-sales/'+s.id,{token:cook})).status,403);
 assert.equal((await request('/settings',{method:'PUT',body:{payment_methods:['credito']}})).status,400);
});
