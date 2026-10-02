const STORAGE_KEY = 'pos_control_state_v1';

const DEFAULT_STATE = {
  employees: [
    { id: 1, name: 'Administrador', pin: '1234', role: 'admin' },
    { id: 2, name: 'Cajera', pin: '4321', role: 'cajero' },
  { id: 3, name: 'Cocina', pin: '1111', role: 'cocina' },
  { id: 4, name: 'Mesero', pin: '2222', role: 'mesero' }
],
rooms: [{ id: 'salon-principal', name: 'Salón principal' }],
products: [
    { id: 1, name: 'Café Americano', category: 'Bebidas', price: 3.5, stock: 25 },
    { id: 2, name: 'Capuccino', category: 'Bebidas', price: 4.5, stock: 18 },
    { id: 3, name: 'Sandwich de pollo', category: 'Comida', price: 8.5, stock: 15 },
    { id: 4, name: 'Hamburguesa', category: 'Comida', price: 9.75, stock: 12 },
    { id: 5, name: 'Pasta al pesto', category: 'Comida', price: 11.5, stock: 10 },
    { id: 6, name: 'Agua 500ml', category: 'Bebidas', price: 1.75, stock: 30 },
    { id: 7, name: 'Refresco 600ml', category: 'Bebidas', price: 2.25, stock: 26 },
    { id: 8, name: 'Galletas', category: 'Snacks', price: 2.5, stock: 20 }
  ],
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

const currency = (value) => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(value || 0);

const DEFAULT_API_BASE = 'http://localhost:3000';
const API_BASE = `${localStorage.getItem('pos_api_base') || DEFAULT_API_BASE}/api`;

function getAuthHeaders(contentType = 'application/json') {
  const token = localStorage.getItem('pos_token');
  const base = {};
  if (contentType) base['Content-Type'] = contentType;
  if (token) base['Authorization'] = `Bearer ${token}`;
  return base;
}

function deepClone(data) {
  return JSON.parse(JSON.stringify(data));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return deepClone(DEFAULT_STATE);
    }
    const parsed = JSON.parse(saved);
    const base = { ...deepClone(DEFAULT_STATE), ...parsed };
    base.rooms = Array.isArray(parsed.rooms) && parsed.rooms.length > 0 ? parsed.rooms : deepClone(DEFAULT_STATE.rooms);
    return base;
  } catch (error) {
    return deepClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

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
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) return;
    const data = await res.json();
    const settings = data.settings || data;
    state.companySettings = settings;
    applyCompanySettings(settings);
    fillCompanySettingsForm(settings);
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
    const res = await fetch(`${API_BASE}/orders`);
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
function initOrderEventStream() {
  try {
    const url = `${API_BASE}/orders/stream`;
    const es = new EventSource(url);
    es.addEventListener('orders', (msg) => {
      try {
        const payload = JSON.parse(msg.data || '{}');
        if (!payload || !payload.payload) return;
        const p = payload.payload;
        // event types: new_order, order_update
        if (payload.event === 'new_order') {
          // prepend new order
          state.orders = [p, ...state.orders.filter((o) => o.id !== p.id)];
        } else if (payload.event === 'order_update') {
          state.orders = state.orders.map((o) => (o.id === p.id ? p : o));
          if (!state.orders.find((o) => o.id === p.id)) state.orders.unshift(p);
        }
        renderOrders();
        renderKitchenOrders();
        renderTables();
        saveState();
      } catch (e) {
        console.warn('SSE parse error', e.message);
      }
    });
    es.onopen = () => console.log('Connected to orders stream');
    es.onerror = (e) => console.warn('Orders stream error', e);
  } catch (e) {
    console.warn('Could not open orders stream', e.message);
  }
}
function getAuthHeaders(contentType = 'application/json') {
  const token = localStorage.getItem('pos_token');
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

function addNewRoom() {
  const roomName = prompt('Nombre del salón:', 'Salón nuevo');
  if (!roomName || !roomName.trim()) return;

  const newRoom = {
    id: `salon-${Date.now()}`,
    name: roomName.trim()
  };

  state.rooms.push(newRoom);
  saveState();
  renderTables();
}

function addTableToCurrentRoom() {
  const roomSelect = document.getElementById('table-room-filter');
  const roomId = roomSelect ? roomSelect.value : (state.rooms[0] || {}).id;
  if (!roomId) return;

  const nextNumber = (state.tables || []).filter((table) => table.room === roomId).length + 1;
  const tableName = prompt('Nombre o número de la nueva mesa:', `Mesa ${nextNumber}`) || `Mesa ${nextNumber}`;

  state.tables.push({
    id: Date.now(),
    room: roomId,
    name: tableName,
    status: 'libre',
    waiter: '',
    customer: '',
    notes: ''
  });

  saveState();
  renderTables();
}

function renderTables() {
  const grid = document.getElementById('tables-grid');
  const roomFilter = document.getElementById('table-room-filter');
  if (!grid) return;

  const rooms = state.rooms || [];
  const selectedRoom = roomFilter ? roomFilter.value : (rooms[0] || {}).id;

  if (roomFilter) {
    roomFilter.innerHTML = rooms.map((room) => `<option value="${room.id}">${room.name}</option>`).join('');
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
        <strong>${table.name}</strong>
        <span class="table-badge ${table.status}">${table.status === 'libre' ? 'Libre' : table.status === 'ocupada' ? 'Ocupada' : table.status === 'pedido' ? 'Pedido' : 'Lista'}</span>
      </div>
      <p>${table.customer || 'Sin cliente'}</p>
      <small>${table.waiter || 'Sin mesero'}</small>
      <div class="table-actions">
        <button class="ghost-btn small" data-table-action="ocupada" data-table-id="${table.id}">Ocupar</button>
        <button class="primary-btn small" data-table-action="pedido" data-table-id="${table.id}">Pedido</button>
        <button class="ghost-btn small" data-table-action="libre" data-table-id="${table.id}">Liberar</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-table-action]').forEach((button) => {
    button.addEventListener('click', () => {
     const tableId = Number(button.dataset.tableId);
     const newStatus = button.dataset.tableAction;
     const table = (state.tables || []).find((item) => item.id === tableId);
     if (!table) return;
     table.status = newStatus;
     if (newStatus === 'libre') {
       table.customer = '';
       table.waiter = '';
     }
     saveState();
     renderTables();
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
    const items = (order.items || []).map((item) => `${item.name} x ${item.qty}`).join(', ');
    return `
      <div class="order-card">
        <div class="order-meta">
          <strong>Orden #${order.id}</strong>
          <span class="status-pill ${order.status}">${order.status}</span>
        </div>
        <p><b>Mesa:</b> ${order.table_number || 'Mostrador'}</p>
        <p><b>Mesero:</b> ${order.employee_name || 'Sin asignar'}</p>
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
    const items = (order.items || []).map((item) => `${item.name} x ${item.qty}`).join(', ');
    return `
      <div class="order-card" id="kitchen-order-${order.id}">
        <div class="order-meta">
          <strong>Orden #${order.id}</strong>
          <span class="status-pill ${order.status}">${order.status}</span>
        </div>
        <p><b>Mesa:</b> ${order.table_number || 'Mostrador'}</p>
        <p><b>Cliente:</b> ${order.customer_name || 'Cliente'}</p>
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
    const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
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

  const assignedTable = reserveTableForOrder('', customerName);
  const tableNumber = assignedTable ? assignedTable.name : 'Mostrador';

  try {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        employeeName: currentEmployee.name,
        tableNumber,
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
    await fetchOrdersFromServer();
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
  select.innerHTML = state.employees
    .map((employee) => `<option value="${employee.id}">${employee.name} - ${employee.role}</option>`)
    .join('');
}

async function loadCustomers() {
  try {
    const res = await fetch(`${API_BASE}/customers`, { headers: getAuthHeaders(null) });
    if (!res.ok) return;
    const data = await res.json();
    const customers = data.customers || [];
    const select = document.getElementById('customer-select');
    if (!select) return;
    select.innerHTML = '<option value="">Cliente general / consumidor final</option>' + customers.map((customer) => `<option value="${customer.id}">${customer.full_name} - ${customer.nit || 'Sin NIT'}</option>`).join('');
  } catch (error) {
    console.warn('No se pudieron cargar clientes:', error.message);
  }
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
    customerNit: customerType === 'credito_fiscal' ? (customerNit || 'CF') : 'CF',
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
    const res = await fetch(url, {
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
      await loadCustomers();
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

  const customerName = (document.getElementById('billing-customer-name')?.value || '').trim() || 'Cliente';
  const reservedTable = reserveTableForOrder('', customerName);
  if (reservedTable) {
    document.getElementById('billing-customer-name') && (document.getElementById('billing-customer-name').value = customerName);
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
  const itemsHtml = (order.items || []).map((item) => `<tr><td>${item.name}</td><td>x${item.qty}</td></tr>`).join('');
  const content = `
    <h2>Orden de cocina</h2>
    <p><strong>Mesa:</strong> ${order.tableNumber || 'Mostrador'}</p>
    <p><strong>Cliente:</strong> ${order.customerName || 'Cliente'}</p>
    <p><strong>Empleado:</strong> ${order.employeeName || 'Sistema'}</p>
    <table><thead><tr><th>Producto</th><th>Cant.</th></tr></thead><tbody>${itemsHtml || '<tr><td colspan="2">Sin productos</td></tr>'}</tbody></table>
    ${order.notes ? `<p><strong>Nota:</strong> ${order.notes}</p>` : ''}
    <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
  `;
  printWindow(content, 'Orden de cocina');
}

function openKitchenDisplay() {
 const popup = window.open('kitchen-display.html?type=kitchen', 'kitchenDisplay', 'width=1400,height=900,noopener');
 if (popup) popup.focus();
}

function openCustomerDisplay() {
 const popup = window.open('customer-display.html?type=customer', 'customerDisplay', 'width=1100,height=760,noopener');
 if (popup) popup.focus();
}

function renderNav() {
  const nav = document.getElementById('nav-menu');
  const visibleSections = {
    admin: ['pos', 'tables', 'orders', 'kitchen', 'inventory', 'cash', 'reports', 'users', 'settings'],
    cajero: ['pos', 'tables', 'orders', 'cash'],
    mesero: ['pos', 'tables', 'orders', 'kitchen'],
    cocina: ['kitchen'],
    gerente: ['pos', 'tables', 'orders', 'kitchen', 'reports', 'cash', 'users'],
    contador: ['reports', 'cash']
  };

  const modules = [
    { id: 'pos', label: 'Venta' },
    { id: 'tables', label: 'Mesas' },
    { id: 'orders', label: 'Órdenes' },
    { id: 'kitchen', label: 'Cocina' },
    { id: 'inventory', label: 'Inventario' },
    { id: 'cash', label: 'Caja' },
    { id: 'reports', label: 'Reportes' },
    { id: 'users', label: 'Usuarios' },
    { id: 'settings', label: 'Configuración' }
  ];

  const roles = currentEmployee ? visibleSections[currentEmployee.role] || [] : [];

  nav.innerHTML = modules
    .filter((module) => roles.includes(module.id))
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

function reserveTableForOrder(tableName, customerName) {
  const normalizedName = String(tableName || '').trim();
  const matchingTable = (state.tables || []).find((table) => {
    if (normalizedName) {
      return table.name === normalizedName || String(table.id) === normalizedName || table.id === Number(normalizedName);
    }
    return table.status === 'libre';
  }) || getAvailableTableForOrder(normalizedName || 'Mesa 1');

  if (!matchingTable) return null;

  matchingTable.status = 'pedido';
  if (customerName) matchingTable.customer = customerName;
  saveState();
  renderTables();
  return matchingTable;
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
  activeModule = moduleId;

  document.querySelectorAll('.module').forEach((module) => {
    module.classList.toggle('hidden', module.id !== `module-${moduleId}`);
    module.classList.toggle('active', module.id === `module-${moduleId}`);
  });

  renderNav();
  if (moduleId === 'cash') renderCashPanel();
  if (moduleId === 'reports') renderReports();
  if (moduleId === 'pos') renderDashboardSummary();
}

async function loginUser() {
  const employeeId = Number(document.getElementById('employee-select').value);
  const pin = document.getElementById('pin-input').value;
  const errorText = document.getElementById('login-error');

  // Try server auth first
  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ id: employeeId, pin })
    });
    if (res && res.ok) {
      const data = await res.json();
      currentEmployee = { id: data.user.id, name: data.user.name, role: data.user.role };
      if (data.token) localStorage.setItem('pos_token', data.token);
    }
  } catch (err) {
    // ignore server error, fallback to local
  }

  if (!currentEmployee) {
    const employee = state.employees.find((item) => item.id === employeeId && item.pin === String(pin).trim());
    if (!employee) {
      errorText.classList.remove('hidden');
      return;
    }
    currentEmployee = employee;
  }

  errorText.classList.add('hidden');
  document.getElementById('pin-input').value = '';

  const adminHero = document.getElementById('admin-hero');
  if (adminHero) adminHero.classList.toggle('hidden', !canAccessExecutivePanel());

  updateHeader();
  renderNav();
  renderProducts();
  renderInventory();
  renderCashPanel();
  renderReports();
  renderDashboardSummary();
  const defaultModule = currentEmployee.role === 'cocina' ? 'kitchen' : currentEmployee.role === 'mesero' ? 'tables' : 'pos';
  setActiveModule(defaultModule);
  showApp();
  await loadCustomers();
  await loadCompanySettings();
  saveState();
  // start realtime SSE stream for orders after login
  if (typeof initOrderEventStream === 'function') initOrderEventStream();
}

function logoutUser() {
  currentEmployee = null;
  cart = [];
  localStorage.removeItem('pos_token');
  updateHeader();
  renderCart();
  showLogin();
  saveState();
}

function renderCategoryFilter() {
  const filter = document.getElementById('category-filter');
  const categories = [...new Set(state.products.map((product) => product.category))];

  filter.innerHTML = '<option value="all">Todas</option>' + categories.map((category) => `
    <option value="${category}">${category}</option>
  `).join('');
}

function renderProducts() {
  const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
  const selectedCategory = document.getElementById('category-filter').value;

  const filteredProducts = state.products.filter((product) => {
    const matchesText = product.name.toLowerCase().includes(searchTerm);
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
      <div class="product-tag">${product.category}</div>
      <h4>${product.name}</h4>
      <p class="product-price">${currency(product.price)}</p>
      <small>Stock: ${product.stock}</small>
      <button type="button" class="small primary-btn add-item-btn" data-product-id="${product.id}">Agregar</button>
    </article>
  `).join('');

  document.querySelectorAll('.add-item-btn').forEach((button) => {
    button.addEventListener('click', () => addToCart(Number(button.dataset.productId)));
  });
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);

  if (!product) return;
  if (product.stock <= 0) {
    alert('El producto está agotado.');
    return;
  }

  const existingItem = cart.find((item) => item.id === productId);

  if (existingItem) {
    if (existingItem.qty >= product.stock) {
      alert('No hay más stock disponible para este producto.');
      return;
    }
    existingItem.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1,
      stock: product.stock
    });
  }

  renderCart();
}

function getCartTotals() {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = 0;
  const tax = subtotal * 0.13;
  const total = subtotal + tax - discount;

  return { subtotal, discount, tax, total };
}

function renderCart() {
  const cartList = document.getElementById('cart-list');

  if (cart.length === 0) {
    cartList.innerHTML = '<li class="empty-state cart-empty">El carrito está vacío.</li>';
  } else {
    cartList.innerHTML = cart.map((item, index) => `
      <li class="cart-item">
        <div class="cart-details">
          <strong>${item.name}</strong>
          <span>${currency(item.price)} c/u</span>
        </div>
        <div class="cart-controls">
          <button type="button" class="qty-btn" data-action="decrease" data-index="${index}">−</button>
          <span>${item.qty}</span>
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

  const totals = getCartTotals();
  document.getElementById('subtotal-value').textContent = totals.subtotal.toFixed(2);
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
  const item = cart[index];
  if (!item) return;

  if (action === 'increase') {
    const product = state.products.find((entry) => entry.id === item.id);
    if (product && item.qty >= product.stock) {
      alert('Stock insuficiente');
      return;
    }
    item.qty += 1;
  }

  if (action === 'decrease') {
    item.qty -= 1;
    if (item.qty <= 0) cart.splice(index, 1);
  }

  renderCart();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  renderCart();
}

function clearCart() {
  cart = [];
  const cashReceived = document.getElementById('billing-cash-received') || document.getElementById('cash-received');
  if (cashReceived) cashReceived.value = '';
  renderCart();
}

function processSale() {
  if (!currentEmployee) {
    alert('Debe iniciar sesión.');
    return;
  }

  if (!state.shift.isOpen) {
    alert('Debe abrir el turno de caja antes de vender.');
    return;
  }

  if (cart.length === 0) {
    alert('No hay productos en el carrito.');
    return;
  }

  const totals = getCartTotals();
  const paymentMethod = document.getElementById('billing-payment-method')?.value || document.getElementById('payment-method')?.value || 'efectivo';
  const receivedAmount = Number((document.getElementById('billing-cash-received')?.value || document.getElementById('cash-received')?.value || 0));
  const customerData = getCustomerPayloadFromForm();

  if (paymentMethod === 'efectivo' && receivedAmount < totals.total) {
    alert('El monto recibido debe ser mayor o igual al total de la venta.');
    return;
  }

  const salePayload = {
    employeeName: currentEmployee.name,
    paymentMethod,
    total: Number(totals.total.toFixed(2)),
    subtotal: Number(totals.subtotal.toFixed(2)),
    tax: Number(totals.tax.toFixed(2)),
    items: cart.map((item) => ({ id: item.id, name: item.name, price: item.price, qty: item.qty })),
    createdAt: new Date().toISOString(),
    receivedAmount: paymentMethod === 'efectivo' ? receivedAmount : totals.total,
    change: paymentMethod === 'efectivo' ? Number((receivedAmount - totals.total).toFixed(2)) : 0,
    customerEmail: customerData.customerEmail,
    customerName: customerData.customerName,
    customerNit: customerData.customerNit,
    customerPhone: customerData.customerPhone,
    customerAddress: customerData.customerAddress,
    customerId: customerData.customerId,
    customer: customerData.customer,
    tipo_receptor: customerData.tipo_receptor,
    documentType: customerData.documentType,
    sandbox: (state.companySettings && state.companySettings.hacienda_mode === 'sandbox') || true
  };

  fetch(`${API_BASE}/sales`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(salePayload)
  })
    .then((res) => {
      if (!res.ok) throw new Error('server error');
      return res.json();
    })
    .then(async (data) => {
      if (data && data.sale) {
        const saved = data.sale;
        saved.items.forEach((it) => {
          const product = state.products.find((p) => p.id === it.product_id || p.id === it.id);
          if (product) product.stock = Math.max(0, product.stock - it.qty);
        });

        state.sales.unshift({
          id: saved.id,
          employeeName: saved.employee_name,
          paymentMethod: saved.payment_method,
          total: Number(saved.total),
          subtotal: Number(saved.subtotal),
          tax: Number(saved.tax),
          items: saved.items.map((it) => ({ id: it.product_id || it.id, name: it.name, price: it.price, qty: it.qty })),
          createdAt: saved.created_at,
          receivedAmount: saved.received_amount,
          change: saved.change_amount
        });

        if (paymentMethod === 'efectivo') {
          state.shift.cashSales += Number(saved.total);
          state.shift.currentCash += Number(saved.total);
        }
        if (paymentMethod === 'tarjeta') state.shift.cardSales += Number(saved.total);
        if (paymentMethod === 'transferencia') state.shift.transferSales += Number(saved.total);

        saveState();
        renderProducts();
        renderInventory();
        renderCashPanel();
        renderReports();
        clearCart();

        if (customerData.customerEmail) {
          try {
            await fetch(`${API_BASE}/invoices/${saved.id}/email`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ customerEmail: customerData.customerEmail })
            });
          } catch (error) {
            console.warn('No se pudo enviar correo de factura:', error.message);
          }
        }

        const pdfUrl = `${API_BASE}/invoices/${saved.id}/pdf`;
        const printFrame = window.open(pdfUrl, '_blank');
        if (printFrame) {
          printFrame.focus();
          setTimeout(() => {
            try {
              printFrame.print();
            } catch (error) {
              console.warn('No se pudo imprimir la factura automáticamente:', error.message);
            }
          }, 600);
        }

        alert(`Venta registrada y sincronizada. Total cobrado: ${currency(saved.total)}. Factura: ${data.invoiceNumber || ''}`);
      } else {
        throw new Error('Respuesta incorrecta del servidor');
      }
    })
    .catch((err) => {
      const sale = {
        id: Date.now(),
        employeeName: currentEmployee.name,
        paymentMethod,
        total: Number(totals.total.toFixed(2)),
        subtotal: Number(totals.subtotal.toFixed(2)),
        tax: Number(totals.tax.toFixed(2)),
        items: cart.map((item) => ({ ...item })),
        createdAt: new Date().toISOString(),
        receivedAmount: paymentMethod === 'efectivo' ? receivedAmount : totals.total,
        change: paymentMethod === 'efectivo' ? Number((receivedAmount - totals.total).toFixed(2)) : 0
      };

      state.sales.unshift(sale);
      cart.forEach((item) => {
        const product = state.products.find((entry) => entry.id === item.id);
        if (!product) return;
        product.stock = Math.max(0, product.stock - item.qty);
      });

      if (paymentMethod === 'efectivo') {
        state.shift.cashSales += sale.total;
        state.shift.currentCash += sale.total;
      }
      if (paymentMethod === 'tarjeta') state.shift.cardSales += sale.total;
      if (paymentMethod === 'transferencia') state.shift.transferSales += sale.total;

      saveState();
      renderProducts();
      renderInventory();
      renderCashPanel();
      renderReports();
      clearCart();

      alert(`Venta registrada (local). Total cobrado: ${currency(sale.total)}`);
    });
}

async function performTestSale() {
  if (!currentEmployee) {
    alert('Debe iniciar sesión para realizar la venta de prueba.');
    return;
  }

  if (!state.shift.isOpen) {
    const ok = confirm('No hay turno abierto. ¿Deseas abrir la caja con $0 para la prueba?');
    if (!ok) return;
    openShift();
  }

  const product = state.products.length > 0 ? state.products[0] : { id: Date.now(), name: 'Producto prueba', price: 1.0, stock: 100 };
  const qty = 1;
  const subtotal = Number((product.price * qty).toFixed(2));
  const tax = Number((subtotal * 0.13).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));

  const payload = {
    employeeName: currentEmployee.name,
    paymentMethod: 'efectivo',
    subtotal,
    tax,
    total,
    items: [{ id: product.id, name: product.name, price: product.price, qty }],
    createdAt: new Date().toISOString(),
    receivedAmount: total,
    change: 0
  };

  try {
    const res = await fetch(API_BASE + '/sales', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('No se pudo sincronizar con el servidor');
    const data = await res.json();

    if (data && data.sale) {
      const saved = data.sale;
      // actualizar stock local
      saved.items.forEach((it) => {
        const pid = it.product_id || it.id;
        const p = state.products.find((x) => x.id === pid);
        if (p) p.stock = Math.max(0, p.stock - it.qty);
      });

      state.sales.unshift({
        id: saved.id,
        employeeName: saved.employee_name,
        paymentMethod: saved.payment_method,
        total: Number(saved.total),
        subtotal: Number(saved.subtotal),
        tax: Number(saved.tax),
        items: saved.items.map((it) => ({ id: it.product_id || it.id, name: it.name, price: it.price, qty: it.qty })),
        createdAt: saved.created_at,
        receivedAmount: saved.received_amount,
        change: saved.change_amount
      });

      if (payload.paymentMethod === 'efectivo') {
        state.shift.cashSales += Number(saved.total);
        state.shift.currentCash += Number(saved.total);
      }

      saveState();
      renderProducts();
      renderInventory();
      renderCashPanel();
      renderReports();

      alert(`Venta de prueba sincronizada. Total: ${currency(saved.total)}. Factura: ${data.invoiceNumber || ''}`);
      if (data.sale && data.sale.id) {
        window.open(API_BASE + '/invoices/' + data.sale.id + '/pdf', '_blank');
      }
      return;
    }

    throw new Error('Respuesta inválida del servidor');
  } catch (err) {
    // fallback local
    const localSale = {
      id: Date.now(),
      employeeName: currentEmployee.name,
      paymentMethod: 'efectivo',
      total,
      subtotal,
      tax,
      items: [{ id: product.id, name: product.name, price: product.price, qty }],
      createdAt: new Date().toISOString(),
      receivedAmount: total,
      change: 0
    };

    state.sales.unshift(localSale);
    const pLocal = state.products.find((x) => x.id === product.id);
    if (pLocal) pLocal.stock = Math.max(0, pLocal.stock - qty);
    state.shift.cashSales += localSale.total;
    state.shift.currentCash += localSale.total;

    saveState();
    renderProducts();
    renderInventory();
    renderCashPanel();
    renderReports();

    alert('Venta de prueba registrada en modo local (offline).');
  }
}

function renderInventory() {
  const tableBody = document.getElementById('inventory-table-body');

  tableBody.innerHTML = state.products.map((product) => `
    <tr>
      <td>${product.name}</td>
      <td>${product.category}</td>
      <td>${currency(product.price)}</td>
      <td>${product.stock}</td>
      <td>
        <button class="ghost-btn small edit-product-btn" data-id="${product.id}">Editar</button>
        <button class="danger-btn small delete-product-btn" data-id="${product.id}">Eliminar</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.edit-product-btn').forEach((button) => {
    button.addEventListener('click', () => openProductForm(Number(button.dataset.id)));
  });

  document.querySelectorAll('.delete-product-btn').forEach((button) => {
    button.addEventListener('click', () => deleteProduct(Number(button.dataset.id)));
  });
}

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
    formTitle.textContent = 'Editar producto';
  } else {
    document.getElementById('product-id').value = '';
    formTitle.textContent = 'Agregar producto';
  }
}

function closeProductForm() {
  document.getElementById('product-form-panel').classList.add('hidden');
  document.getElementById('product-form').reset();
}

function deleteProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  const confirmed = window.confirm(`¿Deseas eliminar ${product.name}?`);
  if (!confirmed) return;

  state.products = state.products.filter((item) => item.id !== productId);
  saveState();
  renderProducts();
  renderInventory();
  renderCategoryFilter();
}

function handleProductSubmit(event) {
  event.preventDefault();

  const id = document.getElementById('product-id').value ? Number(document.getElementById('product-id').value) : Date.now();
  const product = {
    id,
    name: document.getElementById('product-name').value.trim(),
    category: document.getElementById('product-category').value.trim(),
    price: Number(document.getElementById('product-price').value),
    stock: Number(document.getElementById('product-stock').value)
  };

  if (!product.name || !product.category || Number.isNaN(product.price) || Number.isNaN(product.stock)) {
    alert('Completa todos los campos antes de guardar.');
    return;
  }

  const existingIndex = state.products.findIndex((item) => item.id === id);

  if (existingIndex >= 0) {
    state.products[existingIndex] = product;
  } else {
    state.products.push(product);
  }

  saveState();
  renderProducts();
  renderInventory();
  renderCategoryFilter();
  closeProductForm();
}

function openShift() {
  const openingCash = Number(prompt('Ingrese el efectivo inicial de caja:', '0') || 0);
  if (Number.isNaN(openingCash) || openingCash < 0) {
    alert('Monto inválido.');
    return;
  }

  state.shift = {
    isOpen: true,
    openingCash,
    currentCash: openingCash,
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    openedAt: new Date().toISOString(),
    closedAt: null,
    observedCash: 0,
    note: ''
  };

  saveState();
  renderCashPanel();
  updateHeader();
}

function closeShift() {
  const observedCash = Number(prompt('Ingrese el efectivo contado al cerrar turno:', '0') || 0);
  if (Number.isNaN(observedCash) || observedCash < 0) {
    alert('Monto inválido.');
    return;
  }

  state.shift.isOpen = false;
  state.shift.closedAt = new Date().toISOString();
  state.shift.observedCash = observedCash;
  state.shift.note = `Cierre del día. Dinero observado: ${currency(observedCash)}`;

  saveState();
  renderCashPanel();
  updateHeader();
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
  const tableBody = document.getElementById('sales-table-body');
  const reportCards = document.getElementById('report-cards');

  const totalSales = state.sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalCount = state.sales.length;
  const totalUnits = state.sales.reduce((sum, sale) => sum + sale.items.reduce((acc, item) => acc + item.qty, 0), 0);
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
                ${state.products.map((product) => `<option value="${product.id}">${product.name}</option>`).join('') || '<option value="">Sin productos</option>'}
              </select>
              <input id="inventory-check-date" type="date" />
              <input id="inventory-check-expected" type="number" placeholder="Esperado" />
              <input id="inventory-check-counted" type="number" placeholder="Contado" />
              <textarea id="inventory-check-notes" placeholder="Notas"></textarea>
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
          <span>Modo</span>
          <strong>${(state.companySettings && state.companySettings.hacienda_mode) || 'sandbox'}</strong>
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

  tableBody.innerHTML = state.sales.length === 0
    ? '<tr><td colspan="4" class="empty-state">No hay ventas registradas.</td></tr>'
    : state.sales.map((sale) => `
        <tr>
          <td>${new Date(sale.createdAt).toLocaleString()}</td>
          <td>${sale.employeeName}</td>
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
        const res = await fetch(`${API_BASE}/products`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('No se pudo guardar el producto');
        const data = await res.json();
        const product = data.product || { ...payload, id: Date.now() };
        const exists = state.products.some((item) => item.id === product.id);
        if (!exists) state.products.push({
          id: product.id,
          name: product.name,
          category: product.category || payload.category,
          price: Number(product.price || payload.price),
          stock: Number(product.stock || payload.stock)
        });
        saveState();
        renderProducts();
        renderInventory();
        renderCategoryFilter();
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
        const res = await fetch(`${API_BASE}/purchases`, {
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
        const res = await fetch(`${API_BASE}/expenses`, {
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
    inventoryCheckForm.onsubmit = async (event) => {
      event.preventDefault();
      const productId = document.getElementById('inventory-check-product').value;
      const payload = {
        product_id: Number(productId),
        fecha: document.getElementById('inventory-check-date').value || new Date().toISOString().slice(0, 10),
        expected_qty: Number(document.getElementById('inventory-check-expected').value || 0),
        counted_qty: Number(document.getElementById('inventory-check-counted').value || 0),
        notes: document.getElementById('inventory-check-notes').value
      };
      try {
        const res = await fetch(`${API_BASE}/inventory/check`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('No se pudo guardar el conteo');
        inventoryCheckForm.reset();
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
    const res = await fetch(`${API_BASE}/admin/monthly-summary?month=${encodeURIComponent(month)}`, {
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

    const vatRes = await fetch(`${API_BASE}/vat-book?start=${encodeURIComponent(`${month}-01`)}&end=${encodeURIComponent(`${month}-31`)}`, {
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
    const res = await fetch(`${API_BASE}/admin/close-month`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ year, month: mon, notes: `Cierre del mes ${month}` })
    });
    if (!res.ok) throw new Error('No se pudo cerrar el mes');
    const data = await res.json();
    alert(`Mes cerrado correctamente. ID: ${data.closure.id}`);
    refreshMonthSummary();
  } catch (error) {
    alert(error.message);
  }
}

async function downloadReportPdf(type, params = {}) {
  try {
    const query = new URLSearchParams(params);
    const res = await fetch(`${API_BASE}/reports/${type}/pdf?${query.toString()}`, {
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
    const url = `${API_BASE}/reports/sales/export?format=${format}`;
    const res = await fetch(url, { headers: getAuthHeaders(null) });
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
  try {
    const res = await fetch(API_BASE + '/users', { headers: getAuthHeaders(null) });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.users) {
      const localById = Object.fromEntries(state.employees.map((e) => [e.id, e]));
      state.employees = data.users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        // keep local PIN if exists, server doesn't return pins for security
        pin: localById[u.id] ? localById[u.id].pin : '0000'
      }));
      saveState();
      renderEmployeeOptions();
      renderUsers();
    }
  } catch (err) {
    // ignore network errors, keep local users
    console.warn('No se pudo sincronizar usuarios:', err.message);
  }
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
        <td>${u.name}</td>
        <td>${u.role}</td>
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
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-role-input').value = user.role;
    document.getElementById('user-pin').value = user.pin || '';
  }
}

function closeUserForm() {
  const panel = document.getElementById('user-form-panel');
  panel.classList.add('hidden');
  document.getElementById('user-form').reset();
}

async function handleUserSubmit(event) {
  event.preventDefault();
if (!canManageUserAccounts()) {
  alert('Solo los administradores o gerentes pueden gestionar usuarios.');
  return;
}

const id = document.getElementById('user-id').value ? Number(document.getElementById('user-id').value) : null;
const name = document.getElementById('user-name').value.trim();
const role = document.getElementById('user-role-input').value;
const pin = document.getElementById('user-pin').value.trim();

if (!name || !role || !pin) {
  alert('Completa todos los campos.');
  return;
}

const payload = { name, role, pin };

  try {
    let res;
    // build headers and attach executive PIN if required by server
    const headers = getAuthHeaders();
    try {
      if (window.state && window.state.companySettings && window.state.companySettings.executive_pin_set) {
        const execPin = prompt('Introduce PIN ejecutivo para confirmar la acción:');
        if (!execPin) { alert('Acción cancelada. Se requiere PIN ejecutivo.'); return; }
        headers['x-exec-pin'] = execPin;
      }
    } catch (e) {}

    if (id) {
      res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    }

    if (res && res.ok) {
      const data = await res.json();
      const user = data.user;
      if (id) {
        const idx = state.employees.findIndex((u) => u.id === id);
        if (idx >= 0) state.employees[idx] = { id: user.id, name: user.name, role: user.role, pin };
      } else {
        state.employees.push({ id: user.id, name: user.name, role: user.role, pin });
      }
    } else {
      // fallback local-only
      if (id) {
        const idx = state.employees.findIndex((u) => u.id === id);
        if (idx >= 0) state.employees[idx] = { id, name, role, pin };
      } else {
        const newId = Date.now();
        state.employees.push({ id: newId, name, role, pin });
      }
    }
  } catch (err) {
    // local fallback
    if (id) {
      const idx = state.employees.findIndex((u) => u.id === id);
      if (idx >= 0) state.employees[idx] = { id, name, role, pin };
    } else {
      const newId = Date.now();
      state.employees.push({ id: newId, name, role, pin });
    }
  }

  saveState();
  renderEmployeeOptions();
  renderUsers();
  closeUserForm();
}

async function deleteUser(userId) {
  if (!canManageUserAccounts()) {
    alert('Solo los administradores o gerentes pueden eliminar cuentas.');
    return;
  }
  if (!confirm('¿Eliminar usuario?')) return;
  try {
    const headers = getAuthHeaders(null);
    try {
      if (window.state && window.state.companySettings && window.state.companySettings.executive_pin_set) {
        const execPin = prompt('Introduce PIN ejecutivo para confirmar la eliminación:');
        if (!execPin) { alert('Acción cancelada. Se requiere PIN ejecutivo.'); return; }
        headers['x-exec-pin'] = execPin;
      }
    } catch (e) {}

    const res = await fetch(`${API_BASE}/users/${userId}`, { method: 'DELETE', headers });
    if (res && res.ok) {
      state.employees = state.employees.filter((u) => u.id !== userId);
    } else {
      state.employees = state.employees.filter((u) => u.id !== userId);
    }
  } catch (err) {
    state.employees = state.employees.filter((u) => u.id !== userId);
  }
  saveState();
  renderEmployeeOptions();
  renderUsers();
}

function fillCompanySettingsForm(settings = {}) {
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
  event.preventDefault();
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

  const logoInput = document.getElementById('setting-company_logo');
  if (logoInput && logoInput.files && logoInput.files[0]) {
    const file = logoInput.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      payload.company_logo = reader.result;
      // include executive pin hash if set in state
      if (window.state && window.state.companySettings && window.state.companySettings.executive_pin_hash) {
        payload.executive_pin_hash = window.state.companySettings.executive_pin_hash;
      }
      await persistCompanySettings(payload);
    };
    reader.readAsDataURL(file);
    return;
  }

  // include executive pin hash if set in state
  if (window.state && window.state.companySettings && window.state.companySettings.executive_pin_hash) {
    payload.executive_pin_hash = window.state.companySettings.executive_pin_hash;
  }

  await persistCompanySettings(payload);
}


async function persistCompanySettings(payload) {
  try {
    // Prepare headers and, if executive PIN is configured on the server, prompt for PIN to include
    const headers = getAuthHeaders();

    try {
      if (window.state && window.state.companySettings && window.state.companySettings.executive_pin_hash && window.state.companySettings.executive_pin_set) {
        const pin = prompt('Introduce PIN ejecutivo para confirmar cambios:');
        if (!pin) { alert('Se requiere PIN ejecutivo para confirmar los cambios.'); return; }
        headers['x-exec-pin'] = pin;
      }
    } catch (e) { /* non-blocking */ }

    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo guardar la configuración');
    }

    const data = await res.json();
    state.companySettings = data.settings || payload;
    applyCompanySettings(state.companySettings);
    // Store server base in localStorage so webview / Android wrapper uses it
    try {
      if (state.companySettings.server_base) {
        localStorage.setItem('pos_api_base', state.companySettings.server_base);
      }
    } catch (e) {
      console.warn('No se pudo guardar pos_api_base en localStorage:', e.message);
    }
    saveState();
    alert('Configuración guardada correctamente.');
  } catch (error) {
    alert(error.message || 'Error guardando la configuración.');
  }
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
    if (window.state && window.state.companySettings && window.state.companySettings.executive_pin_set) {
      const pin = prompt('Introduce PIN ejecutivo para confirmar la activación:');
      if (!pin) { alert('Acción cancelada. PIN requerido.'); return; }
      headers['x-exec-pin'] = pin;
    }
  } catch (e) { }

  try {
    const res = await fetch(`${API_BASE}/admin/activate-business`, { method: 'POST', headers });
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
  if (loginBtn) loginBtn.addEventListener('click', loginUser);
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
        const res = await fetch(`${API_BASE}/customers/${customerId}`, { headers: getAuthHeaders(null) });
        if (!res.ok) return;
        const data = await res.json();
        const customer = data.customer || {};
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

  bindCompanySettingsForm();

  const pinInputEl = document.getElementById('pin-input');
  if (pinInputEl) {
    pinInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') loginUser();
    });
  }

  loadCompanySettings();
  fetchUsersFromServer();
  loadCustomers();
  fetchOrdersFromServer();

  showLogin();
}

initializeApp();
