const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),assert=require('assert/strict');
require('node:test').test('frontend DOM with real HTTP: checkout, lost response, sync and users', async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-domtest-'));let server,first,second;
 const errors=[],alerts=[];let loseNext=false;
 try{
 server=spawn(process.execPath,['server/server.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});let out='';server.stderr.on('data',()=>{});
 const base=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{out+=d;const m=out.match(/listening on port (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});server.on('exit',()=>reject(Error(out)));});
 const token=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:1,pin:'729184'})}).then(r=>r.json()).then(d=>d.token);
 await fetch(base+'/api/products',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({name:'Café',category:'Bebidas',price:4.5,stock:5})});
 async function open(){const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=await JSDOM.fromURL(base,{resources:'usable',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.fetch=async(url,options)=>{const result=await fetch(url,options);if(loseNext && new URL(url).pathname==='/api/sales'){loseNext=false;await result.text();throw new Error('Lost response after commit');}return result;};w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.alert=m=>alerts.push(m);w.prompt=()=> '0';w.confirm=()=>true;w.open=()=>null;}});await new Promise(resolve=>dom.window.addEventListener('load',resolve));await new Promise(resolve=>setTimeout(resolve,100));return dom;}
 first=await open();let w=first.window;assert.deepEqual(errors,[]);
 w.document.getElementById('pin-input').value='000000';await w.loginUser();assert.equal(w.eval('currentEmployee'),null);
 w.document.getElementById('pin-input').value='729184';await w.loginUser();assert.equal(w.eval('currentEmployee.role'),'admin',alerts.join('\n'));
 await w.openShift();assert.equal(w.eval('state.shift.isOpen'),true);
 w.addToCart(1);w.openBillingModal('payment');assert.equal(w.document.getElementById('billing-cash-received').value,'5.09');await w.processSale();assert.equal(w.eval('state.sales.length'),1);assert.equal(w.eval('state.products[0].stock'),4);
 second=await open();let v=second.window;v.document.getElementById('pin-input').value='729184';await v.loginUser();assert.equal(v.eval('state.products[0].stock'),4);
 w.crypto.randomUUID=undefined;assert.match(w.newRequestId(),/^[a-f0-9]{32}$/);w.addToCart(1);w.openBillingModal('payment');loseNext=true;await w.processSale();assert.equal(w.eval('pendingSale.uncertain'),true);assert.equal(w.eval('cart.length'),1);
 await w.processSale();assert.equal(w.eval('pendingSale'),null);assert.equal(w.eval('state.sales.length'),2);await v.syncFromServer();assert.equal(v.eval('state.sales.length'),2);assert.equal(v.eval('state.products[0].stock'),3);
 w.openUserForm();w.document.getElementById('user-form-name').value='Prueba UI';w.document.getElementById('user-pin').value='654321';w.document.getElementById('user-role-input').value='cajero';await w.handleUserSubmit({preventDefault(){}});assert.equal(w.eval("state.employees.some(u=>u.name==='Prueba UI')"),true);
 assert.deepEqual(errors,[]);console.log('DOM + real HTTP OK: wrong PIN, login, shared shift, cent rounding, checkout, lost-response replay, second-client sync, user form; no script errors.');
 }finally{first?.window.close();second?.window.close();if(server)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});fs.rmSync(dir,{recursive:true,force:true});}
});
