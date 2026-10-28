"""Prepare an Obsidian documentation package inside the allowed project workspace.
Writing this package into the actual vault is a separate approved operation.
"""
import hashlib,json,re,shutil,subprocess
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/full-test-2026-10-25'
STAGE=OUT/'obsidian'/'QA - 2026-10-25'
STAGE.mkdir(parents=True,exist_ok=True)
EVIDENCE=STAGE/'evidencias';EVIDENCE.mkdir(exist_ok=True)

SUITES=[('backend-results.json','Backend aislado'),('public-results.json','Navegación pública real'),('account-results.json','Cuenta temporal real'),('admin-results.json','Panel con Firebase simulado'),('checks-results.json','Compilación, dependencias y entorno'),('image-results.json','Procesamiento real de imágenes')]
all_tests=[];summaries=[]
for filename,label in SUITES:
    data=json.loads((OUT/filename).read_text(encoding='utf-8'))
    tests=data['tests']if isinstance(data,dict)else data
    count=Counter(t['status']for t in tests)
    summaries.append(dict(name=label,total=len(tests),passed=count['PASS'],failed=count['FAIL'],blocked=count['BLOCKED'],file=filename))
    all_tests+=tests
    if filename=='account-results.json':
        assert data['cleanup'].get('confirmed'), 'QA account cleanup must be confirmed before publication'
assert not any(t['status']=='FAIL' and not t.get('pending') for t in all_tests),'Untriaged test failures remain; investigate before documenting'

# Every issue stays open. Static review observations are explicitly distinguished
# from executed regression failures; improvements do not automatically block release.
PENDING=[
 ('P01','Bloqueante','Habilitar y desplegar el flujo actual de pedidos','App Check no está configurado en el build local y la ruta submitWhatsAppOrder responde 404.','Configurar proveedor y dominios, publicar la función y validar un pedido de staging con mensaje recibido.','src/js/services/firebase.js:26; src/js/pages/store.js:1169; functions/index.js:328'),
 ('P02','Alta','Retirar o unificar el endpoint antiguo placeOrder','Sigue expuesto, no aplica App Check y agrega una tarifa automática de $80 ajena al flujo comercial actual.','Un solo contrato de pedido y entrega por acuerdo; endpoint obsoleto retirado o migrado con protección equivalente.','functions/index.js:49,194'),
 ('P03','Alta','Alinear pedidos nuevos, cuenta e historial','El pedido autenticado no conserva usuario.uid, que es el filtro del historial y de las reglas.','Definir invitados y clientes autenticados; historial muestra solo pedidos propios; actualizar textos de privacidad.','functions/index.js:475; src/js/pages/orders.js:97; firestore.rules:27; src/privacidad.html:80'),
 ('P04','Alta','Corregir estados comerciales, ventas y reporte histórico','Se suman solicitudes fallidas como ventas. El CSV calcula ingresos históricos usando el precio actual.','Ventas confirmadas separadas de solicitudes/reservas; errores no suman; cambios de precio no alteran ingresos anteriores.','src/js/pages/admin.js:164,167,804,809'),
 ('P05','Alta','Proteger inventario frente a ediciones concurrentes','El editor real sobrescribió con stock antiguo una reserva nueva en una prueba con Firebase aislado.','Guardar una descripción no cambia stock; ajustes con transacción/versionado; carrera real de última unidad validada en staging.','src/js/pages/admin.js:376,611,658'),
 ('P06','Alta','Recuperar pedidos y liberar reservas abandonadas','Fallos de estado final y compensación pueden dejar Enviando a WhatsApp y stock reservado indefinidamente.','Reconciliación/reintentos idempotentes, cancelación y expiración de reservas comprobadas sin duplicar mensajes o existencias.','functions/index.js:409,471,513,549'),
 ('P07','Alta','Resolver avisos de seguridad en dependencias','npm audit reporta avisos altos en frontend, herramientas y backend; los conteos incluyen cadenas de dependencias.','Actualizar o sustituir de forma compatible y repetir audit, build y regresiones; documentar alcance de cualquier excepción.','package-lock.json; functions/package-lock.json'),
 ('P08','Media','Exigir talla en servidor cuando el producto tiene tallas','El servidor acepta talla nula para un producto que requiere elegir una talla en la interfaz.','Omisión o talla inexistente rechazada por el servidor sin descontar stock.','functions/index.js:170,439'),
 ('P09','Alta','Verificar hosting definitivo y publicar encabezados de seguridad','El Firebase Hosting comprobado no entrega los encabezados declarados localmente.','Elegir destino productivo, verificar CSP y encabezados HTTP y probar las rutas con la base correcta, incluido GitHub Pages si se usa.','firebase.json; vercel.json; vite.config.js'),
 ('P10','Media','Corregir temporizador y avisos de autenticación','Revisión estática: setTimeout tiene argumentos invertidos; algunos avisos de verificación se escriben después de cerrar el modal.','Bloqueo por intentos no produce errores de JavaScript y las instrucciones de verificación se ven al terminar el acceso.','src/js/ui/login-modal.js:249,296,443'),
 ('P11','Media','Mejorar contraste y revisar navegación por teclado','La marca negra sobre el footer oscuro tiene bajo contraste; revisar foco y trampas de foco en modales.','Contraste medido y recorrido solo con teclado sin perder foco o bloquear controles.','src/styles/style.css; capturas públicas'),
 ('P12','Media','Alinear tamaño de carrito y límite del reporte de WhatsApp','Se permiten 30 líneas pero el reporte se rechaza al exceder 1024 caracteres, incluidos datos y notas.','Carritos admitidos se envían o reciben indicación previa clara; límites acordes al formato de Meta.','functions/index.js:463'),
 ('P13','Media','Completar el uso de videos de producto','Revisión estática: el panel guarda videos pero la ficha pública solo renderiza imágenes.','Mostrar videos guardados con política media-src adecuada o retirar la función de carga si no se utilizará.','src/js/pages/admin.js; src/js/pages/store.js:641'),
 ('P14','Media','Probar imágenes y recorte bajo la CSP del sitio publicado','El recorte real local pasó; no demuestra funcionamiento con encabezados, dominios y permisos productivos.','Alta, recorte, vista pública, edición y borrado de medios en staging con CSP activa.','src/js/services/image-processing.js; firebase.json; vercel.json; storage.rules'),
 ('P15','Media','Aplicar en servidor el límite de cinco direcciones','Las reglas desplegadas permitieron seis direcciones al usuario temporal; todas se eliminaron al limpiar la prueba.','La sexta dirección se rechaza sin depender del cliente; definir unicidad transaccional de dirección principal.','firestore.rules:70; src/js/pages/account.js:364'),
 ('P16','Baja / mejora','Evitar pérdida silenciosa de borradores en el panel','Cerrar y reabrir el formulario borra lo escrito. Es una mejora de experiencia, no un fallo de permisos.','Conservar borrador o pedir confirmación de descarte; no perderlo al cambiar de sección o cerrar accidentalmente.','src/js/pages/admin.js:cerrarFormulario; M14'),
 ('P17','Alta','Alinear política de contraseñas de Firebase y frontend','Firebase aceptó una contraseña de ocho caracteres mientras el frontend requiere doce. La prueba restauró una contraseña fuerte y eliminó la cuenta temporal.','Configurar política equivalente en Firebase Auth y comprobar rechazo real de contraseñas que la UI no admite.','Firebase Authentication / política de contraseñas; src/js/ui/password-policy.js'),
 ('P18','Baja / mejora','Conectar direcciones guardadas con el formulario de pedido','La cuenta permite guardar direcciones, pero el checkout sigue pidiendo el punto de entrega de nuevo.','Permitir seleccionar una dirección propia o explicar de forma clara su finalidad actual.','src/js/pages/account.js; src/js/pages/store.js:asegurarModalPedido'),
 ('P19','Media','Revisar reintentos y cambios de carrito durante un envío','Revisión estática: cerrar/reabrir el modal permite cambiar contexto mientras una respuesta previa sigue pendiente; debe probarse sin servicios reales.','Un envío pendiente no duplica solicitudes ni borra productos nuevos de otro contexto; claves idempotentes persistentes y visibles.','src/js/pages/store.js:1132,1184,1281'),
 ('P20','Media','Verificar retención de datos, backups y monitoreo','No se dispone de evidencia de restauración de backups, alertas operativas ni aplicación de la política de retención.','Restauración en staging probada; alertas de fallo y reservas pendientes recibidas por responsables; conservación aplicada.','Configuración privada de Firebase/Meta; src/privacidad.html'),
]
BLOCKED=[
 ('T01','Pedido real completo a WhatsApp en staging','Falta función nueva accesible y App Check; se necesita número/plantilla de prueba y acceso a Meta.','P01'),
 ('T02','Confirmación de entrega del mensaje y reconciliación','No hay acceso a eventos/webhooks ni observabilidad de Meta; aceptar mensaje no equivale a entrega.','P06'),
 ('T03','CRUD de administrador real en un proyecto de staging','No hay sesión administradora de prueba disponible; la suite M usa mocks y no valida credenciales/reglas reales de admin.','P05'),
 ('T04','Carreras de stock y recuperación con Firestore real/emulador','La transacción concurrente B25 usa un modelo serializado, no el motor Firestore; falta staging/emulador.','P05'),
 ('T05','Pruebas exhaustivas de escrituras y roles de Firestore/Storage','Las pruebas reales cubren cliente propio y lecturas denegadas; falta entorno aislado para escalamiento de rol, escrituras sobre productos y medios.','P09'),
 ('T06','Inicio de sesión real con Google','Requiere una cuenta de Google de pruebas y la configuración de dominios/proveedor.','P10'),
 ('T07','Entrega de correo de verificación y recuperación','Se necesita un buzón controlado de pruebas; no se enviaron correos a direcciones ajenas.','P10'),
 ('T08','Recorte y subida bajo CSP de producción','La prueba local I03 pasó; falta un despliegue de staging elegido y acceso admin.','P14'),
 ('T09','Safari/iOS y Firefox reales','La ejecución documentada usa Chromium; no se validó WebKit, Firefox ni dispositivos físicos.','P11'),
 ('T10','Restauración de backups y alertas operativas','Requiere permisos de administración y un destino de restauración aislado.','P20'),
 ('T11','Carga y límites de cuota/facturación','No se lanzó carga contra producción; requiere objetivos y entorno de staging con límites.','P20'),
 ('T12','Aprobación final del flujo de invitados y ventas','Hace falta resolver las decisiones de historial, reservas y estados comerciales antes de aprobar la regresión final.','P03'),
]
total=Counter(t['status']for t in all_tests)
summary={'date':'2026-10-25','status':'NOT_READY_FOR_PRODUCTION','executed':len(all_tests),'passed':total['PASS'],'failed':total['FAIL'],'blockedNotExecuted':len(BLOCKED),'suites':summaries,'cleanup':json.loads((OUT/'account-results.json').read_text())['cleanup']}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
prefix='---\ntags: [mariru, web, qa, pruebas]\nfecha: 2026-10-25\nestado: pendiente-de-produccion\n---\n\n'
def note(filename,content):
    (STAGE/filename).write_text(prefix+content,encoding='utf-8')
suite_table='\n'.join(f"| {s['name']} | {s['total']} | {s['passed']} | {s['failed']} |"for s in summaries)
note('00 - Revisión integral.md',f'''# Revisión integral de Mariru Bazar

Volver a [[Web Mariru Bazar/00 Mariru Bazar]].

> [!warning] Todavía no está lista para producción
> Se ejecutaron **{len(all_tests)} pruebas: {total['PASS']} aprobadas y {total['FAIL']} fallidas**. Hay **{len(BLOCKED)} comprobaciones externas pendientes de ejecución**. Estas últimas no se cuentan como aprobadas ni como pruebas ejecutadas.

| Suite | Ejecutadas | Aprobadas | Fallidas |
|---|---:|---:|---:|
{suite_table}

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
''')
matrix=['# Matriz de pruebas','', '[[00 - Revisión integral]] · [[02 - Pendientes por completar]]','',
        'PASS = aprobada; FAIL = defecto o comportamiento esperado aún no implementado. Los entornos simulados están identificados y no sustituyen una aprobación de producción.','']
for filename,label in SUITES:
    data=json.loads((OUT/filename).read_text());tests=data['tests']if isinstance(data,dict)else data
    matrix += [f'## {label}', '', '| ID | Prueba | Resultado | Pendiente |','|---|---|---|---|']
    for test in tests:matrix.append(f"| {test['id']} | {test['title'].replace('|','/')} | {test['status']} | {test.get('pending') or '—'} |")
    matrix += ['',f'Evidencia completa: [[evidencias/{filename}]].','']
matrix+=['## Fallos con evidencia detallada','']
for test in all_tests:
    if test['status']=='FAIL':
        detail=str(test.get('detail','')).replace('\x00','')
        matrix += [f"### {test['id']} — {test.get('pending','Pendiente de clasificar')}", '', test['title'],'', '```text',detail,'```','']
note('01 - Matriz de pruebas.md','\n'.join(matrix))
tasks=['# Pendientes por completar','','[[00 - Revisión integral]] · [[Web Mariru Bazar/Pendientes y riesgos]]','',
       'Todos los puntos siguientes quedan abiertos. Solo se cerrarán después de implementar la corrección y aportar una prueba de aceptación. Las mejoras de experiencia están separadas de los bloqueos de producción.','']
for ident,priority,title,problem,acceptance,source in PENDING:
    related=', '.join(t['id']for t in all_tests if t.get('pending')==ident)or'Revisión estática / decisión pendiente'
    tasks += [f'## {ident} · {priority}', '', f'- [ ] **{title}** #{"bloqueante" if priority=="Bloqueante" else "pendiente"}', '',
              f'**Evidencia:** {problem}', '', f'**Pruebas:** {related}.', '', f'**Referencia:** `{source}`.', '', f'**Para completar:** {acceptance}', '']
tasks += ['## Pruebas por ejecutar con accesos adicionales','']
for ident,title,reason,pending in BLOCKED:tasks += [f'- [ ] **{ident}: {title}.** {reason} Relacionada con {pending}.','']
tasks += ['## Pendientes anteriores conservados','',
          'Esta lista complementa [[Web Mariru Bazar/Pendientes y riesgos]]: se conservan las tareas de licencia, limpieza de archivos/CSS, nombre de página de pedidos, navbar por rol, Instagram, despliegue de reglas y estado del repositorio. No se marcaron como resueltas sin comprobarlas.','']
note('02 - Pendientes por completar.md','\n'.join(tasks))
note('03 - Cómo repetir las pruebas.md',r'''# Cómo repetir las pruebas

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
''')
blocked=['# Entornos y pruebas bloqueadas','','[[00 - Revisión integral]]','',
         '| ID | Comprobación no ejecutada | Motivo / acceso necesario | Pendiente |','|---|---|---|---|']
for ident,title,reason,pending in BLOCKED:blocked.append(f'| {ident} | {title} | {reason} | {pending} |')
blocked+=['','Estas doce comprobaciones están **pendientes de ejecución**, no aprobadas. No se incluyen dentro del total de pruebas ejecutadas.', '',
         'La cuenta de cliente real fue temporal y no administradora. No se dispuso de una sesión administradora real, consola de Meta, buzón de correo de prueba, consola del hosting elegido ni permisos de restauración de backups.', '',
         'No se ejecutó un emulador de reglas de Firebase en esta revisión. Los tests de backend sustituyen las dependencias y serializan transacciones: no certifican semántica completa del motor Firestore. Las comprobaciones reales de cliente y de lectura HTTP solo prueban los casos descritos, no todas las combinaciones de permisos.','']
note('04 - Entornos y pruebas bloqueadas.md','\n'.join(blocked))
initial=(ROOT/'reports/production-review-2026-10-25.md').read_text(encoding='utf-8')
initial=initial.replace('production-review-2026-10-25/', 'evidencias/inicial/')
(STAGE/'05 - Informe de revisión inicial.md').write_text(initial,encoding='utf-8')
for file in OUT.iterdir():
    if file.is_file()and file.suffix in ['.json','.png','.log']:shutil.copy2(file,EVIDENCE/file.name)
initial_dir=ROOT/'reports/production-review-2026-10-25'
if initial_dir.exists():
    target=EVIDENCE/'inicial';target.mkdir(exist_ok=True)
    for file in initial_dir.iterdir():
        if file.is_file():shutil.copy2(file,target/file.name)
selected=['functions/index.js','firestore.rules','storage.rules','firebase.json','vercel.json','vite.config.js','package.json','package-lock.json','functions/package.json','functions/package-lock.json','src/js/pages/store.js','src/js/pages/admin.js','src/js/pages/account.js','src/js/pages/orders.js','src/js/ui/login-modal.js','src/js/services/firebase.js']
hashes={filename:hashlib.sha256((ROOT/filename).read_bytes()).hexdigest()for filename in selected}
manifest={'date':'2026-10-25','project':str(ROOT),'files':hashes,'applicationCodeChangedByTests':False,'credentialsIncluded':False}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copy2(OUT/'manifest.json',EVIDENCE/'manifest.json')
# Stage append-only additions for the existing vault index pages. Actual vault
# contents are re-read and checked again before the approved copy operation.
VAULT=Path.home()/'OneDrive/Documentos/Mariru'
base=VAULT/'Web Mariru Bazar'
PATCH=OUT/'obsidian-existing-additions';PATCH.mkdir(exist_ok=True)
addition='''\n\n<!-- qa-integral-2026-10-25 -->
## Revisión integral de pruebas — 2026-10-25

> [!warning] Producción pendiente
> La revisión integral registra {executed} pruebas ejecutadas: {passed} aprobadas y {failed} fallidas, más {blocked} comprobaciones externas sin ejecutar. Los entornos simulados están identificados; no equivalen a una validación productiva.

- [[Web Mariru Bazar/QA - 2026-10-25/00 - Revisión integral]]
- [[Web Mariru Bazar/QA - 2026-10-25/01 - Matriz de pruebas]]
- [[Web Mariru Bazar/QA - 2026-10-25/02 - Pendientes por completar]]

La documentación anterior se conserva como historial. Las correcciones siguen abiertas hasta cumplir su criterio de aceptación y repetir la prueba correspondiente.
'''.format(executed=len(all_tests),passed=total['PASS'],failed=total['FAIL'],blocked=len(BLOCKED))
existing_hashes={}
for name in ['00 Mariru Bazar.md','Pruebas.md','Pendientes y riesgos.md']:
    original=(base/name).read_text(encoding='utf-8')
    existing_hashes[name]=hashlib.sha256((base/name).read_bytes()).hexdigest()
    if '<!-- qa-integral-2026-10-25 -->'not in original:
        (PATCH/name).write_text(original+addition,encoding='utf-8')
(OUT/'obsidian-source-hashes.json').write_text(json.dumps(existing_hashes,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'prepared':str(STAGE),'summary':summary,'openIssues':len(PENDING),'blockedTests':len(BLOCKED)},ensure_ascii=True,indent=2))
