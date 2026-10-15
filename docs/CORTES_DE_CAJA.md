# Cortes de caja X, Y y Z — POS Control 1.2.1

En **Caja → Turno y cierre** puedes emitir y consultar cortes por negocio. Los cortes son reportes internos, sin autorización fiscal.

| Corte | Uso en esta aplicación | ¿Cierra? |
|---|---|---|
| X | Consulta acumulada desde la apertura, sin conteo físico | No |
| Y | Arqueo parcial acumulado con efectivo contado | No; no reinicia importes |
| Z | Conteo final y cierre definitivo del turno | Sí |

El nombre Y no implica una definición fiscal universal: aquí significa arqueo parcial del turno completo, no cierre mensual ni acumulado de cortes Z.

## Registrar y conciliar

1. Abre turno indicando el fondo inicial.
2. Al cobrar cada venta elige **Efectivo**, **Tarjeta** o **Transferencia**. El administrador debe tener habilitados esos medios en la configuración del negocio.
3. En turno y cierre, pulsa X para consultar o Y para registrar un conteo parcial.
4. Cuenta exclusivamente el dinero físico. No incluyas comprobantes de tarjeta ni transferencias en el efectivo contado.
5. Para terminar, pulsa **Corte Z · Cerrar turno**, ingresa el conteo, una observación opcional y elige PDF, imprimir o solo guardar.
6. Recupera el documento desde el historial sin emitir otro corte. El historial muestra los últimos 200 cortes.

**Esperado = fondo inicial + ventas en efectivo + abonos en efectivo − devoluciones en efectivo.** Las ventas en efectivo usan su importe neto del cambio entregado, no todo el dinero recibido.

**Diferencia = contado − esperado**: negativa significa faltante; positiva, sobrante; cero, cuadrado. No se fuerza el conteo a coincidir con el sistema.

Ejemplo: fondo inicial $100, ventas en efectivo $113, abonos en efectivo $20 y devoluciones en efectivo $13: esperado **$220**. Si cuentas $215, hay un faltante de **$5**. Tarjetas y transferencias se informan aparte.

Las ventas al crédito no suman dinero al emitirse. Sus abonos se registran en el turno en que se reciben. Una devolución de una venta anterior afecta el turno en que se devuelve el dinero. El total emitido de ventas se muestra separado de los cobros netos y antes de notas de crédito. La diferencia solo concilia efectivo; no compara tarjetas o transferencias con estados bancarios.

Esta versión no registra retiros ni ingresos manuales de caja. No retires ni agregues dinero sin considerar que eso producirá una diferencia. El conteo Y no traslada efectivo ni reinicia el fondo.

## Documentos y plataformas

Cada corte conserva los datos del emisor, moneda, ventas, cobros, conteo, responsable y fecha tal como estaban al emitirlo. Cambiar la configuración después no modifica su PDF/JSON. La fecha del documento está en UTC y el historial muestra la hora local del dispositivo.

- Navegador y escritorio Windows/macOS/Linux: PDF A4 y documento HTML imprimible con el diálogo del sistema.
- Android/iOS: PDF mediante la función nativa de compartir. Guárdalo o ábrelo en un lector compatible y selecciona Imprimir. No hay impresión silenciosa ni conexión directa nueva a impresoras Bluetooth.
- Todos consumen la misma API del servidor. Se debe actualizar el servidor y volver a compilar las aplicaciones instaladas para incorporar los nuevos controles.
- El modo independiente con base de datos en el teléfono y envío diferido al servidor sigue pendiente; esta entrega no lo implementa.

## Seguridad y recuperación

Administrador, gerente y cajero pueden emitir cortes. Contador puede consultar y exportar el historial, pero no abrir, emitir ni cerrar turnos. Cocina y mesero no tienen acceso a cortes. Cada negocio mantiene su historial separado.

Z guarda el corte y cierra el turno en una sola transacción. Los reintentos conservan el identificador de operación. Si se perdió la respuesta, pulsa **Recuperar corte pendiente** en el mismo navegador/dispositivo; no registres otro cierre manualmente. Solo puede existir un corte Z por turno. Se conservan los cierres antiguos, pero no se inventan documentos históricos para cierres anteriores a esta actualización.

## Actualizar y verificar

Detén el servidor de forma normal y realiza un respaldo con el procedimiento de la instalación antes de actualizar. Conserva la misma carpeta POS_DATA_DIR para mantener datos. No borres los datos ni desinstales la app Android para actualizarla.

```powershell
git pull --ff-only origin fix/backend-auth-sales-sync
npm.cmd run setup:server
npm.cmd test
npm.cmd ci
npm.cmd run android:sync
# Con JAVA_HOME configurado a Temurin 21 y SDK instalado:
.\android\gradlew.bat -p .\android assembleDebug
```

Instala el nuevo APK sobre la app anterior usando la misma firma. Reinicia el servidor con sus variables de red y datos habituales. Las tablas nuevas se crean automáticamente sin eliminar las ventas anteriores.

Prueba una venta por cada medio, un abono y una devolución. Emite X, luego Y con un faltante y otro con un sobrante; verifica que permiten seguir vendiendo. Cierra con Z y confirma que ya no admite ventas hasta abrir un turno. Descarga PDF/JSON, reimprime, reinicia y confirma que el mismo corte sigue disponible. Comprueba también otro negocio y los permisos del contador.
