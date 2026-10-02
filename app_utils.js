// Small helper utilities for POS app
function getSavedApiBase() {
  const local = localStorage.getItem('pos_api_base');
  if (local && local.trim()) return local.trim();
  try {
    // fallback to company settings stored in state
    if (window && window.state && window.state.companySettings && window.state.companySettings.server_base) return window.state.companySettings.server_base;
  } catch (e) {}
  return 'http://localhost:3000';
}

function getApiUrl(path) {
  const base = getSavedApiBase();
  return `${base.replace(/\/$/, '')}/api${path ? (path.startsWith('/') ? path : '/' + path) : ''}`;
}
