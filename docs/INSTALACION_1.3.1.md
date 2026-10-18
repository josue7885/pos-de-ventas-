# POS Control 1.3.1 — Guía de instalación

Esta versión corrige la apertura de turno y el envío manual de correo en el escritorio: ambos usan formularios flotantes compatibles con Electron. Conserva ventas, multinegocio, inventario, clientes, créditos, PDF/JSON, cortes X/Y/Z y conexión a servidores externos o al teléfono mediante Termux.

## 1. Elegir la modalidad

| Modalidad | Dónde se guardan las ventas | Qué debe permanecer encendido |
| --- | --- | --- |
| Windows o Linux, servidor principal | Perfil del usuario del servidor | La computadora y POS Control |
| Escritorio o móvil como terminal | Servidor al que se conecta | Ese servidor |
| Android con Termux | Almacenamiento privado de Termux | El teléfono y el proceso del servidor |
| Navegador | Servidor de la URL abierta | Ese servidor |

El APK es un cliente; no incorpora Node.js. Termux ejecuta el servidor por separado. iPhone/iPad necesita un servidor externo. Cambiar la URL no copia ni fusiona ventas, inventario o usuarios.

Consulta el archivo `CONTENIDO-Y-VALIDACION.txt` del paquete descargado para saber cuáles binarios se incluyeron realmente. El código permite preparar Windows, Linux, macOS, Android e iOS, pero disponer del código no significa que exista un instalador compilado para cada plataforma.

## 2. Windows x64: portable en carpeta

1. Descarga y extrae completamente el ZIP con **Extraer todo**. No abras el EXE desde dentro del ZIP.
2. Entra en la carpeta Windows del paquete. Si contiene otro ZIP, extráelo también.
3. Mantén juntos `POS Control.exe`, `icudtl.dat`, `locales`, `resources` y todas las DLL. Puedes mover la carpeta completa a `C:\Users\josue\Apps\POS-Control-1.3.1`.
4. Abre `POS Control.exe`. No requiere instalar Node.js ni ejecutar npm.
5. En una instalación nueva, elige **Servidor principal**, define dos veces un PIN de 6 a 12 números y conserva el puerto `37891`.
6. Para conectar otros dispositivos, activa el acceso de red local. Autoriza el puerto solo en tu red privada. En las terminales usa `http://IP-DE-LA-COMPUTADORA:37891`.
7. Entra como administrador, configura el negocio y crea tus usuarios. Registra los productos con **IVA ya incluido en el precio de venta**.
8. Abre **Caja → Turno y cierre → Abrir turno**, escribe el efectivo inicial y confirma. Ya no se utiliza la ventana `prompt()` que fallaba en Electron.

Si se incluye `Windows-x64-Setup.exe`, es la alternativa con asistente de instalación. `Windows-x64-Portable.exe` es la alternativa de un solo archivo. Para el error previo de ICU, utiliza preferentemente la carpeta portable completa. Los ejecutables de esta distribución no tienen certificado de editor; no desactives globalmente las protecciones de Windows.

**Datos:** el portable no guarda las ventas junto al EXE. Por defecto usa `%APPDATA%\pos-control-multiplatform\data`. Revisa la ubicación efectiva desde **POS Control → Abrir carpeta de datos**, especialmente si configuraste `POS_DATA_DIR`. Lee la guía de actualización antes de reemplazar una instalación existente.

### Si reaparece el error de ICU

Comprueba que estás ejecutando el EXE extraído y que `icudtl.dat` permanece a su lado. Extrae nuevamente el paquete completo a otra carpeta si faltan archivos. No descargues DLL sueltas ni copies únicamente el EXE. Revisa si el antivirus puso un archivo en cuarentena antes de decidir cómo recuperarlo.

## 3. Linux x64

Utiliza el formato incluido en el paquete:

```bash
# AppImage, desde la carpeta donde está el archivo:
chmod +x POS-Control-1.3.1-linux-x86_64.AppImage
./POS-Control-1.3.1-linux-x86_64.AppImage
```

En Debian/Ubuntu, para un DEB incluido:

```bash
sudo apt install ./POS-Control-1.3.1-linux-amd64.deb
```

Para TAR.GZ, extrae el archivo y abre `pos-control-multiplatform` desde su carpeta. No lo ejecutes como root. AppImage puede requerir FUSE compatible; si falta, utiliza DEB o TAR.GZ. No desactives el sandbox como solución general.

El primer inicio y el puerto son los mismos que en Windows. Los datos normalmente están en `~/.config/pos-control-multiplatform/data`, o bajo `$XDG_CONFIG_HOME` si está definido. Confirma siempre la ruta desde el menú de la app.

## 4. Servidor desde el código: Windows, Linux o macOS

Requiere Node.js 22.12 o posterior; se utiliza Node.js 24 en el flujo de compilación. El ZIP de código contiene `package.json`, `server` y `scripts`. Extrae a una carpeta nueva y entra en ella; no ejecutes npm desde `C:\Windows\system32`.

En PowerShell, dentro de la carpeta de código:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    if (-not (Test-Path .\package.json)) { throw 'Entra primero en la carpeta del código.' }
    npm.cmd run setup:server
    if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación.' }
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas.' }
    $env:POS_DATA_DIR = Join-Path $env:LOCALAPPDATA 'POS-Control-Servidor\data'
    if (-not (Test-Path (Join-Path $env:POS_DATA_DIR 'pos.db'))) {
        do { $pinInicial = Read-Host 'PIN inicial de 6 a 12 números' } until ($pinInicial -match '^[0-9]{6,12}$')
        $env:POS_ADMIN_PIN = $pinInicial
    }
    npm.cmd start
}
```

Este ejemplo prepara una instalación independiente; no migra automáticamente los datos de una carpeta `server` anterior. Si ya tienes datos, sigue primero la guía de actualización y usa su ubicación real.

En Bash, dentro de la carpeta de código, para una instalación nueva:

```bash
npm ci --prefix server --omit=dev && bash scripts/phone-server.sh
```

El lanzador también puede usarse en Linux/macOS con Bash y Node.js. Guarda los datos en `~/.local/share/pos-control`, pide el PIN solo al crear usuarios y escucha en `127.0.0.1:3000`.

Abre `http://127.0.0.1:3000` en el navegador del servidor. Esa dirección se escribe en el navegador o en **Configurar servidor**, no en PowerShell. Deja abierta la consola mientras uses el POS. Ctrl+C detiene el servidor.

Para compartir el servidor Node con otros dispositivos, configura `POS_HOST=0.0.0.0`, el puerto y `POS_ALLOWED_ORIGINS` según el README, o usa el lanzador con `--compartir`. Para clientes Capacitor incluye los orígenes exactos `https://localhost,capacitor://localhost`. Usa la IP del servidor en los otros dispositivos. No publiques el puerto directamente en Internet.

## 5. Android: teléfono como servidor

Si ya funciona en tu teléfono, sigue **la guía de actualización**, no vuelvas a clonar ni borres Termux.

En una instalación nueva, abre **Termux en Android**, no PowerShell:

```bash
pkg update
pkg install nodejs-lts npm git
```

Después, ejecuta el siguiente bloque; `&&` detiene la secuencia si falla un paso:

```bash
cd "$HOME" &&
git clone --depth 1 --single-branch --branch fix/backend-auth-sales-sync https://github.com/josue7885/pos-de-ventas-.git pos-control &&
cd "$HOME/pos-control" &&
npm ci --prefix server --omit=dev &&
bash scripts/phone-server.sh
```

Introduce el PIN de 6 a 12 números y repítelo. **Aunque no se vea nada mientras escribes, se está capturando.** Cuando aparezca `POS server listening on port 3000`, abre Chrome en el teléfono o configura POS Control con `http://127.0.0.1:3000`.

Mantén Termux activo y revisa sus restricciones de batería. Los datos quedan en `~/.local/share/pos-control`; desinstalar Termux o borrar sus datos puede eliminarlos. Internet no es necesario para registrar operaciones en el servidor local ya instalado, pero sí para enviar correo o documentos fuera del teléfono. La app cliente no puede cobrar cuando el servidor está detenido.

En siguientes inicios:

```bash
bash "$HOME/pos-control/scripts/phone-server.sh"
```

El inicio automático que ya configuraste se conserva si mantiene esa ruta y el mismo directorio de datos. Esta entrega no instala un nuevo servicio de arranque en Android. Consulta también [la guía de servidor Android](ANDROID_SERVIDOR_LOCAL.md).

## 6. Compilar el cliente Android

En Windows, necesitas Java 21, Android Studio, SDK 36 y Build Tools 36.0.0. Dentro del código, ejecuta cada paso solo si terminó bien el anterior:

```powershell
npm.cmd ci
npm.cmd run android:sync
npm.cmd run android:open
```

Selecciona Java 21 como Gradle JDK en Android Studio. Sincroniza el proyecto y genera el APK. Alternativamente:

```powershell
.\android\gradlew.bat -p .\android assembleDebug
```

El resultado queda en `android\app\build\outputs\apk\debug\app-debug.apk`. Para actualizar una app instalada conserva **el identificador y la clave de firma** del APK anterior. Para distribución usa una clave propia estable y guárdala fuera del repositorio. El APK de pruebas de otra máquina puede tener una clave distinta y no instalarse encima; no desinstales la app mientras tenga cobros pendientes de confirmar.

Si aún no tienes un APK actualizado, usa Chrome con la URL del servidor actualizado. El navegador recibe la interfaz nueva sin recompilar la app.

## 7. macOS e iOS

El código incluye los scripts de preparación; la lista del paquete indica si hay binarios nativos. Para macOS, desde un Mac con Node.js:

```bash
npm ci && npm run build:mac -- --arm64 --x64
```

Los DMG/ZIP se generan en `dist`. Elige arm64 para Apple Silicon y x64 para Intel. La distribución pública requiere firma/notarización.

Para iPhone/iPad, necesitas macOS, Xcode compatible con Capacitor 8 y credenciales Apple para distribuir:

```bash
npm ci && npm run ios:sync && npm run ios:open
```

Configura Signing & Capabilities en Xcode. Un paquete de simulador no es una IPA instalable en un iPhone. Usa un servidor HTTPS válido. Consulta [README_ANDROID.md](../README_ANDROID.md) para el proyecto móvil.

## 8. Correo, comprobantes y prueba inicial

Como administrador, abre **Configuración → General**, completa los datos de la empresa y la sección SMTP con los valores de tu proveedor: servidor, puerto, usuario, contraseña o credencial de aplicación y remitente. Usa la combinación de puerto y TLS indicada por ese proveedor; no compartas la contraseña en capturas ni en GitHub. Guarda la configuración en el negocio correcto.

Para enviar, abre el documento y pulsa **Correo**. Escribe el destinatario en la ventana flotante y confirma. Se adjuntan PDF y JSON. El cobro también permite solicitar el envío automático si hay correo de cliente y SMTP configurado. Si se pierde la respuesta, revisa la bandeja del destinatario antes de reenviar: una confirmación de SMTP no garantiza llegada a la bandeja principal.

Prueba con datos ficticios: acceso, apertura con efectivo, venta en efectivo/tarjeta/transferencia, existencias, PDF/ticket, correo, crédito y abono, cortes X/Y/Z y reapertura. Comprueba la impresora y tu proveedor de correo reales. El precio de inventario incluye IVA; el sistema lo desglosa sin sumarlo otra vez.

**Los documentos son comprobantes internos. No se incluye autorización, firma ni envío fiscal operativo a Hacienda.**
