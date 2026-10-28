---
tags: [mariru, web, qa, pruebas]
fecha: 2026-10-25
estado: pendiente-de-produccion
---

# Cómo repetir las pruebas

[[00 - Revisión integral]] · [[01 - Matriz de pruebas]]

## Preparación

Repositorio: `C:\Users\uziel\OneDrive\Escritorio\Mariru_tienda`.

Los scripts están en `tests/production/` del repositorio. Las dependencias de Playwright de esta ejecución se instalaron en `%TEMP%\mariru-audit-playwright`; no se añadieron al package.json de la tienda. Se usó Playwright 1.64.1 y Chromium headless shell 1248, que ya estaba disponible. Los scripts contienen la ubicación de ese navegador y deben ajustarse si cambia la instalación.

Si se prepara otro equipo, instalar Playwright en un entorno Python aislado y descargar su Chromium. La tienda debe contar con sus dependencias y `.env` local. No copiar valores de `.env` al vault.

En PowerShell, desde el repositorio:

```powershell
npm run dev -- --host 127.0.0.1 --port 4179 --strictPort
```

En otra terminal:

```powershell
node tests/production/backend.cjs
python tests/production/browser_public.py
python tests/production/admin_browser.py
python tests/production/image_processing.py
python tests/production/checks.py
```

`backend.cjs` devuelve código de salida 1 mientras existan regresiones abiertas. Un código de salida 0 de los runners Python no significa que todas sus pruebas hayan pasado: consultar sus archivos JSON y el resumen; los runners guardan los fallos para poder documentarlos.

## Suite que usa una cuenta real temporal

```powershell
python tests/production/account_live.py
```

Esta suite **crea una cuenta temporal en el Firebase configurado**, crea únicamente su perfil y direcciones ficticias, prueba reautenticación y contraseñas y luego elimina sus propios documentos y cuenta. Usa `example.test`; no envía verificación, recuperación ni pedidos. No usar datos personales reales.

La prueba de política de contraseñas cambia de forma temporal la contraseña de ese usuario ficticio, la restaura y renueva la sesión de navegador. La prueba del sexto domicilio es una prueba negativa contra las reglas desplegadas y termina limpiando todos esos domicilios.

**Revisar siempre `account-results.json` y `cleanup.confirmed`.** Si es falso, la ejecución no está terminada. No ejecutar suites de cuenta en paralelo sobre una misma fixture. El script contiene limpieza de respaldo limitada al UID que acaba de crear; no elimina usuarios existentes.

Las pruebas de administrador usan `firebase_mock.js`, servido exclusivamente por interceptación de Playwright. No modifica el archivo firebase.js de la tienda y no habilita acceso al panel productivo.

## Resultados y documentación

Se escriben en `reports/full-test-2026-10-25/`. Después de revisar y clasificar todos los fallos:

```powershell
python tests/production/document_results.py
```

Ese comando prepara el paquete dentro del proyecto; **no escribe en Obsidian**. La copia al vault es un paso separado. Si se repite en otra fecha, crear una nueva carpeta de ejecución y no sobrescribir este registro.

Los scripts no arreglan la aplicación, no despliegan reglas y no publican versiones. Las pruebas pendientes de staging están en [[04 - Entornos y pruebas bloqueadas]].
