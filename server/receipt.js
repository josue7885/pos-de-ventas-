const PDFDocument=require('pdfkit');
const path=require('node:path');
const {buildDocument,documentTitle}=require('./documents');
const paymentLabels={efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia'};
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function embeddedLogo(value){return /^data:image\/(?:png|jpe?g);base64,[a-zA-Z0-9+/=]+$/.test(value||'') && value.length<1500000?value:'';}
function presentation(document){
  const p=document.issuer,quote=document.kind==='quote';
  const money=n=>new Intl.NumberFormat(p.number_locale,{style:'currency',currency:p.currency_code}).format(Number(n||0));
  const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat(p.number_locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(d)+' UTC';};
  const company=[p.company_legal_name,p.company_nit&&'NIT: '+p.company_nit,p.company_giro,p.company_address,[p.company_municipality,p.company_department].filter(Boolean).join(', '),p.company_phone&&'Teléfono: '+p.company_phone,p.company_email,p.company_website].filter(Boolean);
  const details=[['Fecha',date(document.created_at)],['Cliente',document.customer_name],['Documento del cliente',document.customer_nit],['Correo',document.customer_email],['Teléfono',document.customer_phone],['Dirección',document.customer_address],['Municipio y departamento',[document.customer_municipality,document.customer_department].filter(Boolean).join(', ')],['Giro',document.customer_giro],['Atendió',document.employee_name]];
  if(quote){details.push(['Válida hasta',date(document.valid_until)]);if(document.converted_sale_id)details.push(['Convertida en venta',String(document.converted_sale_id)]);}
  else details.push(['Tipo',document.document_type==='credito_fiscal'?'Crédito fiscal interno':'Consumidor final interno']);
  const totals=[['Importe de artículos',money(document.gross)]];
  if(document.discount)totals.push([`Descuento (${document.discount_percent}%)`,money(document.discount)]);
  totals.push(['Subtotal',money(document.subtotal)],[p.tax_label,money(document.tax)],['Total',money(document.total)]);
  if(!quote && document.payment_method)totals.push(['Pago',paymentLabels[document.payment_method]||document.payment_method],['Recibido',money(document.received_amount)],['Cambio',money(document.change_amount)]);
  const notes=[];
  if(document.discount_reason)notes.push('Motivo del descuento: '+document.discount_reason);
  notes.push(quote?'Cotización sin cobro ni reserva de existencias. Precios y existencias sujetos a revisión al confirmar la venta. No es un documento fiscal.':'Comprobante interno sin autorización fiscal.');
  if(document.profile_source==='legacy_current_settings')notes.push('Documento anterior: los datos del emisor se muestran con la configuración actual; los importes son los registrados.');
  if(p.receipt_footer)notes.push(p.receipt_footer);
  return {money,company,details:details.filter(([,v])=>v),totals,notes};
}
function receiptDocument(profile,invoice,sale){
  const document=sale.schema_version===2?sale:buildDocument(profile,{...sale,number:invoice.number});
  const p=document.issuer,view=presentation(document),created=new Date(document.created_at);
  const info={Title:`${documentTitle(document)} ${document.number}`,Author:p.company_name};
  if(!Number.isNaN(created.getTime())){info.CreationDate=created;info.ModDate=created;}
  const doc=new PDFDocument({margin:40,size:'A4',info});
  doc.registerFont('ReceiptRegular',path.join(__dirname,'fonts','DejaVuSans.ttf'));
  doc.registerFont('ReceiptBold',path.join(__dirname,'fonts','DejaVuSans-Bold.ttf'));
  const keepTogether=height=>{const bottom=doc.page.height-doc.page.margins.bottom;if(height<bottom-doc.page.margins.top && doc.y+height>bottom)doc.addPage();};
  const logo=embeddedLogo(p.company_logo);
  if(logo){try{doc.image(Buffer.from(logo.split(',')[1],'base64'),doc.x,doc.y,{fit:[180,60]});doc.y+=70;}catch{/* Keep old receipts usable even if their logo is invalid. */}}
  doc.font('ReceiptBold').fontSize(18).text(p.company_name);
  doc.font('ReceiptRegular').fontSize(10);for(const line of view.company)doc.text(line);
  doc.moveDown().font('ReceiptBold').fontSize(13).text(`${documentTitle(document)} ${document.number}`);
  doc.font('ReceiptRegular').fontSize(10).text(`Moneda: ${document.currency_code}`);
  for(const [label,value] of view.details)doc.text(`${label}: ${value}`);
  doc.moveDown().font('ReceiptBold').text('Detalle de artículos');doc.font('ReceiptRegular');
  for(const item of document.items){
    doc.fontSize(10);
    const line=`${item.qty} ${item.unit} x ${view.money(item.price)} = ${view.money(item.line_total)}`;
    keepTogether(doc.heightOfString(item.name)+doc.heightOfString(line)+(item.price_reason?doc.heightOfString('Precio especial: '+item.price_reason):0)+12);
    doc.moveDown(.4).fontSize(10).text(item.name);
    doc.text(line);
    if(item.price_reason)doc.fontSize(9).text('Precio especial: '+item.price_reason);
  }
  doc.moveDown();
  doc.fontSize(11);keepTogether(view.totals.reduce((sum,[label,value])=>sum+doc.heightOfString(`${label}: ${value}`)+4,0)+12);
  for(const [label,value] of view.totals)doc.font(label==='Total'?'ReceiptBold':'ReceiptRegular').fontSize(label==='Total'?14:11).text(`${label}: ${value}`);
  doc.moveDown().font('ReceiptRegular').fontSize(9);
  for(const note of view.notes)doc.text(note).moveDown(.4);
  return doc;
}
function receiptBuffer(profile,invoice,sale){
  return new Promise((resolve,reject)=>{
    const doc=receiptDocument(profile,invoice,sale),chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.end();
  });
}
function receiptHtml(document,{format='a4'}={}){
  const p=document.issuer,v=presentation(document),logo=embeddedLogo(p.company_logo);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escape(documentTitle(document)+' '+document.number)}</title><style>
  @page{margin:12mm}*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#111;margin:24px}.receipt{max-width:760px;margin:auto}h1{font-size:24px;margin:8px 0}h2{font-size:19px}p{margin:5px 0;overflow-wrap:anywhere}.logo{max-width:180px;max-height:65px}table{border-collapse:collapse;width:100%;margin:18px 0;table-layout:fixed}th,td{border-bottom:1px solid #ddd;padding:8px 5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:44%}.num{text-align:right}.totals{margin-left:auto;max-width:360px}.total{font-weight:bold;font-size:18px}.notes{font-size:12px;margin-top:20px}thead{display:table-header-group}tr{break-inside:avoid}h1,h2{break-after:avoid}@media print{body{margin:0}.receipt{max-width:none}}
  ${format==='ticket'?"@page{size:auto;margin:3mm}html{width:80mm}body{width:74mm;margin:0 auto;font-size:11px}.receipt{max-width:74mm}h1{font-size:17px}h2{font-size:14px}th,td{padding:5px 2px}th:first-child{width:38%}.total{font-size:15px}.notes{font-size:10px}.logo{max-width:55mm}":''}
  </style></head><body><main class="receipt">${logo?`<img class="logo" alt="Logo" src="${logo}">`:''}<h1>${escape(p.company_name)}</h1>${v.company.map(line=>`<p>${escape(line)}</p>`).join('')}<h2>${escape(documentTitle(document))} ${escape(document.number)}</h2><p>Moneda: ${escape(document.currency_code)}</p>${v.details.map(([label,value])=>`<p><strong>${escape(label)}:</strong> ${escape(value)}</p>`).join('')}<table><thead><tr><th>Artículo</th><th>Cantidad</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead><tbody>${document.items.map(item=>`<tr><td>${escape(item.name)}${item.price_reason?`<p>Precio especial: ${escape(item.price_reason)}</p>`:''}</td><td>${escape(item.qty)} ${escape(item.unit)}</td><td class="num">${escape(v.money(item.price))}</td><td class="num">${escape(v.money(item.line_total))}</td></tr>`).join('')}</tbody></table><div class="totals">${v.totals.map(([label,value])=>`<p class="${label==='Total'?'total':''}">${escape(label)}: ${escape(value)}</p>`).join('')}</div><footer class="notes">${v.notes.map(note=>`<p>${escape(note)}</p>`).join('')}</footer></main></body></html>`;
}
module.exports={receiptDocument,receiptBuffer,receiptHtml,presentation};
