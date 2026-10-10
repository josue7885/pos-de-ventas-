# Verificación antes de distribuir

El flujo principal validado es el servidor Node.js y el cliente web. No hay instaladores certificados para producción en esta revisión.

1. Usa Node.js 22.12 o posterior y ejecuta `npm ci` y `npm run setup:server`.
2. Ejecuta `npm test` y revisa `npm audit` tanto en la raíz como en `server`.
3. Ejecuta `npm run start:electron` con `POS_ADMIN_PIN` definido para la primera ejecución. Electron guarda los datos en su directorio privado de usuario; no abre automáticamente una base antigua del proyecto. Para usar una copia migrada, define `POS_DATA_DIR` explícitamente.
4. Verifica en Windows apertura, impresión, cierre, reinicio y restauración con datos ficticios antes de usar datos reales.
5. Solo después ejecuta `npm run build:win`. El paso previo instala dependencias de producción del servidor; para volver a probar ejecuta `npm run setup:server`.

El empaquetador incluye una lista explícita de recursos web y backend con sus dependencias. Excluye bases, claves, comprobantes archivados y pruebas. Los recursos del servidor van fuera de ASAR. No distribuyas una carpeta de datos dentro del código fuente.

Los binarios generados no se firman automáticamente. Android se documenta en README_ANDROID.md. Hacienda requiere una integración real de firma, envío y validación; los endpoints de la antigua plantilla siguen desactivados.
