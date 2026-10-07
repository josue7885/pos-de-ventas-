# Correcciones verificadas

## Pestañas y comprobantes unificados

- Caja agrupa Venta, Mesas, Órdenes, Cocina y Turno y cierre.
- Documentos agrupa Comprobantes, Inventario y Reportes.
- Configuración agrupa General, Negocios y Usuarios; cada pestaña mantiene sus permisos.
- Solo admin puede cambiar el tipo de negocio; verificado con gerente, cajero, contador, mesero y cocina en la API y con sesiones reales en la interfaz.
- Impresión, PDF, JSON y adjuntos SMTP usan el mismo documento público; las cotizaciones también pueden enviarse por correo.
- Confirmación de venta con acciones de documento autenticadas, para no abrir por error el PDF de otro negocio con el mismo número de venta.
- Perfil público del emisor conservado al emitir y deduplicado en SQLite; no se incluyen costos internos ni secretos en los adjuntos. Los documentos antiguos sin perfil guardado informan que utilizan datos actuales del emisor.
- 42 pruebas de API y DOM; SMTP contra un receptor local, sin mensajes externos. La descarga de Chromium falló en el entorno de revisión; no se certifican navegador gráfico, impresión física ni entrega con el proveedor SMTP.

Consulta [la guía de navegación y comprobantes](docs/NAVEGACION_Y_COMPROBANTES.md).

## Negocios y configuración

- Negocios con cuentas, sesiones, ventas, clientes, inventario, caja y configuración separados; administración desde el negocio principal.
- Perfiles de tienda, restaurante, servicios y mixto; módulos, moneda, formato numérico, impuestos, pagos, vigencia de cotizaciones y pie del comprobante configurables.
- Selección por pestaña, recuperación de creación tras respuesta perdida y bloqueo de cambios mientras existan operaciones pendientes.
- Respaldo verificado de todos los negocios y migración que conserva la base principal existente.
- Moneda protegida después de registrar operaciones; identificación de negocio y moneda en exportaciones.
- Dependencias del servidor: `proxy-addr` 2.0.8 y `xmlbuilder2` 4.0.3; se retiró la cadena antigua de `sprintf-js`. Auditorías de raíz y servidor sin vulnerabilidades reportadas al verificar esta entrega.

Verificación de la revisión multinegocio anterior: 36 pruebas aprobadas de API e interfaz DOM, incluidos recuperación de respuestas perdidas y respaldo/restauración multinegocio; recursos web preparados correctamente.

Consulta [la guía multinegocio](docs/MULTINEGOCIO.md).

## Backend y funciones comerciales

Esta entrega incorpora el backend recuperado y las correcciones de acceso, ventas y sincronización que faltaban en la rama pública original.

- Venta, partidas, inventario, comprobante y clave de reintento se guardan atómicamente; una respuesta perdida no duplica el cobro.
- PIN con hash, roles, revocación de sesiones, archivos privados y secretos ocultos.
- Caja e inventario compartidos entre terminales de cada negocio; importes calculados en centavos.
- Compras/gastos validados, cierres repetibles sin duplicar y períodos cerrados protegidos para nuevas compras/gastos.
- Conteos con ajuste explícito y movimientos de inventario auditables.
- Cocina/cliente con reconexión, contenido escapado y estados de pedido controlados.
- PDF descargable y adjunto generado en memoria; correo solo se envía cuando el usuario lo solicita y configura SMTP.
- Respaldo/restauración offline verificados por SHA-256 e integridad SQLite; no sobrescriben una base existente.
- Arranque Electron espera su propio servidor, usa puerto libre y datos privados. Preparación Android copia solo recursos públicos.
- Dependencias actualizadas; auditorías del backend y raíz sin avisos conocidos en la verificación de esta entrega. El empaquetador usa @electron/get 5.1.0 mediante override; requiere Node >=22.12 y se comprobó la carga de su API y del esquema de configuración.

La suite comprueba HTTP real con datos temporales, interfaz DOM, recuperación de cobros, concurrencia, persistencia, fallos de escritura, contabilidad, inventario, exportaciones y respaldos. No sustituye una prueba visual en Windows, impresión física, envío SMTP ni certificación de instaladores.

No hay integración fiscal real: Hacienda responde 501. Se incorporaron descuentos autorizados, SKU y costo promedio en recepción. Siguen pendientes devoluciones fiscales, notas de crédito, costeo por lotes e impresión de etiquetas. Los datos históricos incompletos requieren conciliación, no reparación automática inventando partidas.

## Abrir en Windows

Extrae en una carpeta nueva y abre PowerShell en ella. No uses C:\Windows\System32. Consulta README.md antes de migrar datos existentes.

```powershell
npm run setup:server
npm test
$env:POS_ADMIN_PIN = Read-Host 'PIN inicial (solo base nueva, 6 a 12 digitos)'
npm start
```

También se incluye Iniciar-POS.ps1 para ejecutar desde la carpeta correcta y solicitar el PIN inicial de forma oculta. No requiere ejecutar PowerShell como administrador. Si la política de tu equipo no permite scripts, utiliza los comandos anteriores.
