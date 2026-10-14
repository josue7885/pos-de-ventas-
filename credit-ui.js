let creditAccounts=[],creditAccountsSequence=0,activeCreditOperation=null,lastCreditDocument=null,sharedDocument=null,shareFile=null,shareSequence=0;
const creditOperationPaths={creditnote:'/credit-notes',creditpayment:'/credit-payments'};
function resetCreditUI(){creditAccounts=[];activeCreditOperation=null;lastCreditDocument=null;sharedDocument=null;shareFile=null;++shareSequence;++creditAccountsSequence;document.getElementById('credit-operation-result')?.replaceChildren();document.getElementById('credit-accounts-body')?.replaceChildren();}
function creditDocumentLabel(d){return {credit_note:'Nota de crédito interna',credit_payment:'Recibo de abono'}[d.kind]||(d.document_type==='credito_fiscal'?'Crédito fiscal interno':d.payment_method==='credito'?'Venta al crédito':'Consumidor final interno');}
function updateCreditCheckout(){
 const credit=document.getElementById('billing-payment-method').value==='credito';document.getElementById('sale-credit-fields').classList.toggle('hidden',!credit);document.getElementById('billing-cash-received').disabled=credit;
 if(credit)document.getElementById('billing-cash-received').value='0';
 document.getElementById('sale-credit-due').min=new Date().toISOString().slice(0,10);
}
async function refreshCreditAccounts(){
 if(!currentEmployee||!['admin','gerente','cajero','contador'].includes(currentEmployee.role))return;
 const seq=++creditAccountsSequence;
 try{const data=await apiRequest('/credit-accounts');if(seq!==creditAccountsSequence)return;creditAccounts=data.accounts;renderCreditAccounts();}
 catch(error){if(seq===creditAccountsSequence)document.getElementById('credit-accounts-status').textContent=error.message;}
}
function renderCreditAccounts(){
 const q=document.getElementById('credit-search').value.toLowerCase(),accounts=creditAccounts.filter(a=>[a.number,a.customer_name].some(x=>x.toLowerCase().includes(q))),today=new Date().toISOString().slice(0,10);
 document.getElementById('credit-accounts-status').textContent=`${accounts.length} cuentas · Saldo pendiente ${currency(accounts.reduce((s,a)=>s+a.balance,0))}`;
 document.getElementById('credit-accounts-body').innerHTML=accounts.map(a=>`<tr><td>${escapeHtml(a.number)}</td><td>${escapeHtml(a.customer_name)}</td><td>${escapeHtml(a.due_date)}</td><td>${currency(a.original)}</td><td>${currency(a.credited)}</td><td>${currency(a.paid-a.refunded)}</td><td>${currency(a.balance)}</td><td>${a.balance===0?'Saldada':a.due_date<today?'Vencida':'Pendiente'}</td><td>${a.balance>0&&['admin','gerente','cajero'].includes(currentEmployee?.role)?`<button type="button" class="primary-btn small" data-credit-pay="${a.sale_id}">Registrar abono</button>`:''}</td></tr>`).join('')||'<tr><td colspan="9">No hay cuentas con esa búsqueda.</td></tr>';
}
async function openCreditOperation(d,kind){
 if(kind==='creditnote'&&!canEditInventory()||kind==='creditpayment'&&!['admin','gerente','cajero'].includes(currentEmployee?.role))return;
 const saved=localStorage.getItem(`pos_operation:${operationScope()}:${currentEmployee.id}:${kind}`);let pending;try{pending=saved?JSON.parse(saved):null;}catch{return alert('La operación pendiente está dañada. Conserva los datos y solicita revisión.');}
 if(pending)d={id:pending.payload.saleId};
 const {document:latest}=await apiRequest('/credit-sales/'+d.id);
 activeCreditOperation={kind,sale:latest};lastCreditDocument=null;
 const form=document.getElementById('credit-operation-form');form.reset();form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=false);form.classList.remove('hidden');document.getElementById('credit-operation-result').replaceChildren();document.getElementById('credit-operation-status').textContent='';
 document.getElementById('credit-operation-title').textContent=kind==='creditnote'?'Emitir nota de crédito':'Registrar abono';
 document.getElementById('credit-operation-sale').textContent=`${latest.number} · ${latest.customer_name}`;
 const max=kind==='creditnote'?latest.credit_state.available:latest.credit_state.balance;
 document.getElementById('credit-operation-amount').max=max;document.getElementById('credit-operation-amount').value=max.toFixed(2);
 document.getElementById('credit-operation-amount-label').textContent=kind==='creditnote'?'Importe a acreditar con IVA incluido':'Importe recibido del abono';
 document.getElementById('credit-operation-reason').required=kind==='creditnote';document.getElementById('credit-operation-reason').minLength=kind==='creditnote'?3:0;
 document.getElementById('credit-operation-help').textContent=kind==='creditnote'?'Ajuste monetario vinculado a esta venta. No modifica existencias. Reduce la deuda; cualquier excedente se registra como devolución por el medio elegido. Revisa el importe antes de confirmar.':'El abono reduce el saldo pendiente. No genera otra venta. Requiere caja abierta.';
 const enabled=(state.companySettings.payment_methods||[]).filter(m=>m!=='credito');document.getElementById('credit-operation-method').replaceChildren(...enabled.map(m=>new Option({efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia'}[m],m)));
 if(pending){document.getElementById('credit-operation-amount').value=pending.payload.amount;document.getElementById('credit-operation-reason').value=pending.payload.reason||pending.payload.reference||'';document.getElementById('credit-operation-method').value=pending.payload.refundMethod||pending.payload.paymentMethod;form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);document.getElementById('credit-operation-status').textContent='Hay una operación pendiente para esta venta. Confirma para recuperar su resultado sin duplicarla.';}
 updateCreditOperationPreview();openFloating('credit-operation-dialog','credit-operation-amount');
}
function updateCreditOperationPreview(){
 if(!activeCreditOperation)return;const {kind,sale}=activeCreditOperation,amount=Number(document.getElementById('credit-operation-amount').value)||0,balance=sale.credit_state.balance;
 document.getElementById('credit-operation-preview').textContent=kind==='creditnote'?`Reduce deuda: ${currency(Math.min(balance,amount))} · Devolución: ${currency(Math.max(0,amount-balance))}`:`Saldo después del abono: ${currency(Math.max(0,balance-amount))}`;
}
async function saveCreditOperation(event){
 event.preventDefault();if(!activeCreditOperation)return;const form=event.currentTarget,button=form.querySelector('[type=submit]');if(button.disabled||!form.reportValidity())return;button.disabled=true;
 const {kind,sale}=activeCreditOperation,reason=document.getElementById('credit-operation-reason').value,method=document.getElementById('credit-operation-method').value;
 const payload={saleId:sale.id,amount:Number(document.getElementById('credit-operation-amount').value),...(kind==='creditnote'?{reason,refundMethod:method}:{reference:reason,paymentMethod:method})};
 try{const result=await trackedOperation(kind,creditOperationPaths[kind],payload);await showCreditResult(result);}
 catch(error){document.getElementById('credit-operation-status').textContent=error.message;if(currentEmployee&&localStorage.getItem(`pos_operation:${operationScope()}:${currentEmployee.id}:${kind}`))form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);}finally{button.disabled=false;}
}
async function showCreditResult(result){
 lastCreditDocument=result.document;document.getElementById('credit-operation-form').classList.add('hidden');document.getElementById('credit-operation-status').textContent=`${result.document.number} ${result.replayed?'recuperado sin duplicar':'registrado'}. Elige PDF, correo o WhatsApp.`;document.getElementById('credit-operation-result').innerHTML=documentButtons(result.document);
 await syncFromServer();await refreshDocuments();
}
async function prepareDocumentShare(d){
 sharedDocument=d;shareFile=null;const seq=++shareSequence;
 document.getElementById('document-share-phone').value=d.customer_phone||'';document.getElementById('document-share-status').textContent='Preparando PDF…';for(const id of ['file','download','chat'])document.getElementById('document-share-'+id).disabled=true;
 openFloating('document-share-dialog','document-share-phone');
 try{const res=await posFetch(getApiUrl(`/documents/${d.kind}/${d.id}/pdf`));if(!res.ok)throw Error('No se pudo generar el PDF');const blob=await res.blob();if(seq!==shareSequence||!currentEmployee)return;shareFile=new File([blob],documentFileBase(d)+'.pdf',{type:'application/pdf'});document.getElementById('document-share-status').textContent=`PDF listo: ${d.number}. Revisa destinatario y confirma el envío en WhatsApp.`;document.getElementById('document-share-download').disabled=false;document.getElementById('document-share-chat').disabled=false;document.getElementById('document-share-file').disabled=!(window.POSNative?.active||(navigator.share&&navigator.canShare?.({files:[shareFile]})));}
 catch(error){if(seq===shareSequence)document.getElementById('document-share-status').textContent=error.message;}
}
function initCreditUI(){
 document.getElementById('sales-report-payment').add(new Option('Venta al crédito','credito'));
 document.getElementById('billing-payment-method').addEventListener('change',updateCreditCheckout);
 document.getElementById('credit-refresh').addEventListener('click',refreshCreditAccounts);document.getElementById('credit-search').addEventListener('input',renderCreditAccounts);
 document.getElementById('credit-accounts-body').addEventListener('click',async event=>{const b=event.target.closest('[data-credit-pay]');if(!b)return;try{await openCreditOperation({id:Number(b.dataset.creditPay)},'creditpayment');}catch(e){alert(e.message);}});
 for(const [value,label] of [['credit_note','Nota de crédito'],['credit_payment','Recibo de abono']])document.getElementById('billing-invoices-type').add(new Option(label,value));
 document.getElementById('credit-operation-form').addEventListener('submit',saveCreditOperation);document.getElementById('credit-operation-amount').addEventListener('input',updateCreditOperationPreview);document.getElementById('credit-operation-result').addEventListener('click',documentAction);
 document.getElementById('document-share-file').addEventListener('click',async()=>{if(!shareFile)return;try{if(window.POSNative?.active)await window.POSNative.shareFile(shareFile,shareFile.name);else await navigator.share({files:[shareFile],title:sharedDocument.number});}catch(e){if(e.name!=='AbortError')document.getElementById('document-share-status').textContent='No se pudo compartir. Descarga el PDF y adjúntalo al chat.';}});
 document.getElementById('document-share-download').addEventListener('click',async()=>{if(!shareFile)return;if(window.POSNative?.active){try{await window.POSNative.shareFile(shareFile,shareFile.name);}catch(e){document.getElementById('document-share-status').textContent=e.message;}return;}const url=URL.createObjectURL(shareFile),a=document.createElement('a');a.href=url;a.download=shareFile.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
 document.getElementById('document-share-chat').addEventListener('click',()=>{if(!sharedDocument||!shareFile)return;const phone=document.getElementById('document-share-phone').value.replace(/[\s()+-]/g,'');if(!/^[1-9]\d{6,14}$/.test(phone))return alert('Escribe el teléfono con código de país, por ejemplo 503 seguido de los 8 dígitos.');const text=`${creditDocumentLabel(sharedDocument)} ${sharedDocument.number}. Importe: ${currency(sharedDocument.total)}. Adjunto el PDF del documento.`;const url=`https://wa.me/${phone}?text=${encodeURIComponent(text)}`;if(window.POSNative?.active)window.POSNative.openWhatsApp(url).catch(e=>alert(e.message));else window.open(url,'_blank','noopener,noreferrer');document.getElementById('document-share-status').textContent='Adjunta el PDF descargado en el chat y confirma el envío. El enlace no adjunta archivos automáticamente.';});
}
