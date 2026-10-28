import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length > 0) {
  throw new Error(`Falta configuración de Firebase: ${missingConfig.join(", ")}`);
}

export const app = initializeApp(firebaseConfig);
const recaptchaSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY;

export const db = getFirestore(app);

// initializeAuth sin popupRedirectResolver: el iframe de Google (~95 KB) y gapi solo se
// cargan cuando se usa "Continuar con Google" (ver login-modal.js y account.js).
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});

/** true si el sitio tiene clave de App Check (requisito para enviar pedidos). */
export const appCheckConfigurado = Boolean(recaptchaSiteKey);

let appCheckPromesa = null;
let functionsPromesa = null;

/**
 * App Check (reCAPTCHA v3) se inicia solo cuando hace falta: al enviar un pedido.
 * Así no se carga reCAPTCHA en cada página.
 * Si en el futuro se exige App Check también en Firestore, habrá que iniciarlo al cargar.
 */
export function iniciarAppCheck() {
  if (!recaptchaSiteKey) return Promise.resolve(null);
  appCheckPromesa ??= import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaV3Provider }) =>
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  );
  return appCheckPromesa;
}

/** Cloud Functions (región us-central1), cargado bajo demanda y con App Check listo. */
export function obtenerFunctions() {
  functionsPromesa ??= iniciarAppCheck()
    .then(() => import("firebase/functions"))
    .then(({ getFunctions }) => getFunctions(app, "us-central1"));
  return functionsPromesa;
}
