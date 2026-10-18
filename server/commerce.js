const math=require('../pos-math');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const fractional=new Set(['kg','g','litro','ml','metro','hora']);
const units=new Set(['unidad','pieza','caja','paquete','kg','g','litro','ml','metro','hora','servicio']);
function amount(value,label='Monto') {
 if(value===null || value==='' || typeof value==='boolean' || !Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>1000000)fail(400,label+' inválido');
 return math.cents(value)/100;
}
function qty(value,unit='unidad',allowZero=false) {
 const n=Number(value),scaled=math.quantity(n);
 if(value===null || value==='' || !['number','string'].includes(typeof value) || !Number.isFinite(n) || n<(allowZero?0:.001) || n>10000000 || Math.abs(n*1000-scaled)>1e-6 || (!fractional.has(unit) && !Number.isInteger(n)))fail(400,'Cantidad inválida para la unidad de medida');
 return scaled/1000;
}
function product(body) {
 const p={name:String(body.name||'').trim(),category:String(body.category||'').trim(),code:String(body.code||'').trim(),unit:body.unit||'unidad',type:body.type||'producto'};
 if(!p.name || p.name.length>200 || !p.category || p.category.length>100 || p.code.length>80 || !units.has(p.unit) || !['producto','servicio'].includes(p.type))fail(400,'Producto inválido');
 p.price=amount(body.price,'Precio');p.cost=amount(body.cost??0,'Costo');p.min_stock=p.type==='servicio'?0:qty(body.min_stock??0,p.unit,true);p.stock=p.type==='servicio'?0:qty(body.stock,p.unit,true);
 return p;
}
function checkout(db,input,user,rate,{quote=false}={}) {
 if(!Array.isArray(input.items) || !input.items.length || input.items.length>500)fail(400,'Agrega productos válidos');
 const seen=new Set(),manager=['admin','gerente'].includes(user.role);
 const items=input.items.map(item=>{
  if(!Number.isSafeInteger(item.id) || seen.has(item.id))fail(400,'Producto inválido o repetido');seen.add(item.id);
  const p=db.prepare('SELECT * FROM products WHERE id=?').get(item.id);
  if(!p)fail(409,'El artículo ya no está disponible');
  const count=qty(item.qty,p.unit);
  if(!quote && p.type!=='servicio' && math.quantity(p.stock)<math.quantity(count))fail(409,'Existencias insuficientes. Actualiza el catálogo.');
  const price=amount(item.price,'Precio');let priceReason='';
  if(math.cents(price)!==math.cents(p.price)) {
   if(!manager || item.catalogPrice===undefined || math.cents(item.catalogPrice)!==math.cents(p.price))fail(409,'El precio cambió o no tienes permiso para ajustarlo');
   priceReason=String(item.priceReason||'').trim();if(priceReason.length<3 || priceReason.length>240)fail(400,'Indica el motivo del precio especial');
  }
  return {id:p.id,name:p.name,price,qty:count,cost:p.cost,unit:p.unit,type:p.type,catalogPrice:p.price,priceReason};
 });
 const percent=Number(input.discountPercent??0),reason=String(input.discountReason||'').trim();
 if(!Number.isFinite(percent) || percent<0 || percent>100 || Math.abs(percent*100-Math.round(percent*100))>1e-6)fail(400,'Descuento inválido');
 if(percent>0 && (!manager || reason.length<3 || reason.length>240))fail(manager?400:403,'El descuento requiere administrador o gerente y un motivo');
 if(!Number.isFinite(Number(rate)) || rate<0 || rate>1)fail(500,'Tasa inválida');
 const totals=math.totals(items,rate,percent);
 if(totals.total>1000000 || totals.gross>1000000)fail(400,'Total fuera de rango');
 for(const field of ['subtotal','tax','total']) if(math.cents(amount(input[field]))!==math.cents(totals[field]))fail(409,'El total cambió. Actualiza la operación.');
 return {items,totals,percent,reason:percent?reason:''};
}
module.exports={amount,qty,product,checkout,fail,math};
