## Ventanas flotantes de ventas, inventario y clientes

- Inventario de venta en una ventana con búsqueda, cantidades y agregado al carrito.
- Formularios flotantes de producto, entrada de inventario y conteo físico.
- Registro y edición de clientes fuera del formulario principal de Ventas; directorio flotante con búsqueda, selección y edición.
- Cierre con Escape, foco de teclado, diseño móvil y cierre al cambiar de sección o sesión.
- Conteos conservan su borrador y referencia de existencias durante la sincronización; los conflictos siguen validados por el servidor.
- Pruebas DOM/HTTP y navegador ampliadas para formularios, permisos y navegación.

# Correcciones verificadas
## Precios finales con IVA y PDF profesionales

Ingresa el **precio de venta con IVA agregado**. El precio del inventario es el importe final que paga el cliente; el sistema desglosa la base y el impuesto sin sumarlo otra vez. Con tasa de 13%, un artículo de $113 se cobra a $113: base $100 e IVA incluido $13. Un descuento de 10% deja un total de $101.70, base $90 e IVA $11.70. Los costos y las entradas de mercancía mantienen su tratamiento separado, sin IVA en el costo unitario.

Al actualizar, los importes del catálogo no se modifican: se interpretan como precios finales. Revisa los productos que antes se hayan ingresado sin IVA. Las ventas y cotizaciones ya emitidas mantienen sus totales y su modalidad anterior; cargar una cotización para vender utiliza los precios y la tasa actuales y requiere revisar el cobro. Confirma cualquier venta pendiente antes de actualizar y recarga todos los clientes del sistema después de reiniciarlo.

Los comprobantes y cotizaciones PDF A4 usan encabezado azul, datos del emisor y cliente, tabla de artículos, total destacado, condiciones y espacio para firmas. Repiten encabezados y numeran páginas en documentos largos. La impresión HTML, el ticket de 80 mm y los adjuntos PDF/JSON comparten los importes guardados. El JSON incluye `prices_include_tax` para indicar la modalidad. Los reportes de inventario, libro de IVA y cierre también tienen tablas y paginación; el libro de IVA usa A4 horizontal.

El diseño conserva la identificación de **comprobante interno sin autorización fiscal**; no genera sellos ni autorizaciones de Hacienda.


## Inicio, menú plegable e inventario dentro de Ventas

- Inicio con ventas diarias de 7/30 días, indicadores, cinco productos más vendidos por cantidad/unidad y accesos rápidos sujetos al rol. Datos del negocio activo y fechas locales explícitas.
- Menú minimizable con iconos accesibles, preferencia persistente y adaptación móvil.
- Inventario de Ventas con búsqueda, cantidades, existencias y acción Agregar a cuenta, sin conceder permisos administrativos. Conserva el carrito al navegar.
- Ampliadas las pruebas DOM/HTTP y Chromium para Inicio, totales, fechas, permisos, aislamiento de negocios, fracciones, stock, navegación y persistencia del menú.

## Pantalla de venta basada en la referencia de caja

- Barra azul con accesos a funciones existentes, filtrados por permisos y módulos del negocio.
- Cabecera compacta para comprobante, cliente y pago; datos ampliados del cliente desplegables.
- Entrada por código/nombre y cantidad con consulta inmediata de unidad, precio y existencias.
- Detalle tabular con código, descripción, cantidad editable, unidad, precio, importe, tipo, existencias y eliminación. Descuento general y total destacado.
- Conservados catálogo, cotizaciones, cocina, impresión/PDF, correo, sincronización y permisos administrativos.
- Verificación en Chromium real sin interfaz: escritorio y móvil, cobro y recuperación, dos clientes, JSON y ventana de impresión. Capturas revisadas; no se certifican impresoras físicas ni Windows.

## Facturación arriba, cobro con entrega y consulta de existencias

- Retirado el panel ejecutivo de Venta; cliente, comprobante, pagos, descuentos y entrega encima del catálogo.
- Buscador global por nombre, SKU/código de barras y categoría; existencias, unidades, agotados y servicios por negocio, con estado de sincronización.
- Al confirmar el cobro: diálogo de ticket de 80 mm o descarga de PDF A4; los bloqueos del navegador no repiten la venta.
- Correo automático con PDF/JSON si la casilla está marcada y hay destinatario y SMTP. Registro persistente para no repetir el envío al recuperar la misma venta. Un resultado SMTP incierto requiere revisión y reenvío manual.
- Datos del cliente limpiados tras el cobro; monto recibido introducido por el cajero conservado al abrir la confirmación.
- Cobro sin PIN ejecutivo; permisos administrativos y configuración del tipo de negocio se mantienen.
- 45 pruebas de API/DOM: impresión y descarga automáticas, buscador, destinatarios, SMTP local, reintentos concurrentes y reinicio. Impresión física y proveedor externo pendientes de validar en la instalación.

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
