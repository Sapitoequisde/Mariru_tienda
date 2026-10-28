/**
 * admin.js — Panel de administración de Mariru Bazar.
 *
 * Seguridad:
 * - Usa Firebase Authentication con persistencia local para que la sesión no se pierda al salir del panel.
 * - Verifica usuarios/{uid}.admin === true en Firestore después de autenticar.
 * - Timeout de inactividad: 15 min → aviso; 2 min adicionales → cierre de sesión.
 * - Sin credenciales escritas en el código.
 * - innerHTML solo con datos propios (no con inputs de usuarios finales).
 */
import { app, auth, db } from "../services/firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  collection, onSnapshot, doc, getDoc, updateDoc, setDoc, deleteDoc, runTransaction
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { filtrarInventario, esStockValido } from "./admin-inventory.mjs";
import { convertirAPng, crearMiniatura, quitarFondo } from "../services/image-processing.js";

// Storage solo se usa en el panel: se inicia aquí y no en firebase.js (las páginas públicas no lo cargan)
const storage = getStorage(app);
// Los archivos llevan la hora en el nombre y nunca se reemplazan: se pueden cachear un año
const CACHE_MEDIOS = "public, max-age=31536000, immutable";

let productos = [];
let pedidos = [];
let paginaInventario = 1;
const PRODUCTOS_POR_PAGINA = 12;
const borradoresStock = new Map();

function avisarAdmin(mensaje, error = false) {
  const aviso = document.getElementById("adminFeedback");
  aviso.hidden = false;
  aviso.textContent = mensaje;
  aviso.classList.toggle("error", error);
}

const filtrosInventario = ["adminBuscar", "adminCategoria", "adminStockFiltro", "adminOrden"];
filtrosInventario.forEach(id => document.getElementById(id).addEventListener(id === "adminBuscar" ? "input" : "change", () => {
  paginaInventario = 1;
  pintarTablaStock();
}));
document.getElementById("adminLimpiarFiltros").addEventListener("click", () => {
  filtrosInventario.forEach(id => { document.getElementById(id).value = id === "adminOrden" ? "nombre" : ""; });
  paginaInventario = 1;
  pintarTablaStock();
});
document.getElementById("adminPaginaAnterior").addEventListener("click", () => { paginaInventario--; pintarTablaStock(); });
document.getElementById("adminPaginaSiguiente").addEventListener("click", () => { paginaInventario++; pintarTablaStock(); });

document.querySelectorAll(".admin-sidebar nav a").forEach(enlace => {
  enlace.addEventListener("click", () => {
    document.querySelectorAll(".admin-sidebar nav a").forEach(otro => otro.removeAttribute("aria-current"));
    enlace.setAttribute("aria-current", "location");
  });
});

/* ---- Timeout de inactividad: 15 minutos ---- */
const INACTIVIDAD_MS = 15 * 60 * 1000;  // 15 min
const AVISO_ANTES_MS = 2 * 60 * 1000;   // aviso 2 min antes
let timerInactividad;
let timerAviso;
let toastAviso = null;

function resetInactividad() {
  clearTimeout(timerInactividad);
  clearTimeout(timerAviso);
  if (toastAviso) { toastAviso.remove(); toastAviso = null; }

  timerAviso = setTimeout(() => {
    toastAviso = document.createElement("div");
    toastAviso.className = "admin-aviso-inactividad";
    toastAviso.textContent = "¿Sigues ahí? Tu sesión cerrará en 2 minutos por inactividad.";
    document.body.appendChild(toastAviso);
  }, INACTIVIDAD_MS - AVISO_ANTES_MS);

  timerInactividad = setTimeout(async () => {
    sessionStorage.removeItem("mariru_admin_logged");
    await signOut(auth);
    window.location.replace("inicio.html");
  }, INACTIVIDAD_MS);
}

["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(ev => {
  document.addEventListener(ev, resetInactividad, { passive: true });
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("inicio.html");
    return;
  }

  const perfil = await getDoc(doc(db, "usuarios", user.uid));
  if (!perfil.exists() || perfil.data().admin !== true) {
    sessionStorage.removeItem("mariru_admin_logged");
    await signOut(auth);
    window.location.replace("inicio.html?login=1");
    return;
  }

  resetInactividad(); // Inicia el timer de inactividad solo cuando hay sesión admin
  document.getElementById("btnCargarCatalogoPrueba").disabled = false;
  cargarTodo();
});

document.getElementById("btnCargarCatalogoPrueba").addEventListener("click", async evento => {
  const boton = evento.currentTarget;
  const estado = document.getElementById("adminDemoEstado");
  boton.disabled = true;
  boton.setAttribute("aria-busy", "true");
  estado.hidden = false;
  estado.textContent = "Preparando los 15 productos de prueba…";
  try {
    const [{ importarCatalogoPrueba }, { default: lote }] = await Promise.all([
      import("./admin-test-catalog.mjs"), import("../../data/catalogo-prueba.json"),
    ]);
    const resultado = await importarCatalogoPrueba({
      productos: lote,
      existe: async id => {
        const actual = await getDoc(doc(db, "productos", id));
        return actual.exists() ? actual.data() : false;
      },
      subirImagen: async (id, ruta, indice) => {
        resetInactividad();
        const respuesta = await fetch(`${import.meta.env.BASE_URL}${ruta}`);
        if (!respuesta.ok) throw new Error(`No se pudo cargar la foto ${indice + 1}.`);
        const blob = await respuesta.blob();
        if (blob.type !== "image/png") throw new Error("La foto de prueba no es un PNG válido.");
        const archivo = new File([blob], `foto-${indice + 1}.png`, { type: "image/png" });
        const miniatura = await crearMiniatura(archivo);
        const referencia = ref(storage, `productos/${id}/pruebas-v2/${archivo.name}`);
        const referenciaMini = ref(storage, `productos/${id}/pruebas-v2/miniatura-${indice + 1}.webp`);
        await uploadBytes(referencia, archivo, { contentType: archivo.type, cacheControl: CACHE_MEDIOS });
        await uploadBytes(referenciaMini, miniatura, { contentType: "image/webp", cacheControl: CACHE_MEDIOS });
        const [url, urlMini] = await Promise.all([getDownloadURL(referencia), getDownloadURL(referenciaMini)]);
        return { url, miniatura: urlMini };
      },
      crear: (id, datos) => runTransaction(db, async transaccion => {
        const referencia = doc(db, "productos", id);
        if ((await transaccion.get(referencia)).exists()) return false;
        transaccion.set(referencia, datos);
        return true;
      }),
      actualizarImagenes: (id, medios, anterior) => runTransaction(db, async transaccion => {
        const referencia = doc(db, "productos", id);
        const actual = await transaccion.get(referencia);
        if (!actual.exists() || JSON.stringify(actual.data().imagenes) !== JSON.stringify(anterior.imagenes)) return false;
        transaccion.update(referencia, medios);
        return true;
      }),
      progreso: mensaje => { estado.textContent = mensaje; },
    });
    estado.textContent = `${resultado.creados} productos agregados a Firebase. ${resultado.actualizados} con fotos actualizadas. ${resultado.omitidos} ya estaban al día. Puedes verlos en el catálogo.`;
    avisarAdmin(estado.textContent);
  } catch (error) {
    console.error("No se pudo completar la carga de prueba.", error);
    estado.textContent = "La carga se interrumpió. Puedes reintentar: los productos ya creados se conservarán sin duplicarse.";
    avisarAdmin(estado.textContent, true);
  } finally {
    boton.disabled = false;
    boton.removeAttribute("aria-busy");
    resetInactividad();
  }
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  clearTimeout(timerInactividad);
  clearTimeout(timerAviso);
  sessionStorage.removeItem("mariru_admin_logged");
  await signOut(auth);
  window.location.replace("inicio.html");
});

function cargarTodo() {
  const estado = document.getElementById("adminEstadoDatos");
  let productosListos = false;
  let pedidosListos = false;

  const renderizarDatosReales = () => {
    if (!productosListos || !pedidosListos) return;
    pintarTablaStock();
    pintarNotificaciones();
    pintarResumen();
    pintarGraficas();
    estado.textContent = "Actualización en tiempo real";
    estado.classList.add("connected");
  };

  onSnapshot(
    collection(db, "productos"),
    snapshot => {
      productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      actualizarCategoriasInventario();
      productosListos = true;
      pintarTablaStock();
      pintarNotificaciones();
      renderizarDatosReales();
    },
    error => mostrarErrorBaseDatos("No se pudo cargar el inventario", error)
  );

  onSnapshot(
    collection(db, "pedidos"),
    snapshot => {
      pedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      pedidosListos = true;
      renderizarDatosReales();
    },
    error => mostrarErrorBaseDatos("No se pudieron cargar los pedidos", error)
  );
}

function mostrarErrorBaseDatos(mensaje, error) {
  console.error(mensaje, error);
  const estado = document.getElementById("adminEstadoDatos");
  estado.textContent = "No se pudieron actualizar los datos";
  estado.classList.remove("connected");
  document.getElementById("adminNotificaciones").innerHTML = `
    <div class="admin-notif-banner admin-notif-error">
      ⚠️ ${mensaje}. Verifica la conexión y los permisos de Firebase.
    </div>
  `;
}

// Pedidos que no cuentan como venta: el envío a WhatsApp falló y su stock ya se devolvió
const ESTADOS_SIN_VENTA = new Set(["Error de envío a WhatsApp", "Cancelado"]);

/** Pedidos que sí cuentan para ventas, gráficas y reporte. */
function pedidosConVenta() {
  return pedidos.filter(pedido => !ESTADOS_SIN_VENTA.has(pedido.estado));
}

function pintarResumen() {
  const validos = pedidosConVenta();
  const totalVentas = validos.reduce((total, pedido) => total + Number(pedido.subtotal || 0), 0);
  const totalUnidades = productos.reduce((total, producto) => total + Number(producto.stock || 0), 0);
  const alertas = productos.filter(producto => Number(producto.stock || 0) <= 5);
  const totalVendidas = validos.reduce(
    (total, pedido) => total + (pedido.items || []).reduce((subtotal, item) => subtotal + Number(item.cantidad || 0), 0),
    0
  );

  document.getElementById("resumenVentas").textContent = `$${totalVentas.toLocaleString("es-MX")}`;
  document.getElementById("resumenVentasDetalle").textContent = `${totalVendidas} unidad${totalVendidas === 1 ? "" : "es"} vendida${totalVendidas === 1 ? "" : "s"}`;
  document.getElementById("resumenPedidos").textContent = validos.length.toLocaleString("es-MX");
  const fallidos = pedidos.length - validos.length;
  document.getElementById("resumenPedidosDetalle").textContent = (validos.length === 1 ? "Pedido recibido" : "Pedidos recibidos") + (fallidos ? ` · ${fallidos} con error de envío` : "");
  document.getElementById("resumenStock").textContent = totalUnidades.toLocaleString("es-MX");
  document.getElementById("resumenStockDetalle").textContent = `${productos.length} producto${productos.length === 1 ? "" : "s"} en catálogo`;
  document.getElementById("resumenAlertas").textContent = alertas.length.toLocaleString("es-MX");
  document.getElementById("resumenAlertasDetalle").textContent = alertas.length ? "Requieren revisión" : "Todo en orden";
  document.getElementById("adminFechaActual").textContent = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full", timeZone: "America/Hermosillo",
  }).format(new Date());
}

// ===== Tabla de stock =====
function actualizarCategoriasInventario() {
  const selector = document.getElementById("adminCategoria");
  const seleccion = selector.value;
  selector.replaceChildren(new Option("Todas las categorías", ""));
  [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort().forEach(categoria => {
    selector.add(new Option(categoria.charAt(0).toUpperCase() + categoria.slice(1), categoria));
  });
  if ([...selector.options].some(opcion => opcion.value === seleccion)) selector.value = seleccion;
}

function pintarTablaStock() {
  const tbody = document.getElementById("tablaStockBody");
  tbody.replaceChildren();
  const filtrados = filtrarInventario(productos, {
    busqueda: document.getElementById("adminBuscar").value,
    categoria: document.getElementById("adminCategoria").value,
    stock: document.getElementById("adminStockFiltro").value,
    orden: document.getElementById("adminOrden").value,
  });
  const paginas = Math.max(1, Math.ceil(filtrados.length / PRODUCTOS_POR_PAGINA));
  paginaInventario = Math.max(1, Math.min(paginaInventario, paginas));
  const inicio = (paginaInventario - 1) * PRODUCTOS_POR_PAGINA;
  document.getElementById("adminResultados").textContent = `${filtrados.length} de ${productos.length} productos`;
  document.getElementById("adminPaginaDetalle").textContent = filtrados.length ? `${inicio + 1}–${Math.min(inicio + PRODUCTOS_POR_PAGINA, filtrados.length)} de ${filtrados.length}` : "Sin productos para mostrar";
  document.getElementById("adminPaginaAnterior").disabled = paginaInventario === 1;
  document.getElementById("adminPaginaSiguiente").disabled = paginaInventario >= paginas;

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-tabla-vacia">${productos.length ? "No hay coincidencias. Prueba otra búsqueda o limpia los filtros." : "Tu catálogo está listo para su primer hallazgo. Usa Agregar producto para comenzar."}</td></tr>`;
  }

  filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA).forEach(producto => {
    const fila = document.createElement("tr");
    const celdas = Array.from({ length: 5 }, () => document.createElement("td"));
    const identidad = document.createElement("div");
    identidad.className = "admin-product-identity";
    const foto = document.createElement(producto.imagenes?.[0] ? "img" : "span");
    foto.className = "admin-product-thumb";
    if (producto.imagenes?.[0]) { foto.src = producto.imagenes[0]; foto.alt = ""; foto.loading = "lazy"; }
    else { foto.textContent = "✧"; foto.setAttribute("aria-hidden", "true"); }
    const nombre = document.createElement("strong");
    nombre.textContent = producto.nombre;
    identidad.append(foto, nombre);
    celdas[0].append(identidad);
    const categoria = document.createElement("span");
    categoria.className = "admin-category-pill";
    categoria.textContent = producto.categoria || "Sin categoría";
    celdas[1].append(categoria);
    celdas[2].textContent = Number(producto.precio || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const input = document.createElement("input");
    input.type = "number"; input.className = "input-stock"; input.min = "0"; input.step = "1";
    input.value = borradoresStock.get(producto.id) ?? producto.stock ?? 0;
    input.setAttribute("aria-label", `Existencias de ${producto.nombre}`);
    const estado = document.createElement("small");
    const unidades = Number(producto.stock || 0);
    estado.className = `admin-stock-state${unidades <= 5 ? " low" : ""}`;
    estado.textContent = unidades <= 0 ? "Agotado" : unidades <= 5 ? "Pocas unidades" : "Disponible";
    celdas[3].append(input, estado);
    const guardar = document.createElement("button");
    guardar.type = "button"; guardar.className = "btn-fila-guardar"; guardar.textContent = "Guardar";
    guardar.setAttribute("aria-label", `Guardar existencias de ${producto.nombre}`);
    guardar.disabled = Number(input.value) === unidades;
    input.addEventListener("input", () => {
      borradoresStock.set(producto.id, input.value);
      guardar.disabled = Number(input.value) === unidades && esStockValido(input.value);
    });
    const eliminar = document.createElement("button");
    eliminar.type = "button"; eliminar.className = "btn-fila-eliminar"; eliminar.textContent = "Eliminar";
    eliminar.setAttribute("aria-label", `Eliminar ${producto.nombre}`);
    const editar = document.createElement("button");
    editar.type = "button"; editar.className = "btn-fila-editar"; editar.textContent = "Editar";
    editar.setAttribute("aria-label", `Editar ${producto.nombre}`);
    editar.addEventListener("click", () => abrirFormularioEdicion(producto));
    const acciones = document.createElement("div");
    acciones.className = "admin-row-actions";
    acciones.append(guardar, editar, eliminar);
    celdas[4].append(acciones);
    fila.append(...celdas);
    tbody.appendChild(fila);

    guardar.addEventListener("click", async () => {
      if (!esStockValido(input.value)) {
        input.setCustomValidity("Ingresa un número entero de unidades, igual o mayor que cero.");
        input.reportValidity();
        input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
        return;
      }
      guardar.disabled = true; eliminar.disabled = true; input.disabled = true;
      guardar.textContent = "Guardando…";
      try {
        await updateDoc(doc(db, "productos", producto.id), { stock: Number(input.value) });
        borradoresStock.delete(producto.id);
        avisarAdmin(`Existencias de ${producto.nombre} guardadas.`);
        pintarTablaStock();
      } catch (error) {
        console.error("No se pudo guardar el inventario.", error);
        avisarAdmin("No se pudieron guardar las existencias. Conservamos tu cambio; vuelve a intentarlo.", true);
        guardar.disabled = false; eliminar.disabled = false; input.disabled = false;
        guardar.textContent = "Reintentar";
      }
    });

    eliminar.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar «${producto.nombre}» del catálogo? Esta acción no se puede deshacer.`)) return;
      eliminar.disabled = true; guardar.disabled = true;
      try {
        await deleteDoc(doc(db, "productos", producto.id));
        borradoresStock.delete(producto.id);
        if (productoEditando?.id === producto.id) cerrarFormulario();
        avisarAdmin(`${producto.nombre} eliminado del catálogo.`);
        // También sus archivos de Storage (si las reglas lo permiten; si no, quedan sin usar)
        borrarArchivos([...new Set([...(producto.imagenes || []), ...(producto.miniaturas || []), ...(producto.videos || [])])]);
      } catch (error) {
        console.error("No se pudo eliminar el producto.", error);
        avisarAdmin("No se pudo eliminar el producto. Vuelve a intentarlo.", true);
        eliminar.disabled = false;
        guardar.disabled = Number(input.value) === unidades;
      }
    });
  });
}

// ===== Agregar y editar producto =====
// Imágenes: { url, existente: true, estado: "listo" } (ya en Storage) o
//           { archivo, url, estado: "procesando" | "listo" | "sin-fondo-quitado" } (nuevas).
// Videos:   { url, existente: true } o { archivo }.
let imagenesSeleccionadas = [];
let videosSeleccionados = [];
// null = creando un producto nuevo; { id, nombre, imagenes, videos } = editando
let productoEditando = null;

const btnMostrarForm = document.getElementById("btnMostrarFormAgregar");
const formAgregar = document.getElementById("formAgregar");

function limpiarMedios() {
  imagenesSeleccionadas.forEach(img => { if (!img.existente) URL.revokeObjectURL(img.url); });
  imagenesSeleccionadas = [];
  videosSeleccionados = [];
  pintarImagenesPreview();
  pintarVideosPreview();
  actualizarEstadoFondo();
}

function modoFormulario(producto = null) {
  document.getElementById("formTitulo").textContent = producto ? `Editar: ${producto.nombre || "producto"}` : "Nuevo hallazgo";
  document.getElementById("formSubtitulo").textContent = producto
    ? "Cambia lo que necesites; las imágenes que quites se borrarán al guardar."
    : "Agrega los detalles que verá tu clientela.";
  document.getElementById("btnGuardarProducto").textContent = producto ? "Guardar cambios" : "Guardar producto";
}

// Cambios sin guardar en el formulario: se pide confirmación antes de descartarlos
let formularioModificado = false;
formAgregar.addEventListener("input", () => { formularioModificado = true; });
formAgregar.addEventListener("change", () => { formularioModificado = true; });
window.addEventListener("beforeunload", evento => {
  if (formularioModificado && formAgregar.classList.contains("visible")) evento.preventDefault();
});

/** true si se puede cerrar el formulario (no hay cambios o se aceptó descartarlos). */
function confirmarDescarte() {
  if (!formularioModificado || !formAgregar.classList.contains("visible")) return true;
  return confirm("Tienes cambios sin guardar en el formulario. ¿Quieres descartarlos?");
}

function cerrarFormulario() {
  formAgregar.reset();
  limpiarMedios();
  productoEditando = null;
  formularioModificado = false;
  modoFormulario();
  formAgregar.classList.remove("visible");
  btnMostrarForm.setAttribute("aria-expanded", "false");
}

btnMostrarForm.addEventListener("click", () => {
  if (formAgregar.getAttribute("aria-busy") === "true") return;
  if (!confirmarDescarte()) return;
  // Si se estaba editando, este botón abre un formulario limpio para un producto nuevo
  const abrir = Boolean(productoEditando) || !formAgregar.classList.contains("visible");
  cerrarFormulario();
  if (!abrir) return;
  formAgregar.classList.add("visible");
  btnMostrarForm.setAttribute("aria-expanded", "true");
  document.getElementById("nuevoNombre").focus({ preventScroll: true });
});
document.getElementById("btnCerrarFormAgregar").addEventListener("click", () => {
  if (!confirmarDescarte()) return;
  cerrarFormulario();
  btnMostrarForm.focus({ preventScroll: true });
});

function abrirFormularioEdicion(producto) {
  if (formAgregar.getAttribute("aria-busy") === "true") {
    avisarAdmin("Espera a que termine de guardarse el producto actual.");
    return;
  }
  if (!confirmarDescarte()) return;
  cerrarFormulario();
  productoEditando = {
    id: producto.id,
    nombre: producto.nombre,
    imagenes: [...(producto.imagenes || [])],
    miniaturas: [...(producto.miniaturas || [])],
    videos: [...(producto.videos || [])],
    // Existencias al abrir el formulario: si cambian mientras se edita, no se sobrescriben
    stockOriginal: Number(producto.stock ?? 0),
  };
  document.getElementById("nuevoNombre").value = producto.nombre || "";
  document.getElementById("nuevaCategoria").value = producto.categoria || "ropa";
  document.getElementById("nuevoPrecio").value = producto.precio ?? "";
  document.getElementById("nuevoStock").value = producto.stock ?? "";
  document.getElementById("nuevaDescripcion").value = producto.descripcion || "";
  document.getElementById("nuevaTallas").value = Array.isArray(producto.tallas) ? producto.tallas.join(", ") : "";
  imagenesSeleccionadas = productoEditando.imagenes.map((url, i) => ({
    url, miniatura: productoEditando.miniaturas[i] || null, existente: true, estado: "listo",
  }));
  videosSeleccionados = productoEditando.videos.map(url => ({ url, existente: true }));
  pintarImagenesPreview();
  pintarVideosPreview();

  modoFormulario(producto);
  formAgregar.classList.add("visible");
  btnMostrarForm.setAttribute("aria-expanded", "true");
  formAgregar.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  document.getElementById("nuevoNombre").focus({ preventScroll: true });
}

// ----- Imágenes (cantidad indefinida) -----
document.getElementById("btnAgregarImagenes").addEventListener("click", () => {
  document.getElementById("inputImagenes").click();
});

// Cada imagen es { archivo, estado: "procesando" | "listo" | "sin-fondo-quitado", url }.
// Se procesan una por una (cola) para no saturar la memoria del navegador.
let colaFondo = Promise.resolve();
const estadoFondo = document.getElementById("estadoFondo");

function hayImagenesProcesando() {
  return imagenesSeleccionadas.some(img => img.estado === "procesando");
}

function actualizarEstadoFondo(texto = "") {
  const pendientes = imagenesSeleccionadas.filter(img => img.estado === "procesando").length;
  estadoFondo.textContent = texto || (pendientes ? `Quitando el fondo de ${pendientes} imagen${pendientes === 1 ? "" : "es"}…` : "");
  document.getElementById("btnGuardarProducto").disabled = pendientes > 0;
}

function asignarArchivo(imagen, archivo, estado) {
  if (imagen.url) URL.revokeObjectURL(imagen.url);
  imagen.archivo = archivo;
  imagen.estado = estado;
  imagen.url = URL.createObjectURL(archivo);
}

async function procesarImagen(imagen) {
  // Si la quitaron de la lista mientras esperaba, no se procesa
  if (!imagenesSeleccionadas.includes(imagen)) return;
  try {
    const png = await quitarFondo(imagen.archivo, texto => actualizarEstadoFondo(texto));
    asignarArchivo(imagen, png, "listo");
  } catch (error) {
    console.error("No se pudo quitar el fondo; se guardará como PNG sin recortar.", error);
    try {
      asignarArchivo(imagen, await convertirAPng(imagen.archivo), "sin-fondo-quitado");
    } catch (errorPng) {
      console.error("No se pudo convertir la imagen a PNG; se usará la original.", errorPng);
      imagen.estado = "sin-fondo-quitado";
    }
  }
  pintarImagenesPreview();
  actualizarEstadoFondo();
}

document.getElementById("inputImagenes").addEventListener("change", (e) => {
  const quitar = document.getElementById("quitarFondoAuto").checked;
  for (const archivo of Array.from(e.target.files)) {
    const imagen = { archivo, estado: quitar ? "procesando" : "listo", url: URL.createObjectURL(archivo) };
    imagenesSeleccionadas.push(imagen);
    if (quitar) colaFondo = colaFondo.then(() => procesarImagen(imagen));
  }
  pintarImagenesPreview();
  actualizarEstadoFondo();
  e.target.value = ""; // permite volver a elegir más después
});

function pintarImagenesPreview() {
  const contenedor = document.getElementById("previewImagenes");
  contenedor.innerHTML = "";
  imagenesSeleccionadas.forEach((imagen, index) => {
    const item = document.createElement("div");
    item.className = `media-item media-item--${imagen.estado}`;

    const img = document.createElement("img");
    img.src = imagen.url;
    img.alt = "";
    if (imagen.archivo?.type === "image/png" || imagen.existente) img.className = "media-transparente";
    item.appendChild(img);

    const nombre = document.createElement("span");
    nombre.className = "media-nombre";
    nombre.textContent = imagen.estado === "procesando" ? "Quitando fondo…"
      : imagen.estado === "sin-fondo-quitado" ? "No se pudo quitar el fondo"
        : imagen.existente ? "Foto guardada" : imagen.archivo.name;
    item.appendChild(nombre);

    // La primera imagen es la que aparece en el catálogo
    if (index === 0) {
      const principal = document.createElement("span");
      principal.className = "media-principal";
      principal.textContent = "Principal";
      item.appendChild(principal);
    } else {
      const hacerPrincipal = document.createElement("button");
      hacerPrincipal.type = "button";
      hacerPrincipal.className = "media-hacer-principal";
      hacerPrincipal.textContent = "Hacer principal";
      hacerPrincipal.addEventListener("click", () => {
        imagenesSeleccionadas.unshift(...imagenesSeleccionadas.splice(index, 1));
        pintarImagenesPreview();
      });
      item.appendChild(hacerPrincipal);
    }

    const quitar = document.createElement("span");
    quitar.className = "chip-quitar";
    quitar.textContent = "✕";
    quitar.addEventListener("click", () => {
      if (!imagen.existente) URL.revokeObjectURL(imagen.url);
      imagenesSeleccionadas.splice(index, 1);
      pintarImagenesPreview();
      actualizarEstadoFondo();
    });
    item.appendChild(quitar);

    contenedor.appendChild(item);
  });
}

// ----- Videos (cantidad indefinida) -----
document.getElementById("btnAgregarVideos").addEventListener("click", () => {
  document.getElementById("inputVideos").click();
});

document.getElementById("inputVideos").addEventListener("change", (e) => {
  videosSeleccionados.push(...Array.from(e.target.files, archivo => ({ archivo })));
  pintarVideosPreview();
  e.target.value = "";
});

function pintarVideosPreview() {
  const contenedor = document.getElementById("previewVideos");
  contenedor.replaceChildren();
  videosSeleccionados.forEach((video, indice) => {
    const item = document.createElement("div");
    item.className = "media-item";
    const icono = document.createElement("span");
    icono.className = "media-video-icono";
    icono.textContent = "▶";
    const nombre = document.createElement("span");
    nombre.className = "media-nombre";
    nombre.textContent = video.existente ? "Video guardado" : video.archivo.name;
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "chip-quitar";
    quitar.textContent = "✕";
    quitar.setAttribute("aria-label", `Quitar ${nombre.textContent}`);
    quitar.addEventListener("click", () => { videosSeleccionados.splice(indice, 1); pintarVideosPreview(); });
    item.append(icono, nombre, quitar);
    contenedor.append(item);
  });
}

async function borrarArchivos(urls) {
  const resultados = await Promise.allSettled(urls.map(url => deleteObject(ref(storage, url))));
  if (resultados.some(resultado => resultado.status === "rejected")) {
    console.warn("Algunos archivos retirados siguen en Storage; no aparecen en el catálogo.");
  }
}

// ----- Guardar producto (con subida de archivos) -----
formAgregar.addEventListener("submit", async (e) => {
  e.preventDefault();

  const statusEl = document.getElementById("formStatus");
  const btnGuardar = document.getElementById("btnGuardarProducto");
  if (hayImagenesProcesando()) {
    statusEl.textContent = "Espera a que termine de quitarse el fondo de las imágenes.";
    return;
  }
  if (btnGuardar.disabled) return;
  if (!formAgregar.reportValidity()) return;
  const precio = Number(document.getElementById("nuevoPrecio").value);
  if (!esStockValido(document.getElementById("nuevoStock").value) || !Number.isFinite(precio) || precio < 0
    || !document.getElementById("nuevoNombre").value.trim()) {
    statusEl.textContent = "Revisa el nombre, el precio y las unidades del producto.";
    return;
  }
  btnGuardar.disabled = true;
  formAgregar.setAttribute("aria-busy", "true");
  const controles = [...formAgregar.querySelectorAll("input, select, textarea, button")];
  controles.forEach(control => { control.disabled = true; });
  statusEl.textContent = "Guardando producto...";

  try {
  const editando = productoEditando;
  const tallasTexto = document.getElementById("nuevaTallas").value.trim();
  const tallas = tallasTexto ? tallasTexto.split(",").map(t => t.trim()).filter(Boolean) : null;

  const nuevoProducto = {
    nombre: document.getElementById("nuevoNombre").value.trim(),
    categoria: document.getElementById("nuevaCategoria").value,
    precio: parseFloat(document.getElementById("nuevoPrecio").value),
    stock: parseInt(document.getElementById("nuevoStock").value),
    descripcion: document.getElementById("nuevaDescripcion").value.trim(),
    tallas,
    imagenes: [],
    videos: [],
  };

  // Reservar el ID; publicar el producto solo cuando sus archivos estén listos.
  const docRef = editando ? doc(db, "productos", editando.id) : doc(collection(db, "productos"));

  // 2. Subimos cada imagen a Storage, bajo una carpeta con el ID del producto, junto con una
  //    miniatura WebP para el catálogo. Los nombres llevan la hora, así que se pueden cachear un año.
  const urlsImagenes = [];
  const urlsMiniaturas = [];
  for (let i = 0; i < imagenesSeleccionadas.length; i++) {
    const imagen = imagenesSeleccionadas[i];
    if (imagen.existente) {
      urlsImagenes.push(imagen.url);
      urlsMiniaturas.push(imagen.miniatura || imagen.url);
      continue;
    }
    statusEl.textContent = `Subiendo imagen ${i + 1} de ${imagenesSeleccionadas.length}...`;
    const archivo = imagen.archivo;
    const marca = Date.now();
    const refArchivo = ref(storage, `productos/${docRef.id}/imagenes/${marca}-${archivo.name}`);
    await uploadBytes(refArchivo, archivo, { contentType: archivo.type, cacheControl: CACHE_MEDIOS });
    const url = await getDownloadURL(refArchivo);
    urlsImagenes.push(url);
    try {
      const miniatura = await crearMiniatura(archivo);
      const refMini = ref(storage, `productos/${docRef.id}/miniaturas/${marca}-${miniatura.name}`);
      await uploadBytes(refMini, miniatura, { contentType: miniatura.type, cacheControl: CACHE_MEDIOS });
      urlsMiniaturas.push(await getDownloadURL(refMini));
    } catch (error) {
      // Sin miniatura el catálogo usa la imagen completa
      console.warn("No se pudo crear la miniatura; el catálogo usará la imagen completa.", error);
      urlsMiniaturas.push(url);
    }
  }

  // 3. Subimos cada video igual
  const urlsVideos = [];
  for (let i = 0; i < videosSeleccionados.length; i++) {
    if (videosSeleccionados[i].existente) {
      urlsVideos.push(videosSeleccionados[i].url);
      continue;
    }
    statusEl.textContent = `Subiendo video ${i + 1} de ${videosSeleccionados.length}...`;
    const archivo = videosSeleccionados[i].archivo;
    const refArchivo = ref(storage, `productos/${docRef.id}/videos/${Date.now()}-${archivo.name}`);
    await uploadBytes(refArchivo, archivo, { contentType: archivo.type, cacheControl: CACHE_MEDIOS });
    const url = await getDownloadURL(refArchivo);
    urlsVideos.push(url);
  }

  // El listener de inventario incorpora el producto sin duplicarlo localmente.
  const datosProducto = {
    ...nuevoProducto,
    imagenes: urlsImagenes,
    miniaturas: urlsMiniaturas,
    videos: urlsVideos,
  };
  if (editando) {
    const { stock, ...sinStock } = datosProducto;
    if (stock === editando.stockOriginal) {
      // Las existencias no se tocaron: no se escriben, así no se pisa una reserva hecha mientras se editaba
      await updateDoc(docRef, sinStock);
    } else {
      // Cambio de existencias: solo si nadie las modificó desde que se abrió el formulario
      await runTransaction(db, async transaccion => {
        const actual = await transaccion.get(docRef);
        const stockActual = Number(actual.data()?.stock ?? 0);
        if (!actual.exists() || stockActual !== editando.stockOriginal) {
          throw Object.assign(new Error("stock-cambiado"), { stockActual });
        }
        transaccion.update(docRef, datosProducto);
      });
    }
  } else {
    await setDoc(docRef, datosProducto);
  }
  if (editando) {
    const conservados = new Set([...urlsImagenes, ...urlsMiniaturas, ...urlsVideos]);
    void borrarArchivos([...editando.imagenes, ...editando.miniaturas, ...editando.videos].filter(url => !conservados.has(url)));
    borradoresStock.delete(editando.id);
  }

  // Limpiar formulario
  cerrarFormulario();
  btnMostrarForm.focus({ preventScroll: true });

  statusEl.textContent = "";
  avisarAdmin(`${nuevoProducto.nombre} guardado en el catálogo.`);
  } catch (error) {
    console.error("No se pudo guardar el producto.", error);
    statusEl.textContent = error?.message === "stock-cambiado"
      ? `Las existencias cambiaron mientras editabas (ahora hay ${error.stockActual}), probablemente por un pedido. Revisa el número y vuelve a guardar.`
      : "No se pudo guardar. Revisa tu conexión y vuelve a intentarlo; conservamos los datos del formulario.";
    if (error?.message === "stock-cambiado" && productoEditando) productoEditando.stockOriginal = error.stockActual;
  } finally {
    formAgregar.removeAttribute("aria-busy");
    controles.forEach(control => { control.disabled = false; });
    actualizarEstadoFondo();
  }
});

// ===== Notificaciones de bajo stock =====
function pintarNotificaciones() {
  const contenedor = document.getElementById("adminNotificaciones");
  const bajos = productos.filter(p => p.stock <= 5);

  if (bajos.length === 0) {
    contenedor.innerHTML = "";
    return;
  }

  const banner = document.createElement("div");
  banner.className = "admin-notif-banner";
  const texto = document.createElement("span");
  const agotados = bajos.filter(p => Number(p.stock || 0) === 0).length;
  texto.textContent = `${bajos.length} producto${bajos.length === 1 ? " necesita" : "s necesitan"} atención${agotados ? ` (${agotados} sin existencias)` : ""}. Revisa tu inventario para mantenerlo al día.`;
  const revisar = document.createElement("button");
  revisar.type = "button"; revisar.className = "admin-button-secondary"; revisar.textContent = "Revisar inventario";
  revisar.addEventListener("click", () => {
    document.getElementById("adminBuscar").value = "";
    document.getElementById("adminCategoria").value = "";
    document.getElementById("adminStockFiltro").value = "";
    document.getElementById("adminOrden").value = "stock";
    paginaInventario = 1;
    pintarTablaStock();
    document.getElementById("inventario").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  });
  banner.append(texto, revisar);
  contenedor.replaceChildren(banner);
}

// ===== Gráficas =====
let chartStock, chartVentasCategoria, chartTopVentas;

function pintarGraficas() {
  if (typeof window.Chart !== "function") {
    document.querySelectorAll(".admin-grafica-card").forEach(card => {
      if (card.querySelector(".admin-chart-error")) return;
      const aviso = document.createElement("p");
      aviso.className = "admin-chart-error";
      aviso.textContent = "No se pudo cargar la gráfica. Recarga la página para volver a intentarlo.";
      card.append(aviso);
    });
    return;
  }
  const ctxStock = document.getElementById("chartStock");
  if (chartStock) chartStock.destroy();
  chartStock = new Chart(ctxStock, {
    type: "bar",
    data: {
      labels: productos.map(p => p.nombre),
      datasets: [{ label: "Unidades", data: productos.map(p => p.stock), backgroundColor: "#e58aa5", borderRadius: 8, borderSkipped: false }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#3b2530", padding: 12, cornerRadius: 10 } },
      scales: { x: { grid: { display: false }, ticks: { color: "#80606e", maxRotation: 45, minRotation: 45 } }, y: { beginAtZero: true, grid: { color: "rgba(168,78,112,.10)" }, ticks: { color: "#80606e" } } },
    },
  });

  const categorias = [...new Set(productos.map(p => p.categoria).filter(Boolean))];
  const ventasPorCategoria = Object.fromEntries(categorias.map(categoria => [categoria, 0]));
  pedidosConVenta().forEach(pedido => {
    (pedido.items || []).forEach(item => {
      const producto = productos.find(p => p.id === item.id);
      if (producto && ventasPorCategoria[producto.categoria] !== undefined) {
        ventasPorCategoria[producto.categoria] += item.cantidad;
      }
    });
  });

  const ctxCategoria = document.getElementById("chartVentasCategoria");
  if (chartVentasCategoria) chartVentasCategoria.destroy();
  chartVentasCategoria = new Chart(ctxCategoria, {
    type: "doughnut",
    data: {
      labels: Object.keys(ventasPorCategoria),
      datasets: [{ data: Object.values(ventasPorCategoria), backgroundColor: ["#e58aa5", "#b7d9ec", "#a84e70", "#5b9c82"] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { position: "bottom", labels: { color: "#5b3a49", usePointStyle: true, padding: 16 } }, tooltip: { backgroundColor: "#3b2530", padding: 12, cornerRadius: 10 } },
    },
  });

  const ventasPorProducto = {};
  pedidosConVenta().forEach(pedido => {
    (pedido.items || []).forEach(item => {
      ventasPorProducto[item.id] = (ventasPorProducto[item.id] || 0) + item.cantidad;
    });
  });

  const topIds = Object.keys(ventasPorProducto).sort((a, b) => ventasPorProducto[b] - ventasPorProducto[a]).slice(0, 5);
  const topNombres = topIds.map(id => productos.find(p => p.id === id)?.nombre || "Producto eliminado");
  const topCantidades = topIds.map(id => ventasPorProducto[id]);

  const ctxTop = document.getElementById("chartTopVentas");
  if (chartTopVentas) chartTopVentas.destroy();
  chartTopVentas = new Chart(ctxTop, {
    type: "bar",
    data: { labels: topNombres, datasets: [{ label: "Unidades", data: topCantidades, backgroundColor: "#a84e70", borderRadius: 8, borderSkipped: false }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#3b2530", padding: 12, cornerRadius: 10 } },
      scales: { x: { beginAtZero: true, grid: { color: "rgba(168,78,112,.10)" }, ticks: { color: "#80606e" } }, y: { grid: { display: false }, ticks: { color: "#5b3a49" } } },
    },
  });
}

// ===== Reporte CSV =====
/** Celda CSV segura: escapa comillas y evita que Excel interprete el texto como fórmula. */
function celdaCsv(valor) {
  let texto = String(valor ?? "");
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replaceAll('"', '""')}"`;
}

document.getElementById("btnReporte").addEventListener("click", () => {
  // Unidades e ingresos con el precio guardado en cada pedido (no el precio actual del producto),
  // y sin contar los pedidos cuyo envío falló
  const ventasPorProducto = {};
  const validos = pedidosConVenta();
  validos.forEach(pedido => {
    (pedido.items || []).forEach(item => {
      const actual = ventasPorProducto[item.id] || { unidades: 0, ingresos: 0, nombre: item.nombre };
      actual.unidades += Number(item.cantidad || 0);
      actual.ingresos += Number(item.cantidad || 0) * Number(item.precio || 0);
      ventasPorProducto[item.id] = actual;
    });
  });

  const totalVentas = validos.reduce((acc, p) => acc + Number(p.subtotal || 0), 0);

  let csv = "Producto,Categoría,Precio actual,Stock actual,Unidades vendidas,Ingresos generados\n";
  productos.forEach(p => {
    const venta = ventasPorProducto[p.id] || { unidades: 0, ingresos: 0 };
    csv += [celdaCsv(p.nombre), celdaCsv(p.categoria), Number(p.precio || 0), Number(p.stock || 0), venta.unidades, venta.ingresos].join(",") + "\n";
  });
  // Productos vendidos que ya no están en el catálogo
  Object.entries(ventasPorProducto)
    .filter(([id]) => !productos.some(p => p.id === id))
    .forEach(([, venta]) => {
      csv += [celdaCsv(`${venta.nombre || "Producto"} (eliminado)`), "", "", "", venta.unidades, venta.ingresos].join(",") + "\n";
    });
  csv += `\nPedidos recibidos,${validos.length}\n`;
  csv += `Pedidos con error de envío (no cuentan),${pedidos.length - validos.length}\n`;
  csv += `Total vendido ($),${totalVentas}\n`;

  // BOM para que Excel abra bien los acentos
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-mariru-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
