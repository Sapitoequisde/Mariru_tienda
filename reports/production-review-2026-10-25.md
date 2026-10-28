# Revisión de producción de Mariru Bazar

Fecha: 25 de octubre de 2026 · Zona: America/Hermosillo.

**Dictamen: todavía no está lista para producción.** La navegación y el catálogo funcionan, pero el flujo que registra pedidos, administra inventario y calcula ventas no es coherente de principio a fin. Hay bloqueos comprobados en la configuración del envío de pedidos y alertas de seguridad en las dependencias instaladas.

Esta revisión no modificó código de la aplicación, reglas desplegadas, productos, cuentas ni pedidos. Las escrituras de las pruebas se hicieron únicamente en simulaciones en memoria y en el almacenamiento de un navegador de prueba. Se generó este informe y evidencias locales.

## Alcance y evidencia

- Revisados frontend, autenticación, cuenta, direcciones, carrito, producto, administrador, backend, reglas Firestore/Storage, configuraciones Firebase/Vercel/GitHub Pages y textos comerciales.
- `npm run build`: correcto. Hay advertencias por `reload-splash.js` como script clásico y por paquetes grandes; compilar no demuestra que los servicios de producción estén configurados.
- `node --check functions/index.js`: correcto.
- Revisadas 14 páginas del build: no se encontraron referencias estáticas a archivos locales inexistentes ni IDs HTML duplicados.
- Navegador Chromium real: catálogo con el producto público existente, imagen cargada, detalle, agregado al carrito, resumen y apertura del formulario de pedido. **No se pulsó Enviar pedido.**
- Escritorio 1440 × 1000 y móvil 390 × 844: sin errores JavaScript observados ni desbordamiento horizontal en el inicio.
- Acceso al administrador sin sesión: redirige al inicio.
- Lectura pública de Firestore: se encontró un producto; sus campos principales tienen un formato compatible con la aplicación. No se inspeccionaron documentos personales de usuarios ni pedidos reales.
- Lectura sin autenticación de IDs ficticios válidos en `usuarios` y `pedidos`: HTTP 403 `PERMISSION_DENIED`. Esto comprueba rechazo anónimo en esas dos rutas; no sustituye pruebas completas de permisos autenticados.
- Se aplicó `find-skills` para identificar la guía de pruebas apropiada. Las pruebas en navegador usaron Playwright instalado temporalmente, sin añadir dependencias al proyecto.

Evidencias: [resultados del navegador](production-review-2026-10-25/browser-results.json), [inicio en escritorio](production-review-2026-10-25/inicio-escritorio.png), [inicio en móvil](production-review-2026-10-25/inicio-movil.png), [producto](production-review-2026-10-25/producto-escritorio.png).

## Hallazgos que deben resolverse antes de publicar

### 1. Bloqueante: el flujo actual de pedidos no está operativo en la configuración comprobada

El frontend llama a `submitWhatsAppOrder` en `us-central1`. Una petición GET de comprobación, sin enviar datos ni crear pedidos, a su ruta en el proyecto definido por `.env` devolvió **404**. La ruta antigua `placeOrder` sí respondió **400**, compatible con un callable que rechaza una petición GET.

Además, el `.env` local no tiene `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY`. El cliente interrumpe explícitamente la compra cuando `appCheck` es nulo. Si se construye con esa configuración, no se pueden enviar pedidos desde la página. La variable podría existir en otro proveedor de hosting; no se comprobó su configuración privada.

Referencias: `src/js/pages/store.js:25`, `:1169`; `src/js/services/firebase.js:26`; `functions/index.js:328`.

**Corrección:** configurar App Check y sus dominios, publicar la función correcta con sus parámetros y secreto de WhatsApp, y probar un pedido completo en staging. Firebase exige tokens válidos cuando se activa `enforceAppCheck`: [documentación oficial](https://firebase.google.com/docs/app-check/cloud-functions).

### 2. Alta: sigue existiendo otro flujo de compra con reglas comerciales diferentes

`placeOrder` exige autenticación, pero no configura App Check. Descuenta stock y agrega $80 de entrega cuando el subtotal no supera $500. La compra actual ofrece transferencia, depósito o efectivo, sin tarifas automáticas de entrega; los textos comerciales dicen que el costo se acuerda por WhatsApp. La función antigua acepta otras opciones y no envía el reporte de WhatsApp.

Se reprodujo en memoria una compra de $100 que terminó guardada como $180. El frontend actual ya no llama a esta función, pero sigue exportada y su ruta responde en el proyecto configurado.

Referencias: `functions/index.js:21`, `:49`, `:194`; `src/envios.html:70`; `src/terminos.html:84`.

**Corrección:** retirar de forma controlada el endpoint antiguo o hacerlo delegar en el mismo flujo y política comercial. Revisar por separado los pedidos históricos que haya generado.

### 3. Alta: “Mis pedidos” no puede mostrar las solicitudes nuevas del cliente

El pedido de WhatsApp no guarda `usuario.uid`, incluso si quien lo solicita inició sesión. En cambio, el historial consulta exactamente `where("usuario.uid", "==", user.uid)` y las reglas de lectura de pedidos dependen de ese dato. Se confirmó mediante una ejecución simulada con usuario autenticado: el documento nuevo no contiene `usuario`.

La interfaz promete que las compras se guardan en la cuenta, mientras que el aviso de privacidad indica que los pedidos nuevos no se asocian a una cuenta. Es una contradicción funcional y de contenido.

Referencias: `functions/index.js:475`; `src/js/pages/orders.js:41`, `:97`; `firestore.rules:27`; `src/privacidad.html:80`; `src/cuenta.html:71`.

**Corrección:** definir una política única. Se puede permitir comprar como invitado y asociar, desde el servidor, las solicitudes de usuarios autenticados; el historial, las reglas y el aviso deben reflejar ese comportamiento. No confiar en un UID recibido como campo libre del navegador.

### 4. Alta: las ventas del panel y del CSV no representan ventas confirmadas

El resumen suma `subtotal` de todos los documentos, independientemente de su estado. También cuenta todas las cantidades como vendidas. Un pedido que falló al enviarse por WhatsApp conserva el subtotal y entra en las ventas aunque se haya restaurado el stock. La prueba simulada produjo exactamente ese resultado.

Tampoco hay un flujo en el panel para confirmar pago, marcar entrega o cancelar el pedido. Las reglas impiden modificar pedidos desde el cliente y no se encontró una función administrativa que implemente esas operaciones. La solicitud todavía pendiente de confirmación comercial ya se presenta como venta.

El CSV calcula ingresos por producto con `unidades vendidas × precio actual del producto`, en lugar de sumar los precios históricos de cada pedido. Cambiar el precio de un artículo cambia retrospectivamente ese cálculo.

Referencias: `src/js/pages/admin.js:164`, `:167`, `:804`, `:809`; `firestore.rules:31`; `src/envios.html:80`.

**Corrección:** definir estados comerciales y contabilizar únicamente los que correspondan a ventas reales; conservar importes y categorías históricos. Implementar cambios de estado autorizados en servidor y distinguir solicitudes recibidas, reservas, ventas y pagos.

### 5. Alta: una edición del administrador puede revertir un descuento de stock reciente

El editor carga un número absoluto de existencias y lo envía de nuevo con `updateDoc`, incluso cuando solo se cambió la descripción o el precio. No verifica la versión del producto ni la cantidad que había al abrir el formulario.

Ejemplo derivado del código: se abre el editor con 6 unidades, entra un pedido y quedan 5, después se guarda una descripción desde ese editor y se vuelve a escribir 6. Los descuentos transaccionales del backend no protegen contra una escritura posterior del administrador.

Referencias: `src/js/pages/admin.js:376`, `:611`, `:658`; actualización directa desde la tabla en `:276`.

**Corrección:** no sobrescribir stock al guardar otros campos. Para ajustes de inventario, usar una operación de servidor con transacción, control de versión o movimientos de entrada/salida registrados.

### 6. Alta: reservas de stock sin un mecanismo completo de recuperación

El backend descuenta existencias antes de confirmar entrega/pago con la tienda. En los envíos correctos no existe una caducidad, cancelación o liberación administrativa de reservas. Una solicitud abandonada puede dejar el producto indisponible indefinidamente.

Hay otro caso comprobado en memoria: si WhatsApp acepta el mensaje pero falla la actualización final en Firestore, el pedido queda en `Enviando a WhatsApp`. Repetir la misma solicitud devuelve `processing: true`, sin reparar el estado. La compensación ante fallos de WhatsApp es positiva, pero puede fallar también y solo queda un mensaje en logs.

Referencias: `functions/index.js:409`, `:471`, `:513`, `:549`.

**Corrección:** implementar reconciliación y una política explícita de reservas/cancelaciones; registrar los fallos pendientes y permitir su resolución administrativa. Distinguir que Meta acepte un mensaje de que se entregue y de que la venta se confirme.

### 7. Alta: dependencias con avisos de seguridad vigentes

Resultados de `npm audit` durante esta revisión:

| Alcance | Paquetes con severidad alta | Observación |
| --- | ---: | --- |
| Frontend, incluyendo herramientas de desarrollo | 7 | Incluye Vite y su cadena de construcción. |
| Frontend, omitiendo dependencias de desarrollo | 2 | `zod` y el efecto sobre `@imgly/background-removal`. |
| Backend | 3 | `body-parser`, propagado a `express` y `firebase-functions`. |

Estos conteos incluyen propagación por dependencias: **no significan diez vulnerabilidades independientes ni demuestran diez explotaciones**. En el frontend, la librería de recorte se ejecuta en el navegador del administrador; su exposición difiere de la de un endpoint de servidor.

Versiones verificadas: `zod 3.25.76`, `@imgly/background-removal 1.7.0`, `body-parser 2.3.0`, `express 5.2.1`, `firebase-functions 7.4.0`. El audit no ofreció una solución automática para esas cadenas.

Fuentes: [aviso oficial de body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [aviso de Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [avisos de Vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

**Corrección:** evaluar versiones corregidas o sustituciones compatibles y volver a auditar. No aplicar `npm audit fix --force` sin revisar compatibilidad. El servidor de desarrollo debe mantenerse fuera del servicio público.

### 8. Media: la protección configurada no coincide con el hosting comprobado

Las respuestas de `https://mariru-bazar.web.app/` e `/inicio.html` no incluyen los encabezados CSP, X-Content-Type-Options, X-Frame-Options ni Permissions-Policy declarados en `firebase.json`. La existencia del archivo local no demuestra su despliegue.

El proyecto mantiene configuraciones distintas para Firebase Hosting, Vercel y GitHub Pages. En Pages no se aplican los encabezados de `vercel.json` ni los de Firebase. Además, quedan rutas `/assets/...` construidas en JavaScript y almacenadas en datos que no se ajustan automáticamente al subdirectorio `/Mariru_tienda/`.

**Corrección:** elegir y verificar el destino real de producción, comprobar sus encabezados y probar el build con su base de rutas exacta. Si producción es Vercel, sus variables, encabezados y dominio siguen pendientes de comprobar con acceso a ese despliegue.

## Otros ajustes de coherencia

- **Talla en servidor:** ambos endpoints permiten omitirla aunque el producto tenga tallas. La interfaz sí la exige. Se reprodujo la aceptación en una prueba de servidor simulada. Referencias: `functions/index.js:170`, `:439` y `src/js/pages/store.js:700`.
- **Videos:** el administrador permite cargarlos y Firestore tiene el campo, pero la ficha pública solo renderiza `imagenes`. No se encontró un reproductor que consuma `producto.videos`.
- **Historial:** el estado visible siempre dice `Registrado`; no representa el valor almacenado en `pedido.estado` (`src/js/pages/orders.js:74`).
- **Límite del reporte:** el pedido permite hasta 30 líneas, pero el texto de WhatsApp se rechaza al superar 1024 caracteres. Los nombres, datos de contacto y notas pueden alcanzar ese límite con muchos menos artículos. Debe resolverse el formato o advertirse antes del envío.
- **Acceso:** hay un `setTimeout(segundos * 1000, tick)` con argumentos invertidos en `src/js/ui/login-modal.js:249`. Además, mensajes de verificación de correo se escriben después de cerrar el modal y pueden no verse. No se realizaron intentos fallidos contra cuentas reales.
- **Direcciones:** el máximo de cinco se impone solo en el cliente; las reglas validan su forma, pero no ese límite. La dirección principal se cambia en varias operaciones y puede quedar inconsistente entre pestañas.
- **Usabilidad:** el nombre negro de la marca en el footer queda sobre un fondo oscuro; se aprecia en las capturas. El contraste necesita corregirse.
- **Rendimiento:** el video estático pesa aproximadamente 11.5 MB, el WASM de procesamiento de imágenes 23.9 MB y el paquete principal compartido unos 605 KB sin comprimir. El procesamiento de imágenes se importa de forma diferida, lo que limita su impacto al usarlo, pero deben probarse móviles y conexiones lentas.
- **Operación:** el README no incluye `storage` en el comando de despliegue conjunto de reglas/funciones; debe verificarse también la publicación de `storage.rules`. No se encontraron pruebas automatizadas integradas en los scripts del proyecto.

## Comprobaciones pendientes en un entorno de staging

1. Variables del hosting elegido, App Check y dominios autorizados de Firebase Auth.
2. Función nueva desplegada, secreto de Meta, número emisor/destinatario y plantilla aprobada.
3. Pedido completo con envío a un número de prueba; stock antes/después, historial y datos administrativos.
4. Dos pedidos concurrentes para la última unidad y una edición administrativa mientras entra un pedido.
5. Fallos y reintentos de red, timeout de Meta, caída tras reservar stock y liberación de reservas.
6. Sesiones reales de cliente A, cliente B y administrador: aislamiento entre perfiles, direcciones y pedidos; rechazo de escrituras y escalamiento de privilegios.
7. Registro, Google, recuperación/verificación de correo, cambio de contraseña y eliminación de cuenta.
8. Subida, recorte y eliminación de imágenes/videos con reglas y CSP activas.
9. Backups/restauración, logs y alertas de errores de pedidos; política de conservación de datos aplicada.

No se contó con una sesión administrativa real de Firebase, Vercel o Meta. No se comprobaron secretos, facturación, políticas configuradas en las consolas, todos los documentos privados ni recuperación de backups. Por ello, aunque se corrijan los archivos locales, falta una prueba operativa en staging antes de autorizar producción.

**Orden recomendado:** habilitar el flujo único de pedidos, resolver historial/estados/ventas y concurrencia de inventario, atender dependencias, desplegar la configuración correcta y ejecutar las pruebas de staging. La compilación y el recorrido público ya pasan, pero no compensan los bloqueos anteriores.
