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
- `VITE_ADMIN_LOGIN_EMAIL`

Después del primer despliegue, la página estará en:

```text
https://<usuario>.github.io/Mariru_tienda/
```

## Firebase

La aplicación usa Firestore para `productos` y `pedidos`, Firebase Authentication para el acceso administrativo y Firebase Storage para imágenes y videos. Las reglas de seguridad deben configurarse en Firebase; las credenciales públicas del SDK no sustituyen las reglas.

La utilidad `seed.html` solo debe usarse de forma controlada para cargar el catálogo inicial.
