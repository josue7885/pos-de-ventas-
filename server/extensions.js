const crypto=require('node:crypto');
const {receiptDocument,receiptHtml}=require('./receipt');
const {loadDocument,captureProfile,documentFilename}=require('./documents');
const commerce=require('./commerce');
module.exports=function(app,getDb,{profile,requireAdminOrManager,ensureOpenPeriod}) {
 const db=()=>getDb(),{fail,math}=commerce;
 const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){next(e);}};
 function documentAccess(req){if(!['admin','gerente','cajero','contador'].includes(req.user.role))fail(403,'Permiso insuficiente');}
 function writer(req){if(!['admin','gerente','cajero'].includes(req.user.role))fail(403,'Permiso insuficiente');}
 function once(req,kind,work) {
  const key=req.get('Idempotency-Key');if(!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))fail(400,'Se requiere un identificador de operación');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
  return db().transaction(()=>{
   const old=db().prepare('SELECT * FROM operation_requests WHERE request_key=?').get(key);
   if(old){if(old.kind!==kind || old.user_id!==req.user.id || old.fingerprint!==fingerprint)fail(409,'Identificador utilizado para otra operación');return {id:old.result_id,replayed:true};}
   const id=work();db().prepare('INSERT INTO operation_requests(request_key,user_id,kind,fingerprint,result_id) VALUES (?,?,?,?,?)').run(key,req.user.id,kind,fingerprint,id);return {id,replayed:false};
  })();
 }
 const saleDocument=id=>loadDocument(db(),profile(),'sale',id);
 const quoteDocument=id=>loadDocument(db(),profile(),'quote',id);
 app.get('/api/documents',handle((req,res)=>{
  documentAccess(req);
  const sales=db().prepare('SELECT s.id FROM sales s JOIN invoices i ON i.sale_id=s.id ORDER BY s.id DESC LIMIT 1000').all().map(r=>saleDocument(r.id));
  const quotes=db().prepare('SELECT id FROM quotes ORDER BY id DESC LIMIT 1000').all().map(r=>quoteDocument(r.id));
  // The directory does not need logos or issuer details repeated for every row.
  res.json({documents:[...sales,...quotes].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(({issuer,...summary})=>summary)});
 }));
 app.get('/api/documents/:kind/:id/:format',handle((req,res)=>{
  documentAccess(req);if(!['sale','quote'].includes(req.params.kind))fail(404,'Tipo desconocido');
  const document=req.params.kind==='quote'?quoteDocument(req.params.id):saleDocument(req.params.id);
  if(req.params.format==='json'){
   res.setHeader('Content-Disposition',`attachment; filename="${documentFilename(document)}.json"`);return res.json(document);
  }
  if(req.params.format==='html')return res.type('html').set('X-Content-Type-Options','nosniff').send(receiptHtml(document));
  if(req.params.format!=='pdf')fail(404,'Formato desconocido');
  res.type('pdf').set('Content-Disposition',`attachment; filename="${documentFilename(document)}.pdf"`);const pdf=receiptDocument(document.issuer,document,document);pdf.on('error',()=>res.destroy());pdf.pipe(res);pdf.end();
 }));
 app.post('/api/quotes',handle((req,res)=>{
  writer(req);
  const result=once(req,'quote',()=>{
   const value=commerce.checkout(db(),req.body,req.user,Number(profile().iva_rate),{quote:true});
   const now=new Date(),until=new Date(now.getTime()+profile().quote_validity_days*24*60*60*1000);
   const customer=String(req.body.customerName||'Cliente general').slice(0,200);
   const snapshot={receipt_profile_id:captureProfile(db(),profile()),currency_code:profile().currency_code,...value.totals,discount_percent:value.percent,discount_reason:value.reason,customer_name:customer,customer_nit:String(req.body.customerNit||'CF').slice(0,40),customer_email:String(req.body.customerEmail||'').slice(0,254),customer_phone:String(req.body.customerPhone||'').slice(0,40),customer_address:String(req.body.customerAddress||'').slice(0,1000),customer_department:String(req.body.customerDepartment||'').slice(0,100),customer_municipality:String(req.body.customerMunicipality||'').slice(0,100),customer_giro:String(req.body.customerGiro||'').slice(0,200),document_type:req.body.documentType==='credito_fiscal'?'credito_fiscal':'consumidor_final',employee_name:req.user.name,items:value.items.map(it=>({...it,product_id:it.id,catalog_price:it.catalogPrice,price_reason:it.priceReason}))};
   return db().prepare('INSERT INTO quotes(user_id,created_at,valid_until,snapshot) VALUES (?,?,?,?)').run(req.user.id,now.toISOString(),until.toISOString(),JSON.stringify(snapshot)).lastInsertRowid;
  });res.json({quote:quoteDocument(result.id),replayed:result.replayed});
 }));
 app.post('/api/inventory/categories',handle((req,res)=>{
  if(!requireAdminOrManager(req,res))return;const name=String(req.body.name||'').trim();if(!name || name.length>100)fail(400,'Categoría inválida');
  db().prepare('INSERT OR IGNORE INTO inventory_categories(name) VALUES (?)').run(name);res.json({success:true});
 }));
 app.delete('/api/inventory/categories/:name',handle((req,res)=>{
  if(!requireAdminOrManager(req,res))return;
  if(db().prepare('SELECT id FROM products WHERE lower(category)=lower(?)').get(req.params.name))fail(409,'La categoría tiene artículos asignados');
  db().prepare('DELETE FROM inventory_categories WHERE name=?').run(req.params.name);res.json({success:true});
 }));
 app.get('/api/inventory/history',handle((req,res)=>{
  if(!requireAdminOrManager(req,res))return;
  const movements=db().prepare('SELECT m.*,p.name AS product_name,u.name AS employee_name FROM inventory_movements m LEFT JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 200').all();
  const receipts=db().prepare('SELECT r.*,p.name AS product_name FROM inventory_receipts r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.id DESC LIMIT 200').all();
  const checks=db().prepare('SELECT c.*,p.name AS product_name FROM inventory_checks c LEFT JOIN products p ON p.id=c.product_id ORDER BY c.id DESC LIMIT 200').all();
  res.json({movements,receipts,checks});
 }));
 app.post('/api/inventory/receive',handle((req,res)=>{
  if(!requireAdminOrManager(req,res))return;
  const result=once(req,'receive',()=>{
   const p=db().prepare('SELECT * FROM products WHERE id=?').get(req.body.productId);if(!p || p.type==='servicio')fail(400,'Selecciona un artículo con existencias');
   if(Number(req.body.expectedStock)!==p.stock)fail(409,'Las existencias cambiaron; actualiza el conteo');
   const count=commerce.qty(req.body.qty,p.unit),cost=commerce.amount(req.body.cost,'Costo');
   const balance=(math.quantity(p.stock)+math.quantity(count))/1000;if(balance>10000000)fail(400,'Existencias fuera de rango');
   const supplier=String(req.body.supplier||'').trim().slice(0,200),reference=String(req.body.reference||'').trim().slice(0,100),notes=String(req.body.notes||'').trim().slice(0,240);
   if(!supplier || !reference)fail(400,'Indica proveedor y referencia del ingreso');
   const total=Math.round(math.cents(cost)*math.quantity(count)/1000)/100;
   const tax=commerce.amount(req.body.tax??0,'IVA de la compra');
   if(total+tax>1000000)fail(400,'Importe de compra fuera de rango');
   const date=new Date().toISOString();ensureOpenPeriod(date);
   const id=db().prepare('INSERT INTO inventory_receipts(product_id,qty,cost,supplier,reference,notes,user_id,created_at) VALUES (?,?,?,?,?,?,?,?)').run(p.id,count,cost,supplier,reference,notes,req.user.id,date).lastInsertRowid;
   const averageCost=Math.round((math.cents(p.cost)*math.quantity(p.stock)+math.cents(cost)*math.quantity(count))/math.quantity(balance))/100;
   db().prepare('UPDATE products SET stock=?,cost=?,version=version+1 WHERE id=?').run(balance,averageCost,p.id);
   db().prepare('INSERT INTO inventory_movements(product_id,delta,balance,reason,user_id,created_at) VALUES (?,?,?,?,?,?)').run(p.id,count,balance,`Recepción #${id} · ${reference} · ${notes}`,req.user.id,date);
   db().prepare('INSERT INTO purchases(supplier_name,fecha,subtotal,iva,total,notes) VALUES (?,?,?,?,?,?)').run(supplier,date.slice(0,10),total,tax,(math.cents(total)+math.cents(tax))/100,`Recepción #${id} · ${reference}`);
   return id;
  });res.json({receipt:db().prepare('SELECT * FROM inventory_receipts WHERE id=?').get(result.id),replayed:result.replayed});
 }));
 app.get('/api/inventory/export',handle((req,res)=>{
  if(!requireAdminOrManager(req,res))return;
  const escape=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const rows=[['Código','Artículo','Categoría','Tipo','Unidad','Costo','Precio','Existencias','Mínimo'],...db().prepare('SELECT * FROM products ORDER BY name').all().map(p=>[p.code,p.name,p.category,p.type,p.unit,p.cost,p.price,p.stock,p.min_stock])];
  res.type('text/csv').set('Content-Disposition','attachment; filename="inventario.csv"').send('\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n'));
 }));
};
