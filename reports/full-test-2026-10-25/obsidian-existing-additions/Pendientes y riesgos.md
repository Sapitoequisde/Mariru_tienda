---
tags: [mariru, web, pendientes]
revisado: 2026-10-25
---

# Pendientes y riesgos

Volver a [[00 Mariru Bazar]] · Cambios hechos en [[Historial de cambios]]

Conviene confirmar cada punto antes de corregirlo.

## Funcionales

- [ ] **"Mis pedidos" no mostrará los pedidos de WhatsApp.** `submitWhatsAppOrder` no guarda `usuario.uid`, pero `orders.js` y las reglas filtran por `usuario.uid`. Además esa función no exige sesión. Decidir: ¿pedir sesión y guardar el usuario, o quitar la página "Mis pedidos"? Ver [[Flujo de pedido por WhatsApp]].
- [ ] **Usar las direcciones guardadas en el pedido**: el formulario de WhatsApp aún no permite elegir una dirección de Mi cuenta.
- [ ] **`placeOrder` sin uso.** Flujo antiguo que sigue en `functions/`. Valorar eliminarlo.
- [ ] El resumen del panel suma **todos** los pedidos como ventas, incluidos los "Error de envío a WhatsApp". Filtrar por estado.
- [ ] `orders.js` siempre pinta el estado "Registrado" aunque el pedido diga otra cosa.
- [ ] Al eliminar una cuenta, los pedidos ya enviados no se borran (la página lo avisa).
- [ ] `categorias.html` es en realidad "Mis pedidos"; en `vite.config.js` está registrada dos veces. Renombrar a `pedidos.html`.
- [ ] `login-admin.html` es obsoleta (solo redirige).
- [ ] Verificar el Instagram correcto: se unificó a `@mariru.bazarr` (el texto de Funcionamiento decía `@mariru_bazar`).
- [x] ~~Al dar de alta un producto, si falla la subida queda un producto sin imágenes~~ — resuelto: se publica con `setDoc` al final.

## Probar

- [ ] **Editar productos** en el panel (no se pudo automatizar sin cuenta admin). Ver [[Pruebas]].
- [ ] **Quitar fondo en el sitio publicado** (CSP de Vercel/Firebase).
- [ ] Enviar un pedido real por WhatsApp.

## Configuración / seguridad

- [ ] **Licencia AGPL-3.0** de `@imgly/background-removal`: obliga a ofrecer el código fuente del sitio. Decidir si se acepta, se compra licencia comercial o se cambia a remove.bg.
- [ ] El workflow de GitHub Pages escribe `VITE_ADMIN_USERNAME=Mariru05` fijo; la variable no se usa y expone un nombre de usuario. Quitarla.
- [ ] Las CSP de `firebase.json` y `vercel.json` no son iguales (Vercel incluye `base-uri`, `form-action`, `frame-ancestors`, `upgrade-insecure-requests`). Unificarlas.
- [ ] El botón de admin en la navbar depende del correo (`VITE_ADMIN_LOGIN_EMAIL`), no de `admin: true`. Es solo visual.
- [ ] Activar la política de contraseñas en Firebase Auth (la validación actual es solo en el navegador).
- [ ] Nunca desplegar `seed.html` en producción (ya está fuera del build). Valorar borrarla junto con `seed-products.js`.
- [x] ~~Publicar reglas de Firestore y Storage~~ — publicadas el 2026-10-24.

## Limpieza

- [ ] Borrar fondos que ya no se usan: `fondo-sakura.jpg`, `fondo-categorias.jpg`, `gatos-categorias.png`, `gato-carrito.jpg`, `fondo-sobre-mi.jpg`, `fondo-animado.mp4` (~11 MB) y las fotos de muestra `productos/1–12.jpg`.
- [ ] Borrar reglas CSS que ya no se usan (`carrito-titulo`, `pedidos-kicker`, `cuenta-kicker`, `sobremi-*`, `funcionamiento-*`, `filtro-select`).
- [ ] Quitar `background-parallax.js` de las páginas públicas (ya no mueve nada ahí).
- [ ] Corregir 7 `outline: none` y 3 `transition: all` en reglas anteriores (accesibilidad).
- [ ] `pintarMediaPreview` en `admin.js` ya no se usa.
- [ ] Chromium de Playwright ocupa **719 MB** en `AppData\Local\ms-playwright`.

## Estado del repositorio

Al 2026-10-25 todos los cambios siguen **sin commit** en `main`. Los únicos commits son "Publish Mariru Tienda" y "Enable GitHub Pages deployment".


<!-- qa-integral-2026-10-25 -->
## Revisión integral de pruebas — 2026-10-25

> [!warning] Producción pendiente
> La revisión integral registra 129 pruebas ejecutadas: 111 aprobadas y 18 fallidas, más 12 comprobaciones externas sin ejecutar. Los entornos simulados están identificados; no equivalen a una validación productiva.

- [[Web Mariru Bazar/QA - 2026-10-25/00 - Revisión integral]]
- [[Web Mariru Bazar/QA - 2026-10-25/01 - Matriz de pruebas]]
- [[Web Mariru Bazar/QA - 2026-10-25/02 - Pendientes por completar]]

La documentación anterior se conserva como historial. Las correcciones siguen abiertas hasta cumplir su criterio de aceptación y repetir la prueba correspondiente.
