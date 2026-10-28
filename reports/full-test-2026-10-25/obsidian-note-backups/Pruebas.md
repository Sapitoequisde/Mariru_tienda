---
tags: [mariru, web, pruebas]
actualizado: 2026-10-25
---

# Pruebas

Volver a [[00 Mariru Bazar]]

Pruebas automáticas con **Playwright** (Python, Chromium sin ventana) contra el servidor local `npm run dev`.

## Resultado del 2026-10-25

| Prueba | Resultado | Qué cubre |
|---|---|---|
| Páginas públicas | ✅ 20/20, sin errores de consola | Conteo, orden y precio guardados en la URL, recarga, chips ✕, panel de filtros en móvil (abrir, bloquear fondo, Escape), índice de las 4 páginas legales, Contacto, Funcionamiento, Mi cuenta sin sesión |
| Mi cuenta de principio a fin | ✅ 22/22, sin errores de JavaScript | Registro, datos, cambiar nombre, direcciones (CP inválido, agregar, principal, editar, borrar), contraseña equivocada y correcta, cerrar sesión, entrar con la nueva, eliminar cuenta |
| Reglas en producción | ✅ todas responden 403 | Un cliente no puede hacerse admin, guardar dirección con campos extra, leer direcciones ajenas ni borrar archivos de productos |
| Quitar fondo | ✅ | Foto `productos/1.jpg` → PNG 900×1350, 81 % transparente, ~20 s incluida la descarga del modelo |

> [!success] Errores encontrados y corregidos
> - En móvil, la capa del panel de filtros tapaba **todos los toques del catálogo** aunque estuviera cerrada (error anterior a los cambios).
> - En móvil, el panel de filtros quedaba debajo de la barra de navegación y la ✕ tapaba "Limpiar".

## No probado

- [ ] **Editar productos en el panel** (requiere cuenta admin).
- [ ] Quitar fondo en el **sitio publicado** (la CSP solo aplica en Vercel/Firebase Hosting).
- [ ] Enviar un pedido real por WhatsApp.

## Cómo repetirlas

- Los scripts quedaron en el scratchpad de la sesión de Claude Code (`prueba_publica.py`, `prueba_cuenta.py`, `prueba_fondo.py`).
- Chromium de Playwright está en `C:\Users\uziel\AppData\Local\ms-playwright` (**719 MB**); el entorno de Python se borró.
- La prueba de cuenta crea `prueba.mariru.<hora>@example.com` y la elimina al final con la propia función de eliminar cuenta.
- Esperar `load` y selectores concretos, **no** `networkidle`: Firestore y Vite mantienen conexiones abiertas.
