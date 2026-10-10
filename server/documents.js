const {fail,math}=require('./commerce');
const crypto=require('node:crypto');

// Customer documents must not contain credentials, internal costs or sessions.
function publicProfile(profile) {
  const fields=['business_id','business_type','company_name','company_legal_name','company_nit','company_giro','company_address','company_department','company_municipality','company_phone','company_email','company_website','company_logo','currency_code','number_locale','tax_label','receipt_footer'];
  const result=Object.fromEntries(fields.map(key=>[key,String(profile[key]??'')]));
  result.company_name ||= 'POS Control';result.currency_code ||= 'USD';
  result.number_locale ||= 'es-SV';result.tax_label ||= 'IVA';
  result.iva_rate=Number(profile.iva_rate??.13);
  return result;
}
function captureProfile(db,profile){
  const json=JSON.stringify(publicProfile(profile));
  const id=crypto.createHash('sha256').update(json).digest('hex');
  db.prepare('INSERT OR IGNORE INTO document_profiles(id,profile) VALUES (?,?)').run(id,json);
  return id;
}
function buildDocument(profile,source,{profileSource='issued'}={}) {
  const issuer=publicProfile(profile),kind=source.kind==='quote'?'quote':'sale';
  const document={schema_version:2,kind,id:source.id,number:String(source.number||source.invoice_number||''),business_id:issuer.business_id,business_type:issuer.business_type,currency_code:issuer.currency_code,number_locale:issuer.number_locale,issuer,profile_source:profileSource,fiscalStatus:'NOT_AUTHORIZED'};
  for(const field of ['created_at','customer_name','customer_nit','customer_email','customer_phone','customer_address','customer_department','customer_municipality','customer_giro','employee_name','discount_reason'])document[field]=String(source[field]??'');
  document.customer_name ||= 'Cliente general';document.customer_nit ||= 'CF';
  document.document_type=source.document_type==='credito_fiscal'?'credito_fiscal':'consumidor_final';
  for(const field of ['subtotal','tax','total','discount','discount_percent'])document[field]=Number(source[field]??0);
  document.gross=Number(source.gross??((math.cents(document.subtotal)+math.cents(document.discount))/100));
  document.items=(source.items||[]).map(item=>({
    product_id:item.product_id??item.id,name:String(item.name||''),qty:Number(item.qty),unit:String(item.unit||'unidad'),price:Number(item.price),
    line_total:Math.round(math.cents(item.price)*math.quantity(item.qty)/1000)/100,
    price_reason:String(item.price_reason||item.priceReason||'')
  }));
  if(kind==='quote'){
    document.valid_until=String(source.valid_until||'');
    document.converted_sale_id=source.converted_sale_id??null;
  }else{
    document.payment_method=String(source.payment_method||'');
    document.received_amount=Number(source.received_amount??0);
    document.change_amount=Number(source.change_amount??0);
  }
  return document;
}
function loadDocument(db,profile,kind,id){
  if(!['sale','quote'].includes(kind))fail(404,'Tipo de documento desconocido');
  if(!/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id)<1)fail(400,'Identificador de documento inválido');
  let source,profileId;
  if(kind==='sale'){
    source=db.prepare('SELECT s.*,i.number,i.profile_id FROM sales s JOIN invoices i ON i.sale_id=s.id WHERE s.id=?').get(id);
    if(!source)fail(404,'Comprobante no encontrado');
    profileId=source.profile_id;
    source.items=db.prepare('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id').all(id);
  }else{
    const row=db.prepare('SELECT * FROM quotes WHERE id=?').get(id);
    if(!row)fail(404,'Cotización no encontrada');
    source={...JSON.parse(row.snapshot),id:row.id,number:'COT-'+String(row.id).padStart(6,'0'),created_at:row.created_at,valid_until:row.valid_until,converted_sale_id:row.converted_sale_id};
    profileId=source.receipt_profile_id;
  }
  const stored=profileId?db.prepare('SELECT profile FROM document_profiles WHERE id=?').get(profileId):null;
  if(profileId && !stored)fail(500,'Falta el perfil original del documento');
  const snapshot=stored?JSON.parse(stored.profile):null;
  const selected={...(snapshot||profile),business_id:profile.business_id};
  return buildDocument(selected,{...source,kind},{profileSource:snapshot?'issued':'legacy_current_settings'});
}
function documentTitle(document){return document.kind==='quote'?'Cotización':'Comprobante interno';}
function documentFilename(document){return `${document.kind==='quote'?'cotizacion':'comprobante'}-${document.number.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)||document.id}`;}
module.exports={publicProfile,captureProfile,buildDocument,loadDocument,documentTitle,documentFilename};
