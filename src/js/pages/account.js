/**
 * account.js — Página "Mi cuenta" (cuenta.html).
 *
 * Incluye:
 * - Información de la cuenta y edición del nombre
 * - Direcciones guardadas en usuarios/{uid}/direcciones (máx. 5)
 * - Cambio de contraseña con reautenticación (solo cuentas con contraseña)
 * - Cerrar sesión
 * - Eliminar cuenta: reautentica, borra direcciones y perfil, y después el usuario de Auth
 *
 * SEGURIDAD:
 * - Los datos se insertan con textContent, nunca con innerHTML
 * - Las reglas de Firestore limitan cada usuario a sus propios documentos
 * - La cuenta administradora no se puede eliminar desde aquí
 */
import { auth, db } from "../services/firebase.js";
import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  browserPopupRedirectResolver,
  sendEmailVerification,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { inyectarNavbar, inicializarNavbarAuth } from "../ui/navbar.js";
import { inyectarFooter } from "../ui/footer.js";
import { evaluarFortaleza } from "../ui/password-policy.js";

inyectarNavbar();
inicializarNavbarAuth();
inyectarFooter();

document.getElementById("btnAbrirLogin")?.addEventListener("click", () => {
  if (auth.currentUser) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    window.location.href = "inicio.html?login=1";
  }
});

const MAX_DIRECCIONES = 5;
// Identificadores fijos de las direcciones (mismos que permiten las reglas de Firestore)
const SLOTS_DIRECCION = ["d1", "d2", "d3", "d4", "d5"];
const NOMBRES_PROVEEDOR = {
  password: "Correo y contraseña",
  "google.com": "Google",
};
const MENSAJES_ERROR = {
  "auth/invalid-credential": "La contraseña no es correcta.",
  "auth/wrong-password": "La contraseña no es correcta.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  "auth/requires-recent-login": "Por seguridad, vuelve a iniciar sesión e inténtalo de nuevo.",
  "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de confirmar.",
  "auth/popup-blocked": "El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo.",
  "auth/user-mismatch": "Confirma con la misma cuenta de Google con la que iniciaste sesión.",
  "auth/weak-password": "La nueva contraseña no cumple los requisitos de seguridad.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e inténtalo de nuevo.",
  "permission-denied": "No tienes permiso para hacer este cambio.",
  "limite-direcciones": "Ya tienes 5 direcciones guardadas. Elimina una para agregar otra.",
};

const estado = document.getElementById("cuentaEstado");
const contenido = document.getElementById("cuentaContenido");

let usuarioActual = null;
let perfil = null;
let direcciones = [];
let direccionEditando = null;

/* ============================================================
   UTILIDADES
   ============================================================ */
function el(tag, className, texto) {
  const nodo = document.createElement(tag);
  if (className) nodo.className = className;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function mostrarMensaje(id, texto, tipo = "error") {
  const nodo = document.getElementById(id);
  nodo.textContent = texto;
  nodo.dataset.tipo = tipo;
}

function textoError(error) {
  return MENSAJES_ERROR[error?.code] || "Ocurrió un error. Inténtalo de nuevo.";
}

function formatoFecha(valor) {
  const fecha = valor ? new Date(valor) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

function tieneProveedor(user, providerId) {
  return user.providerData.some(p => p.providerId === providerId);
}

function telefonoValido(telefono) {
  const digitos = telefono.replace(/\D/g, "");
  return /^[+0-9()\s-]+$/.test(telefono) && digitos.length >= 7 && digitos.length <= 15;
}

function direccionesRef(uid) {
  return collection(db, "usuarios", uid, "direcciones");
}

/* ============================================================
   ESTADO DE SESIÓN
   ============================================================ */
function mostrarAcceso() {
  contenido.hidden = true;
  estado.hidden = false;
  estado.replaceChildren(
    el("span", "cuenta-estado-icono", "♡"),
    el("h2", "", "Inicia sesión para ver tu cuenta"),
    el("p", "", "Desde aquí puedes administrar tus datos, direcciones y seguridad."),
  );
  const enlace = el("a", "cuenta-btn", "Iniciar sesión");
  enlace.href = "inicio.html?login=1";
  estado.appendChild(enlace);
}

onAuthStateChanged(auth, async user => {
  usuarioActual = user;
  if (!user) {
    mostrarAcceso();
    return;
  }

  estado.hidden = false;
  estado.replaceChildren(el("p", "", "Cargando tu cuenta..."));
  try {
    const snapshot = await getDoc(doc(db, "usuarios", user.uid));
    perfil = snapshot.exists() ? snapshot.data() : null;
    pintarInformacion(user);
    pintarSeguridad(user);
    await cargarDirecciones(user.uid);
    estado.hidden = true;
    contenido.hidden = false;
  } catch (error) {
    console.error("No se pudo cargar la cuenta.", error);
    estado.replaceChildren(
      el("h2", "", "No se pudo cargar tu cuenta"),
      el("p", "", "Actualiza la página e inténtalo de nuevo."),
    );
  }
});

/* ============================================================
   INFORMACIÓN DE LA CUENTA
   ============================================================ */
function pintarInformacion(user) {
  const nombre = user.displayName || perfil?.nombre || "Usuario Mariru";
  document.getElementById("cuentaInfoTitulo").textContent = nombre;
  document.getElementById("cuentaCorreo").textContent = user.email || "";
  document.getElementById("cuentaNombreInput").value = nombre;

  const avatar = document.getElementById("cuentaAvatar");
  avatar.replaceChildren();
  if (user.photoURL) {
    const img = el("img");
    img.src = user.photoURL;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    avatar.appendChild(img);
  } else {
    avatar.textContent = nombre.trim().charAt(0).toUpperCase() || "M";
  }

  const verificado = document.getElementById("cuentaVerificado");
  verificado.textContent = user.emailVerified ? "Sí ✓" : "Pendiente";
  verificado.className = user.emailVerified ? "cuenta-insignia cuenta-insignia-ok" : "cuenta-insignia cuenta-insignia-pendiente";
  document.getElementById("btnReenviarVerificacion").hidden = user.emailVerified;

  document.getElementById("cuentaProveedor").textContent = user.providerData
    .map(p => NOMBRES_PROVEEDOR[p.providerId] || p.providerId)
    .join(" y ") || "—";
  document.getElementById("cuentaCreada").textContent = formatoFecha(user.metadata.creationTime);
  document.getElementById("cuentaUltimoAcceso").textContent = formatoFecha(user.metadata.lastSignInTime);
}

document.getElementById("btnReenviarVerificacion").addEventListener("click", async event => {
  const boton = event.currentTarget;
  boton.disabled = true;
  try {
    await sendEmailVerification(usuarioActual);
    boton.textContent = "Correo enviado. Revisa tu bandeja de entrada.";
  } catch (error) {
    console.error("No se pudo reenviar la verificación.", error);
    boton.textContent = textoError(error);
    boton.disabled = false;
  }
});

document.getElementById("formNombre").addEventListener("submit", async event => {
  event.preventDefault();
  const nombre = document.getElementById("cuentaNombreInput").value.trim();
  if (!nombre || nombre.length > 80) {
    mostrarMensaje("mensajeNombre", "Escribe un nombre de hasta 80 caracteres.");
    return;
  }

  const boton = event.currentTarget.querySelector("[type='submit']");
  boton.disabled = true;
  try {
    await updateProfile(usuarioActual, { displayName: nombre });
    const datos = { nombre, actualizadoEn: serverTimestamp() };
    if (!perfil) {
      // Las reglas solo permiten crear el perfil con admin: false
      Object.assign(datos, { uid: usuarioActual.uid, email: usuarioActual.email || "", admin: false, creadoEn: serverTimestamp() });
    }
    await setDoc(doc(db, "usuarios", usuarioActual.uid), datos, { merge: true });
    perfil = { ...perfil, ...datos };
    pintarInformacion(usuarioActual);
    mostrarMensaje("mensajeNombre", "Nombre actualizado.", "ok");
  } catch (error) {
    console.error("No se pudo actualizar el nombre.", error);
    mostrarMensaje("mensajeNombre", textoError(error));
  } finally {
    boton.disabled = false;
  }
});

/* ============================================================
   DIRECCIONES GUARDADAS
   ============================================================ */
const formDireccion = document.getElementById("formDireccion");
const btnNuevaDireccion = document.getElementById("btnNuevaDireccion");

async function cargarDirecciones(uid) {
  const snapshot = await getDocs(direccionesRef(uid));
  direcciones = snapshot.docs
    .map(documento => ({ id: documento.id, ...documento.data() }))
    .sort((a, b) => Number(b.predeterminada === true) - Number(a.predeterminada === true) ||
      (a.creadoEn?.toMillis?.() || 0) - (b.creadoEn?.toMillis?.() || 0));
  pintarDirecciones();
}

function pintarDirecciones() {
  const lista = document.getElementById("direccionesLista");
  lista.replaceChildren();
  btnNuevaDireccion.disabled = direcciones.length >= MAX_DIRECCIONES;
  btnNuevaDireccion.title = btnNuevaDireccion.disabled ? `Puedes guardar hasta ${MAX_DIRECCIONES} direcciones.` : "";

  if (!direcciones.length) {
    lista.appendChild(el("p", "cuenta-vacio", "Aún no tienes direcciones guardadas."));
    return;
  }

  for (const direccion of direcciones) {
    const tarjeta = el("article", "direccion-card");
    const encabezado = el("header", "direccion-card-encabezado");
    encabezado.appendChild(el("strong", "", direccion.alias));
    if (direccion.predeterminada) encabezado.appendChild(el("span", "cuenta-insignia cuenta-insignia-ok", "Principal"));
    tarjeta.appendChild(encabezado);

    tarjeta.appendChild(el("p", "", direccion.destinatario));
    tarjeta.appendChild(el("p", "", `${direccion.calle}, ${direccion.colonia}`));
    tarjeta.appendChild(el("p", "", `C.P. ${direccion.codigoPostal} · Hermosillo, Sonora`));
    tarjeta.appendChild(el("p", "", `Tel. ${direccion.telefono}`));
    if (direccion.referencias) tarjeta.appendChild(el("p", "direccion-referencias", direccion.referencias));

    const acciones = el("div", "direccion-card-acciones");
    if (!direccion.predeterminada) {
      const btnPrincipal = el("button", "cuenta-enlace", "Hacer principal");
      btnPrincipal.type = "button";
      btnPrincipal.addEventListener("click", () => marcarPrincipal(direccion.id));
      acciones.appendChild(btnPrincipal);
    }
    const btnEditar = el("button", "cuenta-enlace", "Editar");
    btnEditar.type = "button";
    btnEditar.addEventListener("click", () => abrirFormularioDireccion(direccion));
    const btnEliminar = el("button", "cuenta-enlace cuenta-enlace-peligro", "Eliminar");
    btnEliminar.type = "button";
    btnEliminar.addEventListener("click", () => eliminarDireccion(direccion));
    acciones.append(btnEditar, btnEliminar);
    tarjeta.appendChild(acciones);

    lista.appendChild(tarjeta);
  }
}

function abrirFormularioDireccion(direccion = null) {
  direccionEditando = direccion;
  formDireccion.reset();
  mostrarMensaje("mensajeDireccion", "");
  document.getElementById("formDireccionTitulo").textContent = direccion ? "Editar dirección" : "Nueva dirección";

  if (direccion) {
    document.getElementById("dirAlias").value = direccion.alias || "";
    document.getElementById("dirDestinatario").value = direccion.destinatario || "";
    document.getElementById("dirCalle").value = direccion.calle || "";
    document.getElementById("dirColonia").value = direccion.colonia || "";
    document.getElementById("dirCodigoPostal").value = direccion.codigoPostal || "";
    document.getElementById("dirTelefono").value = direccion.telefono || "";
    document.getElementById("dirReferencias").value = direccion.referencias || "";
    document.getElementById("dirPredeterminada").checked = direccion.predeterminada === true;
  } else {
    document.getElementById("dirDestinatario").value = usuarioActual.displayName || "";
    // La primera dirección es la principal
    document.getElementById("dirPredeterminada").checked = direcciones.length === 0;
  }

  formDireccion.hidden = false;
  document.getElementById("dirAlias").focus();
}

function cerrarFormularioDireccion() {
  direccionEditando = null;
  formDireccion.reset();
  formDireccion.hidden = true;
}

function leerFormularioDireccion() {
  const valor = id => document.getElementById(id).value.trim();
  const datos = {
    alias: valor("dirAlias"),
    destinatario: valor("dirDestinatario"),
    calle: valor("dirCalle"),
    colonia: valor("dirColonia"),
    codigoPostal: valor("dirCodigoPostal"),
    telefono: valor("dirTelefono"),
    referencias: valor("dirReferencias"),
    predeterminada: document.getElementById("dirPredeterminada").checked,
  };

  if (!datos.alias || !datos.destinatario || !datos.calle || !datos.colonia) {
    return { error: "Completa el nombre de la dirección, quién recibe, la calle y la colonia." };
  }
  if (!/^\d{5}$/.test(datos.codigoPostal)) {
    return { error: "El código postal debe tener 5 dígitos." };
  }
  if (!telefonoValido(datos.telefono)) {
    return { error: "Escribe un teléfono válido." };
  }
  return { datos };
}

btnNuevaDireccion.addEventListener("click", () => abrirFormularioDireccion());
document.getElementById("btnCancelarDireccion").addEventListener("click", cerrarFormularioDireccion);

formDireccion.addEventListener("submit", async event => {
  event.preventDefault();
  const { datos, error } = leerFormularioDireccion();
  if (error) {
    mostrarMensaje("mensajeDireccion", error);
    return;
  }
  if (!direccionEditando && direcciones.length >= MAX_DIRECCIONES) {
    mostrarMensaje("mensajeDireccion", `Puedes guardar hasta ${MAX_DIRECCIONES} direcciones.`);
    return;
  }

  const boton = formDireccion.querySelector("[type='submit']");
  boton.disabled = true;
  try {
    const uid = usuarioActual.uid;
    let id = direccionEditando?.id;
    if (id) {
      await updateDoc(doc(db, "usuarios", uid, "direcciones", id), { ...datos, actualizadoEn: serverTimestamp() });
    } else {
      // Las reglas solo permiten los identificadores d1–d5: así el límite de 5 se cumple también en el servidor
      id = SLOTS_DIRECCION.find(slot => !direcciones.some(d => d.id === slot));
      if (!id) throw Object.assign(new Error("limite"), { code: "limite-direcciones" });
      await setDoc(doc(db, "usuarios", uid, "direcciones", id), { ...datos, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
    }
    if (datos.predeterminada) await quitarPrincipalDeOtras(id);
    await cargarDirecciones(uid);
    cerrarFormularioDireccion();
  } catch (error) {
    console.error("No se pudo guardar la dirección.", error);
    mostrarMensaje("mensajeDireccion", textoError(error));
  } finally {
    boton.disabled = false;
  }
});

/** Deja una sola dirección principal. */
async function quitarPrincipalDeOtras(idPrincipal) {
  const otras = direcciones.filter(d => d.id !== idPrincipal && d.predeterminada === true);
  if (!otras.length) return;
  const batch = writeBatch(db);
  for (const direccion of otras) {
    batch.update(doc(db, "usuarios", usuarioActual.uid, "direcciones", direccion.id), {
      predeterminada: false,
      actualizadoEn: serverTimestamp(),
    });
  }
  await batch.commit();
}

async function marcarPrincipal(id) {
  try {
    await updateDoc(doc(db, "usuarios", usuarioActual.uid, "direcciones", id), {
      predeterminada: true,
      actualizadoEn: serverTimestamp(),
    });
    await quitarPrincipalDeOtras(id);
    await cargarDirecciones(usuarioActual.uid);
  } catch (error) {
    console.error("No se pudo marcar la dirección principal.", error);
    mostrarMensaje("mensajeDireccion", textoError(error));
  }
}

async function eliminarDireccion(direccion) {
  if (!window.confirm(`¿Eliminar la dirección "${direccion.alias}"?`)) return;
  try {
    await deleteDoc(doc(db, "usuarios", usuarioActual.uid, "direcciones", direccion.id));
    if (direccionEditando?.id === direccion.id) cerrarFormularioDireccion();
    await cargarDirecciones(usuarioActual.uid);
  } catch (error) {
    console.error("No se pudo eliminar la dirección.", error);
    mostrarMensaje("mensajeDireccion", textoError(error));
  }
}

/* ============================================================
   SEGURIDAD — CAMBIAR CONTRASEÑA
   ============================================================ */
const formPassword = document.getElementById("formPassword");

function pintarSeguridad(user) {
  const conPassword = tieneProveedor(user, "password");
  formPassword.hidden = !conPassword;
  document.getElementById("passwordGoogle").hidden = conPassword;
  document.getElementById("passUsuarioOculto").value = user.email || "";

  const esAdmin = perfil?.admin === true;
  document.getElementById("eliminarAdminAviso").hidden = !esAdmin;
  document.getElementById("btnMostrarEliminar").hidden = esAdmin;
  document.getElementById("formEliminar").hidden = true;
  document.getElementById("campoEliminarPass").hidden = !conPassword;
  document.getElementById("eliminarGoogleAviso").hidden = conPassword;
}

/** Firebase exige un inicio de sesión reciente para cambiar la contraseña o borrar la cuenta. */
async function reautenticar(password) {
  if (tieneProveedor(usuarioActual, "password")) {
    const credencial = EmailAuthProvider.credential(usuarioActual.email, password);
    await reauthenticateWithCredential(usuarioActual, credencial);
  } else {
    const proveedor = new GoogleAuthProvider();
    proveedor.setCustomParameters({ login_hint: usuarioActual.email || "" });
    await reauthenticateWithPopup(usuarioActual, proveedor, browserPopupRedirectResolver);
  }
}

document.getElementById("passNueva").addEventListener("input", event => {
  const errores = evaluarFortaleza(event.target.value, usuarioActual?.email, usuarioActual?.displayName);
  document.getElementById("passRequisitos").textContent = !event.target.value
    ? "Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo."
    : errores.length ? `Falta: ${errores.join(", ")}.` : "Contraseña segura ✓";
});

formPassword.addEventListener("submit", async event => {
  event.preventDefault();
  const actual = document.getElementById("passActual");
  const nueva = document.getElementById("passNueva");
  const confirmar = document.getElementById("passConfirmar");

  if (!actual.value) {
    mostrarMensaje("mensajePassword", "Escribe tu contraseña actual.");
    return;
  }
  const errores = evaluarFortaleza(nueva.value, usuarioActual.email, usuarioActual.displayName);
  if (errores.length) {
    mostrarMensaje("mensajePassword", `La nueva contraseña necesita: ${errores.join(", ")}.`);
    return;
  }
  if (nueva.value !== confirmar.value) {
    mostrarMensaje("mensajePassword", "Las contraseñas nuevas no coinciden.");
    return;
  }
  if (nueva.value === actual.value) {
    mostrarMensaje("mensajePassword", "La nueva contraseña debe ser distinta a la actual.");
    return;
  }

  const boton = formPassword.querySelector("[type='submit']");
  boton.disabled = true;
  try {
    await reautenticar(actual.value);
    await updatePassword(usuarioActual, nueva.value);
    formPassword.reset();
    document.getElementById("passRequisitos").textContent = "Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.";
    mostrarMensaje("mensajePassword", "Contraseña actualizada.", "ok");
  } catch (error) {
    console.error("No se pudo cambiar la contraseña.", error?.code);
    mostrarMensaje("mensajePassword", textoError(error));
  } finally {
    // Nunca conservar contraseñas en el formulario
    actual.value = "";
    nueva.value = "";
    confirmar.value = "";
    boton.disabled = false;
  }
});

/* ============================================================
   CERRAR SESIÓN
   ============================================================ */
document.getElementById("btnCerrarSesion").addEventListener("click", async () => {
  await signOut(auth);
  window.location.replace("inicio.html");
});

/* ============================================================
   ELIMINAR CUENTA
   ============================================================ */
const formEliminar = document.getElementById("formEliminar");
const btnMostrarEliminar = document.getElementById("btnMostrarEliminar");

btnMostrarEliminar.addEventListener("click", () => {
  formEliminar.hidden = false;
  btnMostrarEliminar.hidden = true;
  mostrarMensaje("mensajeEliminar", "");
  document.getElementById(tieneProveedor(usuarioActual, "password") ? "eliminarPass" : "eliminarConfirmacion").focus();
});

document.getElementById("btnCancelarEliminar").addEventListener("click", () => {
  formEliminar.reset();
  formEliminar.hidden = true;
  btnMostrarEliminar.hidden = false;
});

formEliminar.addEventListener("submit", async event => {
  event.preventDefault();
  if (perfil?.admin === true) return;

  const inputPass = document.getElementById("eliminarPass");
  const confirmacion = document.getElementById("eliminarConfirmacion").value.trim();
  if (confirmacion !== "ELIMINAR") {
    mostrarMensaje("mensajeEliminar", "Escribe ELIMINAR en mayúsculas para confirmar.");
    return;
  }
  if (tieneProveedor(usuarioActual, "password") && !inputPass.value) {
    mostrarMensaje("mensajeEliminar", "Escribe tu contraseña para confirmar.");
    return;
  }

  const botones = formEliminar.querySelectorAll("button");
  botones.forEach(boton => { boton.disabled = true; });
  mostrarMensaje("mensajeEliminar", "Eliminando tu cuenta...", "ok");
  try {
    // 1. Reautenticar primero, para que deleteUser no falle al final
    await reautenticar(inputPass.value);

    // 2. Borrar direcciones y perfil
    const uid = usuarioActual.uid;
    const snapshot = await getDocs(direccionesRef(uid));
    const batch = writeBatch(db);
    snapshot.docs.forEach(documento => batch.delete(documento.ref));
    batch.delete(doc(db, "usuarios", uid));
    await batch.commit();

    // 3. Borrar el usuario de Authentication
    await deleteUser(usuarioActual);
    try {
      sessionStorage.removeItem("mariruWhatsAppOrderRequest");
    } catch {
      // No es crítico
    }
    contenido.hidden = true;
    estado.hidden = false;
    estado.replaceChildren(
      el("h2", "", "Tu cuenta fue eliminada"),
      el("p", "", "Gracias por haber sido parte de Mariru Bazar. Te llevaremos al inicio..."),
    );
    setTimeout(() => window.location.replace("inicio.html"), 2500);
  } catch (error) {
    console.error("No se pudo eliminar la cuenta.", error?.code);
    mostrarMensaje("mensajeEliminar", textoError(error));
    botones.forEach(boton => { boton.disabled = false; });
  } finally {
    inputPass.value = "";
  }
});
