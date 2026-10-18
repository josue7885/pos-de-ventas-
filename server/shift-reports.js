const crypto = require('node:crypto');
const {publicProfile} = require('./documents');
const {reportDocument} = require('./report-pdf');
const labels = {efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia',credito:'Crédito (sin cobro inicial)'};
const definitions = {X:'Consulta acumulada; no cierra el turno.',Y:'Arqueo parcial acumulado; no cierra ni reinicia el turno.',Z:'Cierre definitivo del turno.'};
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
function moneyInput(value){
 if(!['number','string'].includes(typeof value)||String(value).trim()==='')fail(400,'Indica el efectivo contado.');
 const n=Number(value),c=Math.round(n*100);
 if(!Number.isFinite(n)||n<0||n>1000000||Math.abs(n*100-c)>1e-6)fail(400,'Efectivo inválido: usa un monto no negativo con hasta dos decimales.');
 return c;
}
function totals(db,id){
 const rows=Object.keys(labels).map(method=>({method,label:labels[method],count:0,salesCents:0,paymentsCents:0,refundsCents:0,netCents:0}));
 const by=Object.fromEntries(rows.map(r=>[r.method,r]));
 const sales=db.prepare('SELECT s.id,s.created_at,s.employee_name,s.payment_method,s.total,s.tax,i.number FROM sales s LEFT JOIN invoices i ON i.sale_id=s.id WHERE s.shift_id=? ORDER BY s.id').all(id);
 for(const sale of sales){const row=by[sale.payment_method];if(!row)fail(409,'El turno contiene un método de pago desconocido.');row.count++;row.salesCents+=Math.round(sale.total*100);}
 for(const p of db.prepare('SELECT payment_method,amount_cents FROM credit_payments WHERE shift_id=?').all(id))by[p.payment_method].paymentsCents+=p.amount_cents;
 for(const n of db.prepare('SELECT refund_method,refund_cents FROM credit_notes WHERE shift_id=?').all(id)){if(n.refund_cents)by[n.refund_method].refundsCents+=n.refund_cents;}
 for(const row of rows)row.netCents=(row.method==='credito'?0:row.salesCents)+row.paymentsCents-row.refundsCents;
 return {rows,sales,salesCents:rows.reduce((s,r)=>s+r.salesCents,0),taxCents:sales.reduce((s,r)=>s+Math.round(r.tax*100),0)};
}
function sections(r){
 const money=c=>new Intl.NumberFormat(r.issuer.number_locale,{style:'currency',currency:r.issuer.currency_code}).format(c/100);
 const difference=r.differenceCents===null?'Sin conteo':r.differenceCents<0?'Faltante: '+money(-r.differenceCents):r.differenceCents>0?'Sobrante: '+money(r.differenceCents):'Cuadrado: '+money(0);
 return [
  {title:'Identificación',columns:[{label:'Dato',weight:1},{label:'Valor',weight:3}],rows:[['Turno',r.shiftId],['Apertura (UTC)',r.openedAt],['Corte (UTC)',r.createdAt],['Responsable',r.employeeName],['Alcance',definitions[r.type]]]},
  {title:'Conciliación de efectivo',columns:[{label:'Concepto',weight:3},{label:'Importe',weight:2,align:'right'}],rows:[['Fondo inicial',money(r.openingCents)],['Efectivo esperado',money(r.expectedCents)],['Efectivo contado',r.observedCents===null?'Sin conteo':money(r.observedCents)],['Resultado',difference]]},
  {title:'Cobros por medio de pago',columns:[{label:'Medio',weight:2},{label:'Ventas',weight:1.4,align:'right'},{label:'Abonos',weight:1.4,align:'right'},{label:'Devoluciones',weight:1.5,align:'right'},{label:'Neto cobrado',weight:1.6,align:'right'}],rows:r.rows.map(row=>[row.label,money(row.salesCents),money(row.paymentsCents),money(row.refundsCents),money(row.netCents)]),footer:'Las ventas al crédito no aumentan el efectivo. Los abonos y devoluciones se incluyen en el turno en que se registran. El efectivo de ventas ya descuenta el cambio entregado.'},
  {title:'Ventas del turno',columns:[{label:'Documento',weight:2},{label:'Medio',weight:2},{label:'Cajero',weight:2},{label:'Total',weight:1.4,align:'right'}],rows:r.sales.map(s=>[s.number||s.id,labels[s.payment_method],s.employee_name,money(Math.round(s.total*100))]),footer:`${r.sales.length} ventas | Total emitido: ${money(r.salesCents)} | Impuesto incluido en ventas: ${money(r.taxCents)}. Estos importes de ventas son anteriores a notas de crédito; las devoluciones de dinero se muestran por separado.`}
 ];
}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(r){return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escape(r.number)}</title><style>@page{size:A4;margin:14mm}body{font:12px Arial;color:#203348;margin:20px}h1,h2{color:#103f70}h1{font-size:22px}h2{font-size:15px;margin-top:24px}table{border-collapse:collapse;width:100%;table-layout:fixed}th{background:#103f70;color:white}td,th{padding:8px;border-bottom:1px solid #d5dfe9;text-align:left;overflow-wrap:anywhere}tr{break-inside:avoid}thead{display:table-header-group}p{line-height:1.5}.note{color:#526578;font-size:11px}</style></head><body><h1>${escape(r.issuer.company_name)}</h1><h2>Corte ${r.type} · ${escape(r.number)}</h2><p>Moneda: ${escape(r.issuer.currency_code)}. Reporte interno, sin autorización fiscal.</p>${sections(r).map(s=>`<h2>${escape(s.title)}</h2><table><thead><tr>${s.columns.map(c=>`<th>${escape(c.label)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(row=>`<tr>${row.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>${s.footer?`<p class="note">${escape(s.footer)}</p>`:''}`).join('')}<p class="note">${escape(r.note||'')}<br>Esperado = fondo inicial + ventas en efectivo + abonos en efectivo - devoluciones en efectivo. No incluye retiros ni ingresos manuales de caja, que esta versión no registra.</p></body></html>`;}
function register(app,getDb,{profile,shiftState}){
 const db=()=>getDb(),handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(e){next(e);}};
 function read(id){const row=db().prepare('SELECT snapshot FROM shift_reports WHERE id=?').get(id);if(!row)fail(404,'Corte no encontrado.');return JSON.parse(row.snapshot);}
 function issue(req,type){
  if(!Object.hasOwn(definitions,type))fail(400,'Selecciona un corte X, Y o Z.');
  const shiftId=Number(req.body.shiftId);if(!Number.isSafeInteger(shiftId)||shiftId<1)fail(400,'Turno inválido.');
  const observed=type==='X'?null:moneyInput(req.body.observedCash);
  const note=String(req.body.note||'').trim();if(note.length>500)fail(400,'La observación admite hasta 500 caracteres.');
  const key=req.get('Idempotency-Key');if((type!=='Z'||key)&&(!key||!/^[a-zA-Z0-9_-]{16,100}$/.test(key)))fail(400,'Se requiere identificador de operación.');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({shiftId,type,observed,note})).digest('hex');
  return db().transaction(()=>{
   if(key){const old=db().prepare('SELECT * FROM operation_requests WHERE request_key=?').get(key);if(old){if(old.kind!=='shift-report'||old.user_id!==req.user.id||old.fingerprint!==fingerprint)fail(409,'Identificador utilizado para otra operación.');return {report:read(old.result_id),replayed:true};}}
   const shift=db().prepare('SELECT * FROM shifts WHERE id=?').get(shiftId);if(!shift)fail(404,'Turno no encontrado.');
   if(shift.closed_at){
    const old=db().prepare("SELECT id FROM shift_reports WHERE shift_id=? AND type='Z'").get(shiftId);
    if(type==='Z'&&old){const r=read(old.id);if(r.observedCents===observed&&r.employeeId===req.user.id&&r.note===note)return {report:r,replayed:true};}
    fail(409,'El turno ya está cerrado. Consulta sus cortes guardados.');
   }
   const createdAt=new Date().toISOString(),summary=totals(db(),shiftId),expected=shift.opening_cents+summary.rows[0].netCents;
   const report={schemaVersion:1,kind:'shift_report',type,shiftId,businessId:req.businessId,issuer:publicProfile(profile()),employeeId:req.user.id,employeeName:req.user.name,openedAt:shift.opened_at,createdAt,openingCents:shift.opening_cents,expectedCents:expected,observedCents:observed,differenceCents:observed===null?null:observed-expected,note,...summary};
   const id=db().prepare('INSERT INTO shift_reports(shift_id,type,created_at,snapshot) VALUES (?,?,?,?)').run(shiftId,type,createdAt,'{}').lastInsertRowid;
   report.id=id;report.number=`${type}-${String(id).padStart(6,'0')}`;
   db().prepare('UPDATE shift_reports SET snapshot=? WHERE id=?').run(JSON.stringify(report),id);
   if(type==='Z')db().prepare('UPDATE shifts SET closed_at=?,closed_by=?,observed_cents=? WHERE id=? AND closed_at IS NULL').run(createdAt,req.user.id,observed,shiftId);
   if(key)db().prepare('INSERT INTO operation_requests(request_key,user_id,kind,fingerprint,result_id) VALUES (?,?,?,?,?)').run(key,req.user.id,'shift-report',fingerprint,id);
   return {report,replayed:false};
  })();
 }
 app.post('/api/shifts/reports',handle((req,res)=>res.json({...issue(req,req.body.type),shift:shiftState()})));
 app.post('/api/shifts/close',handle((req,res)=>res.json({...issue(req,'Z'),shift:shiftState()})));
 app.get('/api/shifts/reports',handle((req,res)=>{
  const rows=db().prepare('SELECT id FROM shift_reports ORDER BY id DESC LIMIT 200').all();
  res.json({reports:rows.map(row=>{const r=read(row.id);return {id:r.id,number:r.number,type:r.type,shiftId:r.shiftId,createdAt:r.createdAt,employeeName:r.employeeName,currency:r.issuer.currency_code,expectedCents:r.expectedCents,observedCents:r.observedCents,differenceCents:r.differenceCents};})});
 }));
 app.get('/api/shifts/reports/:id/:format',handle((req,res)=>{
  const r=read(req.params.id),format=req.params.format;
  if(format==='json')return res.json(r);
  if(format==='html')return res.type('html').send(html(r));
  if(format!=='pdf')fail(404,'Formato no disponible.');
  res.type('pdf').set('Content-Disposition',`inline; filename="corte-${r.number}.pdf"`);
  const doc=reportDocument(r.issuer,`CORTE ${r.type} - ${r.number}`,`Turno ${r.shiftId}`,sections(r),{note:[definitions[r.type],r.note,'Esperado = fondo inicial + ventas y abonos en efectivo - devoluciones en efectivo. No incluye retiros ni ingresos manuales, que esta versión no registra.'].filter(Boolean).join(' ')});
  doc.pipe(res);doc.end();
 }));
}
module.exports={register,totals,sections,html,moneyInput};
