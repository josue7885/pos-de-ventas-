function validatedConnection(value){
 const u=new URL(value);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Usa una dirección HTTP/HTTPS sin ruta ni credenciales.');
 return u.origin;
}
async function checkConnection(value){
 const base=validatedConnection(value),r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(8000),credentials:'omit',redirect:'error'});
 let data;try{data=await r.json();}catch{throw Error('La dirección no responde como servidor POS.');}
 if(!r.ok||data.service!=='pos-control'||!data.ready)throw Error('El servidor POS todavía no está disponible.');return base;
}
function openConnectionSettings(){
 const current=getSavedApiBase();document.getElementById('connection-url').value=current;
 document.getElementById('connection-status').textContent='En Android, el modo local requiere iniciar el servidor en Termux. Cada servidor conserva sus propios usuarios y datos.';
 openFloating('connection-dialog','connection-url');
}
async function setConnectionTarget(value){
 const pendingOperation=currentEmployee&&['quote','receive','creditnote','creditpayment'].some(k=>localStorage.getItem(`pos_operation:${operationScope()}:${currentEmployee.id}:${k}`));
 if(pendingSale||saleInFlight||pendingShiftReport()||pendingOperation||shiftReportBusy)throw Error('Confirma las operaciones pendientes antes de cambiar de servidor.');
 if(cart.length&&!confirm('El carrito sin cobrar se descartará al cambiar de servidor. ¿Continuar?'))return false;
 const base=await checkConnection(value);
 if(base!==getSavedApiBase()&&currentEmployee){await logoutUser();if(currentEmployee)throw Error('No se pudo cerrar la sesión anterior.');}
 localStorage.setItem('pos_api_base',base);
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))localStorage.setItem('pos_remote_base',base);
 sessionStorage.removeItem('pos_token');sessionStorage.removeItem('pos_business');location.reload();return true;
}
function initConnectionModes(){
 document.getElementById('connection-phone').addEventListener('click',()=>{document.getElementById('connection-url').value='http://127.0.0.1:3000';document.getElementById('connection-status').textContent='Inicia Termux con bash scripts/phone-server.sh. Luego prueba la conexión y guarda.';});
 document.getElementById('connection-remote').addEventListener('click',()=>{document.getElementById('connection-url').value=localStorage.getItem('pos_remote_base')||'';document.getElementById('connection-url').focus();});
 document.getElementById('connection-test').addEventListener('click',async()=>{const status=document.getElementById('connection-status');status.textContent='Comprobando…';try{await checkConnection(document.getElementById('connection-url').value.trim());status.textContent='Servidor disponible.';}catch(e){status.textContent=e.message+' Comprueba que el servidor esté iniciado.';}});
 document.getElementById('connection-form').addEventListener('submit',async event=>{event.preventDefault();const b=document.getElementById('connection-save');b.disabled=true;try{await setConnectionTarget(document.getElementById('connection-url').value.trim());}catch(e){document.getElementById('connection-status').textContent=e.message;}finally{b.disabled=false;}});
 document.getElementById('settings-connection-modes').addEventListener('click',openConnectionSettings);
}
