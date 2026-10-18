# POS Control 1.3.1 — Guía de actualización y respaldo

Objetivo: reemplazar el programa conservando usuarios, negocios, ventas, inventario, créditos, cortes y configuración. La actualización es manual; no hay descarga automática de versiones.

## 1. Antes de cambiar archivos

1. Confirma cualquier cobro, abono, cotización o corte pendiente en el sistema anterior. No inicies otra operación para sustituir una pendiente.
2. Anota la URL y puerto de cada terminal, la ubicación efectiva de los datos y la versión anterior. En escritorio usa **POS Control → Abrir carpeta de datos**.
3. Avisa a las otras terminales y deja de registrar operaciones.
4. Sal de POS Control mediante **POS Control → Salir**, o detén Node/Termux con Ctrl+C. Cerrar la ventana de una terminal no detiene necesariamente el servidor.
5. Respalda con el servidor detenido. Conserva una copia externa y la versión anterior del programa.

No copies una base en uso. No borres archivos de bloqueo para forzar el respaldo: si aparece “Existe un bloqueo de datos”, verifica que se haya detenido el servidor correcto.

## 2. Dónde están los datos

| Instalación | Ubicación predeterminada |
| --- | --- |
| Windows escritorio/portable | `%APPDATA%\pos-control-multiplatform\data` |
| Linux escritorio | `~/.config/pos-control-multiplatform/data` |
| macOS escritorio | `~/Library/Application Support/pos-control-multiplatform/data` |
| Servidor Node original | Carpeta `server` del proyecto |
| Guía nueva de servidor Windows | `%LOCALAPPDATA%\POS-Control-Servidor\data` |
| Lanzador Android/Termux | `~/.local/share/pos-control` |

`POS_DATA_DIR` puede cambiar cualquiera de esas rutas. En Linux también influye `XDG_CONFIG_HOME`. Usa la ruta de tu instalación real, no una carpeta vacía creada por error. Instalar una nueva app no importa automáticamente la base de otra modalidad.

## 3. Windows portable o instalador

Con todas las instancias cerradas, copia la carpeta completa del perfil `pos-control-multiplatform` a una ubicación de respaldo. Incluye `data` e `installation.json`. Si los datos están en una ubicación personalizada, respáldala también. Conserva los PDF externos del antiguo directorio `invoices` si existen.

Para el perfil predeterminado, puedes hacer la copia desde PowerShell:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $perfilPOS = Join-Path $env:APPDATA 'pos-control-multiplatform'
    if (-not (Test-Path $perfilPOS)) { throw 'No existe el perfil predeterminado. Revisa la ruta real de datos.' }
    $respaldoPOS = Join-Path $env:USERPROFILE ('POS-Respaldo-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    if (Test-Path $respaldoPOS) { throw 'El destino de respaldo ya existe.' }
    Copy-Item -LiteralPath $perfilPOS -Destination $respaldoPOS -Recurse
    Write-Host "Respaldo guardado en $respaldoPOS"
}
```

Este comando no detiene el servidor ni verifica SQLite: ejecútalo únicamente después de salir del programa. Revisa que el respaldo contiene la base y cópialo a otro disco.

Después:

1. Extrae la carpeta portable 1.3.1 en una **carpeta nueva**. No mezcles DLL ni archivos de distintas versiones.
2. Abre el nuevo `POS Control.exe` usando el mismo usuario de Windows. Si usabas `POS_DATA_DIR`, conserva la misma configuración.
3. Si usas Setup, instala la nueva versión después del respaldo; conserva el perfil de usuario.
4. La nueva aplicación reutiliza el perfil. Si aparece un negocio vacío o el asistente inicial inesperadamente, **detente y revisa la ruta** antes de crear nuevas ventas.
5. Verifica negocio, productos, última venta y caja; después cambia el acceso directo hacia la nueva carpeta. Conserva la carpeta anterior hasta completar la comprobación.

La versión portable y la instalada comparten el perfil predeterminado. No arranques ambas a la vez contra la misma base.

## 4. Servidor de código en Windows

Entra en la carpeta donde realmente está `package.json`. Con el servidor detenido, establece `POS_DATA_DIR` a tu ruta efectiva. Por ejemplo, si la instalación antigua guardaba dentro del proyecto actual:

```powershell
$env:POS_DATA_DIR = Join-Path (Get-Location).Path 'server'
npm.cmd run backup -- (Join-Path $env:USERPROFILE ('POS-Respaldo-DB-' + (Get-Date -Format 'yyyyMMdd-HHmmss')))
```

Comprueba que el comando terminó correctamente. El respaldo valida SQLite y conserva las bases de todos los negocios; el destino debe ser nuevo.

Si la carpeta es un clon Git, actualiza así, después del respaldo:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    if (-not (Test-Path .\package.json)) { throw 'Entra en la carpeta del proyecto.' }
    git rev-parse --is-inside-work-tree
    if ($LASTEXITCODE -ne 0) { throw 'Esta carpeta no es un clon Git. Usa el procedimiento para ZIP.' }
    $cambiosPOS = git status --porcelain
    if ($LASTEXITCODE -ne 0 -or $cambiosPOS) { throw 'Hay cambios locales o no se pudo revisar Git. Conserva esos cambios antes de actualizar.' }
    git switch fix/backend-auth-sales-sync
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo seleccionar la rama.' }
    git pull --ff-only origin fix/backend-auth-sales-sync
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar. No fuerces ni borres cambios.' }
    npm.cmd run setup:server
    if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación de dependencias.' }
    npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas; conserva el respaldo y revisa el error.' }
    npm.cmd start
}
```

No cierres esa consola si necesitas conservar la variable `POS_DATA_DIR`, o configúrala otra vez en la nueva sesión.

**Si recibiste el código por ZIP**, no tiene `.git`: extrae el código nuevo en otra carpeta, instala con `npm.cmd run setup:server`, prueba con `npm.cmd test` y arranca con `POS_DATA_DIR` apuntando a una copia verificada de tus datos anteriores. No ejecutes `git pull` en la carpeta del ZIP. Conserva el original intacto hasta comprobar la migración.

## 5. Android/Termux

Detén el servidor con Ctrl+C. Si lo gestiona un servicio de arranque, detén ese servicio para que no reinicie durante el respaldo. En Termux, autoriza almacenamiento compartido una vez:

```bash
termux-setup-storage
```

Respalda:

```bash
cd "$HOME/pos-control" &&
POS_DATA_DIR="$HOME/.local/share/pos-control" npm run backup -- "$HOME/storage/downloads/POS-Respaldo-$(date +%Y%m%d-%H%M%S)"
```

Copia ese respaldo fuera del teléfono. Si usas una ruta personalizada, reemplaza `POS_DATA_DIR` por la real. Cuando el respaldo termine correctamente:

```bash
(
  set -e
  cd "$HOME/pos-control"
  [ "$(git branch --show-current)" = 'fix/backend-auth-sales-sync' ] || { echo 'Revisa la rama antes de continuar'; exit 1; }
  [ -z "$(git status --porcelain)" ] || { echo 'Hay cambios locales: consérvalos antes de actualizar'; exit 1; }
  git pull --ff-only origin fix/backend-auth-sales-sync
  npm ci --prefix server --omit=dev
  bash scripts/phone-server.sh
)
```

La instalación conserva `~/.local/share/pos-control`. No desinstales Termux, no borres datos de la app y no clones encima de una carpeta existente. Si ya tienes un script de inicio automático que llama a `scripts/phone-server.sh`, sigue usando la misma ruta y evita arrancar una segunda instancia manual.

Abre Chrome en `http://127.0.0.1:3000` para comprobar la nueva interfaz. Actualizar el servidor no recompila el APK. Para actualizar también el cliente APK, genera la nueva versión con la misma clave de firma; revisa la guía de instalación.

## 6. Linux, macOS y otras terminales

Cierra la app/servidor y respalda el perfil completo o usa el respaldo offline desde el código con el `POS_DATA_DIR` correcto. Sustituye el paquete por el de la misma arquitectura y conserva el perfil. En servidores Git se aplica el mismo orden: respaldo, `git pull --ff-only`, dependencias, pruebas y arranque.

Después de actualizar el servidor, recarga las pestañas de navegador. Actualiza también los binarios de escritorio o móviles que llevan su propia interfaz; un APK antiguo conserva sus archivos web locales. Mantén la URL, puerto e identificador de negocio que utilizaban las terminales.

## 7. Restaurar y volver atrás

No arranques una versión antigua sobre la única base que ya migró una versión nueva. Si necesitas volver atrás, utiliza la versión anterior **con una copia de su respaldo anterior**.

Para un respaldo creado mediante `npm run backup`, restaura en un directorio vacío, con ambos servidores detenidos:

```powershell
# Sustituye estas dos rutas por las tuyas; el destino debe estar vacío.
$env:POS_DATA_DIR = 'C:\POS-Restaurado\data'
npm.cmd run restore -- 'C:\Ruta\Del\Respaldo'
```

Solo si la restauración termina correctamente, ejecuta `npm.cmd start`. El restaurador valida integridad y hashes, rechaza directorios de destino con datos e invalida las sesiones. Vuelve a iniciar sesión en cada terminal. No mezcles archivos de bases de distintas fechas.

Para una copia completa de perfil hecha con el programa cerrado, restaura la carpeta completa en una ubicación aparte y comprueba sus datos antes de sustituir la instalación activa. Mantén siempre el respaldo original sin modificaciones.

## 8. Comprobación posterior

- Accede al mismo negocio y comprueba usuarios, inventario y la última venta previa.
- Abre turno desde el formulario, prueba un monto inicial de cero y otro positivo en un entorno de prueba.
- Revisa venta, PDF/JSON, existencias y sincronización con otra terminal.
- En una cuenta de prueba, verifica efectivo, tarjeta, transferencia, crédito y abono; revisa los cortes X/Y/Z y sus diferencias de caja.
- Envía un documento a un correo tuyo y verifica los adjuntos. No repitas un envío de resultado incierto sin revisar primero la bandeja.
- Verifica impresión física y acceso a copias de seguridad antes de volver a operar normalmente.

Las operaciones de prueba en un negocio real quedan registradas. Utiliza una instalación o negocio de pruebas cuando necesites ensayar cobros y cortes. No se incluyen clientes, ventas ni claves reales en los paquetes de distribución.
