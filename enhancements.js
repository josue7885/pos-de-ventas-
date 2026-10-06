// Features adapted from the supplied UI. Every business write is confirmed by the API.
let customerDirectory=[],documentDirectory=[],selectedQuoteId=null,documentsSequence=0;
const fractionalUnits=new Set(['kg','g','litro','ml','metro','hora']);
function tracksStock(p){return p.type!=='servicio';}
function quantityStep(p){return fractionalUnits.has(p.unit)?0.001:1;}
function roundQuantity(n){return Math.round(n*1000)/1000;}
function canEditInventory(){return Boolean(currentEmployee && ['admin','gerente'].includes(currentEmployee.role));}
function operationLocked(){return saleInFlight || pendingSale;}
function resetEnhancements(){customerDirectory=[];documentDirectory=[];selectedQuoteId=null;++documentsSequence;resetSaleAdjustments();document.getElementById('operation-recovery-panel')?.classList.add('hidden');document.querySelectorAll('[id^=billing-customer-]').forEach(el=>{if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')el.value='';});}
function resetSaleAdjustments(){
 for(const id of ['billing-discount-percent','billing-discount-reason']){const el=document.getElementById(id);if(el)el.value=id.endsWith('percent')?'0':'';}
 selectedQuoteId=null;const label=document.getElementById('selected-quote-label');if(label)label.textContent='';
}
function renderCustomerDirectory(selected=document.getElementById('customer-select')?.value||''){
 const select=document.getElementById('customer-select');if(!select)return;
 const search=(document.getElementById('billing-customer-search')?.value||'').toLowerCase();
 const matches=customerDirectory.filter(c=>String(c.id)===selected || [c.full_name,c.nit,c.dui,c.email,c.phone].some(v=>String(v||'').toLowerCase().includes(search)));
 select.replaceChildren(new Option('Cliente general / consumidor final',''),...matches.map(c=>new Option(`${c.full_name} · ${c.nit||c.phone||'Sin documento'}`,String(c.id))));select.value=selected;
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
 try{const data=await apiRequest('/documents');if(seq!==documentsSequence || currentEmployee?.id!==user)return;documentDirectory=data.documents;renderDocuments();status.textContent='Comprobantes internos registrados en el servidor. Sin autorización fiscal.';}
 catch(error){if(seq===documentsSequence)status.textContent=error.message;}
}
function documentButtons(d){
 const identity=`data-kind="${d.kind}" data-id="${d.id}"`;
 return `<button class="ghost-btn small" data-document-action="ticket" ${identity}>Ticket</button><button class="ghost-btn small" data-document-action="pdf" ${identity}>PDF</button><button class="ghost-btn small" data-document-action="json" ${identity}>JSON</button>`+(d.kind==='quote'?(['admin','gerente','cajero'].includes(currentEmployee?.role) && !d.converted_sale_id && new Date(d.valid_until)>new Date()?`<button class="primary-btn small" data-document-action="load" ${identity}>Usar en venta</button>`:''):`<button class="ghost-btn small" data-document-action="email" ${identity}>Enviar correo</button>`);
}
function renderDocuments(){
 const search=(document.getElementById('billing-invoices-search').value||'').toLowerCase(),start=document.getElementById('billing-invoices-from').value,end=document.getElementById('billing-invoices-to').value,type=document.getElementById('billing-invoices-type').value;
 const sales=documentDirectory.filter(d=>d.kind==='sale' && (!type || d.document_type===type) && (!start || d.created_at.slice(0,10)>=start) && (!end || d.created_at.slice(0,10)<=end) && [d.number,d.customer_name,d.customer_nit].some(v=>String(v||'').toLowerCase().includes(search)));
 document.getElementById('billing-invoices-summary').textContent=`${sales.length} comprobantes · Total ${currency(sales.reduce((sum,s)=>sum+s.total,0))} · Fechas UTC`;
 document.getElementById('billing-invoices-body').innerHTML=sales.map(d=>`<tr><td>${escapeHtml(d.number)}</td><td>${d.document_type==='credito_fiscal'?'Crédito fiscal interno':'Consumidor final interno'}</td><td>${escapeHtml(new Date(d.created_at).toLocaleString())}</td><td>${escapeHtml(d.customer_name)}</td><td>Registrado · no fiscal</td><td>${currency(d.total)}</td><td class="sale-document-actions">${documentButtons(d)}</td></tr>`).join('')||'<tr><td colspan="7">No hay documentos con esos filtros.</td></tr>';
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
 const d=documentDirectory.find(x=>x.kind===button.dataset.kind && x.id===Number(button.dataset.id));if(!d)return;
 button.disabled=true;
 try{
  const action=button.dataset.documentAction;
  if(action==='pdf'||action==='json')await downloadFromApi(`/documents/${d.kind}/${d.id}/${action}`,`${d.kind}-${d.id}.${action}`);
  if(action==='ticket')printWindow(`<h2>${d.kind==='quote'?'Cotización':'Comprobante interno'} ${escapeHtml(d.number)}</h2><p>${escapeHtml(d.customer_name)}</p><table>${d.items.map(i=>`<tr><td>${escapeHtml(i.name)}</td><td>${i.qty} ${escapeHtml(i.unit||'unidad')}</td><td>${currency(i.price)}</td></tr>`).join('')}</table><p>Descuento: ${currency(d.discount)}</p><p>Total: ${currency(d.total)}</p><p>Sin autorización fiscal.</p>`,'Documento POS');
  if(action==='email'){
   const email=prompt('Correo del destinatario:',d.customer_email||'');if(!email)return;
   await apiRequest(`/invoices/${d.id}/email`,{method:'POST',body:JSON.stringify({customerEmail:email})});alert('Correo enviado.');
  }
  if(action==='load')await loadQuoteToCart(d);
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
 renderCart();setActiveModule('pos');
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
  const data=await apiRequest('/inventory/history');if(currentEmployee?.id!==user)return;
  document.getElementById('inventory-movements-body').innerHTML=data.movements.map(m=>`<tr><td>${escapeHtml(new Date(m.created_at).toLocaleString())}</td><td>${escapeHtml(m.product_name||'#'+m.product_id)}</td><td>${m.delta>=0?'Entrada':'Salida'}</td><td>${m.delta}</td><td>${escapeHtml(m.employee_name||'#'+m.user_id)}</td><td>${escapeHtml(m.reason)}</td></tr>`).join('');
  document.getElementById('inventory-purchases-body').innerHTML=data.receipts.map(r=>`<tr><td>${escapeHtml(new Date(r.created_at).toLocaleString())}</td><td>${escapeHtml(r.product_name)}</td><td>${escapeHtml(r.supplier)}</td><td>${r.qty}</td><td>${currency(r.cost)}</td><td>${currency(r.qty*r.cost)}</td><td>${escapeHtml(r.reference)}</td></tr>`).join('');
  document.getElementById('inventory-checks-body').innerHTML=data.checks.map(c=>`<tr><td>${escapeHtml(c.fecha)}</td><td>${escapeHtml(c.product_name)}</td><td>${c.expected_qty}</td><td>${c.counted_qty}</td><td>${c.difference}</td><td>Registro de conteo</td><td>${escapeHtml(c.notes)}</td></tr>`).join('');
 }catch(error){document.getElementById('inventory-movements-body').textContent=error.message;}
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
  const r=await trackedOperation('receive','/inventory/receive',payload);form.reset();await syncFromServer();await refreshInventoryHistory();alert(`Entrada #${r.receipt.id} registrada${r.replayed?' (recuperada sin duplicar)':''}.`);
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
 const bind=(id,event,handler)=>document.getElementById(id)?.addEventListener(event,handler);
 bind('toggle-login-pin','click',()=>{const input=document.getElementById('pin-input'),button=document.getElementById('toggle-login-pin');const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Ocultar':'Mostrar';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Ocultar PIN':'Mostrar PIN');});
 bind('billing-customer-search','input',()=>renderCustomerDirectory());
 bind('customer-select','focus',()=>loadCustomers());
 bind('operation-recovery-panel','click',async event=>{const b=event.target.closest('[data-recover]');if(!b || b.disabled)return;b.disabled=true;try{const kind=b.dataset.recover;await trackedOperation(kind,kind==='quote'?'/quotes':'/inventory/receive',null);await syncFromServer();await refreshDocuments();alert('Operación recuperada sin duplicar.');}catch(e){alert(e.message);}finally{refreshPendingOperations();}});
 function customerEditor(isNew){if(isNew){document.getElementById('customer-select').value='';document.getElementById('customer-select').dispatchEvent(new Event('change'));}const modal=document.getElementById('billing-modal');modal.classList.add('customer-only');document.getElementById('billing-modal-title').textContent=isNew?'Agregar cliente':'Editar cliente';modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.getElementById('billing-customer-name').focus();}
 bind('billing-new-customer-btn','click',()=>customerEditor(true));bind('billing-edit-customer-btn','click',()=>customerEditor(false));
 bind('save-quote-btn','click',saveQuoteFromCart);bind('quotes-module-create-btn','click',saveQuoteFromCart);
 for(const id of ['billing-discount-percent','billing-discount-reason'])bind(id,'input',()=>{if(operationLocked()){if(pendingSale){document.getElementById('billing-discount-percent').value=pendingSale.payload.discountPercent||0;document.getElementById('billing-discount-reason').value=pendingSale.payload.discountReason||'';}return;}renderCart();});
 bind('module-documents','click',documentAction);bind('billing-refresh-invoices-btn','click',refreshDocuments);
 for(const id of ['billing-invoices-search','billing-invoices-from','billing-invoices-to','billing-invoices-type','documents-quote-search'])bind(id,'input',renderDocuments);
 bind('billing-invoices-clear-filters','click',()=>{for(const id of ['billing-invoices-search','billing-invoices-from','billing-invoices-to','billing-invoices-type'])document.getElementById(id).value='';renderDocuments();});
 bind('inventory-search','input',renderExtendedInventory);bind('inventory-status-filter','change',renderExtendedInventory);
 bind('product-type','change',updateProductTypeFields);bind('product-unit','change',updateProductTypeFields);
 bind('receive-stock-btn','click',()=>{document.getElementById('receive-stock-form').classList.toggle('hidden');document.getElementById('receive-product').dispatchEvent(new Event('change'));});
 bind('cancel-receive-stock-btn','click',()=>document.getElementById('receive-stock-form').classList.add('hidden'));
 bind('receive-stock-form','submit',receiveInventory);
 bind('receive-product','change',()=>{const p=state.products.find(p=>p.id===Number(document.getElementById('receive-product').value));if(p){document.getElementById('receive-unit-cost').value=p.cost;document.getElementById('receive-quantity').step=quantityStep(p);}});
 bind('inventory-count-btn','click',()=>{localStorage.setItem('pos_selected_report_view','transactions');setActiveModule('reports');document.getElementById('inventory-check-form')?.scrollIntoView?.();});
 bind('inventory-pdf-btn','click',()=>downloadReportPdf('inventory'));
 bind('export-inventory-btn','click',()=>downloadFromApi('/inventory/export','inventario.csv').catch(e=>alert(e.message)));
 bind('inventory-category-form','submit',async event=>{event.preventDefault();try{await apiRequest('/inventory/categories',{method:'POST',body:JSON.stringify({name:document.getElementById('inventory-category-name').value})});event.target.reset();await syncFromServer();}catch(e){alert(e.message);}});
 bind('inventory-category-list','click',async event=>{const b=event.target.closest('[data-delete-category]');if(!b)return;try{await apiRequest('/inventory/categories/'+encodeURIComponent(b.dataset.deleteCategory),{method:'DELETE'});await syncFromServer();}catch(e){alert(e.message);}});
 bind('search-input','keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();const search=event.target.value.trim().toLowerCase(),p=state.products.find(p=>p.code && p.code.toLowerCase()===search);if(p){addToCart(p.id);event.target.value='';renderProducts();}});
 bind('apply-sales-report-btn','click',renderReports);bind('clear-sales-report-btn','click',()=>{for(const id of ['sales-report-start','sales-report-end'])document.getElementById(id).value='';for(const id of ['sales-report-payment','sales-report-employee'])document.getElementById(id).value='all';renderReports();});
}

function refreshPendingOperations(){
 const panel=document.getElementById('operation-recovery-panel');if(!panel)return;
 const pending=currentEmployee?['quote','receive'].filter(kind=>localStorage.getItem(`pos_operation:${operationScope()}:${currentEmployee.id}:${kind}`)):[];
 panel.classList.toggle('hidden',!pending.length);
 panel.innerHTML=pending.length?'<p>Hay operaciones pendientes de confirmar con el servidor. Recupera su resultado antes de registrarlas de nuevo.</p>'+pending.map(kind=>`<button type="button" class="primary-btn small" data-recover="${kind}">Recuperar ${kind==='quote'?'cotización':'entrada de inventario'}</button>`).join(''):'';
}
