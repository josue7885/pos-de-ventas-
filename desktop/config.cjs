const fs=require('node:fs'),path=require('node:path');
function validateConfig(value){
 if(!value||!['local','remote'].includes(value.mode))throw Error('Selecciona cómo usar esta instalación.');
 if(value.mode==='local'){
  const port=Number(value.port??37891);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Puerto inválido (1024–65535).');
  return {mode:'local',port,shareNetwork:value.shareNetwork===true};
 }
 let url;try{url=new URL(value.url);}catch{throw Error('Escribe la dirección completa del servidor.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Usa el origen del servidor: https://servidor o http://IP:puerto, sin rutas ni credenciales.');
 return {mode:'remote',url:url.origin};
}
function saveConfig(file,value){const config=validateConfig(value);fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(config,null,2),{mode:0o600});fs.renameSync(tmp,file);return config;}
function isWhatsAppUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='wa.me'&&!u.username&&!u.password&&!u.port&&/^\/[1-9]\d{6,14}$/.test(u.pathname)&&[...u.searchParams.keys()].every(k=>k==='text');}catch{return false;}}
module.exports={validateConfig,saveConfig,isWhatsAppUrl};
