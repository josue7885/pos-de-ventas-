# Servidor POS recuperado

Consulta [las instrucciones de la raíz](../README.md) para instalación, variables, respaldos y pruebas.

El código se recuperó del proyecto original; no se copiaron la base SQLite, facturas, claves ni dependencias compiladas del archivo ZIP.

- `db.js`: inicialización/migraciones y SQLite con transacciones y persistencia atómica.
- `server.js`: autenticación, autorización, configuración y rutas recuperadas.
- `core.js`: ventas idempotentes, existencias, caja compartida, mesas y sincronización.
- `documents.js`: documento público común y perfiles históricos del emisor, sin costos internos ni credenciales.
- `receipt.js`: PDF e impresión HTML del mismo documento. El PDF incorpora las fuentes DejaVu de `fonts/`, con su licencia, para no depender de las fuentes del sistema.
- `document-mail.js`: PDF y JSON adjuntos para ventas y cotizaciones.
- `test/`: integración HTTP, interfaz DOM, receptor SMTP local y reversión de transacciones.
- `hacienda.js`: plantilla histórica; NO es una integración fiscal funcional.

API principal: `/api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/sync`, `/api/products`, `/api/shifts/open`, `/api/shifts/close`, `/api/sales`, `/api/orders`.

Toda venta requiere cabecera `Idempotency-Key` estable para sus reintentos. El servidor valida precios y cantidades; no confía en el nombre del empleado ni en el precio enviado por el cliente. El acceso a archivos HTTP se limita a los recursos públicos enumerados explícitamente.

## Documentos y permisos

- `GET /api/documents`: directorio de ventas/cotizaciones sin repetir logos ni perfiles completos.
- `GET /api/documents/:kind/:id/json|pdf|html`: documento público, donde `kind` es `sale` o `quote`.
- `POST /api/documents/:kind/:id/email`: envío manual de PDF y JSON a un único `customerEmail`.
- `/api/invoices/:saleId/pdf` y `/api/invoices/:saleId/email` conservan compatibilidad y usan el mismo documento.

Se requiere sesión del negocio correspondiente y rol admin, gerente, cajero o contador. El encabezado `X-POS-Business` y la sesión se comprueban antes de cargar datos. El JSON usa `schema_version: 2`, `issuer`, `profile_source`, importes guardados y `items[].line_total`. `document_profiles` conserva perfiles públicos deduplicados; las ventas los referencian con `invoices.profile_id` y las cotizaciones con `receipt_profile_id` en su snapshot. Los registros antiguos sin perfil se identifican con `legacy_current_settings`.

`PUT /api/settings` permite cambios de tipo de negocio y configuración exclusivamente a admin; mantiene la comprobación del PIN ejecutivo cuando está activado. Agrupar Usuarios bajo Configuración no concede estos permisos al gerente.

### Entrega automática después del cobro

`POST /api/sales` admite `emailReceipt: true`; si no se envía, conserva el comportamiento anterior sin correo automático. El destinatario es `customerEmail` guardado con la venta. La respuesta añade `emailDelivery` (`status` y `message`), sin cambiar la confirmación de venta cuando el envío falla. El ticket HTML admite `?format=ticket` (80 mm), mientras el PDF permanece en A4.

`sale_email_delivery` registra por venta el destinatario y estado: `ready` dentro de la transacción de venta, `sending` duradero antes de SMTP, luego `accepted`, `skipped` o `uncertain`. Una solicitud repetida no vuelve a enviar estados ya reclamados. Si el proceso se interrumpe en `sending`, la recuperación informa que se debe verificar el correo antes de reenviar manualmente. No existe garantía de entrega a la bandeja final ni reintento automático de correos inciertos. Cada negocio conserva su propio registro dentro de SQLite y sus respaldos.

Las pruebas adicionales usan un SMTP local, incluyendo desconexión después de DATA, reintentos simultáneos, reinicio y venta con PIN ejecutivo configurado sin exigirlo al cajero.
