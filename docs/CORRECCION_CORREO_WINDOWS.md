# Corrección de correo y turnos — POS Control 1.3.0

Los botones de envío manual de documentos y de copias recibidas pedían el
destinatario con `prompt()`, que Electron no admite. Ahora abren un formulario
flotante con el correo, el documento seleccionado y el estado del envío.
Esta entrega también incluye la corrección anterior de apertura de turno.

## Aplicar en el portable en carpeta

1. Termina las operaciones pendientes y cierra POS Control normalmente.
2. En la carpeta donde está `POS Control.exe`, abre `resources`.
3. Guarda una copia de `app.js`, `index.html`, `enhancements.js` y `relay-ui.js`
   en una carpeta de respaldo fuera de `resources`.
4. Extrae `POS-Control-1.3.0-Correccion-Correo-y-Turnos.zip`. Copia sus cuatro
   archivos de `resources` a la carpeta `resources` de tu aplicación y acepta
   reemplazar esos archivos. No borres la carpeta completa ni sus demás archivos.
5. Abre de nuevo POS Control. Ve a Documentos > Comprobantes y pulsa Enviar
   correo en un comprobante ya registrado. Verás el formulario nuevo.
6. Confirma el destinatario y pulsa Enviar PDF y JSON. Debe aparecer el resultado
   en la misma ventana. Para probar usa tu propio correo y revisa también spam.

No registres otra venta para reenviar el comprobante. El parche no cambia SMTP,
PIN, base de datos ni inventario. Mantén todos los archivos de la aplicación
juntos. La actualización sirve para el portable en carpeta 1.3.0 del chat,
con o sin la corrección previa de turno; no modifica el portable de un solo EXE.

Si trabajas con el código fuente, reemplaza esos mismos cuatro archivos en
la raíz del proyecto. En modo Terminal, actualiza el servidor que sirve la
interfaz y recarga las pantallas conectadas.

## Qué se comprobó

- Ventas y cotizaciones enviaron PDF y JSON a un receptor SMTP local de prueba.
- El formulario admite cancelar y valida un único destinatario.
- Los clics simultáneos producen una sola solicitud desde el formulario.
- Si la respuesta se pierde después del envío, se avisa y no se repite
  automáticamente. Antes de cerrar y volver a solicitar otro envío, verifica
  si el destinatario ya lo recibió.
- Si falta configurar SMTP, se muestra el error y se puede corregir.
- Cambiar de negocio invalida el formulario anterior.
- Las copias recibidas de otro dispositivo usan el mismo formulario.
- Pasaron 18 pruebas automatizadas de interfaz, documentos, SMTP y cortes.
- Se probó con `prompt()` deshabilitado, como en Electron.

El SMTP de Gmail u otro proveedor y la ventana nativa de Windows deben
comprobarse en tu equipo. Un mensaje aceptado por SMTP no garantiza que llegue
a la bandeja final. No se enviaron correos externos durante estas pruebas.

Comando de pruebas, después de instalar las dependencias del servidor:

```sh
node --test server/test/email-ui.test.js server/test/documents.test.js server/test/frontend.test.js server/test/shift-reports.test.js
```

Esta entrega conserva la versión base 1.3.0. Los cambios están incluidos en
los ZIP de esta respuesta y todavía no se publicaron en GitHub. No modifica
la integración fiscal, que sigue sin estar implementada, ni otros usos de
`prompt()` ajenos a apertura de turno y envío de correo.
