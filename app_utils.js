function getSavedApiBase() {
  const saved = localStorage.getItem('pos_api_base');
  const fallback = /^https?:$/.test(location.protocol) ? location.origin : 'http://localhost:3000';
  try {
    const url = new URL(saved || fallback);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('URL inválida');
    return url.href.replace(/\/$/, '');
  } catch (_) { return fallback; }
}
function getApiUrl(path = '') { return `${getSavedApiBase()}/api${path.startsWith('/') ? path : '/' + path}`; }
function getAuthHeaders(contentType = 'application/json') {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  const token = sessionStorage.getItem('pos_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
async function posFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...options, credentials:'include', signal:options.signal || controller.signal,
    headers: { ...getAuthHeaders(null), ...options.headers } }); }
  finally { clearTimeout(timer); }
}
async function apiRequest(path, options = {}) {
  const response = await posFetch(getApiUrl(path), { ...options, headers:{...getAuthHeaders(), ...options.headers} });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Error del servidor (${response.status})`), { status:response.status });
  return data;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function executiveHeaders() {
  const headers=getAuthHeaders();
  if (typeof state !== 'undefined' && state.companySettings?.executive_pin_set) {
    const pin=prompt('Introduce el PIN ejecutivo para confirmar:');
    if (!pin) throw new Error('Operación cancelada.');
    headers['x-exec-pin']=pin;
  }
  return headers;
}
async function testServerConnection() {
  const value=document.getElementById('setting-server_base')?.value.trim() || getSavedApiBase();
  try {
    const url=new URL(value);
    if (!['http:','https:'].includes(url.protocol)) throw new Error('Usa una URL HTTP o HTTPS');
    const response=await fetch(url.href.replace(/\/$/,'')+'/api/health', {signal:AbortSignal.timeout(8000)});
    const data=await response.json();
    if (!response.ok || data.service!=='pos-control' || !data.ready) throw new Error('El servidor POS no está disponible');
    alert('Conexión correcta.');
  } catch(error) { alert(error.message); }
}

function newRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues also works on local HTTP networks without a secure context.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
}
