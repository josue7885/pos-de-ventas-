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
 assert.deepEqual(await page.locator('#nav-menu button').allTextContents(),['Caja','Documentos','Configuración']);
 assert.equal(await page.locator('#billing-more').evaluate(el=>el.open),false);
 await page.fill('#search-input','Café');assert.equal(await page.inputValue('#sale-entry-stock'),'5');
 assert.equal(await page.locator('.sales-toolbar [data-sale-target=inventory]').isVisible(),true);
 if(process.env.POS_SCREENSHOT_DIR){fs.mkdirSync(process.env.POS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'ventas-escritorio.png'),fullPage:true});}

 await page.click('[data-module=cash]');await page.click('#toggle-shift-btn');await page.waitForFunction(()=>state.shift.isOpen);
 await page.click('[data-module=pos]');await page.fill('#search-input','Café');await page.click('#sale-entry-add');await page.click('#process-sale-btn');await page.locator('#billing-modal:not(.hidden)').waitFor();assert.equal(await page.inputValue('#billing-cash-received'),'5.09');
 assert.equal(await page.locator('#cart-list tr.sale-line').count(),1);
 await page.click('#confirm-billing-btn');await page.waitForFunction(()=>state.sales.length===1 && !saleInFlight);assert.equal(await page.evaluate(()=>state.products[0].stock),4);
 const second=await browser.newPage();second.on('dialog',d=>d.accept());second.on('pageerror',e=>errors.push(e.message));await second.goto(base);await second.locator('#employee-select option').waitFor({state:'attached'});await second.fill('#pin-input','729184');await second.click('#login-btn');await second.locator('#app-shell:not(.hidden)').waitFor();assert.equal(await second.evaluate(()=>state.products[0].stock),4);
 // Lose the HTTP response after the server commits. Retrying must recover exactly one sale.
 await page.fill('#search-input','Café');await page.click('#sale-entry-add');await page.click('#process-sale-btn');let lost=false;
 await page.route('**/api/sales',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.click('#confirm-billing-btn');await page.waitForFunction(()=>pendingSale?.uncertain===true);assert.equal(await page.evaluate(()=>cart.length),1);
 await page.click('#process-sale-btn');await page.click('#confirm-billing-btn');await page.waitForFunction(()=>pendingSale===null && state.sales.length===2);
 assert.equal(await page.evaluate(()=>state.products[0].stock),3);await second.waitForFunction(()=>state.sales.length===2);assert.equal(await second.evaluate(()=>state.products[0].stock),3);
 // User form references its own input, not the page heading.
 await page.click('[data-workspace=settings]');assert.deepEqual(await page.locator('#module-tabs button').allTextContents(),['General','Negocios','Usuarios']);await page.click('[data-module=users]');await page.click('#new-user-btn');await page.fill('#user-form-name','Prueba UI');await page.fill('#user-pin','654321');await page.selectOption('#user-role-input','cajero');await page.locator('#user-form button[type=submit]').click();await page.waitForFunction(()=>state.employees.some(u=>u.name==='Prueba UI'));
 await page.click('[data-workspace=documents]');await page.locator('#billing-invoices-body [data-document-action=json]').first().waitFor();
 assert.deepEqual(await page.locator('#module-tabs button').allTextContents(),['Comprobantes','Inventario','Reportes']);
 const downloadReady=page.waitForEvent('download');await page.locator('#billing-invoices-body [data-document-action=json]').first().click();const download=await downloadReady;
 assert.match(download.suggestedFilename(),/^comprobante-.*\.json$/);const json=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(json.schema_version,2);assert.equal(json.business_id,'principal');
 const popupReady=page.waitForEvent('popup');await page.locator('#billing-invoices-body [data-document-action=ticket]').first().click();const popup=await popupReady;await popup.locator('main.receipt').waitFor();assert.match(await popup.locator('body').innerText(),/Cambio/);await popup.close();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('[data-workspace=cash]').isVisible(),true);assert.equal(await page.locator('[data-module=inventory]').isVisible(),true);
 await page.click('[data-workspace=cash]');await page.click('[data-module=pos]');await page.fill('#search-input','Café');await page.click('#sale-entry-add');
 assert.equal(await page.locator('#cart-list tr.sale-line').count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page must not overflow; the article table scrolls internally');
 await page.click('#billing-edit-customer-btn');assert.equal(await page.locator('#billing-more').evaluate(el=>el.open),true);
 if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'ventas-movil.png'),fullPage:true});
 await page.setViewportSize({width:1600,height:1000});await page.locator('#billing-more summary').click();
 if(process.env.POS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.POS_SCREENSHOT_DIR,'ventas-con-articulos.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browser OK: login rejection, login, shared shift, checkout/rounding, lost-response replay, two-device sync, create user; no page errors.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
