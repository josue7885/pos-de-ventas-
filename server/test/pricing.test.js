const {test}=require('node:test');
const assert=require('node:assert/strict');
const math=require('../../pos-math');
const {buildDocument}=require('../documents');
const {receiptDocument,receiptHtml}=require('../receipt');
test('inclusive catalog prices split VAT without increasing the payable amount',()=>{
 assert.deepEqual(math.totals([{price:113,qty:1}]),{gross:113,discount:0,subtotal:100,tax:13,total:113});
 assert.deepEqual(math.totals([{price:113,qty:1}],.13,10),{gross:113,discount:11.3,subtotal:90,tax:11.7,total:101.7});
 assert.deepEqual(math.totals([{price:4.5,qty:1}]),{gross:4.5,discount:0,subtotal:3.98,tax:.52,total:4.5});
 assert.deepEqual(math.totals([{price:3.33,qty:.333},{price:2.5,qty:1.25}],.13,10),{gross:4.24,discount:.42,subtotal:3.38,tax:.44,total:3.82});
 for(const rate of [0,.05,.13,1])for(const percent of [0,10,33.33,100])for(const price of [.01,.05,.99,113]){
  const result=math.totals([{price,qty:1}],rate,percent);
  assert.equal(math.cents(result.subtotal)+math.cents(result.tax),math.cents(result.total));
  assert.equal(math.cents(result.gross)-math.cents(result.discount),math.cents(result.total));
 }
});
test('old receipts keep their recorded exclusive totals and new JSON explains inclusive prices',()=>{
 const profile={company_name:'Negocio',iva_rate:.13};
 const source={number:'INT-1',created_at:'2020-01-01',subtotal:100,tax:13,total:113,items:[{name:'Artículo',price:100,qty:1}]};
 const old=buildDocument(profile,source);assert.equal(old.prices_include_tax,false);assert.equal(old.gross,100);assert.equal(old.total,113);assert.doesNotMatch(receiptHtml(old),/IVA incluido/);
 const current=buildDocument({...profile,prices_include_tax:true},{...source,items:[{name:'Artículo',price:113,qty:1}],prices_include_tax:1});
 assert.equal(current.prices_include_tax,true);assert.equal(current.gross,113);assert.equal(current.subtotal,100);assert.equal(current.items[0].line_total,113);assert.match(receiptHtml(current),/IVA incluido/);
});
test('professional PDFs paginate long item lists and retain the historical issuer',async()=>{
 const profile={company_name:'Taller de prueba',prices_include_tax:true};
 const items=Array.from({length:65},(_,i)=>({name:`Servicio ${i+1} - revisión y mantenimiento`,qty:1,price:113,unit:'servicio'}));
 const receipt=buildDocument(profile,{number:'INT-65',created_at:'2026-01-01',items,prices_include_tax:1,...math.totals(items)});
 const pdf=receiptDocument(profile,receipt,receipt);assert.ok(pdf.bufferedPageRange().count>=3);const chunks=[];
 await new Promise((resolve,reject)=>{pdf.on('data',d=>chunks.push(d));pdf.on('end',resolve);pdf.on('error',reject);pdf.end();});assert.equal(Buffer.concat(chunks).subarray(0,4).toString(),'%PDF');
});


test('report tables paginate many rows within the A4 page width',async()=>{
 const {reportDocument}=require('../report-pdf');
 const doc=reportDocument({company_name:'Inventario de prueba',currency_code:'USD'},'Inventario','Datos actuales',[{columns:[{label:'Producto',weight:3},{label:'Precio final',weight:1,align:'right'}],rows:Array.from({length:90},(_,i)=>['Producto '+i+' con descripción detallada y caracteres áéíóú','$113.00'])}]);
 assert.ok(doc.bufferedPageRange().count>=3);await new Promise((resolve,reject)=>{doc.on('data',()=>{});doc.on('end',resolve);doc.on('error',reject);doc.end();});
});
