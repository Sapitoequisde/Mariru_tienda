# Mariru Bazar

Tienda multipágina para practicar un flujo de catálogo, carrito, pedidos y administración con Firebase.

## Estructura

```text
.
├── public/assets/          # Imágenes estáticas servidas sin transformación
├── src/
│   ├── *.html              # Entradas multipágina de Vite
│   ├── js/
│   │   ├── pages/          # Código específico de cada página
│   │   ├── services/       # Firebase y acceso a servicios externos
│   │   ├── tools/          # Utilidades operativas, como carga inicial
│   │   └── ui/             # Componentes de interfaz reutilizables
│   └── styles/             # Tailwind y estilos de la aplicación
├── vite.config.js
└── package.json
```

## Desarrollo

```bash
npm install
npm run dev
```

Antes de iniciar, copia `.env.example` como `.env` y completa la configuración de Firebase.

## Build de producción

```bash
npm run build
npm run preview
```

## GitHub Pages

El workflow `.github/workflows/deploy-pages.yml` publica automáticamente el sitio al hacer push a `main`.

En la configuración del repositorio deben existir estas variables públicas de Actions:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY`
- `VITE_ADMIN_LOGIN_EMAIL`

Después del primer despliegue, la página estará en:

```text
https://<usuario>.github.io/Mariru_tienda/
```

## Firebase

La aplicación usa Firestore para `productos` y `pedidos`, Firebase Authentication para el acceso administrativo y Firebase Storage para imágenes y videos. Las reglas de seguridad deben configurarse en Firebase; las credenciales públicas del SDK no sustituyen las reglas.

La solicitud de compra se procesa en `functions/submitWhatsAppOrder`: Firebase App Check protege el endpoint, el servidor valida precios/opciones/inventario, registra la solicitud y descuenta existencias en una transacción, y envía el reporte automáticamente mediante una plantilla aprobada de WhatsApp Business Platform. Si WhatsApp rechaza el envío, se registra el error y se intenta restaurar el stock; el cliente recibe un mensaje explícito y se le indica contactar a Mariru antes de reintentar. El sitio no procesa pagos.

### Desplegar el backend Firebase

1. Selecciona el proyecto Firebase correcto en la CLI: `npx firebase-tools login` y `npx firebase-tools use --add`.
2. Instala las dependencias del backend: `npm ci --prefix functions`.
3. En Meta, configura WhatsApp Business Platform/Cloud API y crea/aprueba una plantilla de utilidad `mariru_nuevo_pedido` en español (`es_MX`), con un único parámetro `{{1}}` en el cuerpo, por ejemplo: `Nuevo pedido para Mariru:\n{{1}}`. El número emisor asociado al `PHONE_NUMBER_ID` debe poder enviar a `WHATSAPP_STORE_RECIPIENT`; normalmente se requiere un número emisor distinto al número de destino. Confirma en Meta si tu cuenta admite coexistencia antes de intentar usar el mismo número.
4. Guarda el token permanente de la API como secreto, nunca en `.env` del navegador ni en el código:

   ```bash
   npx firebase-tools functions:secrets:set WHATSAPP_ACCESS_TOKEN
   ```

5. En `functions/.env.<ID_DEL_PROYECTO_FIREBASE>` (archivo local ignorado por Git), configura los parámetros no secretos:

   ```dotenv
   WHATSAPP_PHONE_NUMBER_ID=ID_DEL_NUMERO_EMISOR_DE_META
   WHATSAPP_STORE_RECIPIENT=526622380735
   WHATSAPP_ORDER_TEMPLATE_NAME=mariru_nuevo_pedido
   WHATSAPP_ORDER_TEMPLATE_LANGUAGE=es_MX
   WHATSAPP_GRAPH_API_VERSION=vVERSION_ACTUAL_DE_META
   ```

   Usa una versión de Graph API que Meta aún tenga habilitada. El destinatario se escribe con código de país y solo dígitos. El reporte se rechaza antes de reservar inventario si excede el límite de longitud de la plantilla.
6. En Firebase Console, registra la app web con el proveedor reCAPTCHA v3 de App Check y autoriza los dominios de producción y desarrollo. Configura su clave pública como `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` en `.env`, GitHub Actions y Vercel. El endpoint exige App Check y no aceptará pedidos hasta contar con una clave válida.
7. Despliega reglas y funciones: `npx firebase-tools deploy --only firestore:rules,functions`. Firebase pedirá los parámetros `defineString` al primer despliegue si aún no existen en el archivo `.env.<ID_DEL_PROYECTO_FIREBASE>`.
8. Prueba en el número receptor que Meta acepte la plantilla. La respuesta exitosa de la API significa que Meta aceptó el mensaje para envío, no que la persona lo haya leído o que la entrega final esté garantizada.

Cloud Functions requiere un proyecto Firebase con facturación habilitada (plan Blaze). Mantén staging y producción separados. La antigua página de carga (`seed.html`) se eliminó; los productos se agregan desde el panel.

El panel incluye **Cargar 15 productos de prueba** en Tu inventario. Requiere sesión administradora y sube cinco bolsos, cinco perfumes y cinco artículos de maquillaje con dos PNG transparentes por producto y miniaturas WebP. La carga omite los documentos existentes para conservar ediciones y permitir reintentos. Las fuentes, precios de referencia e instrucciones están en [el catálogo de prueba](scripts/catalogo-prueba/README.md). Validación: `node --test tests/catalogo-prueba.test.mjs` y, con Vite en el puerto 5183 y Playwright disponible, `python tests/catalogo-prueba-browser.py` (Firebase simulado).

### Vercel

Configura Root Directory `./`, Framework `Vite`, Install Command `npm ci`, Build Command `npm run build` y Output Directory `dist`. Añade las variables `VITE_FIREBASE_*`, `VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` y `VITE_ADMIN_LOGIN_EMAIL` en los entornos de Vercel; los valores `VITE_*` son públicos en el navegador y no deben contener secretos. Los secretos y parámetros de WhatsApp se configuran solo en Firebase Functions. Los encabezados/CSP del proyecto Vercel se configuran en `vercel.json`; probarlos en Preview con Auth, App Check, Storage, fuentes y el envío de pedidos antes de Production.

El `overrides` de `package.json` mantiene `@grpc/grpc-js` en una versión corregida porque Firestore fija una rama vulnerable en su dependencia Node. Retíralo solo cuando una actualización de Firestore ya incluya la corrección.

Antes de publicar, confirma con asesoría local que indicar Hermosillo, Sonora, México (sin establecimiento físico) cumple los requisitos aplicables para identificar y contactar al responsable. Las páginas legales reflejan la política comercial comunicada por la tienda; revísalas si cambian sus plazos o condiciones.
