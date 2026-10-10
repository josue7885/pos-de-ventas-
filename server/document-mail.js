const nodemailer=require('nodemailer');
const {receiptBuffer,presentation}=require('./receipt');
const {documentTitle,documentFilename,loadDocument}=require('./documents');
async function emailMessage(document,config,recipient){
  const name=documentFilename(document),title=documentTitle(document);
  const pdf=await receiptBuffer(document.issuer,document,document);
  return {
    from:{name:config.smtp_from_name||document.issuer.company_name,address:config.smtp_from||config.smtp_user},
    to:recipient,subject:`${title} ${document.number}`,
    text:`${document.issuer.company_name}\n${title} ${document.number}\nCliente: ${document.customer_name}\nTotal: ${presentation(document).money(document.total)} (${document.currency_code})\n\n${document.kind==='quote'?'Cotización sin cobro ni reserva de existencias. No es un documento fiscal.':'Comprobante interno sin autorización fiscal.'}\nAdjuntamos el documento en PDF y JSON.`,
    attachments:[{filename:name+'.pdf',content:pdf,contentType:'application/pdf'},{filename:name+'.json',content:JSON.stringify(document,null,2),contentType:'application/json'}]
  };
}
async function sendDocumentEmail(document,config,recipient){
  if(!config.invoice_email_enabled || !(config.smtp_host && config.smtp_user && config.smtp_password))return {sent:false,reason:'Configuración SMTP no activada o incompleta.'};
  const transporter=nodemailer.createTransport({host:config.smtp_host,port:Number(config.smtp_port||587),secure:!!config.smtp_secure,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:5000,auth:{user:config.smtp_user,pass:config.smtp_password}});
  try{const info=await transporter.sendMail(await emailMessage(document,config,recipient));return {sent:true,messageId:info.messageId};}
  finally{transporter.close();}
}
function deliveryState(row){
 if(!row)return {status:'not_requested',message:'Correo automático no solicitado.'};
 if(row.status==='sending')return {status:'sending',message:'Envío en curso o pendiente de confirmar. No se repetirá automáticamente; verifica el correo antes de reenviar.'};
 return {status:row.status,message:row.message};
}
async function sendSaleReceipt(db,config,saleId){
 let row=db.prepare('SELECT * FROM sale_email_delivery WHERE sale_id=?').get(saleId);
 if(!row || row.status!=='ready')return deliveryState(row);
 // Claim is flushed to disk before any SMTP traffic. An interrupted send remains uncertain.
 const claimed=db.transaction(()=>db.prepare("UPDATE sale_email_delivery SET status='sending',updated_at=? WHERE sale_id=? AND status='ready'").run(new Date().toISOString(),saleId))();
 if(!claimed.changes)return deliveryState(db.prepare('SELECT * FROM sale_email_delivery WHERE sale_id=?').get(saleId));
 let result;
 if(!row.recipient)result={status:'skipped',message:'Correo no enviado: el cliente no tiene correo. Puedes enviarlo desde el comprobante.'};
 else if(row.recipient.length>254 || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(row.recipient))result={status:'skipped',message:'Correo no enviado: dirección del cliente inválida. Corrígela al usar Enviar correo.'};
 else if(!config.invoice_email_enabled || !(config.smtp_host && config.smtp_user && config.smtp_password))result={status:'skipped',message:'Correo no enviado: configura y activa SMTP en Configuración.'};
 else{
  try{
   const sent=await sendDocumentEmail(loadDocument(db,config,'sale',saleId),config,row.recipient);
   result=sent.sent?{status:'accepted',message:'Correo con PDF y JSON aceptado por SMTP para '+row.recipient+'.'}:{status:'skipped',message:sent.reason};
  }catch(error){result={status:'uncertain',message:'No se pudo confirmar el correo. La venta está registrada; verifica la bandeja del cliente antes de reenviar.'};}
 }
 db.transaction(()=>db.prepare('UPDATE sale_email_delivery SET status=?,message=?,updated_at=? WHERE sale_id=?').run(result.status,result.message,new Date().toISOString(),saleId))();
 return result;
}
module.exports={emailMessage,sendDocumentEmail,sendSaleReceipt};
