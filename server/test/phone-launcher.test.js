const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
test('phone launcher isolates persistent data, initializes PIN and releases its child on shutdown',{skip:process.platform==='win32'?'El lanzador Bash se prueba en Linux; Android requiere Termux.':false,timeout:20000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-phone-'));let child;
 async function start(first){
  child=spawn('bash',['scripts/phone-server.sh'],{cwd:path.resolve(__dirname,'../..'),env:{...process.env,POS_DATA_DIR:dir,PORT:'0'}});let logs='';child.stderr.on('data',d=>logs+=d);
  const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(logs)),10000);child.stdout.on('data',d=>{logs+=d;const m=logs.match(/listening on port (\d+)/);if(m){clearTimeout(timer);resolve({base:'http://127.0.0.1:'+m[1],logs});}});child.once('exit',()=>{clearTimeout(timer);reject(Error(logs));});});
  if(first)child.stdin.write('729184\n729184\n');child.stdin.end();return result;
 }
 async function stop(){if(child?.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}}
 try{
  let run=await start(true);assert.ok(!run.logs.includes('729184'));assert.match(run.logs,/Datos del teléfono/);
  const login=await fetch(run.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://localhost'},body:JSON.stringify({id:1,pin:'729184'})});assert.equal(login.status,200);assert.equal(login.headers.get('access-control-allow-origin'),'https://localhost');
  await stop();assert.equal(fs.existsSync(path.join(dir,'pos.lock')),false);assert.equal(fs.existsSync(path.join(dir,'pos.db')),true);
  run=await start(false);const health=await fetch(run.base+'/api/health').then(r=>r.json());assert.equal(health.ready,true);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
