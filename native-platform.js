/* Native capabilities are only exposed inside the installed Capacitor application. */
(()=>{
 const cap=window.Capacitor,active=Boolean(cap?.isNativePlatform?.());
 if(!active){window.POSNative=Object.freeze({active:false});return;}
 const Filesystem=cap.registerPlugin('Filesystem'),Share=cap.registerPlugin('Share'),Browser=cap.registerPlugin('Browser');
 let sharing=false;
 async function shareFile(blob,filename){
  if(sharing)throw Error('Termina de compartir el documento anterior.');
  sharing=true;let path,written=false;
  try{const entries=await Filesystem.readdir({path:'',directory:'CACHE'});for(const file of entries.files||[]){const match=/^pos-(\d+)-/.exec(file.name);if(match&&Date.now()-Number(match[1])>86400000)await Filesystem.deleteFile({path:file.name,directory:'CACHE'}).catch(()=>{});}}catch{}
  try{
   const safe=String(filename).replace(/[^A-Za-z0-9._-]/g,'_').slice(-120)||'documento.pdf';
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('No se pudo leer el documento'));reader.readAsDataURL(blob);});
   path=`pos-${Date.now()}-${safe}`;
   const file=await Filesystem.writeFile({path,directory:'CACHE',data});
   written=true;
   await Share.share({files:[file.uri],title:safe,dialogTitle:'Guardar o compartir documento'});
  }finally{
   // The receiving app may read after the share sheet closes. Prune on a later share.
   if(path&&!written)await Filesystem.deleteFile({path,directory:'CACHE'}).catch(()=>{});
   sharing=false;
  }
 }
 async function openWhatsApp(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.hostname!=='wa.me'||u.username||u.password||u.port||!/^\/[1-9]\d{6,14}$/.test(u.pathname)||[...u.searchParams.keys()].some(k=>k!=='text'))throw Error('Enlace de WhatsApp inválido.');
  await Browser.open({url:u.href});
 }
 window.POSNative=Object.freeze({active,shareFile,openWhatsApp});
})();
