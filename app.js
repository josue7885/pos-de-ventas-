const STORAGE_KEY = 'pos_control_state_v1';

const DEFAULT_STATE = {
  employees: [],
  rooms: [{ id: 'salon-principal', name: 'Salón principal' }],
  products: [],
  categories: [],
  sales: [],
  companySettings: {},
  orders: [],
  tables: Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    room: 'salon-principal',
    name: `Mesa ${index + 1}`,
    status: 'libre',
    waiter: '',
    customer: '',
    notes: ''
  })),
  shift: {
    isOpen: false,
    openingCash: 0,
    currentCash: 0,
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    openedAt: null,
    closedAt: null,
    observedCash: 0,
    note: ''
  }
};

let state = loadState();
let currentEmployee = null;
let activeModule = 'pos';
let cart = [];

function ensureRestaurantState() {
  if (!Array.isArray(state.rooms) || state.rooms.length === 0) {
    state.rooms = [{ id: 'salon-principal', name: 'Salón principal' }];
  }

  if (!Array.isArray(state.tables) || state.tables.length === 0) {
    state.tables = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      room: state.rooms[0].id,
      name: `Mesa ${index + 1}`,
      status: 'libre',
      waiter: '',
      customer: '',
      notes: ''
    }));
  }

  state.tables = state.tables.map((table, index) => ({
    id: table.id ?? index + 1,
    room: table.room || state.rooms[0].id,
    name: table.name || `Mesa ${index + 1}`,
    status: table.status || 'libre',
    waiter: table.waiter || '',
    customer: table.customer || '',
    notes: table.notes || ''
  }));

  saveState();
}

const currency = (value) => new Intl.NumberFormat(state.companySettings.number_locale||'es-SV', { style: 'currency', currency: state.companySettings.currency_code||'USD' }).format(value || 0);

const API_BASE = getApiUrl('').replace(/\/$/, '');


function deepClone(data) {
  return JSON.parse(JSON.stringify(data));
}

function loadState() {
  // Preserve legacy business records for manual reconciliation, without plaintext PINs/secrets.
  const legacy=localStorage.getItem(STORAGE_KEY);
  if (legacy) {
    try {
      const old=JSON.parse(legacy), archive={};
      for (const key of ['sales','products','shift','tables','rooms','orders']) if(old[key]!==undefined)archive[key]=old[key];
      archive.employees=(old.employees||[]).map(({id,name,role})=>({id,name,role}));
      localStorage.setItem(`${STORAGE_KEY}:archive:${Date.now()}`,JSON.stringify(archive));
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) { console.warn('No se pudo archivar la caché anterior; se conserva sin importar.'); }
  }
  localStorage.removeItem('pos_token');
  localStorage.removeItem('executive_pin_hash');
  return deepClone(DEFAULT_STATE);
}
function saveState() { /* Server is authoritative; pending requests have their own journal. */ }

function getCompanySettings() {
  return state.companySettings || {};
}

function canAccessExecutivePanel() {
  return Boolean(currentEmployee && currentEmployee.role === 'admin');
}

function canManageUserAccounts() {
  return Boolean(currentEmployee && ['admin', 'gerente'].includes(currentEmployee.role));
}

async function loadCompanySettings() {
  try {
    const res = await posFetch(`${API_BASE}/settings`);
    if (!res.ok) return;
    const data = await res.json();
    const settings = data.settings || data;
    state.companySettings = settings;
    applyCompanySettings(settings);
    fillCompanySettingsForm(settings);applyBusinessConfiguration();
    saveState();
  } catch (error) {
    console.warn('No se pudo cargar la configuración de empresa:', error.message);
  }
}

function applyCompanySettings(settings = {}) {
  const brandName = document.getElementById('login-company-name');
  const brandBadge = document.getElementById('brand-badge');
  const sidebarName = document.getElementById('sidebar-company-name');
  const sidebarSubtitle = document.getElementById('sidebar-company-subtitle');
  const loginLogo = document.getElementById('login-company-logo');
  const sidebarLogo = document.getElementById('sidebar-company-logo');

  const companyName = settings.company_name || 'POS Control';
  const logo = settings.company_logo || '';

  if (brandName) brandName.textContent = companyName;
  if (sidebarName) sidebarName.textContent = companyName;
  if (sidebarSubtitle) sidebarSubtitle.textContent = 'Versión empresarial';
  if (brandBadge) brandBadge.textContent = (companyName || 'POS').substring(0, 3).toUpperCase();

  const setLogo = (imgEl) => {
    if (!imgEl) return;
    if (logo) {
      imgEl.src = logo;
      imgEl.classList.remove('hidden');
    } else {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hidden');
    }
  };

  setLogo(loginLogo);
  setLogo(sidebarLogo);

  const root = document.documentElement;
  root.style.setProperty('--primary', '#1d4ed8');
  root.style.setProperty('--primary-strong', '#1e3a8a');
  root.style.setProperty('--bg-soft', '#0f172a');
}

function getEmployeeByPin(pin) {
  return state.employees.find((employee) => employee.pin === String(pin).trim());
}

async function fetchOrdersFromServer() {
  try {
    const res = await posFetch(`${API_BASE}/orders`);
    if (!res.ok) return;
    const data = await res.json();
    state.orders = data.orders || [];
    renderOrders();
    renderKitchenOrders();
    renderTables();
    saveState();
  } catch (error) {
    console.warn('No se pudo sincronizar órdenes:', error.message);
  }
}

// Realtime orders via Server-Sent Events
let syncTimer = null;
let syncSequence = 0;
let lastSnapshot = '';
async function syncFromServer() {
  if (!currentEmployee) return;
  const seq = ++syncSequence;
  const userId = currentEmployee.id;
  const data = await apiRequest('/sync');
  if (seq !== syncSequence || !currentEmployee || currentEmployee.id !== userId) return;
  const stamp=JSON.stringify([data.products,data.sales,data.shift,data.orders,data.user,data.rooms,data.tables,data.categories,data.settings]);
  if (stamp===lastSnapshot) { if(activeModule==='documents')refreshDocuments(); return; }
  lastSnapshot=stamp;
  currentEmployee=data.user;
  if(data.settings){state.companySettings=data.settings;applyCompanySettings(data.settings);applyBusinessConfiguration();}
  state.products=data.products;state.categories=data.categories||[];
  state.sales=data.sales.map(s=>({...s,id:s.id,employeeName:s.employee_name,paymentMethod:s.payment_method,total:s.total,subtotal:s.subtotal,tax:s.tax,items:s.items.map(i=>({...i,id:i.product_id})),customerName:s.customer_name,invoiceNumber:s.invoice_number,discount:s.discount||0,createdAt:s.created_at,receivedAmount:s.received_amount,change:s.change_amount}));
  state.shift=data.shift;
  state.orders=data.orders;state.rooms=data.rooms;state.tables=data.tables;
  const draftFields=Array.from(document.querySelectorAll('#module-reports input, #module-reports textarea, #module-reports select')).map(el=>({id:el.id,value:el.value,checked:el.checked}));
  const focused=document.activeElement?.id;
  const category=document.getElementById('category-filter')?.value;
  renderCategoryFilter();
  if(category && document.getElementById('category-filter')) document.getElementById('category-filter').value=category;
  renderProducts();renderInventory();renderCashPanel();renderReports();
  for(const field of draftFields){const el=document.getElementById(field.id);if(el){el.value=field.value;if(el.type==='checkbox')el.checked=field.checked;}}
  if(focused) document.getElementById(focused)?.focus();
  renderOrders();renderKitchenOrders();renderTables();renderDashboardSummary();updateHeader();renderNav();
  if(activeModule==='documents')refreshDocuments();
}
function initOrderEventStream() {
  stopSync();
  syncTimer=setInterval(() => syncFromServer().catch(error => {
    const badge=document.getElementById('shift-status');
    if (badge) badge.textContent='Sin sincronización';
    if (error.status===401 || error.status===404) expireSession();
  }), 3000);
}
function stopSync() { clearInterval(syncTimer);syncTimer=null;++syncSequence;lastSnapshot=''; }
function expireSession() {
  stopSync();resetEnhancements();cart=[];pendingSale=null;currentEmployee=null;state=deepClone(DEFAULT_STATE);lastSnapshot='';++syncSequence;sessionStorage.removeItem('pos_token');showLogin();
  const error=document.getElementById('login-error');
  error.textContent='La sesión venció. Inicia sesión nuevamente.';error.classList.remove('hidden');
}

async function addNewRoom() {
  const name=prompt('Nombre del salón:');if(!name)return;
  try { await apiRequest('/rooms',{method:'POST',body:JSON.stringify({name})});await syncFromServer(); }
  catch(error){alert(error.message);}
}
async function addTableToCurrentRoom() {
  const room=document.getElementById('table-room-filter').value;
  const name=prompt('Nombre de la mesa:');if(!name)return;
  try { await apiRequest('/tables',{method:'POST',body:JSON.stringify({room,name})});await syncFromServer(); }
  catch(error){alert(error.message);}
}

function renderTables() {
  const grid = document.getElementById('tables-grid');
  const roomFilter = document.getElementById('table-room-filter');
  if (!grid) return;

  const rooms = state.rooms || [];
  const selectedRoom = roomFilter ? roomFilter.value : (rooms[0] || {}).id;

  if (roomFilter) {
    roomFilter.innerHTML = rooms.map((room) => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('');
    if (!rooms.some((room) => room.id === selectedRoom) && rooms.length > 0) {
     roomFilter.value = rooms[0].id;
    } else if (rooms.length > 0) {
     roomFilter.value = selectedRoom;
    }
  }

  const roomId = roomFilter ? roomFilter.value : (rooms[0] || {}).id;
  const visibleTables = (state.tables || []).filter((table) => table.room === roomId || (!table.room && roomId === (rooms[0] || {}).id));

  grid.innerHTML = visibleTables.map((table) => `
    <div class="table-card ${table.status}">
      <div class="table-header">
        <strong>${escapeHtml(table.name)}</strong>
        <span class="table-badge ${table.status}">${table.status === 'libre' ? 'Libre' : table.status === 'ocupada' ? 'Ocupada' : table.status === 'pedido' ? 'Pedido' : 'Lista'}</span>
      </div>
      <p>${escapeHtml(table.customer || 'Sin cliente')}</p>
      <small>${escapeHtml(table.waiter || 'Sin mesero')}</small>
      <div class="table-actions">
        <button class="ghost-btn small" data-table-action="ocupada" data-table-id="${table.id}">Ocupar</button>
        <button class="primary-btn small" data-table-action="pedido" data-table-id="${table.id}">Pedido</button>
        <button class="ghost-btn small" data-table-action="libre" data-table-id="${table.id}">Liberar</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-table-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const table=state.tables.find(t=>t.id===Number(button.dataset.tableId));if(!table)return;
      try { await apiRequest(`/tables/${table.id}`,{method:'PATCH',body:JSON.stringify({status:button.dataset.tableAction,expectedStatus:table.status})});await syncFromServer(); }
      catch(error){alert(error.message);await syncFromServer().catch(()=>{});}
    });
  });
}

function renderOrders() {
  const list = document.getElementById('orders-list');
  if (!list) return;
  if (!state.orders || state.orders.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin órdenes pendientes.</div>';
    return;
  }

  list.innerHTML = state.orders.map((order) => {
    const items = (order.items || []).map((item) => `${escapeHtml(item.name)} x ${item.qty}`).join(', ');
    return `
      <div class="order-card">
        <div class="order-meta">
          <strong>Orden #${order.id}</strong>
          <span class="status-pill ${order.status}">${order.status}</span>
        </div>
        <p><b>Mesa:</b> ${escapeHtml(order.table_number || 'Mostrador')}</p>
        <p><b>Mesero:</b> ${escapeHtml(order.employee_name || 'Sin asignar')}</p>
        <p><b>Productos:</b> ${items || 'Sin productos'}</p>
        <p><b>Total:</b> ${currency(order.total || 0)}</p>
        <button class="ghost-btn small" data-order-id="${order.id}" data-order-status="ready">Marcar lista</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-order-id]').forEach((btn) => {
    btn.addEventListener('click', () => updateOrderStatus(Number(btn.dataset.orderId), btn.dataset.orderStatus));
  });
}

function renderKitchenOrders() {
  const list = document.getElementById('kitchen-list');
  if (!list) return;
  if (!state.orders || state.orders.length === 0) {
    list.innerHTML = '<div class="empty-state">No hay órdenes para cocina.</div>';
    return;
  }

  // Only show pending and preparing orders in kitchen module
  const kitchenOrders = state.orders.filter((order) => ['pending', 'preparing'].includes(order.status));

  if (kitchenOrders.length === 0) {
    list.innerHTML = '<div class="empty-state">No hay órdenes activas para cocina.</div>';
    return;
  }

  list.innerHTML = kitchenOrders.map((order) => {
    const items = (order.items || []).map((item) => `${escapeHtml(item.name)} x ${item.qty}`).join(', ');
    return `
      <div class="order-card" id="kitchen-order-${order.id}">
        <div class="order-meta">
          <strong>Orden #${order.id}</strong>
          <span class="status-pill ${order.status}">${order.status}</span>
        </div>
        <p><b>Mesa:</b> ${escapeHtml(order.table_number || 'Mostrador')}</p>
        <p><b>Cliente:</b> ${escapeHtml(order.customer_name || 'Cliente')}</p>
        <p><b>Productos:</b> ${items || 'Sin productos'}</p>
        <div class="order-actions">
          <button class="primary-btn small" data-kitchen-id="${order.id}" data-kitchen-status="preparing">Preparando</button>
          <button class="ghost-btn small" data-kitchen-id="${order.id}" data-kitchen-status="ready">Listo</button>
          <button class="ghost-btn small" data-kitchen-id="${order.id}" data-kitchen-status="served">Entregado</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-kitchen-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.kitchenId);
      const status = btn.dataset.kitchenStatus;
      try {
        btn.disabled = true;
        await updateOrderStatus(id, status);
        // remove from kitchen UI if status indicates it's finished for kitchen
        if (['ready', 'served', 'cancelled'].includes(status)) {
          const el = document.getElementById('kitchen-order-' + id);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
      } catch (e) {
        alert('No se pudo actualizar la orden: ' + (e.message || 'error'));
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function updateOrderStatus(orderId, status) {
  try {
    const res = await posFetch(`${API_BASE}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('No se pudo actualizar la orden');
    await fetchOrdersFromServer();
  } catch (error) {
    alert(error.message || 'No se pudo actualizar la orden.');
  }
}

async function sendCurrentCartToKitchen() {
  if (saleInFlight || pendingSale) return alert('Primero confirma la venta pendiente.');
  if (!currentEmployee) {
    alert('Debes iniciar sesión.');
    return;
  }
  if (cart.length === 0) {
    alert('El carrito está vacío.');
    return;
  }

  const customerName = (document.getElementById('billing-customer-name')?.value || document.getElementById('customer-name')?.value || '').trim() || 'Cliente';
  const notes = (document.getElementById('billing-customer-notes')?.value || document.getElementById('customer-address')?.value || '').trim() || '';

  const assignedTable = getAvailableTableForOrder();
  const tableNumber = assignedTable ? assignedTable.name : 'Mostrador';

  try {
    const res = await posFetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        employeeName: currentEmployee.name,
        tableNumber,
        tableId: assignedTable?.id || null,
        customerName,
        notes,
        items: cart.map((item) => ({ id: item.id, name: item.name, price: item.price, qty: item.qty }))
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo enviar la orden a cocina');
    }
    const data = await res.json();
    const kitchenItems = cart.map((item) => ({ name: item.name, qty: item.qty }));
    cart = [];
    renderCart();
    await syncFromServer();
    printKitchenTicket({
      tableNumber,
      customerName,
      employeeName: currentEmployee.name,
      notes,
      items: kitchenItems
    });
    alert(`Orden #${data.order.id} enviada a cocina. Mesa asignada: ${tableNumber}.`);
  } catch (error) {
    alert(error.message || 'No se pudo crear la orden.');
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
}

function updateHeader() {
  const userName = document.getElementById('user-name');
  const userRole = document.getElementById('user-role');
  const shiftStatus = document.getElementById('shift-status');

  userName.textContent = currentEmployee ? currentEmployee.name : 'Empleado';
  userRole.textContent = currentEmployee ? currentEmployee.role.toUpperCase() : 'ROL';

  if (state.shift.isOpen) {
    shiftStatus.textContent = 'Caja abierta';
    shiftStatus.className = 'status-badge success';
  } else {
    shiftStatus.textContent = 'Caja cerrada';
    shiftStatus.className = 'status-badge neutral';
  }
}

function renderEmployeeOptions() {
  const select = document.getElementById('employee-select');
  select.innerHTML = state.employees.filter(u=>u.active!==0)
    .map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)} - ${employee.role}</option>`)
    .join('');
}

async function loadCustomers(selected=document.getElementById('customer-select')?.value || '') {
  const userId=currentEmployee?.id;
  try { const data=await apiRequest('/customers');if(currentEmployee?.id!==userId)return;customerDirectory=data.customers;renderCustomerDirectory(selected); }
  catch(error) { console.warn('No se pudieron cargar clientes:',error.message); }
}

function getCustomerPayloadFromForm() {
  const customerName = (document.getElementById('billing-customer-name')?.value || document.getElementById('customer-name')?.value || '').trim();
  const customerNit = (document.getElementById('billing-customer-nit')?.value || document.getElementById('customer-nit')?.value || '').trim();
  const customerEmail = (document.getElementById('billing-customer-email')?.value || document.getElementById('customer-email')?.value || '').trim();
  const customerPhone = (document.getElementById('billing-customer-phone')?.value || document.getElementById('customer-phone')?.value || '').trim();
  const customerAddress = (document.getElementById('billing-customer-address')?.value || document.getElementById('customer-address')?.value || '').trim();
  const customerDepartment = (document.getElementById('billing-customer-department')?.value || '').trim();
  const customerMunicipality = (document.getElementById('billing-customer-municipality')?.value || '').trim();
  const customerGiro = (document.getElementById('billing-customer-giro')?.value || '').trim();
  const customerNotes = (document.getElementById('billing-customer-notes')?.value || '').trim();
  const customerType = document.getElementById('billing-customer-type')?.value || document.getElementById('customer-type')?.value || 'consumidor_final';
  const customerId = document.getElementById('customer-select')?.value || '';
  return {
    customerId: customerId || null,
    customerName: customerName || 'Cliente general',
    customerNit: customerNit || 'CF',
    customerEmail,
    customerPhone,
    customerAddress,
    customerDepartment,
    customerMunicipality,
    customerGiro,
    customerNotes,
    tipo_receptor: customerType,
    documentType: customerType,
    customer: {
      id: customerId || undefined,
      full_name: customerName || 'Cliente general',
      nit: customerType === 'credito_fiscal' ? (customerNit || 'CF') : 'CF',
      dui: customerNit || '',
      email: customerEmail,
      phone: customerPhone,
      address: customerAddress,
      department: customerDepartment,
      municipality: customerMunicipality,
      giro: customerGiro,
      notes: customerNotes,
      document_type: customerType
    }
  };
}

async function saveCustomerFromForm() {
  const nameField = document.getElementById('billing-customer-name') || document.getElementById('customer-name');
  const nitField = document.getElementById('billing-customer-nit') || document.getElementById('customer-nit');
  const emailField = document.getElementById('billing-customer-email') || document.getElementById('customer-email');
  const phoneField = document.getElementById('billing-customer-phone') || document.getElementById('customer-phone');
  const addressField = document.getElementById('billing-customer-address') || document.getElementById('customer-address');
  const typeField = document.getElementById('billing-customer-type') || document.getElementById('customer-type');
  const departmentField = document.getElementById('billing-customer-department');
  const municipalityField = document.getElementById('billing-customer-municipality');
  const giroField = document.getElementById('billing-customer-giro');
  const notesField = document.getElementById('billing-customer-notes');

  const form = {
    full_name: (nameField?.value || '').trim(),
    nit: (nitField?.value || '').trim(),
    dui: (nitField?.value || '').trim(),
    email: (emailField?.value || '').trim(),
    phone: (phoneField?.value || '').trim(),
    address: (addressField?.value || '').trim(),
    department: (departmentField?.value || '').trim(),
    municipality: (municipalityField?.value || '').trim(),
    giro: (giroField?.value || '').trim(),
    notes: (notesField?.value || '').trim(),
    document_type: typeField?.value || 'consumidor_final'
  };

  if (!form.full_name) {
    alert('Escribe el nombre del cliente antes de guardar.');
    return;
  }

  try {
    const customerId = document.getElementById('customer-select')?.value;
    const method = customerId ? 'PUT' : 'POST';
    const url = customerId ? `${API_BASE}/customers/${customerId}` : `${API_BASE}/customers`;
    const res = await posFetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(form)
    });
    if (!res.ok) throw new Error('No se pudo guardar el cliente');
    const data = await res.json();
    const customer = data.customer;
    if (customer) {
      if (nameField) nameField.value = customer.full_name || '';
      if (nitField) nitField.value = customer.nit || '';
      if (emailField) emailField.value = customer.email || '';
      if (phoneField) phoneField.value = customer.phone || '';
      if (addressField) addressField.value = customer.address || '';
      if (departmentField) departmentField.value = customer.department || '';
      if (municipalityField) municipalityField.value = customer.municipality || '';
      if (giroField) giroField.value = customer.giro || '';
      if (notesField) notesField.value = customer.notes || '';
      const select = document.getElementById('customer-select');
      if (select) {
        const optionExists = Array.from(select.options).some((option) => Number(option.value) === Number(customer.id));
        if (!optionExists) {
          const option = new Option(`${customer.full_name} - ${customer.nit || 'Sin NIT'}`, customer.id);
          select.add(option);
        }
        select.value = String(customer.id);
      }
      alert('Cliente guardado correctamente.');
      await loadCustomers(String(customer.id));
    }
  } catch (error) {
    alert(error.message || 'No se pudo guardar el cliente.');
  }
}

function updateMiniTicketTotals() {
  const totals = getCartTotals();
  const subtotalMini = document.getElementById('ticket-subtotal-mini');
  const totalMini = document.getElementById('ticket-total-mini');
  if (subtotalMini) subtotalMini.textContent = totals.subtotal.toFixed(2);
  if (totalMini) totalMini.textContent = totals.total.toFixed(2);
  const modalTotalSummary = document.getElementById('modal-total-summary');
  if (modalTotalSummary) modalTotalSummary.textContent = currency(totals.total);
}

function openBillingModal(action = 'payment') {
  if (cart.length === 0) {
    alert('Primero agrega productos al carrito.');
    return;
  }

  const totals = getCartTotals();
  const modal = document.getElementById('billing-modal');
  modal.classList.remove('customer-only');
  document.getElementById('billing-modal-title').textContent='Datos del comprobante';
  const modalCustomerSummary = document.getElementById('modal-customer-summary');
  const modalTotalSummary = document.getElementById('modal-total-summary');
  const confirmBtn = document.getElementById('confirm-billing-btn');

  if (modalCustomerSummary) {
    const customerName = (document.getElementById('billing-customer-name')?.value || document.getElementById('customer-name')?.value || '').trim();
    modalCustomerSummary.textContent = customerName || 'Consumidor final';
  }

  if (modalTotalSummary) {
    modalTotalSummary.textContent = currency(totals.total);
  }

  const cashReceived = document.getElementById('billing-cash-received') || document.getElementById('cash-received');
  if (cashReceived) {
    cashReceived.value = totals.total.toFixed(2);
  }

  if (confirmBtn) {
    confirmBtn.textContent = action === 'kitchen' ? 'Enviar a cocina' : 'Confirmar cobro';
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeBillingModal() {
  const modal = document.getElementById('billing-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function confirmBillingAction() {
  const modal = document.getElementById('billing-modal');
  if (!modal || !modal.classList.contains('hidden')) {
    closeBillingModal();
  }

  const confirmBtn = document.getElementById('confirm-billing-btn');
  const currentAction = confirmBtn && confirmBtn.textContent && confirmBtn.textContent.includes('cocina') ? 'kitchen' : 'payment';

  if (currentAction === 'kitchen') {
    sendCurrentCartToKitchen();
    return;
  }

  processSale();
}

function printWindow(content, title) {
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) {
    alert('Se bloqueó la ventana de impresión. Permite pop-ups para imprimir el documento.');
    return;
  }
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:20px}h2{margin-bottom:8px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #ddd;text-align:left}strong{font-size:14px}</style></head><body>${content}</body></html>`);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    setTimeout(() => printWindow.close(), 700);
  }, 250);
}

function printKitchenTicket(order) {
  const itemsHtml = (order.items || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>x${item.qty}</td></tr>`).join('');
  const content = `
    <h2>Orden de cocina</h2>
    <p><strong>Mesa:</strong> ${escapeHtml(order.tableNumber || 'Mostrador')}</p>
    <p><strong>Cliente:</strong> ${escapeHtml(order.customerName || 'Cliente')}</p>
    <p><strong>Empleado:</strong> ${escapeHtml(order.employeeName || 'Sistema')}</p>
    <table><thead><tr><th>Producto</th><th>Cant.</th></tr></thead><tbody>${itemsHtml || '<tr><td colspan="2">Sin productos</td></tr>'}</tbody></table>
    ${order.notes ? `<p><strong>Nota:</strong> ${escapeHtml(order.notes)}</p>` : ''}
    <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
  `;
  printWindow(content, 'Orden de cocina');
}

function openKitchenDisplay() {
 const popup = window.open('kitchen-display.html?business='+encodeURIComponent(getBusinessId()), 'kitchenDisplay', 'width=1400,height=900,noopener');
 if (popup) popup.focus();
}

function openCustomerDisplay() {
 const popup = window.open('customer-display.html?business='+encodeURIComponent(getBusinessId()), 'customerDisplay', 'width=1100,height=760,noopener');
 if (popup) popup.focus();
}

function renderNav() {
  const nav = document.getElementById('nav-menu');
  const visibleSections = {
    admin: ['businesses','documents','pos', 'tables', 'orders', 'kitchen', 'inventory', 'cash', 'reports', 'users', 'settings'],
    cajero: ['documents','pos', 'tables', 'orders', 'cash'],
    mesero: ['pos', 'tables', 'orders', 'kitchen'],
    cocina: ['kitchen'],
    gerente: ['documents','inventory','pos', 'tables', 'orders', 'kitchen', 'reports', 'cash', 'users'],
    contador: ['documents','reports', 'cash']
  };

  const modules = [
    { id: 'businesses', label: 'Negocios' },
    { id: 'pos', label: 'Venta' },
    { id: 'tables', label: 'Mesas' },
    { id: 'orders', label: 'Órdenes' },
    { id: 'kitchen', label: 'Cocina' },
    { id: 'inventory', label: 'Inventario' },
    { id: 'cash', label: 'Caja' },
    { id:'documents',label:'Documentos' },
    { id: 'reports', label: 'Reportes' },
    { id: 'users', label: 'Usuarios' },
    { id: 'settings', label: 'Configuración' }
  ];

  const roles = currentEmployee ? visibleSections[currentEmployee.role] || [] : [];

  nav.innerHTML = modules
    .filter((module) => roles.includes(module.id) && moduleEnabled(module.id))
    .map(
      (module) => `
        <button
          class="nav-btn ${module.id === activeModule ? 'active' : ''}"
          data-module="${module.id}"
          type="button"
        >
          ${module.label}
        </button>
      `
    )
    .join('');

  nav.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => setActiveModule(button.dataset.module));
  });
}

function getAvailableTableForOrder(preferredName = '') {
  const tables = state.tables || [];
  const freeTable = tables.find((table) => table.status === 'libre') || tables.find((table) => !table.status || table.status === 'libre');
  if (freeTable) return freeTable;

  const fallback = tables[0] || {
    id: Date.now(),
    room: (state.rooms && state.rooms[0] && state.rooms[0].id) || 'salon-principal',
    name: 'Mesa 1',
    status: 'ocupada',
    waiter: '',
    customer: '',
    notes: ''
  };

  if (preferredName) {
    fallback.name = String(preferredName).trim() || fallback.name;
  }

  return fallback;
}

function renderDashboardSummary() {
  const dashboard = document.getElementById('dashboard-summary');
  if (!dashboard) return;

  const totalSales = state.sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const productsSold = state.sales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + Number(item.qty || 0), 0), 0);
  const openOrders = (state.orders || []).filter((order) => !['served', 'cancelled'].includes(order.status)).length;
  const activeTables = (state.tables || []).filter((table) => table.status !== 'libre').length;

  dashboard.innerHTML = `
    <div class="metric-card">
      <span>Ventas del día</span>
      <strong>${currency(totalSales)}</strong>
    </div>
    <div class="metric-card">
      <span>Productos vendidos</span>
      <strong>${productsSold}</strong>
    </div>
    <div class="metric-card">
      <span>Órdenes activas</span>
      <strong>${openOrders}</strong>
    </div>
    <div class="metric-card">
      <span>Mesas ocupadas</span>
      <strong>${activeTables}</strong>
    </div>
  `;
}

function setActiveModule(moduleId) {
  if (!currentEmployee) return;
  if(!moduleEnabled(moduleId))moduleId='pos';
  if (moduleId==='settings' && !canAccessExecutivePanel()) return;
  if (moduleId==='users' && !canManageUserAccounts()) return;
  activeModule = moduleId;

  document.querySelectorAll('.module').forEach((module) => {
    module.classList.toggle('hidden', module.id !== `module-${moduleId}`);
    module.classList.toggle('active', module.id === `module-${moduleId}`);
  });

  renderNav();
  if (moduleId === 'cash') renderCashPanel();
  if (moduleId === 'reports') renderReports();
  if (moduleId === 'businesses') refreshBusinesses();
  if (moduleId === 'settings') fillCompanySettingsForm(state.companySettings);
  if (moduleId === 'documents') refreshDocuments();
  if (moduleId === 'inventory') refreshInventoryHistory();
  if (moduleId === 'pos') renderDashboardSummary();
}

async function loginUser() {
  document.getElementById('pin-input').type='password';
  document.getElementById('toggle-login-pin').textContent='Mostrar';
  document.getElementById('toggle-login-pin').setAttribute('aria-pressed','false');
  const button=document.getElementById('login-btn');
  if (button.disabled) return;
  button.disabled=true;
  const errorText=document.getElementById('login-error');
  sessionStorage.removeItem('pos_token');
  try {
    const data=await apiRequest('/auth/login',{method:'POST',body:JSON.stringify({id:Number(document.getElementById('employee-select').value),pin:document.getElementById('pin-input').value})});
    if (!data.user || !data.token) throw new Error('Respuesta de acceso inválida.');
    resetEnhancements();cart=[];pendingSale=null;lastSnapshot='';
    currentEmployee=data.user;
    sessionStorage.setItem('pos_token',data.token);
    await loadCompanySettings();
    await syncFromServer();
    await loadCustomers();
    await fetchUsersFromServer();
    restorePendingSale();refreshPendingOperations();
    errorText.classList.add('hidden');document.getElementById('pin-input').value='';
    document.getElementById('admin-hero')?.classList.toggle('hidden',!canAccessExecutivePanel());
    setActiveModule(currentEmployee.role==='cocina'?'kitchen':currentEmployee.role==='mesero'?'tables':currentEmployee.role==='contador'?'reports':'pos');
    renderCart();showApp();initOrderEventStream();
  } catch(error) {
    currentEmployee=null;sessionStorage.removeItem('pos_token');
    errorText.textContent=error.status===401?'Credenciales inválidas.':error.message || 'No hay conexión con el servidor.';
    errorText.classList.remove('hidden');
  } finally { button.disabled=false; }
}
async function logoutUser() {
  if (saleInFlight) return alert('Espera la confirmación de la venta.');
  try { await apiRequest('/auth/logout',{method:'POST',body:'{}'}); }
  catch(error) { if (error.status!==401 && error.status!==404) return alert('No se pudo cerrar la sesión en el servidor. Reintenta con conexión.'); }
  resetEnhancements();stopSync();currentEmployee=null;cart=[];pendingSale=null;sessionStorage.removeItem('pos_token');
  state=deepClone(DEFAULT_STATE);renderCart();showLogin();await fetchUsersFromServer();
}

function renderCategoryFilter() {
  const filter = document.getElementById('category-filter');
  const categories = [...new Set(state.products.map((product) => product.category))];

  filter.innerHTML = '<option value="all">Todas</option>' + categories.map((category) => `
    <option value="${escapeHtml(category)}">${escapeHtml(category)}</option>
  `).join('');
}

function renderProducts() {
  const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
  const selectedCategory = document.getElementById('category-filter').value;

  const filteredProducts = state.products.filter((product) => {
    const matchesText = [product.name,product.code,product.category].some(value=>String(value||'').toLowerCase().includes(searchTerm));
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesText && matchesCategory;
  });

  const grid = document.getElementById('product-grid');
  if (filteredProducts.length === 0) {
    grid.innerHTML = '<div class="empty-state">No hay productos disponibles.</div>';
    return;
  }

  grid.innerHTML = filteredProducts.map((product) => `
    <article class="product-card" data-product-id="${product.id}">
      <div class="product-tag">${escapeHtml(product.category)}</div>
      <h4>${escapeHtml(product.name)}</h4>
      <p class="product-price">${currency(product.price)}</p>
      <small>${tracksStock(product)?'Existencias: '+product.stock+' '+escapeHtml(product.unit||'unidad'):'Servicio sin control de existencias'}</small>
      <button type="button" class="small primary-btn add-item-btn" data-product-id="${product.id}">Agregar</button>
    </article>
  `).join('');

  document.querySelectorAll('.add-item-btn').forEach((button) => {
    button.addEventListener('click', () => addToCart(Number(button.dataset.productId)));
  });
}

function addToCart(productId) {
  if (saleInFlight || pendingSale) return alert('Primero confirma la venta pendiente.');
  const product = state.products.find((item) => item.id === productId);

  if (!product) return;
  if (tracksStock(product) && product.stock <= 0) {
    alert('El producto está agotado.');
    return;
  }

  const existingItem = cart.find((item) => item.id === productId);

  if (existingItem) {
    if (tracksStock(product) && existingItem.qty + (quantityStep(product)<1?.1:1) > product.stock) {
      alert('No hay más stock disponible para este producto.');
      return;
    }
    existingItem.qty=roundQuantity(existingItem.qty+(quantityStep(product)<1?.1:1));
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: quantityStep(product)<1?Math.min(.1,product.stock||.1):1,
      unit:product.unit,type:product.type,cost:product.cost,catalogPrice:product.price,
      stock: product.stock
    });
  }

  renderCart();
}

function getCartTotals() {
  return PosMath.totals(cart,Number(state.companySettings.iva_rate??.13),Number(document.getElementById('billing-discount-percent')?.value||0));
}

function renderCart() {
  const cartList = document.getElementById('cart-list');

  if (cart.length === 0) {
    cartList.innerHTML = '<li class="empty-state cart-empty">El carrito está vacío.</li>';
  } else {
    cartList.innerHTML = cart.map((item, index) => `
      <li class="cart-item">
        <div class="cart-details">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${currency(item.price)} c/u</span>
        </div>
        <div class="cart-controls">
          <button type="button" class="qty-btn" data-action="decrease" data-index="${index}">−</button>
          <input class="cart-quantity-input" aria-label="Cantidad" type="number" min="0.001" step="${quantityStep(item)}" value="${item.qty}" data-index="${index}" />
          ${canEditInventory()?`<button type="button" class="price-adjust-btn ghost-btn small" data-index="${index}">Precio</button>`:''}
          <button type="button" class="qty-btn" data-action="increase" data-index="${index}">+</button>
          <button type="button" class="remove-btn" data-index="${index}">Eliminar</button>
        </div>
      </li>
    `).join('');
  }

  document.querySelectorAll('.qty-btn').forEach((button) => {
    button.addEventListener('click', () => updateCartItemQuantity(Number(button.dataset.index), button.dataset.action));
  });

  document.querySelectorAll('.remove-btn').forEach((button) => {
    button.addEventListener('click', () => removeCartItem(Number(button.dataset.index)));
  });

  document.querySelectorAll('.cart-quantity-input').forEach(input=>input.addEventListener('change',()=>setCartItemQuantity(Number(input.dataset.index),input.value)));
  document.querySelectorAll('.price-adjust-btn').forEach(button=>button.addEventListener('click',()=>editCartPrice(Number(button.dataset.index))));
  document.getElementById('billing-discount-percent').disabled=!canEditInventory()||operationLocked();
  document.getElementById('billing-discount-reason').disabled=!canEditInventory()||operationLocked();
  const totals = getCartTotals();
  document.getElementById('subtotal-value').textContent = totals.gross.toFixed(2);
  document.getElementById('discount-value').textContent = totals.discount.toFixed(2);
  document.getElementById('tax-value').textContent = totals.tax.toFixed(2);
  document.getElementById('total-value').textContent = totals.total.toFixed(2);
  updateMiniTicketTotals();

  const cashReceived = document.getElementById('billing-cash-received') || document.getElementById('cash-received');
  if (cashReceived && (!cashReceived.value || Number(cashReceived.value) < totals.total)) {
    cashReceived.value = totals.total.toFixed(2);
  }
}

function updateCartItemQuantity(index, action) {
  const item=cart[index];if(!item)return;
  const step=quantityStep(item)<1?.1:1,next=roundQuantity(item.qty+(action==='increase'?step:-step));
  if(next<=0){removeCartItem(index);return;}setCartItemQuantity(index,next);
}

function removeCartItem(index) {
  if (saleInFlight || pendingSale) return alert('Primero confirma la venta pendiente.');
  cart.splice(index, 1);
  renderCart();
}

function clearCart() {
  if (saleInFlight || pendingSale) return alert('Primero confirma la venta pendiente.');
  cart = [];resetSaleAdjustments();
  const cashReceived = document.getElementById('billing-cash-received') || document.getElementById('cash-received');
  if (cashReceived) cashReceived.value = '';
  renderCart();
}

let saleInFlight=false;
let pendingSale=null;
function pendingSaleKey() { return `pos_pending_sale:${operationScope()}:${currentEmployee.id}`; }
function restorePendingSale() {
  try { pendingSale=JSON.parse(localStorage.getItem(pendingSaleKey()) || 'null'); }
  catch (_) { pendingSale=null; }
  if (pendingSale) {
    cart=pendingSale.payload.items.map(i=>({...state.products.find(p=>p.id===i.id),...i}));
    document.getElementById('billing-discount-percent').value=pendingSale.payload.discountPercent||0;document.getElementById('billing-discount-reason').value=pendingSale.payload.discountReason||'';
    alert('Existe una venta sin confirmación. Pulsa Cobrar venta para consultar/reintentar la misma operación.');
  }
}
async function processSale() {
  if (saleInFlight) return;
  if (!currentEmployee) return alert('Debes iniciar sesión.');
  if (!pendingSale && (!state.shift.isOpen || !cart.length)) return alert('Abre la caja y agrega productos.');
  const totals=getCartTotals();
  const paymentMethod=document.getElementById('billing-payment-method')?.value || 'efectivo';
  const receivedAmount=Number(document.getElementById('billing-cash-received')?.value || 0);
  if (!pendingSale && paymentMethod==='efectivo' && (!Number.isFinite(receivedAmount) || receivedAmount<totals.total)) return alert('Efectivo insuficiente o inválido.');
  if (!pendingSale && localStorage.getItem(pendingSaleKey())) { restorePendingSale();renderCart();return; }
  if (!pendingSale) {
    pendingSale={key:newRequestId(),payload:{...cartPayload(),paymentMethod,receivedAmount}};
    try { localStorage.setItem(pendingSaleKey(),JSON.stringify(pendingSale)); }
    catch (_) { pendingSale=null;return alert('No se pudo guardar el identificador de venta. No se envió el cobro.'); }
  }
  saleInFlight=true;
  try {
    const data=await apiRequest('/sales',{method:'POST',headers:{'Idempotency-Key':pendingSale.key},body:JSON.stringify(pendingSale.payload)});
    if (!data.sale?.id) throw new Error('No se recibió confirmación de la venta.');
    // Mark committed before rendering or requesting PDFs. Those failures must never create a second sale.
    localStorage.removeItem(pendingSaleKey());pendingSale=null;cart=[];resetSaleAdjustments();renderCart();
    await syncFromServer().catch(()=>alert('Venta confirmada. Actualiza para consultar el saldo y las existencias.'));
    window.open(getApiUrl(`/invoices/${data.sale.id}/pdf`),'_blank','noopener');
    alert(`Venta confirmada #${data.sale.id}. Total: ${currency(data.sale.total)}${data.replayed?' (operación recuperada, sin duplicar)':''}.`);
  } catch(error) {
    if (pendingSale && error.status>=400 && error.status<500 && !pendingSale.uncertain) {
      localStorage.removeItem(pendingSaleKey());pendingSale=null;
      await syncFromServer().catch(()=>{});
      cart=cart.flatMap(i=>{const p=state.products.find(p=>p.id===i.id);return p&&(!tracksStock(p)||p.stock>0)?[{...p,qty:tracksStock(p)?Math.min(i.qty,p.stock):i.qty,price:p.price,catalogPrice:p.price}]:[];});renderCart();
      alert('Venta rechazada: '+error.message);
    } else if (pendingSale) {
      pendingSale.uncertain=true;
      localStorage.setItem(pendingSaleKey(),JSON.stringify(pendingSale));
      alert('No se pudo confirmar el resultado. Conservamos la operación; pulsa Cobrar venta para reintentar sin duplicarla.');
    } else { alert('La venta fue confirmada, pero falló una acción posterior: '+error.message); }
  } finally { saleInFlight=false;renderCart(); }
}

function renderInventory() { renderExtendedInventory(); }

let productEditStock=null,productEditVersion=null;
function openProductForm(productId = null) {
  const formPanel = document.getElementById('product-form-panel');
  const form = document.getElementById('product-form');
  const formTitle = document.getElementById('form-title');

  formPanel.classList.remove('hidden');
  form.reset();

  if (productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;

    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-category').value = product.category;
    document.getElementById('product-price').value = product.price;
    document.getElementById('product-stock').value = product.stock;
    productEditStock=product.stock;productEditVersion=product.version;
    for(const [field,key] of Object.entries({'product-code':'code','product-cost':'cost','product-min-stock':'min_stock','product-type':'type','product-unit':'unit'}))document.getElementById(field).value=product[key]??'';
    formTitle.textContent = 'Editar producto';
  } else {
    document.getElementById('product-id').value = '';
    formTitle.textContent = 'Agregar producto';productEditStock=null;productEditVersion=null;
    document.getElementById('product-type').value=state.companySettings.default_product_type||'producto';
  }
  updateProductTypeFields();
}

function closeProductForm() {
  document.getElementById('product-form-panel').classList.add('hidden');
  document.getElementById('product-form').reset();
}

async function deleteProduct(productId) {
  if (!confirm('¿Eliminar este producto del catálogo?')) return;
  try { await apiRequest(`/products/${productId}`,{method:'DELETE'});await syncFromServer(); }
  catch(error) { alert(error.message); }
}
async function handleProductSubmit(event) {
  event.preventDefault();
  const id=Number(document.getElementById('product-id').value) || null;
  const payload={ name:document.getElementById('product-name').value.trim(),category:document.getElementById('product-category').value.trim(),
    price:Number(document.getElementById('product-price').value),stock:Number(document.getElementById('product-stock').value),expectedStock:productEditStock,expectedVersion:productEditVersion,code:document.getElementById('product-code').value,cost:Number(document.getElementById('product-cost').value),min_stock:Number(document.getElementById('product-min-stock').value),type:document.getElementById('product-type').value,unit:document.getElementById('product-unit').value };
  try {
    await apiRequest(id?`/products/${id}`:'/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
    closeProductForm();await syncFromServer();
  } catch(error) { alert(error.message);await syncFromServer().catch(()=>{}); }
}
async function openShift() {
  const raw=prompt('Efectivo inicial de caja:','0');if(raw===null)return;
  try { await apiRequest('/shifts/open',{method:'POST',body:JSON.stringify({openingCash:raw})});await syncFromServer(); }
  catch(error) { alert(error.message); }
}
async function closeShift() {
  if (pendingSale || saleInFlight) return alert('Confirma primero la venta pendiente.');
  const raw=prompt('Efectivo contado al cierre:','0');if(raw===null)return;
  try { await apiRequest('/shifts/close',{method:'POST',body:JSON.stringify({observedCash:raw,shiftId:state.shift.id})});await syncFromServer(); }
  catch(error) { alert(error.message); }
}

function renderCashPanel() {
  const panel = document.getElementById('cash-panel-content');
  const shiftSummary = document.getElementById('shift-summary');

  const toggleShiftButton = document.getElementById('toggle-shift-btn');
  toggleShiftButton.textContent = state.shift.isOpen ? 'Cerrar turno' : 'Abrir turno';
  toggleShiftButton.onclick = state.shift.isOpen ? closeShift : openShift;

  if (!state.shift.isOpen) {
    panel.innerHTML = `
      <div class="empty-state">
        <p>No hay un turno abierto.</p>
        <p>Abre la caja para comenzar a vender.</p>
      </div>
    `;
  } else {
    panel.innerHTML = `
      <div class="shift-info">
        <p><strong>Turno abierto:</strong> ${new Date(state.shift.openedAt).toLocaleString()}</p>
        <p><strong>Apertura:</strong> ${currency(state.shift.openingCash)}</p>
        <p><strong>Dinero actual:</strong> ${currency(state.shift.currentCash)}</p>
        <p><strong>Ventas en efectivo:</strong> ${currency(state.shift.cashSales)}</p>
        <p><strong>Ventas con tarjeta:</strong> ${currency(state.shift.cardSales)}</p>
        <p><strong>Transferencias:</strong> ${currency(state.shift.transferSales)}</p>
      </div>
    `;
  }

  const totalSales = state.sales.reduce((sum, sale) => sum + sale.total, 0);
  const salesCount = state.sales.length;
  const totalProductsSold = state.sales.reduce((sum, sale) => sum + sale.items.reduce((x, item) => x + item.qty, 0), 0);

  shiftSummary.innerHTML = `
    <div class="metric-card">
      <span>Ventas</span>
      <strong>${salesCount}</strong>
    </div>
    <div class="metric-card">
      <span>Ingresos</span>
      <strong>${currency(totalSales)}</strong>
    </div>
    <div class="metric-card">
      <span>Unidades</span>
      <strong>${totalProductsSold}</strong>
    </div>
  `;
}

function renderReports() {
  const employees=document.getElementById('sales-report-employee'),selected=employees?.value;
  if(employees){employees.replaceChildren(new Option('Todos los cajeros','all'),...[...new Set(state.sales.map(s=>s.employeeName))].map(name=>new Option(name,name)));employees.value=selected||'all';}
  const reportSales=filteredSales();
  const knownCosts=reportSales.filter(s=>s.items.length && s.items.every(i=>i.cost!==null && i.cost!==undefined));
  const profitCents=knownCosts.reduce((n,s)=>n+PosMath.cents(s.subtotal)-s.items.reduce((cost,i)=>cost+Math.round(PosMath.cents(i.cost)*PosMath.quantity(i.qty)/1000),0),0);

  const tableBody = document.getElementById('sales-table-body');
  const reportCards = document.getElementById('report-cards');

  const totalSales = reportSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalCount = reportSales.length;
  const totalUnits = reportSales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + item.qty, 0), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const selectedReport = localStorage.getItem('pos_selected_report_view') || 'monthly';

  const reportDetailHtml = (() => {
    const rangeStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const rangeEnd = new Date().toISOString().slice(0, 10);

    if (selectedReport === 'pdf') {
      return `
        <div class="report-extra-panel">
          <div class="panel-header">
            <h4>Reportes PDF finales</h4>
          </div>
          <div class="inline-form-row">
            <label>Inicio
              <input id="report-range-start" type="date" value="${rangeStart}" />
            </label>
            <label>Fin
              <input id="report-range-end" type="date" value="${rangeEnd}" />
            </label>
          </div>
          <div class="inline-form-row">
            <button id="pdf-close-month-btn" class="primary-btn small" type="button">PDF cierre mes</button>
            <button id="pdf-vat-book-btn" class="ghost-btn small" type="button">PDF libro IVA</button>
            <button id="pdf-inventory-btn" class="ghost-btn small" type="button">PDF inventario</button>
          </div>
        </div>
      `;
    }

    if (selectedReport === 'transactions') {
      return `
        <div class="report-extra-panel">
          <div class="panel-header">
            <h4>Compras, gastos e inventario</h4>
          </div>
          <div class="inline-form-row stacked">
            <form id="purchase-product-form" class="mini-form">
              <h5>Agregar producto</h5>
              <input id="purchase-product-name" placeholder="Nombre del producto" />
              <input id="purchase-product-category" placeholder="Categoría" />
              <input id="purchase-product-price" type="number" step="0.01" placeholder="Precio unitario" />
              <input id="purchase-product-stock" type="number" step="1" placeholder="Stock inicial" />
              <button type="submit" class="ghost-btn small">Guardar producto</button>
            </form>
            <form id="purchase-form" class="mini-form">
              <h5>Compra</h5>
              <input id="purchase-supplier" placeholder="Proveedor" />
              <input id="purchase-nit" placeholder="NIT" />
              <input id="purchase-fecha" type="date" />
              <input id="purchase-subtotal" type="number" step="0.01" placeholder="Subtotal" />
              <input id="purchase-iva" type="number" step="0.01" placeholder="IVA" />
              <input id="purchase-total" type="number" step="0.01" placeholder="Total" />
              <textarea id="purchase-notes" placeholder="Notas"></textarea>
              <button type="submit" class="primary-btn small">Guardar compra</button>
            </form>
            <form id="expense-form" class="mini-form">
              <h5>Gasto</h5>
              <input id="expense-description" placeholder="Descripción" />
              <input id="expense-category" placeholder="Categoría" />
              <input id="expense-fecha" type="date" />
              <input id="expense-amount" type="number" step="0.01" placeholder="Monto" />
              <input id="expense-iva" type="number" step="0.01" placeholder="IVA" />
              <input id="expense-total" type="number" step="0.01" placeholder="Total" />
              <textarea id="expense-notes" placeholder="Notas"></textarea>
              <button type="submit" class="ghost-btn small">Guardar gasto</button>
            </form>
            <form id="inventory-check-form" class="mini-form">
              <h5>Verificación inventario</h5>
              <select id="inventory-check-product">
                ${state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join('') || '<option value="">Sin productos</option>'}
              </select>
              <input id="inventory-check-date" type="date" />
              <input id="inventory-check-expected" type="number" placeholder="Esperado" readonly />
              <input id="inventory-check-counted" step="0.001" type="number" placeholder="Contado" />
              <textarea id="inventory-check-notes" placeholder="Motivo del ajuste / notas"></textarea>
              <label><input id="inventory-check-adjust" type="checkbox" /> Ajustar existencias al conteo (requiere motivo)</label>
              <button type="submit" class="ghost-btn small">Guardar conteo</button>
            </form>
          </div>
        </div>
      `;
    }

    return `
      <div class="report-extra-panel">
        <div class="panel-header">
          <h4>Cierre mensual + IVA</h4>
        </div>
        <div class="inline-form-row">
          <label>Mes
            <input id="report-month-input" type="month" value="${currentMonth}" />
          </label>
          <button id="refresh-monthly-report-btn" class="ghost-btn small" type="button">Actualizar</button>
          <button id="close-month-btn" class="primary-btn small" type="button">Cerrar mes</button>
        </div>
        <div id="monthly-summary-box" class="summary-cards"></div>
        <div id="vat-summary-box" class="table-wrap"></div>
      </div>
    `;
  })();

  reportCards.innerHTML = `
    <div class="report-fullscreen-panel">
      <div class="report-header-strip">
        <div class="metric-card compact">
          <span>Ventas</span>
          <strong>${totalCount}</strong>
        </div>
        <div class="metric-card compact">
          <span>Ingresos</span>
          <strong>${currency(totalSales)}</strong>
        </div>
        <div class="metric-card compact">
          <span>Productos</span>
          <strong>${totalUnits}</strong>
        </div>
        <div class="metric-card compact">
          <span>Utilidad bruta estimada</span>
          <strong>${currency(profitCents/100)}</strong>
          <small>Sin IVA ni gastos. ${reportSales.length-knownCosts.length} ventas sin costo histórico. Fechas UTC.</small>
        </div>
      </div>

      <div class="report-selector-panel report-extra-panel">
        <div class="panel-header">
          <h4>Reportes</h4>
        </div>
        <div class="inline-form-row">
          <label>Seleccionar vista
            <select id="report-view-select" class="mini-select">
              <option value="monthly" ${selectedReport === 'monthly' ? 'selected' : ''}>Cierre mensual</option>
              <option value="pdf" ${selectedReport === 'pdf' ? 'selected' : ''}>PDF finales</option>
              <option value="transactions" ${selectedReport === 'transactions' ? 'selected' : ''}>Compras / gastos / inventario</option>
            </select>
          </label>
        </div>
      </div>

      <div id="report-detail-panel" class="report-detail-panel">${reportDetailHtml}</div>
    </div>
  `;

  tableBody.innerHTML = reportSales.length === 0
    ? '<tr><td colspan="4" class="empty-state">No hay ventas registradas.</td></tr>'
    : reportSales.map((sale) => `
        <tr>
          <td>${new Date(sale.createdAt).toLocaleString()}</td>
          <td>${escapeHtml(sale.employeeName)}</td>
          <td>${sale.paymentMethod}</td>
          <td>${currency(sale.total)}</td>
        </tr>
      `).join('');

  bindReportControls();
  if (selectedReport === 'monthly') refreshMonthSummary();
}

function bindReportControls() {
  const reportSelect = document.getElementById('report-view-select');
  if (reportSelect) {
    reportSelect.onchange = () => {
      localStorage.setItem('pos_selected_report_view', reportSelect.value);
      renderReports();
    };
  }

  const monthInput = document.getElementById('report-month-input');
  const refreshBtn = document.getElementById('refresh-monthly-report-btn');
  const closeMonthBtn = document.getElementById('close-month-btn');
  const pdfMonthBtn = document.getElementById('pdf-close-month-btn');
  const pdfVatBtn = document.getElementById('pdf-vat-book-btn');
  const pdfInventoryBtn = document.getElementById('pdf-inventory-btn');
  const purchaseProductForm = document.getElementById('purchase-product-form');
  const purchaseForm = document.getElementById('purchase-form');
  const expenseForm = document.getElementById('expense-form');
  const inventoryCheckForm = document.getElementById('inventory-check-form');

  if (refreshBtn) refreshBtn.onclick = refreshMonthSummary;
  if (closeMonthBtn) closeMonthBtn.onclick = closeCurrentMonth;
  if (monthInput) monthInput.onchange = refreshMonthSummary;
  if (pdfMonthBtn) pdfMonthBtn.onclick = () => downloadReportPdf('monthly-close', { start: document.getElementById('report-range-start').value, end: document.getElementById('report-range-end').value });
  if (pdfVatBtn) pdfVatBtn.onclick = () => downloadReportPdf('vat-book', { start: document.getElementById('report-range-start').value, end: document.getElementById('report-range-end').value });
  if (pdfInventoryBtn) pdfInventoryBtn.onclick = () => downloadReportPdf('inventory', { start: document.getElementById('report-range-start').value, end: document.getElementById('report-range-end').value });

  if (purchaseProductForm) {
    purchaseProductForm.onsubmit = async (event) => {
      event.preventDefault();
      const payload = {
        name: document.getElementById('purchase-product-name').value.trim(),
        category: document.getElementById('purchase-product-category').value.trim() || 'Compra',
        price: Number(document.getElementById('purchase-product-price').value || 0),
        stock: Number(document.getElementById('purchase-product-stock').value || 0)
      };

      if (!payload.name || Number.isNaN(payload.price) || Number.isNaN(payload.stock)) {
        alert('Completa nombre, precio y stock del producto nuevo.');
        return;
      }

      try {
        const res = await posFetch(`${API_BASE}/products`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('No se pudo guardar el producto');
        await syncFromServer();
        purchaseProductForm.reset();
        alert('Producto agregado correctamente al inventario.');
      } catch (error) {
        alert(error.message || 'No se pudo guardar el producto.');
      }
    };
  }

  if (purchaseForm) {
    purchaseForm.onsubmit = async (event) => {
      event.preventDefault();
      const payload = {
        supplier_name: document.getElementById('purchase-supplier').value,
        supplier_nit: document.getElementById('purchase-nit').value,
        fecha: document.getElementById('purchase-fecha').value || new Date().toISOString().slice(0, 10),
        subtotal: Number(document.getElementById('purchase-subtotal').value || 0),
        iva: Number(document.getElementById('purchase-iva').value || 0),
        total: Number(document.getElementById('purchase-total').value || 0),
        notes: document.getElementById('purchase-notes').value
      };
      try {
        const res = await posFetch(`${API_BASE}/purchases`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('No se pudo guardar la compra');
        purchaseForm.reset();
        refreshMonthSummary();
        alert('Compra registrada correctamente.');
      } catch (error) {
        alert(error.message);
      }
    };
  }

  if (expenseForm) {
    expenseForm.onsubmit = async (event) => {
      event.preventDefault();
      const payload = {
        description: document.getElementById('expense-description').value,
        category: document.getElementById('expense-category').value,
        fecha: document.getElementById('expense-fecha').value || new Date().toISOString().slice(0, 10),
        amount: Number(document.getElementById('expense-amount').value || 0),
        iva: Number(document.getElementById('expense-iva').value || 0),
        total: Number(document.getElementById('expense-total').value || 0),
        notes: document.getElementById('expense-notes').value
      };
      try {
        const res = await posFetch(`${API_BASE}/expenses`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('No se pudo guardar el gasto');
        expenseForm.reset();
        refreshMonthSummary();
        alert('Gasto registrado correctamente.');
      } catch (error) {
        alert(error.message);
      }
    };
  }

  if (inventoryCheckForm) {
    const selector=document.getElementById('inventory-check-product');
    selector.onchange=()=>{document.getElementById('inventory-check-expected').value=state.products.find(p=>p.id===Number(selector.value))?.stock ?? '';};
    selector.onchange();
    inventoryCheckForm.onsubmit = async (event) => {
      event.preventDefault();
      const productId = document.getElementById('inventory-check-product').value;
      const payload = {
        product_id: Number(productId),
        fecha: document.getElementById('inventory-check-date').value || new Date().toISOString().slice(0, 10),
        expected_qty: Number(document.getElementById('inventory-check-expected').value || 0),
        counted_qty: Number(document.getElementById('inventory-check-counted').value || 0),
        notes: document.getElementById('inventory-check-notes').value,
        adjustStock: document.getElementById('inventory-check-adjust').checked
      };
      try {
        const res = await posFetch(`${API_BASE}/inventory/check`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const result=await res.json();
        if (!res.ok) throw new Error(result.error || 'No se pudo guardar el conteo');
        await syncFromServer();
        inventoryCheckForm.reset();
        selector.onchange();
        alert('Conteo de inventario guardado.');
      } catch (error) {
        alert(error.message);
      }
    };
  }
}

async function refreshMonthSummary() {
  const monthInput = document.getElementById('report-month-input');
  const month = (monthInput && monthInput.value) || new Date().toISOString().slice(0, 7);
  const summaryBox = document.getElementById('monthly-summary-box');
  const vatBox = document.getElementById('vat-summary-box');

  try {
    const res = await posFetch(`${API_BASE}/admin/monthly-summary?month=${encodeURIComponent(month)}`, {
      headers: getAuthHeaders(null)
    });
    if (!res.ok) throw new Error('No disponible');
    const data = await res.json();

    summaryBox.innerHTML = `
      <div class="metric-card"><span>Ventas</span><strong>${currency(data.salesTotal || 0)}</strong></div>
      <div class="metric-card"><span>Compras</span><strong>${currency(data.purchasesTotal || 0)}</strong></div>
      <div class="metric-card"><span>Gastos</span><strong>${currency(data.expensesTotal || 0)}</strong></div>
      <div class="metric-card"><span>IVA débito</span><strong>${currency(data.ivaDebito || 0)}</strong></div>
      <div class="metric-card"><span>IVA crédito</span><strong>${currency(data.ivaCredito || 0)}</strong></div>
      <div class="metric-card"><span>Inventario</span><strong>${currency(data.inventoryTotal || 0)}</strong></div>
    `;

    const maxDaily = Math.max(...(data.salesByDay || []).map((d) => Number(d.total || 0)), 1);
    const bars = (data.salesByDay || []).map((day) => {
      const height = Math.max(14, (Number(day.total || 0) / maxDaily) * 100);
      return `
        <div class="bar-column">
          <div class="bar-value">${currency(day.total || 0)}</div>
          <div class="bar-rail"><div class="bar-fill" style="height:${height}%"></div></div>
          <span>${(day.day || '').slice(-2)}</span>
        </div>
      `;
    }).join('');

    const vatRes = await posFetch(`${API_BASE}/vat-book?start=${encodeURIComponent(`${month}-01`)}&end=${encodeURIComponent(`${month}-31`)}`, {
      headers: getAuthHeaders(null)
    });
    if (vatRes.ok) {
      const vatData = await vatRes.json();
      const totalRows = vatData.totals || [];
      vatBox.innerHTML = `
        <div class="sales-chart">${bars || '<div class="empty-state">Sin ventas para graficar.</div>'}</div>
        <table>
          <thead><tr><th>Tipo</th><th>Base</th><th>IVA</th><th>Total</th><th>Facturas</th></tr></thead>
          <tbody>
            ${totalRows.length ? totalRows.map((entry) => `
              <tr>
                <td>${entry.tipo_receptor || 'N/A'}</td>
                <td>${currency(entry.base_imponible || 0)}</td>
                <td>${currency(entry.iva || 0)}</td>
                <td>${currency(entry.total || 0)}</td>
                <td>${entry.count || 0}</td>
              </tr>
            `).join('') : '<tr><td colspan="5">Sin datos de IVA para este período.</td></tr>'}
          </tbody>
        </table>
      `;
    }
  } catch (error) {
    summaryBox.innerHTML = '<div class="empty-state">No hay información disponible aún.</div>';
    vatBox.innerHTML = '<div class="empty-state">Sin libro de IVA.</div>';
  }
}

async function closeCurrentMonth() {
  const monthInput = document.getElementById('report-month-input');
  const month = (monthInput && monthInput.value) || new Date().toISOString().slice(0, 7);
  const [year, mon] = month.split('-').map(Number);
  const ok = confirm(`¿Deseas cerrar el mes ${month}? Se generará el resumen contable.`);
  if (!ok) return;

  try {
    const res = await posFetch(`${API_BASE}/admin/close-month`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ year, month: mon, notes: `Cierre del mes ${month}` })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo cerrar el mes');
    alert(`Mes cerrado correctamente. ID: ${data.closure.id}`);
    refreshMonthSummary();
  } catch (error) {
    alert(error.message);
  }
}

async function downloadReportPdf(type, params = {}) {
  try {
    const query = new URLSearchParams(params);
    const res = await posFetch(`${API_BASE}/reports/${type}/pdf?${query.toString()}`, {
      headers: getAuthHeaders(null)
    });
    if (!res.ok) throw new Error('No se pudo generar el PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    const filenameMap = {
      'monthly-close': 'cierre-mensual.pdf',
      'vat-book': 'libro-iva.pdf',
      inventory: 'inventario.pdf'
    };
    link.download = filenameMap[type] || 'reporte.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Error al generar el PDF: ' + error.message);
  }
}

async function exportReport(format = 'csv') {
  try {
    const query=salesReportQuery();query.set('format',format);
    const url = `${API_BASE}/reports/sales/export?${query}`;
    const res = await posFetch(url, { headers: getAuthHeaders(null) });
    if (!res.ok) {
      alert('No se pudo exportar el reporte. Asegúrate de estar autenticado con un usuario con permisos.');
      return;
    }
    const blob = await res.blob();
    let filename = 'ventas.' + (format === 'xlsx' ? 'xlsx' : 'csv');
    const cd = res.headers.get('content-disposition');
    if (cd && cd.includes('filename=')) {
      filename = cd.split('filename=')[1].replace(/"/g, '');
    }
    const a = document.createElement('a');
    const urlBlob = URL.createObjectURL(blob);
    a.href = urlBlob;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(urlBlob);
  } catch (err) {
    alert('Error al exportar: ' + err.message);
  }
}

// --- Users management (UI + server sync)
async function fetchUsersFromServer() {
  try { const data=await apiRequest(canManageUserAccounts()?'/users?includeInactive=1':'/users');state.employees=data.users;renderEmployeeOptions();renderUsers(); }
  catch(error) { console.warn('No se pudo cargar empleados:',error.message); }
}

function renderUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;
  if (state.employees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No hay usuarios</td></tr>';
    return;
  }

  tbody.innerHTML = state.employees
    .map((u) => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.role)} · ${u.active===0?'Inactivo':'Activo'}</td>
        <td>
          <button class="ghost-btn edit-user" data-id="${u.id}">Editar</button>
          <button class="danger-btn delete-user" data-id="${u.id}">Eliminar</button>
        </td>
      </tr>
    `)
    .join('');

  tbody.querySelectorAll('.edit-user').forEach((btn) => {
    btn.addEventListener('click', () => openUserForm(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.delete-user').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(Number(btn.dataset.id)));
  });
}

function openUserForm(userId = null) {
  const panel = document.getElementById('user-form-panel');
  const form = document.getElementById('user-form');
  panel.classList.remove('hidden');
  form.reset();
  document.getElementById('user-id').value = '';

  if (userId) {
    const user = state.employees.find((u) => u.id === userId);
    if (!user) return;
    document.getElementById('user-id').value = user.id;
    document.getElementById('user-form-name').value = user.name;
    document.getElementById('user-role-input').value = user.role;
    document.getElementById('user-active').checked=user.active!==0;
    document.getElementById('user-pin').value = '';
  }
}

function closeUserForm() {
  const panel = document.getElementById('user-form-panel');
  panel.classList.add('hidden');
  document.getElementById('user-form').reset();
}

async function handleUserSubmit(event) {
  event.preventDefault();
  if (!canManageUserAccounts()) return alert('Permiso insuficiente.');
  const id=document.getElementById('user-id').value;
  const payload={active:document.getElementById('user-active').checked,name:document.getElementById('user-form-name').value.trim(),role:document.getElementById('user-role-input').value,pin:document.getElementById('user-pin').value.trim()};
  if (!payload.name || (!id && !/^\d{6,12}$/.test(payload.pin)) || (payload.pin && !/^\d{6,12}$/.test(payload.pin))) return alert('Indica nombre, rol y un PIN de 6 a 12 dígitos.');
  try {
    await apiRequest(id?`/users/${id}`:'/users',{method:id?'PUT':'POST',headers:await executiveHeaders(),body:JSON.stringify(payload)});
    await fetchUsersFromServer();closeUserForm();
  } catch(error) { alert(error.message); }
}
async function deleteUser(id) {
  if (!canManageUserAccounts() || !confirm('¿Eliminar usuario?')) return;
  try { await apiRequest(`/users/${id}`,{method:'DELETE',headers:await executiveHeaders()});await fetchUsersFromServer(); }
  catch(error) { alert(error.message); }
}

function fillCompanySettingsForm(settings = {}) {
  fillBusinessSettings(settings);
  const fieldIds = [
    'company_name', 'company_legal_name', 'company_nit', 'company_giro', 'company_address', 'company_department', 'company_municipality', 'company_phone', 'company_email', 'company_website',
    'server_base',
    'hacienda_env', 'hacienda_mode', 'business_active', 'iva_rate', 'hacienda_url', 'hacienda_user', 'hacienda_password', 'hacienda_token', 'hacienda_certificate_path', 'hacienda_certificate_password', 'invoice_prefix', 'invoice_serie', 'invoice_next_number',
    'invoice_email_enabled', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_from_name'
  ];

  fieldIds.forEach((key) => {
    const input = document.getElementById(`setting-${key}`);
    if (!input) return;
    const value = settings[key] ?? '';
    if (input.type === 'number') {
      input.value = value === '' ? '' : Number(value);
    } else if (input.tagName === 'SELECT') {
      input.value = String(value ?? '');
    } else {
      input.value = value || '';
    }
  });

  // server_base preview (if present) — no image, just ensure localStorage shows it
  const serverBaseInput = document.getElementById('setting-server_base');
  if (serverBaseInput) {
    const sb = settings.server_base || localStorage.getItem('pos_api_base') || '';
    serverBaseInput.value = sb;
  }

  const logoPreview = document.getElementById('company-logo-preview');
  if (logoPreview) {
    const logo = settings.company_logo || '';
    if (logo) {
      logoPreview.src = logo;
      logoPreview.classList.remove('hidden');
    } else {
      logoPreview.classList.add('hidden');
      logoPreview.removeAttribute('src');
    }
  }
}

async function saveCompanySettings(event) {
  event?.preventDefault();
  if (!currentEmployee || currentEmployee.role !== 'admin') {
    alert('Solo el administrador puede guardar la configuración de la empresa.');
    return;
  }

  const payload = {};
  const fieldIds = [
    'company_name', 'company_legal_name', 'company_nit', 'company_giro', 'company_address', 'company_department', 'company_municipality', 'company_phone', 'company_email', 'company_website',
    'server_base',
    'hacienda_env', 'hacienda_mode', 'business_active', 'iva_rate', 'hacienda_url', 'hacienda_user', 'hacienda_password', 'hacienda_token', 'hacienda_certificate_path', 'hacienda_certificate_password', 'invoice_prefix', 'invoice_serie', 'invoice_next_number',
    'invoice_email_enabled', 'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_from_name'
  ];

  fieldIds.forEach((key) => {
    const input = document.getElementById(`setting-${key}`);
    if (input) payload[key] = input.value;
  });

  Object.assign(payload,readBusinessSettings());
  const logoInput = document.getElementById('setting-company_logo');
  if (logoInput && logoInput.files && logoInput.files[0]) {
    const file = logoInput.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      payload.company_logo = reader.result;
      await persistCompanySettings(payload);
    };
    reader.readAsDataURL(file);
    return;
  }

  await persistCompanySettings(payload);
}


async function persistCompanySettings(payload) {
  try {
    // A connection target is a device preference, not a shared business setting.
    const serverBase=payload.server_base;delete payload.server_base;
    const data=await apiRequest('/settings',{method:'PUT',headers:await executiveHeaders(),body:JSON.stringify(payload)});
    state.companySettings=data.settings;applyCompanySettings(data.settings);fillCompanySettingsForm(data.settings);applyBusinessConfiguration();renderNav();renderCart();
    if (serverBase && serverBase.replace(/\/$/,'')!==getSavedApiBase()) {
      const url=new URL(serverBase);
      if (!['http:','https:'].includes(url.protocol)) throw new Error('URL de servidor inválida');
      localStorage.setItem('pos_api_base',url.href.replace(/\/$/,''));location.reload();return;
    }
    alert('Configuración guardada.');
  } catch(error) { alert(error.message); }
}

async function activateBusiness() {
  if (!currentEmployee || currentEmployee.role !== 'admin') {
    alert('Solo el administrador puede activar el negocio.');
    return;
  }
  const ok = confirm('¿Deseas activar el negocio 100% funcional? Esta acción requiere PIN ejecutivo y validará la configuración de Hacienda.');
  if (!ok) return;

  const headers = getAuthHeaders();
  try {
    if (state.companySettings.executive_pin_set) {
      const pin = prompt('Introduce PIN ejecutivo para confirmar la activación:');
      if (!pin) { alert('Acción cancelada. PIN requerido.'); return; }
      headers['x-exec-pin'] = pin;
    }
  } catch (e) { }

  try {
    const res = await posFetch(`${API_BASE}/admin/activate-business`, { method: 'POST', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'No se pudo activar el negocio');
      return;
    }

    // Refresh settings from server
    await loadCompanySettings();

    if (data.warning) {
      alert('Activado con advertencia: ' + data.warning);
    } else {
      alert(data.message || 'Negocio activado correctamente.');
    }
  } catch (err) {
    alert('Error activando negocio: ' + (err.message || err));
  }
}


function bindCompanySettingsForm() {
  const form = document.getElementById('company-settings-form');
  if (!form) return;
  form.addEventListener('submit', saveCompanySettings);

  const logoInput = document.getElementById('setting-company_logo');
  if (logoInput) {
    logoInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const preview = document.getElementById('company-logo-preview');
        if (preview) {
          preview.src = reader.result;
          preview.classList.remove('hidden');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  const testBtn = document.getElementById('test-server-connection-btn');
  if (testBtn) testBtn.addEventListener('click', testServerConnection);
}

function initializeApp() {
  ensureRestaurantState();
  renderEmployeeOptions();
  renderCategoryFilter();
  renderProducts();
  renderCart();
  renderInventory();
  renderCashPanel();
  renderReports();
  renderUsers();
  renderTables();
  updateHeader();

  const loginBtn = document.getElementById('login-btn');
  document.getElementById('login-form')?.addEventListener('submit',event=>{event.preventDefault();loginUser();});
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logoutUser);
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('input', renderProducts);
  const categoryFilterEl = document.getElementById('category-filter');
  if (categoryFilterEl) categoryFilterEl.addEventListener('change', renderProducts);
  const clearCartBtnEl = document.getElementById('clear-cart-btn');
  if (clearCartBtnEl) clearCartBtnEl.addEventListener('click', clearCart);
  const processSaleBtnEl = document.getElementById('process-sale-btn');
  if (processSaleBtnEl) processSaleBtnEl.addEventListener('click', () => openBillingModal('payment'));
  const quickBillingBtnEl = document.getElementById('quick-billing-btn');
  if (quickBillingBtnEl) quickBillingBtnEl.addEventListener('click', () => openBillingModal('payment'));
  const saveCustomerBtnEl = document.getElementById('save-customer-btn');
  if (saveCustomerBtnEl) saveCustomerBtnEl.addEventListener('click', saveCustomerFromForm);
  const confirmBillingBtnEl = document.getElementById('confirm-billing-btn');
  if (confirmBillingBtnEl) confirmBillingBtnEl.addEventListener('click', confirmBillingAction);
  const closeBillingModalBtn = document.getElementById('close-billing-modal-btn');
  if (closeBillingModalBtn) closeBillingModalBtn.addEventListener('click', closeBillingModal);
  document.querySelectorAll('[data-close-modal="true"]').forEach((element) => {
    element.addEventListener('click', closeBillingModal);
  });
  const customerSelectEl = document.getElementById('customer-select');
  if (customerSelectEl) {
    customerSelectEl.addEventListener('change', async () => {
      if(operationLocked())return;
      const customerId = customerSelectEl.value;
      const setField = (id, value) => {
        const target = document.getElementById(id);
        if (target) target.value = value || '';
      };
      if (!customerId) {
        setField('billing-customer-name', '');
        setField('billing-customer-nit', '');
        setField('billing-customer-email', '');
        setField('billing-customer-phone', '');
        setField('billing-customer-address', '');
        setField('billing-customer-department', '');
        setField('billing-customer-municipality', '');
        setField('billing-customer-giro', '');
        setField('billing-customer-notes', '');
        setField('billing-customer-type', 'consumidor_final');
        return;
      }
      try {
        const res = await posFetch(`${API_BASE}/customers/${customerId}`, { headers: getAuthHeaders(null) });
        if (!res.ok) return;
        const data = await res.json();
        const customer = data.customer || {};
        if(customerSelectEl.value!==customerId)return;
        setField('billing-customer-name', customer.full_name || '');
        setField('billing-customer-nit', customer.nit || '');
        setField('billing-customer-email', customer.email || '');
        setField('billing-customer-phone', customer.phone || '');
        setField('billing-customer-address', customer.address || '');
        setField('billing-customer-department', customer.department || '');
        setField('billing-customer-municipality', customer.municipality || '');
        setField('billing-customer-giro', customer.giro || '');
        setField('billing-customer-notes', customer.notes || '');
        setField('billing-customer-type', customer.document_type || 'consumidor_final');
      } catch (error) {
        console.warn('No se pudo cargar el cliente seleccionado:', error.message);
      }
    });
  }
  const sendKitchenBtnEl = document.getElementById('send-kitchen-btn');
  if (sendKitchenBtnEl) sendKitchenBtnEl.addEventListener('click', () => openBillingModal('kitchen'));
  const openKitchenDisplayBtn = document.getElementById('open-kitchen-display-btn');
  if (openKitchenDisplayBtn) openKitchenDisplayBtn.addEventListener('click', openKitchenDisplay);
  const openCustomerDisplayBtn = document.getElementById('open-customer-display-btn');
  if (openCustomerDisplayBtn) openCustomerDisplayBtn.addEventListener('click', openCustomerDisplay);
  const newProductBtnEl = document.getElementById('new-product-btn');
  if (newProductBtnEl) newProductBtnEl.addEventListener('click', () => openProductForm());
  const cancelProductBtnEl = document.getElementById('cancel-product-btn');
  if (cancelProductBtnEl) cancelProductBtnEl.addEventListener('click', closeProductForm);
  const productFormEl = document.getElementById('product-form');
  if (productFormEl) productFormEl.addEventListener('submit', handleProductSubmit);
  const refreshReportBtnEl = document.getElementById('refresh-report-btn');
  if (refreshReportBtnEl) refreshReportBtnEl.addEventListener('click', renderReports);

  const quickSaleBtn = document.getElementById('quick-sale-btn');
  if (quickSaleBtn) quickSaleBtn.addEventListener('click', () => setActiveModule('pos'));

  const openSettingsBtn = document.getElementById('open-settings-btn');
  if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => setActiveModule('settings'));

  const activateBizBtn = document.getElementById('activate-business-btn');
  if (activateBizBtn) activateBizBtn.addEventListener('click', activateBusiness);

  const exportCsvBtn = document.getElementById('export-csv-btn');
  const exportXlsxBtn = document.getElementById('export-xlsx-btn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportReport('csv'));
  if (exportXlsxBtn) exportXlsxBtn.addEventListener('click', () => exportReport('xlsx'));

  // users UI events
  const newUserBtn = document.getElementById('new-user-btn');
  if (newUserBtn) newUserBtn.addEventListener('click', () => { if (!canManageUserAccounts()) { alert('Solo los administradores o gerentes pueden gestionar usuarios.'); return; } openUserForm(); });
  const cancelUserBtn = document.getElementById('cancel-user-btn');
  if (cancelUserBtn) cancelUserBtn.addEventListener('click', closeUserForm);
  const userForm = document.getElementById('user-form');
  if (userForm) userForm.addEventListener('submit', handleUserSubmit);

  const newRoomBtn = document.getElementById('new-room-btn');
  if (newRoomBtn) newRoomBtn.addEventListener('click', addNewRoom);
  const addTableBtn = document.getElementById('add-table-btn');
  if (addTableBtn) addTableBtn.addEventListener('click', addTableToCurrentRoom);

  bindCompanySettingsForm();initEnhancements();

  const pinInputEl = document.getElementById('pin-input');
  if (pinInputEl) {
    pinInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {event.preventDefault();loginUser();}
    });
  }

  initializeBusinesses();


  showLogin();
}

document.getElementById('login-server-btn')?.addEventListener('click', () => {
  const value=prompt('URL del servidor POS:',getSavedApiBase());if(!value)return;
  try { const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw new Error();localStorage.setItem('pos_api_base',url.href.replace(/\/$/,''));sessionStorage.removeItem('pos_token');location.reload(); }
  catch(_){alert('URL inválida.');}
});
initializeApp();
