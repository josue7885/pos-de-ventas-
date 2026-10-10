# Navegación y comprobantes

## Dónde está cada función

| Área principal | Pestañas |
| --- | --- |
| Caja | Venta, Mesas, Órdenes, Cocina, Turno y cierre |
| Documentos | Comprobantes, Inventario, Reportes |
| Configuración | General, Negocios, Usuarios |

El menú y las pestañas se ajustan al rol y a las funciones habilitadas en cada negocio. No se eliminan ventas, inventarios ni usuarios por esta reorganización. El carrito se conserva al cambiar de pestaña y se recuerda la última sección de cada área durante la sesión. Usa las flechas izquierda/derecha, Inicio y Fin para cambiar de pestaña con el teclado.

- **Administrador:** configuración general de su negocio y usuarios. En el principal también dispone de Negocios para crear y administrar otros negocios.
- **Gerente:** conserva sus funciones de caja, documentos, inventario, reportes y usuarios. En Configuración solo aparece Usuarios.
- **Cajero:** caja y comprobantes, según sus permisos anteriores.
- **Mesero y cocina:** funciones operativas autorizadas, sin configuración empresarial.
- **Contador:** consulta y funciones financieras autorizadas; agrupar la caja no le concede permiso para abrirla o cerrarla.

## Facturación y búsqueda rápida

En **Caja → Venta**, el panel ejecutivo se retiró. Los datos de cliente, tipo de comprobante, método de pago, monto recibido, descuentos y entrega están arriba del catálogo. **Cobrar venta** abre una confirmación breve con cliente y total. No pide PIN ejecutivo; se mantiene el inicio de sesión y el permiso de caja. Configuración y usuarios conservan sus controles de administrador y PIN ejecutivo cuando está configurado.

El buscador **Consultar producto y existencias** está disponible encima de las pestañas en todas las áreas. Busca por nombre, SKU/código de barras o categoría, incluso sin escribir tildes. Muestra precio, existencias y unidad; diferencia los servicios y productos agotados. Consulta solamente el negocio activo, se actualiza con la sincronización y muestra una advertencia cuando esta falla. **Actualizar** consulta nuevamente el servidor. El buscador del catálogo sigue permitiendo agregar un SKU con Enter.

Antes del cobro elige:

- **Imprimir ticket (80 mm):** opción inicial; al confirmar la venta abre el diálogo del navegador. Selecciona la impresora térmica y papel de 80 mm, o Guardar como PDF. El navegador exige confirmar la impresión; no es impresión silenciosa.
- **Descargar PDF (A4):** descarga el comprobante al confirmar el cobro.
- **Solo guardar comprobante:** no abre impresión ni descarga; los botones quedan disponibles para después.
- **Enviar PDF y JSON al correo del cliente:** activado inicialmente, se puede desmarcar para esa venta. Requiere un correo válido y SMTP configurado en el negocio.

Después de una venta confirmada se limpian los datos del cliente para evitar enviar el siguiente comprobante al destinatario anterior. La confirmación conserva los botones del documento emitido. Si el navegador bloquea la ventana o descarga, la venta sigue registrada: usa los botones del comprobante, sin cobrar otra vez.

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

`npm test` usa bases temporales: comprueba correo automático con reintentos, reinicio y desconexión SMTP, buscador de existencias, salida automática de ticket/PDF, navegación por rol, protección del tipo de negocio, impresión HTML escapada, perfiles históricos, aislamiento entre negocios y coincidencia de descargas y adjuntos contra un receptor SMTP local. No envía correos a personas ni utiliza tus datos reales. La entrega con un proveedor externo, la impresión física y la prueba visual del navegador requieren validación en la instalación final.
