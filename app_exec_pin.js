// Authorization is enforced by the server. Role checks remain synchronous.
document.getElementById('save-executive-pin-btn')?.addEventListener('click', async () => {
  if (!canAccessExecutivePanel()) return alert('Solo el administrador puede configurar el PIN.');
  const input=document.getElementById('setting-executive_pin');
  const confirmation=document.getElementById('setting-executive_pin_confirm');
  if (!/^\d{6,12}$/.test(input.value) || input.value!==confirmation.value) return alert('Confirma un PIN de 6 a 12 dígitos.');
  try {
    await apiRequest('/auth/executive-pin', {method:'POST',headers:await executiveHeaders(),body:JSON.stringify({pin:input.value})});
    input.value='';confirmation.value='';
    await loadCompanySettings();
    alert('PIN ejecutivo guardado en el servidor.');
  } catch(error) { alert(error.message); }
});
