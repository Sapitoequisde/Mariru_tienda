---
tags: [mariru, web, qa, pruebas]
fecha: 2026-10-25
estado: pendiente-de-produccion
---

# Pendientes por completar

[[00 - Revisión integral]] · [[Web Mariru Bazar/Pendientes y riesgos]]

Todos los puntos siguientes quedan abiertos. Solo se cerrarán después de implementar la corrección y aportar una prueba de aceptación. Las mejoras de experiencia están separadas de los bloqueos de producción.

## P01 · Bloqueante

- [ ] **Habilitar y desplegar el flujo actual de pedidos** #bloqueante

**Evidencia:** App Check no está configurado en el build local y la ruta submitWhatsAppOrder responde 404.

**Pruebas:** U16, R07, R11.

**Referencia:** `src/js/services/firebase.js:26; src/js/pages/store.js:1169; functions/index.js:328`.

**Para completar:** Configurar proveedor y dominios, publicar la función y validar un pedido de staging con mensaje recibido.

## P02 · Alta

- [ ] **Retirar o unificar el endpoint antiguo placeOrder** #pendiente

**Evidencia:** Sigue expuesto, no aplica App Check y agrega una tarifa automática de $80 ajena al flujo comercial actual.

**Pruebas:** B28, B29, R12.

**Referencia:** `functions/index.js:49,194`.

**Para completar:** Un solo contrato de pedido y entrega por acuerdo; endpoint obsoleto retirado o migrado con protección equivalente.

## P03 · Alta

- [ ] **Alinear pedidos nuevos, cuenta e historial** #pendiente

**Evidencia:** El pedido autenticado no conserva usuario.uid, que es el filtro del historial y de las reglas.

**Pruebas:** B20.

**Referencia:** `functions/index.js:475; src/js/pages/orders.js:97; firestore.rules:27; src/privacidad.html:80`.

**Para completar:** Definir invitados y clientes autenticados; historial muestra solo pedidos propios; actualizar textos de privacidad.

## P04 · Alta

- [ ] **Corregir estados comerciales, ventas y reporte histórico** #pendiente

**Evidencia:** Se suman solicitudes fallidas como ventas. El CSV calcula ingresos históricos usando el precio actual.

**Pruebas:** B22.

**Referencia:** `src/js/pages/admin.js:164,167,804,809`.

**Para completar:** Ventas confirmadas separadas de solicitudes/reservas; errores no suman; cambios de precio no alteran ingresos anteriores.

## P05 · Alta

- [ ] **Proteger inventario frente a ediciones concurrentes** #pendiente

**Evidencia:** El editor real sobrescribió con stock antiguo una reserva nueva en una prueba con Firebase aislado.

**Pruebas:** M13.

**Referencia:** `src/js/pages/admin.js:376,611,658`.

**Para completar:** Guardar una descripción no cambia stock; ajustes con transacción/versionado; carrera real de última unidad validada en staging.

## P06 · Alta

- [ ] **Recuperar pedidos y liberar reservas abandonadas** #pendiente

**Evidencia:** Fallos de estado final y compensación pueden dejar Enviando a WhatsApp y stock reservado indefinidamente.

**Pruebas:** B23, B24.

**Referencia:** `functions/index.js:409,471,513,549`.

**Para completar:** Reconciliación/reintentos idempotentes, cancelación y expiración de reservas comprobadas sin duplicar mensajes o existencias.

## P07 · Alta

- [ ] **Resolver avisos de seguridad en dependencias** #pendiente

**Evidencia:** npm audit reporta avisos altos en frontend, herramientas y backend; los conteos incluyen cadenas de dependencias.

**Pruebas:** R14, R15.

**Referencia:** `package-lock.json; functions/package-lock.json`.

**Para completar:** Actualizar o sustituir de forma compatible y repetir audit, build y regresiones; documentar alcance de cualquier excepción.

## P08 · Media

- [ ] **Exigir talla en servidor cuando el producto tiene tallas** #pendiente

**Evidencia:** El servidor acepta talla nula para un producto que requiere elegir una talla en la interfaz.

**Pruebas:** B15.

**Referencia:** `functions/index.js:170,439`.

**Para completar:** Omisión o talla inexistente rechazada por el servidor sin descontar stock.

## P09 · Alta

- [ ] **Verificar hosting definitivo y publicar encabezados de seguridad** #pendiente

**Evidencia:** El Firebase Hosting comprobado no entrega los encabezados declarados localmente.

**Pruebas:** R13.

**Referencia:** `firebase.json; vercel.json; vite.config.js`.

**Para completar:** Elegir destino productivo, verificar CSP y encabezados HTTP y probar las rutas con la base correcta, incluido GitHub Pages si se usa.

## P10 · Media

- [ ] **Corregir temporizador y avisos de autenticación** #pendiente

**Evidencia:** Revisión estática: setTimeout tiene argumentos invertidos; algunos avisos de verificación se escriben después de cerrar el modal.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `src/js/ui/login-modal.js:249,296,443`.

**Para completar:** Bloqueo por intentos no produce errores de JavaScript y las instrucciones de verificación se ven al terminar el acceso.

## P11 · Media

- [ ] **Mejorar contraste y revisar navegación por teclado** #pendiente

**Evidencia:** La marca negra sobre el footer oscuro tiene bajo contraste; revisar foco y trampas de foco en modales.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `src/styles/style.css; capturas públicas`.

**Para completar:** Contraste medido y recorrido solo con teclado sin perder foco o bloquear controles.

## P12 · Media

- [ ] **Alinear tamaño de carrito y límite del reporte de WhatsApp** #pendiente

**Evidencia:** Se permiten 30 líneas pero el reporte se rechaza al exceder 1024 caracteres, incluidos datos y notas.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `functions/index.js:463`.

**Para completar:** Carritos admitidos se envían o reciben indicación previa clara; límites acordes al formato de Meta.

## P13 · Media

- [ ] **Completar el uso de videos de producto** #pendiente

**Evidencia:** Revisión estática: el panel guarda videos pero la ficha pública solo renderiza imágenes.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `src/js/pages/admin.js; src/js/pages/store.js:641`.

**Para completar:** Mostrar videos guardados con política media-src adecuada o retirar la función de carga si no se utilizará.

## P14 · Media

- [ ] **Probar imágenes y recorte bajo la CSP del sitio publicado** #pendiente

**Evidencia:** El recorte real local pasó; no demuestra funcionamiento con encabezados, dominios y permisos productivos.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `src/js/services/image-processing.js; firebase.json; vercel.json; storage.rules`.

**Para completar:** Alta, recorte, vista pública, edición y borrado de medios en staging con CSP activa.

## P15 · Media

- [ ] **Aplicar en servidor el límite de cinco direcciones** #pendiente

**Evidencia:** Las reglas desplegadas permitieron seis direcciones al usuario temporal; todas se eliminaron al limpiar la prueba.

**Pruebas:** A21.

**Referencia:** `firestore.rules:70; src/js/pages/account.js:364`.

**Para completar:** La sexta dirección se rechaza sin depender del cliente; definir unicidad transaccional de dirección principal.

## P16 · Baja / mejora

- [ ] **Evitar pérdida silenciosa de borradores en el panel** #pendiente

**Evidencia:** Cerrar y reabrir el formulario borra lo escrito. Es una mejora de experiencia, no un fallo de permisos.

**Pruebas:** M14.

**Referencia:** `src/js/pages/admin.js:cerrarFormulario; M14`.

**Para completar:** Conservar borrador o pedir confirmación de descarte; no perderlo al cambiar de sección o cerrar accidentalmente.

## P17 · Alta

- [ ] **Alinear política de contraseñas de Firebase y frontend** #pendiente

**Evidencia:** Firebase aceptó una contraseña de ocho caracteres mientras el frontend requiere doce. La prueba restauró una contraseña fuerte y eliminó la cuenta temporal.

**Pruebas:** A26.

**Referencia:** `Firebase Authentication / política de contraseñas; src/js/ui/password-policy.js`.

**Para completar:** Configurar política equivalente en Firebase Auth y comprobar rechazo real de contraseñas que la UI no admite.

## P18 · Baja / mejora

- [ ] **Conectar direcciones guardadas con el formulario de pedido** #pendiente

**Evidencia:** La cuenta permite guardar direcciones, pero el checkout sigue pidiendo el punto de entrega de nuevo.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `src/js/pages/account.js; src/js/pages/store.js:asegurarModalPedido`.

**Para completar:** Permitir seleccionar una dirección propia o explicar de forma clara su finalidad actual.

## P19 · Media

- [ ] **Revisar reintentos y cambios de carrito durante un envío** #pendiente

**Evidencia:** Revisión estática: cerrar/reabrir el modal permite cambiar contexto mientras una respuesta previa sigue pendiente; debe probarse sin servicios reales.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `src/js/pages/store.js:1132,1184,1281`.

**Para completar:** Un envío pendiente no duplica solicitudes ni borra productos nuevos de otro contexto; claves idempotentes persistentes y visibles.

## P20 · Media

- [ ] **Verificar retención de datos, backups y monitoreo** #pendiente

**Evidencia:** No se dispone de evidencia de restauración de backups, alertas operativas ni aplicación de la política de retención.

**Pruebas:** Revisión estática / decisión pendiente.

**Referencia:** `Configuración privada de Firebase/Meta; src/privacidad.html`.

**Para completar:** Restauración en staging probada; alertas de fallo y reservas pendientes recibidas por responsables; conservación aplicada.

## Pruebas por ejecutar con accesos adicionales

- [ ] **T01: Pedido real completo a WhatsApp en staging.** Falta función nueva accesible y App Check; se necesita número/plantilla de prueba y acceso a Meta. Relacionada con P01.

- [ ] **T02: Confirmación de entrega del mensaje y reconciliación.** No hay acceso a eventos/webhooks ni observabilidad de Meta; aceptar mensaje no equivale a entrega. Relacionada con P06.

- [ ] **T03: CRUD de administrador real en un proyecto de staging.** No hay sesión administradora de prueba disponible; la suite M usa mocks y no valida credenciales/reglas reales de admin. Relacionada con P05.

- [ ] **T04: Carreras de stock y recuperación con Firestore real/emulador.** La transacción concurrente B25 usa un modelo serializado, no el motor Firestore; falta staging/emulador. Relacionada con P05.

- [ ] **T05: Pruebas exhaustivas de escrituras y roles de Firestore/Storage.** Las pruebas reales cubren cliente propio y lecturas denegadas; falta entorno aislado para escalamiento de rol, escrituras sobre productos y medios. Relacionada con P09.

- [ ] **T06: Inicio de sesión real con Google.** Requiere una cuenta de Google de pruebas y la configuración de dominios/proveedor. Relacionada con P10.

- [ ] **T07: Entrega de correo de verificación y recuperación.** Se necesita un buzón controlado de pruebas; no se enviaron correos a direcciones ajenas. Relacionada con P10.

- [ ] **T08: Recorte y subida bajo CSP de producción.** La prueba local I03 pasó; falta un despliegue de staging elegido y acceso admin. Relacionada con P14.

- [ ] **T09: Safari/iOS y Firefox reales.** La ejecución documentada usa Chromium; no se validó WebKit, Firefox ni dispositivos físicos. Relacionada con P11.

- [ ] **T10: Restauración de backups y alertas operativas.** Requiere permisos de administración y un destino de restauración aislado. Relacionada con P20.

- [ ] **T11: Carga y límites de cuota/facturación.** No se lanzó carga contra producción; requiere objetivos y entorno de staging con límites. Relacionada con P20.

- [ ] **T12: Aprobación final del flujo de invitados y ventas.** Hace falta resolver las decisiones de historial, reservas y estados comerciales antes de aprobar la regresión final. Relacionada con P03.

## Pendientes anteriores conservados

Esta lista complementa [[Web Mariru Bazar/Pendientes y riesgos]]: se conservan las tareas de licencia, limpieza de archivos/CSS, nombre de página de pedidos, navbar por rol, Instagram, despliegue de reglas y estado del repositorio. No se marcaron como resueltas sin comprobarlas.
