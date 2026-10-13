// Floating workspaces keep form nodes and sale state alive during synchronization.
let customerSelectionSequence=0;
const floatingReturnFocus=new Map();
function closeFloating(id,restoreFocus=true){
 const dialog=document.getElementById(id);if(!dialog?.open)return;
 if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
 if(id==='sale-catalog')document.getElementById('sale-inventory-btn').setAttribute('aria-expanded','false');
 document.body.classList.toggle('has-floating-dialog',Boolean(document.querySelector('dialog.floating-dialog[open]')));
 const target=floatingReturnFocus.get(id);floatingReturnFocus.delete(id);
 if(restoreFocus){const focus=target?.isConnected?target:document.getElementById(target?.id);focus?.focus();}
}
function closeAllFloating(restoreFocus=true){document.querySelectorAll('dialog.floating-dialog[open]').forEach(d=>closeFloating(d.id,restoreFocus));}
function openFloating(id,focusId){
 const dialog=document.getElementById(id);if(!dialog)return;
 const previous=document.activeElement;
 closeAllFloating(false);floatingReturnFocus.set(id,previous);
 if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
 document.body.classList.add('has-floating-dialog');
 if(id==='sale-catalog')document.getElementById('sale-inventory-btn').setAttribute('aria-expanded','true');
 (document.getElementById(focusId)||dialog.querySelector('button,input,select,textarea'))?.focus();
}
function initializeFloatingPanels(){
 const create=(id,title,wide=false)=>{
  const dialog=document.createElement('dialog');dialog.id=id;dialog.className='floating-dialog'+(wide?' floating-wide':'');dialog.setAttribute('aria-labelledby',id+'-title');
  dialog.innerHTML=`<header class="floating-header"><h3 id="${id}-title">${title}</h3><button type="button" class="icon-close" data-close-floating aria-label="Cerrar ventana">×</button></header><div class="floating-body"></div>`;
  return dialog;
 };
 for(const [id,title,wide] of [['sale-catalog','Inventario para agregar a la cuenta',true],['billing-more','Datos del cliente',false]]){
  const old=document.getElementById(id),dialog=create(id,title,wide);old.querySelector('summary').remove();
  dialog.querySelector('.floating-body').append(...old.childNodes);old.remove();document.body.append(dialog);
 }
 const fields=document.querySelector('#billing-more .billing-fields');
 const nameGroup=document.getElementById('billing-customer-name').closest('.field-group'),emailGroup=document.getElementById('billing-customer-email').closest('.field-group');
 const editButton=document.getElementById('billing-edit-customer-btn'),summary=document.createElement('div');summary.className='field-group sale-customer-summary';
 summary.innerHTML='<span>Cliente de la venta</span><strong id="sale-customer-summary">Cliente general</strong><small id="sale-customer-email-summary"></small>';
 editButton.textContent='Editar cliente';summary.append(editButton);nameGroup.before(summary);fields.prepend(nameGroup,emailGroup);
 const lookup=document.querySelector('#billing-more .customer-lookup'),search=document.getElementById('customer-directory-search');
 search.append(document.getElementById('billing-customer-search'),document.getElementById('customer-select'));document.getElementById('customer-select').hidden=true;
 const actions=document.createElement('div');actions.className='floating-actions';actions.append(document.getElementById('save-customer-btn'));
 actions.insertAdjacentHTML('beforeend','<button type="button" id="customer-use-draft" class="primary-btn">Usar en esta venta</button><button type="button" class="ghost-btn" data-close-floating>Cerrar</button>');
 document.querySelector('#billing-more .floating-body').append(actions);lookup.remove();
 for(const [id,nodeId,title] of [['product-editor-dialog','product-form-panel','Artículo de inventario'],['receive-stock-dialog','receive-stock-form','Entrada de inventario']]){
  const dialog=create(id,title);dialog.querySelector('.floating-body').append(document.getElementById(nodeId));document.body.append(dialog);
 }
 document.querySelectorAll('dialog.floating-dialog').forEach(dialog=>{
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeFloating(dialog.id);});
  dialog.addEventListener('click',event=>{
   if(event.target.closest('[data-close-floating]'))closeFloating(dialog.id);
   else if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeFloating(dialog.id);}
  });
  dialog.addEventListener('keydown',event=>{
   if(event.key!=='Tab')return;
   const items=[...dialog.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
   const first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
 });
 document.getElementById('customer-directory-btn').addEventListener('click',openCustomerDirectory);
 document.getElementById('directory-new-customer').addEventListener('click',()=>customerEditor(true));
 document.getElementById('directory-general-customer').addEventListener('click',()=>selectRegisteredCustomer(''));
 document.getElementById('customer-use-draft').addEventListener('click',()=>{updateCustomerSummary();closeFloating('billing-more');});
 document.getElementById('customer-directory-body').addEventListener('click',event=>{const b=event.target.closest('[data-customer-use],[data-customer-edit]');if(b)selectRegisteredCustomer(b.dataset.customerUse||b.dataset.customerEdit,{edit:Boolean(b.dataset.customerEdit)});});
 document.getElementById('billing-more').addEventListener('input',updateCustomerSummary);
 document.getElementById('inventory-check-product').addEventListener('change',captureCountStock);
 document.getElementById('inventory-check-form').addEventListener('submit',saveInventoryCount);
 updateCustomerSummary();
}
function updateCustomerSummary(){
 const name=document.getElementById('sale-customer-summary'),email=document.getElementById('sale-customer-email-summary');
 if(name)name.textContent=document.getElementById('billing-customer-name').value.trim()||'Cliente general';
 if(email)email.textContent=document.getElementById('billing-customer-email').value.trim()||'Sin correo';
}
function clearCustomerFields(){
 ++customerSelectionSequence;document.getElementById('customer-select').value='';
 document.querySelectorAll('#billing-more input,#billing-more textarea').forEach(el=>el.value='');
 document.getElementById('billing-customer-type').value='consumidor_final';updateCustomerSummary();
}
function customerEditor(isNew){
 if(operationLocked()||!availableModules().includes('pos'))return;
 if(isNew)clearCustomerFields();
 setActiveModule('pos');closeBillingModal();openFloating('billing-more','billing-customer-name');
}
async function openCustomerDirectory(){
 if(operationLocked()||!availableModules().includes('pos'))return;
 setActiveModule('pos');renderCustomerDirectory();openFloating('customer-directory-dialog','billing-customer-search');
 const user=currentEmployee.id;
 try{const data=await apiRequest('/customers');if(currentEmployee?.id!==user)return;customerDirectory=data.customers;renderCustomerDirectory();}
 catch(error){document.getElementById('customer-directory-status').textContent=error.message;}
}
function renderCustomerTable(matches){
 const body=document.getElementById('customer-directory-body');if(!body)return;
 body.innerHTML=matches.length?matches.map(c=>`<tr><td>${escapeHtml(c.full_name)}</td><td>${escapeHtml(c.nit||c.dui||'CF')}</td><td>${escapeHtml(c.phone||'—')}</td><td>${escapeHtml(c.email||'—')}</td><td><div class="floating-row-actions"><button type="button" class="primary-btn small" data-customer-use="${Number(c.id)}">Usar en venta</button><button type="button" class="ghost-btn small" data-customer-edit="${Number(c.id)}">Editar</button></div></td></tr>`).join(''):'<tr><td colspan="5">No hay clientes que coincidan con la búsqueda.</td></tr>';
 document.getElementById('customer-directory-status').textContent=`${matches.length} de ${customerDirectory.length} clientes`;
}
async function selectRegisteredCustomer(id,{edit=false}={}){
 if(operationLocked()||!availableModules().includes('pos'))return;
 const sequence=++customerSelectionSequence;
 if(!id){clearCustomerFields();closeFloating('customer-directory-dialog');return;}
 try{
  const {customer:c}=await apiRequest('/customers/'+encodeURIComponent(id));if(sequence!==customerSelectionSequence||!currentEmployee)return;
  document.getElementById('customer-select').value=String(c.id);
  for(const [field,key] of Object.entries({name:'full_name',email:'email',nit:'nit',phone:'phone',address:'address',department:'department',municipality:'municipality',giro:'giro',notes:'notes'}))document.getElementById('billing-customer-'+field).value=c[key]||(field==='nit'?c.dui:'')||'';
  document.getElementById('billing-customer-type').value=c.document_type||'consumidor_final';updateCustomerSummary();closeFloating('customer-directory-dialog');if(edit)customerEditor(false);
 }catch(error){if(sequence===customerSelectionSequence)alert(error.message);}
}
function captureCountStock(){
 const product=state.products.find(p=>p.id===Number(document.getElementById('inventory-check-product').value));
 document.getElementById('inventory-check-expected').value=product?.stock??'';
 document.getElementById('inventory-check-counted').step=product?quantityStep(product):1;
}
function openInventoryCount(){
 if(!canEditInventory())return;
 const form=document.getElementById('inventory-check-form');form.reset();
 document.getElementById('inventory-check-product').replaceChildren(...state.products.filter(tracksStock).map(p=>new Option(`${p.name} (${p.unit})`,String(p.id))));
 document.getElementById('inventory-check-date').value=new Date().toISOString().slice(0,10);captureCountStock();openFloating('inventory-count-dialog','inventory-check-product');
}
async function saveInventoryCount(event){
 event.preventDefault();if(!canEditInventory())return;
 const form=document.getElementById('inventory-check-form'),button=form.querySelector('[type=submit]');if(button.disabled||!form.reportValidity())return;button.disabled=true;
 try{
  await apiRequest('/inventory/check',{method:'POST',body:JSON.stringify({product_id:Number(document.getElementById('inventory-check-product').value),fecha:document.getElementById('inventory-check-date').value,expected_qty:Number(document.getElementById('inventory-check-expected').value),counted_qty:Number(document.getElementById('inventory-check-counted').value),notes:document.getElementById('inventory-check-notes').value,adjustStock:document.getElementById('inventory-check-adjust').checked})});
  form.reset();closeFloating('inventory-count-dialog');await syncFromServer();await refreshInventoryHistory();alert('Conteo guardado correctamente.');
 }catch(error){alert(error.message);}finally{button.disabled=false;}
}

// Features adapted from the supplied UI. Every business write is confirmed by the API.
let stockLastUpdated=0,stockSyncError=false;
let customerDirectory=[],documentDirectory=[],selectedQuoteId=null,documentsSequence=0,lastConfirmedDocument=null;
const fractionalUnits=new Set(['kg','g','litro','ml','metro','hora']);
function tracksStock(p){return p.type!=='servicio';}
function quantityStep(p){return fractionalUnits.has(p.unit)?0.001:1;}
function roundQuantity(n){return Math.round(n*1000)/1000;}
function canEditInventory(){return Boolean(currentEmployee && ['admin','gerente'].includes(currentEmployee.role));}
function operationLocked(){return saleInFlight || pendingSale;}
function resetEnhancements(){resetCreditUI();closeAllFloating(false);++customerSelectionSequence;document.getElementById('sale-inventory-search').value='';document.getElementById('sale-inventory-status').textContent='';document.getElementById('sale-catalog').open=false;document.getElementById('product-grid').replaceChildren();document.getElementById('home-period').value='7';document.getElementById('search-input').value='';document.getElementById('sale-entry-quantity').value='1';document.getElementById('billing-more').open=false;stockLastUpdated=0;stockSyncError=false;document.getElementById('system-product-search').value='';document.getElementById('system-product-results').replaceChildren();document.getElementById('system-product-results').classList.add('hidden');document.getElementById('stock-search-status').textContent='';rememberedModule={};lastConfirmedDocument=null;document.getElementById('sale-document-confirmation')?.classList.add('hidden');for(const id of ['setting-business_type','apply-business-profile'])document.getElementById(id).disabled=true;customerDirectory=[];documentDirectory=[];selectedQuoteId=null;++documentsSequence;resetSaleAdjustments();document.getElementById('operation-recovery-panel')?.classList.add('hidden');document.querySelectorAll('[id^=billing-customer-]').forEach(el=>{if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')el.value='';});renderCustomerDirectory('');updateCustomerSummary();}
function resetCheckoutCustomer(){
 document.getElementById('customer-select').value='';
 document.querySelectorAll('[id^=billing-customer-]').forEach(el=>{if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')el.value='';});
 document.getElementById('billing-customer-type').value='consumidor_final';renderCustomerDirectory('');updateCustomerSummary();
 document.getElementById('billing-cash-received').value='';
}
function resetSaleAdjustments(){
 for(const id of ['billing-discount-percent','billing-discount-reason']){const el=document.getElementById(id);if(el)el.value=id.endsWith('percent')?'0':'';}
 selectedQuoteId=null;const label=document.getElementById('selected-quote-label');if(label)label.textContent='';
}
function renderCustomerDirectory(selected=document.getElementById('customer-select')?.value||''){
 const select=document.getElementById('customer-select');if(!select)return;
 const search=(document.getElementById('billing-customer-search')?.value||'').toLowerCase();
 const matches=customerDirectory.filter(c=>[c.full_name,c.nit,c.dui,c.email,c.phone].some(v=>String(v||'').toLowerCase().includes(search)));
 select.replaceChildren(new Option('Cliente general / consumidor final',''),...customerDirectory.map(c=>new Option(`${c.full_name} · ${c.nit||c.phone||'Sin documento'}`,String(c.id))));select.value=selected;
 renderCustomerTable(matches);
}
async function trackedOperation(kind,path,payload){
 const key=`pos_operation:${operationScope()}:${currentEmployee.id}:${kind}`;
 let operation;
 try{operation=JSON.parse(localStorage.getItem(key)||'null');}catch{throw Error('El registro pendiente está dañado. Conserva los datos y solicita revisión.');}
 if(!operation && payload===null)throw Error('No hay una operación pendiente.');
 if(!operation){operation={key:newRequestId(),payload};localStorage.setItem(key,JSON.stringify(operation));}
 try{const result=await apiRequest(path,{method:'POST',headers:{'Idempotency-Key':operation.key},body:JSON.stringify(operation.payload)});localStorage.removeItem(key);refreshPendingOperations();return result;}
 catch(error){
  if(error.status>=400 && error.status<500 && !operation.uncertain)localStorage.removeItem(key);
  else{operation.uncertain=true;localStorage.setItem(key,JSON.stringify(operation));error.message+=' La operación se conserva. Repite el mismo botón para recuperar su resultado.';}
  refreshPendingOperations();throw error;
 }
}
function cartPayload(){return {currency:state.companySettings.currency_code||'USD',...getCustomerPayloadFromForm(),...getCartTotals(),discountPercent:Number(document.getElementById('billing-discount-percent')?.value||0),discountReason:document.getElementById('billing-discount-reason')?.value||'',quoteId:selectedQuoteId,items:cart.map(i=>({id:i.id,name:i.name,qty:i.qty,price:i.price,catalogPrice:i.catalogPrice,priceReason:i.priceReason}))};}
async function saveQuoteFromCart(){
 if(operationLocked())return alert('Confirma primero la venta pendiente.');
 if(!currentEmployee || !['admin','gerente','cajero'].includes(currentEmployee.role))return alert('No tienes permiso para crear cotizaciones.');
 if(!cart.length)return alert('Agrega artículos a la cotización.');
 const buttons=['save-quote-btn','quotes-module-create-btn'].map(id=>document.getElementById(id)).filter(Boolean);
 if(buttons.some(b=>b.disabled))return;
 buttons.forEach(b=>b.disabled=true);
 try{const result=await trackedOperation('quote','/quotes',cartPayload());await refreshDocuments();setActiveModule('documents');alert(`Cotización ${result.quote.number} guardada. No genera cobro ni descuenta inventario.`);}
 catch(error){alert(error.message);}finally{buttons.forEach(b=>b.disabled=false);}
}
async function refreshDocuments(){
 if(!currentEmployee || !['admin','gerente','cajero','contador'].includes(currentEmployee.role))return;
 const seq=++documentsSequence,user=currentEmployee.id,status=document.getElementById('billing-server-status');
 try{const data=await apiRequest('/documents');if(seq!==documentsSequence || currentEmployee?.id!==user)return;documentDirectory=data.documents;renderDocuments();await refreshCreditAccounts();status.textContent='Comprobantes internos registrados en el servidor. Sin autorización fiscal.';}
 catch(error){if(seq===documentsSequence)status.textContent=error.message;}
}
function documentButtons(d){
 const identity=`data-kind="${d.kind}" data-id="${d.id}"`;
 const actions=[['ticket','Imprimir'],['pdf','PDF'],['json','JSON'],['email','Enviar correo'],['whatsapp','WhatsApp']];
 let html=actions.map(([action,label])=>`<button type="button" class="ghost-btn small" data-document-action="${action}" ${identity}>${label}</button>`).join('');
 if(d.kind==='quote' && ['admin','gerente','cajero'].includes(currentEmployee?.role) && !d.converted_sale_id && new Date(d.valid_until)>new Date())html+=`<button type="button" class="primary-btn small" data-document-action="load" ${identity}>Usar en venta</button>`;
 if(d.kind==='sale'&&canEditInventory())html+=`<button type="button" class="ghost-btn small" data-document-action="creditnote" ${identity}>Nota de crédito</button>`;
 if(d.kind==='sale'&&d.payment_method==='credito'&&['admin','gerente','cajero'].includes(currentEmployee?.role))html+=`<button type="button" class="primary-btn small" data-document-action="creditpayment" ${identity}>Registrar abono</button>`;
 return html;
}
function showConfirmedSale(sale,number,emailDelivery){
 lastConfirmedDocument={...sale,kind:'sale',number};
 const panel=document.getElementById('sale-document-confirmation');
 panel.innerHTML=`<p><strong>Venta confirmada ${escapeHtml(number)}</strong> · ${currency(sale.total)}</p><div class="sale-document-actions">${documentButtons(lastConfirmedDocument)}</div>`;
 panel.classList.remove('hidden');
 if(emailDelivery)appendReceiptStatus(emailDelivery.message);
}
function documentFileBase(d){return `${({quote:'cotizacion',credit_note:'nota-credito',credit_payment:'abono'})[d.kind]||'comprobante'}-${String(d.number||d.id).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80)}`;}
function openReceiptWindow(){
 const popup=window.open('','_blank','width=900,height=900');
 if(!popup)return null;
 popup.opener=null;
 popup.document.write('<!DOCTYPE html><html lang="es"><meta charset="utf-8"><title>Preparando comprobante</title><body>Esperando confirmación del cobro. No cierres esta ventana...</body></html>');
 popup.document.close();return popup;
}
function appendReceiptStatus(message){const p=document.createElement('p');p.className='receipt-status';p.textContent=message;document.getElementById('sale-document-confirmation').append(p);}
async function deliverSaleReceipt(d,output,popup){
 try{
  if(output==='pdf'){await downloadFromApi(`/documents/sale/${d.id}/pdf`,`${documentFileBase(d)}.pdf`);appendReceiptStatus('PDF generado y descarga solicitada.');}
  else if(output==='ticket'){await printDocument(d,popup,'ticket');appendReceiptStatus('Ticket preparado. Confirma la impresora o elige Guardar como PDF en el diálogo.');}
 }catch(error){appendReceiptStatus('Venta registrada. '+error.message+' Usa Imprimir o PDF para volver a abrir el comprobante.');}
}
async function printDocument(d,popup=openReceiptWindow(),format='ticket'){
 // A provided null means popup blocking; do not open another after the asynchronous sale.
 if(!popup)throw Error('Permite ventanas emergentes para imprimir. También puedes descargar el PDF.');
 const user=currentEmployee?.id;
 try{
  const response=await posFetch(getApiUrl(`/documents/${d.kind}/${d.id}/html?format=${format}`));
  if(!response.ok){const data=await response.json();throw Error(data.error||'No se pudo preparar la impresión.');}
  const html=await response.text();
  if(currentEmployee?.id!==user)throw Error('La sesión cambió. Vuelve a abrir el documento.');
  if(popup.closed)throw Error('Se cerró la ventana de impresión.');
  popup.document.open();popup.document.write(html);popup.document.close();
  await Promise.all(Array.from(popup.document.images).map(img=>img.complete?Promise.resolve():new Promise(resolve=>{const timer=setTimeout(resolve,3000);img.onload=img.onerror=()=>{clearTimeout(timer);resolve();};})));
  if(!popup.closed){popup.focus();popup.print();}
 }catch(error){popup.close();throw error;}
}
function renderDocuments(){
 const search=(document.getElementById('billing-invoices-search').value||'').toLowerCase(),start=document.getElementById('billing-invoices-from').value,end=document.getElementById('billing-invoices-to').value,type=document.getElementById('billing-invoices-type').value;
 const sales=documentDirectory.filter(d=>d.kind!=='quote' && (!type || d.kind===type || d.kind==='sale'&&d.document_type===type) && (!start || d.created_at.slice(0,10)>=start) && (!end || d.created_at.slice(0,10)<=end) && [d.number,d.customer_name,d.customer_nit].some(v=>String(v||'').toLowerCase().includes(search)));
 document.getElementById('billing-invoices-summary').textContent=`${sales.length} comprobantes · Total ${currency(sales.reduce((sum,s)=>sum+(s.kind==='credit_payment'?0:s.kind==='credit_note'?-s.total:s.total),0))} (ventas menos notas; abonos excluidos) · Fechas UTC`;
 document.getElementById('billing-invoices-body').innerHTML=sales.map(d=>`<tr><td>${escapeHtml(d.number)}</td><td>${escapeHtml(creditDocumentLabel(d))}</td><td>${escapeHtml(new Date(d.created_at).toLocaleString())}</td><td>${escapeHtml(d.customer_name)}</td><td>${d.kind==='sale'&&d.payment_method==='credito'?'Saldo '+currency(d.credit_state?.balance??d.total):'Registrado · no fiscal'}</td><td>${currency(d.total)}</td><td class="sale-document-actions">${documentButtons(d)}</td></tr>`).join('')||'<tr><td colspan="7">No hay documentos con esos filtros.</td></tr>';
 const q=(document.getElementById('documents-quote-search').value||'').toLowerCase();
 const quotes=documentDirectory.filter(d=>d.kind==='quote' && [d.number,d.customer_name,d.customer_nit].some(v=>String(v||'').toLowerCase().includes(q)));
 document.getElementById('documents-quotes-content').innerHTML='<div class="table-wrap"><table><thead><tr><th>Número</th><th>Cliente</th><th>Vigencia</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+quotes.map(d=>`<tr><td>${escapeHtml(d.number)}</td><td>${escapeHtml(d.customer_name)}</td><td>${escapeHtml(new Date(d.valid_until).toLocaleString())}</td><td>${currency(d.total)}</td><td>${d.converted_sale_id?'Convertida #'+d.converted_sale_id:new Date(d.valid_until)<new Date()?'Vencida':'Vigente'}</td><td class="sale-document-actions">${documentButtons(d)}</td></tr>`).join('')+'</tbody></table></div>';
}
async function downloadFromApi(path,filename){
 const res=await posFetch(getApiUrl(path));if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.error||'No se pudo descargar');}
 const url=URL.createObjectURL(await res.blob()),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function documentAction(event){
 const button=event.target.closest('[data-document-action]');if(!button)return;
 const d=[...documentDirectory,lastConfirmedDocument,lastCreditDocument].find(x=>x && x.kind===button.dataset.kind && x.id===Number(button.dataset.id));if(!d || button.disabled)return;
 button.disabled=true;
 try{
  const action=button.dataset.documentAction;
  if(action==='pdf'||action==='json')await downloadFromApi(`/documents/${d.kind}/${d.id}/${action}`,`${documentFileBase(d)}.${action}`);
  if(action==='ticket')await printDocument(d);
  if(action==='email'){
   const email=prompt('Correo del destinatario:',d.customer_email||'');if(!email)return;
   await apiRequest(`/documents/${d.kind}/${d.id}/email`,{method:'POST',body:JSON.stringify({customerEmail:email})});alert('Correo aceptado por el servidor. Revisa la bandeja de entrada y spam del destinatario.');
  }
  if(action==='load')await loadQuoteToCart(d);
  if(action==='creditnote'||action==='creditpayment')await openCreditOperation(d,action);
  if(action==='whatsapp')await prepareDocumentShare(d);
 }catch(error){alert(error.message);}finally{button.disabled=false;}
}
async function loadQuoteToCart(quote){
 if(!['admin','gerente','cajero'].includes(currentEmployee?.role))throw Error('Permiso insuficiente');
 if(operationLocked())throw Error('Confirma primero la venta pendiente.');
 if(cart.length && !confirm('¿Reemplazar el carrito por esta cotización?'))return;
 if(quote.converted_sale_id || new Date(quote.valid_until)<new Date())throw Error('La cotización ya fue convertida o venció.');
 await syncFromServer();const items=[];
 for(const it of quote.items){const p=state.products.find(p=>p.id===it.product_id);if(!p)throw Error(`Artículo no disponible: ${it.name}`);items.push({...p,qty:it.qty,price:p.price,catalogPrice:p.price});}
 cart=items;selectedQuoteId=quote.id;
 for(const [id,value] of Object.entries({'billing-customer-name':quote.customer_name,'billing-customer-nit':quote.customer_nit,'billing-customer-email':quote.customer_email,'billing-customer-address':quote.customer_address,'billing-customer-phone':quote.customer_phone,'billing-customer-department':quote.customer_department,'billing-customer-municipality':quote.customer_municipality,'billing-customer-giro':quote.customer_giro,'billing-customer-type':quote.document_type}))document.getElementById(id).value=value||'';
 document.getElementById('customer-select').value='';
 document.getElementById('billing-discount-percent').value=canEditInventory()?quote.discount_percent||0:0;document.getElementById('billing-discount-reason').value=canEditInventory()?quote.discount_reason||'':'';
 document.getElementById('selected-quote-label').textContent=`Cotización ${quote.number}. Revisa precios y existencias actuales antes de cobrar.`;
 updateCustomerSummary();renderCart();setActiveModule('pos');
}
function renderExtendedInventory(){
 const search=(document.getElementById('inventory-search')?.value||'').toLowerCase(),filter=document.getElementById('inventory-status-filter')?.value||'all';
 const products=state.products.filter(p=>[p.name,p.code,p.category].some(v=>String(v||'').toLowerCase().includes(search)) && (filter==='all' || filter==='services' && !tracksStock(p) || filter==='low' && tracksStock(p) && p.stock<=p.min_stock || filter==='out' && tracksStock(p) && p.stock===0));
 const body=document.getElementById('inventory-table-body');if(!body)return;
 body.innerHTML=products.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td><td>${escapeHtml(p.code)}</td><td>${currency(p.cost)}</td><td>${currency(p.price)}</td><td>${tracksStock(p)?p.stock+' '+escapeHtml(p.unit):'Sin existencias'}</td><td>${!tracksStock(p)?'Servicio':p.stock===0?'Agotado':p.stock<=p.min_stock?'Existencias bajas':'Disponible'}</td><td><button class="ghost-btn small edit-product-btn" data-id="${p.id}">Editar</button><button class="danger-btn small delete-product-btn" data-id="${p.id}">Eliminar</button></td></tr>`).join('');
 body.querySelectorAll('.edit-product-btn').forEach(b=>b.onclick=()=>openProductForm(Number(b.dataset.id)));body.querySelectorAll('.delete-product-btn').forEach(b=>b.onclick=()=>deleteProduct(Number(b.dataset.id)));
 const low=state.products.filter(p=>tracksStock(p)&&p.stock<=p.min_stock).length;
 document.getElementById('inventory-summary').textContent=`${state.products.length} artículos · ${low} con existencias bajas · Costo del inventario ${currency(state.products.reduce((s,p)=>s+(tracksStock(p)?p.cost*p.stock:0),0))}`;
 const categories=[...new Set([...(state.categories||[]),...state.products.map(p=>p.category)])].sort();
 document.getElementById('inventory-category-options').innerHTML=categories.map(c=>`<option value="${escapeHtml(c)}"></option>`).join('');
 document.getElementById('inventory-category-list').innerHTML=categories.map(c=>`<button class="ghost-btn small" data-delete-category="${escapeHtml(c)}" title="Eliminar categoría vacía">${escapeHtml(c)} ×</button>`).join('');
 const receive=document.getElementById('receive-product'),selected=receive.value;
 receive.replaceChildren(...state.products.filter(tracksStock).map(p=>new Option(`${p.name} (${p.stock} ${p.unit})`,String(p.id))));if(selected)receive.value=selected;
 if(currentEmployee && activeModule==='inventory')refreshInventoryHistory();
}
async function refreshInventoryHistory(){
 if(!canEditInventory())return;const user=currentEmployee.id;
 try{
  const data=await apiRequest('/inventory/history');if(typeof document==='undefined'||currentEmployee?.id!==user)return;
  document.getElementById('inventory-movements-body').innerHTML=data.movements.map(m=>`<tr><td>${escapeHtml(new Date(m.created_at).toLocaleString())}</td><td>${escapeHtml(m.product_name||'#'+m.product_id)}</td><td>${m.delta>=0?'Entrada':'Salida'}</td><td>${m.delta}</td><td>${escapeHtml(m.employee_name||'#'+m.user_id)}</td><td>${escapeHtml(m.reason)}</td></tr>`).join('');
  document.getElementById('inventory-purchases-body').innerHTML=data.receipts.map(r=>`<tr><td>${escapeHtml(new Date(r.created_at).toLocaleString())}</td><td>${escapeHtml(r.product_name)}</td><td>${escapeHtml(r.supplier)}</td><td>${r.qty}</td><td>${currency(r.cost)}</td><td>${currency(r.qty*r.cost)}</td><td>${escapeHtml(r.reference)}</td></tr>`).join('');
  document.getElementById('inventory-checks-body').innerHTML=data.checks.map(c=>`<tr><td>${escapeHtml(c.fecha)}</td><td>${escapeHtml(c.product_name)}</td><td>${c.expected_qty}</td><td>${c.counted_qty}</td><td>${c.difference}</td><td>Registro de conteo</td><td>${escapeHtml(c.notes)}</td></tr>`).join('');
 }catch(error){if(typeof document!=='undefined')document.getElementById('inventory-movements-body').textContent=error.message;}
}
function updateProductTypeFields(){
 const type=document.getElementById('product-type').value,unit=document.getElementById('product-unit').value;
 for(const id of ['product-stock','product-min-stock']){const field=document.getElementById(id);field.disabled=type==='servicio';field.step=quantityStep({unit});if(type==='servicio')field.value=0;}
}
async function receiveInventory(event){
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
 try{
  const p=state.products.find(p=>p.id===Number(document.getElementById('receive-product').value));if(!p)throw Error('Selecciona un producto');
  const payload={productId:p.id,expectedStock:p.stock,qty:Number(document.getElementById('receive-quantity').value),cost:Number(document.getElementById('receive-unit-cost').value),tax:Number(document.getElementById('receive-tax').value),supplier:document.getElementById('receive-supplier').value,reference:document.getElementById('receive-reference').value,notes:document.getElementById('receive-note').value};
  const r=await trackedOperation('receive','/inventory/receive',payload);form.reset();await syncFromServer();await refreshInventoryHistory();closeFloating('receive-stock-dialog');alert(`Entrada #${r.receipt.id} registrada${r.replayed?' (recuperada sin duplicar)':''}.`);
 }catch(error){alert(error.message);}finally{button.disabled=false;}
}
function setCartItemQuantity(index,value){
 if(operationLocked())return alert('Confirma primero la venta pendiente.');
 const item=cart[index],p=state.products.find(p=>p.id===item.id),qty=Number(value);
 if(!p || !Number.isFinite(qty) || qty<=0 || Math.abs(qty*1000-Math.round(qty*1000))>1e-6 || (quantityStep(p)===1 && !Number.isInteger(qty)) || tracksStock(p)&&qty>p.stock){alert('Cantidad inválida o existencias insuficientes.');renderCart();return;}
 item.qty=qty;renderCart();
}
function editCartPrice(index){
 if(operationLocked())return alert('Confirma primero la venta pendiente.');if(!canEditInventory())return alert('Se requiere administrador o gerente');
 const item=cart[index],p=state.products.find(p=>p.id===item.id),raw=prompt('Precio especial por unidad:',String(item.price));if(raw===null)return;
 const price=Number(raw);if(!Number.isFinite(price)||price<0)return alert('Precio inválido');const reason=prompt('Motivo del precio especial:');if(!reason?.trim())return;
 item.price=PosMath.cents(price)/100;item.catalogPrice=p.price;item.priceReason=reason.trim();renderCart();
}
function filteredSales(){
 const start=document.getElementById('sales-report-start')?.value||'',end=document.getElementById('sales-report-end')?.value||'',payment=document.getElementById('sales-report-payment')?.value||'all',employee=document.getElementById('sales-report-employee')?.value||'all';
 return state.sales.filter(s=>(!start||s.createdAt.slice(0,10)>=start)&&(!end||s.createdAt.slice(0,10)<=end)&&(payment==='all'||s.paymentMethod===payment)&&(employee==='all'||s.employeeName===employee));
}
function salesReportQuery(){
 const query=new URLSearchParams();for(const [key,id] of Object.entries({start:'sales-report-start',end:'sales-report-end',payment:'sales-report-payment',employee:'sales-report-employee'})){const value=document.getElementById(id)?.value;if(value && value!=='all')query.set(key,value);}return query;
}
function initEnhancements(){
 initializeFloatingPanels();initCreditUI();
 try{applySidebarPreference(localStorage.getItem('pos_sidebar_collapsed')==='true');}catch(_){applySidebarPreference(false);}
 document.getElementById('sidebar-toggle').addEventListener('click',()=>{const collapsed=!document.getElementById('app-shell').classList.contains('sidebar-collapsed');applySidebarPreference(collapsed);try{localStorage.setItem('pos_sidebar_collapsed',String(collapsed));}catch(_){}});
 document.getElementById('home-period').addEventListener('change',renderHome);
 document.querySelectorAll('[data-home-action]').forEach(button=>button.addEventListener('click',()=>{
  const allowed=availableModules(),action=button.dataset.homeAction;
  if(action==='inventory'){if(allowed.includes('inventory'))setActiveModule('inventory');else openSaleInventory();}
  if(action==='sale'&&allowed.includes('pos'))setActiveModule('pos');
  if(action==='customer'&&allowed.includes('pos'))document.getElementById('billing-new-customer-btn').click();
 }));
 document.getElementById('sale-inventory-btn').addEventListener('click',openSaleInventory);
 document.getElementById('sale-catalog').addEventListener('toggle',()=>document.getElementById('sale-inventory-btn').setAttribute('aria-expanded',String(document.getElementById('sale-catalog').open)));
 document.getElementById('sale-inventory-search').addEventListener('input',renderSaleInventory);
 document.getElementById('product-grid').addEventListener('click',event=>{const button=event.target.closest('[data-stock-add]');if(button&&!button.disabled)addInventoryToSale(Number(button.dataset.stockAdd));});
 document.getElementById('product-grid').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-stock-quantity]')){event.preventDefault();addInventoryToSale(Number(event.target.dataset.stockQuantity));}});

 const bind=(id,event,handler)=>document.getElementById(id)?.addEventListener(event,handler);
 bind('toggle-login-pin','click',()=>{const input=document.getElementById('pin-input'),button=document.getElementById('toggle-login-pin');const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Ocultar':'Mostrar';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Ocultar PIN':'Mostrar PIN');});
 bind('system-product-search','input',renderStockSearch);
 bind('system-product-search','keydown',event=>{if(event.key==='Escape'){event.target.value='';renderStockSearch();}});
 bind('refresh-stock-search','click',async event=>{event.target.disabled=true;try{await syncFromServer();}catch(error){stockSyncError=true;renderStockSearch();}finally{event.target.disabled=false;}});
 bind('billing-customer-search','input',()=>renderCustomerDirectory());
 bind('customer-select','focus',()=>loadCustomers());
 bind('operation-recovery-panel','click',async event=>{const b=event.target.closest('[data-recover]');if(!b || b.disabled)return;b.disabled=true;try{const kind=b.dataset.recover;await trackedOperation(kind,creditOperationPaths[kind]||(kind==='quote'?'/quotes':'/inventory/receive'),null);await syncFromServer();await refreshDocuments();alert('Operación recuperada sin duplicar.');}catch(e){alert(e.message);}finally{refreshPendingOperations();}});

 bind('billing-new-customer-btn','click',()=>customerEditor(true));bind('billing-edit-customer-btn','click',()=>customerEditor(false));
 bind('save-quote-btn','click',saveQuoteFromCart);bind('quotes-module-create-btn','click',saveQuoteFromCart);
 for(const id of ['billing-discount-percent','billing-discount-reason'])bind(id,'input',()=>{if(operationLocked()){if(pendingSale){document.getElementById('billing-discount-percent').value=pendingSale.payload.discountPercent||0;document.getElementById('billing-discount-reason').value=pendingSale.payload.discountReason||'';}return;}renderCart();});
 bind('module-documents','click',documentAction);bind('sale-document-confirmation','click',documentAction);bind('billing-refresh-invoices-btn','click',refreshDocuments);
 for(const id of ['billing-invoices-search','billing-invoices-from','billing-invoices-to','billing-invoices-type','documents-quote-search'])bind(id,'input',renderDocuments);
 bind('billing-invoices-clear-filters','click',()=>{for(const id of ['billing-invoices-search','billing-invoices-from','billing-invoices-to','billing-invoices-type'])document.getElementById(id).value='';renderDocuments();});
 bind('inventory-search','input',renderExtendedInventory);bind('inventory-status-filter','change',renderExtendedInventory);
 bind('product-type','change',updateProductTypeFields);bind('product-unit','change',updateProductTypeFields);
 bind('receive-stock-btn','click',()=>{if(!canEditInventory()||state.companySettings.receiving_enabled===false)return;document.getElementById('receive-stock-form').classList.remove('hidden');document.getElementById('receive-product').dispatchEvent(new Event('change'));openFloating('receive-stock-dialog','receive-product');});
 bind('cancel-receive-stock-btn','click',()=>closeFloating('receive-stock-dialog'));
 bind('receive-stock-form','submit',receiveInventory);
 bind('receive-product','change',()=>{const p=state.products.find(p=>p.id===Number(document.getElementById('receive-product').value));if(p){document.getElementById('receive-unit-cost').value=p.cost;document.getElementById('receive-quantity').step=quantityStep(p);}});
 bind('inventory-count-btn','click',openInventoryCount);
 bind('inventory-pdf-btn','click',()=>downloadReportPdf('inventory'));
 bind('export-inventory-btn','click',()=>downloadFromApi('/inventory/export','inventario.csv').catch(e=>alert(e.message)));
 bind('inventory-category-form','submit',async event=>{event.preventDefault();try{await apiRequest('/inventory/categories',{method:'POST',body:JSON.stringify({name:document.getElementById('inventory-category-name').value})});event.target.reset();await syncFromServer();}catch(e){alert(e.message);}});
 bind('inventory-category-list','click',async event=>{const b=event.target.closest('[data-delete-category]');if(!b)return;try{await apiRequest('/inventory/categories/'+encodeURIComponent(b.dataset.deleteCategory),{method:'DELETE'});await syncFromServer();}catch(e){alert(e.message);}});
 bind('search-input','input',renderSaleEntry);
 bind('sale-entry-quantity','input',renderSaleEntry);
 bind('search-input','keydown',event=>{if(event.key==='Enter'){event.preventDefault();addSaleEntry();}});
 bind('sale-entry-quantity','keydown',event=>{if(event.key==='Enter'){event.preventDefault();addSaleEntry();}});
 bind('sale-entry-add','click',addSaleEntry);
 bind('billing-customer-type','change',()=>{if(document.getElementById('billing-customer-type').value==='credito_fiscal')customerEditor(false);});
 document.querySelectorAll('[data-sale-target]').forEach(button=>button.addEventListener('click',()=>{
  const target=button.dataset.saleTarget;if(!availableModules().includes(target))return;
  if(button.dataset.saleSection==='expense-form')localStorage.setItem('pos_selected_report_view','transactions');
  setActiveModule(target);document.getElementById(button.dataset.saleSection)?.scrollIntoView?.({block:'start',behavior:'smooth'});
 }));
 bind('apply-sales-report-btn','click',renderReports);bind('clear-sales-report-btn','click',()=>{for(const id of ['sales-report-start','sales-report-end'])document.getElementById(id).value='';for(const id of ['sales-report-payment','sales-report-employee'])document.getElementById(id).value='all';renderReports();});
}

function refreshPendingOperations(){
 const panel=document.getElementById('operation-recovery-panel');if(!panel)return;
 const pending=currentEmployee?['quote','receive','creditnote','creditpayment'].filter(kind=>localStorage.getItem(`pos_operation:${operationScope()}:${currentEmployee.id}:${kind}`)):[];
 panel.classList.toggle('hidden',!pending.length);
 panel.innerHTML=pending.length?'<p>Hay operaciones pendientes de confirmar con el servidor. Recupera su resultado antes de registrarlas de nuevo.</p>'+pending.map(kind=>`<button type="button" class="primary-btn small" data-recover="${kind}">Recuperar ${({quote:'cotización',receive:'entrada de inventario',creditnote:'nota de crédito',creditpayment:'abono'})[kind]}</button>`).join(''):'';
}

function renderStockSearch(){
 const container=document.getElementById('system-product-results'),status=document.getElementById('stock-search-status');
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const query=normalize(document.getElementById('system-product-search').value.trim());
 status.textContent=stockSyncError?'Sin conexión: las existencias mostradas pueden haber cambiado.':stockLastUpdated?'Existencias del negocio activo · actualización '+new Date(stockLastUpdated).toLocaleTimeString():'Esperando sincronización.';
 if(!query || !currentEmployee){container.classList.add('hidden');container.replaceChildren();return;}
 const matches=state.products.filter(p=>[p.name,p.code,p.category].some(value=>normalize(value).includes(query)));
 container.classList.remove('hidden');container.classList.add('stock-search-results');
 if(!matches.length){container.textContent='No se encontraron productos.';return;}
 container.innerHTML=`<p>${matches.length} coincidencias${matches.length>50?' · primeras 50; afina la búsqueda':''}</p><table><thead><tr><th>Producto / código</th><th>Precio</th><th>Existencias</th></tr></thead><tbody>${matches.slice(0,50).map(p=>`<tr><td>${escapeHtml(p.name)}<br><small>${escapeHtml(p.code||'Sin código')}</small></td><td>${currency(p.price)}</td><td class="${tracksStock(p)&&p.stock<=0?'out-of-stock':''}">${tracksStock(p)?escapeHtml(p.stock)+' '+escapeHtml(p.unit||'unidad')+(p.stock<=0?' · Agotado':''):'Servicio · sin control de existencias'}</td></tr>`).join('')}</tbody></table>`;
}

function saleEntryProduct(){
 const query=document.getElementById('search-input').value.trim().toLocaleLowerCase();if(!query)return null;
 const exact=state.products.filter(p=>[p.code,p.name,`${p.name} · #${p.id}`].some(v=>v && String(v).toLocaleLowerCase()===query));
 if(exact.length===1)return exact[0];
 const matches=state.products.filter(p=>[p.code,p.name].some(v=>String(v||'').toLocaleLowerCase().includes(query)));
 return matches.length===1?matches[0]:null;
}
function renderSaleEntry(){
 const p=saleEntryProduct(),status=document.getElementById('sale-entry-status');
 document.getElementById('sale-entry-unit').value=p?p.unit||'unidad':'—';
 document.getElementById('sale-entry-stock').value=p?(tracksStock(p)?p.stock:'Sin control'):'—';
 document.getElementById('sale-entry-price').value=p?currency(p.price):'—';
 document.getElementById('sale-entry-quantity').step=p?quantityStep(p):1;
 document.getElementById('sale-entry-add').disabled=!p || !!operationLocked() || tracksStock(p)&&p.stock<=0;
 status.textContent=p?`${p.name} · ${tracksStock(p)?'Existencias: '+p.stock+' '+(p.unit||'unidad'):'Servicio sin control de existencias'}${tracksStock(p)&&p.stock<=0?' · Agotado':''}`:'Escribe el código exacto o selecciona un producto de las sugerencias.';
}
function addSaleEntry(){
 if(operationLocked())return alert('Confirma primero la venta pendiente.');
 const p=saleEntryProduct(),qty=Number(document.getElementById('sale-entry-quantity').value);
 if(!p)return alert('Selecciona un producto o escribe su código exacto.');
 const existing=cart.find(i=>i.id===p.id),total=roundQuantity((existing?.qty||0)+qty);
 if(!Number.isFinite(qty)||qty<=0||Math.abs(qty*1000-Math.round(qty*1000))>1e-6||(quantityStep(p)===1&&!Number.isInteger(qty)))return alert('Cantidad inválida para la unidad del producto.');
 if(tracksStock(p)&&total>p.stock)return alert('Existencias insuficientes para esa cantidad.');
 if(existing)existing.qty=total;else cart.push({...p,qty,catalogPrice:p.price});
 document.getElementById('search-input').value='';document.getElementById('sale-entry-quantity').value='1';renderProducts();renderCart();document.getElementById('search-input').focus();
}
function renderSaleWorkspace(){
 if(!document.getElementById('sale-business-label'))return;
 document.getElementById('sale-business-label').textContent=state.companySettings.company_name||'Negocio activo';
 document.getElementById('sale-date-label').textContent=new Date().toLocaleDateString(state.companySettings.number_locale||'es-SV');
 const allowed=availableModules();document.querySelectorAll('[data-sale-target]').forEach(b=>b.classList.toggle('hidden',!allowed.includes(b.dataset.saleTarget)||(b.id==='sale-quotes-shortcut'&&state.companySettings.quotes_enabled===false)));
 document.getElementById('sale-product-options').replaceChildren(...state.products.map(p=>new Option(`${p.name} · ${tracksStock(p)?p.stock+' '+(p.unit||'unidad'):'Servicio'}`,p.code||`${p.name} · #${p.id}`)));
 for(const cell of document.querySelectorAll('[data-cart-stock]')){const p=state.products.find(p=>p.id===Number(cell.dataset.cartStock));cell.textContent=p?(tracksStock(p)?p.stock:'Sin control'):'No disponible';}
 renderSaleEntry();
}

// Home and sale-only stock selection share the authenticated business snapshot.
function navigationIcon(id){
 const paths={home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',cash:'M3 5h18v14H3zM3 10h18M7 15h3',documents:'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',settings:'M4 7h16M4 17h16M8 4v6M16 14v6'};
 return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[id]||paths.home}"/></svg>`;
}
function applySidebarPreference(collapsed){
 document.getElementById('app-shell').classList.toggle('sidebar-collapsed',collapsed);
 const button=document.getElementById('sidebar-toggle'),label=collapsed?'Expandir menú':'Minimizar menú';
 button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',label);button.title=label;button.querySelector('.sidebar-toggle-label').textContent=label;
}
function openSaleInventory(){
 if(!availableModules().includes('pos'))return;
 setActiveModule('pos');renderSaleInventory();openFloating('sale-catalog','sale-inventory-search');
}
function normalizeStockQuery(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function renderSaleInventory(){
 const body=document.getElementById('product-grid');if(!body)return;
 const query=normalizeStockQuery(document.getElementById('sale-inventory-search').value),category=document.getElementById('category-filter').value;
 const products=state.products.filter(p=>(category==='all'||!category||p.category===category)&&[p.name,p.code,p.category].some(v=>normalizeStockQuery(v).includes(query)));
 const drafts=new Map(Array.from(body.querySelectorAll('[data-stock-quantity]'),el=>[el.dataset.stockQuantity,el.value]));
 const focused=body.contains(document.activeElement)?document.activeElement.id:null;
 body.innerHTML=products.map(p=>{
  const inCart=cart.find(i=>i.id===p.id)?.qty||0,remaining=tracksStock(p)?roundQuantity(p.stock-inCart):Infinity;
  const initial=quantityStep(p)===1?1:Math.min(.1,Math.max(.001,remaining));
  const disabled=operationLocked()||remaining<=0||!availableModules().includes('pos');
  return `<tr><td>${escapeHtml(p.code||'—')}</td><td><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.category||'Sin categoría')}</small></td><td>${currency(p.price)}</td><td>${tracksStock(p)?escapeHtml(p.stock)+' '+escapeHtml(p.unit||'unidad'):'Sin control'}</td><td>${inCart} ${escapeHtml(p.unit||'unidad')}</td><td><input id="stock-qty-${p.id}" data-stock-quantity="${p.id}" aria-label="Cantidad a agregar de ${escapeHtml(p.name)}" type="number" min="${quantityStep(p)}" step="${quantityStep(p)}" value="${escapeHtml(drafts.get(String(p.id))??initial)}" ${disabled?'disabled':''} /></td><td><button id="stock-add-${p.id}" type="button" class="primary-btn small" data-stock-add="${p.id}" ${disabled?'disabled':''}>${remaining<=0?'Sin disponible':'Agregar a cuenta'}</button></td></tr>`;
 }).join('')||'<tr><td colspan="7">No hay productos con esta búsqueda.</td></tr>';
 if(focused)document.getElementById(focused)?.focus();
}
function addInventoryToSale(id){
 if(activeModule!=='pos'||!availableModules().includes('pos')||operationLocked())return;
 const p=state.products.find(p=>p.id===id);if(!p)return;
 const qty=Number(document.getElementById('stock-qty-'+id)?.value),existing=cart.find(i=>i.id===id),total=roundQuantity((existing?.qty||0)+qty);
 if(!Number.isFinite(qty)||qty<=0||Math.abs(qty*1000-Math.round(qty*1000))>1e-6||(quantityStep(p)===1&&!Number.isInteger(qty)))return alert('Cantidad inválida para la unidad del producto.');
 if(tracksStock(p)&&total>p.stock)return alert('Existencias insuficientes para esa cantidad.');
 if(existing)existing.qty=total;else cart.push({...p,qty,catalogPrice:p.price});
 renderCart();document.getElementById('sale-inventory-status').textContent=`Agregado: ${qty} ${p.unit||'unidad'} de ${p.name}. La cuenta contiene ${cart.length} productos.`;
}
function homeDayKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function homeSummary(sales,days,now=new Date()){
 const daily=new Map(),today=homeDayKey(now),top=new Map();
 for(let offset=days-1;offset>=0;offset--){const date=new Date(now);date.setHours(12,0,0,0);date.setDate(date.getDate()-offset);const key=homeDayKey(date);daily.set(key,{key,date,totalCents:0,count:0});}
 let count=0,totalCents=0;
 for(const sale of sales){const date=new Date(sale.createdAt);if(!Number.isFinite(date.getTime())||date>now)continue;const bucket=daily.get(homeDayKey(date));if(!bucket)continue;
  const cents=PosMath.cents(sale.total);bucket.totalCents+=cents;bucket.count++;totalCents+=cents;count++;
  for(const item of sale.items||[]){const unit=item.unit||'unidad',key=JSON.stringify([item.id,unit]);const row=top.get(key)||{name:item.name,unit,qty:0};row.qty+=PosMath.quantity(item.qty);top.set(key,row);}
 }
 return {daily:[...daily.values()],totalCents,count,todayCents:daily.get(today)?.totalCents||0,top:[...top.values()].sort((a,b)=>b.qty-a.qty||a.name.localeCompare(b.name)).slice(0,5)};
}
function renderHome(){
 if(!document.getElementById('module-home'))return;
 const allowed=availableModules(),financial=['admin','gerente','cajero','contador'].includes(currentEmployee?.role);
 document.getElementById('home-business-name').textContent=state.companySettings.company_name||'Negocio activo';
 document.getElementById('home-financial').classList.toggle('hidden',!financial);document.getElementById('home-restricted').classList.toggle('hidden',financial);
 const visible={sale:allowed.includes('pos'),customer:allowed.includes('pos'),inventory:allowed.includes('inventory')||allowed.includes('pos')};
 document.querySelectorAll('[data-home-action]').forEach(b=>b.classList.toggle('hidden',!visible[b.dataset.homeAction]));
 document.getElementById('home-no-shortcuts').classList.toggle('hidden',Object.values(visible).some(Boolean));
 document.getElementById('home-period').disabled=!financial;
 if(!financial){for(const id of ['home-daily-chart','home-daily-table','home-top-products','home-today-total','home-period-total','home-sale-count','home-average','home-period-note'])document.getElementById(id).replaceChildren();return;}
 const days=document.getElementById('home-period').value==='30'?30:7,summary=homeSummary(state.sales,days),locale=state.companySettings.number_locale||'es-SV';
 const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'local';
 document.getElementById('home-period-note').textContent=`Últimos ${days} días, incluido hoy · Hora del dispositivo (${timezone}). ${stockSyncError?'Sin conexión: los datos pueden estar desactualizados.':'Se actualiza con la sincronización.'}`;
 for(const [id,value] of Object.entries({'home-today-total':currency(summary.todayCents/100),'home-period-total':currency(summary.totalCents/100),'home-sale-count':summary.count,'home-average':currency(summary.count?Math.round(summary.totalCents/summary.count)/100:0)}))document.getElementById(id).textContent=value;
 const chart=document.getElementById('home-daily-chart'),windowKey=getBusinessId()+':'+days+':'+homeDayKey(new Date()),oldScroll=chart.scrollLeft;
 const max=Math.max(1,...summary.daily.map(d=>d.totalCents));
 document.getElementById('home-daily-chart').innerHTML=summary.daily.map(d=>`<div class="home-day" role="listitem" aria-label="${d.key}: ${currency(d.totalCents/100)}, ${d.count} ventas"><span class="home-day-value">${currency(d.totalCents/100)}</span><div class="home-bar-track" aria-hidden="true"><span style="height:${Math.max(0,d.totalCents)/max*100}%"></span></div><span>${escapeHtml(d.date.toLocaleDateString(locale,{day:'2-digit',month:'2-digit'}))}</span></div>`).join('');
 if(chart.clientWidth){chart.scrollLeft=chart.dataset.window===windowKey?oldScroll:chart.scrollWidth;chart.dataset.window=windowKey;}
 document.getElementById('home-daily-table').innerHTML=summary.daily.map(d=>`<tr><td>${d.key}</td><td>${d.count}</td><td>${currency(d.totalCents/100)}</td></tr>`).join('');
 const topMax=summary.top[0]?.qty||1;
 document.getElementById('home-top-products').innerHTML=summary.top.map(p=>`<li><div><strong>${escapeHtml(p.name)}</strong><span>${p.qty/1000} ${escapeHtml(p.unit)}</span></div><div class="home-product-track" aria-hidden="true"><span style="width:${p.qty/topMax*100}%"></span></div></li>`).join('')||'<li class="empty-state">Todavía no hay ventas en este período.</li>';
}
