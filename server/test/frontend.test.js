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
 const navLabels=win=>Array.from(win.document.querySelectorAll('#nav-menu button'),el=>el.textContent.trim());
 const tabLabels=win=>Array.from(win.document.querySelectorAll('#module-tabs button'),el=>el.textContent.trim());
 assert.deepEqual(navLabels(w),['Caja','Documentos','Configuración']);
 assert.deepEqual(tabLabels(w),['Venta','Mesas','Órdenes','Cocina','Turno y cierre']);
 w.selectWorkspace('settings');assert.deepEqual(tabLabels(w),['General','Negocios','Usuarios']);
 assert.equal(w.document.getElementById('setting-business_type').disabled,false);
 w.selectWorkspace('documents');assert.deepEqual(tabLabels(w),['Comprobantes','Inventario','Reportes']);
 w.setActiveModule('inventory');w.selectWorkspace('cash');w.selectWorkspace('documents');assert.equal(w.eval('activeModule'),'inventory');
 w.selectWorkspace('cash');const firstTab=w.document.getElementById('tab-pos');firstTab.focus();firstTab.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
 assert.equal(w.eval('activeModule'),'cash');assert.equal(w.document.activeElement.id,'tab-cash');
 w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(w.eval('activeModule'),'pos');
 assert.equal(w.document.querySelectorAll('.module.active').length,1);
 assert.equal(w.document.getElementById('admin-hero'),null);
 assert.ok(w.document.getElementById('sale-billing-panel').contains(w.document.getElementById('billing-customer-email')));
 assert.ok(w.document.getElementById('sale-billing-panel').contains(w.document.getElementById('billing-payment-method')));
 assert.ok(w.document.getElementById('sale-billing-panel').compareDocumentPosition(w.document.querySelector('.pos-grid')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
 const stockSearch=w.document.getElementById('system-product-search');stockSearch.value='cafe';stockSearch.dispatchEvent(new w.Event('input'));
 assert.match(w.document.getElementById('system-product-results').textContent,/Café/);assert.match(w.document.getElementById('system-product-results').textContent,/5 unidad/);
 w.selectWorkspace('settings');assert.equal(w.document.getElementById('system-product-results').classList.contains('hidden'),false);w.selectWorkspace('cash');
 await w.openShift();assert.equal(w.eval('state.shift.isOpen'),true);
 const autoPrintDom=new JSDOM('<!DOCTYPE html><html></html>');let autoPrinted=0;autoPrintDom.window.print=()=>autoPrinted++;autoPrintDom.window.focus=()=>{};w.open=()=>autoPrintDom.window;
 w.addToCart(1);w.openBillingModal('payment');assert.equal(w.document.getElementById('billing-cash-received').value,'5.09');await w.processSale();assert.equal(w.eval('state.sales.length'),1);assert.equal(w.eval('state.products[0].stock'),4);
 assert.equal(autoPrinted,1);assert.match(autoPrintDom.window.document.querySelector('style').textContent,/80mm/);autoPrintDom.window.close();w.open=()=>null;
 assert.match(w.document.getElementById('system-product-results').textContent,/4 unidad/);
 assert.match(w.document.getElementById('sale-document-confirmation').textContent,/cliente no tiene correo/);
 assert.equal(w.document.getElementById('sale-document-confirmation').classList.contains('hidden'),false);
 assert.equal(w.document.querySelectorAll('#sale-document-confirmation [data-document-action]').length,4);
 second=await open();let v=second.window;v.document.getElementById('pin-input').value='729184';await v.loginUser();assert.equal(v.eval('state.products[0].stock'),4);
 w.crypto.randomUUID=undefined;assert.match(w.newRequestId(),/^[a-f0-9]{32}$/);w.addToCart(1);w.openBillingModal('payment');loseNext=true;await w.processSale();assert.equal(w.eval('pendingSale.uncertain'),true);assert.equal(w.eval('cart.length'),1);
 await w.processSale();assert.equal(w.eval('pendingSale'),null);assert.equal(w.eval('state.sales.length'),2);await v.syncFromServer();assert.equal(v.eval('state.sales.length'),2);assert.equal(v.eval('state.products[0].stock'),3);assert.match(w.document.getElementById('sale-document-confirmation').textContent,/Permite ventanas emergentes/);
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
 assert.equal(w.document.getElementById('billing-modal').classList.contains('hidden'),true);
 assert.equal(w.document.activeElement.id,'billing-customer-name');
 w.document.getElementById('billing-customer-name').value='<img src=x onerror=alert(1)>';
 w.document.getElementById('billing-customer-email').value='cliente@example.test';
 await w.saveCustomerFromForm();w.closeBillingModal();assert.equal(w.document.querySelectorAll('#customer-select img').length,0);
 loseOperation='/api/quotes';await w.saveQuoteFromCart();assert.equal(w.document.getElementById('operation-recovery-panel').classList.contains('hidden'),false);
 w.clearCart();await w.trackedOperation('quote','/quotes',null);await w.refreshDocuments();
 const quote=w.eval("documentDirectory.find(d=>d.kind==='quote')");assert.ok(quote);assert.equal(quote.total,1.13);assert.equal(w.eval('state.sales.length'),2);assert.equal(w.document.querySelectorAll('#documents-quotes-content img').length,0);
 assert.ok(w.document.querySelector('[data-kind="quote"][data-document-action="email"]'));
 const printDom=new JSDOM('<!DOCTYPE html><html></html>');let printed=0;
 printDom.window.print=()=>printed++;printDom.window.focus=()=>{};w.open=()=>printDom.window;
 await w.printDocument(quote);assert.equal(printed,1);assert.equal(printDom.window.document.querySelectorAll('script,img[onerror]').length,0);
 assert.match(printDom.window.document.body.textContent,/Descuento \(20%\)/);assert.match(printDom.window.document.body.textContent,/1\.13/);
 printDom.window.close();w.open=()=>null;
 // The authenticated download path is also used for the business-specific PDF and JSON.
 const downloads=[];w.URL.createObjectURL=blob=>{downloads.push({blob});return 'blob:local-test';};w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){downloads.at(-1).filename=this.download;};
 for(const action of ['json','pdf'])await w.documentAction({target:w.document.querySelector(`[data-kind="quote"][data-document-action="${action}"]`)});
 assert.equal(JSON.parse(await downloads[0].blob.text()).number,quote.number);assert.match(downloads[0].filename,/^cotizacion-COT-.*\.json$/);assert.equal((await downloads[1].blob.text()).slice(0,4),'%PDF');
 await w.loadQuoteToCart(quote);assert.equal(w.getCartTotals().total,1.13);
 w.document.getElementById('sale-receipt-output').value='pdf';w.document.getElementById('billing-cash-received').value='10';w.openBillingModal('payment');assert.equal(w.document.getElementById('billing-cash-received').value,'10');assert.notEqual(w.getComputedStyle(w.document.getElementById('confirm-billing-btn')).display,'none');await w.processSale();assert.equal(w.eval('state.sales.length'),3);assert.equal(w.eval('selectedQuoteId'),null);assert.match(downloads.at(-1).filename,/^comprobante-.*\.pdf$/);assert.match(w.document.getElementById('sale-document-confirmation').textContent,/configura y activa SMTP/);assert.equal(w.document.getElementById('billing-customer-email').value,'');assert.equal(w.document.getElementById('billing-customer-name').value,'');assert.equal(w.document.getElementById('customer-select').value,'');
 w.setActiveModule('inventory');await w.syncFromServer();
 for(const [id,value] of Object.entries({'receive-product':String(added.id),'receive-quantity':'1','receive-unit-cost':'3','receive-supplier':'Proveedor UI','receive-reference':'UI-REC-1'}))w.document.getElementById(id).value=value;
 loseOperation='/api/inventory/receive';await w.receiveInventory({preventDefault(){},currentTarget:w.document.getElementById('receive-stock-form')});
 await w.trackedOperation('receive','/inventory/receive',null);await w.syncFromServer();await w.refreshInventoryHistory();
 const updated=w.eval("state.products.find(p=>p.code==='UI-001')");assert.equal(updated.stock,1.5);assert.equal(updated.cost,2.33);
 assert.match(w.document.getElementById('inventory-purchases-body').textContent,/UI-REC-1/);
 w.document.getElementById('sales-report-payment').value='tarjeta';w.renderReports();assert.match(w.document.getElementById('sales-table-body').textContent,/No hay ventas/);
 w.document.getElementById('sales-report-payment').value='all';w.renderReports();
 // A lost creation response recovers the same business. Switching tabs never mixes data.
 w.setActiveModule('businesses');await w.refreshBusinesses();
 for(const [id,value] of Object.entries({'business-name':'Servicios UI','business-type':'services','business-currency':'EUR','business-admin-name':'Dueño Servicios','business-admin-pin':'987654'}))w.document.getElementById(id).value=value;
 loseOperation='/api/platform/businesses';await w.createBusiness({preventDefault(){}});
 const creationKey=w.businessRequestKey();assert.ok(w.sessionStorage.getItem(creationKey));
 // Recovery does not require entering the initial PIN again after the form was cleared.
 w.document.getElementById('business-create-form').reset();assert.equal(w.document.getElementById('recover-business-btn').classList.contains('hidden'),false);
 await w.recoverBusiness();assert.equal(w.sessionStorage.getItem(creationKey),null);
 const childId=w.eval("businessDirectory.find(b=>b.name==='Servicios UI').id"),rootJournal=w.pendingSaleKey();
 await w.switchBusiness(childId);assert.equal(w.document.getElementById('system-product-search').value,'');assert.equal(w.document.getElementById('system-product-results').textContent,'');assert.equal(w.eval('currentEmployee'),null);assert.equal(w.getBusinessId(),childId);
 w.document.getElementById('pin-input').value='987654';await w.loginUser();
 assert.equal(w.eval('currentEmployee.name'),'Dueño Servicios',alerts.join('\n'));assert.equal(w.eval('state.products.length'),0);assert.equal(w.eval('state.sales.length'),0);assert.notEqual(w.pendingSaleKey(),rootJournal);
 assert.equal(w.document.querySelector('[data-module="tables"]'),null);assert.equal(w.document.querySelector('[data-module="businesses"]'),null);
 assert.ok(w.document.getElementById('send-kitchen-btn').classList.contains('hidden'));
 w.openProductForm();assert.equal(w.document.getElementById('product-type').value,'servicio');w.closeProductForm();
 w.setActiveModule('settings');assert.equal(w.document.getElementById('setting-currency_code').value,'EUR');
 w.document.getElementById('setting-tax_label').value='Impuesto UI';w.document.getElementById('setting-iva_rate').value='0';await w.saveCompanySettings({preventDefault(){}});
 assert.equal(w.eval('state.companySettings.tax_label'),'Impuesto UI',alerts.join('\n'));assert.equal(w.eval('state.companySettings.iva_rate'),0);
 await v.syncFromServer();assert.equal(v.getBusinessId(),'principal');assert.equal(v.eval('state.sales.length'),3);assert.equal(v.eval('state.companySettings.currency_code'),'USD');
 await w.switchBusiness('principal');w.document.getElementById('pin-input').value='729184';await w.loginUser();assert.equal(w.eval('state.sales.length'),3);
 // Real sessions keep their existing role permissions within the three workspaces.
 const cashier=w.eval("state.employees.find(u=>u.name==='Prueba UI')");
 await v.logoutUser();v.document.getElementById('employee-select').value=String(cashier.id);v.document.getElementById('pin-input').value='654321';await v.loginUser();
 assert.equal(v.eval('currentEmployee.role'),'cajero');assert.deepEqual(navLabels(v),['Caja','Documentos']);
 v.setActiveModule('settings');assert.notEqual(v.eval('activeModule'),'settings');assert.equal(v.document.getElementById('setting-business_type').disabled,true);
 await assert.rejects(v.apiRequest('/settings',{method:'PUT',body:JSON.stringify({business_type:'services'})}),error=>error.status===403);
 for(const role of ['gerente','cocina']){
  const {user}=await w.apiRequest('/users',{method:'POST',body:JSON.stringify({name:'Rol '+role,role,pin:'876543'})});
  await v.logoutUser();v.document.getElementById('employee-select').value=String(user.id);v.document.getElementById('pin-input').value='876543';await v.loginUser();assert.equal(v.eval('currentEmployee.role'),role);
  if(role==='gerente'){v.selectWorkspace('settings');assert.deepEqual(tabLabels(v),['Usuarios']);assert.equal(v.eval('activeModule'),'users');}
  else{assert.deepEqual(navLabels(v),['Caja']);assert.deepEqual(tabLabels(v),['Cocina']);v.setActiveModule('inventory');assert.equal(v.eval('activeModule'),'kitchen');}
  assert.equal(v.document.getElementById('setting-business_type').disabled,true);assert.equal(v.document.getElementById('module-settings').getAttribute('aria-hidden'),'true');
 }
 // A delayed response body cannot populate a business selected after that request began.
 const realFetch=w.fetch;let releaseBody;
 const bodyGate=new Promise(resolve=>{releaseBody=resolve;});
 w.fetch=async()=>({ok:true,json:async()=>{await bodyGate;return {settings:{company_name:'Respuesta anterior'}};}});
 const delayed=await w.posFetch(base+'/api/settings'),reading=delayed.json();
 w.setBusinessId(childId);w.setBusinessId('principal');releaseBody();await assert.rejects(reading,error=>error.status===409);w.fetch=realFetch;
 assert.deepEqual(errors,[]);console.log('DOM + real HTTP OK: checkout, recovery, sync, inventory, documents, multibusiness creation, switching, configuration and tab isolation; no script errors.');
 }finally{first?.window.close();second?.window.close();if(server)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});fs.rmSync(dir,{recursive:true,force:true});}
});
