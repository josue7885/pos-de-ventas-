let relayBusy=false,relaySequence=0;
function clearRelaySecrets(){for(const id of ['relay-token','relay-created-key']){const el=document.getElementById(id);if(el){el.value='';el.type='password';}}}
async function loadDocumentRelay(fill=false){
 if(!currentEmployee||!['admin','gerente','cajero','contador'].includes(currentEmployee.role))return null;
 const seq=++relaySequence,user=currentEmployee.id,status=document.getElementById('relay-status');
 try{const data=await apiRequest('/document-relay/status');if(seq!==relaySequence||currentEmployee?.id!==user)return null;
  if(fill){document.getElementById('relay-url').value=data.configuration.url;document.getElementById('relay-business').value=data.configuration.business;document.getElementById('relay-auto').checked=data.configuration.autoSend;document.getElementById('relay-token').value='';}
  const labels={pending:'Pendiente',blocked:'Requiere revisión',sending:'Enviando / pendiente de confirmar',sent:'Recibido por servidor',not_requested:'Correo no solicitado',accepted:'Correo aceptado por SMTP',uncertain:'Correo sin confirmar'};
  document.getElementById('relay-outbox').innerHTML=data.outbox.map(r=>`<tr><td>${escapeHtml(r.number)}</td><td>${escapeHtml(labels[r.status]||r.status)}</td><td>${escapeHtml(r.message)}${r.status==='blocked'?` <button type="button" class="ghost-btn small" data-relay-retry="${r.id}">Reintentar</button>`:''}</td></tr>`).join('');
  const canEmail=['admin','gerente','contador'].includes(currentEmployee.role);
  document.getElementById('relay-inbox').innerHTML=data.inbox.map(r=>`<tr><td>${escapeHtml(r.number)}</td><td>${escapeHtml(r.device_name)}</td><td>${escapeHtml(labels[r.email_status]||r.email_status)}</td><td><button type="button" class="ghost-btn small" data-relay-action="pdf" data-id="${r.id}">PDF / imprimir</button> <button type="button" class="ghost-btn small" data-relay-action="json" data-id="${r.id}">JSON</button>${canEmail&&r.email_status==='not_requested'?` <button type="button" class="ghost-btn small" data-relay-action="email" data-id="${r.id}">Correo</button>`:''}</td></tr>`).join('');
  document.getElementById('relay-devices').innerHTML=data.devices.map(d=>`<p>${escapeHtml(d.name)} · ${d.active?`Activo <button type="button" class="ghost-btn small" data-revoke-relay="${d.id}">Revocar clave</button>`:'Revocado'}</p>`).join('');
  document.getElementById('relay-send').disabled=!data.configuration.configured||!['admin','gerente','cajero'].includes(currentEmployee.role)||relayBusy;
  status.textContent=data.configuration.configured?`Destino: ${data.configuration.url} · Negocio: ${data.configuration.business}. ${data.counts.map(c=>`${labels[c.status]||c.status}: ${c.count}`).join(' · ')||'No hay documentos preparados todavía.'}`:'Sin destino configurado. El administrador puede conectar otro servidor desde Configuración.';
  return data;
 }catch(e){if(seq===relaySequence&&currentEmployee?.id===user)status.textContent=e.message;return null;}
}
async function sendDocumentCopies(){
 if(relayBusy||!currentEmployee)return;relayBusy=true;document.getElementById('relay-send').disabled=true;const user=currentEmployee.id;
 const status=document.getElementById('relay-status');status.textContent='Preparando y enviando copias. Las ventas no se vuelven a registrar…';
 try{const r=await apiRequest('/document-relay/send',{method:'POST',body:'{}',signal:AbortSignal.timeout(120000)});if(currentEmployee?.id!==user)return;await loadDocumentRelay();status.textContent=r.busy?'Ya hay un envío en curso.':`${r.sent} copias confirmadas. ${r.remaining} pendientes. ${r.error||'Puedes enviar el siguiente lote de hasta 25 documentos.'}`;}
 catch(e){if(currentEmployee?.id===user)status.textContent=e.message+' Los documentos se conservan para reintentar.';}
 finally{relayBusy=false;if(currentEmployee?.id===user)document.getElementById('relay-send').disabled=false;}
}
function initDocumentRelay(){
 document.getElementById('relay-show-key').addEventListener('click',()=>{const el=document.getElementById('relay-created-key');el.type=el.type==='password'?'text':'password';});
 document.getElementById('relay-outbox').addEventListener('click',async event=>{const b=event.target.closest('[data-relay-retry]');if(!b)return;try{await apiRequest('/document-relay/outbox/'+b.dataset.relayRetry+'/retry',{method:'POST',body:'{}'});await sendDocumentCopies();}catch(e){alert(e.message);}});
 document.getElementById('relay-refresh').addEventListener('click',()=>loadDocumentRelay());
 document.getElementById('relay-settings-refresh').addEventListener('click',()=>loadDocumentRelay(true));
 document.getElementById('relay-send').addEventListener('click',sendDocumentCopies);
 document.getElementById('relay-config-form').addEventListener('submit',async event=>{
  event.preventDefault();const status=document.getElementById('relay-config-status');
  try{const body={url:document.getElementById('relay-url').value.trim(),business:document.getElementById('relay-business').value.trim(),token:document.getElementById('relay-token').value.trim(),autoSend:document.getElementById('relay-auto').checked};await apiRequest('/document-relay/configuration',{method:'PUT',headers:await executiveHeaders(),body:JSON.stringify(body)});document.getElementById('relay-token').value='';status.textContent='Destino guardado. Prueba la conexión antes de enviar.';await loadDocumentRelay();}catch(e){status.textContent=e.message;}
 });
 document.getElementById('relay-test').addEventListener('click',async()=>{const status=document.getElementById('relay-config-status');try{const d=await apiRequest('/document-relay/test',{method:'POST',body:'{}'});status.textContent='Conexión autorizada: '+d.device;}catch(e){status.textContent=e.message;}});
 document.getElementById('relay-disconnect').addEventListener('click',async()=>{if(!confirm('¿Desconectar el destino y detener los envíos? Se conservan los documentos.'))return;try{await apiRequest('/document-relay/configuration',{method:'DELETE',headers:await executiveHeaders()});await loadDocumentRelay(true);}catch(e){document.getElementById('relay-config-status').textContent=e.message;}});
 document.getElementById('relay-device-form').addEventListener('submit',async event=>{event.preventDefault();try{const d=await apiRequest('/document-relay/devices',{method:'POST',headers:await executiveHeaders(),body:JSON.stringify({name:document.getElementById('relay-device-name').value.trim()})});document.getElementById('relay-created-key').value=d.token;document.getElementById('relay-key-status').textContent=`Negocio receptor: ${d.business}. Copia esta clave al dispositivo emisor. Se muestra únicamente ahora.`;await loadDocumentRelay();}catch(e){document.getElementById('relay-key-status').textContent=e.message;}});
 document.getElementById('relay-devices').addEventListener('click',async event=>{const b=event.target.closest('[data-revoke-relay]');if(!b||!confirm('¿Revocar la clave de este dispositivo? Las copias recibidas se conservan.'))return;try{await apiRequest('/document-relay/devices/'+b.dataset.revokeRelay,{method:'DELETE',headers:await executiveHeaders()});await loadDocumentRelay();}catch(e){alert(e.message);}});
 document.getElementById('relay-inbox').addEventListener('click',async event=>{const b=event.target.closest('[data-relay-action]');if(!b||b.disabled)return;b.disabled=true;try{if(b.dataset.relayAction==='email'){openDocumentEmail({label:'Copia recibida #'+b.dataset.id,path:`/document-relay/inbox/${b.dataset.id}/email`,recipientField:'recipient',refreshRelay:true});}else await downloadFromApi(`/document-relay/inbox/${b.dataset.id}/${b.dataset.relayAction}`,`copia-${b.dataset.id}.${b.dataset.relayAction}`);}catch(e){alert(e.message);}finally{b.disabled=false;}});
 // Automatic transmission only while a cash-authorized session is open. No SMTP is sent automatically.
 setInterval(async()=>{if(relayBusy||!currentEmployee||!['admin','gerente','cajero'].includes(currentEmployee.role)||navigator.onLine===false)return;try{const d=await apiRequest('/document-relay/status');if(d.configuration.autoSend&&d.configuration.configured)await sendDocumentCopies();}catch{}},60000);
}
