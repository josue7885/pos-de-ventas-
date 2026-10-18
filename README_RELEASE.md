# Instalación de POS Control 1.3.1

El escritorio incluye su propio servidor. Android puede usar un servidor externo o uno en el mismo teléfono mediante Termux; iOS continúa como terminal de un servidor externo. El servidor elegido debe permanecer activo. El APK no incluye todavía un backend integrado. [Guía del servidor Android y envío de documentos](docs/ANDROID_SERVIDOR_LOCAL.md).

## Guías de la versión actual

- [Instalación paso a paso 1.3.1](docs/INSTALACION_1.3.1.md).
- [Actualización con respaldo y recuperación](docs/ACTUALIZACION_1.3.1.md).
- [Correcciones y validación 1.3.1](docs/CAMBIOS_1.3.1.md).

La lista `CONTENIDO-Y-VALIDACION.txt` de cada entrega identifica sus paquetes reales. Las notas históricas siguientes no significan que todos los binarios estén disponibles en una ejecución nueva.

## Cambios 1.3.0

Selector de servidor local/externo con verificación, lanzador Termux con datos privados separados del código, y envío persistente de copias PDF/JSON de ventas, cotizaciones, créditos, abonos y cortes. Emparejamiento mediante claves revocables por negocio; reintentos sin duplicar copias; correo manual desde el receptor con protección contra reintentos inciertos. No fusiona inventarios ni ventas.

La interfaz es común a web, escritorio y móvil; el lanzador Termux es exclusivo para Android. El teléfono funciona sin computadora mientras Termux permanezca activo. No se generaron APK ni instaladores nuevos 1.3.0 en esta revisión. Falta validar Termux en un teléfono físico y la impresión real.

En 1.3.0 pasaron 69 pruebas del servidor, 4 pruebas de instalación y el recorrido Chromium en tamaños de escritorio y móvil. Se verificó el envío entre dos servidores, incluidos reinicio, respuesta perdida y reintento sin duplicación; el correo se probó con un SMTP local de prueba.

## Cambios 1.2.1

Cortes X/Y/Z, conciliación de efectivo, separación de tarjetas/transferencias/abonos/devoluciones, historial por negocio y exportación PDF/HTML/JSON. [Instrucciones de cortes](docs/CORTES_DE_CAJA.md).

La nueva interfaz es compartida por web, escritorio y móviles. Es necesario actualizar el servidor y recompilar cada aplicación instalada. No se han generado instaladores ni un APK nuevos de 1.2.1 en esta revisión. El usuario confirmó que el APK anterior 1.2.0 abre y funciona en su teléfono Android conectado al servidor de Windows; esto no verifica todavía los cortes nuevos en el dispositivo. En esa revisión todavía no estaba disponible el lanzador Termux incorporado en 1.3.0.

En 1.2.1 pasaron 64 pruebas del servidor (incluido el recorrido DOM con HTTP real), 4 pruebas de instalación y el recorrido Chromium de ventas con cortes X/Y/Z en vista de escritorio y móvil. Se revisaron visualmente las dos páginas del PDF de corte. No se ha probado una impresora física.

## Estado verificado de 1.2.0

El código 1.2.0 está en `fix/backend-auth-sales-sync`. Pasaron 59 pruebas del servidor, 4 de instalación y los dos recorridos de Chromium. El backend empaquetado en Linux arrancó con el Node integrado, sirvió los recursos públicos, autenticó al administrador y conservó un producto después del reinicio. Se generaron paquetes Linux AppImage, DEB y TAR.GZ localmente. El asistente se comprobó en navegador; la apertura de la ventana nativa no pudo ejecutarse en este entorno por restricciones de sockets del sistema.

La ejecución [Installers del 14 de octubre de 2026](https://github.com/josue7885/pos-de-ventas-/actions/runs/38500460194) quedó bloqueada **antes de ejecutar pruebas o compilaciones**. GitHub informó: `The job was not started because your account is locked due to a billing issue.` No hay paquetes descargables de esa ejecución. El titular debe revisar la facturación de GitHub y después volver a ejecutar los trabajos. Esa ejecución no generó instaladores nativos. Posteriormente el usuario compiló e instaló el APK Android 1.2.0 localmente y confirmó su funcionamiento conectado al servidor. Ese fue el estado de aquella ejecución; consulta la lista de contenido y validación de la entrega actual para Windows/Linux. La validación física de cada plataforma sigue siendo independiente de compilar sus binarios.

Mientras se resuelve GitHub Actions puedes compilar localmente con los comandos de esta guía. No se modificó la facturación ni se contrató ningún servicio.

## Descargar paquetes

Abre [Actions → Installers](https://github.com/josue7885/pos-de-ventas-/actions/workflows/installers.yml), selecciona la ejecución más reciente de `fix/backend-auth-sales-sync` y comprueba su commit. Cuando termine correctamente, descarga **Artifacts** (requiere sesión de GitHub). Descomprime el ZIP de GitHub para encontrar el instalador y `SHA256SUMS.txt`. La retención es de 30 días; se puede volver a compilar la misma versión.

| Plataforma | Archivo | Uso |
|---|---|---|
| Windows x64 | `Windows-x64-Setup.exe` | Instalador con selección de carpeta y acceso directo |
| Windows x64 | `Windows-x64-Portable.exe` | Ejecutable sin instalar; los datos siguen en el perfil del usuario |
| macOS Intel / Apple Silicon | `.dmg` / `.zip` de x64 / arm64 | Arrastrar POS Control a Aplicaciones; elegir tu arquitectura |
| Linux x64 | `.AppImage`, `.deb`, `.tar.gz` | AppImage ejecutable, paquete Debian/Ubuntu o carpeta extraída |
| Android 7 o posterior | `Android-pruebas.apk` | APK de prueba; requiere permitir instalación de esta fuente |
| iPhone / iPad | `iOS-Simulador.zip` | Solo simulador de Xcode; **no es un IPA instalable en teléfonos** |
| Navegador, incluido móvil | URL del servidor | No requiere instalar la aplicación |

Los paquetes nuevos usan la versión de `package.json` (1.3.1 en esta revisión); los artefactos antiguos conservan su versión original. Cada trabajo de compilación publica su propio paquete; un trabajo fallido no implica que exista su instalador. Los binarios de escritorio de esta automatización no llevan certificado de editor. El APK usa una clave de prueba regenerada por el entorno: para actualizaciones continuas utiliza una clave de distribución propia. macOS requiere firma y notarización para distribución pública sin avisos; iOS requiere un equipo Apple y perfiles de firma. No desactives las protecciones del sistema de forma global.

## Primer inicio

1. Abre POS Control y elige **Servidor principal** en una sola computadora.
2. Define y repite un PIN de administrador de **6 a 12 dígitos**. No se guarda en el archivo de configuración.
3. Mantén el puerto `37891`. Si conectarás otras cajas o teléfonos, marca **Permitir conexiones de mi red local** y permite ese puerto en el firewall solo para tu red privada.
4. Entra como administrador. Configura el negocio, usuarios, inventario con **IVA incluido**, impresora y correo SMTP.
5. En otras computadoras elige **Terminal**, e introduce `http://IP-DEL-SERVIDOR:37891` o la URL HTTPS del servidor. No elijas Servidor principal en cada caja: crearía datos separados.
6. En Android/iOS usa **Configurar servidor** en la pantalla de acceso. `localhost` en un teléfono es el teléfono, no la computadora.

En el menú **POS Control → Configurar esta instalación** puedes cambiar modo, puerto y acceso de red. Termina primero cualquier cobro pendiente. **Abrir carpeta de datos** muestra la ubicación real.

En Android se permite HTTP para una red local de confianza; usa HTTPS para la instalación definitiva. En iOS utiliza HTTPS válido: no se desactiva la comprobación de certificados ni ATS. El servidor local habilita los orígenes móviles `https://localhost` y `capacitor://localhost` al activar el acceso de red. Un servidor Node separado requiere esos valores en `POS_ALLOWED_ORIGINS`. No abras el puerto directamente a Internet: para acceso remoto configura HTTPS y el acceso de tu red.

## Datos y actualizaciones

La instalación mantiene `installation.json` y `data` en el perfil de usuario de Electron (`pos-control-multiplatform`): `%APPDATA%` en Windows, `~/Library/Application Support` en macOS y `$XDG_CONFIG_HOME` o `~/.config` en Linux. El menú muestra la ruta efectiva. `POS_DATA_DIR` permite seleccionar un directorio de datos diferente. Los binarios no contienen ventas, claves JWT, SMTP ni bases de clientes.

El portable **no guarda la base junto al EXE**. No borres el perfil al actualizar. Mantén una sola instancia del servidor por directorio de datos. El puerto fijo conserva el origen del navegador entre reinicios; al migrar desde una versión de puerto aleatorio, confirma antes todas las ventas pendientes en la instalación anterior.

Antes de actualizar: termina cobros pendientes, sal del programa mediante **POS Control → Salir** (en macOS cerrar la ventana puede dejarlo ejecutándose) y respalda todo el directorio de datos. Para una migración desde el servidor Node usa `npm run backup` / `npm run restore` según el README principal, con ambas instalaciones detenidas. Prueba primero una copia y conserva el original. Instalar el EXE no importa automáticamente los datos de la antigua carpeta `server`.

La actualización es manual: instala la nueva versión y conserva el mismo perfil. Las migraciones se ejecutan al arrancar. No hay descarga ni instalación automática de actualizaciones.

## Compilar desde el código

Usa Node.js 24 y la raíz que contiene `package.json`:

```sh
npm ci
npm run setup:server
npm test
npm run test:installation
```

Después, **en el sistema correspondiente**:

```sh
# Windows
npm run build:win
# macOS (ambas arquitecturas)
npm run build:mac -- --arm64 --x64
# Linux x64
npm run build:linux
npm run checksums
```

Los paquetes quedan en `dist`. La preparación instala solo dependencias de producción del backend. Antes de volver a ejecutar pruebas usa `npm run setup:server`. Los scripts pasan `--publish never`; no publican una release automáticamente. `build:all` existe para entornos configurados para compilación cruzada, pero no sustituye las herramientas y firma de cada plataforma.

Para firmar Windows/macOS utiliza las variables de firma de electron-builder (`CSC_LINK`, `CSC_KEY_PASSWORD` y las credenciales de notarización aplicables) en un entorno privado. El flujo incluido está destinado a paquetes de prueba sin certificados. Nunca agregues claves al repositorio.

## Verificación de cada instalación

Con datos ficticios: primer inicio/PIN, cerrar y reabrir, acceder desde segunda terminal, abrir caja, crear producto y cliente, cobrar sin duplicar, comprobar existencias, PDF/ticket, crédito/abono/nota, cambio de negocio, restricción de configuración a administrador y respaldo/restauración. Comprueba impresora real y entrega SMTP con tu proveedor. En móviles comparte PDF y JSON desde una app real; elegir WhatsApp no envía automáticamente a un destinatario.

Las pruebas automatizadas verifican lógica y navegador; la compilación no certifica impresoras, entrega externa de correo ni funcionamiento en todos los modelos de teléfono. Hacienda permanece desactivado: los documentos son comprobantes internos.

Fuentes técnicas: [Electron Builder](https://www.electron.build/multi-platform-build), [Capacitor 8](https://capacitorjs.com/docs/getting-started/environment-setup).
