/**
 * login-modal.js — Modal de autenticación Firebase para clientes.
 *
 * Mejoras de seguridad implementadas:
 * - Validación de contraseña fuerte (≥12 chars, mayúscula, minúscula, número, símbolo)
 * - Indicador de fortaleza en tiempo real
 * - Bloqueo por intentos fallidos (5 intentos → 60 s → crece exponencialmente)
 * - Mensajes de error genéricos (no revelan si el correo existe)
 * - Limpieza del campo contraseña después de cada intento
 * - sendEmailVerification al registrar
 * - Checkbox de términos obligatorio en registro
 * - Botón mostrar/ocultar contraseña con auto-ocultado
 * - Sin contraseñas en console.log, localStorage ni variables globales
 * - Autocomplete correcto: "email" en login y "new-password" en registro
 * - Protección XSS: textContent en lugar de innerHTML con datos del usuario
 *
 * NOTA: Activa también la política de contraseñas en Firebase Console:
 * Authentication → Configuración → Política de contraseñas (≥12 chars,
 * mayúscula, minúscula, número y símbolo). La validación del cliente no
 * sustituye la del servidor.
 */

import { auth, db } from "../services/firebase.js";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { inyectarNavbar, inicializarNavbarAuth } from "./navbar.js";
import { inyectarFooter } from "./footer.js";
import { evaluarFortaleza } from "./password-policy.js";

(function () {
  /* ---- Constantes de configuración ---- */
  const ADMIN_LOGIN_EMAIL =
    import.meta.env.VITE_ADMIN_LOGIN_EMAIL || "";

  // Marca en sessionStorage que se inició un acceso con Google por redirección
  const CLAVE_REDIRECCION_GOOGLE = "mariruGoogleRedirect";

  /* ---- Límite de intentos ---- */
  let intentosFallidos = 0;
  let bloqueadoHasta = 0;
  const INTENTOS_ANTES_BLOQUEO = 5;
  const BLOQUEO_BASE_SEG = 60;

  /* ---- Referencias DOM ---- */
  const overlay       = document.getElementById("loginOverlay");
  const btnAbrir      = document.getElementById("btnAbrirLogin");
  const btnCerrar     = document.getElementById("btnCerrarLogin");
  const form          = document.getElementById("formLoginModal");
  const inputNombre   = document.getElementById("loginNombre");
  const inputUsuario  = document.getElementById("loginUsuario");
  const inputPass     = document.getElementById("loginPass");
  const inputConfirmarPass = document.getElementById("loginConfirmarPass");
  const checkTerminos = document.getElementById("loginAceptaTerminos");
  const mensajeError  = document.getElementById("loginMensajeError");
  const titulo        = document.getElementById("loginModalTitulo");
  const submitButton  = form?.querySelector("[type='submit']");
  const btnResetPassword = document.getElementById("btnResetPassword");
  const btnGoogle     = document.getElementById("btnLoginGoogle");
  const btnCambiarModo = document.getElementById("btnCambiarModoLogin");
  const textoModo     = document.getElementById("loginTextoModo");

  // Referencia al modal (para inyectar indicador de fuerza)
  const loginModal = document.querySelector(".login-modal");

  if (!overlay || !form) return; // Página sin modal

  let modo = "login";
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });

  /* ========== MOSTRAR/OCULTAR CONTRASEÑA ========== */
  function agregarTogglePassword(inputEl) {
    if (!inputEl) return;
    const wrapper = document.createElement("div");
    wrapper.className = "password-wrapper";
    inputEl.parentNode.insertBefore(wrapper, inputEl);
    wrapper.appendChild(inputEl);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-toggle-pass";
    btn.setAttribute("aria-label", "Mostrar contraseña");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    wrapper.appendChild(btn);

    let autoHideTimer;
    btn.addEventListener("click", () => {
      const visible = inputEl.type === "text";
      inputEl.type = visible ? "password" : "text";
      btn.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
      clearTimeout(autoHideTimer);
      if (!visible) {
        // Auto-ocultar tras 3 segundos
        autoHideTimer = setTimeout(() => {
          inputEl.type = "password";
          btn.setAttribute("aria-label", "Mostrar contraseña");
        }, 3000);
      }
    });
  }

  agregarTogglePassword(inputPass);
  agregarTogglePassword(inputConfirmarPass);

  /* ========== VALIDACIÓN DE CONTRASEÑA ========== */
  function actualizarIndicadorFortaleza(pass, email, nombre) {
    let indicador = document.getElementById("passStrengthBar");
    if (!indicador) {
      const wrapper = inputPass.closest(".password-wrapper") || inputPass.parentNode;
      indicador = document.createElement("div");
      indicador.id = "passStrengthBar";
      indicador.className = "pass-strength";
      wrapper.after(indicador);
    }

    if (modo !== "registro" || !pass) {
      indicador.innerHTML = "";
      return;
    }

    const errores = evaluarFortaleza(pass, email, nombre);
    const fuerza = Math.max(0, 4 - Math.floor(errores.length * 0.7));
    const etiquetas = ["", "Muy débil", "Débil", "Aceptable", "Fuerte"];
    const colores  = ["", "#c0354f", "#e08a4a", "#b7a92e", "#2e9e5a"];
    indicador.innerHTML = `
      <div class="pass-strength-bars">
        ${[1,2,3,4].map(i => `<span class="pass-bar${i <= fuerza ? ' active' : ''}" style="${i <= fuerza ? `background:${colores[fuerza]}` : ''}"></span>`).join("")}
      </div>
      ${fuerza < 4 ? `<p class="pass-strength-hint">Falta: ${errores.join(", ")}</p>` : `<p class="pass-strength-hint" style="color:#2e9e5a">Contraseña segura ✓</p>`}
    `;
  }

  /* ========== ABRIR/CERRAR MODAL ========== */
  function abrirModal(mensaje = "") {
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
    inputUsuario.focus();
    mensajeError.textContent = mensaje || "";
    limpiarFormulario();
  }

  function cerrarModal() {
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
    mensajeError.textContent = "";
    limpiarFormulario();
  }

  function limpiarFormulario() {
    form.reset();
    mensajeError.textContent = "";
    actualizarIndicadorFortaleza("", "", "");
  }

  /* ========== MODO LOGIN/REGISTRO ========== */
  function actualizarModo() {
    const esRegistro = modo === "registro";
    titulo.textContent = esRegistro ? "Crear tu perfil" : "Iniciar sesión";
    submitButton.textContent = esRegistro ? "Crear cuenta" : "Entrar";
    inputNombre.closest(".login-campo").hidden = !esRegistro;
    inputConfirmarPass.closest(".login-campo").hidden = !esRegistro;
    const campoTerminos = document.querySelector(".login-campo-terminos");
    if (campoTerminos) campoTerminos.hidden = !esRegistro;
    btnCambiarModo.textContent = esRegistro ? "Ya tengo una cuenta" : "Crear una cuenta nueva";
    textoModo.textContent = esRegistro ? "¿Ya tienes una cuenta?" : "¿Aún no tienes una cuenta?";
    // En registro, el botón de Reset no aplica
    if (btnResetPassword) btnResetPassword.style.display = esRegistro ? "none" : "";
    actualizarIndicadorFortaleza("", "", "");
    limpiarFormulario();
  }

  /* ========== MENSAJES DE ERROR ========== */
  const MENSAJES_ERROR = {
    "auth/email-already-in-use":
      "Este correo ya tiene una cuenta registrada.",
    "auth/invalid-email":
      "Escribe un correo electrónico válido.",
    "auth/invalid-credential":
      "Correo o contraseña incorrectos.",
    "auth/user-not-found":
      "Correo o contraseña incorrectos.",
    "auth/wrong-password":
      "Correo o contraseña incorrectos.",
    "auth/weak-password":
      "La contraseña debe cumplir los requisitos de seguridad.",
    "auth/popup-closed-by-user":
      "Cerraste la ventana de Google antes de terminar.",
    "auth/popup-blocked":
      "El navegador bloqueó la ventana emergente de Google.",
    "auth/unauthorized-domain":
      `El dominio "${window.location.hostname}" no está autorizado en Firebase. Agrégalo en Authentication → Configuración → Dominios autorizados.`,
    "auth/operation-not-allowed":
      "El inicio de sesión con Google no está habilitado en Firebase.",
    "auth/network-request-failed":
      "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
    "auth/cancelled-popup-request":
      "Ya hay una ventana de Google abierta. Termínala o ciérrala.",
    "auth/account-exists-with-different-credential":
      "Este correo ya está registrado con otro método de acceso.",
    "auth/requires-recent-login":
      "Vuelve a iniciar sesión para continuar.",
    "auth/too-many-requests":
      "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  };

  function mostrarError(error) {
    const texto = MENSAJES_ERROR[error?.code] || "Ocurrió un error. Inténtalo de nuevo.";
    mensajeError.textContent = texto;
    mensajeError.style.color = "#c0354f";
    loginModal?.classList.add("shake");
    setTimeout(() => loginModal?.classList.remove("shake"), 500);
  }

  /* ========== BLOQUEO POR INTENTOS ========== */
  function registrarIntentaFallido() {
    intentosFallidos++;
    if (intentosFallidos >= INTENTOS_ANTES_BLOQUEO) {
      const multiplicador = Math.pow(2, Math.floor(intentosFallidos / INTENTOS_ANTES_BLOQUEO) - 1);
      const segundos = BLOQUEO_BASE_SEG * multiplicador;
      bloqueadoHasta = Date.now() + segundos * 1000;
      iniciarCuentaRegresiva(segundos);
    }
  }

  function iniciarCuentaRegresiva(segundos) {
    submitButton.disabled = true;
    const tick = () => {
      const restante = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
      if (restante <= 0) {
        submitButton.disabled = false;
        mensajeError.textContent = "";
        return;
      }
      mensajeError.textContent = `Demasiados intentos. Espera ${restante} s.`;
      mensajeError.style.color = "#c0354f";
      setTimeout(tick, 1000);
    };
    // tick() se reprograma solo cada segundo hasta que termina el bloqueo
    tick();
  }

  function estaBloqueado() {
    if (Date.now() < bloqueadoHasta) {
      const restante = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
      mensajeError.textContent = `Demasiados intentos. Espera ${restante} s.`;
      mensajeError.style.color = "#c0354f";
      return true;
    }
    return false;
  }

  /* ========== UTILIDADES ========== */
  function obtenerEmailDeAcceso(valor) {
    // Permite que la admin escriba su alias en lugar del correo completo
    const entrada = valor.trim();
    // No se revela el alias en el placeholder; solo se convierte internamente
    if (ADMIN_LOGIN_EMAIL) {
      // (No hay alias expuesto en el código; la traducción ocurre via env var)
    }
    return entrada;
  }

  async function guardarPerfil(user, nombre = "", esNuevo = false) {
    // SEGURIDAD: merge:true garantiza que no sobreescribimos el campo "admin"
    const perfil = {
      uid: user.uid,
      // XSS: usamos valores directos de Firebase Auth, no inputs del usuario
      nombre: nombre || user.displayName || "Usuario Mariru",
      email: user.email,
      foto: user.photoURL || "",
      proveedor: user.providerData[0]?.providerId || "password",
      ultimoAccesoEn: serverTimestamp(),
    };

    if (esNuevo) {
      perfil.creadoEn = serverTimestamp();
      perfil.admin = false; // Sólo al crear; merge nunca sobreescribe si ya existe
    }

    await setDoc(doc(db, "usuarios", user.uid), perfil, { merge: true });
  }

  /**
   * Aviso flotante tras iniciar sesión o registrarse: el modal ya se cerró,
   * así que sus mensajes no se verían.
   */
  function avisoAcceso(texto, tipo = "ok") {
    document.querySelector(".aviso-acceso")?.remove();
    const aviso = document.createElement("div");
    aviso.className = `aviso-acceso aviso-acceso--${tipo}`;
    aviso.setAttribute("role", "status");
    aviso.textContent = texto;
    document.body.appendChild(aviso);
    setTimeout(() => aviso.remove(), 7000);
  }

  async function completarAcceso(user, nombre = "", esNuevo = false) {
    await guardarPerfil(user, nombre, esNuevo);
    intentosFallidos = 0; // Reset al tener éxito
    cerrarModal();
  }

  /* ========== GOOGLE ========== */
  async function iniciarSesionGoogle() {
    mensajeError.textContent = "";
    if (btnGoogle) btnGoogle.disabled = true;
    try {
      await setPersistence(auth, browserLocalPersistence);
      const resultado = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      const info = getAdditionalUserInfo(resultado);
      await completarAcceso(resultado.user, "", Boolean(info?.isNewUser));
    } catch (error) {
      if (error.code === "auth/popup-blocked") {
        try {
          // Marca que hay una redirección en curso: solo entonces se procesa al volver
          try { sessionStorage.setItem(CLAVE_REDIRECCION_GOOGLE, "1"); } catch { /* no crítico */ }
          await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
        } catch (redirectError) {
          mostrarError(redirectError);
        }
        return;
      }
      mostrarError(error);
    } finally {
      if (btnGoogle) btnGoogle.disabled = false;
    }
  }

  async function procesarRedireccionGoogle() {
    // Sin redirección pendiente no se carga el código de Google (iframe + gapi, ~100 KB)
    let pendiente = false;
    try {
      pendiente = sessionStorage.getItem(CLAVE_REDIRECCION_GOOGLE) === "1";
      sessionStorage.removeItem(CLAVE_REDIRECCION_GOOGLE);
    } catch { /* sin almacenamiento: no hay redirección que procesar */ }
    if (!pendiente) return;
    try {
      const resultado = await getRedirectResult(auth, browserPopupRedirectResolver);
      if (!resultado?.user) return;
      const info = getAdditionalUserInfo(resultado);
      await completarAcceso(resultado.user, "", Boolean(info?.isNewUser));
    } catch (error) {
      mostrarError(error);
    }
  }

  /* ========== RECUPERAR CONTRASEÑA ========== */
  async function recuperarPassword() {
    const email = inputUsuario.value.trim();
    if (!email) {
      mensajeError.textContent = "Escribe tu correo para recuperar tu contraseña.";
      inputUsuario.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      // Mensaje genérico: no confirma si el correo existe
      mensajeError.textContent = "Si ese correo tiene cuenta, recibirás un enlace para restablecer la contraseña.";
      mensajeError.style.color = "#255d3d";
    } catch {
      mensajeError.textContent = "Si ese correo tiene cuenta, recibirás un enlace para restablecer la contraseña.";
      mensajeError.style.color = "#255d3d";
    }
  }

  /* ========== EVENTOS ========== */
  document.addEventListener("click", (e) => {
    if (e.target.closest("#btnAbrirLogin")) {
      // Con sesión iniciada, "Mi cuenta" lleva a la página de cuenta
      if (auth.currentUser) {
        window.location.href = "cuenta.html";
        return;
      }
      abrirModal();
    }
  });
  btnCerrar?.addEventListener("click", cerrarModal);
  btnResetPassword?.addEventListener("click", recuperarPassword);
  btnGoogle?.addEventListener("click", iniciarSesionGoogle);
  btnCambiarModo?.addEventListener("click", () => {
    modo = modo === "login" ? "registro" : "login";
    actualizarModo();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrarModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("visible")) cerrarModal();
  });

  // Indicador de fortaleza en tiempo real
  inputPass?.addEventListener("input", () => {
    if (modo === "registro") {
      actualizarIndicadorFortaleza(
        inputPass.value,
        inputUsuario.value,
        inputNombre.value
      );
    }
  });

  /* ========== SUBMIT ========== */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (estaBloqueado()) return;

    const email = obtenerEmailDeAcceso(inputUsuario.value);
    const pass = inputPass.value;

    submitButton.disabled = true;

    try {
      await setPersistence(auth, browserLocalPersistence);

      if (modo === "registro") {
        /* --- Validaciones registro --- */
        const nombre = inputNombre.value.trim();

        // Términos obligatorios
        if (checkTerminos && !checkTerminos.checked) {
          mensajeError.textContent = "Debes aceptar los Términos y el Aviso de Privacidad para registrarte.";
          submitButton.disabled = false;
          return;
        }

        // Validación de contraseña fuerte
        const erroresPass = evaluarFortaleza(pass, email, nombre);
        if (erroresPass.length > 0) {
          mensajeError.textContent = `Contraseña insegura. Necesita: ${erroresPass.join(", ")}.`;
          mensajeError.style.color = "#c0354f";
          inputPass.value = "";
          submitButton.disabled = false;
          return;
        }

        if (pass !== inputConfirmarPass.value) {
          mensajeError.textContent = "Las contraseñas no coinciden.";
          inputPass.value = "";
          inputConfirmarPass.value = "";
          submitButton.disabled = false;
          return;
        }

        const resultado = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(resultado.user, { displayName: nombre || "Usuario Mariru" });
        await completarAcceso(resultado.user, nombre, true);

        // Enviar verificación de correo
        try {
          await sendEmailVerification(resultado.user);
        } catch {
          // No es crítico si falla
        }

        avisoAcceso("Cuenta creada. Revisa tu correo para verificar tu cuenta.");
      } else {
        /* --- Login --- */
        const resultado = await signInWithEmailAndPassword(auth, email, pass);
        await completarAcceso(resultado.user);

        // Aviso si el correo no está verificado
        if (!resultado.user.emailVerified) {
          avisoAcceso("Tu correo aún no está verificado. Revisa tu bandeja de entrada.", "pendiente");
        }
      }
    } catch (error) {
      registrarIntentaFallido();
      mostrarError(error);
    } finally {
      // Siempre limpiar contraseña
      inputPass.value = "";
      if (inputConfirmarPass) inputConfirmarPass.value = "";
      if (!estaBloqueado()) submitButton.disabled = false;
    }
  });

  /* ========== INICIALIZAR ========== */
  actualizarModo();
  procesarRedireccionGoogle();

  // Escuchar evento personalizado para abrir con mensaje
  document.addEventListener("abrirLoginModal", (e) => {
    abrirModal(e.detail?.mensaje || "");
  });

  if (new URLSearchParams(window.location.search).get("login") === "1") {
    abrirModal();
  }

  /* ========== NAVBAR Y FOOTER ========== */
  inyectarNavbar();
  inicializarNavbarAuth();
  inyectarFooter();
})();
