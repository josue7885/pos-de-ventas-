const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');

test('manual email form works without prompt, sends local SMTP attachments and prevents duplicate submits',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-email-ui-'));
 const messages=[],sockets=new Set(),errors=[],alerts=[];let child,dom,token,base,loseEmail=false,emailRequests=0;
 // A local sink, never a real mailbox or an external SMTP provider.
 const smtp=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  socket.write('220 localhost test SMTP\r\n');let pending='',dataMode=false,body=[];
  socket.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+2);
   if(dataMode){if(line==='.') {messages.push(body.join('\r\n'));body=[];dataMode=false;socket.write('250 queued locally\r\n');}else body.push(line.startsWith('..')?line.slice(1):line);continue;}
   if(/^EHLO|^HELO/i.test(line))socket.write('250-localhost\r\n250-AUTH PLAIN\r\n250 SIZE 20000000\r\n');
   else if(/^AUTH /i.test(line))socket.write('235 authenticated\r\n');
   else if(line==='DATA'){dataMode=true;socket.write('354 finish with dot\r\n');}
   else if(line==='QUIT')socket.end('221 bye\r\n');else socket.write('250 OK\r\n');
  }});
 });
 async function api(route,body,method=body?'POST':'GET'){
  const r=await fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),'Idempotency-Key':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});
  const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;
 }
 const submit=()=>dom.window.submitDocumentEmail({preventDefault(){}});
 try{
  await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
  child=spawn(process.execPath,[path.resolve(__dirname,'../server.js')],{env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});
  base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error(output||'Startup timeout')),12000);child.stderr.on('data',d=>output+=d);child.stdout.on('data',d=>{output+=d;const m=output.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',()=>{clearTimeout(timer);reject(Error(output));});});
  token=(await api('/auth/login',{id:1,pin:'729184'})).token;
  await api('/settings',{iva_rate:0,invoice_email_enabled:true,smtp_host:'127.0.0.1',smtp_port:smtp.address().port,smtp_secure:false,smtp_user:'pos@example.test',smtp_password:'TEST-ONLY',smtp_from:'pos@example.test'},'PUT');
  const product=(await api('/products',{name:'Prueba correo',category:'Prueba',price:10,stock:5})).product;
  await api('/shifts/open',{openingCash:0});
  const body={items:[{id:product.id,price:10,qty:1}],subtotal:10,tax:0,total:10,paymentMethod:'efectivo',receivedAmount:10,customerName:'Cliente de prueba',customerEmail:'cliente@example.test'};
  const sale=(await api('/sales',body)).sale,quote=(await api('/quotes',body)).quote;
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  dom=await JSDOM.fromURL(base,{resources:'usable',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
   w.fetch=async(url,options)=>{const isEmail=new URL(url).pathname.endsWith('/email');if(isEmail)emailRequests++;const r=await fetch(url,options);if(isEmail&&loseEmail){loseEmail=false;await r.text();throw Error('Respuesta perdida tras enviar');}return r;};
   w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.alert=m=>alerts.push(m);w.confirm=()=>true;w.prompt=()=>{throw Error('prompt() is not supported.');};w.open=()=>null;
  }});
  const w=dom.window;await new Promise(resolve=>w.addEventListener('load',resolve));
  w.document.getElementById('pin-input').value='729184';await w.loginUser();await w.refreshDocuments();
  const el=id=>w.document.getElementById(id),button=(kind,id)=>w.document.querySelector(`[data-document-action="email"][data-kind="${kind}"][data-id="${id}"]`);
  button('sale',sale.id).click();assert.equal(el('document-email-dialog').open,true);assert.equal(el('document-email-recipient').value,'cliente@example.test');assert.equal(w.document.activeElement.id,'document-email-recipient');
  w.document.querySelector('#document-email-dialog [data-close-floating]').click();assert.equal(emailRequests,0);assert.equal(el('document-email-dialog').open,false);
  button('sale',sale.id).click();
  for(const value of ['', 'invalido', 'uno@example.test,dos@example.test']){el('document-email-recipient').value=value;await submit();assert.equal(emailRequests,0);assert.match(el('document-email-status').textContent,/único correo válido/);}
  el('document-email-recipient').value='  destinatario@example.test  ';
  await Promise.all([submit(),submit()]);assert.equal(emailRequests,1);assert.equal(messages.length,1);assert.equal(el('document-email-submit').disabled,true);assert.match(el('document-email-status').textContent,/aceptado/);
  await submit();assert.equal(messages.length,1);
  for(const mime of ['application/pdf','application/json'])assert.ok(messages[0].includes('Content-Type: '+mime));assert.match(messages[0],/To: destinatario@example.test/);
  w.closeFloating('document-email-dialog');button('quote',quote.id).click();await submit();assert.equal(messages.length,2);assert.match(el('document-email-status').textContent,/aceptado/);
  // Server validation remains visible and allows correcting configuration.
  await api('/settings',{invoice_email_enabled:false},'PUT');w.closeFloating('document-email-dialog');button('sale',sale.id).click();await submit();assert.equal(messages.length,2);assert.equal(el('document-email-submit').disabled,false);assert.match(el('document-email-status').textContent,/SMTP/);
  await api('/settings',{invoice_email_enabled:true},'PUT');loseEmail=true;await submit();assert.equal(messages.length,3);assert.equal(el('document-email-submit').disabled,true);assert.match(el('document-email-status').textContent,/No se repetirá/);await submit();assert.equal(messages.length,3);
  // A form opened in an old business generation cannot submit after switching.
  w.closeFloating('document-email-dialog');button('sale',sale.id).click();const before=emailRequests;w.setBusinessId('principal');await submit();assert.equal(emailRequests,before);assert.equal(el('document-email-dialog').open,false);
  // Received copies use the same form with their own route/body; no prompt.
  const originalApi=w.apiRequest;let relayRequest;
  w.apiRequest=async(route,options)=>{if(route==='/document-relay/inbox/999/email'){relayRequest={route,body:JSON.parse(options.body)};return {sent:true,message:'Correo aceptado por SMTP.'};}return originalApi(route,options);};
  el('relay-inbox').innerHTML='<button data-relay-action="email" data-id="999">Correo</button>';
  el('relay-inbox').firstChild.click();assert.equal(el('document-email-dialog').open,true);assert.equal(el('document-email-recipient').value,'');el('document-email-recipient').value='copia@example.test';await submit();assert.deepEqual(relayRequest,{route:'/document-relay/inbox/999/email',body:{recipient:'copia@example.test'}});
  assert.deepEqual(errors,[]);assert.deepEqual(alerts,[]);
 }finally{
  dom?.window.close();if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
  for(const socket of sockets)socket.destroy();if(smtp.listening)await new Promise(resolve=>smtp.close(resolve));fs.rmSync(dir,{recursive:true,force:true});
 }
});
