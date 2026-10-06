// Offline, integrity-checked backup of the primary database and every business.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {acquireDataLock}=require('../server/data-lock');
const action=process.argv[2],target=process.argv[3];
const data=path.resolve(process.env.POS_DATA_DIR || path.join(__dirname,'../server'));
const checksum=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const validFile=name=>name==='pos.db'||/^businesses\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/pos\.db$/.test(name);
async function main(){
 if(!['backup','restore'].includes(action)||!target)throw Error('Uso: npm run backup -- DIRECTORIO_NUEVO / npm run restore -- DIRECTORIO_RESPALDO');
 fs.mkdirSync(data,{recursive:true,mode:0o700});const release=[acquireDataLock(data)];
 try{
 const SQL=await require('../server/node_modules/sql.js')();
 function inspect(buffer,clearSessions=false){
  const db=new SQL.Database(buffer);
  try{
   if(db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0]!=='ok')throw Error('La base no supera integrity_check');
   const rows=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='businesses'");
   const ids=rows.length?(db.exec("SELECT id FROM businesses WHERE id<>'principal'")[0]?.values||[]).map(r=>r[0]):[];
   const files=['pos.db',...ids.map(id=>'businesses/'+id+'/pos.db')];if(files.some(f=>!validFile(f)))throw Error('Identificador inválido en el catálogo de negocios');
   if(clearSessions && db.exec("SELECT name FROM sqlite_master WHERE name='sessions'").length)db.run('DELETE FROM sessions');
   return {files,buffer:clearSessions?Buffer.from(db.export()):buffer};
  }finally{db.close();}
 }
 const location=path.resolve(target);
 if(action==='backup'){
  if(fs.existsSync(location))throw Error('El destino debe ser un directorio nuevo');
  const primary=fs.readFileSync(path.join(data,'pos.db')),files=inspect(primary).files;
  for(const file of files.slice(1))release.push(acquireDataLock(path.dirname(path.join(data,file))));
  const buffers=files.map(file=>{const buffer=file==='pos.db'?primary:fs.readFileSync(path.join(data,file));inspect(buffer);return {file,buffer};});
  fs.mkdirSync(location,{recursive:true,mode:0o700});
  for(const {file,buffer} of buffers){fs.mkdirSync(path.dirname(path.join(location,file)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(location,file),buffer,{flag:'wx',mode:0o600});}
  fs.writeFileSync(path.join(location,'backup.json'),JSON.stringify({version:2,createdAt:new Date().toISOString(),files:buffers.map(({file,buffer})=>({path:file,sha256:checksum(buffer)}))},null,2),{flag:'wx',mode:0o600});
  console.log(`Respaldo verificado: ${location}. ${files.length} negocios. Las sesiones se invalidan al restaurar; no se copian claves.`);
 }else{
  if(fs.readdirSync(data).some(name=>name!=='pos.lock'))throw Error('Restaura en un POS_DATA_DIR vacío para conservar la instalación anterior');
  const meta=JSON.parse(fs.readFileSync(path.join(location,'backup.json'),'utf8'));
  const files=meta.version===1?[{path:'pos.db',sha256:meta.sha256}]:meta.version===2?meta.files:null;
  if(!Array.isArray(files)||!files.length||files.some(f=>!f||!validFile(f.path))||new Set(files.map(f=>f.path)).size!==files.length)throw Error('Manifiesto de respaldo inválido');
  const buffers=files.map(f=>{const buffer=fs.readFileSync(path.join(location,f.path));if(checksum(buffer)!==f.sha256)throw Error('El respaldo está incompleto o fue modificado');return {file:f.path,...inspect(buffer,true)};});
  const expected=buffers.find(f=>f.file==='pos.db')?.files;
  if(!expected || expected.length!==buffers.length || expected.some(p=>!buffers.some(b=>b.file===p)))throw Error('Faltan bases de negocios en el respaldo');
  // Verify every file before writing any database. Never start a failed restore automatically.
  for(const {file,buffer}of buffers){fs.mkdirSync(path.dirname(path.join(data,file)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(data,file),buffer,{flag:'wx',mode:0o600});}
  console.log(`Restaurado en ${data}. ${buffers.length} negocios. Inicia sesión de nuevo.`);
 }
 }finally{for(const unlock of release.reverse())unlock();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
