# Cambios de POS Control 1.3.1

## Correcciones

- Apertura de turno mediante formulario flotante compatible con Electron, con validación de efectivo, cancelación y protección frente a doble clic.
- Recuperación del estado del turno si se pierde la respuesta del servidor.
- Envío manual de documentos y copias recibidas mediante formulario de correo, sin `window.prompt()`.
- Validación del destinatario, aviso del resultado SMTP, protección frente a doble envío desde el formulario y comprobación del negocio activo. No se reintenta automáticamente un correo de resultado incierto.
- Nuevas pruebas del formulario de correo con interfaz, HTTP real y receptor SMTP local; comprobación de PDF/JSON adjuntos.
- Flujo de instaladores sensible a cambios de interfaz, servidor y pruebas; incorpora ZIP de carpeta portable Windows para conservar los archivos de Electron juntos.
- Guías de instalación y actualización con respaldo y separación entre PowerShell, Bash y Termux.

## Validación de esta revisión

Pasaron 70 pruebas del servidor y 4 de instalación. Las pruebas SMTP utilizan un receptor local; no certifican la entrega con un proveedor externo. Consulta `CONTENIDO-Y-VALIDACION.txt` de la distribución para los binarios y verificaciones de empaquetado efectivamente realizados.

No se incorporan bases ni credenciales de clientes. No cambian las reglas de IVA incluido ni el alcance de comprobante interno sin autorización fiscal. La generación de un paquete no sustituye la prueba de la interfaz nativa, impresora o dispositivo físico.
