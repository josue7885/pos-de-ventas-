# Servidor POS recuperado

Consulta [las instrucciones de la raíz](../README.md) para instalación, variables, respaldos y pruebas.

El código se recuperó del proyecto original; no se copiaron la base SQLite, facturas, claves ni dependencias compiladas del archivo ZIP.

- `db.js`: inicialización/migraciones y SQLite con transacciones y persistencia atómica.
- `server.js`: autenticación, autorización, configuración y rutas recuperadas.
- `core.js`: ventas idempotentes, existencias, caja compartida, mesas y sincronización.
- `test/`: integración HTTP y pruebas de reversión de transacciones.
- `hacienda.js`: plantilla histórica; NO es una integración fiscal funcional.

API principal: `/api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/sync`, `/api/products`, `/api/shifts/open`, `/api/shifts/close`, `/api/sales`, `/api/orders`.

Toda venta requiere cabecera `Idempotency-Key` estable para sus reintentos. El servidor valida precios y cantidades; no confía en el nombre del empleado ni en el precio enviado por el cliente. El acceso a archivos HTTP se limita a los recursos públicos enumerados explícitamente.
