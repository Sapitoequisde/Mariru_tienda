---
tags: [mariru, web, qa, pruebas]
fecha: 2026-10-25
estado: pendiente-de-produccion
---

# Revisión integral de Mariru Bazar

Volver a [[Web Mariru Bazar/00 Mariru Bazar]].

> [!warning] Todavía no está lista para producción
> Se ejecutaron **129 pruebas: 111 aprobadas y 18 fallidas**. Hay **12 comprobaciones externas pendientes de ejecución**. Estas últimas no se cuentan como aprobadas ni como pruebas ejecutadas.

| Suite | Ejecutadas | Aprobadas | Fallidas |
|---|---:|---:|---:|
| Backend aislado | 32 | 25 | 7 |
| Navegación pública real | 33 | 32 | 1 |
| Cuenta temporal real | 26 | 24 | 2 |
| Panel con Firebase simulado | 20 | 18 | 2 |
| Compilación, dependencias y entorno | 15 | 9 | 6 |
| Procesamiento real de imágenes | 3 | 3 | 0 |

Las pruebas fallidas representan comportamientos que todavía no cumplen el contrato esperado. No se corrigió código de la tienda en esta tarea. Todo lo que falta se registró como pendiente.

## Documentación

- [[01 - Matriz de pruebas]] — caso, resultado, entorno y pendiente relacionado.
- [[02 - Pendientes por completar]] — tareas abiertas, prioridades y criterios de aceptación.
- [[03 - Cómo repetir las pruebas]] — herramientas, comandos, cuentas temporales y limpieza.
- [[04 - Entornos y pruebas bloqueadas]] — qué se validó realmente y qué requiere accesos adicionales.
- [[05 - Informe de revisión inicial]] — hallazgos de la revisión anterior, conservados como antecedente.

## Alcance real

- Navegación y carrito: navegador real con lecturas de catálogo público. Los envíos de pedidos estuvieron bloqueados por interceptación.
- Cuenta de cliente: Firebase Authentication y Firestore reales, exclusivamente con cuenta temporal y datos ficticios bajo su UID.
- Administrador: interfaz real con Firebase simulado y 25 productos aislados. Las capturas M son datos de prueba, no inventario real.
- Backend: código real ejecutado con Firebase y Meta sustituidos por dobles de prueba en memoria.
- Imagen: módulo real de conversión y recorte, con un archivo local de muestra y descarga del modelo.
- Despliegue y dependencias: comprobaciones HTTP de solo lectura, compilación y npm audit.

## Seguridad de la ejecución

No se alteraron productos, pedidos, cuentas existentes ni reglas reales. No se enviaron mensajes de WhatsApp ni correos. Las cuentas temporales y sus direcciones se eliminaron: **limpieza confirmada**. En los ensayos de contraseña, se restauró una contraseña fuerte antes de eliminar la cuenta.

Los reintentos de la suite de cuenta incluyeron ajustes del harness por el cierre mediante opacidad y la renovación de tokens después de cambios REST. Esos errores del harness se corrigieron; los resultados efectivos son los de `account-results.json`. Las ejecuciones intermedias se conservan como evidencia, fuera de los conteos.

## Capturas

![[evidencias/public-desktop.png]]
![[evidencias/public-mobile.png]]

El paquete incluye JSON, logs y capturas. `summary.json` resume los conteos y `manifest.json` registra huellas de los archivos de aplicación revisados. No hay claves privadas, tokens ni contraseñas en estas notas.
