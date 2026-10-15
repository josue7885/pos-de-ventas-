# POS Control 1.3.0: servidor en el teléfono y envío de documentos

## Qué incluye

Puedes usar el teléfono Android como servidor local mediante **Termux**, conservando la aplicación POS Control o entrando desde Chrome. El servidor ejecuta las mismas funciones que en la computadora: usuarios y permisos, varios negocios, productos, inventario, clientes, ventas, caja, cortes X/Y/Z, cotizaciones, créditos, abonos, notas de crédito, reportes y documentos PDF/JSON.

Termux es una aplicación auxiliar. El backend **no está incorporado dentro del APK**. Una vez instaladas las dependencias, vender y generar documentos locales no requiere computadora ni Internet. El correo, WhatsApp y el envío a servidores externos sí requieren conexión. El teléfono debe permanecer encendido y el proceso de Termux activo; Android puede detener procesos en segundo plano. No es un servicio garantizado las 24 horas.

## 1. Instalar Termux en Android

Instala Termux desde uno de sus canales oficiales:

- [Instrucciones oficiales de Termux](https://github.com/termux/termux-app#installation).
- [Termux en F-Droid](https://f-droid.org/packages/com.termux/).

No mezcles aplicaciones auxiliares de Termux de distintas fuentes: sus firmas pueden ser diferentes. Esta guía no requiere root ni Termux:API.

Abre **Termux en el teléfono**. Estos comandos no se ejecutan en PowerShell ni en Android Studio:

```bash
pkg update
pkg install nodejs-lts npm git
node --version
npm --version
```

Se requiere Node.js 22 o posterior. npm se instala por separado en las versiones actuales del paquete de Termux.

## 2. Descargar y preparar el servidor

En una instalación nueva:

```bash
cd "$HOME"
git clone --depth 1 --single-branch --branch fix/backend-auth-sales-sync https://github.com/josue7885/pos-de-ventas-.git pos-control
cd "$HOME/pos-control"
npm ci --prefix server --omit=dev
bash scripts/phone-server.sh
```

Ejecuta cada línea solo si la anterior terminó correctamente. Si `pos-control` ya existe, no lo borres ni vuelvas a clonar encima; usa el procedimiento de actualización.

La primera ejecución solicita un PIN de 6 a 12 números y su confirmación. No se muestra al escribirlo. Guarda ese PIN. En siguientes inicios se conserva el usuario existente y no se cambia el PIN.

Espera el mensaje `POS server listening on port 3000`.

## 3. Conectar la aplicación o Chrome

En POS Control abre **Configurar servidor → Servidor en este teléfono / dispositivo**, prueba la conexión y conecta a:

```text
http://127.0.0.1:3000
```

Si todavía tienes el APK anterior, su botón Configurar servidor permite escribir esa misma dirección. Para utilizar todos los controles de 1.3.0 debes actualizar el APK. Como alternativa inmediata, abre Chrome en el mismo teléfono y entra a esa dirección: el navegador recibe la interfaz actual del servidor sin recompilar el APK.

Selecciona Administrador e introduce el PIN inicial. Comprueba la conexión en:

```text
http://127.0.0.1:3000/api/health
```

Debe devolver `service: pos-control` y `ready: true`.

Los datos se guardan en `$HOME/.local/share/pos-control`, dentro del almacenamiento privado de Termux y fuera del código descargado. Son **datos independientes** de la computadora. Esta instalación no importa ni fusiona el inventario anterior automáticamente.

Mantén Termux activo durante el trabajo. Configura su batería como **Sin restricciones** si tu versión de Android ofrece esa opción. El lanzador solicita `termux-wake-lock` cuando está disponible y lo libera al detenerse; esto consume batería y no impide que Android cierre la aplicación por otras causas. No desinstales Termux ni borres sus datos sin un respaldo externo.

## 4. Inicios posteriores y apagado

En Termux:

```bash
cd "$HOME/pos-control"
bash scripts/phone-server.sh
```

Para detener, vuelve a Termux y pulsa **Ctrl+C**. Para usar la app contra otra computadora o servidor, cambia la dirección mediante el selector. La aplicación comprueba el destino y exige resolver operaciones pendientes antes de cambiar. Los usuarios y el inventario son los del servidor elegido.

### Compartir el servidor del teléfono con otras cajas

Detén primero el servidor y luego inicia:

```bash
bash scripts/phone-server.sh --compartir
```

Los otros dispositivos deben conectarse a la **IP Wi-Fi del teléfono**, puerto 3000, en la misma red. En esos dispositivos `127.0.0.1` no apunta al teléfono servidor. El modo predeterminado solo escucha en el propio teléfono. No abras puertos del router para exponerlo a Internet.

## 5. Autorizar un receptor de documentos

Actualiza ambos servidores a 1.3.0. En el **receptor**, inicia sesión como administrador, elige el negocio correcto y ve a **Configuración → Autorizar dispositivos para recibir documentos aquí**.

1. Escribe el nombre del teléfono/caja.
2. Crea una clave de recepción.
3. Usa Mostrar / ocultar clave para copiarla y anota el identificador de negocio mostrado. La clave se muestra únicamente al crearla.
4. Puedes revocarla después sin eliminar documentos recibidos.

En el **teléfono emisor**, como administrador, abre **Configuración → Conexión para enviar copias de documentos**. Introduce la URL del receptor, el identificador de negocio y la clave. Guarda y pulsa **Probar autorización**.

La clave solo permite depositar copias en ese negocio; no sirve para iniciar sesión, vender, consultar inventario ni administrar usuarios. Las claves se guardan en el servidor, no en el almacenamiento del navegador. El estado público de envíos no revela la clave. Para un destino en Internet utiliza HTTPS. HTTP se admite para IP privadas y localhost.

## 6. Enviar y recuperar documentos

En **Documentos → Copias entre dispositivos**, pulsa **Preparar y enviar documentos**.

Se preparan copias de todos los documentos emitidos de estos tipos:

- Ventas y ventas al crédito.
- Cotizaciones.
- Notas de crédito y recibos de abonos.
- Cortes X, Y y Z.

Los inventarios y reportes calculados bajo demanda no se sincronizan como registros operativos. Esta función **no sincroniza existencias, usuarios ni saldos entre servidores**. Una caja que necesita vender sobre el mismo inventario debe conectarse directamente al servidor compartido.

Cada lote procesa hasta 25 documentos. El botón puede repetirse; los confirmados no vuelven a enviarse. Con envío automático activado por el administrador se revisan los pendientes cada minuto mientras la interfaz permanece abierta con sesión de administrador, gerente o cajero. No se garantiza ejecución automática con la app cerrada o suspendida.

Los estados distinguen pendiente, enviando, recibido y requiere revisión. La cola persiste tras reiniciar. Si el receptor recibió la copia pero se perdió la respuesta, el reintento devuelve la misma recepción. Un PDF/JSON que no cumple tamaño o integridad queda visible para revisión y no impide procesar los siguientes documentos del lote. Tras corregir el problema, puedes usar Reintentar. Se admiten aproximadamente 4.5 MB de PDF y 500 KB de JSON por documento.

El receptor conserva los archivos originales y los lista como **copias recibidas**. No crea otra venta, no descuenta stock y no modifica caja ni cuentas por cobrar. Los importes y datos del emisor se mantienen como estaban al preparar la copia. Cambiar el destino genera una cola propia para ese destino; no elimina la anterior. Las listas muestran hasta 200 elementos recientes, aunque la cola conserva los demás.

## 7. PDF, impresión, correo y WhatsApp

En el receptor puedes descargar PDF y JSON. En Android abre el PDF compartido en un lector compatible para imprimir; no se agregó impresión silenciosa ni un controlador Bluetooth.

Para enviar una copia por correo, configura SMTP en el receptor y pulsa **Correo** junto al documento. Solo administrador, gerente o contador puede hacerlo. El sistema adjunta el mismo PDF/JSON recibido. No envía correo automáticamente por recibir copias. SMTP aceptado no garantiza que el destinatario lo haya leído ni recibido en su bandeja principal.

Si se pierde la confirmación SMTP, el estado queda incierto y no se repite automáticamente. Revisa la bandeja del destinatario antes de una intervención manual. Un envío aceptado no se repite al hacer la misma solicitud.

Para WhatsApp, comparte el PDF con la aplicación de WhatsApp y confirma allí el destinatario y el envío.

## 8. Respaldo y actualización

Para respaldar, detén el servidor con Ctrl+C. Autoriza almacenamiento compartido una vez con `termux-setup-storage`, y después:

```bash
cd "$HOME/pos-control"
POS_DATA_DIR="$HOME/.local/share/pos-control" npm run backup -- "$HOME/storage/downloads/POS-Respaldo-$(date +%Y%m%d-%H%M%S)"
```

Copia la carpeta de respaldo fuera del teléfono. Contiene datos del negocio y configuración privada: trátala como confidencial. El respaldo de SQLite también incluye la cola de envíos y las copias recibidas, que pueden aumentar su tamaño.

Para actualizar después de respaldar y detener:

```bash
cd "$HOME/pos-control"
git pull --ff-only origin fix/backend-auth-sales-sync
npm ci --prefix server --omit=dev
bash scripts/phone-server.sh
```

No uses `git reset --hard`, no borres la base y no desinstales la app para actualizar. Conserva el mismo `POS_DATA_DIR` si elegiste uno personalizado.

## Estado de validación

Se probaron en Linux el lanzador Bash, creación de PIN, reinicio, persistencia y liberación del proceso. Se probaron dos servidores reales con desconexión simulada tras recepción, reintento, integridad de PDF/JSON, permisos, revocación, separación por negocios y correo con SMTP local de prueba. La interfaz se revisó con navegador en tamaños móvil y escritorio.

Falta la prueba física en Termux/Android y en impresora. No se ha compilado un APK ni instaladores nuevos 1.3.0 en esta revisión. iOS no usa este lanzador Termux y sigue funcionando como cliente de un servidor externo. El servidor integrado completamente dentro de un único APK permanece pendiente.

Fuentes técnicas consultadas: [Termux](https://github.com/termux/termux-app), [paquete Node.js LTS](https://github.com/termux/termux-packages/blob/master/packages/nodejs-lts/build.sh), [termux-wake-lock](https://github.com/termux/termux-tools/blob/master/termux-tools/scripts/termux-wake-lock.in).
