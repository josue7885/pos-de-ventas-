# Correcciones verificadas

Esta entrega incorpora el backend recuperado y las correcciones de acceso, ventas y sincronización que faltaban en la rama pública original.

- Venta, partidas, inventario, comprobante y clave de reintento se guardan atómicamente; una respuesta perdida no duplica el cobro.
- PIN con hash, roles, revocación de sesiones, archivos privados y secretos ocultos.
- Caja e inventario compartidos por servidor; importes calculados en centavos.
- Compras/gastos validados, cierres repetibles sin duplicar y períodos cerrados protegidos para nuevas compras/gastos.
- Conteos con ajuste explícito y movimientos de inventario auditables.
- Cocina/cliente con reconexión, contenido escapado y estados de pedido controlados.
- PDF descargable y adjunto generado en memoria; correo solo se envía cuando el usuario lo solicita y configura SMTP.
- Respaldo/restauración offline verificados por SHA-256 e integridad SQLite; no sobrescriben una base existente.
- Arranque Electron espera su propio servidor, usa puerto libre y datos privados. Preparación Android copia solo recursos públicos.
- Dependencias actualizadas; auditorías del backend y raíz sin avisos conocidos en la verificación de esta entrega. El empaquetador usa @electron/get 5.1.0 mediante override; requiere Node >=22.12 y se comprobó la carga de su API y del esquema de configuración.

La suite comprueba HTTP real con datos temporales, interfaz DOM, recuperación de cobros, concurrencia, persistencia, fallos de escritura, contabilidad, inventario, exportaciones y respaldos. No sustituye una prueba visual en Windows, impresión física, envío SMTP ni certificación de instaladores.

No hay integración fiscal real: Hacienda responde 501. Devoluciones, notas de crédito, descuentos y nuevas funciones de costeo/códigos de barras quedan fuera de esta reparación; deben desarrollarse con sus reglas operativas. Los datos históricos incompletos requieren conciliación, no reparación automática inventando partidas.

## Abrir en Windows

Extrae en una carpeta nueva y abre PowerShell en ella. No uses C:\Windows\System32. Consulta README.md antes de migrar datos existentes.

```powershell
npm run setup:server
npm test
$env:POS_ADMIN_PIN = Read-Host 'PIN inicial (solo base nueva, 6 a 12 digitos)'
npm start
```

También se incluye Iniciar-POS.ps1 para ejecutar desde la carpeta correcta y solicitar el PIN inicial de forma oculta. No requiere ejecutar PowerShell como administrador. Si la política de tu equipo no permite scripts, utiliza los comandos anteriores.
