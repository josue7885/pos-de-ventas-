# Integración de la versión compartida

Se revisaron los 16 archivos compartidos y se adaptaron sus mejoras al servidor SQLite de `fix/backend-auth-sales-sync`. El backend y las imágenes referenciados por esa versión no estaban incluidos en esos archivos.

## Funciones integradas

| Área | Comportamiento |
|---|---|
| Interfaz | Tres áreas con pestañas por rol: Caja, Documentos y Configuración; navegación por teclado y carrito conservado al cambiar de pestaña. |
| Clientes | Búsqueda, alta y edición; nombre, NIT/DUI, correo, dirección, departamento, municipio y giro guardados en el servidor. |
| Documentos | Consulta de los últimos 1000 comprobantes y 1000 cotizaciones, filtros, impresión, PDF y JSON unificados; envío manual de ventas y cotizaciones por SMTP. |
| Cotizaciones | Vigencia de 15 días, sin cobro, apertura de caja ni reserva de stock. Reintentos recuperan la misma cotización. Se pueden cargar al carrito y convertir una sola vez. |
| Inventario | SKU/código único, búsqueda por código con Enter, categorías, productos y servicios, unidades fraccionarias hasta tres decimales, costo y alertas de existencias bajas. |
| Recepción | Cantidad, costo sin IVA, IVA de la entrada, proveedor y referencia. Actualiza costo promedio ponderado y existencias; registra compra y movimiento en una transacción. |
| Auditoría | Historial de entradas, movimientos y conteos; exportación CSV y PDF de inventario. |
| Precios | Administrador/gerente puede aplicar descuento porcentual o precio especial con motivo. El servidor valida permisos, catálogo y totales. |
| Reportes | Fechas UTC, método de pago y cajero; filtros iguales en pantalla y CSV/Excel. Utilidad bruta estimada usando costos guardados en cada venta. |
| Usuarios | Activar/desactivar cuentas sin perder sus ventas; revocación de sesiones y protección del último administrador activo. |
| Automatización | El flujo antiguo que llamaba a Webpack sin configuración prepara ahora los recursos web y revisa su sintaxis con Node 24. |
| Escritorio | Al abrir una segunda instancia se muestra la ventana existente. Los recursos nuevos se incluyen en la preparación de escritorio y Android. |

## Reglas operativas

- Una venta siempre necesita servidor y caja abierta. No se generan cobros locales durante una desconexión.
- Las solicitudes de venta, cotización y recepción tienen identificadores persistentes. Una respuesta perdida se recupera con el mismo identificador, incluso después de reiniciar el servidor. Las operaciones pendientes de cotización/recepción aparecen en un aviso al iniciar sesión con el usuario original.
- Cada recepción crea su compra contable: no registres de nuevo esa entrada en el formulario independiente de Compras. El IVA capturado corresponde exclusivamente a los artículos de esa entrada; el costo promedio usa el valor sin IVA.
- Las cotizaciones cargadas utilizan precios y existencias actuales. El administrador/gerente puede volver a autorizar un precio especial; el texto de la cotización informa que los valores se revisan al confirmar.
- Los descuentos se aplican antes del IVA. El cálculo redondea cada partida a centavos, luego el descuento y el impuesto. Las cantidades admiten tres decimales solo en unidades de peso, volumen, longitud y horas.
- Los costos existentes se inicializan en cero si nunca se habían capturado; revísalos antes de usar la utilidad estimada. Las ventas antiguas sin costo histórico se identifican como incompletas y no se les inventa costo. La utilidad no descuenta gastos ni pretende sustituir un cierre contable.
- Los permisos siguen siendo los roles comprobados por el backend. No se importaron permisos editables que solo se aplicaban en el navegador.
- Se conserva el icono disponible. Los PDF aceptan el logo PNG/JPEG guardado en Configuración. No se activa el inicio automático de Windows.
- Los comprobantes continúan siendo internos, sin autorización fiscal. No se implementó firma/envío de DTE ni devoluciones fiscales.

## Validación y límites

`npm test` ejecuta 42 pruebas, con bases temporales y HTTP real. Incluye pestañas y permisos con sesiones reales, perfil histórico del emisor, igualdad de descargas y adjuntos contra un SMTP local, la interfaz en JSDOM, precios y descuentos por rol, cantidades fraccionarias, cotizaciones sin efecto contable, conversión única, recepción con costo ponderado e IVA, respuestas perdidas, filtros, desactivación de cuentas, reinicios, respaldo/restauración y reversión de transacciones.

La instalación de Chromium en el entorno de revisión falló al descargar su archivo. El recorrido Playwright queda disponible en `tests/browser-smoke.cjs`, pero esta integración no se certifica como probada en un navegador gráfico o en Windows. Tampoco se validaron impresoras físicas, entrega real SMTP ni binarios de instalación.

Antes de actualizar datos reales, detén el servidor, conserva un respaldo verificado y prueba con una copia mediante `POS_DATA_DIR`. La migración conserva cuentas, ventas y existencias. No se importan automáticamente archivos JSON ni ventas guardadas solamente en el navegador de otra versión.
