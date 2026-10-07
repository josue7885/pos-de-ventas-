const nodemailer=require('nodemailer');
const {receiptBuffer,presentation}=require('./receipt');
const {documentTitle,documentFilename}=require('./documents');
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
  const transporter=nodemailer.createTransport({host:config.smtp_host,port:Number(config.smtp_port||587),secure:!!config.smtp_secure,auth:{user:config.smtp_user,pass:config.smtp_password}});
  try{const info=await transporter.sendMail(await emailMessage(document,config,recipient));return {sent:true,messageId:info.messageId};}
  finally{transporter.close();}
}
module.exports={emailMessage,sendDocumentEmail};
