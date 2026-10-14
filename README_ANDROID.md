# Android, iPhone y iPad — POS Control 1.2.0

Los móviles se conectan al servidor compartido. No contienen Node.js ni una base de ventas independiente. Configura el servidor en la pantalla de acceso; debe estar encendido y accesible. Consulta [instalación y datos](README_RELEASE.md).

## Android

Requiere Node.js 24, Java 21, Android Studio compatible con Capacitor 8, SDK 36 y Build Tools 36.0.0.

```powershell
npm ci
npm run android:sync
npm run android:open
```

`android:sync` crea el proyecto si falta y sincroniza recursos y complementos. En Android Studio ejecuta en un dispositivo o genera un APK. También puedes compilar desde PowerShell:

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Push-Location android
    try {
        .\gradlew.bat assembleDebug
        if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación Android.' }
    } finally { Pop-Location }
}
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Para distribución utiliza **Generate Signed Bundle / APK** en Android Studio, con tu propia clave estable. El APK de Actions sirve para pruebas; su clave puede cambiar entre ejecuciones. El servidor conserva las ventas, pero desinstalar la app puede borrar la URL y operaciones pendientes de confirmación: resuélvelas antes.

## iPhone / iPad

Necesitas macOS y Xcode 26 o posterior, además de Node.js 24:

```sh
npm ci
npm run ios:sync
npm run ios:open
```

El proyecto usa Swift Package Manager. En Xcode selecciona el equipo de firma y un identificador de app propio para distribuir. Comprueba **Signing & Capabilities**, selecciona un iPhone/iPad o simulador y ejecuta. Para TestFlight/App Store usa **Product → Archive → Distribute App**, tu cuenta Apple y perfiles válidos.

El script añade el texto de acceso a red local y el manifiesto de privacidad de Filesystem (`FileTimestamp`, motivo `C617.1`) como recurso del proyecto. Revisa también las declaraciones de privacidad según el uso real de tu negocio antes de distribuir.

Actions compila una aplicación de **simulador**, sin firma; ese ZIP no se instala en iPhone/iPad. Usa HTTPS con certificado válido para el servidor. Mientras preparas la firma nativa puedes abrir la URL del servidor en Safari.

## PDF, JSON, impresión y WhatsApp

Los recursos móviles incluyen el puente de Capacitor y complementos oficiales Filesystem, Share y Browser. PDF, JSON y exportaciones abren **Guardar o compartir**; desde ahí puedes elegir WhatsApp, correo, Archivos o impresión según el sistema y las apps instaladas. El botón de ticket utiliza el PDF en móviles. No hay envío silencioso por WhatsApp: debes elegir el destinatario y confirmar.

Los documentos compartidos quedan temporalmente en caché para que la app receptora pueda leerlos; al compartir de nuevo se eliminan copias POS de más de 24 horas. El sistema también puede limpiar su caché. Las ventas y los documentos originales permanecen en el servidor.

El correo SMTP configurado sigue saliendo del backend. La acción de compartir del sistema es adicional y no confirma entrega SMTP.

`www`, `android` e `ios` son directorios generados e ignorados por Git. Conserva cambios nativos personalizados antes de regenerarlos; no elimines proyectos firmados sin respaldar sus ajustes. El script no incorpora bases, PIN ni contraseñas.
