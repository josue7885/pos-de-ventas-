const crypto=require('node:crypto');
const {fail,math,amount}=require('./commerce');
const {loadDocument}=require('./documents');
const methods=['efectivo','tarjeta','transferencia'];
function creditState(db,sale){
 const notes=db.prepare('SELECT total_cents,tax_cents,refund_cents FROM credit_notes WHERE sale_id=?').all(sale.id);
 const payments=db.prepare('SELECT amount_cents FROM credit_payments WHERE sale_id=?').all(sale.id);
 const total=math.cents(sale.total),credited=notes.reduce((s,n)=>s+n.total_cents,0),paid=payments.reduce((s,n)=>s+n.amount_cents,0),refunded=notes.reduce((s,n)=>s+n.refund_cents,0);
 return {original:total/100,credited:credited/100,paid:paid/100,refunded:refunded/100,available:(total-credited)/100,balance:sale.payment_method==='credito'?(total-credited-paid+refunded)/100:0,due_date:sale.credit_due_date||''};
}
function dateValid(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;}
function moneyCents(value){const n=math.cents(amount(value));if(!n||Math.abs(Number(value)*100-n)>1e-6)fail(400,'Indica un importe positivo con hasta dos decimales');return n;}
function register(app,getDb,{profile,ensureOpenPeriod,addVatBookEntry}){
 const db=()=>getDb();
 const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){next(e);}};
 function once(req,kind,work){
  const key=req.get('Idempotency-Key');if(!key||!/^[a-zA-Z0-9_-]{16,100}$/.test(key))fail(400,'Se requiere identificador de operación');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
  return db().transaction(()=>{
   const old=db().prepare('SELECT * FROM operation_requests WHERE request_key=?').get(key);
   if(old){if(old.kind!==kind||old.user_id!==req.user.id||old.fingerprint!==fingerprint)fail(409,'Identificador utilizado para otra operación');return {id:old.result_id,replayed:true};}
   const id=work();db().prepare('INSERT INTO operation_requests(request_key,user_id,kind,fingerprint,result_id) VALUES (?,?,?,?,?)').run(key,req.user.id,kind,fingerprint,id);return {id,replayed:false};
  })();
 }
 function saleFor(id){if(!Number.isSafeInteger(id)||id<1)fail(400,'Venta inválida');const s=db().prepare('SELECT * FROM sales WHERE id=?').get(id);if(!s)fail(404,'Venta no encontrada');return s;}
 function openShift(){const s=db().prepare('SELECT id FROM shifts WHERE closed_at IS NULL').get();if(!s)fail(409,'Abre la caja para registrar dinero recibido o devuelto');return s.id;}
 function baseDocument(sale,kind,date,user){const source=loadDocument(db(),profile(),'sale',sale.id);delete source.initial_balance;delete source.credit_due_date;return {...source,kind,id:undefined,number:undefined,created_at:date,employee_name:user.name,original_sale_id:sale.id,original_number:source.number,original_date:source.created_at,items:[],discount:0,discount_percent:0,discount_reason:'',received_amount:0,change_amount:0};}
 app.post('/api/credit-notes',handle((req,res)=>{
  if(!['admin','gerente'].includes(req.user.role))fail(403,'Solo administrador o gerente puede emitir notas de crédito');
  const result=once(req,'creditnote',()=>{
   const sale=saleFor(req.body.saleId),state=creditState(db(),sale),total=moneyCents(req.body.amount),reason=String(req.body.reason||'').trim();
   if(reason.length<3||reason.length>500)fail(400,'Indica un motivo de 3 a 500 caracteres');
   if(total>math.cents(state.available))fail(409,'La nota supera el importe pendiente de acreditar de esta venta');
   const date=new Date().toISOString();ensureOpenPeriod(date);
   const credited=math.cents(state.credited),previousTax=db().prepare('SELECT COALESCE(SUM(tax_cents),0) AS n FROM credit_notes WHERE sale_id=?').get(sale.id).n;
   // Cumulative allocation ensures that many partial notes recover exactly the original tax, including rounding.
   const tax=Math.round(math.cents(sale.tax)*(credited+total)/math.cents(sale.total))-previousTax;
   const refund=sale.payment_method==='credito'?Math.max(0,total-math.cents(state.balance)):total;
   let shift=null,method='';if(refund){method=req.body.refundMethod;if(!methods.includes(method)||!profile().payment_methods.includes(method))fail(400,'Selecciona el medio habilitado para devolver el importe');shift=openShift();}
   const doc=baseDocument(sale,'credit_note',date,req.user);
   Object.assign(doc,{reason,total:total/100,tax:tax/100,subtotal:(total-tax)/100,gross:total/100,prices_include_tax:true,payment_method:'',refund_amount:refund/100,refund_method:method,applied_to_balance:(total-refund)/100,balance_after:Math.max(0,math.cents(state.balance)-total)/100,items:[{name:'Ajuste: '+reason,qty:1,unit:'ajuste',price:total/100,line_total:total/100}]});
   const id=db().prepare('INSERT INTO credit_notes(sale_id,total_cents,tax_cents,refund_cents,refund_method,shift_id,user_id,created_at,snapshot) VALUES (?,?,?,?,?,?,?,?,?)').run(sale.id,total,tax,refund,method,shift,req.user.id,date,JSON.stringify(doc)).lastInsertRowid;
   addVatBookEntry({number:'NC-'+String(id).padStart(6,'0'),subtotal:-doc.subtotal,tax:-doc.tax,total:-doc.total,createdAt:date,customerName:doc.customer_name,customerNit:doc.customer_nit,tipo_receptor:doc.document_type});
   return id;
  });res.json({document:loadDocument(db(),profile(),'credit_note',result.id),replayed:result.replayed});
 }));
 app.post('/api/credit-payments',handle((req,res)=>{
  if(!['admin','gerente','cajero'].includes(req.user.role))fail(403,'Permiso insuficiente para registrar abonos');
  const result=once(req,'creditpayment',()=>{
   const sale=saleFor(req.body.saleId);if(sale.payment_method!=='credito')fail(400,'La venta no es al crédito');
   const state=creditState(db(),sale),total=moneyCents(req.body.amount),method=req.body.paymentMethod;
   if(total>math.cents(state.balance))fail(409,'El abono supera el saldo actual. Actualiza la cuenta');
   if(!methods.includes(method)||!profile().payment_methods.includes(method))fail(400,'Medio de pago inválido o desactivado');
   const date=new Date().toISOString();ensureOpenPeriod(date);const shift=openShift(),doc=baseDocument(sale,'credit_payment',date,req.user);
   Object.assign(doc,{reason:String(req.body.reference||'').trim().slice(0,240),payment_method:method,total:total/100,subtotal:total/100,tax:0,gross:total/100,prices_include_tax:false,received_amount:total/100,balance_after:(math.cents(state.balance)-total)/100,items:[{name:'Abono a '+doc.original_number,qty:1,unit:'abono',price:total/100,line_total:total/100}]});
   return db().prepare('INSERT INTO credit_payments(sale_id,amount_cents,payment_method,shift_id,user_id,created_at,snapshot) VALUES (?,?,?,?,?,?,?)').run(sale.id,total,method,shift,req.user.id,date,JSON.stringify(doc)).lastInsertRowid;
  });res.json({document:loadDocument(db(),profile(),'credit_payment',result.id),replayed:result.replayed});
 }));
 app.get('/api/credit-sales/:id',handle((req,res)=>{
  if(!['admin','gerente','cajero','contador'].includes(req.user.role))fail(403,'Permiso insuficiente');
  const sale=saleFor(Number(req.params.id));res.json({document:{...loadDocument(db(),profile(),'sale',sale.id),credit_state:creditState(db(),sale)}});
 }));
 app.get('/api/credit-accounts',handle((req,res)=>{
  if(!['admin','gerente','cajero','contador'].includes(req.user.role))fail(403,'Permiso insuficiente');
  const accounts=db().prepare("SELECT s.*,i.number FROM sales s JOIN invoices i ON i.sale_id=s.id WHERE s.payment_method='credito' ORDER BY s.credit_due_date,s.id").all().map(s=>({sale_id:s.id,number:s.number,customer_id:s.customer_id,customer_name:s.customer_name,...creditState(db(),s)}));
  res.json({accounts});
 }));
}
module.exports={register,creditState,dateValid};
