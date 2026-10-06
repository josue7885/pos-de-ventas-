const {fail}=require('./commerce');
const currencies=['USD','EUR','GTQ','HNL','NIO','CRC','MXN','DOP'];
const locales=['es-SV','es-GT','es-HN','es-NI','es-CR','es-MX','es-DO','es-ES','en-US'];
const defaults={business_type:'mixed',currency_code:'USD',number_locale:'es-SV',tax_label:'IVA',receipt_footer:'Gracias por su compra',quote_validity_days:'15',tables_enabled:'true',kitchen_enabled:'true',quotes_enabled:'true',receiving_enabled:'true',payment_methods:JSON.stringify(['efectivo','tarjeta','transferencia']),default_product_type:'producto'};
const presets={retail:{tables_enabled:'false',kitchen_enabled:'false',default_product_type:'producto'},restaurant:{tables_enabled:'true',kitchen_enabled:'true',default_product_type:'producto'},services:{tables_enabled:'false',kitchen_enabled:'false',receiving_enabled:'false',default_product_type:'servicio'},mixed:{tables_enabled:'true',kitchen_enabled:'true',default_product_type:'producto'}};
function validate(input,db){
 const result={};for(const key of Object.keys(defaults))if(input[key]!==undefined)result[key]=input[key];
 for(const [key,values] of Object.entries({business_type:Object.keys(presets),currency_code:currencies,number_locale:locales,default_product_type:['producto','servicio']}))if(key in result && !values.includes(result[key]))fail(400,'Configuración inválida: '+key);
 for(const key of ['tables_enabled','kitchen_enabled','quotes_enabled','receiving_enabled'])if(key in result){if(![true,false,'true','false'].includes(result[key]))fail(400,'Opción inválida: '+key);result[key]=String(result[key]);}
 for(const [key,max] of [['tax_label',30],['receipt_footer',300]])if(key in result){if(typeof result[key]!=='string' || result[key].length>max || (key==='tax_label'&&!result[key].trim()))fail(400,'Texto inválido: '+key);result[key]=result[key].trim();}
 if('quote_validity_days' in result){const n=Number(result.quote_validity_days);if(!Number.isInteger(n)||n<1||n>90)fail(400,'La vigencia debe ser de 1 a 90 días');result.quote_validity_days=String(n);}
 if('payment_methods' in result){let methods=result.payment_methods;if(typeof methods==='string'){try{methods=JSON.parse(methods);}catch{fail(400,'Métodos de pago inválidos');}}if(!Array.isArray(methods)||!methods.length||methods.some(v=>!['efectivo','tarjeta','transferencia'].includes(v)))fail(400,'Selecciona al menos un método de pago válido');result.payment_methods=JSON.stringify([...new Set(methods)]);}
 if(db && result.currency_code){const old=db.prepare("SELECT value FROM app_settings WHERE key='currency_code'").get()?.value || 'USD';if(old!==result.currency_code && ['sales','quotes','purchases','expenses','shifts'].some(table=>db.prepare(`SELECT 1 AS present FROM ${table} LIMIT 1`).get()))fail(409,'La moneda no puede cambiar cuando ya hay operaciones. Crea otro negocio para usar otra moneda.');}
 return result;
}
function profile(settings){const result={...defaults,...Object.fromEntries(Object.keys(defaults).filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]]))};for(const k of ['tables_enabled','kitchen_enabled','quotes_enabled','receiving_enabled'])result[k]=result[k]==='true';result.payment_methods=JSON.parse(result.payment_methods);result.quote_validity_days=Number(result.quote_validity_days);return result;}
module.exports={defaults,presets,currencies,locales,validate,profile};
