/**
 * navbar.js — Barra de navegación global (estilo tienda de moda minimalista):
 * enlaces de texto a la izquierda, logo al centro y accesos de texto a la derecha
 * (Buscar · Mi cuenta · Carrito). En móvil: botón "Menú", logo e íconos.
 */
import { auth, db } from "../services/firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

/** Lee el permiso real de administración; cualquier error se trata como "no es admin". */
async function esAdministradora(user) {
  try {
    const perfil = await getDoc(doc(db, "usuarios", user.uid));
    return perfil.exists() && perfil.data().admin === true;
  } catch {
    return false;
  }
}

const icono = trazo => `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${trazo}</svg>`;
const SVG_CARRITO = icono('<path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>');
const SVG_CUENTA = icono('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
const SVG_BUSCAR = icono('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const SVG_SALIR = icono('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>');
const SVG_PANEL = icono('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>');

const CLAVE_CARRITO = "carritoMariru";

/** Detecta qué página está activa comparando el pathname con la URL. */
function esActiva(href) {
  const pagina = window.location.pathname.split("/").pop() || "index.html";
  return href === pagina || href === pagina.replace(".html", "");
}

/** Inyecta la barra en el elemento con id="navbarGlobal" si existe. */
export function inyectarNavbar() {
  const barra = document.getElementById("navbarGlobal");
  if (!barra) return;

  const links = [
    { href: "inicio.html", label: "Inicio" },
    { href: "sobre-mi.html", label: "Funcionamiento" },
    { href: "contacto.html", label: "WhatsApp" },
  ];
  const esInicio = esActiva("inicio.html");
  const enlaces = links.map(l => `<a href="${l.href}"${esActiva(l.href) ? ' aria-current="page"' : ""}>${l.label}</a>`).join("");

  barra.className = "barra";
  barra.innerHTML = `
    <div class="barra-fila">
      <nav class="barra-izquierda" aria-label="Navegación principal">
        <button type="button" class="barra-menu" id="btnMenuBarra" aria-expanded="false" aria-controls="menuBarra">Menú</button>
        <div class="barra-enlaces" id="menuBarra">${enlaces}</div>
      </nav>

      <a href="inicio.html" class="barra-logo" aria-label="Mariru Bazar, ir al inicio">
        <img src="/assets/logo-mariru.webp" alt="" width="240" height="134">
      </a>

      <div class="barra-derecha">
        <button type="button" class="barra-accion" id="btnBuscarBarra" title="Buscar productos" aria-expanded="false" aria-controls="busquedaBarra">
          ${SVG_BUSCAR}<span class="barra-texto">Buscar</span>
        </button>
        <button type="button" id="btnAbrirLogin" class="barra-accion" aria-label="Iniciar sesión o ver mi cuenta">
          ${SVG_CUENTA}<span class="barra-texto" id="navCuentaTexto">Mi cuenta</span>
        </button>
        <a href="carrito.html" class="barra-accion barra-carrito" aria-label="Ver carrito"${esActiva("carrito.html") ? ' aria-current="page"' : ""}>
          ${SVG_CARRITO}<span class="barra-texto">Carrito</span>
          <span class="cart-count" aria-hidden="true" hidden></span>
        </a>
      </div>
    </div>
    <div class="barra-busqueda-wrap" id="busquedaBarra" aria-hidden="true" inert>
      <div class="barra-busqueda-contenido">
        <form class="barra-busqueda" role="search" action="inicio.html" method="get">
          ${SVG_BUSCAR}
          <input type="search" id="searchInput" name="q" placeholder="¿Qué estás buscando?" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Buscar productos" enterkeyhint="search">
          <button type="button" class="btn-clear-search" id="btnClearSearch" aria-label="Borrar búsqueda" hidden>✕</button>
          <button type="submit" class="barra-busqueda-enviar" aria-label="Aplicar búsqueda">Buscar</button>
          <button type="button" class="barra-busqueda-cerrar" aria-label="Cerrar búsqueda">${icono('<path d="m6 6 12 12M6 18 18 6"/>')}</button>
        </form>
      </div>
    </div>
  `;

  // Menú en móvil
  const btnMenu = barra.querySelector("#btnMenuBarra");
  btnMenu.addEventListener("click", () => {
    const abierto = barra.classList.toggle("barra--menu-abierto");
    btnMenu.setAttribute("aria-expanded", String(abierto));
    if (abierto) cerrarBusqueda(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && barra.classList.contains("barra--busqueda-abierta")) {
      e.preventDefault();
      cerrarBusqueda();
      return;
    }
    if (e.key === "Escape" && barra.classList.contains("barra--menu-abierto")) {
      barra.classList.remove("barra--menu-abierto");
      btnMenu.setAttribute("aria-expanded", "false");
      btnMenu.focus();
    }
  });

  // Desplegar solo mientras se escribe; confirmar conserva el filtro y cierra.
  const btnBuscar = barra.querySelector("#btnBuscarBarra");
  const franja = barra.querySelector("#busquedaBarra");
  const inputBusqueda = franja.querySelector("input");
  const btnLimpiar = franja.querySelector("#btnClearSearch");

  function cerrarBusqueda(devolverFoco = true) {
    barra.classList.remove("barra--busqueda-abierta");
    btnBuscar.setAttribute("aria-expanded", "false");
    franja.inert = true;
    franja.setAttribute("aria-hidden", "true");
    if (devolverFoco) btnBuscar.focus({ preventScroll: true });
  }
  btnBuscar.addEventListener("click", () => {
    if (barra.classList.contains("barra--busqueda-abierta")) {
      cerrarBusqueda();
      return;
    }
    barra.classList.remove("barra--menu-abierto");
    btnMenu.setAttribute("aria-expanded", "false");
    franja.inert = false;
    franja.setAttribute("aria-hidden", "false");
    barra.classList.add("barra--busqueda-abierta");
    btnBuscar.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (inputBusqueda.isConnected && barra.classList.contains("barra--busqueda-abierta")) {
        inputBusqueda.focus({ preventScroll: true });
      }
    }));
  });
  franja.querySelector(".barra-busqueda-cerrar").addEventListener("click", () => cerrarBusqueda());
  franja.querySelector("form").addEventListener("submit", event => {
    event.preventDefault();
    if (esInicio) {
      inputBusqueda.dispatchEvent(new Event("input", { bubbles: true }));
      cerrarBusqueda();
    } else {
      const destino = new URL("inicio.html", window.location.href);
      const texto = inputBusqueda.value.trim();
      if (texto) destino.searchParams.set("q", texto);
      window.location.assign(destino.href);
    }
  });
  inputBusqueda.addEventListener("input", () => { btnLimpiar.hidden = !inputBusqueda.value; });
  // En Inicio, store.js se encarga de limpiar y actualizar los resultados.
  if (!esInicio) btnLimpiar.addEventListener("click", () => {
    inputBusqueda.value = "";
    btnLimpiar.hidden = true;
    inputBusqueda.focus();
  });
  document.addEventListener("pointerdown", event => {
    if (barra.classList.contains("barra--busqueda-abierta") && !barra.contains(event.target)) cerrarBusqueda(false);
  });

  actualizarContadorCarrito();
}

/** Actualiza el número de productos del carrito en la barra: "Carrito (2)". */
export function actualizarContadorCarrito() {
  const enlaceCarrito = document.querySelector(".barra-carrito");
  const indicador = enlaceCarrito?.querySelector(".cart-count");
  if (!enlaceCarrito || !indicador) return;

  let cantidad = 0;
  try {
    const carrito = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || "[]");
    if (!Array.isArray(carrito)) throw new TypeError("El carrito guardado no es una lista.");
    cantidad = carrito.reduce((total, item) => {
      const unidades = Number(item?.cantidad);
      return Number.isSafeInteger(unidades) && unidades > 0 ? total + unidades : total;
    }, 0);
  } catch (error) {
    console.error("No se pudo actualizar el indicador del carrito.", error);
  }

  indicador.textContent = cantidad > 99 ? "99+" : String(cantidad);
  indicador.hidden = cantidad === 0;
  enlaceCarrito.setAttribute(
    "aria-label",
    cantidad ? `Ver carrito, ${cantidad} ${cantidad === 1 ? "producto" : "productos"}` : "Ver carrito"
  );
}

window.addEventListener("storage", event => {
  if (event.key === CLAVE_CARRITO || event.key === null) actualizarContadorCarrito();
});

/**
 * Actualiza la cuenta según la sesión: muestra el nombre y agrega "Salir"
 * (y "Panel" para la administradora).
 */
export function inicializarNavbarAuth() {
  onAuthStateChanged(auth, (user) => {
    const btnCuenta = document.getElementById("btnAbrirLogin");
    const textoBtn = document.getElementById("navCuentaTexto");
    if (!btnCuenta || !textoBtn) return;
    const contenedor = btnCuenta.parentElement;

    if (user) {
      const nombre = user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "Mi cuenta";
      textoBtn.textContent = nombre;
      btnCuenta.classList.add("barra-accion--sesion");
      asegurarBotonLogout(contenedor);
      // Si es admin (usuarios/{uid}.admin === true, lo mismo que exigen las reglas), acceso al panel
      esAdministradora(user).then(esAdmin => {
        if (esAdmin && auth.currentUser?.uid === user.uid) asegurarBotonAdmin(contenedor, btnCuenta);
      });
    } else {
      textoBtn.textContent = "Mi cuenta";
      btnCuenta.classList.remove("barra-accion--sesion");
      document.getElementById("btnNavLogout")?.remove();
      document.getElementById("btnNavAdmin")?.remove();
    }
  });
}

function asegurarBotonLogout(contenedor) {
  if (document.getElementById("btnNavLogout")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "btnNavLogout";
  btn.className = "barra-accion";
  btn.setAttribute("aria-label", "Cerrar sesión");
  btn.innerHTML = `${SVG_SALIR}<span class="barra-texto">Salir</span>`;
  btn.addEventListener("click", async () => {
    await signOut(auth);
  });
  contenedor.appendChild(btn);
}

function asegurarBotonAdmin(contenedor, antesDe) {
  if (document.getElementById("btnNavAdmin")) return;
  const enlace = document.createElement("a");
  enlace.id = "btnNavAdmin";
  enlace.href = "admin.html";
  enlace.className = "barra-accion";
  enlace.setAttribute("aria-label", "Panel de administración");
  enlace.innerHTML = `${SVG_PANEL}<span class="barra-texto">Panel</span>`;
  contenedor.insertBefore(enlace, antesDe);
}
