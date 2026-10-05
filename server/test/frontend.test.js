const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),assert=require('assert/strict');
require('node:test').test('frontend DOM with real HTTP: checkout, lost response, sync and users', async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-domtest-'));let server,first,second;
 const errors=[],alerts=[];let loseNext=false,loseOperation='';
 try{
 server=spawn(process.execPath,['server/server.js'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});let out='';server.stderr.on('data',()=>{});
 const base=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{out+=d;const m=out.match(/listening on port (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});server.on('exit',()=>reject(Error(out)));});
 const token=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:1,pin:'729184'})}).then(r=>r.json()).then(d=>d.token);
 await fetch(base+'/api/products',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({name:'Café',category:'Bebidas',price:4.5,stock:5})});
 async function open(){const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=await JSDOM.fromURL(base,{resources:'usable',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.fetch=async(url,options)=>{const result=await fetch(url,options);if(loseOperation && new URL(url).pathname===loseOperation){loseOperation='';await result.text();throw new Error('Lost operation response');}if(loseNext && new URL(url).pathname==='/api/sales'){loseNext=false;await result.text();throw new Error('Lost response after commit');}return result;};w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.alert=m=>alerts.push(m);w.prompt=()=> '0';w.confirm=()=>true;w.open=()=>null;}});await new Promise(resolve=>dom.window.addEventListener('load',resolve));await new Promise(resolve=>setTimeout(resolve,100));return dom;}
 first=await open();let w=first.window;assert.deepEqual(errors,[]);
 w.document.getElementById('pin-input').value='000000';await w.loginUser();assert.equal(w.eval('currentEmployee'),null);
 w.document.getElementById('pin-input').value='729184';await w.loginUser();assert.equal(w.eval('currentEmployee.role'),'admin',alerts.join('\n'));
 await w.openShift();assert.equal(w.eval('state.shift.isOpen'),true);
 w.addToCart(1);w.openBillingModal('payment');assert.equal(w.document.getElementById('billing-cash-received').value,'5.09');await w.processSale();assert.equal(w.eval('state.sales.length'),1);assert.equal(w.eval('state.products[0].stock'),4);
 second=await open();let v=second.window;v.document.getElementById('pin-input').value='729184';await v.loginUser();assert.equal(v.eval('state.products[0].stock'),4);
 w.crypto.randomUUID=undefined;assert.match(w.newRequestId(),/^[a-f0-9]{32}$/);w.addToCart(1);w.openBillingModal('payment');loseNext=true;await w.processSale();assert.equal(w.eval('pendingSale.uncertain'),true);assert.equal(w.eval('cart.length'),1);
 await w.processSale();assert.equal(w.eval('pendingSale'),null);assert.equal(w.eval('state.sales.length'),2);await v.syncFromServer();assert.equal(v.eval('state.sales.length'),2);assert.equal(v.eval('state.products[0].stock'),3);
 w.openUserForm();w.document.getElementById('user-form-name').value='Prueba UI';w.document.getElementById('user-pin').value='654321';w.document.getElementById('user-role-input').value='cajero';await w.handleUserSubmit({preventDefault(){}});assert.equal(w.eval("state.employees.some(u=>u.name==='Prueba UI')"),true);
 // Adapted UI: SKU lookup, fractional quantity, customer directory, quotes and receiving.
 w.setActiveModule('inventory');w.openProductForm();
 const fields={'product-name':'Granel UI','product-category':'Prueba','product-code':'UI-001','product-unit':'kg','product-cost':'1','product-price':'2.5','product-stock':'1','product-min-stock':'.5'};
 for(const [id,value] of Object.entries(fields))w.document.getElementById(id).value=value;
 await w.handleProductSubmit({preventDefault(){}});
 const added=w.eval("state.products.find(p=>p.code==='UI-001')");assert.ok(added,alerts.join('\n'));
 w.setActiveModule('pos');const search=w.document.getElementById('search-input');search.value='UI-001';search.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(w.eval('cart[0].id'),added.id);w.setCartItemQuantity(0,.5);
 w.document.getElementById('billing-discount-percent').value='20';w.document.getElementById('billing-discount-reason').value='Prueba DOM';w.renderCart();assert.equal(w.getCartTotals().total,1.13);
 w.document.getElementById('billing-new-customer-btn').click();
 assert.notEqual(w.getComputedStyle(w.document.getElementById('save-customer-btn')).display,'none');
 assert.equal(w.getComputedStyle(w.document.getElementById('confirm-billing-btn')).display,'none');
 w.document.getElementById('billing-customer-name').value='<img src=x onerror=alert(1)>';
 w.document.getElementById('billing-customer-email').value='cliente@example.test';
 await w.saveCustomerFromForm();w.closeBillingModal();assert.equal(w.document.querySelectorAll('#customer-select img').length,0);
 loseOperation='/api/quotes';await w.saveQuoteFromCart();assert.equal(w.document.getElementById('operation-recovery-panel').classList.contains('hidden'),false);
 w.clearCart();await w.trackedOperation('quote','/quotes',null);await w.refreshDocuments();
 const quote=w.eval("documentDirectory.find(d=>d.kind==='quote')");assert.ok(quote);assert.equal(quote.total,1.13);assert.equal(w.eval('state.sales.length'),2);assert.equal(w.document.querySelectorAll('#documents-quotes-content img').length,0);
 await w.loadQuoteToCart(quote);assert.equal(w.getCartTotals().total,1.13);
 w.openBillingModal('payment');assert.notEqual(w.getComputedStyle(w.document.getElementById('confirm-billing-btn')).display,'none');await w.processSale();assert.equal(w.eval('state.sales.length'),3);assert.equal(w.eval('selectedQuoteId'),null);
 w.setActiveModule('inventory');await w.syncFromServer();
 for(const [id,value] of Object.entries({'receive-product':String(added.id),'receive-quantity':'1','receive-unit-cost':'3','receive-supplier':'Proveedor UI','receive-reference':'UI-REC-1'}))w.document.getElementById(id).value=value;
 loseOperation='/api/inventory/receive';await w.receiveInventory({preventDefault(){},currentTarget:w.document.getElementById('receive-stock-form')});
 await w.trackedOperation('receive','/inventory/receive',null);await w.syncFromServer();await w.refreshInventoryHistory();
 const updated=w.eval("state.products.find(p=>p.code==='UI-001')");assert.equal(updated.stock,1.5);assert.equal(updated.cost,2.33);
 assert.match(w.document.getElementById('inventory-purchases-body').textContent,/UI-REC-1/);
 w.document.getElementById('sales-report-payment').value='tarjeta';w.renderReports();assert.match(w.document.getElementById('sales-table-body').textContent,/No hay ventas/);
 w.document.getElementById('sales-report-payment').value='all';w.renderReports();
 assert.deepEqual(errors,[]);console.log('DOM + real HTTP OK: wrong PIN, login, shared shift, cent rounding, checkout, lost-response replay, second-client sync, users, SKU, fractional quantities, customers, quote conversion, inventory receipts and lost responses; no script errors.');
 }finally{first?.window.close();second?.window.close();if(server)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});fs.rmSync(dir,{recursive:true,force:true});}
});
