const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),assert=require('assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-ui-'));
 const server=spawn(process.execPath,['server/server.js'],{cwd:process.cwd(),env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'729184',PORT:'0'}});
 let browser;let out='';server.stderr.on('data',d=>process.stderr.write(d));
 try{
 const base=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{out+=d;const m=out.match(/listening on port (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});server.on('exit',c=>reject(new Error('server exit '+c)));});
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:1,pin:'729184'})}).then(r=>r.json());
 await fetch(base+'/api/products',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.token},body:JSON.stringify({name:'Café',category:'Bebidas',price:4.5,stock:5})});
 browser=await chromium.launch({headless:true,...(process.env.POS_TEST_CHROMIUM?{executablePath:process.env.POS_TEST_CHROMIUM}:{}),args:['--disable-gpu']});
 const errors=[];const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='prompt')await d.accept('0');else await d.accept();});
 await page.goto(base);await page.locator('#employee-select option').waitFor({state:'attached'});await page.fill('#pin-input','000000');await page.click('#login-btn');await page.locator('#login-error:not(.hidden)').waitFor();assert.equal(await page.locator('#app-shell').isVisible(),false);
 await page.fill('#pin-input','729184');await page.click('#login-btn');await page.locator('#app-shell:not(.hidden)').waitFor();
 assert.deepEqual(await page.locator('#nav-menu button').allTextContents(),['Inicio','Caja','Documentos','Configuración']);
 assert.equal(await page.locator('#module-home').isVisible(),true);
 await page.click('#sidebar-toggle');assert.equal(await page.locator('#app-shell').evaluate(el=>el.classList.contains('sidebar-collapsed')),true);
 await page.reload();await page.locator('#employee-select option').waitFor({state:'attached'});await page.fill('#pin-input','729184');await page.click('#login-btn');await page.locator('#app-shell:not(.hidden)').waitFor();assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'),'false');
 if(process.env.POS_SCREENSHOT_DIR){fs.mkdirSync(process.env.POS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'inicio-plegado.png'),fullPage:true});}
 await page.click('#sidebar-toggle');await page.click('[data-home-action=sale]');
 assert.equal(await page.locator('#billing-more').evaluate(el=>el.open),false);
 await page.fill('#search-input','Café');assert.equal(await page.inputValue('#sale-entry-stock'),'5');
 assert.equal(await page.locator('#sale-inventory-btn').isVisible(),true);
 if(process.env.POS_SCREENSHOT_DIR){fs.mkdirSync(process.env.POS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'ventas-escritorio.png'),fullPage:true});}

 await page.click('#sale-inventory-btn');await page.fill('#sale-inventory-search','cafe');await page.fill('#stock-qty-1','2');await page.click('#stock-add-1');assert.equal(await page.evaluate(()=>cart[0].qty),2);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'sale-inventory-btn');await page.click('[data-workspace=home]');assert.equal(await page.evaluate(()=>cart[0].qty),2);await page.click('[data-home-action=sale]');await page.click('#clear-cart-btn');
 await page.click('[data-module=cash]');await page.click('#toggle-shift-btn');await page.waitForFunction(()=>state.shift.isOpen);
 await page.click('[data-module=pos]');await page.fill('#search-input','Café');await page.click('#sale-entry-add');await page.click('#process-sale-btn');await page.locator('#billing-modal:not(.hidden)').waitFor();assert.equal(await page.inputValue('#billing-cash-received'),'4.50');
 assert.equal(await page.locator('#cart-list tr.sale-line').count(),1);
 await page.click('#confirm-billing-btn');await page.waitForFunction(()=>state.sales.length===1 && !saleInFlight);assert.equal(await page.evaluate(()=>state.products[0].stock),4);
 const second=await browser.newPage();second.on('dialog',d=>d.accept());second.on('pageerror',e=>errors.push(e.message));await second.goto(base);await second.locator('#employee-select option').waitFor({state:'attached'});await second.fill('#pin-input','729184');await second.click('#login-btn');await second.locator('#app-shell:not(.hidden)').waitFor();assert.equal(await second.evaluate(()=>state.products[0].stock),4);
 // Lose the HTTP response after the server commits. Retrying must recover exactly one sale.
 await page.fill('#search-input','Café');await page.click('#sale-entry-add');await page.click('#process-sale-btn');let lost=false;
 await page.route('**/api/sales',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.click('#confirm-billing-btn');await page.waitForFunction(()=>pendingSale?.uncertain===true);assert.equal(await page.evaluate(()=>cart.length),1);
 await page.click('#process-sale-btn');await page.click('#confirm-billing-btn');await page.waitForFunction(()=>pendingSale===null && state.sales.length===2);
 assert.equal(await page.evaluate(()=>state.products[0].stock),3);await second.waitForFunction(()=>state.sales.length===2);assert.equal(await second.evaluate(()=>state.products[0].stock),3);
 await page.click('[data-workspace=home]');assert.equal(await page.locator('#home-sale-count').innerText(),'2');assert.match(await page.locator('#home-top-products').innerText(),/Café/);await page.selectOption('#home-period','30');assert.equal(await page.locator('.home-day').count(),30);
 if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'inicio-escritorio.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.click('#sidebar-toggle');assert.equal(await page.locator('#nav-menu').isVisible(),false);await page.click('#sidebar-toggle');assert.equal(await page.locator('#nav-menu').isVisible(),true);
 if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'inicio-movil.png'),fullPage:true});await page.setViewportSize({width:1600,height:1000});
 // User form references its own input, not the page heading.
 await page.click('[data-workspace=settings]');assert.deepEqual(await page.locator('#module-tabs button').allTextContents(),['General','Negocios','Usuarios']);await page.click('[data-module=users]');await page.click('#new-user-btn');await page.fill('#user-form-name','Prueba UI');await page.fill('#user-pin','654321');await page.selectOption('#user-role-input','cajero');await page.locator('#user-form button[type=submit]').click();await page.waitForFunction(()=>state.employees.some(u=>u.name==='Prueba UI'));
 await page.click('[data-workspace=documents]');await page.locator('#billing-invoices-body [data-document-action=json]').first().waitFor();
 assert.deepEqual(await page.locator('#module-tabs button').allTextContents(),['Comprobantes','Inventario','Reportes']);
 const downloadReady=page.waitForEvent('download');await page.locator('#billing-invoices-body [data-document-action=json]').first().click();const download=await downloadReady;
 assert.match(download.suggestedFilename(),/^comprobante-.*\.json$/);const json=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(json.schema_version,2);assert.equal(json.business_id,'principal');
 const popupReady=page.waitForEvent('popup');await page.locator('#billing-invoices-body [data-document-action=ticket]').first().click();const popup=await popupReady;await popup.locator('main.receipt').waitFor();assert.match(await popup.locator('body').innerText(),/Cambio/);await popup.close();
 // Floating inventory forms save through the real API and keep keyboard focus inside the dialog.
 await page.click('[data-module=inventory]');await page.click('#new-product-btn');assert.equal(await page.locator('#product-editor-dialog').isVisible(),true);
 await page.fill('#product-name','Producto modal');await page.fill('#product-category','Prueba');await page.fill('#product-price','1.13');await page.fill('#product-stock','2');await page.locator('#product-form button[type=submit]').click();await page.waitForFunction(()=>state.products.some(p=>p.name==='Producto modal'));assert.equal(await page.locator('#product-editor-dialog').isVisible(),false);
 await page.click('#inventory-count-btn');await page.fill('#inventory-check-counted','3');await page.fill('#inventory-check-notes','Conteo navegador');await page.evaluate(()=>syncFromServer());assert.equal(await page.inputValue('#inventory-check-counted'),'3');
 await page.locator('#inventory-check-form [data-close-floating]').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.id),'inventory-count-dialog');
 await page.locator('#inventory-check-form button[type=submit]').click();await page.locator('#inventory-count-dialog').waitFor({state:'hidden'});await page.locator('#inventory-checks-body').filter({hasText:'Conteo navegador'}).waitFor();
 await page.click('#receive-stock-btn');assert.equal(await page.locator('#receive-stock-dialog').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'receive-stock-btn');
 await page.click('[data-workspace=cash]');await page.click('[data-module=pos]');await page.click('#billing-new-customer-btn');await page.fill('#billing-customer-name','Cliente modal');await page.fill('#billing-customer-email','modal@example.test');await page.click('#save-customer-btn');await page.locator('#billing-more').waitFor({state:'hidden'});assert.equal(await page.locator('#sale-customer-summary').innerText(),'Cliente modal');
 await page.click('#customer-directory-btn');await page.fill('#billing-customer-search','Cliente modal');await page.locator('#customer-directory-body [data-customer-edit]').click();await page.fill('#billing-customer-phone','55512345');await page.click('#save-customer-btn');await page.locator('#billing-more').waitFor({state:'hidden'});
 await page.click('#customer-directory-btn');await page.click('#directory-general-customer');assert.equal(await page.locator('#sale-customer-summary').innerText(),'Cliente general');await page.click('#customer-directory-btn');await page.locator('#customer-directory-body [data-customer-use]').click();await page.locator('#customer-directory-dialog').waitFor({state:'hidden'});assert.equal(await page.inputValue('#billing-customer-phone'),'55512345');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('[data-workspace=cash]').isVisible(),true);
 await page.click('[data-workspace=cash]');await page.click('[data-module=pos]');await page.fill('#search-input','Café');await page.click('#sale-entry-add');
 assert.equal(await page.locator('#cart-list tr.sale-line').count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page must not overflow; the article table scrolls internally');
 await page.click('#billing-edit-customer-btn');assert.equal(await page.locator('#billing-more').evaluate(el=>el.open),true);assert.ok(await page.locator('#billing-more').evaluate(el=>{const r=el.getBoundingClientRect();return r.width<=innerWidth&&r.height<=innerHeight}));
 if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'ventas-movil.png'),fullPage:true});
 await page.setViewportSize({width:1600,height:1000});await page.locator('#billing-more [data-close-floating]').first().click();
 await page.click('#sale-inventory-btn');assert.ok(await page.locator('#sale-catalog').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.left-(innerWidth-r.width)/2)<2}),'Floating inventory is centered');if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'ventas-con-articulos.png'),fullPage:true});
 await page.locator('#sale-catalog [data-close-floating]').first().click();
 await page.evaluate(()=>setActiveModule('cash'));
 await page.click('#shift-report-x');await page.selectOption('#shift-report-output','save');await page.click('#shift-report-submit');await page.locator('#shift-report-dialog').waitFor({state:'hidden'});await page.locator('#shift-reports-body').getByText(/X-/).first().waitFor();
 await page.setViewportSize({width:390,height:844});await page.click('#shift-report-y');await page.fill('#shift-report-count','0');await page.selectOption('#shift-report-output','save');
 assert.ok(await page.locator('#shift-report-dialog').evaluate(el=>el.getBoundingClientRect().width<=innerWidth));if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'corte-movil.png'),fullPage:true});
 await page.click('#shift-report-submit');await page.locator('#shift-report-dialog').waitFor({state:'hidden'});await page.locator('#shift-reports-body').getByText(/Y-/).first().waitFor();assert.equal(await page.evaluate(()=>state.shift.isOpen),true);
 await page.click('#toggle-shift-btn');await page.fill('#shift-report-count','0');await page.selectOption('#shift-report-output','save');await page.click('#shift-report-submit');await page.locator('#shift-report-dialog').waitFor({state:'hidden'});await page.locator('#shift-reports-body').getByText(/Z-/).first().waitFor();assert.equal(await page.evaluate(()=>state.shift.isOpen),false);
 await page.setViewportSize({width:1600,height:1000});if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'cortes-historial.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browser OK: login rejection, login, shared shift, checkout/rounding, lost-response replay, two-device sync, create user, floating inventory/customer forms, count, focus, mobile layout and X/Y/Z cash reports; no page errors.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
