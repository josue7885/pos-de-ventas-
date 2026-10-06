const PDFDocument = require('pdfkit');
const {cents,quantity}=require('../pos-math');
function receiptDocument(profile, invoice, sale) {
  const doc = new PDFDocument({margin:40});
  const quote=sale.kind==='quote', money=n=>new Intl.NumberFormat(profile.number_locale||'es-SV',{style:'currency',currency:profile.currency_code||'USD'}).format(Number(n||0));
  // Only embedded PNG/JPEG data is used; a receipt never fetches external images.
  const logo=/^data:image\/(?:png|jpe?g);base64,([a-zA-Z0-9+/=]+)$/.exec(profile.company_logo || '');
  if(logo && logo[1].length<1500000){try{doc.image(Buffer.from(logo[1],'base64'),doc.x,doc.y,{fit:[180,60]});doc.y+=70;}catch{ /* Keep the receipt usable if an old logo is invalid. */ }}
  doc.fontSize(18).text(profile.company_name || 'POS Control');
  for(const value of [profile.company_legal_name,profile.company_nit,profile.company_address,profile.company_phone])if(value)doc.fontSize(10).text(value);
  doc.moveDown().fontSize(12).text(`${quote?'Cotización':'Comprobante interno'} ${invoice.number}`).text(`Cliente: ${sale.customer_name}`).text(`Documento: ${sale.customer_nit || 'CF'}`).text(`Fecha: ${sale.created_at}`);
  if(sale.customer_address)doc.text(`Dirección: ${sale.customer_address}`);
  if(quote)doc.text(`Válida hasta: ${sale.valid_until}`).text('Precios y existencias sujetos a revisión al confirmar la venta.');
  doc.moveDown();
  for(const item of sale.items){
    doc.fontSize(11).text(`${item.qty} ${item.unit||'unidad'} x ${item.name} · ${money(item.price)} = ${money(Math.round(cents(item.price)*quantity(item.qty)/1000)/100)}`);
    if(item.price_reason || item.priceReason)doc.fontSize(9).text(`Precio especial: ${item.price_reason || item.priceReason}`);
  }
  doc.moveDown().fontSize(12);
  if(sale.discount)doc.text(`Antes de descuento: ${money(sale.gross)}`).text(`Descuento (${sale.discount_percent}%): ${money(sale.discount)}`).fontSize(9).text(`Motivo: ${sale.discount_reason}`).fontSize(12);
  doc.text(`Subtotal: ${money(sale.subtotal)}`).text(`${profile.tax_label||'IVA'}: ${money(sale.tax)}`).text(`Total: ${money(sale.total)}`);
  if(!quote && sale.payment_method)doc.text(`Pago: ${sale.payment_method}`).text(`Recibido: ${money(sale.received_amount)} · Cambio: ${money(sale.change_amount)}`);
  doc.moveDown().fontSize(9).text(quote?'Cotización sin cobro ni reserva de existencias. No es un documento fiscal.':'Comprobante interno sin autorización fiscal.');
  if(profile.receipt_footer)doc.moveDown().fontSize(10).text(profile.receipt_footer);
  return doc;
}
function receiptBuffer(profile, invoice, sale) {
  return new Promise((resolve,reject)=>{
    const doc=receiptDocument(profile,invoice,sale), chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.end();
  });
}
module.exports={receiptDocument,receiptBuffer};
