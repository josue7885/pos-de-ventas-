// Run on an actual desktop session or xvfb-run on Linux. Uses isolated temporary data.
const {_electron}=require('playwright'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-desktop-'));let app;
 const env={...process.env,XDG_CONFIG_HOME:dir,APPDATA:dir,POS_DATA_DIR:path.join(dir,'data'),POS_ADMIN_PIN:''};
 try{
  app=await _electron.launch({args:[path.resolve(__dirname,'..'),'--user-data-dir='+path.join(dir,'profile')],env});
  let page=await app.firstWindow();await page.waitForFunction(()=>window.posSetup);await page.locator('#data-location').filter({hasText:'Datos locales:'}).waitFor();
  assert.match(await page.title(),/Preparar/);await page.fill('#pin','852963');await page.fill('#pin-confirm','852963');
  // Reserve a free port, not the normal workstation port.
  const net=require('node:net'),probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));await page.fill('#port',String(port));
  const next=app.waitForEvent('window');await page.click('#start');page=await next;await page.locator('#employee-select option').waitFor({state:'attached'});
  assert.equal(await page.evaluate(()=>typeof window.posSetup),'undefined');assert.equal(await page.evaluate(()=>typeof require),'undefined');
  await page.fill('#pin-input','852963');await page.click('#login-btn');await page.locator('#app-shell:not(.hidden)').waitFor();
  const userData=await app.evaluate(({app})=>app.getPath('userData'));const config=JSON.parse(fs.readFileSync(path.join(userData,'installation.json')));assert.equal(config.port,port);assert.equal(config.pin,undefined);
  assert.equal(fs.existsSync(path.join(dir,'data/pos.db')),true);await app.close();app=null;
  app=await _electron.launch({args:[path.resolve(__dirname,'..'),'--user-data-dir='+path.join(dir,'profile')],env});page=await app.firstWindow();await page.locator('#employee-select option').waitFor({state:'attached'});assert.equal(new URL(page.url()).port,String(port));
  await page.fill('#pin-input','852963');await page.click('#login-btn');await page.locator('#app-shell:not(.hidden)').waitFor();console.log('Desktop OK: first-run setup, isolated bridge, login, fixed port and restart.');
 }finally{await app?.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
