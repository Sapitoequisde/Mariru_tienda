---
tags: [mariru, web, qa, pruebas]
fecha: 2026-10-25
estado: pendiente-de-produccion
---

# Entornos y pruebas bloqueadas

[[00 - Revisión integral]]

| ID | Comprobación no ejecutada | Motivo / acceso necesario | Pendiente |
|---|---|---|---|
| T01 | Pedido real completo a WhatsApp en staging | Falta función nueva accesible y App Check; se necesita número/plantilla de prueba y acceso a Meta. | P01 |
| T02 | Confirmación de entrega del mensaje y reconciliación | No hay acceso a eventos/webhooks ni observabilidad de Meta; aceptar mensaje no equivale a entrega. | P06 |
| T03 | CRUD de administrador real en un proyecto de staging | No hay sesión administradora de prueba disponible; la suite M usa mocks y no valida credenciales/reglas reales de admin. | P05 |
| T04 | Carreras de stock y recuperación con Firestore real/emulador | La transacción concurrente B25 usa un modelo serializado, no el motor Firestore; falta staging/emulador. | P05 |
| T05 | Pruebas exhaustivas de escrituras y roles de Firestore/Storage | Las pruebas reales cubren cliente propio y lecturas denegadas; falta entorno aislado para escalamiento de rol, escrituras sobre productos y medios. | P09 |
| T06 | Inicio de sesión real con Google | Requiere una cuenta de Google de pruebas y la configuración de dominios/proveedor. | P10 |
| T07 | Entrega de correo de verificación y recuperación | Se necesita un buzón controlado de pruebas; no se enviaron correos a direcciones ajenas. | P10 |
| T08 | Recorte y subida bajo CSP de producción | La prueba local I03 pasó; falta un despliegue de staging elegido y acceso admin. | P14 |
| T09 | Safari/iOS y Firefox reales | La ejecución documentada usa Chromium; no se validó WebKit, Firefox ni dispositivos físicos. | P11 |
| T10 | Restauración de backups y alertas operativas | Requiere permisos de administración y un destino de restauración aislado. | P20 |
| T11 | Carga y límites de cuota/facturación | No se lanzó carga contra producción; requiere objetivos y entorno de staging con límites. | P20 |
| T12 | Aprobación final del flujo de invitados y ventas | Hace falta resolver las decisiones de historial, reservas y estados comerciales antes de aprobar la regresión final. | P03 |

Estas doce comprobaciones están **pendientes de ejecución**, no aprobadas. No se incluyen dentro del total de pruebas ejecutadas.

La cuenta de cliente real fue temporal y no administradora. No se dispuso de una sesión administradora real, consola de Meta, buzón de correo de prueba, consola del hosting elegido ni permisos de restauración de backups.

No se ejecutó un emulador de reglas de Firebase en esta revisión. Los tests de backend sustituyen las dependencias y serializan transacciones: no certifican semántica completa del motor Firestore. Las comprobaciones reales de cliente y de lectura HTTP solo prueban los casos descritos, no todas las combinaciones de permisos.
