# Administración de varios negocios

## Acceso y operación

La instalación existente se convierte en **Negocio principal** sin mover `pos.db` ni copiar sus ventas a otro negocio. Sus usuarios y PIN continúan funcionando. Las bases nuevas empiezan sin productos de demostración.

Un administrador del principal tiene acceso a **Configuración → Negocios**. Allí puede crear un negocio, cambiar el nombre mostrado en el selector, activar o desactivar su acceso e ingresar a él. El nombre comercial de los comprobantes se edita desde **Configuración → General** dentro de cada negocio. Desactivar el acceso conserva los datos; el principal debe permanecer activo.

Cada negocio tiene cuentas propias. El administrador inicial se define al crearlo; puede agregar cajeros, gerentes y otros roles desde **Configuración → Usuarios**. Un PIN o sesión de otro negocio no concede acceso. La selección queda en cada pestaña, de modo que dos pestañas pueden trabajar con negocios distintos. El selector de acceso muestra los nombres de los negocios activos antes de iniciar sesión.

Para crear:

1. Accede al principal como administrador y abre **Configuración → Negocios**.
2. Introduce nombre, perfil, moneda, nombre del administrador y PIN inicial de 6 a 12 dígitos.
3. Pulsa **Crear negocio**. Si se pierde la respuesta, usa **Consultar creación pendiente**. El reintento conserva el identificador y no crea otro negocio; no se guarda el PIN en el navegador.
4. Pulsa **Ingresar**, accede con su cuenta y abre **Configuración → General**.
5. Revisa el impuesto y la moneda antes de cargar operaciones, guarda la configuración, agrega artículos y abre caja.

## Perfiles iniciales

| Perfil | Mesas | Pedidos y cocina | Recepción de mercancía | Artículo predeterminado |
| --- | --- | --- | --- | --- |
| Tienda / comercio | No | No | Sí | Producto |
| Restaurante / cafetería | Sí | Sí | Sí | Producto |
| Servicios | No | No | No | Servicio |
| Mixto | Sí | Sí | Sí | Producto |

**Solo el administrador de cada negocio puede guardar su tipo, módulos y demás configuración.** El gerente puede administrar las cuentas permitidas desde Configuración → Usuarios, pero no modificar el perfil, ni siquiera llamando directamente a la API.

Las cotizaciones están activadas inicialmente en todos los perfiles. **Usar módulos sugeridos para este tipo** ajusta los controles del formulario; después pulsa Guardar. Puedes habilitar o deshabilitar cada módulo por separado. Los permisos del rol siguen aplicándose aunque un módulo esté habilitado. Un usuario de cocina no puede entrar si ese módulo está desactivado.

La configuración existente mantiene los módulos habilitados al migrar. Cambiar de perfil no elimina artículos ni convierte productos existentes en servicios. Los servicios nuevos no descuentan existencias.

## Opciones por negocio

- Nombre comercial, datos de empresa, logo, serie y correlativo, configuración de correo y PIN ejecutivo.
- Moneda: USD, EUR, GTQ, HNL, NIO, CRC, MXN o DOP. No hay conversión de divisas. La moneda deja de poder cambiar cuando existen ventas, cotizaciones, compras, gastos o cajas registradas, incluso cerradas.
- Formato de números y moneda; los reportes y cierres continúan usando fechas UTC.
- Nombre del impuesto y tasa única añadida al subtotal. `0.13` significa 13%; `0` permite una operación sin impuesto. La tasa inicial sigue siendo 13% y debe revisarse antes de vender. No se determina automáticamente por país ni por tipo de negocio.
- Métodos de pago habilitados: efectivo, tarjeta y transferencia; debe quedar al menos uno. El servidor rechaza nuevos cobros con métodos deshabilitados.
- Vigencia de nuevas cotizaciones entre 1 y 90 días y mensaje al pie del PDF.
- Mesas/salones, pedidos/cocina, creación de cotizaciones y recepción de mercancía.

Las otras terminales reciben la configuración al sincronizar. Los documentos anteriores permanecen disponibles. Si se deshabilita un módulo después de confirmar una operación cuya respuesta se perdió, se permite recuperar esa operación con su mismo identificador. Al cambiar de negocio, primero resuelve las ventas, cotizaciones y recepciones pendientes; un carrito sin cobrar se descarta solo tras confirmación.

Los nuevos comprobantes y cotizaciones conservan moneda, datos públicos del emisor, impuesto y pie al emitirse. Cambiar después Configuración no modifica esos datos históricos. Los perfiles idénticos se almacenan una sola vez por negocio. Para los documentos anteriores sin perfil guardado se usa la configuración actual con una nota explícita; no se inventan datos históricos.

En **Documentos → Comprobantes** puedes imprimir, descargar PDF/JSON y enviar ventas o cotizaciones por correo. Al cobrar aparecen también estas acciones en la confirmación de la venta. Todas usan solicitudes autenticadas del negocio seleccionado. Los JSON públicos excluyen costos internos y credenciales; los reportes de ventas CSV/Excel conservan columnas Negocio y Moneda. Consulta [los formatos y el flujo](NAVEGACION_Y_COMPROBANTES.md).

## Datos, respaldo y actualización

`POS_DATA_DIR` contiene `pos.db` para el principal, `businesses/<id>/pos.db` para cada negocio adicional y `jwt.key` para las sesiones. Las bases no se sirven por HTTP ni se incluyen en Git o en los recursos de los instaladores. Si falta la base registrada de un negocio, el servidor bloquea el acceso: no crea una base vacía que aparente haber perdido las ventas.

Para actualizar una instalación anterior:

1. Detén el servidor y conserva una copia completa de sus datos y de los datos pendientes del navegador.
2. Descarga el código actualizado de `fix/backend-auth-sales-sync` en otra carpeta.
3. Ejecuta `npm run setup:server` y `npm test` desde la carpeta con `package.json`.
4. Define `POS_DATA_DIR` apuntando a una **copia** del directorio de datos anterior. Para una prueba vacía, elige otro directorio y define `POS_ADMIN_PIN` con 6 a 12 dígitos.
5. Ejecuta `npm start` y abre `http://localhost:3000`. Verifica el principal antes de usar la instalación como caja real.

No basta con copiar solamente `pos.db` una vez que existen negocios adicionales. Con el servidor detenido y `POS_DATA_DIR` apuntando a los datos reales:

```powershell
npm run backup -- "$env:USERPROFILE\Documents\POS-respaldo-nuevo"
```

Para probar la recuperación sin modificar los datos anteriores, selecciona un directorio vacío:

```powershell
$env:POS_DATA_DIR = "$env:USERPROFILE\Documents\POS-restaurado-nuevo"
npm run restore -- "$env:USERPROFILE\Documents\POS-respaldo-nuevo"
if ($LASTEXITCODE -eq 0) { npm start }
```

El formato de respaldo 2 incluye principal y todos los negocios, incluso los desactivados. Verifica cada archivo y que estén todas las bases del catálogo antes de escribir la restauración. Borra las sesiones restauradas y no copia la clave de sesión. También admite respaldos del formato anterior de una sola base cuando no faltan negocios registrados. Los PDF externos de versiones antiguas requieren conservar adicionalmente su carpeta `invoices`.

## Verificación y límites

`npm test` ejecuta pruebas de HTTP real y de interfaz DOM con datos temporales. Incluye migración de una base antigua, accesos cruzados rechazados, creación simultánea con reintentos, ventas con iguales IDs en negocios distintos, configuración independiente, cambio de pestaña, recuperación tras respuesta perdida, desactivación y respaldo/restauración de tres negocios.

Los negocios no comparten inventario, cuentas, clientes ni reportes. No hay transferencias de existencias, consolidación de estados financieros o cajas independientes por terminal. El servidor y los archivos siguen siendo una instalación administrada por un mismo operador; esta versión no incorpora facturación de suscripciones ni aprovisionamiento de una plataforma SaaS.

La moneda configurable no constituye integración fiscal para esos países: los comprobantes siguen siendo internos sin autorización fiscal. La prueba SMTP utiliza un receptor local y valida los adjuntos; no certifica entrega con Gmail u otro proveedor. Tampoco certifica impresión física, instaladores ni ejecución nativa en Windows.
