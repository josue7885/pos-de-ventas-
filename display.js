const kitchen=location.pathname.endsWith('kitchen-display.html');
const labels={pending:'Pendiente',preparing:'Preparando',ready:'Listo',served:'Entregado',cancelled:'Cancelado'};
let refreshing=false;
async function refreshDisplay() {
  if(refreshing)return;refreshing=true;
  try {
    const {orders}=await apiRequest('/orders');
    for(const status of ['pending','preparing','ready']) {
      const counter=document.getElementById(`${status}-count`);if(counter)counter.textContent=orders.filter(o=>o.status===status).length;
    }
    const draw=(container,items)=>{
      container.replaceChildren();
      if(!items.length){container.textContent='Sin órdenes';return;}
      for(const order of items){
        const card=document.createElement('article');card.className='order-card order-item';
        const title=document.createElement('h3');title.textContent=`Orden #${order.id} · ${labels[order.status] || order.status}`;card.append(title);
        const meta=document.createElement('p');meta.textContent=`Mesa: ${order.table_number || 'Mostrador'} · ${order.customer_name || 'Cliente'}`;card.append(meta);
        const products=document.createElement('p');products.textContent=(order.items||[]).map(i=>`${i.name} x ${i.qty}`).join(', ');card.append(products);
        if(kitchen) for(const status of ['preparing','ready','served']) {
          if(!({pending:['preparing','ready'],preparing:['ready'],ready:['served']}[order.status] || []).includes(status))continue;
          const button=document.createElement('button');button.textContent=labels[status];button.className='primary';
          button.addEventListener('click',async()=>{
            button.disabled=true;
            try{await apiRequest(`/orders/${order.id}/status`,{method:'PATCH',body:JSON.stringify({status})});await refreshDisplay();}
            catch(error){alert(error.message);}finally{button.disabled=false;}
          });card.append(button);
        }
        container.append(card);
      }
    };
    if(kitchen){
      for(const status of ['pending','preparing','ready'])draw(document.getElementById(`${status}-list`),orders.filter(o=>o.status===status));
      document.getElementById('quick-stats').textContent='Sincronizado';
    }else{
      draw(document.getElementById('orders-list'),orders.filter(o=>['pending','preparing','ready'].includes(o.status)));
      document.getElementById('live-status').textContent='Sincronizado';
    }
  } catch(error){
    const indicator=document.getElementById(kitchen?'quick-stats':'live-status');
    indicator.textContent=error.status===401?'Inicia sesión en el POS de este navegador.':'Sin conexión; reintentando.';
  }finally{refreshing=false;}
}
refreshDisplay();setInterval(refreshDisplay,3000);
