---
tags: [mariru, web, indice]
actualizado: 2026-10-25
repo: C:\Users\uziel\OneDrive\Escritorio\Mariru_tienda
aliases: [Mariru Bazar, Web Mariru]
---

# Mariru Bazar — Web

Tienda en línea multipágina de **Mariru Bazar** (Hermosillo, Sonora, México). Muestra un catálogo de productos (ropa, accesorios, maquillaje, perfumes), permite armar un carrito y **enviar el pedido automáticamente al WhatsApp de la tienda**. El sitio **no cobra en línea**: Mariru confirma disponibilidad, entrega y pago por WhatsApp.

> [!info] Estado al 2026-10-25
> - Catálogo con **1 producto** real; los datos de prueba se borraron.
> - Reglas de Firestore y Storage **publicadas**.
> - Funciones nuevas: **Mi cuenta**, **filtros del catálogo**, **editar productos** y **quitar fondo** de fotos. Ver [[Historial de cambios]].
> - Todo el código sigue **sin commit**.

## Resumen rápido

| Aspecto | Detalle |
|---|---|
| Frontend | HTML multipágina + JavaScript (módulos ES) con **Vite 8** y **Tailwind CSS 4** |
| Backend | **Firebase**: Firestore, Authentication, Storage, Cloud Functions (Node 22), App Check (reCAPTCHA v3) |
| Mensajería | WhatsApp Business Platform (Cloud API) con plantilla aprobada |
| Imágenes | Quitar fondo en el navegador con `@imgly/background-removal` (AGPL-3.0) |
| Hosting | GitHub Pages (workflow), Vercel y/o Firebase Hosting |
| Zona de venta | Solo Hermosillo, Sonora |
| Pagos | Transferencia, depósito o efectivo (fuera del sitio) |

## Notas

- [[Arquitectura]] — cómo encajan las piezas
- [[Páginas del sitio]] — mapa de todas las páginas HTML y del catálogo con filtros
- [[Diseño visual]] — tipografía, colores, fondo de pétalos y glassmorfismo
- [[Módulos JavaScript]] — qué hace cada archivo JS
- [[Firebase - Datos y reglas]] — colecciones, campos, reglas y estado en producción
- [[Flujo de pedido por WhatsApp]] — de carrito a mensaje en WhatsApp
- [[Autenticación y cuentas]] — login, Mi cuenta y administradora
- [[Panel de administración]] — inventario, alta y edición de productos, quitar fondo
- [[Configuración y variables]] — `.env`, secretos, CSP y dependencias
- [[Despliegue]] — GitHub Pages, Vercel, Firebase
- [[Pruebas]] — qué se probó, resultados y cómo repetirlas
- [[Pendientes y riesgos]] — tareas, decisiones y limpieza
- [[Historial de cambios]] — qué cambió y cuándo

## Comandos básicos

```bash
npm install        # dependencias
npm run dev        # servidor de desarrollo (Vite)
npm run build      # genera dist/
npm run preview    # sirve dist/ localmente
```


<!-- qa-integral-2026-10-25 -->
## Revisión integral de pruebas — 2026-10-25

> [!warning] Producción pendiente
> La revisión integral registra 129 pruebas ejecutadas: 111 aprobadas y 18 fallidas, más 12 comprobaciones externas sin ejecutar. Los entornos simulados están identificados; no equivalen a una validación productiva.

- [[Web Mariru Bazar/QA - 2026-10-25/00 - Revisión integral]]
- [[Web Mariru Bazar/QA - 2026-10-25/01 - Matriz de pruebas]]
- [[Web Mariru Bazar/QA - 2026-10-25/02 - Pendientes por completar]]

La documentación anterior se conserva como historial. Las correcciones siguen abiertas hasta cumplir su criterio de aceptación y repetir la prueba correspondiente.
