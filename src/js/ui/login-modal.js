import { auth, db } from "../services/firebase.js";
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

(function () {
  const SESSION_KEY = "mariru_admin_logged";
  const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || "Mariru05";
  const ADMIN_LOGIN_EMAIL = import.meta.env.VITE_ADMIN_LOGIN_EMAIL || "uzielito1608@gmail.com";

  const overlay = document.getElementById("loginOverlay");
  const btnAbrir = document.getElementById("btnAbrirLogin");
  const btnCerrar = document.getElementById("btnCerrarLogin");
  const form = document.getElementById("formLoginModal");
  const inputNombre = document.getElementById("loginNombre");
  const inputUsuario = document.getElementById("loginUsuario");
  const inputPass = document.getElementById("loginPass");
  const inputConfirmarPass = document.getElementById("loginConfirmarPass");
  const mensajeError = document.getElementById("loginMensajeError");
  const titulo = document.getElementById("loginModalTitulo");
  const submitButton = form.querySelector("[type='submit']");
  const btnResetPassword = document.getElementById("btnResetPassword");
  const btnGoogle = document.getElementById("btnLoginGoogle");
  const btnCambiarModo = document.getElementById("btnCambiarModoLogin");
  const textoModo = document.getElementById("loginTextoModo");
  let modo = "login";
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });

  function abrirModal() {
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
    inputUsuario.focus();
    mensajeError.textContent = "";
    limpiarFormulario();
  }

  function cerrarModal() {
    overlay.classList.remove("visible");
    overlay.setAttribute("aria-hidden", "true");
    mensajeError.textContent = "";
  }

  function limpiarFormulario() {
    form.reset();
    mensajeError.textContent = "";
  }

  function actualizarModo() {
    const registro = modo === "registro";
    titulo.textContent = registro ? "Crear tu perfil" : "Iniciar sesión";
    submitButton.textContent = registro ? "Crear cuenta" : "Entrar";
    inputNombre.closest(".login-campo").hidden = !registro;
    inputConfirmarPass.closest(".login-campo").hidden = !registro;
    btnCambiarModo.textContent = registro
      ? "Ya tengo una cuenta"
      : "Crear una cuenta nueva";
    textoModo.textContent = registro
      ? "¿Ya tienes una cuenta?"
      : "¿Aún no tienes una cuenta?";
    limpiarFormulario();
  }

  function mostrarError(error) {
    const mensajes = {
      "auth/email-already-in-use": "Este correo ya tiene una cuenta registrada.",
      "auth/invalid-email": "Escribe un correo electrónico válido.",
      "auth/invalid-credential": "El correo o la contraseña no son correctos.",
      "auth/user-not-found": "No existe una cuenta con este correo.",
      "auth/wrong-password": "El correo o la contraseña no son correctos.",
      "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
      "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
      "auth/popup-blocked": "El navegador bloqueó la ventana de Google.",
      "auth/unauthorized-domain": `El dominio "${window.location.hostname}" no está autorizado en Firebase Authentication. Agrégalo en Authentication > Settings > Authorized domains.`,
      "auth/operation-not-allowed":
        "El acceso con Google no está habilitado en Firebase Authentication.",
      "auth/network-request-failed":
        "No se pudo conectar con Firebase. Revisa tu conexión a internet.",
      "auth/cancelled-popup-request":
        "Ya hay una ventana de Google abierta. Termínala o ciérrala.",
      "auth/account-exists-with-different-credential":
        "Este correo ya está registrado con otro método de acceso.",
      "auth/requires-recent-login": "Vuelve a iniciar sesión para continuar.",
      "auth/too-many-requests": "Se bloquearon varios intentos. Espera unos minutos e inténtalo de nuevo.",
    };
    mensajeError.textContent =
      mensajes[error?.code] ||
      `No se pudo iniciar sesión (${error?.code || "error desconocido"}).`;
    mensajeError.style.color = "#c0354f";
    document.querySelector(".login-modal").classList.add("shake");
    setTimeout(() => document.querySelector(".login-modal").classList.remove("shake"), 500);
  }

  function obtenerEmailDeAcceso(valor) {
    const entrada = valor.trim();
    return entrada.toLowerCase() === ADMIN_USERNAME.toLowerCase()
      ? ADMIN_LOGIN_EMAIL
      : entrada;
  }

  async function esAdministrador(user) {
    const perfilSnapshot = await getDoc(doc(db, "usuarios", user.uid));
    return perfilSnapshot.exists() && perfilSnapshot.data().admin === true;
  }

  async function completarAcceso(user, nombre = "", esNuevo = false) {
    await guardarPerfil(user, nombre, esNuevo);
    const tienePermisos = await esAdministrador(user);

    if (!tienePermisos) {
      mensajeError.textContent = "La cuenta inició sesión, pero no tiene permisos de administrador.";
      mensajeError.style.color = "#a63a57";
      return false;
    }

    sessionStorage.setItem(SESSION_KEY, "true");
    cerrarModal();
    window.location.href = "admin.html";
    return true;
  }

  async function guardarPerfil(user, nombre = "", esNuevo = false) {
    const perfil = {
      uid: user.uid,
      nombre: nombre || user.displayName || "Usuario Mariru",
      email: user.email,
      foto: user.photoURL || "",
      proveedor: user.providerData[0]?.providerId || "password",
      ultimoAccesoEn: serverTimestamp(),
    };

    if (esNuevo) {
      perfil.creadoEn = serverTimestamp();
      perfil.admin = false;
    }

    await setDoc(
      doc(db, "usuarios", user.uid),
      perfil,
      { merge: true }
    );
  }

  async function iniciarSesionGoogle() {
    mensajeError.textContent = "";
    btnGoogle.disabled = true;
    try {
      const resultado = await signInWithPopup(auth, googleProvider);
      const informacion = getAdditionalUserInfo(resultado);
      await completarAcceso(resultado.user, "", Boolean(informacion?.isNewUser));
    } catch (error) {
      if (error.code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          mostrarError(redirectError);
        }
        return;
      }
      mostrarError(error);
    } finally {
      btnGoogle.disabled = false;
    }

  }

  async function procesarRedireccionGoogle() {
    try {
      const resultado = await getRedirectResult(auth);
      if (!resultado?.user) return;
      const informacion = getAdditionalUserInfo(resultado);
      await completarAcceso(resultado.user, "", Boolean(informacion?.isNewUser));
    } catch (error) {
      mostrarError(error);
    }
  }

  async function recuperarPassword() {
    const email = modo === "login"
      ? obtenerEmailDeAcceso(inputUsuario.value)
      : inputUsuario.value.trim();
    if (!email) {
      mensajeError.textContent = "Escribe tu correo para recuperar tu contraseña.";
      inputUsuario.focus();
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      mensajeError.textContent = "Te enviamos un correo para restablecer la contraseña.";
      mensajeError.style.color = "#255d3d";
    } catch (error) {
      mostrarError(error);
      mensajeError.style.color = "#a63535";
    }
  }

  btnAbrir.addEventListener("click", abrirModal);
  btnCerrar.addEventListener("click", cerrarModal);
  btnResetPassword.addEventListener("click", recuperarPassword);
  btnGoogle.addEventListener("click", iniciarSesionGoogle);
  btnCambiarModo.addEventListener("click", () => {
    modo = modo === "login" ? "registro" : "login";
    actualizarModo();
  });

  // Cerrar al hacer clic fuera del modal
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrarModal();
  });

  // Cerrar con Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("visible")) {
      cerrarModal();
    }
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = obtenerEmailDeAcceso(inputUsuario.value);
    const pass = inputPass.value;

    try {
      if (modo === "registro") {
        const nombre = inputNombre.value.trim();
        if (pass !== inputConfirmarPass.value) {
          mensajeError.textContent = "Las contraseñas no coinciden.";
          return;
        }
        const resultado = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(resultado.user, { displayName: nombre || "Usuario Mariru" });
        await completarAcceso(resultado.user, nombre, true);
      } else {
        const resultado = await signInWithEmailAndPassword(auth, email, pass);
        await completarAcceso(resultado.user);
      }
    } catch (error) {
      mostrarError(error);
      inputPass.value = "";
      inputPass.focus();
    }
  });

  actualizarModo();
  procesarRedireccionGoogle();
  if (new URLSearchParams(window.location.search).get("login") === "1") {
    abrirModal();
  }
})();
