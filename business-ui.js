const businessTypes={retail:'Tienda / comercio',restaurant:'Restaurante / cafetería',services:'Servicios',mixed:'Negocio mixto'};
let businessDirectory=[],businessBusy=false;
const businessFields=['business_type','currency_code','number_locale','tax_label','receipt_footer','quote_validity_days','default_product_type'];
const businessFlags=['tables_enabled','kitchen_enabled','quotes_enabled','receiving_enabled'];
function canManageBusinesses(){return currentEmployee?.role==='admin' && getBusinessId()==='principal';}
function operationScope(){return API_BASE+(getBusinessId()==='principal'?'':':business='+getBusinessId());}
function moduleEnabled(id){const c=state.companySettings;return !(id==='businesses'&&!canManageBusinesses() || id==='tables'&&c.tables_enabled===false || ['orders','kitchen'].includes(id)&&c.kitchen_enabled===false);}
function fillBusinessSettings(settings){for(const key of businessFields){const el=document.getElementById('setting-'+key);if(el)el.value=settings[key]??'';}for(const key of businessFlags){const el=document.getElementById('setting-'+key);if(el)el.checked=settings[key]!==false && settings[key]!=='false';}for(const el of document.querySelectorAll('[data-enabled-payment]'))el.checked=(settings.payment_methods||['efectivo','tarjeta','transferencia']).includes(el.value);}
function readBusinessSettings(){const data={};for(const k of businessFields)data[k]=document.getElementById('setting-'+k).value;for(const k of businessFlags)data[k]=document.getElementById('setting-'+k).checked;data.payment_methods=Array.from(document.querySelectorAll('[data-enabled-payment]:checked')).map(el=>el.value);return data;}
function applyBusinessConfiguration(){
 for(const id of ['setting-business_type','apply-business-profile'])document.getElementById(id).disabled=currentEmployee?.role!=='admin';
 const c=state.companySettings,name=businessDirectory.find(b=>b.id===getBusinessId())?.name||c.company_name||'Negocio principal';
 document.getElementById('active-business-name').textContent=name;document.querySelectorAll('.currency-code').forEach(el=>el.textContent=c.currency_code||'USD');document.getElementById('sale-tax-label').textContent=c.tax_label||'IVA';
 for(const id of ['save-quote-btn','quotes-module-create-btn'])document.getElementById(id)?.classList.toggle('hidden',c.quotes_enabled===false);
 for(const id of ['send-kitchen-btn','open-kitchen-display-btn','open-customer-display-btn'])document.getElementById(id)?.classList.toggle('hidden',c.kitchen_enabled===false);
 document.getElementById('receive-stock-btn')?.classList.toggle('hidden',c.receiving_enabled===false);
 const select=document.getElementById('billing-payment-method'),previous=select.value,labels={efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia'},enabled=c.payment_methods||Object.keys(labels);select.replaceChildren(...enabled.map(m=>new Option(labels[m],m)));if(enabled.includes(previous))select.value=previous;
 if(currentEmployee && !availableModules().includes(activeModule))setActiveModule('pos');
}
async function loadBusinessDirectory(){const data=await apiRequest('/businesses');businessDirectory=data.businesses;const select=document.getElementById('business-select');select.replaceChildren(...businessDirectory.map(b=>new Option(b.name,b.id)));select.value=getBusinessId();}
async function switchBusiness(id){
 if(businessBusy)return;if(!businessDirectory.some(b=>b.id===id))return alert('Negocio no disponible');
 if(saleInFlight || pendingSale || ['quote','receive'].some(k=>currentEmployee && localStorage.getItem(`pos_operation:${operationScope()}:${currentEmployee.id}:${k}`))){document.getElementById('business-select').value=getBusinessId();return alert('Confirma primero las operaciones pendientes de este negocio.');}
 if(cart.length && !confirm('¿Cambiar de negocio y descartar el carrito sin cobrar?'))return;
 businessBusy=true;
 try{if(currentEmployee){await logoutUser();if(currentEmployee)return;}stopSync();resetEnhancements();cart=[];pendingSale=null;state=deepClone(DEFAULT_STATE);sessionStorage.removeItem('pos_token');setBusinessId(id);
  document.getElementById('pin-input').value='';document.getElementById('employee-select').replaceChildren();await loadCompanySettings();await fetchUsersFromServer();renderCart();showLogin();document.getElementById('business-select').value=id;applyBusinessConfiguration();
 }finally{businessBusy=false;}
}
async function refreshBusinesses(){if(!canManageBusinesses())return;showBusinessRecovery();try{const {businesses}=await apiRequest('/platform/businesses');document.getElementById('businesses-list').innerHTML=businesses.map(b=>`<tr><td>${escapeHtml(b.name)}</td><td>${b.active?'Activo':'Inactivo'}</td><td>${b.active?`<button class="primary-btn small" data-open-business="${b.id}">Ingresar</button>`:''}<button class="ghost-btn small" data-rename-business="${b.id}">Renombrar</button>${b.id!=='principal'?`<button class="ghost-btn small" data-toggle-business="${b.id}" data-active="${b.active}">${b.active?'Desactivar':'Activar'}</button>`:''}</td></tr>`).join('');}catch(e){alert(e.message);}}
function businessRequestKey(){return 'pos_business_creation:'+API_BASE+':'+currentEmployee.id;}
function showBusinessRecovery(){document.getElementById('recover-business-btn').classList.toggle('hidden',!canManageBusinesses() || !sessionStorage.getItem(businessRequestKey()));}
async function finishBusinessCreation(result){sessionStorage.removeItem(businessRequestKey());document.getElementById('business-create-form').reset();await loadBusinessDirectory();await refreshBusinesses();alert(`Negocio ${result.business.name} creado. Usa Ingresar y su PIN para configurarlo.`);}
async function recoverBusiness(){
 if(businessBusy || !canManageBusinesses())return;const key=sessionStorage.getItem(businessRequestKey());if(!key)return;businessBusy=true;
 try{await finishBusinessCreation(await apiRequest('/platform/businesses/requests/'+encodeURIComponent(key)));}
 catch(e){alert(e.status===404?'La creación aún no está confirmada. Puedes consultar otra vez o repetir Crear con los mismos datos.':e.message);}
 finally{businessBusy=false;showBusinessRecovery();}
}
async function createBusiness(event){
 event.preventDefault();if(businessBusy || !canManageBusinesses())return;businessBusy=true;const button=document.getElementById('create-business-btn');button.disabled=true;
 const storageKey=businessRequestKey();let key=sessionStorage.getItem(storageKey),uncertain=Boolean(key);
 try{let result;if(key){try{result=await apiRequest('/platform/businesses/requests/'+encodeURIComponent(key));}catch(e){if(e.status!==404)throw e;}}
  if(!result){key ||= newRequestId();sessionStorage.setItem(storageKey,key);const body={name:document.getElementById('business-name').value,adminName:document.getElementById('business-admin-name').value,adminPin:document.getElementById('business-admin-pin').value,business_type:document.getElementById('business-type').value,currency_code:document.getElementById('business-currency').value};result=await apiRequest('/platform/businesses',{method:'POST',headers:{...await executiveHeaders(),'Idempotency-Key':key},body:JSON.stringify(body)});}
  await finishBusinessCreation(result);
 }catch(e){if(e.status>=400&&e.status<500&&!uncertain)sessionStorage.removeItem(storageKey);alert(e.message+' Si la respuesta se perdió, pulsa Consultar creación pendiente.');}
 finally{businessBusy=false;button.disabled=false;showBusinessRecovery();}
}
async function initializeBusinesses(){
 const currencies=['USD','EUR','GTQ','HNL','NIO','CRC','MXN','DOP'];
 for(const id of ['business-type','setting-business_type'])document.getElementById(id).replaceChildren(...Object.entries(businessTypes).map(([v,n])=>new Option(n,v)));
 for(const id of ['business-currency','setting-currency_code'])document.getElementById(id).replaceChildren(...currencies.map(v=>new Option(v,v)));
 document.getElementById('setting-number_locale').replaceChildren(...['es-SV','es-GT','es-HN','es-NI','es-CR','es-MX','es-DO','es-ES','en-US'].map(v=>new Option(v,v)));
 document.getElementById('business-select').addEventListener('change',e=>switchBusiness(e.target.value).catch(e=>alert(e.message)));
 document.getElementById('switch-business-btn').addEventListener('click',async()=>{if(saleInFlight||pendingSale)return alert('Confirma la venta pendiente.');await switchBusiness(getBusinessId());document.getElementById('business-select').focus();});
 document.getElementById('apply-business-profile').addEventListener('click',()=>{if(currentEmployee?.role!=='admin')return alert('Solo el administrador puede cambiar el tipo de negocio.');const type=document.getElementById('setting-business_type').value;for(const key of businessFlags)document.getElementById('setting-'+key).checked=['tables_enabled','kitchen_enabled'].includes(key)?['restaurant','mixed'].includes(type):key==='receiving_enabled'?type!=='services':true;document.getElementById('setting-default_product_type').value=type==='services'?'servicio':'producto';});
 document.getElementById('business-create-form').addEventListener('submit',createBusiness);
 document.getElementById('recover-business-btn').addEventListener('click',recoverBusiness);
 document.getElementById('businesses-list').addEventListener('click',async event=>{const b=event.target.closest('button');if(!b||b.disabled)return;b.disabled=true;try{
  if(b.dataset.openBusiness){await loadBusinessDirectory();await switchBusiness(b.dataset.openBusiness);return;}
  const id=b.dataset.toggleBusiness||b.dataset.renameBusiness,body={};if(b.dataset.toggleBusiness){const active=b.dataset.active!=='1';if(!confirm(active?'¿Activar negocio?':'¿Desactivar el acceso a este negocio? Sus datos se conservan.'))return;body.active=active;}else{const name=prompt('Nombre en el selector de negocios:');if(!name)return;body.name=name;}
  await apiRequest('/platform/businesses/'+id,{method:'PATCH',headers:await executiveHeaders(),body:JSON.stringify(body)});await loadBusinessDirectory();await refreshBusinesses();applyBusinessConfiguration();
 }catch(e){alert(e.message);}finally{b.disabled=false;}});
 try{await loadBusinessDirectory();if(!businessDirectory.some(b=>b.id===getBusinessId())){setBusinessId('principal');sessionStorage.removeItem('pos_token');}await loadCompanySettings();await fetchUsersFromServer();document.getElementById('business-select').value=getBusinessId();applyBusinessConfiguration();}
 catch(e){const error=document.getElementById('login-error');error.textContent=e.message;error.classList.remove('hidden');}
}
