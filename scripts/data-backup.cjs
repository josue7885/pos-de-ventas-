// Offline backups: the same exclusive lock as the server prevents concurrent writes.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {acquireDataLock}=require('../server/data-lock');
const action=process.argv[2],target=process.argv[3];
const data=path.resolve(process.env.POS_DATA_DIR || path.join(__dirname,'../server'));
function checksum(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
async function main(){
  if(!['backup','restore'].includes(action) || !target)throw Error('Uso: npm run backup -- DIRECTORIO_NUEVO / npm run restore -- DIRECTORIO_RESPALDO');
  fs.mkdirSync(data,{recursive:true,mode:0o700});
  const releaseLock=acquireDataLock(data);
  try{
    const location=path.resolve(target);
    if(action==='backup'){
      if(fs.existsSync(location))throw Error('El destino debe ser un directorio nuevo.');
      const database=fs.readFileSync(path.join(data,'pos.db'));
      const SQL=await require('../server/node_modules/sql.js')();const check=new SQL.Database(database);
      if(check.exec('PRAGMA integrity_check')[0].values[0][0]!=='ok')throw Error('La base no supera integrity_check');check.close();
      fs.mkdirSync(location,{recursive:true,mode:0o700});
      fs.writeFileSync(path.join(location,'pos.db'),database,{mode:0o600});
      fs.writeFileSync(path.join(location,'backup.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),sha256:checksum(database)},null,2));
      console.log('Respaldo verificado: '+location+'. Las sesiones se invalidan al restaurar; no se copian claves.');
    }else{
      if(fs.existsSync(path.join(data,'pos.db')))throw Error('Restaura en un POS_DATA_DIR vacío para conservar la instalación anterior.');
      const meta=JSON.parse(fs.readFileSync(path.join(location,'backup.json'),'utf8'));
      const database=fs.readFileSync(path.join(location,'pos.db'));
      if(meta.version!==1 || meta.sha256!==checksum(database))throw Error('El respaldo está incompleto o fue modificado.');
      const SQL=await require('../server/node_modules/sql.js')();const restored=new SQL.Database(database);
      if(restored.exec('PRAGMA integrity_check')[0].values[0][0]!=='ok')throw Error('Base de datos dañada.');
      if(restored.exec("SELECT name FROM sqlite_master WHERE name='sessions'").length)restored.run('DELETE FROM sessions');
      fs.writeFileSync(path.join(data,'pos.db'),Buffer.from(restored.export()),{flag:'wx',mode:0o600});restored.close();
      console.log('Restaurado en '+data+'. Inicia sesión de nuevo.');
    }
  }finally{releaseLock();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
