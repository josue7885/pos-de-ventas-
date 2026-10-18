// Verify the real embedded Node runtime and copied backend, without touching user data.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-package-')),bundle=path.resolve(process.argv[2]||'dist/linux-unpacked'),exe=process.platform==='darwin'?path.join(bundle,'Contents/MacOS/POS Control'):path.join(bundle,process.platform==='win32'?'POS Control.exe':'pos-control-multiplatform'),resources=path.join(bundle,process.platform==='darwin'?'Contents/Resources':'resources');let child;
 async function stop(){if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
 async function start(){let out='';child=spawn(exe,[path.join(resources,'server/server.js')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',POS_DATA_DIR:dir,POS_ADMIN_PIN:'852963',PORT:'0',POS_HOST:'127.0.0.1'}});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Packaged server timeout: '+out));},20000);child.stderr.on('data',d=>out+=d);child.stdout.on('data',d=>{out+=d;const m=out.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve('http://127.0.0.1:'+m[1]);}});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);reject(Error('Packaged server exited '+code+': '+out));});});}
 try{
  let base=await start();assert.equal((await(await fetch(base+'/api/health')).json()).ready,true);
  for(const file of require('../package.json').build.extraResources.find(r=>r.from==='.').filter)assert.equal((await fetch(base+'/'+file)).status,200,file);
  const login=await(await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:1,pin:'852963'})})).json();assert(login.token);
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+login.token};const created=await fetch(base+'/api/products',{method:'POST',headers,body:JSON.stringify({name:'Prueba del paquete',category:'Pruebas',price:1.13,stock:3})});assert.equal(created.status,201);
  await stop();base=await start();const products=await(await fetch(base+'/api/products',{headers})).json();assert(JSON.stringify(products).includes('Prueba del paquete'));
  assert.equal((await fetch(base+'/server/pos.db')).status,404);assert.equal((await fetch(base+'/desktop/preload.cjs')).status,404);
  console.log('Packaged backend OK: embedded runtime, assets, login, write, restart and durable data.');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
