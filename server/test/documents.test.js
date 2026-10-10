const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {JSDOM}=require('jsdom');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-documents-'));
let child,base,admin,sale,quote,smtp,smtpPort,original,disconnectNext=false;
const roles={},messages=[],sockets=new Set();
async function start(){
 child=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});
 let out='';child.stderr.on('data',data=>out+=data);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(out||'Server timeout')),12000);child.stdout.on('data',data=>{out+=data;const match=out.match(/listening on port (\d+)/);if(match){base='http://127.0.0.1:'+match[1];clearTimeout(timer);resolve();}});child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error(out));});});
}
async function stop(){if(child?.exitCode===null && child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
async function request(route,{token=admin,business='principal',method='GET',body,key}={}){
 const response=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json','X-POS-Business':business,...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const buffer=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(buffer);}catch{data=buffer.toString();}
 return {status:response.status,data,buffer,headers:response.headers};
}
async function ok(route,options,status=200){const result=await request(route,options);assert.equal(result.status,status,JSON.stringify(result.data));return result.data;}
function attachment(message,type){
 const match=message.match(new RegExp('Content-Type: '+type.replace('/','\\/')+'[^]*?\\r\\n\\r\\n([^]*?)(?=\\r\\n--)','i'));
 assert.ok(match,'Missing attachment '+type);return Buffer.from(match[1].replace(/\s/g,''),'base64');
}
before(async()=>{
 // Local SMTP sink only: no real recipients, network provider or external mail.
 smtp=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  socket.write('220 localhost test SMTP\r\n');let pending='',dataMode=false,body=[];
  socket.on('data',chunk=>{pending+=chunk.toString();let end;while((end=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+2);
   if(dataMode){if(line==='.') {messages.push(body.join('\r\n'));body=[];dataMode=false;if(disconnectNext){disconnectNext=false;socket.destroy();return;}socket.write('250 queued locally\r\n');}else body.push(line.startsWith('..')?line.slice(1):line);continue;}
   if(/^EHLO|^HELO/i.test(line))socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 20000000\r\n');
   else if(/^AUTH /i.test(line))socket.write('235 authenticated\r\n');
   else if(line==='DATA'){dataMode=true;socket.write('354 finish with dot\r\n');}
   else if(line==='QUIT')socket.end('221 bye\r\n');else socket.write('250 OK\r\n');
  }});
 });
 await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));smtpPort=smtp.address().port;
 await start();admin=(await ok('/auth/login',{method:'POST',body:{id:1,pin:'729184'}})).token;
 for(const role of ['gerente','cajero','contador','mesero','cocina']){
  const {user}=await ok('/users',{method:'POST',body:{name:role,role,pin:'654321'}});
  roles[role]=(await ok('/auth/login',{method:'POST',body:{id:user.id,pin:'654321'}})).token;
 }
 await ok('/settings',{method:'PUT',body:{company_name:'Negocio A & <tienda>',company_legal_name:'Comercial de Prueba',company_nit:'NIT-PRUEBA',company_address:'Dirección original',company_email:'pos@example.test',currency_code:'MXN',number_locale:'es-MX',tax_label:'Impuesto original',receipt_footer:'Gracias original',smtp_host:'127.0.0.1',smtp_port:smtpPort,smtp_secure:false,smtp_user:'pos@example.test',smtp_password:'SMTP-TEST-SECRET',smtp_from:'pos@example.test',invoice_email_enabled:true}});
 const product=(await ok('/products',{method:'POST',body:{name:'Cacao <img src=x onerror=alert(1)>',category:'Granel',price:3.33,cost:.8,stock:10,unit:'kg'}},201)).product;
 const service=(await ok('/products',{method:'POST',body:{name:'Servicio',category:'Servicios',price:10,cost:2,stock:0,type:'servicio'}},201)).product;
 const body={items:[{id:product.id,price:3.33,qty:.333},{id:service.id,price:10,qty:1}],discountPercent:10,discountReason:'Descuento de prueba',subtotal:10,tax:1.3,total:11.3,customerName:'Cliente <script>alert(1)</script>',customerNit:'CF',customerEmail:'cliente@example.test',customerPhone:'0000-0000',customerAddress:'Calle de prueba',customerDepartment:'San Miguel',customerMunicipality:'Municipio de prueba',customerGiro:'Comercio',paymentMethod:'efectivo',receivedAmount:20};
 quote=(await ok('/quotes',{method:'POST',body,key:crypto.randomUUID()})).quote;
 await ok('/shifts/open',{method:'POST',body:{openingCash:0}});
 sale=(await ok('/sales',{method:'POST',body,key:crypto.randomUUID()})).sale;
 original=await ok(`/documents/sale/${sale.id}/json`);
});
after(async()=>{await stop();for(const socket of sockets)socket.destroy();if(smtp)await new Promise(resolve=>smtp.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});

test('only administrators can change business type or create businesses, regardless of submitted fields',async()=>{
 const before=await ok('/settings');
 for(const [role,token] of Object.entries(roles)){
  assert.equal((await request('/settings',{token,method:'PUT',body:{business_type:'services',tables_enabled:false,kitchen_enabled:false,company_name:'Intruso'}})).status,403,role);
  assert.equal((await request('/platform/businesses',{token,method:'POST',body:{name:'Intruso',business_type:'services',adminPin:'654321'},key:crypto.randomUUID()})).status,403,role);
 }
 assert.deepEqual(await ok('/settings'),before);
 assert.equal((await request('/settings',{token:null,method:'PUT',body:{business_type:'retail'}})).status,401);
 await ok('/settings',{method:'PUT',body:{business_type:'services'}});
 assert.equal((await ok('/settings')).settings.business_type,'services');
});

test('public JSON, printable HTML and PDF use the saved totals and exclude secrets and cost data',async()=>{
 assert.equal(original.schema_version,2);assert.equal(original.profile_source,'issued');assert.equal(original.business_id,'principal');assert.equal(original.currency_code,'MXN');
 assert.equal(original.items[0].line_total,1.11);assert.equal(original.gross,11.11);assert.equal(original.discount,1.11);assert.equal(original.change_amount,8.7);
 assert.ok(!JSON.stringify(original).includes('SMTP-TEST-SECRET'));assert.equal(original.items[0].cost,undefined);assert.equal(original.issuer.smtp_user,undefined);assert.equal(original.profile_id,undefined);
 const html=await ok(`/documents/sale/${sale.id}/html`),dom=new JSDOM(html),document=dom.window.document;
 assert.equal(document.querySelectorAll('script,img[onerror]').length,0);assert.match(document.body.textContent,/Negocio A & <tienda>/);assert.match(document.body.textContent,/Impuesto original/);assert.match(document.body.textContent,/Descuento \(10%\)/);assert.match(document.body.textContent,/Cambio:.*8\.70/);assert.match(document.body.textContent,/San Miguel/);dom.window.close();
 const pdf=await request(`/documents/sale/${sale.id}/pdf`),legacy=await request(`/invoices/${sale.id}/pdf`);
 assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-disposition'),/comprobante-.*\.pdf/);assert.equal(pdf.buffer.subarray(0,4).toString(),'%PDF');assert.deepEqual(pdf.buffer,legacy.buffer);
 for(const token of [roles.mesero,roles.cocina])for(const format of ['json','html','pdf'])assert.equal((await request(`/documents/sale/${sale.id}/${format}`,{token})).status,403);
 assert.equal((await request(`/documents/sale/${sale.id}/html`,{token:null})).status,401);
 assert.equal((await request(`/documents/sale/${sale.id}/email`,{token:roles.cocina,method:'POST',body:{customerEmail:'cliente@example.test'}})).status,403);
});

test('changing issuer settings does not rewrite issued sales or quotes in any format',async()=>{
 await ok('/settings',{method:'PUT',body:{company_name:'Nombre nuevo',company_address:'Dirección nueva',tax_label:'Impuesto nuevo',receipt_footer:'Gracias nuevo',iva_rate:0}});
 assert.deepEqual(await ok(`/documents/sale/${sale.id}/json`),original);
 const q=await ok(`/documents/quote/${quote.id}/json`);assert.equal(q.issuer.company_name,original.issuer.company_name);assert.equal(q.total,11.3);assert.equal(q.issuer.tax_label,'Impuesto original');
 for(const [kind,id] of [['sale',sale.id],['quote',quote.id]]){
  const html=await ok(`/documents/${kind}/${id}/html`);assert.match(html,/Gracias original/);assert.ok(!html.includes('Gracias nuevo'));
 }
});

test('sale and quote SMTP attachments match downloads and the legacy email route shares the same document',async()=>{
 assert.equal((await request(`/documents/sale/${sale.id}/email`,{method:'POST',body:{customerEmail:'uno@example.test,dos@example.test'}})).status,400);
 for(const [kind,id] of [['sale',sale.id],['quote',quote.id]]){
  await ok(`/documents/${kind}/${id}/email`,{method:'POST',body:{customerEmail:'cliente@example.test'}});
  const message=messages.at(-1),json=JSON.parse(attachment(message,'application/json'));
  assert.deepEqual(json,await ok(`/documents/${kind}/${id}/json`));
  const pdf=await request(`/documents/${kind}/${id}/pdf`);assert.deepEqual(attachment(message,'application/pdf'),pdf.buffer);
  assert.ok(!attachment(message,'application/json').toString().includes('SMTP-TEST-SECRET'));
 }
 await ok(`/invoices/${sale.id}/email`,{method:'POST',body:{customerEmail:'cliente@example.test'}});
 assert.deepEqual(JSON.parse(attachment(messages.at(-1),'application/json')),original);assert.equal(messages.length,3);
});

test('documents with the same numeric ID remain isolated between businesses',async()=>{
 const childBusiness=(await ok('/platform/businesses',{method:'POST',body:{name:'Negocio B',adminPin:'987654',business_type:'services',currency_code:'EUR'},key:crypto.randomUUID()},201)).business.id;
 const token=(await ok('/auth/login',{business:childBusiness,token:null,method:'POST',body:{id:1,pin:'987654'}})).token;
 const context={business:childBusiness,token};
 const product=(await ok('/products',{...context,method:'POST',body:{name:'Servicio B',category:'Servicios',price:20,stock:0,type:'servicio'}},201)).product;
 await ok('/shifts/open',{...context,method:'POST',body:{openingCash:0}});
 const childSale=(await ok('/sales',{...context,method:'POST',body:{items:[{id:product.id,price:20,qty:1}],subtotal:20,tax:2.6,total:22.6,paymentMethod:'tarjeta'},key:crypto.randomUUID()})).sale;
 assert.equal(childSale.id,sale.id);
 const own=await ok(`/documents/sale/${sale.id}/json`,context);assert.equal(own.business_id,childBusiness);assert.equal(own.currency_code,'EUR');assert.equal(own.issuer.company_name,'Negocio B');
 assert.deepEqual(await ok(`/documents/sale/${sale.id}/json`),original);
 assert.equal((await request(`/documents/sale/${sale.id}/html`,{business:childBusiness,token:admin})).status,401);
 assert.equal((await request(`/documents/sale/${sale.id}/pdf`,{token})).status,401);
});

test('profiles are deduplicated and durable and legacy documents remain explicit about current issuer data',async()=>{
 await stop();
 const SQL=await require('sql.js')(),file=path.join(dir,'pos.db'),db=new SQL.Database(fs.readFileSync(file));
 assert.equal(db.exec('SELECT COUNT(*) FROM document_profiles')[0].values[0][0],1);
 db.run('UPDATE invoices SET profile_id=NULL WHERE sale_id=?',[sale.id]);fs.writeFileSync(file,Buffer.from(db.export()));db.close();
 await start();
 const legacy=await ok(`/documents/sale/${sale.id}/json`);assert.equal(legacy.profile_source,'legacy_current_settings');assert.equal(legacy.issuer.company_name,'Nombre nuevo');assert.equal(legacy.total,original.total);
 assert.match(await ok(`/documents/sale/${sale.id}/html`),/Documento anterior/);
 assert.equal((await ok(`/documents/quote/${quote.id}/json`)).issuer.company_name,original.issuer.company_name);
});

test('checkout automatically emails once across concurrent recovery and restart without an executive PIN',async()=>{
 const product=(await ok('/products',{method:'POST',body:{name:'Entrega automática',category:'Servicios',price:10,stock:0,type:'servicio'}},201)).product;
 // Configure an executive PIN: checkout still needs only an authorized signed-in cashier.
 await ok('/auth/executive-pin',{method:'POST',body:{pin:'917263'}});
 const body={items:[{id:product.id,price:10,qty:1}],subtotal:10,tax:0,total:10,paymentMethod:'tarjeta',customerName:'Receptor prueba',customerEmail:'auto@example.test',emailReceipt:true};
 const key=crypto.randomUUID(),count=messages.length;
 const results=await Promise.all([ok('/sales',{method:'POST',token:roles.cajero,body,key}),ok('/sales',{method:'POST',token:roles.cajero,body,key})]);
 assert.equal(results[0].sale.id,results[1].sale.id);assert.equal(messages.length,count+1);
 const replay=await ok('/sales',{method:'POST',token:roles.cajero,body,key});assert.equal(replay.emailDelivery.status,'accepted');assert.equal(messages.length,count+1);
 assert.deepEqual(JSON.parse(attachment(messages.at(-1),'application/json')),await ok(`/documents/sale/${replay.sale.id}/json`));
 const ticket=await ok(`/documents/sale/${replay.sale.id}/html?format=ticket`);assert.match(ticket,/html\{width:80mm/);assert.match(ticket,/Receptor prueba/);
 await stop();await start();
 const restarted=await ok('/sales',{method:'POST',token:roles.cajero,body,key});assert.equal(restarted.sale.id,replay.sale.id);assert.equal(restarted.emailDelivery.status,'accepted');assert.equal(messages.length,count+1);
 // Settings protection remains in place; removing the dashboard does not remove admin security.
 assert.equal((await request('/settings',{method:'PUT',body:{business_type:'retail'}})).status,403);
});

test('missing, invalid or unrequested email never prevents checkout or sends unintended mail',async()=>{
 const product=(await ok('/products',{method:'POST',body:{name:'Sin correo',category:'Servicios',price:1,stock:0,type:'servicio'}},201)).product;
 const count=messages.length;
 for(const [email,emailReceipt,status] of [['',true,'skipped'],['a@example.test,b@example.test',true,'skipped'],['safe@example.test',false,'not_requested']]){
  const result=await ok('/sales',{method:'POST',key:crypto.randomUUID(),body:{items:[{id:product.id,price:1,qty:1}],subtotal:1,tax:0,total:1,paymentMethod:'tarjeta',customerEmail:email,emailReceipt}});
  assert.ok(result.sale.id);assert.equal(result.emailDelivery.status,status);
 }
 assert.equal(messages.length,count);
});

test('an SMTP disconnect after accepting DATA does not repeat mail or undo the sale',async()=>{
 const product=(await ok('/products',{method:'POST',body:{name:'Correo incierto',category:'Servicios',price:2,stock:0,type:'servicio'}},201)).product;
 const body={items:[{id:product.id,price:2,qty:1}],subtotal:2,tax:0,total:2,paymentMethod:'tarjeta',customerEmail:'disconnect@example.test',emailReceipt:true},key=crypto.randomUUID(),count=messages.length;
 disconnectNext=true;
 const result=await ok('/sales',{method:'POST',body,key});assert.ok(result.sale.id);assert.equal(result.emailDelivery.status,'uncertain');assert.equal(messages.length,count+1);
 const repeat=await ok('/sales',{method:'POST',body,key});assert.equal(repeat.sale.id,result.sale.id);assert.equal(repeat.emailDelivery.status,'uncertain');assert.equal(messages.length,count+1);
});
