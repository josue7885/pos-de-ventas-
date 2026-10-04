# Cliente Android

El teléfono utiliza un servidor POS externo. No ejecuta SQLite ni Node.js dentro del APK.

Requiere Node.js 22.12 o posterior, Android Studio y el entorno Android requerido por Capacitor 8: https://capacitorjs.com/docs/getting-started/environment-setup

Desde la raíz:

```powershell
npm ci
npm run android:add
npm run android:sync
npm run android:open
```

`android:add` se usa una sola vez. `prepare:web` copia exclusivamente recursos públicos a `www`; no copia bases, claves ni backend. `android:sync` vuelve a preparar esos recursos.

Inicia el servidor en la red con `POS_HOST=0.0.0.0`. En Configurar servidor elige su URL accesible; localhost en el teléfono identifica el teléfono. Añade el origen del cliente (`https://localhost` por defecto) a `POS_ALLOWED_ORIGINS` del servidor. Configura HTTPS para la instalación definitiva y verifica conectividad en el dispositivo. No se ha validado un APK en esta revisión.

Firma las distribuciones desde Android Studio y conserva las claves fuera del repositorio. No se incluyen comandos que requieren scripts inexistentes.
