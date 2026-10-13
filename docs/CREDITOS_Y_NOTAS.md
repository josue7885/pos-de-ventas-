# Ventas al crédito, notas y abonos

Estos documentos son registros internos del POS. El comprobante de crédito fiscal existente conserva su identificación interna; esta actualización no implementa emisión ni autorización de DTE.

## Activar y vender al crédito

1. Como administrador, entra en **Configuración → General → Operación del negocio**.
2. En métodos de pago marca **Venta al crédito** y conserva al menos un medio para recibir abonos. Guarda la configuración. La opción está desactivada inicialmente y se configura por negocio.
3. Abre caja y entra en **Caja → Venta**. En **Clientes registrados** selecciona al cliente; si es nuevo, regístralo primero con nombre, documento, correo y teléfono.
4. Agrega productos, selecciona **Venta al crédito** como pago e indica el vencimiento (fecha UTC).
5. Puedes elegir **Crédito fiscal interno** como tipo de comprobante; requiere nombre y NIT. Tipo de comprobante y condición de pago son opciones diferentes: también puedes emitir crédito fiscal con pago al contado.
6. Confirma **Registrar deuda**. El servidor registra la venta, descuenta los productos y crea el saldo completo. No ingresa efectivo inicial. Para anticipos, registra inmediatamente un abono en Documentos.

Los precios del catálogo continúan incluyendo IVA; no se suma nuevamente. El servidor usa los datos del cliente registrado para identificar al deudor. Si cambias esos datos en el editor, guarda el cliente antes de emitir la venta al crédito.

## Consultar y abonar

En **Documentos → Comprobantes**, la sección **Cuentas por cobrar** muestra cliente, vencimiento, importe original, notas acreditadas, abonos netos de devoluciones y saldo. Busca por cliente o número; una cuenta con saldo y vencimiento anterior a hoy se marca vencida.

Pulsa **Registrar abono**, escribe el importe recibido, una referencia y el medio de pago. Confirma para guardar y generar un recibo **AB-000001**. Se requiere caja abierta. Administrador, gerente y cajero pueden registrar abonos; contador consulta los documentos.

- Se rechazan importes cero, negativos, con más de dos decimales o superiores al saldo.
- Los abonos no generan otra venta ni nuevo IVA.
- Un pago en efectivo se suma a la caja del turno en que se recibe. Tarjeta y transferencia se registran en su medio respectivo.
- El PDF y JSON del recibo conservan el saldo al momento de emisión. La cuenta muestra el saldo actual.

## Emitir una nota de crédito

Como administrador o gerente, busca la venta en **Documentos → Comprobantes** y pulsa **Nota de crédito**. Se abre una ventana con la venta de referencia.

1. Indica el importe final a acreditar, con el impuesto incluido, y un motivo.
2. Revisa la vista previa: cuánto reduce la deuda y cuánto se devuelve al cliente.
3. Si existe devolución de dinero, selecciona el medio y mantén la caja abierta. La confirmación registra que esa devolución se ha realizado; no ejecuta transferencias bancarias ni reembolsos a tarjetas.
4. Confirma para generar la nota **NC-000001**.

La suma de notas nunca puede superar el total original. Primero se reduce el saldo pendiente y solo el excedente se registra como devolución del dinero cobrado. La base y el IVA se distribuyen proporcionalmente usando los importes históricos, con ajuste acumulado de centavos. La venta original permanece intacta.

**La nota es un ajuste monetario y no modifica existencias.** Si recibes mercancía devuelta, registra su ajuste físico por separado en Inventario con una referencia a la nota. No se cambian automáticamente los costos históricos de la venta.

## PDF, correo y WhatsApp

Al guardar una nota o un abono aparecen **Imprimir**, **PDF**, **JSON**, **Enviar correo** y **WhatsApp**. También están en el listado y en los comprobantes de venta y cotizaciones.

- **PDF:** descarga el documento con cliente, número, referencia original, importes y saldo al emitir.
- **Correo:** solicita el destinatario y envía PDF y JSON mediante el SMTP configurado en ese negocio. Un problema de correo no anula el documento. Si el envío queda sin confirmar, revisa la bandeja antes de reenviar.
- **WhatsApp:** prepara el PDF y abre una ventana para compartir. En navegadores compatibles, **Compartir PDF** abre el menú del dispositivo para elegir WhatsApp. En Windows o navegadores sin esa función, pulsa **Descargar PDF**, escribe el teléfono con código de país —por ejemplo `503` y los ocho dígitos— y pulsa **Abrir WhatsApp**. Adjunta el archivo y confirma el envío en el chat. El enlace no adjunta automáticamente el PDF, y la aplicación no publica documentos privados en enlaces públicos.

Fuentes de compatibilidad: [WhatsApp: abrir un chat](https://faq.whatsapp.com/5913398998672934) y [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API). Compartir archivos depende del navegador y del dispositivo; se comprueba antes de habilitar el botón.

## Recuperación, caja y reportes

Si se pierde una respuesta al guardar, conserva los datos del navegador y usa **Confirmar** otra vez o el panel **Recuperar nota de crédito / abono**. Se reutiliza la operación pendiente y no se duplica. Los campos quedan bloqueados mientras haya un resultado por recuperar. Al reabrir el formulario se muestra la venta de esa operación pendiente. No registres el mismo cobro en otro equipo para intentar recuperarlo.

Cada negocio mantiene sus propias ventas, notas, clientes, saldos, abonos y correlativos. Cerrar sesión o cambiar de negocio limpia la vista. Los datos y las claves de recuperación persisten en el servidor después de reiniciar.

El resumen y cierre mensual descuentan notas y su IVA en la fecha de emisión. El libro interno de IVA registra las notas con signo negativo. Inicio y el detalle de ventas muestran ventas emitidas, incluidas las ventas al crédito, sin descontar notas; no equivalen al efectivo cobrado. El PDF mensual separa ventas emitidas, notas y ventas netas. Los abonos no duplican esos ingresos. Las operaciones nuevas no pueden modificar un período cerrado.

## Prueba rápida con datos separados

- Crea un producto de **$113 con IVA del 13%** y existencias suficientes, y registra un cliente.
- Vende una unidad al crédito: base **$100**, IVA **$13**, saldo **$113** y sin efectivo recibido.
- Abona **$20 en efectivo**: saldo **$93**, caja aumenta **$20**, recibo AB.
- Emite una nota de **$30**: base acreditada **$26.55**, IVA **$3.45**, saldo **$63**, sin devolución de efectivo.
- Descarga PDF y JSON; verifica referencia, cliente y totales. Prueba correo con una dirección propia y WhatsApp confirmando el destinatario.
- Intenta abonar más de **$63** o emitir notas que acumuladas superen **$113**: el sistema debe rechazarlas.

Pruebas automáticas: `npm test`. Para navegador, con Playwright instalado: `node tests/credit-browser.cjs`. La prueba de WhatsApp usa simulaciones y la de correo un servidor SMTP local de pruebas; no envían mensajes reales.
