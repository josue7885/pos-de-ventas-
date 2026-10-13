const PDFDocument=require('pdfkit');
const path=require('node:path');
const {buildDocument,documentTitle}=require('./documents');
const paymentLabels={efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia',credito:'Venta al crédito'};
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function embeddedLogo(value){return /^data:image\/(?:png|jpe?g);base64,[a-zA-Z0-9+/=]+$/.test(value||'') && value.length<1500000?value:'';}
function presentation(document){
  const p=document.issuer,quote=document.kind==='quote';
  const money=n=>new Intl.NumberFormat(p.number_locale,{style:'currency',currency:p.currency_code}).format(Number(n||0));
  const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat(p.number_locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(d)+' UTC';};
  const company=[p.company_legal_name,p.company_nit&&'NIT: '+p.company_nit,p.company_giro,p.company_address,[p.company_municipality,p.company_department].filter(Boolean).join(', '),p.company_phone&&'Teléfono: '+p.company_phone,p.company_email,p.company_website].filter(Boolean);
  const details=[['Fecha',date(document.created_at)],['Cliente',document.customer_name],['Documento del cliente',document.customer_nit],['Correo',document.customer_email],['Teléfono',document.customer_phone],['Dirección',document.customer_address],['Municipio y departamento',[document.customer_municipality,document.customer_department].filter(Boolean).join(', ')],['Giro',document.customer_giro],['Atendió',document.employee_name]];
  if(quote){details.push(['Válida hasta',date(document.valid_until)]);if(document.converted_sale_id)details.push(['Convertida en venta',String(document.converted_sale_id)]);}
  else details.push(['Tipo',['credit_note','credit_payment'].includes(document.kind)?documentTitle(document):document.document_type==='credito_fiscal'?'Crédito fiscal interno':'Consumidor final interno']);
  const totals=[];
  if(document.discount)totals.push(['Importe de artículos',money(document.gross)],[`Descuento (${document.discount_percent}%)`,money(document.discount)]);
  if(document.kind!=='credit_payment')totals.push([document.prices_include_tax?'Base sin impuesto':'Subtotal',money(document.subtotal)],[p.tax_label+(document.prices_include_tax?' incluido':''),money(document.tax)]);
  totals.push(['Total',money(document.total)]);
  if(!quote && document.payment_method)totals.push(['Pago',paymentLabels[document.payment_method]||document.payment_method],['Recibido',money(document.received_amount)],['Cambio',money(document.change_amount)]);
  if(document.payment_method==='credito'){details.push(['Vencimiento',document.credit_due_date]);totals.push(['Saldo al emitir',money(document.initial_balance)]);}
  if(document.original_number)details.push(['Venta de referencia',document.original_number],['Fecha de venta',date(document.original_date)]);
  if(document.kind==='credit_note'){details.push(['Motivo',document.reason]);totals.push(['Aplicado a saldo',money(document.applied_to_balance)],['Devolución',money(document.refund_amount)],['Saldo posterior',money(document.balance_after)]);if(document.refund_amount)details.push(['Medio de devolución',paymentLabels[document.refund_method]]);}
  if(document.kind==='credit_payment'){details.push(['Referencia del abono',document.reason]);totals.push(['Saldo posterior',money(document.balance_after)]);}
  const notes=[];
  if(document.kind==='credit_note')notes.push('Ajuste monetario de la venta indicada. No modifica existencias. El total es un importe a acreditar, no un nuevo cobro.');
  if(document.kind==='credit_payment')notes.push('Abono a una venta previamente emitida. No genera otra venta ni un nuevo impuesto. El saldo mostrado corresponde al momento del abono.');
  if(document.payment_method==='credito')notes.push('Venta a plazo sin cobro inicial. Registra los pagos en Cuentas por cobrar.');
  if(document.prices_include_tax)notes.push('Precios de venta con '+p.tax_label+' incluido. El impuesto se desglosa del total y no se agrega nuevamente.');
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
  const doc=new PDFDocument({margin:36,size:'A4',bufferPages:true,info});
  doc.registerFont('ReceiptRegular',path.join(__dirname,'fonts','DejaVuSans.ttf'));
  doc.registerFont('ReceiptBold',path.join(__dirname,'fonts','DejaVuSans-Bold.ttf'));
  const x=36,width=doc.page.width-72,bottom=doc.page.height-64,navy='#103f70',blue='#1265a4',ink='#203348',muted='#62758a',line='#d5dfe9';
  let y=36;
  const font=(size=9,bold=false,color=ink)=>doc.font(bold?'ReceiptBold':'ReceiptRegular').fontSize(size).fillColor(color);
  // Explicit wrapping also handles long unbroken customer/product text without clipping.
  function lines(text,w,size=9,bold=false){
    font(size,bold);const output=[];
    for(const paragraph of String(text??'').split('\n')){
      let row='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(row&&doc.widthOfString(row+' '+word)>w){output.push(row);row='';}
        for(const char of word){if(doc.widthOfString(row+char)>w){output.push(row);row='';}row+=char;}
        row+=' ';
      }output.push(row.trimEnd());
    }return output;
  }
  function text(text,tx,ty,w,{size=9,bold=false,color=ink,align='left'}={}){font(size,bold,color);doc.text(String(text??''),tx,ty,{width:w,lineBreak:false,align});}
  function rule(ty){doc.strokeColor(line).lineWidth(.6).moveTo(x,ty).lineTo(x+width,ty).stroke();}
  function page(){doc.addPage();y=36;text(lines(p.company_name,width-170,11,true)[0],x,y,width-170,{size:11,bold:true,color:navy});text(document.number,x+width-165,y,165,{size:9,align:'right'});rule(y+24);y+=40;}
  function ensure(height){if(y+height>bottom)page();}
  function paragraph(value,{size=9,bold=false,color=ink,indent=0}={}){for(const row of lines(value,width-indent,size,bold)){ensure(size*1.5);text(row,x+indent,y,width-indent,{size,bold,color});y+=size*1.5;}}
  // Branded issuer and document number occupy separate columns.
  const logo=embeddedLogo(p.company_logo);let companyY=y;
  if(logo){try{doc.image(Buffer.from(logo.split(',')[1],'base64'),x,y,{fit:[130,54]});companyY+=66;}catch{/* Invalid historical logo must not prevent printing. */}}
  for(const row of lines(p.company_name,292,17,true)){text(row,x,companyY,292,{size:17,bold:true,color:navy});companyY+=22;}
  for(const field of view.company){for(const row of lines(field,292,8)){text(row,x,companyY,292,{size:8,color:muted});companyY+=12;}}
  const metaX=x+width-210,metaW=210;
  const title=document.kind==='credit_note'?'NOTA DE CRÉDITO':document.kind==='credit_payment'?'RECIBO DE ABONO':document.kind==='quote'?'COTIZACIÓN':document.document_type==='credito_fiscal'?'CRÉDITO FISCAL INTERNO':'CONSUMIDOR FINAL';
  const numberLines=lines(document.number,metaW-24,12,true),metaHeight=61+numberLines.length*17;
  doc.rect(metaX,36,metaW,metaHeight).fill(navy);
  text(document.kind==='quote'?'PROPUESTA COMERCIAL':'COMPROBANTE INTERNO',metaX+12,48,metaW-24,{size:8,bold:true,color:'#ffffff'});
  text(title,metaX+12,67,metaW-24,{size:10,bold:true,color:'#ffffff'});
  numberLines.forEach((row,i)=>text(row,metaX+12,91+i*17,metaW-24,{size:12,bold:true,color:'#ffffff'}));
  const meta=view.details.filter(([label])=>['Fecha','Válida hasta','Convertida en venta','Atendió'].includes(label));
  let metaY=36+metaHeight+10;for(const [label,value] of meta){for(const row of lines(label+': '+value,metaW-24,8)){text(row,metaX+12,metaY,metaW-24,{size:8});metaY+=12;}}
  text('Moneda: '+document.currency_code,metaX+12,metaY,metaW-24,{size:8,bold:true});metaY+=15;
  y=Math.max(companyY,metaY)+12;rule(y);y+=12;
  ensure(36);paragraph('DATOS DEL CLIENTE',{size:10,bold:true,color:navy});y+=5;
  for(const [label,value] of view.details.filter(([label])=>!['Fecha','Válida hasta','Convertida en venta','Atendió','Tipo'].includes(label))){paragraph(label+': '+value,{size:9});}
  y+=10;
  const cols=[54,width-54-92-104,92,104],starts=[x,x+54,x+width-196,x+width-104];
  function tableHeader(){ensure(48);doc.rect(x,y,width,28).fill(navy);['CANT.','DESCRIPCIÓN','P. UNITARIO','IMPORTE'].forEach((label,i)=>text(label,starts[i]+8,y+9,cols[i]-16,{size:8,bold:true,color:'#ffffff',align:i>1?'right':'left'}));y+=28;}
  tableHeader();
  for(let index=0;index<document.items.length;index++){
    const item=document.items[index];
    const description=[...lines(item.name,cols[1]-16,9,true),...(item.price_reason?lines('Precio especial: '+item.price_reason,cols[1]-16,8):[])];
    let offset=0;
    // A long item can continue on another page; numeric cells are shown only once.
    while(offset<description.length){
      if(bottom-y<44){page();tableHeader();}
      const take=Math.max(1,Math.min(description.length-offset,Math.floor((bottom-y-14)/13))),height=Math.max(30,take*13+12);
      doc.rect(x,y,width,height).fill(index%2===0?'#f0f5fa':'#ffffff');
      if(offset===0){text(item.qty,starts[0]+8,y+6,cols[0]-16,{size:9});text(item.unit,starts[0]+8,y+20,cols[0]-16,{size:6,color:muted});text(view.money(item.price),starts[2]+8,y+10,cols[2]-16,{size:9,align:'right'});text(view.money(item.line_total),starts[3]+8,y+10,cols[3]-16,{size:9,bold:true,align:'right'});}
      description.slice(offset,offset+take).forEach((row,i)=>text(row,starts[1]+8,y+8+i*13,cols[1]-16,{size:9,bold:offset+i===0}));
      y+=height;rule(y);offset+=take;
    }
  }
  y+=14;
  const totals=view.totals.filter(([label])=>!['Pago','Recibido','Cambio'].includes(label)),summaryW=250,summaryX=x+width-summaryW;
  ensure(totals.length*25+18);
  const summaryTop=y;
  for(const [label,value] of totals){const isTotal=label==='Total';if(isTotal)doc.rect(summaryX,y,summaryW,32).fill(blue);text(label,summaryX+10,y+8,150,{size:isTotal?12:9,bold:isTotal,color:isTotal?'#ffffff':ink});text(value,summaryX+160,y+8,summaryW-170,{size:isTotal?12:9,bold:true,color:isTotal?'#ffffff':ink,align:'right'});y+=isTotal?36:25;}
  const conditions=view.totals.filter(([label])=>['Pago','Recibido','Cambio'].includes(label));
  let conditionY=summaryTop;text('CONDICIONES',x,conditionY,width-summaryW-20,{size:10,bold:true,color:navy});conditionY+=22;
  for(const [label,value] of conditions){text(label+': '+value,x,conditionY,width-summaryW-20,{size:9});conditionY+=18;}
  text(document.kind==='credit_payment'?'Abono sin nuevo impuesto.':document.prices_include_tax?'Precios con impuesto incluido.':'Precios antes del impuesto.',x,conditionY,width-summaryW-20,{size:8,color:muted});conditionY+=18;
  y=Math.max(y,conditionY)+16;
  const notesHeight=view.notes.reduce((sum,note)=>sum+lines(note,width,8).length*12+5,0);
  ensure(notesHeight+50);
  for(const note of view.notes){paragraph(note,{size:8,color:muted});y+=5;}
  ensure(50);y+=22;const signatureWidth=(width-32)/2;
  doc.strokeColor(line).moveTo(x,y).lineTo(x+signatureWidth,y).moveTo(x+signatureWidth+32,y).lineTo(x+width,y).stroke();
  text('Recibido por el cliente',x,y+8,signatureWidth,{size:8,color:muted,align:'center'});text('Firma y sello del establecimiento',x+signatureWidth+32,y+8,signatureWidth,{size:8,color:muted,align:'center'});
  const range=doc.bufferedPageRange();
  for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);rule(doc.page.height-56);text('Documento interno - sin autorización fiscal',x,doc.page.height-48,width-100,{size:7,color:muted});text(`Página ${i+1} de ${range.count}`,x+width-100,doc.page.height-48,100,{size:7,color:muted,align:'right'});}
  return doc;
}
function receiptBuffer(profile,invoice,sale){
  return new Promise((resolve,reject)=>{
    const doc=receiptDocument(profile,invoice,sale),chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.end();
  });
}
function receiptHtml(document,{format='a4'}={}){
  const p=document.issuer,v=presentation(document),logo=embeddedLogo(p.company_logo),ticket=format==='ticket';
  const meta=v.details.filter(([label])=>['Fecha','Válida hasta','Convertida en venta','Atendió','Tipo'].includes(label));
  const customer=v.details.filter(([label])=>!meta.some(([key])=>key===label));
  const fields=rows=>rows.map(([label,value])=>`<p><strong>${escape(label)}:</strong> ${escape(value)}</p>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escape(documentTitle(document)+' '+document.number)}</title><style>
  @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#203348;margin:24px}.receipt{max-width:760px;margin:auto}h1{font-size:24px;color:#103f70;margin:8px 0}h2{font-size:15px;margin:0}h3{font-size:13px;color:#103f70;letter-spacing:.04em}p{margin:5px 0;overflow-wrap:anywhere}.logo{max-width:150px;max-height:65px}.receipt-header{display:grid;grid-template-columns:1.25fr 1fr;gap:28px;border-bottom:2px solid #103f70;padding-bottom:20px}.issuer p{font-size:11px;color:#62758a}.document-title{background:#103f70;color:white;padding:16px}.document-title strong{display:block;font-size:20px;margin-top:10px;overflow-wrap:anywhere}.document-meta{background:#f0f5fa;padding:12px;font-size:11px}.customer{margin:18px 0;padding:0 0 12px;border-bottom:1px solid #d5dfe9}.customer-fields{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}table{border-collapse:collapse;width:100%;margin:18px 0;table-layout:fixed}th,td{border-bottom:1px solid #d5dfe9;padding:10px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#103f70;color:white;font-size:11px}th:first-child{width:45%}th:nth-child(2){width:15%}tbody tr:nth-child(odd){background:#f0f5fa}.num{text-align:right}.totals{margin-left:auto;max-width:350px;background:#f6f8fb;padding:12px}.totals p{display:flex;justify-content:space-between;gap:14px;padding:5px 0}.totals .total{font-weight:bold;font-size:19px;background:#1265a4;color:white;margin:10px -12px;padding:12px}.notes{font-size:11px;margin-top:20px;color:#62758a}.signatures{display:flex;gap:30px;margin-top:50px;color:#62758a;font-size:11px}.signatures span{border-top:1px solid #aabacc;padding-top:10px;width:50%;text-align:center}thead{display:table-header-group}tr,.totals,.signatures{break-inside:avoid}h1,h2,h3{break-after:avoid}@media print{body{margin:0}.receipt{max-width:none}th,.document-title,.total{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  ${ticket?"@page{size:auto;margin:3mm}html{width:80mm}body{width:74mm;margin:0 auto;font-size:11px}.receipt{max-width:74mm}.receipt-header{display:block;padding-bottom:8px}.document-title{background:white;color:#111;padding:8px 0}.document-title strong{font-size:14px}.document-meta{padding:0;background:white}.customer-fields{display:block}.customer{margin:10px 0}h1{font-size:17px}h2,h3{font-size:12px}th,td{padding:5px 2px}th{background:#eee;color:#111;font-size:10px}th:first-child{width:38%}.totals{padding:0;background:white}.totals p{padding:2px 0}.totals .total{font-size:15px;background:white;color:#111;margin:5px 0;padding:5px 0;border-top:1px solid #111}.notes{font-size:10px}.logo{max-width:55mm}.signatures{display:none}":''}
  </style></head><body><main class="receipt"><header class="receipt-header"><section class="issuer">${logo?`<img class="logo" alt="Logo" src="${logo}">`:''}<h1>${escape(p.company_name)}</h1>${v.company.map(line=>`<p>${escape(line)}</p>`).join('')}</section><section><div class="document-title"><h2>${escape(documentTitle(document))}</h2><strong>${escape(document.number)}</strong></div><div class="document-meta">${fields(meta)}<p>Moneda: ${escape(document.currency_code)}</p></div></section></header><section class="customer"><h3>DATOS DEL CLIENTE</h3><div class="customer-fields">${fields(customer)}</div></section><h3>${document.kind==='credit_payment'?'DETALLE DEL ABONO':document.kind==='credit_note'?'DETALLE DEL AJUSTE':'DETALLE DE ARTÍCULOS'}</h3><table><thead><tr><th>Descripción</th><th>Cantidad</th><th class="num">Precio${document.prices_include_tax?' con IVA':''}</th><th class="num">Importe</th></tr></thead><tbody>${document.items.map(item=>`<tr><td>${escape(item.name)}${item.price_reason?`<p>Precio especial: ${escape(item.price_reason)}</p>`:''}</td><td>${escape(item.qty)} ${escape(item.unit)}</td><td class="num">${escape(v.money(item.price))}</td><td class="num">${escape(v.money(item.line_total))}</td></tr>`).join('')}</tbody></table><div class="totals">${v.totals.map(([label,value])=>`<p class="${label==='Total'?'total':''}"><span>${escape(label)}:</span> <span>${escape(value)}</span></p>`).join('')}</div><footer class="notes">${v.notes.map(note=>`<p>${escape(note)}</p>`).join('')}</footer><div class="signatures"><span>Recibido por el cliente</span><span>Firma y sello del establecimiento</span></div></main></body></html>`;
}
module.exports={receiptDocument,receiptBuffer,receiptHtml,presentation};
