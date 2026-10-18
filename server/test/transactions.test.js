const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('transaction failures and failed disk writes roll back memory and durable SQLite together',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-tx-'));
 try{
 const result=spawnSync(process.execPath,['-e',`
 const assert=require('assert/strict'),fs=require('fs'),path=require('path');
 (async()=>{
 const db=await require('./db');
 db.prepare('INSERT INTO products(name,category,price,stock) VALUES (?,?,?,?)').run('Test','Test',1,5);
 const file=path.join(process.env.POS_DATA_DIR,'pos.db');
 const before=fs.readFileSync(file);
 assert.throws(db.transaction(()=>{db.prepare('UPDATE products SET stock=0').run();db.prepare('INSERT INTO sales(total) VALUES (?)').run(99);throw new Error('fail after partial writes')}));
 assert.equal(db.prepare('SELECT stock FROM products').get().stock,5);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0);
 assert.deepEqual(fs.readFileSync(file),before);
 const original=fs.renameSync;
 fs.renameSync=()=>{throw new Error('disk failure')};
 assert.throws(()=>db.prepare('UPDATE products SET stock=0').run(),/disk failure/);
 fs.renameSync=original;
 assert.equal(db.prepare('SELECT stock FROM products').get().stock,5);
 assert.deepEqual(fs.readFileSync(file),before);
 db.prepare('UPDATE products SET stock=4').run();
 assert.equal(db.prepare('SELECT stock FROM products').get().stock,4);
 })().catch(error=>{console.error(error);process.exitCode=1});
 `],{cwd:path.join(__dirname,'..'),env:{...process.env,POS_DATA_DIR:dir,POS_ADMIN_PIN:'891723'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
