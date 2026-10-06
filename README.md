# POS Control

Punto de venta web con Node.js, Express y SQLite. Permite administrar varios negocios con usuarios, ventas, inventario, clientes, caja y configuración independientes. Incluye perfiles para tiendas, restaurantes, servicios y negocios mixtos. Los navegadores sincronizan cada 3 segundos dentro del negocio seleccionado.

## Varios negocios y configuración

1. Entra como administrador del **Negocio principal** y abre **Negocios**.
2. Crea un negocio con nombre, tipo, moneda y PIN de su administrador inicial (6 a 12 dígitos).
3. Pulsa **Ingresar** y accede con la cuenta de ese negocio.
4. En **Configuración**, ajusta los datos de empresa, impuesto, pagos, vigencia de cotizaciones, mensaje del comprobante y módulos. Guarda los cambios.

El selector del acceso y el botón **Cambiar negocio** permiten pasar a otro negocio. Cada pestaña conserva su selección. Solo los administradores del principal pueden crear, renombrar o desactivar negocios; cada negocio gestiona sus propias cuentas. La instalación anterior se conserva como principal.

La moneda se fija al registrar operaciones. Los perfiles proponen módulos; puedes ajustar mesas, cocina, creación de cotizaciones y recepción de mercancía individualmente. Desactivar módulos conserva sus registros anteriores. Consulta [la guía multinegocio](docs/MULTINEGOCIO.md) para reglas, respaldo y actualización.

## Ejecutar en Windows (PowerShell)

Requiere Node.js 22.12 o posterior. En la raíz del repositorio:

```powershell
npm run setup:server
$env:POS_ADMIN_PIN = Read-Host 'Define el PIN inicial del administrador (6 a 12 digitos)'
npm start
```

Abre http://localhost:3000. Selecciona Administrador y usa el PIN que definiste. La variable solo se utiliza si aún no hay usuarios. Una base nueva inicia sin productos ni cuentas de demostración: agrega productos en Inventario y abre caja antes de cobrar. Después del primer inicio puedes quitar `POS_ADMIN_PIN` de tu entorno.

En Linux/macOS puedes definir `POS_ADMIN_PIN` como variable de entorno antes de `npm start`. Para ejecutar las pruebas no se necesita definirla: los tests crean datos temporales aislados.

## Datos y copias de seguridad

Por defecto el negocio principal se guarda en `server/pos.db`, los adicionales en `server/businesses/<id>/pos.db` y la clave de sesión en `server/jwt.key`. `POS_DATA_DIR` permite usar otro directorio privado. No están incluidos en Git ni en los paquetes y no se sirven por HTTP. No ejecutes dos servidores sobre el mismo directorio: existe un bloqueo por proceso.

Para respaldar, detén el servidor y usa `npm run backup -- DIRECTORIO_NUEVO`; para restaurar, usa `npm run restore -- DIRECTORIO_RESPALDO` con un `POS_DATA_DIR` vacío. El respaldo incluye todos los negocios, incluso los desactivados. Guarda una copia previa antes de usar una base antigua. El esquema se actualiza dentro de una transacción; se conservan cuentas y ventas existentes. Los PIN antiguos que estaban en texto se convierten a hashes. Cambia cualquier PIN de demostración que todavía exista en una base antigua.

Las ventas que únicamente estaban en el antiguo `localStorage` NO se importan automáticamente: exporta/respalda esa información antes de actualizar. No hay conciliación automática con ventas históricas del navegador; podrían duplicar registros del servidor. La interfaz nueva conserva una copia local de esos registros bajo `pos_control_state_v1:archive:...`, sin PINs ni configuración con secretos. La copia requiere conciliación manual y no se utiliza para cobrar.

## Varios dispositivos en la red

Arranca el único servidor con `POS_HOST=0.0.0.0` y abre `http://IP-DEL-SERVIDOR:3000` en cada dispositivo autorizado. Todos deben usar el mismo servidor. Para exposición fuera de una red de confianza, configura HTTPS y controles de red. No publiques directamente el puerto en Internet.

El cliente usa el origen desde el que se abrió. El botón **Configurar servidor** permite elegir otra URL cuando sea necesario. Para clientes alojados en otro origen, configura `POS_ALLOWED_ORIGINS` con una lista de orígenes exactos separados por comas; los navegadores bloquean combinaciones inseguras de HTTP/HTTPS. El flujo verificado es servir la web desde el propio servidor POS. El arranque de Electron y los recursos de Android se preparan con scripts reproducibles; falta validar binarios en cada plataforma (README_RELEASE.md y README_ANDROID.md).

## Cobros y sincronización

- Autenticación obligatoria, PIN con bcrypt, sesiones expirables y permisos validados por el servidor.
- Las acciones ejecutivas comprueban el PIN adicional en el servidor; no hay bloqueo basado únicamente en JavaScript.
- Los precios, impuestos, cambio y existencias se calculan/validan en el servidor, con importes en centavos durante el cálculo.
- Venta, partidas, existencias, comprobante, asiento y clave de reintento se guardan en una sola transacción. Los errores revierten todos esos cambios.
- Si se pierde la respuesta del cobro, el cliente conserva la misma solicitud y su identificador. Pulsa **Cobrar venta** para recuperar el resultado; no crees otra venta para reemplazar una pendiente. La confirmación repetida devuelve la venta original.
- Los rechazos del servidor no crean ventas locales. No se permite cobrar sin conexión. Un carrito pendiente bloquea modificaciones hasta resolver la operación. Las operaciones pendientes quedan asociadas al servidor, negocio y usuario originales. El cambio de negocio exige confirmar primero los cobros, cotizaciones y recepciones pendientes.
- La caja es compartida entre terminales del mismo negocio; cada negocio tiene su propia caja. No representa cajas independientes por terminal. Los cierres anteriores quedan en el servidor.
- Stock, ventas, caja, mesas y pedidos provienen del servidor. Las pantallas de cocina/cliente requieren una sesión en ese navegador y se actualizan por consulta periódica autenticada.

## Alcance de comprobantes

El PDF es un **comprobante interno sin autorización fiscal**. La integración de Hacienda recuperada era una plantilla sin firma ni envío real. Los endpoints de activación/envío responden `501` para evitar presentar esa integración como operativa. El envío manual por correo genera el mismo PDF en memoria y requiere configuración SMTP. Las pruebas construyen adjuntos sin enviar mensajes; la entrega real debe validarse con tu proveedor. No se generan instaladores en esta revisión.

## Pruebas

```sh
npm test
```

Las pruebas levantan servidores y bases temporales, incluyendo la interfaz en un DOM con HTTP real: acceso, roles, secretos, venta, reintentos simultáneos, falta de existencias, cierre de caja, cambios de usuarios, reinicio, persistencia y reversión ante errores de disco. También verifican migración del principal, separación entre negocios, configuración, pestañas independientes y respaldo/restauración de varias bases.

Para el recorrido de navegador (opcional, requiere Playwright y Chromium):

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium --only-shell
node tests/browser-smoke.cjs
```

No usan tu base de datos. No ejecutes las pruebas contra una instalación de producción.

## Mejoras y actualización

- Compras y gastos rechazan fechas imposibles, montos negativos y totales incoherentes.
- El cierre mensual solo admite meses terminados (UTC), devuelve el mismo cierre al repetir y bloquea nuevas compras/gastos en ese período.
- Los conteos comparan las existencias actuales del servidor. La casilla **Ajustar existencias** requiere un motivo y genera un movimiento auditable. Alta, edición, baja y ventas también registran movimientos; `GET /api/inventory/movements` permite consultarlos como administrador o gerente.
- Cocina conserva los pedidos listos, reintenta conexiones fallidas y rechaza retrocesos desde entregado/cancelado.
- Los CSV escapan comillas y neutralizan celdas que podrían interpretarse como fórmulas.
- El manifiesto usa un icono local. No hay cobros ni caché de ventas sin conexión.

Para actualizar una instalación existente: detén el servidor, conserva una copia íntegra del directorio anterior y de los datos del navegador, instala el código nuevo en otra carpeta y configura `POS_DATA_DIR` apuntando a una **copia** de los datos. Ejecuta `npm run setup:server`, `npm test` y `npm start`. La base se migra al arrancar; no sobrescribas la única copia de datos originales. Los registros incompletos históricos requieren conciliación manual: no se inventan partidas ni totales para repararlos.

### Respaldo y restauración verificados

Con el servidor detenido y `POS_DATA_DIR` configurado para tu instalación:

```powershell
npm run backup -- "C:\Users\josue\Documents\respaldo-pos-nuevo"
$env:POS_DATA_DIR = "C:\Users\josue\Documents\pos-restaurado"
npm run restore -- "C:\Users\josue\Documents\respaldo-pos-nuevo"
npm start
```

El destino del respaldo debe ser nuevo y el de restauración debe estar vacío. Se comprueban SHA-256, integridad SQLite y la presencia de todas las bases registradas. La restauración invalida las sesiones de todos los negocios y conserva la instalación anterior. Para conservar PDFs históricos externos copia también el directorio `invoices` del sistema anterior. Las copias contienen datos de clientes y configuración: guárdalas con acceso restringido.

### Pendientes de producto

No se implementaron devoluciones fiscales, anulaciones con notas de crédito, costeo por lotes, impresión de etiquetas de códigos de barras ni cajas independientes por terminal. Requieren definir sus reglas operativas y ampliar el modelo contable. Tampoco se certifica Hacienda, impresión física, entrega SMTP ni instaladores con estas pruebas.

## Mejoras de la versión compartida

- **Documentos y cotizaciones:** búsqueda, filtros, ticket, PDF/JSON, correo manual y conversión de cotizaciones al carrito. La vigencia predeterminada es de 15 días y se configura de 1 a 90 días por negocio. No cobran ni reservan inventario.
- **Clientes:** directorio con búsqueda y edición, con datos completos guardados en el servidor.
- **Inventario:** SKU/código único, entrada por lector con Enter, servicios, unidades fraccionarias, categorías, costos, mínimos, recepción e historial. Las entradas calculan costo promedio ponderado y registran la compra, incluido su IVA, sin duplicarla al reintentar.
- **Precios y reportes:** descuentos/precios especiales autorizados con motivo, filtros por fecha UTC, pago y cajero, exportación y utilidad bruta estimada con costos históricos.
- **Usuarios:** cuentas activas/inactivas, revocación inmediata de sesiones y protección del último administrador.

Consulta [las reglas y límites de la integración](docs/MEJORAS_VERSION.md). Las nuevas pantallas mantienen los datos en el servidor; las operaciones pendientes de confirmación se recuperan sin registrar otra operación. Los costos antiguos sin capturar deben revisarse antes de usar la estimación de utilidad.
