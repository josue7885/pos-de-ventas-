# Navegación y comprobantes

## Dónde está cada función

| Área principal | Pestañas |
| --- | --- |
| Inicio | Resumen, ventas por día, productos más vendidos y accesos rápidos |
| Caja | Venta, Mesas, Órdenes, Cocina, Turno y cierre |
| Documentos | Comprobantes, Inventario, Reportes |
| Configuración | General, Negocios, Usuarios |

El menú y las pestañas se ajustan al rol y a las funciones habilitadas en cada negocio. No se eliminan ventas, inventarios ni usuarios por esta reorganización. El carrito se conserva al cambiar de pestaña y se recuerda la última sección de cada área durante la sesión. Usa las flechas izquierda/derecha, Inicio y Fin para cambiar de pestaña con el teclado.

- **Administrador:** configuración general de su negocio y usuarios. En el principal también dispone de Negocios para crear y administrar otros negocios.
- **Gerente:** conserva sus funciones de caja, documentos, inventario, reportes y usuarios. En Configuración solo aparece Usuarios.
- **Cajero:** caja y comprobantes, según sus permisos anteriores.
- **Mesero y cocina:** funciones operativas autorizadas, sin configuración empresarial.
- **Contador:** consulta y funciones financieras autorizadas; agrupar la caja no le concede permiso para abrirla o cerrarla.

## Inicio y menú plegable

Pulsa **Minimizar menú (☰)** para dejar solo los iconos en escritorio. El mismo botón lo expande; la preferencia se conserva en ese navegador. En móvil oculta o muestra la navegación superior.

**Inicio** muestra ventas de hoy, total, cantidad de ventas y promedio de los últimos **7 o 30 días**, junto a barras por fecha y los 5 productos más vendidos por cantidad y unidad. Incluye días sin ventas y utiliza la fecha local del dispositivo (zona horaria indicada en pantalla); cotizaciones y órdenes pendientes no cuentan como ventas. El gráfico permite desplazarse horizontalmente y consultar una tabla de importes. Los datos se sincronizan por negocio.

Los accesos rápidos abren **Nueva venta**, **Inventario** y **Registrar cliente**, conservando el carrito. Administrador y gerente acceden al inventario administrativo. Cajero y mesero abren la consulta de inventario dentro de Ventas, sin permisos de edición. Cocina no recibe accesos de venta. El resumen financiero solo se muestra a administrador, gerente, cajero y contador; mesero y cocina conservan las restricciones del servidor.

En **Caja → Venta → Inventario** se abre una ventana flotante. Escribe una cantidad y pulsa **Agregar a cuenta**. Se valida la unidad y que las existencias cubran lo que ya está en el carrito más lo agregado. Agotados y operaciones pendientes bloquean la acción. Los servicios no consumen existencias. Solo el cobro confirmado descuenta inventario; **Documentos → Inventario** conserva la administración habitual, sin botones para añadir a una venta.

## Facturación y búsqueda rápida

En **Caja → Venta**, el panel ejecutivo se retiró. Los datos de cliente, tipo de comprobante, método de pago, monto recibido, descuentos y entrega están arriba del catálogo. **Cobrar venta** abre una confirmación breve con cliente y total. No pide PIN ejecutivo; se mantiene el inicio de sesión y el permiso de caja. Configuración y usuarios conservan sus controles de administrador y PIN ejecutivo cuando está configurado.

El buscador **Consultar producto y existencias** se despliega al pulsar su título encima de las pestañas en todas las áreas. Busca por nombre, SKU/código de barras o categoría, incluso sin escribir tildes. Muestra precio, existencias y unidad; diferencia los servicios y productos agotados. Consulta solamente el negocio activo, se actualiza con la sincronización y muestra una advertencia cuando esta falla. **Actualizar** consulta nuevamente el servidor. El buscador del catálogo sigue permitiendo agregar un SKU con Enter.

La pantalla de venta usa una tabla amplia, inspirada en la referencia de caja:

1. La barra superior abre Órdenes, Mesas, Gastos, Clientes, Ventas, Cotizaciones, Inventario y Turno, según permisos y módulos activos.
2. La cabecera muestra documento, resumen del cliente, pago y monto recibido. **Agregar cliente** y **Editar cliente** abren una ventana con nombre, correo, identificación, dirección y demás datos. **Clientes registrados** abre otra ventana para buscar, seleccionar o editar clientes guardados. El editor también se abre al seleccionar Crédito fiscal interno.
3. En **Código o descripción del producto**, escribe o escanea un código o selecciona una sugerencia. Revisa unidad, existencias y precio; indica cantidad y pulsa **Agregar** o Enter. Las cantidades fraccionarias se admiten solo para unidades que las permiten. Si ya está en la tabla, la cantidad se suma sin exceder existencias.
4. La tabla muestra código, descripción, cantidad, unidad, precio, importe antes del descuento general, tipo y existencias. Cambia cantidades, elimina partidas o ajusta precios con permiso de administrador/gerente. El descuento general, impuesto y total aparecen arriba del detalle.
5. Debajo están las opciones de impresión/correo y los botones Cobrar, Guardar cotización y Enviar a cocina. El botón **Inventario** de la barra de Ventas abre una ventana con búsqueda, categoría, precio, existencias, cantidad en cuenta y cantidad a agregar; esa tabla ya no ocupa la parte inferior de Ventas.

En teléfono, los campos se acomodan y la tabla se desplaza horizontalmente. La cabecera no inventa un número de factura: se asigna al confirmar el cobro en el servidor. La pantalla no añade bodegas múltiples ni hojas de despacho, que no son funciones activas del sistema.

Antes del cobro elige:

- **Imprimir ticket (80 mm):** opción inicial; al confirmar la venta abre el diálogo del navegador. Selecciona la impresora térmica y papel de 80 mm, o Guardar como PDF. El navegador exige confirmar la impresión; no es impresión silenciosa.
- **Descargar PDF (A4):** descarga el comprobante al confirmar el cobro.
- **Solo guardar comprobante:** no abre impresión ni descarga; los botones quedan disponibles para después.
- **Enviar PDF y JSON al correo del cliente:** activado inicialmente, se puede desmarcar para esa venta. Requiere un correo válido y SMTP configurado en el negocio.

Después de una venta confirmada se limpian los datos del cliente para evitar enviar el siguiente comprobante al destinatario anterior. La confirmación conserva los botones del documento emitido. Si el navegador bloquea la ventana o descarga, la venta sigue registrada: usa los botones del comprobante, sin cobrar otra vez.

## Ventanas de inventario y clientes

- **Venta → Inventario:** consulta existencias y agrega artículos a la cuenta desde la ventana. Ciérrala con **×** o **Escape** para volver al cobro; el carrito se conserva.
- **Documentos → Inventario → Nuevo artículo / Editar:** el formulario de producto se abre flotante. Ingresa el precio final **con IVA incluido** y guarda. Los permisos siguen siendo de administrador o gerente.
- **Entrada de inventario:** registra una recepción en su propia ventana; el servidor confirma el movimiento antes de cerrarla.
- **Conteo físico:** abre una ventana sin cambiar de pestaña. Selecciona el producto, escribe la cantidad contada y, si deseas ajustar existencias, marca la opción y explica el motivo. La sincronización conserva el borrador y las existencias capturadas al iniciar. Si otra caja cambia ese stock, se rechaza el conteo: cierra y vuelve a abrir para revisar una referencia actualizada.
- **Agregar cliente / Editar cliente:** los campos solo aparecen en la ventana. **Guardar cliente** registra o actualiza al cliente y lo selecciona para la venta. **Usar en esta venta** conserva los datos para el comprobante sin registrar un cliente nuevo. Cerrar el editor conserva lo escrito para la venta actual.
- **Clientes registrados:** busca por nombre, documento, teléfono o correo. **Usar en venta** selecciona al cliente y cierra la ventana; **Editar** abre sus datos. **Usar cliente general** limpia la selección y sus datos.

Las ventanas se adaptan al teléfono, tienen desplazamiento interno y mantienen el foco del teclado dentro de ellas. **×** o **Escape** permiten volver a la pantalla anterior. Cambiar de sección, cerrar sesión o cambiar de negocio cierra las ventanas. Los datos de cliente se limpian después del cobro, al cerrar sesión y al cambiar de negocio.

## Cambiar el tipo de negocio

1. Selecciona el negocio e inicia sesión con su administrador.
2. Entra en **Configuración → General → Operación del negocio**.
3. Selecciona Tienda / comercio, Restaurante / cafetería, Servicios o Negocio mixto.
4. Si quieres adoptar las opciones iniciales del perfil, pulsa **Usar módulos sugeridos para este tipo**. Revisa los módulos y métodos de pago propuestos.
5. Pulsa **Guardar configuración** y confirma con el PIN ejecutivo si está configurado.

Solo el administrador puede guardar estos cambios. La API rechaza también las solicitudes directas de los demás roles. El botón de sugerencias ajusta el formulario; no guarda por sí solo ni transforma productos existentes en servicios. La moneda no puede cambiar cuando ya existen operaciones.

## Imprimir o descargar

Después de cobrar, la confirmación de venta ofrece **Imprimir**, **PDF**, **JSON** y **Enviar correo**. La venta ya está registrada: un problema al descargar o imprimir no requiere cobrar otra vez.

Para documentos anteriores entra en **Documentos → Comprobantes**. Allí están las ventas y cotizaciones, con búsqueda y filtros. Inventario y Reportes permanecen como pestañas de esta misma área.

- **Imprimir:** abre el documento con los datos del servidor y solicita el diálogo de impresión. Si el navegador bloquea la ventana, permite las ventanas emergentes del POS o descarga el PDF. Puedes cerrar la vista al terminar.
- **PDF:** descarga un documento A4 con emisor, cliente, fecha UTC, artículos y cantidades, importes, descuentos, impuesto y total. Las ventas incluyen forma de pago, recibido y cambio; las cotizaciones incluyen vigencia y estado de conversión cuando corresponda.
- **JSON:** descarga los mismos datos públicos estructurados. Incluye versión de esquema, negocio, moneda, emisor e importes por partida. No contiene contraseñas SMTP, sesiones ni costos internos.

El nombre de archivo incluye el número del documento, por ejemplo `comprobante-FE-001-000001.pdf` o `cotizacion-COT-000001.json`. Los archivos JSON sirven para consulta e integración; esta versión no implementa una importación automática de ventas desde esos archivos.

Los nuevos documentos guardan el perfil público del emisor al emitirse. Cambiar después el nombre, dirección, impuesto o pie de la empresa no reescribe ese perfil. Los documentos antiguos sin perfil histórico muestran los datos actuales del emisor con una nota explícita; sus importes siguen siendo los guardados. Los perfiles idénticos, incluidos sus logos, se almacenan una sola vez por negocio y se conservan en los respaldos de SQLite.

## Enviar por correo

1. El administrador configura el correo dentro de **Configuración → General → Correo y facturación** del negocio elegido.
2. Guarda host, puerto, modo seguro, usuario, contraseña y remitente, y activa **Enviar factura por correo**. Para el ejemplo de Gmail, la guía SMTP anterior usa 465 con Seguro en Sí; para 587 corresponde No y STARTTLS cuando el proveedor lo ofrece.
3. En **Documentos → Comprobantes**, pulsa **Enviar correo** en una venta o cotización e introduce un único destinatario. También puedes usar el botón de la venta recién confirmada.
4. El mensaje adjunta el mismo PDF y JSON que puedes descargar. Que SMTP acepte el envío no garantiza que llegue a la bandeja de entrada: revisa también spam y posibles rebotes.

El cobro envía automáticamente si dejaste marcada la casilla de correo. La intención y el estado se guardan junto a los datos de la venta: recuperar la misma operación, incluso tras reiniciar o desde solicitudes simultáneas, no repite automáticamente el mensaje. Si no hay correo o SMTP, se informa sin anular el cobro. Si SMTP se interrumpe, el resultado puede ser incierto y no se reintenta automáticamente. Comprueba la bandeja del cliente antes de usar **Enviar correo**, que sigue siendo un reenvío manual y puede duplicar un mensaje ya recibido. El servidor limita los intentos de reenvío manual. La configuración SMTP actual del negocio se usa para el envío; los adjuntos conservan el perfil público histórico del documento.

Los comprobantes continúan siendo internos sin autorización fiscal. Las cotizaciones no generan cobro ni reservan existencias.

## Actualizar y comprobar

Detén el servidor y conserva un respaldo completo antes de actualizar datos reales. Desde la carpeta del proyecto, usa la rama de trabajo y conserva tus cambios locales si Git informa de un conflicto:

```powershell
git fetch origin
git switch fix/backend-auth-sales-sync
git pull --ff-only origin fix/backend-auth-sales-sync
npm.cmd run setup:server
npm.cmd test
npm.cmd start
```

Ejecuta los comandos en orden y detente si alguno falla. Conserva tu `POS_DATA_DIR` habitual y prueba primero con una copia cuando actualices una base anterior. Recarga la página del POS después de reiniciar el servidor.

`npm test` usa bases temporales: comprueba correo automático con reintentos, reinicio y desconexión SMTP, buscador de existencias, salida automática de ticket/PDF, navegación por rol, protección del tipo de negocio, impresión HTML escapada, perfiles históricos, aislamiento entre negocios y coincidencia de descargas y adjuntos contra un receptor SMTP local. No envía correos a personas ni utiliza tus datos reales. La entrega con un proveedor externo, la impresión física y la prueba en Windows requieren validación en la instalación final. Esta pantalla se verificó en Chromium sin interfaz, con tamaños de escritorio y móvil, además de las pruebas de API/DOM.

## Precios finales con IVA y PDF profesionales

Ingresa el **precio de venta con IVA agregado**. El precio del inventario es el importe final que paga el cliente; el sistema desglosa la base y el impuesto sin sumarlo otra vez. Con tasa de 13%, un artículo de $113 se cobra a $113: base $100 e IVA incluido $13. Un descuento de 10% deja un total de $101.70, base $90 e IVA $11.70. Los costos y las entradas de mercancía mantienen su tratamiento separado, sin IVA en el costo unitario.

Al actualizar, los importes del catálogo no se modifican: se interpretan como precios finales. Revisa los productos que antes se hayan ingresado sin IVA. Las ventas y cotizaciones ya emitidas mantienen sus totales y su modalidad anterior; cargar una cotización para vender utiliza los precios y la tasa actuales y requiere revisar el cobro. Confirma cualquier venta pendiente antes de actualizar y recarga todos los clientes del sistema después de reiniciarlo.

Los comprobantes y cotizaciones PDF A4 usan encabezado azul, datos del emisor y cliente, tabla de artículos, total destacado, condiciones y espacio para firmas. Repiten encabezados y numeran páginas en documentos largos. La impresión HTML, el ticket de 80 mm y los adjuntos PDF/JSON comparten los importes guardados. El JSON incluye `prices_include_tax` para indicar la modalidad. Los reportes de inventario, libro de IVA y cierre también tienen tablas y paginación; el libro de IVA usa A4 horizontal.

El diseño conserva la identificación de **comprobante interno sin autorización fiscal**; no genera sellos ni autorizaciones de Hacienda.

Consulta la [guía de ventas al crédito, notas, abonos y WhatsApp](CREDITOS_Y_NOTAS.md).
