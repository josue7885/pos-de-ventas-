# Corrección de apertura de turno — POS Control 1.3.0

La apertura anterior usaba `window.prompt()` para pedir el efectivo inicial.
Electron no admite esa función y la solicitud nunca llegaba al servidor.
Esta corrección usa un formulario flotante con efectivo inicial y confirmación.

## Actualizar el portable en carpeta de Windows

1. Termina cualquier operación pendiente y cierra POS Control normalmente.
2. Abre la carpeta que contiene `POS Control.exe` y entra en `resources`.
3. Comprueba que allí existen `app.js` e `index.html`. Conserva una copia de
   ambos en una carpeta de respaldo fuera de `resources`.
4. Extrae el ZIP `POS-Control-1.3.0-Correccion-Turnos.zip`.
5. Copia los dos archivos de su carpeta `resources` a la carpeta `resources`
   de tu aplicación. Reemplaza esos dos archivos; no reemplaces ni borres toda
   la carpeta y no modifiques `server`, bases de datos ni el perfil de Windows.
6. Abre de nuevo `POS Control.exe`. Entra en Caja > Turno y cierre > Abrir turno.
7. Escribe el efectivo real de apertura y pulsa Confirmar apertura. Un importe
   cero es válido. Comprueba el efectivo inicial y que la caja figure abierta.

Esta actualización está preparada para el portable en carpeta 1.3.0 entregado
en este chat. El portable de un solo ejecutable extrae sus archivos a una
carpeta temporal: utiliza el portable en carpeta para aplicar esta actualización.
El parche conserva la versión base 1.3.0 y no reinstala dependencias.

## Actualizar desde el código fuente o un servidor externo

Sustituye `app.js` e `index.html` en la raíz del proyecto que sirve la interfaz,
conservando copia de los originales. Recarga las pantallas conectadas. Si la
aplicación está en modo Terminal, la corrección debe aplicarse al servidor al
que se conecta. No importa datos entre servidores ni cambia credenciales.

## Validaciones realizadas

- Cancelar no abre un turno ni envía una solicitud.
- Se rechazan importes vacíos, negativos, mayores de 1,000,000 o con más de
  dos decimales. Se aceptan cero y cantidades como 25.50.
- Se bloquean envíos simultáneos desde el formulario.
- Si se pierde la respuesta después de guardar, se consulta el estado real
  de caja antes de ofrecer otro intento.
- La apertura conserva el contexto de usuario, negocio y servidor.
- Pasaron seis pruebas automatizadas: interfaz con HTTP real y los cinco
  casos de cortes X/Y/Z, incluyendo persistencia, PDF y HTML para impresión.
- La prueba de interfaz fuerza que `prompt()` lance un error, como Electron.
- Se actualizaron las pruebas de navegador y escritorio para recorrer el
  formulario nuevo. No se ejecutaron en este entorno: no había escritorio
  gráfico y la descarga de Chromium falló. Falta validar Windows real.

Para repetir las pruebas desde el repositorio:

```sh
npm run setup:server
node --test server/test/frontend.test.js server/test/shift-reports.test.js
```

El ZIP de código incluye los cambios locales sobre el commit
`ca8a97d4528ac3be2f328adac368c97a344608b2`; esta entrega no publica los cambios
en GitHub. Otros usos de `prompt()` fuera de la apertura de turno no se cambian
en este parche.
