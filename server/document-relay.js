const crypto=require('node:crypto');
const {loadDocument}=require('./documents');
const {receiptBuffer}=require('./receipt');
const {sections}=require('./shift-reports');
const {reportDocument}=require('./report-pdf');
const nodemailer=require('nodemailer');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const wrap=fn=>(req,res,next)=>{try{Promise.resolve(fn(req,res)).catch(next);}catch(e){next(e);}};
const kinds=['sale','quote','credit_note','credit_payment','shift_report'];
const canRead=req=>['admin','gerente','cajero','contador'].includes(req.user?.role);
const canSend=req=>['admin','gerente','cajero'].includes(req.user?.role);
function destination(value){
 let u;try{u=new URL(value);}catch{fail(400,'Dirección de servidor inválida.');}
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail(400,'Usa una dirección HTTP/HTTPS sin ruta, credenciales ni parámetros.');
 const local=u.hostname==='localhost'||u.hostname==='[::1]'||/^127\./.test(u.hostname)||/^10\./.test(u.hostname)||/^192\.168\./.test(u.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname);
 if(u.protocol==='http:'&&!local)fail(400,'Para servidores fuera de la red privada utiliza HTTPS.');
 return u.origin;
}
function configuration(db){const row=db.prepare('SELECT value FROM relay_config WHERE id=1').get();return row?JSON.parse(row.value):null;}
function summary(c){return c?{url:c.url,business:c.business,autoSend:c.autoSend,configured:true,targetKey:c.targetKey}:{url:'',business:'principal',autoSend:false,configured:false};}
function envelopeValid(e){
 if(!e||typeof e!=='object'||!kinds.includes(e.kind)||!Number.isSafeInteger(e.sourceId)||e.sourceId<1||!/^\w[\w-]{15,99}$/.test(e.key||'')||typeof e.snapshot!=='object'||!e.snapshot||Array.isArray(e.snapshot))fail(400,'Documento inválido.');
 if(e.snapshot.kind!==e.kind||Number(e.snapshot.id)!==e.sourceId||typeof e.snapshot.number!=='string'||e.snapshot.number.length>160)fail(400,'Identificación del documento inválida.');
 if(typeof e.pdf!=='string'||e.pdf.length>6000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(e.pdf)||!Buffer.from(e.pdf,'base64').subarray(0,5).equals(Buffer.from('%PDF-')))fail(400,'PDF inválido o demasiado grande.');
 if(Buffer.byteLength(JSON.stringify(e.snapshot))>500000)fail(400,'Documento demasiado grande para envío.');
 return JSON.stringify({kind:e.kind,sourceId:e.sourceId,snapshot:e.snapshot,pdf:e.pdf});
}
async function pdfBuffer(snapshot){
 if(snapshot.kind!=='shift_report')return receiptBuffer(snapshot.issuer,snapshot,snapshot);
 const doc=reportDocument(snapshot.issuer,`CORTE ${snapshot.type} - ${snapshot.number}`,`Turno ${snapshot.shiftId}`,sections(snapshot),{note:snapshot.note||''});
 return new Promise((resolve,reject)=>{const parts=[];doc.on('data',p=>parts.push(p));doc.on('end',()=>resolve(Buffer.concat(parts)));doc.on('error',reject);doc.end();});
}
function registerReceiver(app,getDb,limiter){
 function device(req){const token=req.get('X-POS-Relay-Key')||'';if(!/^[a-f0-9]{64}$/.test(token))fail(401,'Clave de recepción requerida.');const d=getDb().prepare('SELECT * FROM relay_devices WHERE token_hash=? AND active=1').get(hash(token));if(!d)fail(401,'Clave de recepción inválida o revocada.');return d;}
 app.post('/api/document-relay/ping',limiter,wrap((req,res)=>{const d=device(req);res.json({service:'pos-document-relay',device:d.name,business:req.businessId});}));
 app.post('/api/document-relay/receive',limiter,wrap((req,res)=>{
  const d=device(req),raw=envelopeValid(req.body),digest=hash(raw),db=getDb();
  const result=db.transaction(()=>{
   const old=db.prepare('SELECT id,digest FROM relay_inbox WHERE device_id=? AND request_key=?').get(d.id,req.body.key);
   if(old){if(old.digest!==digest)fail(409,'La clave ya corresponde a otro documento.');return {id:old.id,replayed:true};}
   const id=db.prepare('INSERT INTO relay_inbox(device_id,request_key,kind,source_id,number,created_at,digest,payload,email_status) VALUES (?,?,?,?,?,?,?,?,?)').run(d.id,req.body.key,req.body.kind,req.body.sourceId,req.body.snapshot.number,new Date().toISOString(),digest,raw,'not_requested').lastInsertRowid;
   return {id,replayed:false};
  })();res.json({...result,service:'pos-document-relay',digest,stored:true});
 }));
}
const active=new Set();
function register(app,getDb,{profile,requireExecutivePin}){
 const db=()=>getDb();
 const read=req=>{if(!canRead(req))fail(403,'Permiso insuficiente.');};
 const admin=(req,res)=>{if(req.user?.role!=='admin')fail(403,'Solo el administrador configura conexiones.');return requireExecutivePin(req,res);};
 app.get('/api/document-relay/status',wrap((req,res)=>{
  read(req);const c=configuration(db());
  const outbox=c?db().prepare('SELECT id,kind,source_id,number,status,message,updated_at FROM relay_outbox WHERE target_key=? ORDER BY id DESC LIMIT 200').all(c.targetKey):[];
  const counts=c?db().prepare('SELECT status,COUNT(*) AS count FROM relay_outbox WHERE target_key=? GROUP BY status').all(c.targetKey):[];
  const inbox=db().prepare('SELECT i.id,i.kind,i.number,i.created_at,i.email_status,d.name AS device_name FROM relay_inbox i JOIN relay_devices d ON d.id=i.device_id ORDER BY i.id DESC LIMIT 200').all();
  res.json({configuration:summary(c),outbox,counts,inbox,devices:req.user.role==='admin'?db().prepare('SELECT id,name,active,created_at FROM relay_devices ORDER BY id DESC').all():[]});
 }));
 app.post('/api/document-relay/devices',wrap((req,res)=>{
  if(!admin(req,res))return;const name=String(req.body.name||'').trim();if(!name||name.length>100)fail(400,'Indica un nombre de hasta 100 caracteres.');
  const token=crypto.randomBytes(32).toString('hex'),id=db().prepare('INSERT INTO relay_devices(name,token_hash,active,created_at) VALUES (?,?,1,?)').run(name,hash(token),new Date().toISOString()).lastInsertRowid;
  res.json({id,name,token,business:req.businessId});
 }));
 app.delete('/api/document-relay/devices/:id',wrap((req,res)=>{if(!admin(req,res))return;db().prepare('UPDATE relay_devices SET active=0 WHERE id=?').run(req.params.id);res.json({success:true});}));
 app.put('/api/document-relay/configuration',wrap((req,res)=>{
  if(!admin(req,res))return;const old=configuration(db());
  const url=destination(req.body.url),business=String(req.body.business||'principal'),token=String(req.body.token||old?.token||'');
  if(!require('./businesses').validId(business)||!/^[a-f0-9]{64}$/.test(token)||typeof req.body.autoSend!=='boolean')fail(400,'Revisa negocio, clave de recepción y envío automático.');
  if(old&&(old.url!==url||old.business!==business)&&!req.body.token)fail(400,'Introduce la clave del nuevo destino.');
  const c={url,business,token,autoSend:req.body.autoSend,targetKey:hash(JSON.stringify([url,business,token]))};
  db().prepare('INSERT INTO relay_config(id,value) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(c));res.json({configuration:summary(c)});
 }));
 app.delete('/api/document-relay/configuration',wrap((req,res)=>{if(!admin(req,res))return;db().prepare('DELETE FROM relay_config WHERE id=1').run();res.json({success:true});}));
 async function contact(c,route,body){
  const r=await fetch(c.url+'/api/document-relay/'+route,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-POS-Business':c.business,'X-POS-Relay-Key':c.token},body:JSON.stringify(body)});
  let data;try{data=await r.json();}catch{fail(502,'El destino no respondió como servidor POS.');}
  if(!r.ok)fail(r.status,['Clave de recepción inválida o revocada.','La clave ya corresponde a otro documento.'].includes(data.error)?data.error:'El servidor receptor rechazó el documento ('+r.status+').');
  if(data.service!=='pos-document-relay')fail(502,'El destino no es un receptor POS compatible.');return data;
 }
 app.post('/api/document-relay/test',wrap(async(req,res)=>{if(!canSend(req))fail(403,'Permiso insuficiente.');const c=configuration(db());if(!c)fail(400,'Configura primero el servidor receptor.');res.json(await contact(c,'ping',{}));}));
 function enqueue(c){
  const selected=db(),p=profile();
  return selected.transaction(()=>{
   let added=0;
   for(const [kind,table] of [['sale','sales'],['quote','quotes'],['credit_note','credit_notes'],['credit_payment','credit_payments'],['shift_report','shift_reports']]){
    const rows=selected.prepare(`SELECT id FROM ${table} WHERE id NOT IN (SELECT source_id FROM relay_outbox WHERE target_key=? AND kind=?) ORDER BY id`).all(c.targetKey,kind);
    for(const row of rows){const snapshot=kind==='shift_report'?JSON.parse(selected.prepare('SELECT snapshot FROM shift_reports WHERE id=?').get(row.id).snapshot):loadDocument(selected,p,kind,row.id);
     selected.prepare('INSERT INTO relay_outbox(target_key,request_key,kind,source_id,number,snapshot,status,message,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(c.targetKey,crypto.randomUUID(),kind,row.id,snapshot.number,JSON.stringify(snapshot),'pending','Pendiente de enviar',new Date().toISOString());added++;
    }
   }return added;
  })();
 }
 app.post('/api/document-relay/send',wrap(async(req,res)=>{
  if(!canSend(req))fail(403,'Permiso insuficiente.');const c=configuration(db());if(!c)fail(400,'Configura primero el servidor receptor.');
  const lock=req.businessId+':'+c.targetKey;if(active.has(lock))return res.json({busy:true,sent:0});active.add(lock);
  const selected=db();let sent=0,added=0,error='';
  try{
   added=enqueue(c);
   const rows=selected.prepare("SELECT * FROM relay_outbox WHERE target_key=? AND status IN ('pending','sending') ORDER BY id LIMIT 25").all(c.targetKey);
   for(const row of rows){
    try{
     const snapshot=JSON.parse(row.snapshot);let pdf=row.pdf;
     if(!pdf){pdf=(await pdfBuffer(snapshot)).toString('base64');selected.prepare('UPDATE relay_outbox SET pdf=? WHERE id=?').run(pdf,row.id);}
     const envelope={key:row.request_key,kind:row.kind,sourceId:row.source_id,snapshot,pdf},raw=envelopeValid(envelope);
     selected.prepare("UPDATE relay_outbox SET status='sending',message='Enviando',updated_at=? WHERE id=?").run(new Date().toISOString(),row.id);
     const result=await contact(c,'receive',envelope);
     if(result.digest!==hash(raw)||!result.stored)fail(502,'El receptor no confirmó la integridad de la copia.');
     selected.prepare("UPDATE relay_outbox SET status='sent',message='Copia recibida por el servidor',updated_at=? WHERE id=?").run(new Date().toISOString(),row.id);sent++;
    }catch(e){error=e.status?e.message:'No se pudo conectar. El documento queda pendiente para reintentar.';const blocked=[400,409,413,422].includes(e.status);selected.prepare('UPDATE relay_outbox SET status=?,message=?,updated_at=? WHERE id=?').run(blocked?'blocked':'pending',error,new Date().toISOString(),row.id);if(!blocked)break;}
   }
  }finally{active.delete(lock);}
  const remaining=selected.prepare("SELECT COUNT(*) AS n FROM relay_outbox WHERE target_key=? AND status<>'sent'").get(c.targetKey).n;
  res.json({sent,added,remaining,error});
 }));
 app.post('/api/document-relay/outbox/:id/retry',wrap((req,res)=>{if(!canSend(req))fail(403,'Permiso insuficiente.');const c=configuration(db());if(!c)fail(400,'No hay destino configurado.');db().prepare("UPDATE relay_outbox SET status='pending',message='Reintento solicitado' WHERE id=? AND target_key=? AND status='blocked'").run(req.params.id,c.targetKey);res.json({success:true});}));
 function incoming(id){const r=db().prepare('SELECT * FROM relay_inbox WHERE id=?').get(id);if(!r)fail(404,'Copia no encontrada.');return {...r,envelope:JSON.parse(r.payload)};}
 app.get('/api/document-relay/inbox/:id/:format',wrap((req,res)=>{
  read(req);const row=incoming(req.params.id),e=row.envelope,base='copia-'+row.id;
  if(req.params.format==='json')return res.set('Content-Disposition',`attachment; filename="${base}.json"`).json(e.snapshot);
  if(req.params.format!=='pdf')fail(404,'Formato inválido.');
  res.type('pdf').set('Content-Disposition',`attachment; filename="${base}.pdf"`).send(Buffer.from(e.pdf,'base64'));
 }));
 app.post('/api/document-relay/inbox/:id/email',wrap(async(req,res)=>{
  if(!['admin','gerente','contador'].includes(req.user.role))fail(403,'Permiso insuficiente para correo de copias.');
  const recipient=req.body.recipient;if(typeof recipient!=='string'||recipient.length>254||!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(recipient))fail(400,'Indica un único correo válido.');
  const row=incoming(req.params.id),selected=db(),p=profile();
  if(row.email_status==='sending'||row.email_status==='uncertain')fail(409,'Un envío anterior no se confirmó. Revisa la bandeja antes de repetir.');
  if(row.email_status==='accepted')return res.json({sent:true,replayed:true,message:'Esta copia ya fue aceptada por SMTP. No se repitió el correo.'});
  if(!p.invoice_email_enabled||!p.smtp_host||!p.smtp_user||!p.smtp_password)fail(400,'Configura y activa SMTP en este servidor.');
  const claimed=selected.prepare("UPDATE relay_inbox SET email_status='sending' WHERE id=? AND email_status='not_requested'").run(row.id);if(!claimed.changes)fail(409,'El correo ya se está enviando.');
  const transport=nodemailer.createTransport({host:p.smtp_host,port:Number(p.smtp_port||587),secure:!!p.smtp_secure,auth:{user:p.smtp_user,pass:p.smtp_password},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000});
  try{await transport.sendMail({from:{name:p.smtp_from_name||p.company_name,address:p.smtp_from||p.smtp_user},to:recipient,subject:'Copia de documento '+row.number,text:'Copia recibida de otro dispositivo. No registra otra venta ni modifica inventario. Documento interno.',attachments:[{filename:'copia-'+row.id+'.pdf',content:Buffer.from(row.envelope.pdf,'base64'),contentType:'application/pdf'},{filename:'copia-'+row.id+'.json',content:JSON.stringify(row.envelope.snapshot,null,2),contentType:'application/json'}]});selected.prepare("UPDATE relay_inbox SET email_status='accepted' WHERE id=?").run(row.id);res.json({sent:true,message:'Correo aceptado por SMTP.'});}
  catch{selected.prepare("UPDATE relay_inbox SET email_status='uncertain' WHERE id=?").run(row.id);fail(502,'No se confirmó el correo. Revisa la bandeja del destinatario; no se reenviará automáticamente.');}
  finally{transport.close();}
 }));
}
module.exports={register,registerReceiver,destination,envelopeValid,pdfBuffer};
