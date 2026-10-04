const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {acquireDataLock}=require('../data-lock');

test('data lock rejects active or malformed owners and supports orphaned legacy PIDs',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-lock-'));
 const file=path.join(dir,'pos.lock');
 try {
  const release=acquireDataLock(dir);
  const active=fs.readFileSync(file,'utf8');
  assert.throws(()=>acquireDataLock(dir),/proceso activo/);
  assert.equal(fs.readFileSync(file,'utf8'),active);
  release();
  for(const invalid of ['', '0', '-1', 'invalid', '{"pid":null}']) {
   fs.writeFileSync(file,invalid);
   assert.throws(()=>acquireDataLock(dir),/inválido/);
   assert.equal(fs.readFileSync(file,'utf8'),invalid);
  }
  const exited=spawnSync(process.execPath,['-e','process.exit(0)']);
  assert.equal(exited.status,0);
  fs.writeFileSync(file,String(exited.pid));
  const unlock=acquireDataLock(dir);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).pid,process.pid);
  // A delayed release must never remove a different owner's lock.
  fs.writeFileSync(file,active);
  unlock();assert.equal(fs.readFileSync(file,'utf8'),active);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
