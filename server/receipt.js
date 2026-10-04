const PDFDocument = require('pdfkit');
function receiptDocument(profile, invoice, sale) {
  const doc = new PDFDocument({margin:40});
  doc.fontSize(18).text(profile.company_name).moveDown();
  doc.fontSize(12).text(`Comprobante ${invoice.number}`).text(`Cliente: ${sale.customer_name}`).text(`Fecha: ${sale.created_at}`).moveDown();
  for(const item of sale.items) doc.text(`${item.qty} x ${item.name}  $${(item.price*item.qty).toFixed(2)}`);
  doc.moveDown().text(`Subtotal: $${sale.subtotal.toFixed(2)}`).text(`IVA: $${sale.tax.toFixed(2)}`).text(`Total: $${sale.total.toFixed(2)}`);
  doc.moveDown().fontSize(9).text('Comprobante interno. Sin autorización fiscal: el conector de Hacienda no está implementado.');
  return doc;
}
function receiptBuffer(profile, invoice, sale) {
  return new Promise((resolve,reject)=>{
    const doc=receiptDocument(profile,invoice,sale), chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.end();
  });
}
module.exports={receiptDocument,receiptBuffer};
