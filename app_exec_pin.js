// Executive panel PIN lock helper
// This script augments the existing canAccessExecutivePanel flow by adding an optional PIN prompt.
// Behavior:
// - Uses companySettings.executive_pin_hash (SHA-256 hex) as the stored PIN verification value.
// - Provides setExecutivePinFromForm() that reads #setting-executive_pin field if present and saves a hash to companySettings via saveCompanySettings()
// - Overrides window.canAccessExecutivePanel (if present) to prompt for PIN when opening the executive panel.
// - If no executive_pin_hash is set, the first time an admin opens the panel it will ask to set one (optional).

(function () {
  if (!window) return;

  // compute SHA-256 hex of a string using Web Crypto API
  async function sha256Hex(str) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function getStoredPinHash() {
    try {
      if (window.state && window.state.companySettings && window.state.companySettings.executive_pin_hash) {
        return window.state.companySettings.executive_pin_hash;
      }
      const local = localStorage.getItem('executive_pin_hash');
      if (local) return local;
    } catch (e) { console.warn('getStoredPinHash error', e); }
    return null;
  }

  async function storePinHash(hash) {
    try {
      // Save to state.companySettings if possible and persist via saveCompanySettings endpoint if available
      if (!window.state) window.state = {};
      if (!window.state.companySettings) window.state.companySettings = {};
      window.state.companySettings.executive_pin_hash = hash;
      // also write to localStorage as a fallback
      localStorage.setItem('executive_pin_hash', hash);

      // If there's a persist function for settings, call it to save on server
      if (typeof saveCompanySettings === 'function') {
        // Try to call the existing save handler after updating the DOM field if present
        const input = document.getElementById('setting-executive_pin');
        if (input) {
          // clear the input for security
          input.value = '';
        }
        try { await saveCompanySettings(); } catch (e) { /* non-blocking */ }
      }
    } catch (e) { console.warn('storePinHash error', e); }
  }

  async function promptForPinAndVerify(existingHash) {
    const pin = prompt('Acceso ejecutivo: introduce el PIN');
    if (!pin) return false;
    const h = await sha256Hex(pin);
    return h === existingHash;
  }

  // If canAccessExecutivePanel exists, wrap it. Otherwise create a helper function.
  const originalCanAccess = (typeof window.canAccessExecutivePanel === 'function') ? window.canAccessExecutivePanel : null;

  window.canAccessExecutivePanel = async function wrappedCanAccessExecutivePanel() {
    // First check existing logic (roles/permissions)
    try {
      if (originalCanAccess) {
        const ok = await originalCanAccess();
        if (!ok) return false; // insufficient role
      }
    } catch (e) {
      // ignore and continue to PIN check
    }

    const stored = await getStoredPinHash();
    if (!stored) {
      // ask to set one (only if user is admin/manager)
      const setNow = confirm('No existe PIN ejecutivo. ¿Deseas establecer un PIN ahora? (Se solicitará cada vez que se acceda)');
      if (!setNow) return true; // default to allow access if user cancels setting a PIN
      const newPin = prompt('Introduce nuevo PIN ejecutivo (4-8 dígitos recomienda)');
      if (!newPin) return true; // allow if user cancels
      const confirmPin = prompt('Confirma el nuevo PIN');
      if (!confirmPin || newPin !== confirmPin) { alert('PIN no confirmado. Acceso no configurado.'); return false; }
      const h = await sha256Hex(newPin);
      await storePinHash(h);
      alert('PIN ejecutivo establecido. Se requerirá para accesos futuros.');
      return true;
    }

    // verify provided PIN
    const passed = await promptForPinAndVerify(stored);
    if (passed) return true;
    alert('PIN incorrecto. Acceso denegado.');
    return false;
  };

  // Expose helper to set PIN from a form field (if you added one to settings UI)
  window.setExecutivePinFromForm = async function setExecutivePinFromForm() {
    try {
      const input = document.getElementById('setting-executive_pin');
      if (!input) { alert('Campo de PIN no encontrado en el formulario de ajustes.'); return; }
      const value = input.value && input.value.trim();
      if (!value) { alert('Introduce un PIN válido.'); return; }
      const confirmField = document.getElementById('setting-executive_pin_confirm');
      if (confirmField && confirmField.value !== value) { alert('PIN y confirmación no coinciden'); return; }
      const h = await sha256Hex(value);
      await storePinHash(h);
      // Clear fields after storing
      input.value = '';
      if (confirmField) confirmField.value = '';
      alert('PIN ejecutivo guardado.');
    } catch (e) {
      console.error('Error guardando PIN ejecutivo', e);
      alert('No se pudo guardar el PIN ejecutivo.');
    }
  };

  // Try to wire a button if present to set the PIN quickly
  try {
    const savePinBtn = document.getElementById('save-executive-pin-btn');
    if (savePinBtn) savePinBtn.addEventListener('click', (e) => { e.preventDefault(); window.setExecutivePinFromForm(); });
  } catch (e) {}

})();
