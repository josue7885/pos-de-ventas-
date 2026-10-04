const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');

test('patched XML dependency serializes receipt text without interpreting markup',()=>{
 const {create}=require('xmlbuilder2');
 const xml=create({Receipt:{Customer:'A & B <client>',Total:5.09}}).end();
 assert.match(xml,/A &amp; B &lt;client&gt;/);
 const parsed=create(xml).node;
 assert.equal(parsed.getElementsByTagName('Customer')[0].textContent,'A & B <client>');
 const fromXml=createRequire(require.resolve('xmlbuilder2'));
 const yaml=fromXml('js-yaml');
 assert.equal(yaml.safeLoad('name: POS').name,'POS');
});

test('Excel export and conditional formatting work with patched CommonJS uuid',async()=>{
 const Excel=require('exceljs');
 const book=new Excel.Workbook();const sheet=book.addWorksheet('Ventas');
 sheet.addRow(['Producto','Total']);sheet.addRow(['Café',5.09]);
 sheet.addConditionalFormatting({ref:'B2:B2',rules:[{type:'dataBar',minLength:0,maxLength:100,gradient:false,cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF00FF00'}}]});
 const output=await book.xlsx.writeBuffer();
 const copy=new Excel.Workbook();await copy.xlsx.load(output);
 assert.equal(copy.getWorksheet('Ventas').getCell('B2').value,5.09);
 const fromExcel=createRequire(require.resolve('exceljs'));
 assert.match(fromExcel('uuid').v4(),/^[0-9a-f-]{36}$/);
});

test('updated mailer builds attachments locally without sending email',async()=>{
 const transporter=require('nodemailer').createTransport({streamTransport:true,buffer:true,newline:'unix'});
 const info=await transporter.sendMail({from:'pos@example.test',to:'client@example.test',subject:'Comprobante de prueba',text:'Prueba local',attachments:[{filename:'receipt.txt',content:'Total: 5.09'}]});
 const message=info.message.toString();
 assert.match(message,/multipart\/mixed/);assert.match(message,/receipt\.txt/);
 transporter.close();
});

test('new receipts build a PDF attachment without a legacy file',async()=>{
 const buffer=await require('../receipt').receiptBuffer({company_name:'POS'},{number:'INT-1'},{customer_name:'Prueba',created_at:'2020-01-01',subtotal:4.5,tax:.59,total:5.09,items:[{name:'Café',qty:1,price:4.5}]});
 assert.equal(buffer.subarray(0,4).toString(),'%PDF');assert.ok(buffer.length>1000);
});
