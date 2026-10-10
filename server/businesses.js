const {AsyncLocalStorage}=require('node:async_hooks');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const config=require('./business-config');
const {fail}=require('./commerce');
const PRIMARY='principal';
const validId=id=>id===PRIMARY || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
module.exports=function createBusinesses(rootPromise,{directory,secret}){
 const context=new AsyncLocalStorage(),databases=new Map(),creating=new Map();let root;
 const ready=rootPromise.then(db=>{
  root=db;db.transaction(()=>{
   db.prepare('CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)').run();
   db.prepare('CREATE TABLE IF NOT EXISTS business_requests (request_key TEXT PRIMARY KEY,user_id INTEGER NOT NULL,fingerprint TEXT NOT NULL,business_id TEXT NOT NULL)').run();
   db.prepare('INSERT OR IGNORE INTO businesses(id,name,active,created_at) VALUES (?,?,1,?)').run(PRIMARY,'Negocio principal',new Date().toISOString());
  })();databases.set(PRIMARY,Promise.resolve(db));return db;
 });
 const current=()=>context.getStore();
 // Request-scoped access survives awaits; no global mutable business selector.
 const db=new Proxy({}, {get(_,key){const selected=current()?.db;if(!selected)throw Error('Falta el contexto del negocio');const value=selected[key];return typeof value==='function'?value.bind(selected):value;}});
 const location=id=>id===PRIMARY?directory:path.join(directory,'businesses',id);
 async function open(id){
  if(!databases.has(id)){
   if(!fs.existsSync(path.join(location(id),'pos.db')))fail(503,'Faltan los datos de este negocio. Restaura un respaldo completo.');
   const promise=require('./db').open({directory:location(id),adminPin:''});databases.set(id,promise);promise.catch(()=>databases.delete(id));
  }
  return databases.get(id);
 }
 async function middleware(req,res,next){
  try{await ready;const id=req.get('X-POS-Business') || PRIMARY;if(!validId(id))fail(400,'Identificador de negocio inválido');
   const business=root.prepare('SELECT * FROM businesses WHERE id=? AND active=1').get(id);if(!business)fail(404,'Negocio no disponible');
   const selected=await open(id);req.businessId=id;res.setHeader('X-POS-Business',id);context.run({id,db:selected,directory:location(id),business},()=>next());
  }catch(error){next(error);}
 }
 const list=all=>root.prepare('SELECT id,name,active,created_at FROM businesses'+(all?'':' WHERE active=1')+' ORDER BY created_at,id').all();
 function rootAdmin(req,res){if(req.businessId!==PRIMARY || req.user?.role!=='admin'){res.status(403).json({error:'La gestión de negocios requiere un administrador del negocio principal'});return false;}return true;}
 function register(app,{requireExecutivePin,limiter}){
  app.get('/api/platform/businesses',(req,res)=>{if(rootAdmin(req,res))res.json({businesses:list(true),primaryId:PRIMARY});});
  app.get('/api/platform/businesses/requests/:key',(req,res)=>{if(!rootAdmin(req,res))return;const row=root.prepare('SELECT business_id FROM business_requests WHERE request_key=? AND user_id=?').get(req.params.key,req.user.id);if(!row)return res.status(404).json({error:'No hay creación confirmada con ese identificador'});res.json({business:root.prepare('SELECT id,name,active,created_at FROM businesses WHERE id=?').get(row.business_id),replayed:true});});
  app.post('/api/platform/businesses',limiter,async(req,res,next)=>{
   try{
    if(!rootAdmin(req,res) || !requireExecutivePin(req,res))return;
    const key=req.get('Idempotency-Key');if(!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))fail(400,'Se requiere identificador de operación');
    const input=req.body,fingerprint=crypto.createHmac('sha256',secret).update(JSON.stringify(input)).digest('hex'),userId=req.user.id;
    const existing=()=>{const r=root.prepare('SELECT * FROM business_requests WHERE request_key=?').get(key);if(!r)return null;if(r.user_id!==userId || r.fingerprint!==fingerprint)fail(409,'Identificador utilizado para otra operación');return {business:root.prepare('SELECT id,name,active,created_at FROM businesses WHERE id=?').get(r.business_id),replayed:true};};
    let result=existing();if(result)return res.json(result);
    if(creating.has(key)){await creating.get(key);return res.json(existing());}
    const work=(async()=>{
     const name=String(input.name||'').trim(),adminName=String(input.adminName||'Administrador').trim(),type=input.business_type || 'retail';
     if(!name||name.length>100||!adminName||adminName.length>100||!/^\d{6,12}$/.test(String(input.adminPin||'')) || !config.presets[type])fail(400,'Indica nombre, tipo y PIN inicial de 6 a 12 dígitos');
     if(root.prepare('SELECT id FROM businesses WHERE name=?').get(name))fail(409,'Ya existe un negocio con ese nombre');
     const settings=config.validate({...config.defaults,...config.presets[type],...Object.fromEntries(['currency_code','number_locale'].filter(k=>input[k]!==undefined).map(k=>[k,input[k]])),business_type:type});
     const id=crypto.randomUUID(),target=location(id);let created;
     try{
      created=await require('./db').open({directory:target,adminPin:String(input.adminPin),adminName});
      created.transaction(()=>{const put=created.prepare('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');for(const [k,v]of Object.entries({...settings,company_name:name}))put.run(k,String(v));})();
      root.transaction(()=>{root.prepare('INSERT INTO businesses(id,name,active,created_at) VALUES (?,?,1,?)').run(id,name,new Date().toISOString());root.prepare('INSERT INTO business_requests(request_key,user_id,fingerprint,business_id) VALUES (?,?,?,?)').run(key,userId,fingerprint,id);})();
      databases.set(id,Promise.resolve(created));return {business:root.prepare('SELECT id,name,active,created_at FROM businesses WHERE id=?').get(id),replayed:false};
     }catch(error){if(created)created.close();fs.rmSync(target,{recursive:true,force:true});throw error;}
    })();creating.set(key,work);
    try{result=await work;}finally{creating.delete(key);}res.status(201).json(result);
   }catch(error){next(error);}
  });
  app.patch('/api/platform/businesses/:id',limiter,(req,res,next)=>{
   try{
    if(!rootAdmin(req,res)||!requireExecutivePin(req,res))return;
    const existing=root.prepare('SELECT * FROM businesses WHERE id=?').get(req.params.id);if(!existing)fail(404,'Negocio no encontrado');
    const name=String(req.body.name??existing.name).trim(),active=req.body.active;if(!name||name.length>100 || (active!==undefined && typeof active!=='boolean'))fail(400,'Nombre o estado inválido');
    if(existing.id===PRIMARY && active===false)fail(409,'El negocio principal debe permanecer activo');
    if(root.prepare('SELECT id FROM businesses WHERE name=? AND id<>?').get(name,existing.id))fail(409,'Nombre ya utilizado');
    root.prepare('UPDATE businesses SET name=?,active=? WHERE id=?').run(name,active===undefined?existing.active:Number(active),existing.id);res.json({business:root.prepare('SELECT id,name,active,created_at FROM businesses WHERE id=?').get(existing.id)});
   }catch(error){next(error);}
  });
 }
 return {ready,middleware,register,db,current,list,isReady:()=>Boolean(root),primaryId:PRIMARY};
};
module.exports.validId=validId;
