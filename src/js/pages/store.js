/**
 * store.js — Lógica principal de la tienda.
 *
 * Incluye:
 * - Carga de productos desde Firestore
 * - Filtros avanzados (categoría, precio, talla, stock)
 * - Carrito mejorado: imagen, nombre, descripción, talla (solo si aplica),
 *   precio, cantidad, subtotal, botón eliminar con icono
 * - Carrito vacío: sin resumen ni botón de finalizar
 * - Pedidos preparados para enviar directamente por WhatsApp
 *
 * SEGURIDAD:
 * - Nunca se usa innerHTML con datos de Firestore sin sanitizar
 * - Nombres, descripciones y categorías se insertan via textContent o
 *   atributos seguros (src, style, title) — nunca directamente como HTML
 */

import { appCheckConfigurado, auth, db, obtenerFunctions } from "../services/firebase.js";
import { collection, getDocs } from "firebase/firestore";
import { actualizarContadorCarrito, inyectarNavbar, inicializarNavbarAuth } from "../ui/navbar.js";
import { inyectarFooter } from "../ui/footer.js";
import catalogoPrueba from "../../data/catalogo-prueba.json";
import { resolverMediosDemo } from "../services/demo-media.mjs";

let productos = [];

/** Envía el pedido a la Cloud Function. Functions y App Check se cargan solo aquí. */
async function enviarPedidoWhatsApp(payload) {
  const [functions, { httpsCallable }] = await Promise.all([obtenerFunctions(), import("firebase/functions")]);
  return httpsCallable(functions, "submitWhatsAppOrder")(payload);
}

async function cargarProductos() {
  const snapshot = await getDocs(collection(db, "productos"));
  productos = snapshot.docs.map(d => resolverMediosDemo({ id: d.id, ...d.data() }, catalogoPrueba, import.meta.env.BASE_URL));
  return productos;
}

/* ============================================================
   HELPERS DE SEGURIDAD (DOM sin innerHTML con datos externos)
   ============================================================ */

/** Crea un elemento seguro con textContent */
function el(tag, className, texto) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/* ============================================================
   MOSTRAR PRODUCTOS EN GRID
   ============================================================ */
function mostrarProductosEn(contenedor, lista) {
  contenedor.innerHTML = "";

  if (lista.length === 0) {
    const div = el("div", "catalogo-sin-resultados");
    const h3 = el("h3", "", "No encontramos resultados");
    const p = el("p", "", "Prueba otra búsqueda o cambia los filtros.");
    div.appendChild(h3);
    div.appendChild(p);
    contenedor.appendChild(div);
    return;
  }

  lista.forEach((producto, indice) => {
    const card = document.createElement("div");
    card.className = "product-card";

    // Miniatura WebP si existe (las fotos subidas desde el panel la generan); si no, la imagen completa
    const imagen = producto.miniaturas?.[0] || producto.imagenes?.[0];
    const stock = Number(producto.stock || 0);
    const stockText = stock === 0 ? "Agotado" : stock <= 3 ? `¡Solo quedan ${stock}!` : `${stock} disponibles`;
    const stockClass = stock === 0 ? "out" : stock <= 3 ? "low" : "";

    // Imagen — src es URL de Firebase Storage, no datos de usuario
    const divImg = el("div", "product-image");
    if (imagen) {
      const img = document.createElement("img");
      img.src = imagen; // URL de Firebase, no datos del usuario
      // Las primeras tarjetas son lo primero que se ve: se cargan con prioridad; el resto, al acercarse
      const visibleAlInicio = indice < 4;
      img.loading = visibleAlInicio ? "eager" : "lazy";
      if (visibleAlInicio) img.fetchPriority = "high";
      img.decoding = "async";
      img.width = 640;
      img.height = 640;
      img.alt = ""; // El nombre se muestra abajo
      divImg.appendChild(img);
    } else {
      const span = el("span", "product-image-placeholder", "✦");
      divImg.appendChild(span);
    }
    const cat = el("span", "product-category");
    cat.textContent = producto.categoria || "Mariru";
    divImg.appendChild(cat);

    const divContent = el("div", "product-content");
    const nombre = el("div", "product-name");
    nombre.textContent = producto.nombre;
    const divMeta = el("div", "product-meta");
    const precio = el("div", "product-price");
    precio.textContent = `$${Number(producto.precio || 0).toLocaleString("es-MX")}`;
    const stockSpan = el("span", `product-stock${stockClass ? " " + stockClass : ""}`);
    stockSpan.textContent = stockText;
    divMeta.appendChild(precio);
    divMeta.appendChild(stockSpan);
    divContent.appendChild(nombre);
    divContent.appendChild(divMeta);

    card.appendChild(divImg);
    card.appendChild(divContent);

    card.addEventListener("click", () => {
      window.location.href = `producto.html?id=${encodeURIComponent(producto.id)}`;
    });
    contenedor.appendChild(card);
  });
}

/* ============================================================
   INICIO — Filtros avanzados
   ============================================================ */
const grid = document.getElementById("productGrid");

if (grid) {
  // Skeleton
  grid.innerHTML = Array.from({ length: 8 }, () => `
    <div class="product-card skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-line"></div>
    </div>
  `).join("");

  registrarEventosFiltros();
  cargarProductos().then(() => {
    poblarFiltros();
    leerFiltrosDeUrl();
    aplicarFiltros();
  }).catch(error => {
    console.error("No se pudieron cargar los productos.", error);
    grid.innerHTML = `<p class="catalogo-error">No pudimos cargar el catálogo. Revisa tu conexión.</p>`;
  });
}

const ORDENES = new Set(["recomendados", "precio-asc", "precio-desc", "nombre"]);

function nombreCategoria(cat) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function formatoPrecio(valor) {
  return `$${Number(valor).toLocaleString("es-MX")}`;
}

function poblarFiltros() {
  // Categorías: botones de selección única, con el número de productos de cada una
  const catContainer = document.getElementById("filtroCategoriasOpciones");
  if (catContainer) {
    const conteo = new Map();
    productos.forEach(p => {
      if (p.categoria) conteo.set(p.categoria, (conteo.get(p.categoria) || 0) + 1);
    });
    const opciones = [["todos", "Todas", productos.length], ...[...conteo.keys()].sort().map(cat => [cat, nombreCategoria(cat), conteo.get(cat)])];
    catContainer.replaceChildren(...opciones.map(([valor, texto, total]) => {
      const btn = el("button", "filtro-categoria");
      btn.type = "button";
      btn.dataset.value = valor;
      btn.setAttribute("aria-pressed", String(valor === "todos"));
      btn.append(el("span", "", texto), el("span", "filtro-conteo", String(total)));
      return btn;
    }));
  }

  // Rango de precios del catálogo, como referencia
  const rango = document.getElementById("filtroPrecioRango");
  const precios = productos.map(p => Number(p.precio)).filter(Number.isFinite);
  if (rango && precios.length) {
    rango.textContent = `Precios desde ${formatoPrecio(Math.min(...precios))} hasta ${formatoPrecio(Math.max(...precios))}`;
  }

  // Tallas (de productos que tienen tallas)
  const tallasContainer = document.getElementById("filtroTallasOpciones");
  if (tallasContainer) {
    const todasTallas = [...new Set(
      productos.flatMap(p => Array.isArray(p.tallas) ? p.tallas.filter(Boolean) : [])
    )].sort();
    tallasContainer.innerHTML = "";
    if (todasTallas.length === 0) {
      document.getElementById("filtroTalla")?.style.setProperty("display", "none");
    } else {
      todasTallas.forEach(talla => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "filtro-chip filtro-chip--talla";
        btn.dataset.value = talla;
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = talla;
        tallasContainer.appendChild(btn);
      });
    }
  }
}

/** Lee el estado de los controles del panel. */
function leerFiltros() {
  const minTexto = document.getElementById("filtroPrecioMin")?.value;
  const maxTexto = document.getElementById("filtroPrecioMax")?.value;
  let precioMin = parseFloat(minTexto) || 0;
  let precioMax = parseFloat(maxTexto) || Infinity;
  if (precioMin > precioMax) [precioMin, precioMax] = [precioMax, precioMin];

  return {
    categoria: document.querySelector(".filtro-categoria[aria-pressed='true']")?.dataset.value || "todos",
    precioMin,
    precioMax,
    tallas: [...document.querySelectorAll(".filtro-chip--talla.active")].map(c => c.dataset.value),
    soloConStock: document.getElementById("filtroConStock")?.checked || false,
    texto: (document.getElementById("searchInput")?.value || "").toLowerCase().trim(),
    orden: document.getElementById("ordenCatalogo")?.value || "recomendados",
  };
}

function seleccionarCategoria(valor) {
  document.querySelectorAll(".filtro-categoria").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.value === valor));
  });
}

function marcarTalla(chip, activa) {
  chip.classList.toggle("active", activa);
  chip.setAttribute("aria-pressed", String(activa));
}

/** Restaura los filtros guardados en la URL (?cat=&min=&max=&talla=&stock=1&orden=&q=). */
function leerFiltrosDeUrl() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("cat");
  if (cat && document.querySelector(`.filtro-categoria[data-value="${CSS.escape(cat)}"]`)) {
    seleccionarCategoria(cat);
  }
  const min = Number(params.get("min"));
  const max = Number(params.get("max"));
  if (min > 0) document.getElementById("filtroPrecioMin").value = String(min);
  if (max > 0) document.getElementById("filtroPrecioMax").value = String(max);
  const tallas = (params.get("talla") || "").split(",").filter(Boolean);
  document.querySelectorAll(".filtro-chip--talla").forEach(chip => marcarTalla(chip, tallas.includes(chip.dataset.value)));
  const stock = document.getElementById("filtroConStock");
  if (stock) stock.checked = params.get("stock") === "1";
  const orden = params.get("orden");
  const selectOrden = document.getElementById("ordenCatalogo");
  if (selectOrden && ORDENES.has(orden)) selectOrden.value = orden;
  const busqueda = document.getElementById("searchInput");
  if (busqueda && params.get("q")) busqueda.value = params.get("q").slice(0, 80);
}

function guardarFiltrosEnUrl(f) {
  const params = new URLSearchParams(window.location.search);
  const poner = (clave, valor) => (valor ? params.set(clave, valor) : params.delete(clave));
  poner("cat", f.categoria !== "todos" ? f.categoria : "");
  poner("min", f.precioMin > 0 ? String(f.precioMin) : "");
  poner("max", f.precioMax < Infinity ? String(f.precioMax) : "");
  poner("talla", f.tallas.join(","));
  poner("stock", f.soloConStock ? "1" : "");
  poner("orden", f.orden !== "recomendados" ? f.orden : "");
  poner("q", f.texto);
  const query = params.toString();
  history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function ordenarProductos(lista, orden) {
  const copia = [...lista];
  const precio = p => Number(p.precio || 0);
  if (orden === "precio-asc") return copia.sort((a, b) => precio(a) - precio(b));
  if (orden === "precio-desc") return copia.sort((a, b) => precio(b) - precio(a));
  if (orden === "nombre") return copia.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
  // Recomendados: primero lo disponible, conservando el orden original
  return copia.sort((a, b) => Number(Number(b.stock || 0) > 0) - Number(Number(a.stock || 0) > 0));
}

/** Chips con cada filtro activo; al tocarlos se quita ese filtro. */
function pintarFiltrosActivos(f) {
  const contenedor = document.getElementById("filtrosActivos");
  if (!contenedor) return;
  const chips = [];
  const agregar = (texto, quitar) => {
    const btn = el("button", "filtro-activo");
    btn.type = "button";
    btn.setAttribute("aria-label", `Quitar filtro: ${texto}`);
    btn.append(el("span", "", texto), el("span", "filtro-activo-x", "✕"));
    btn.addEventListener("click", () => {
      quitar();
      aplicarFiltros();
    });
    chips.push(btn);
  };

  if (f.texto) {
    agregar(`“${f.texto}”`, () => { document.getElementById("searchInput").value = ""; });
  }
  if (f.categoria !== "todos") {
    agregar(nombreCategoria(f.categoria), () => seleccionarCategoria("todos"));
  }
  if (f.precioMin > 0 || f.precioMax < Infinity) {
    const texto = f.precioMax === Infinity ? `Desde ${formatoPrecio(f.precioMin)}`
      : f.precioMin > 0 ? `${formatoPrecio(f.precioMin)} a ${formatoPrecio(f.precioMax)}`
        : `Hasta ${formatoPrecio(f.precioMax)}`;
    agregar(texto, () => {
      document.getElementById("filtroPrecioMin").value = "";
      document.getElementById("filtroPrecioMax").value = "";
    });
  }
  f.tallas.forEach(talla => {
    agregar(`Talla ${talla}`, () => {
      const chip = document.querySelector(`.filtro-chip--talla[data-value="${CSS.escape(talla)}"]`);
      if (chip) marcarTalla(chip, false);
    });
  });
  if (f.soloConStock) {
    agregar("Solo con stock", () => { document.getElementById("filtroConStock").checked = false; });
  }

  if (chips.length > 1) {
    const limpiar = el("button", "filtro-activo-limpiar", "Quitar todos");
    limpiar.type = "button";
    limpiar.addEventListener("click", limpiarFiltros);
    chips.push(limpiar);
  }
  contenedor.replaceChildren(...chips);
  contenedor.hidden = chips.length === 0;
}

function aplicarFiltros() {
  const f = leerFiltros();
  let resultado = productos;

  if (f.categoria !== "todos") {
    resultado = resultado.filter(p => p.categoria === f.categoria);
  }
  if (f.precioMin > 0) {
    resultado = resultado.filter(p => Number(p.precio || 0) >= f.precioMin);
  }
  if (f.precioMax < Infinity) {
    resultado = resultado.filter(p => Number(p.precio || 0) <= f.precioMax);
  }
  if (f.tallas.length > 0) {
    // Productos con al menos una talla seleccionada; los que tienen tallas:null se excluyen
    resultado = resultado.filter(p =>
      Array.isArray(p.tallas) && f.tallas.some(t => p.tallas.includes(t))
    );
  }
  if (f.soloConStock) {
    resultado = resultado.filter(p => Number(p.stock || 0) > 0);
  }
  if (f.texto) {
    resultado = resultado.filter(p =>
      p.nombre?.toLowerCase().includes(f.texto) ||
      p.descripcion?.toLowerCase().includes(f.texto) ||
      p.categoria?.toLowerCase().includes(f.texto)
    );
  }

  resultado = ordenarProductos(resultado, f.orden);
  mostrarProductosEn(grid, resultado);
  pintarFiltrosActivos(f);
  guardarFiltrosEnUrl(f);

  // Conteo de resultados
  const total = resultado.length;
  const textoTotal = `${total} ${total === 1 ? "producto" : "productos"}`;
  const conteo = document.getElementById("catalogoConteo");
  if (conteo) conteo.textContent = textoTotal;
  const btnVer = document.getElementById("btnVerResultados");
  if (btnVer) btnVer.textContent = total ? `Ver ${textoTotal}` : "Sin resultados";

  // Badges con el número de filtros activos
  let count = 0;
  if (f.categoria !== "todos") count++;
  if (f.precioMin > 0 || f.precioMax < Infinity) count++;
  if (f.tallas.length > 0) count++;
  if (f.soloConStock) count++;

  const badgeHeader = document.getElementById("filtrosBadgeHeader");
  const badgeBtn = document.getElementById("filtrosBadge");
  if (badgeHeader) {
    badgeHeader.textContent = count;
    badgeHeader.hidden = count === 0;
  }
  if (badgeBtn) {
    badgeBtn.textContent = count;
    badgeBtn.hidden = count === 0;
  }

  // Actualizar botón clear search
  const btnClearSearch = document.getElementById("btnClearSearch");
  if (btnClearSearch) {
    btnClearSearch.hidden = f.texto.length === 0;
  }
}

function limpiarFiltros() {
  seleccionarCategoria("todos");
  const precioMin = document.getElementById("filtroPrecioMin");
  const precioMax = document.getElementById("filtroPrecioMax");
  if (precioMin) precioMin.value = "";
  if (precioMax) precioMax.value = "";
  document.querySelectorAll(".filtro-chip--talla.active").forEach(c => marcarTalla(c, false));
  const soloStock = document.getElementById("filtroConStock");
  if (soloStock) soloStock.checked = false;
  const busq = document.getElementById("searchInput");
  if (busq) busq.value = "";
  aplicarFiltros();
}

function registrarEventosFiltros() {
  // Búsqueda
  const searchInput = document.getElementById("searchInput");
  const btnClearSearch = document.getElementById("btnClearSearch");

  if (searchInput) {
    searchInput.addEventListener("input", aplicarFiltros);
  }

  if (btnClearSearch && searchInput) {
    btnClearSearch.addEventListener("click", () => {
      searchInput.value = "";
      aplicarFiltros();
      searchInput.focus();
    });
  }

  // Categoría (selección única; tocar la activa vuelve a "Todas")
  document.getElementById("filtroCategoriasOpciones")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".filtro-categoria");
    if (!btn) return;
    const yaActiva = btn.getAttribute("aria-pressed") === "true";
    seleccionarCategoria(yaActiva ? "todos" : btn.dataset.value);
    aplicarFiltros();
  });

  // Precio
  document.getElementById("filtroPrecioMin")?.addEventListener("input", aplicarFiltros);
  document.getElementById("filtroPrecioMax")?.addEventListener("input", aplicarFiltros);

  // Tallas
  document.getElementById("filtroTallasOpciones")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".filtro-chip--talla");
    if (!chip) return;
    marcarTalla(chip, !chip.classList.contains("active"));
    aplicarFiltros();
  });

  // Stock y orden
  document.getElementById("filtroConStock")?.addEventListener("change", aplicarFiltros);
  document.getElementById("ordenCatalogo")?.addEventListener("change", aplicarFiltros);

  // Limpiar
  document.getElementById("btnLimpiarFiltros")?.addEventListener("click", limpiarFiltros);

  // Panel de filtros cerrado por defecto, en cualquier tamaño de pantalla.
  const btnToggle = document.getElementById("btnToggleFiltros");
  const panel = document.getElementById("panelFiltros");
  const btnCerrar = document.getElementById("btnCerrarFiltros");
  const overlay = document.getElementById("filtrosOverlay");

  function abrirCerrarFiltros(abrir) {
    if (!panel) return;
    const isAbierto = typeof abrir === "boolean" ? abrir : !panel.classList.contains("filtros-abiertos");
    if (!isAbierto) btnToggle?.focus();
    panel.inert = !isAbierto;
    panel.setAttribute("aria-hidden", String(!isAbierto));
    panel.classList.toggle("filtros-abiertos", isAbierto);
    document.body.classList.toggle("filtros-bloqueo", isAbierto);
    if (btnToggle) btnToggle.setAttribute("aria-expanded", String(isAbierto));
    if (overlay) overlay.classList.toggle("visible", isAbierto);
    if (isAbierto) btnCerrar?.focus();
  }

  btnToggle?.addEventListener("click", () => abrirCerrarFiltros());
  btnCerrar?.addEventListener("click", () => abrirCerrarFiltros(false));
  overlay?.addEventListener("click", () => abrirCerrarFiltros(false));
  document.getElementById("btnVerResultados")?.addEventListener("click", () => abrirCerrarFiltros(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel?.classList.contains("filtros-abiertos")) abrirCerrarFiltros(false);
    if (e.key === "Tab" && panel?.classList.contains("filtros-abiertos")) {
      const controles = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')]
        .filter(nodo => !nodo.hidden && nodo.getClientRects().length);
      const primero = controles[0];
      const ultimo = controles.at(-1);
      if (e.shiftKey && (document.activeElement === primero || !panel.contains(document.activeElement))) {
        e.preventDefault(); ultimo?.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !panel.contains(document.activeElement))) {
        e.preventDefault(); primero?.focus();
      }
    }
  });
}

/* ============================================================
   PRODUCTO DETALLE
   ============================================================ */
const contenedorImagen = document.getElementById("productoImagen");

if (contenedorImagen) {
  cargarProductos().then(cargarProducto).catch(error => {
    console.error("No se pudo cargar el producto.", error);
    mostrarErrorProducto("No pudimos cargar este producto. Intenta de nuevo o vuelve al catálogo.");
  });
}

function mostrarErrorProducto(mensaje) {
  document.getElementById("productoNombre").textContent = "Producto no disponible";
  document.getElementById("productoDescripcion").textContent = mensaje;
  document.getElementById("stockBadge").textContent = "No disponible";
  document.getElementById("productoImagen").replaceChildren(el("span", "producto-imagen-placeholder", "✦"));
  document.getElementById("productoPrecio").textContent = "—";
  document.getElementById("btnAgregar").disabled = true;
  document.getElementById("btnComprar").disabled = true;
  document.getElementById("btnFavorite").disabled = true;
  const tallas = document.querySelector(".producto-tallas-wrap");
  if (tallas) tallas.hidden = true;
}

function cargarProducto() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const producto = productos.find(p => p.id === id);
  if (!producto) {
    mostrarErrorProducto("Este artículo ya no está en el catálogo. Descubre otros hallazgos en nuestra tienda.");
    return;
  }

  document.title = `${producto.nombre} | Mariru Bazar`;
  const rutaNombre = document.getElementById("productoRutaNombre");
  if (rutaNombre) rutaNombre.textContent = producto.nombre;
  const categoriaEl = document.getElementById("productoCategoria");
  if (categoriaEl) categoriaEl.textContent = producto.categoria || "Mariru Bazar";

  const stock = Number(producto.stock || 0);
  const stockBadge = document.getElementById("stockBadge");
  if (stockBadge) {
    if (stock === 0) {
      stockBadge.textContent = "Agotado";
      stockBadge.classList.add("low");
    } else if (stock <= 3) {
      stockBadge.textContent = `¡Solo quedan ${stock}!`;
      stockBadge.classList.add("low");
    } else {
      stockBadge.textContent = `${stock} disponibles`;
    }
  }

  const nomEl = document.getElementById("productoNombre");
  if (nomEl) nomEl.textContent = producto.nombre;
  const descEl = document.getElementById("productoDescripcion");
  if (descEl) {
    descEl.textContent = producto.descripcion || "Un hallazgo de nuestro bazar para ti. Si quieres conocer sus medidas o más detalles, contáctanos antes de hacer tu pedido.";
    prepararDescripcionProducto(descEl);
  }
  const precioEl = document.getElementById("productoPrecio");
  const precioTexto = `$${Number(producto.precio || 0).toLocaleString("es-MX")}`;
  if (precioEl) precioEl.textContent = precioTexto;
  const precioMovil = document.getElementById("productoPrecioMovil");
  if (precioMovil) precioMovil.textContent = precioTexto;

  renderizarImagenProducto(producto);
  renderizarProductosRelacionados(producto);

  const tallas = Array.isArray(producto.tallas) ? producto.tallas.filter(Boolean) : [];
  let tallaSeleccionada = null;

  const contenedorTallas = document.getElementById("productoTallas");
  if (contenedorTallas) {
    if (tallas.length) {
      const label = el("span", "opciones-label", "Elige tu talla");
      const lista = el("div", "opciones-lista");
      tallas.forEach(talla => {
        const btn = document.createElement("button");
        btn.className = "talla-btn";
        btn.type = "button";
        btn.textContent = talla;
        btn.setAttribute("aria-label", `Talla ${talla}`);
        btn.addEventListener("click", () => {
          tallaSeleccionada = talla;
          contenedorTallas.querySelectorAll(".talla-btn").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
        });
        lista.appendChild(btn);
      });
      contenedorTallas.appendChild(label);
      contenedorTallas.appendChild(lista);
    } else {
      contenedorTallas.hidden = true;
      // Ocultar también el botón de guía de tallas si no hay tallas
      const wrapTallas = document.querySelector(".producto-tallas-wrap");
      if (wrapTallas) wrapTallas.style.display = "none";
    }
  }

  const btnFavorite = document.getElementById("btnFavorite");
  if (btnFavorite) {
    const favoritos = JSON.parse(localStorage.getItem("mariruFavoritos") || "[]");
    const esFavorito = favoritos.includes(producto.id);
    btnFavorite.classList.toggle("active", esFavorito);
    btnFavorite.textContent = esFavorito ? "♥" : "♡";
    btnFavorite.addEventListener("click", () => {
      const guardados = JSON.parse(localStorage.getItem("mariruFavoritos") || "[]");
      const i = guardados.indexOf(producto.id);
      if (i >= 0) {
        guardados.splice(i, 1);
        btnFavorite.classList.remove("active");
        btnFavorite.textContent = "♡";
      } else {
        guardados.push(producto.id);
        btnFavorite.classList.add("active");
        btnFavorite.textContent = "♥";
      }
      localStorage.setItem("mariruFavoritos", JSON.stringify(guardados));
    });
  }

  // Guía de tallas
  const modalGuia = document.getElementById("guiaTallasModal");
  const btnGuiaTallas = document.getElementById("btnGuiaTallas");
  const btnCerrarGuiaTallas = document.getElementById("btnCerrarGuiaTallas");
  if (btnGuiaTallas && modalGuia) {
    btnGuiaTallas.addEventListener("click", () => {
      modalGuia.classList.remove("hidden");
      modalGuia.setAttribute("aria-hidden", "false");
    });
    btnCerrarGuiaTallas?.addEventListener("click", () => {
      modalGuia.classList.add("hidden");
      modalGuia.setAttribute("aria-hidden", "true");
    });
    modalGuia.addEventListener("click", e => {
      if (e.target === modalGuia) {
        modalGuia.classList.add("hidden");
        modalGuia.setAttribute("aria-hidden", "true");
      }
    });
  }

  const btnAgregar = document.getElementById("btnAgregar");
  const btnComprar = document.getElementById("btnComprar");
  if (btnAgregar) {
    btnAgregar.disabled = stock <= 0;
    btnAgregar.textContent = stock <= 0 ? "Producto agotado" : "Agregar al carrito";
  }
  if (btnComprar) btnComprar.disabled = stock <= 0;

  btnAgregar?.addEventListener("click", () => {
    if (!validarOpciones(tallas, tallaSeleccionada)) return;
    if (agregarAlCarrito(producto, { talla: tallaSeleccionada })) {
      mostrarToast(`${producto.nombre} agregado al carrito ✓`);
    }
  });

  btnComprar?.addEventListener("click", () => {
    if (!validarOpciones(tallas, tallaSeleccionada)) return;
    abrirPedidoWhatsApp([{
      id: producto.id,
      nombre: producto.nombre,
      precio: Number(producto.precio || 0),
      cantidad: 1,
      talla: tallaSeleccionada,
    }]);
  });

}

function prepararDescripcionProducto(descripcion) {
  const medir = () => {
    const altura = `${descripcion.scrollHeight}px`;
    if (descripcion.style.getPropertyValue("--descripcion-alto") !== altura) {
      descripcion.style.setProperty("--descripcion-alto", altura);
    }
  };
  medir();
  if (!descripcion._observadorTamano) {
    descripcion._observadorTamano = new ResizeObserver(medir);
    descripcion._observadorTamano.observe(descripcion);
    document.fonts.ready.then(medir);
  }
}

/** Vista previa cada 5 segundos; navegación manual al ampliar. */
function renderizarImagenProducto(producto) {
  const contenedor = document.getElementById("productoImagen");
  if (!contenedor) return;
  clearInterval(contenedor._temporizadorGaleria);
  contenedor._animacionesGaleria?.forEach(animacion => animacion.cancel());
  contenedor._salidaGaleria?.remove();
  const medios = [
    ...(Array.isArray(producto.imagenes) ? producto.imagenes.filter(Boolean) : []).map(src => ({ tipo: "imagen", src })),
    ...(Array.isArray(producto.videos) ? producto.videos.filter(Boolean) : []).map(src => ({ tipo: "video", src })),
  ];
  const anteriorVisor = document.getElementById("productoVisor");
  if (anteriorVisor?.open) anteriorVisor.close();
  anteriorVisor?.remove();
  contenedor.replaceChildren();
  if (!medios.length) {
    const vacio = el("figure", "ficha-medio ficha-medio--vacio");
    vacio.appendChild(el("span", "producto-imagen-placeholder", "✦"));
    contenedor.appendChild(vacio);
    return;
  }

  const crearMedio = (indice, ampliado = false) => {
    const medio = medios[indice];
    const nodo = document.createElement(medio.tipo === "video" ? "video" : "img");
    nodo.src = medio.src;
    if (medio.tipo === "video") {
      nodo.controls = ampliado;
      nodo.playsInline = true;
      nodo.preload = "metadata";
      nodo.setAttribute("aria-label", `Video de ${producto.nombre}`);
    } else {
      nodo.alt = `${producto.nombre}, imagen ${indice + 1}`;
      nodo.decoding = "async";
      if (!ampliado) nodo.fetchPriority = "high";
    }
    return nodo;
  };

  const abrir = el("button", "ficha-ampliar");
  abrir.type = "button";
  abrir.setAttribute("aria-label", `Ampliar fotos y videos de ${producto.nombre}`);
  abrir.setAttribute("aria-haspopup", "dialog");
  const figura = el("figure", "ficha-medio");
  figura.appendChild(crearMedio(0));
  abrir.append(figura, el("span", "ficha-ampliar-indicio", "Ampliar imagen"));
  contenedor.appendChild(abrir);

  const visor = el("dialog", "producto-visor");
  visor.id = "productoVisor";
  visor.setAttribute("aria-label", `Fotos y videos de ${producto.nombre}`);
  const panel = el("div", "producto-visor-panel");
  const cabecera = el("div", "producto-visor-cabecera");
  const titulo = el("span", "producto-visor-titulo", producto.nombre);
  const cerrar = el("button", "producto-visor-boton", "×");
  cerrar.type = "button";
  cerrar.setAttribute("aria-label", "Cerrar vista ampliada");
  cerrar.autofocus = true;
  cabecera.append(titulo, cerrar);
  const escenario = el("div", "producto-visor-medio");
  const controles = el("div", "producto-visor-controles");
  const contador = el("span", "producto-visor-contador");
  contador.setAttribute("role", "status");
  contador.setAttribute("aria-atomic", "true");
  let actual = 0;
  const cambiar = indice => {
    actual = Math.max(0, Math.min(medios.length - 1, indice));
    escenario.querySelector("video")?.pause();
    escenario.replaceChildren(crearMedio(actual, true));
    contador.textContent = `${actual + 1} / ${medios.length}`;
    anterior.disabled = actual === 0;
    siguiente.disabled = actual === medios.length - 1;
    if (document.activeElement === anterior && anterior.disabled) siguiente.focus();
    if (document.activeElement === siguiente && siguiente.disabled) anterior.focus();
  };
  const botonPaso = (texto, etiqueta, paso) => {
    const boton = el("button", "producto-visor-boton", texto);
    boton.type = "button";
    boton.setAttribute("aria-label", etiqueta);
    boton.addEventListener("click", () => cambiar(actual + paso));
    return boton;
  };
  const anterior = botonPaso("←", "Imagen anterior", -1);
  const siguiente = botonPaso("→", "Imagen siguiente", 1);
  anterior.hidden = siguiente.hidden = medios.length < 2;
  controles.append(anterior, contador, siguiente);
  panel.append(cabecera, escenario, controles);
  visor.appendChild(panel);
  document.body.appendChild(visor);

  let desbordamiento;
  let indiceVista = 0;
  let enTransicion = false;
  let versionTransicion = 0;
  const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
  abrir.addEventListener("click", () => {
    versionTransicion++;
    contenedor._animacionesGaleria?.forEach(animacion => animacion.cancel());
    contenedor._salidaGaleria?.remove();
    figura.replaceChildren(crearMedio(indiceVista));
    enTransicion = false;
    cambiar(indiceVista);
    desbordamiento = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    visor.showModal();
  });
  cerrar.addEventListener("click", () => visor.close());
  visor.addEventListener("click", evento => {
    if (evento.target === visor) visor.close();
  });
  visor.addEventListener("close", () => {
    escenario.querySelector("video")?.pause();
    indiceVista = actual;
    figura.replaceChildren(crearMedio(indiceVista));
    document.documentElement.style.overflow = desbordamiento ?? "";
    abrir.focus({ preventScroll: true });
  });
  visor.addEventListener("keydown", evento => {
    // Mantener las flechas propias del reproductor cuando se ve un video.
    if (evento.target.closest("video")) return;
    if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
      evento.preventDefault();
      cambiar(actual + (evento.key === "ArrowRight" ? 1 : -1));
    }
  });
  if (medios.length > 1) {
    const temporizador = setInterval(async () => {
      if (!contenedor.isConnected || !abrir.isConnected) {
        clearInterval(temporizador);
        return;
      }
      if (visor.open || document.hidden || enTransicion) return;
      const limites = figura.getBoundingClientRect();
      if (limites.bottom <= 0 || limites.top >= window.innerHeight) return;
      const destino = (indiceVista + 1) % medios.length;
      const siguienteMedio = crearMedio(destino);
      const version = ++versionTransicion;
      enTransicion = true;
      const saliente = figura.firstElementChild;
      let capaSalida;
      indiceVista = destino;
      try {
        if (!reducirMovimiento.matches) {
          figura.appendChild(siguienteMedio);
          // Sacar el medio del cuadro para que el recorte sea el de la pantalla.
          capaSalida = el("div", "ficha-medio producto-salida");
          capaSalida.setAttribute("aria-hidden", "true");
          Object.assign(capaSalida.style, {
            top: `${limites.top}px`, left: `${limites.left}px`,
            width: `${limites.width}px`, height: `${limites.height}px`,
          });
          capaSalida.appendChild(saliente);
          document.body.appendChild(capaSalida);
          contenedor._salidaGaleria = capaSalida;
          const salida = capaSalida.animate([
            { transform: "translateY(0)" },
            { transform: `translateY(-${limites.bottom + 8}px)` },
          ], { duration: 1270, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" });
          const entrada = siguienteMedio.animate([
            { transform: "translateY(100%)" },
            { transform: "translateY(0)" },
          ], { duration: 1560, delay: 350, fill: "backwards", easing: "cubic-bezier(.22, 1, .36, 1)" });
          contenedor._animacionesGaleria = [salida, entrada];
          await Promise.allSettled([salida.finished, entrada.finished]);
          if (version !== versionTransicion || !abrir.isConnected || visor.open) return;
          figura.replaceChildren(siguienteMedio);
          salida.cancel();
          entrada.cancel();
          contenedor._animacionesGaleria = [];
        } else figura.replaceChildren(siguienteMedio);
      } finally {
        capaSalida?.remove();
        if (version === versionTransicion) enTransicion = false;
      }
    }, 5000);
    contenedor._temporizadorGaleria = temporizador;
  }
}

function renderizarProductosRelacionados(producto) {
  const seccion = document.getElementById("productoRelacionados");
  const gridRelacionados = document.getElementById("productoRelacionadosGrid");
  if (!seccion || !gridRelacionados) return;
  const relacionados = productos
    .filter(p => p.id !== producto.id && Number(p.stock) > 0)
    .sort((a, b) => Number(b.categoria === producto.categoria) - Number(a.categoria === producto.categoria))
    .slice(0, 4);
  seccion.hidden = relacionados.length === 0;
  if (!relacionados.length) return;
  mostrarProductosEn(gridRelacionados, relacionados);
  // Enlaces nativos para navegar también con teclado o abrir en otra pestaña.
  [...gridRelacionados.children].forEach((card, indice) => {
    const enlace = el("a", "product-card");
    enlace.href = `producto.html?id=${encodeURIComponent(relacionados[indice].id)}`;
    enlace.append(...card.childNodes);
    card.replaceWith(enlace);
  });
}

function validarOpciones(tallas, talla) {
  if (tallas.length && !talla) {
    mostrarToast("Selecciona una talla antes de continuar.", true);
    return false;
  }
  return true;
}

/* ============================================================
   TOAST (reemplaza los alert())
   ============================================================ */
function mostrarToast(mensaje, esError = false) {
  let toast = document.getElementById("mariruToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "mariruToast";
    toast.className = "mariru-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = mensaje;
  toast.className = `mariru-toast${esError ? " mariru-toast--error" : ""}`;
  toast.classList.add("visible");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

/* ============================================================
   CATEGORÍAS
   ============================================================ */
const categoriasTiles = document.getElementById("categoriasTiles");
if (categoriasTiles) {
  cargarProductos().then(inicializarCategorias).catch(error => {
    console.error("No se pudieron cargar las categorías.", error);
  });
}

function inicializarCategorias() {
  document.querySelectorAll(".tile-count").forEach(span => {
    const categoria = span.dataset.countFor;
    const cantidad = productos.filter(p => p.categoria === categoria).length;
    span.textContent = `${cantidad} producto${cantidad === 1 ? "" : "s"}`;
  });

  const inputBusqueda = document.getElementById("searchCategorias");
  const sugerenciasBox = document.getElementById("sugerenciasBox");
  if (!inputBusqueda || !sugerenciasBox) return;

  inputBusqueda.addEventListener("input", () => {
    const texto = inputBusqueda.value.toLowerCase().trim();
    if (!texto) {
      sugerenciasBox.classList.remove("visible");
      return;
    }
    const coincidencias = productos.filter(p => p.nombre?.toLowerCase().includes(texto));
    sugerenciasBox.innerHTML = "";
    if (coincidencias.length) {
      coincidencias.forEach(p => {
        const div = el("div", "sugerencia-item");
        div.textContent = `${p.nombre} · $${p.precio}`;
        div.dataset.id = p.id;
        div.addEventListener("click", () => {
          window.location.href = `producto.html?id=${encodeURIComponent(p.id)}`;
        });
        sugerenciasBox.appendChild(div);
      });
    } else {
      sugerenciasBox.textContent = "Sin resultados";
    }
    sugerenciasBox.classList.add("visible");
  });
}

/* ============================================================
   CARRITO — localStorage
   ============================================================ */
function obtenerCarrito() {
  try {
    const contenido = localStorage.getItem("carritoMariru");
    if (!contenido) return [];
    const carrito = JSON.parse(contenido);
    if (!Array.isArray(carrito) || carrito.some(item =>
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      !Number.isSafeInteger(item.cantidad) ||
      item.cantidad < 1
    )) {
      throw new TypeError("El carrito guardado tiene un formato inválido.");
    }
    const productosNormalizados = new Map();
    carrito.forEach(item => {
      const producto = { ...item, talla: item.talla || null };
      delete producto.color;
      const clave = `${producto.id}|${producto.talla || ""}`;
      const existente = productosNormalizados.get(clave);
      productosNormalizados.set(clave, {
        ...producto,
        cantidad: (existente?.cantidad || 0) + producto.cantidad,
      });
    });
    const carritoActualizado = [...productosNormalizados.values()];
    if (JSON.stringify(carritoActualizado) !== JSON.stringify(carrito)) {
      localStorage.setItem("carritoMariru", JSON.stringify(carritoActualizado));
    }
    return carritoActualizado;
  } catch (error) {
    console.error("No se pudo leer el carrito guardado.", error);
    return null;
  }
}

function guardarCarrito(carrito) {
  try {
    localStorage.setItem("carritoMariru", JSON.stringify(carrito));
    actualizarContadorCarrito();
    return true;
  } catch (error) {
    console.error("No se pudo guardar el carrito.", error);
    mostrarToast("No se pudo guardar el cambio en el carrito. Revisa el almacenamiento del navegador.", true);
    return false;
  }
}

function agregarAlCarrito(producto, opciones = {}) {
  const carrito = obtenerCarrito();
  if (!carrito) {
    mostrarToast("No se pudo leer el carrito guardado; no se modificó.", true);
    return false;
  }
  const stock = Math.max(0, Math.floor(Number(producto.stock) || 0));
  const existente = carrito.find(item =>
    item.id === producto.id &&
    item.talla === (opciones.talla || null)
  );
  const cantidadTotal = carrito
    .filter(item => item.id === producto.id)
    .reduce((total, item) => total + Number(item.cantidad || 0), 0);
  if (cantidadTotal >= stock) {
    mostrarToast(stock ? "Ya agregaste todas las unidades disponibles." : "Este producto está agotado.", true);
    return false;
  }

  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      id: producto.id,
      nombre: producto.nombre,
      descripcion: producto.descripcion || "",
      precio: producto.precio,
      imagen: producto.imagenes?.[0] || null,
      cantidad: 1,
      talla: opciones.talla || null,
    });
  }
  return guardarCarrito(carrito);
}

function quitarDelCarrito(id, talla) {
  const carrito = obtenerCarrito();
  if (!carrito) {
    mostrarToast("No se pudo leer el carrito guardado; no se modificó.", true);
    return;
  }
  const carritoActualizado = carrito.filter(item =>
    !(item.id === id && item.talla === talla)
  );
  if (!guardarCarrito(carritoActualizado)) return;
  mostrarCarrito();
}

function cambiarCantidadEnCarrito(id, talla, delta) {
  const carrito = obtenerCarrito();
  if (!carrito) {
    mostrarToast("No se pudo leer el carrito guardado; no se modificó.", true);
    return;
  }
  const item = carrito.find(i => i.id === id && i.talla === talla);
  if (!item) return;
  const producto = productos.find(p => p.id === id);
  const stock = Math.max(0, Math.floor(Number(producto?.stock) || 0));
  const cantidadProducto = carrito
    .filter(linea => linea.id === id)
    .reduce((total, linea) => total + Number(linea.cantidad || 0), 0);
  if (delta > 0 && (!producto || cantidadProducto >= stock)) {
    mostrarToast(stock ? "No hay más unidades disponibles." : "Este producto está agotado.", true);
    return;
  }
  item.cantidad = delta > 0
    ? Math.min(stock, item.cantidad + 1)
    : Math.max(1, item.cantidad - 1);
  if (!guardarCarrito(carrito)) return;
  mostrarCarrito();
}

/* ============================================================
   CARRITO (carrito.html) — Vista completa
   ============================================================ */
const listaCarrito = document.getElementById("carritoLista");

if (listaCarrito) {
  const btnFinalizar = document.getElementById("btnFinalizar");
  btnFinalizar?.addEventListener("click", () => {
    const carrito = obtenerCarrito();
    if (!carrito) {
      mostrarToast("No se pudo leer el carrito guardado. Restablécelo antes de continuar.", true);
      return;
    }
    if (carrito.length) abrirPedidoWhatsApp(carrito, true);
  });

  cargarProductos().then(mostrarCarrito).catch(error => {
    console.error("No se pudo cargar el inventario del carrito.", error);
    mostrarToast("No se pudo verificar el inventario. Actualiza la página para intentarlo de nuevo.", true);
  });
}

function mostrarCarrito() {
  const carrito = obtenerCarrito();
  const main = document.getElementById("carritoMain");
  const panel = document.getElementById("carritoPanel");
  const vacioCentro = document.getElementById("carritoVacioCentro");

  if (!carrito) {
    if (main) main.style.display = "none";
    if (panel) panel.style.display = "none";
    if (vacioCentro) {
      vacioCentro.style.display = "flex";
      const card = vacioCentro.querySelector(".carrito-vacio-card");
      if (card) {
        card.replaceChildren(
          el("div", "carrito-vacio-icono", "⚠️"),
          el("p", "carrito-vacio-texto", "No se pudo leer el carrito guardado"),
          el("p", "carrito-vacio-subtexto", "Puedes restablecerlo para volver a comprar. Esto eliminará los datos dañados.")
        );
        const btnRestablecer = document.createElement("button");
        btnRestablecer.type = "button";
        btnRestablecer.className = "btn-volver-tienda";
        btnRestablecer.textContent = "Restablecer carrito";
        btnRestablecer.addEventListener("click", () => {
          try {
            localStorage.removeItem("carritoMariru");
            actualizarContadorCarrito();
            mostrarCarrito();
          } catch (error) {
            console.error("No se pudo restablecer el carrito.", error);
            mostrarToast("No se pudo restablecer el carrito. Revisa el almacenamiento del navegador.", true);
          }
        });
        card.appendChild(btnRestablecer);
      }
    }
    return;
  }

  if (carrito.length === 0) {
    if (main) main.style.display = "none";
    if (panel) panel.style.display = "none";
    if (vacioCentro) {
      vacioCentro.style.display = "flex";
      const card = vacioCentro.querySelector(".carrito-vacio-card");
      if (card) {
        card.innerHTML = "";
        const icon = el("div", "carrito-vacio-icono", "🛒");
        const txt = el("p", "carrito-vacio-texto", "Tu carrito está vacío");
        const enlace = document.createElement("a");
        enlace.href = "inicio.html";
        enlace.className = "btn-volver-tienda";
        enlace.textContent = "Volver a la tienda";
        card.appendChild(icon);
        card.appendChild(txt);
        card.appendChild(enlace);
      }
    }
    return;
  }

  if (main) main.style.display = "block";
  if (panel) panel.style.display = "flex";
  if (vacioCentro) vacioCentro.style.display = "none";

  listaCarrito.innerHTML = "";
  let subtotal = 0;

  carrito.forEach(item => {
    const productoActual = productos.find(p => p.id === item.id);
    const precio = Number(productoActual?.precio ?? item.precio ?? 0);
    const nombre = productoActual?.nombre || item.nombre || "Producto";
    subtotal += precio * item.cantidad;
    const div = document.createElement("div");
    div.className = "carrito-item";

    // Imagen
    const divImg = el("div", "carrito-item-imagen");
    if (item.imagen) {
      const img = document.createElement("img");
      img.src = item.imagen;
      img.alt = "";
      img.loading = "lazy";
      divImg.appendChild(img);
    } else {
      divImg.appendChild(el("span", "carrito-item-img-placeholder", "✦"));
    }

    // Datos del producto
    const divInfo = el("div", "carrito-item-info");
    divInfo.appendChild(el("p", "carrito-item-nombre", nombre));

    // Descripción corta (máx 60 chars)
    if (item.descripcion) {
      const desc = el("p", "carrito-item-desc");
      desc.textContent = item.descripcion.length > 60
        ? item.descripcion.slice(0, 60) + "…"
        : item.descripcion;
      divInfo.appendChild(desc);
    }

    // Talla (solo si el producto tiene tallas)
    if (item.talla) {
      const talla = el("p", "carrito-item-talla");
      talla.textContent = `Talla: ${item.talla}`;
      divInfo.appendChild(talla);
    }

    // Precio y controles de cantidad
    const divAcciones = el("div", "carrito-item-acciones");
    divAcciones.appendChild(el("span", "carrito-item-precio", `$${precio.toLocaleString("es-MX")}`));

    const divCantidad = el("div", "carrito-item-cantidad");
    const btnMenos = document.createElement("button");
    btnMenos.type = "button";
    btnMenos.className = "btn-cantidad";
    btnMenos.textContent = "−";
    btnMenos.setAttribute("aria-label", "Reducir cantidad");
    btnMenos.disabled = item.cantidad <= 1;
    btnMenos.addEventListener("click", () => cambiarCantidadEnCarrito(item.id, item.talla, -1));

    const cantSpan = el("span", "carrito-item-cant-num", String(item.cantidad));

    const btnMas = document.createElement("button");
    btnMas.type = "button";
    btnMas.className = "btn-cantidad";
    btnMas.textContent = "+";
    btnMas.setAttribute("aria-label", "Aumentar cantidad");
    const producto = productos.find(p => p.id === item.id);
    const cantidadProducto = carrito
      .filter(linea => linea.id === item.id)
      .reduce((total, linea) => total + Number(linea.cantidad || 0), 0);
    btnMas.disabled = !producto || cantidadProducto >= Math.max(0, Math.floor(Number(producto.stock) || 0));
    btnMas.addEventListener("click", () => cambiarCantidadEnCarrito(item.id, item.talla, 1));

    divCantidad.appendChild(btnMenos);
    divCantidad.appendChild(cantSpan);
    divCantidad.appendChild(btnMas);

    const subtotalSpan = el("span", "carrito-item-subtotal");
    subtotalSpan.textContent = `$${(precio * item.cantidad).toLocaleString("es-MX")}`;

    divAcciones.appendChild(divCantidad);
    divAcciones.appendChild(subtotalSpan);

    // Botón eliminar con icono SVG
    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.className = "carrito-item-quitar";
    btnEliminar.setAttribute("aria-label", `Eliminar ${nombre} del carrito`);
    btnEliminar.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
      Eliminar`;
    btnEliminar.addEventListener("click", () => quitarDelCarrito(item.id, item.talla));

    div.appendChild(divImg);
    div.appendChild(divInfo);
    div.appendChild(divAcciones);
    div.appendChild(btnEliminar);

    listaCarrito.appendChild(div);
  });

  const subtotalEl = document.getElementById("carritoSubtotal");
  const totalEl = document.getElementById("carritoTotal");
  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toLocaleString("es-MX")}`;
  if (totalEl) totalEl.textContent = `$${subtotal.toLocaleString("es-MX")}`;
}

/* ============================================================
   PEDIDO POR WHATSAPP
   ============================================================ */
function asegurarModalPedido() {
  let modal = document.getElementById("pedidoWhatsAppModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "pedidoWhatsAppModal";
  modal.className = "modal-guide hidden";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <section class="modal-guide-card pedido-whatsapp-card" role="dialog" aria-modal="true" aria-labelledby="pedidoWhatsAppTitulo">
      <button type="button" class="modal-guide-close" id="cerrarPedidoWhatsApp" aria-label="Cerrar">✕</button>
      <h2 id="pedidoWhatsAppTitulo">Completa tu pedido</h2>
      <p>Ventas únicamente en Hermosillo, Sonora. No se realizan cobros en esta página. Al confirmar, el reporte se enviará automáticamente al WhatsApp de Mariru.</p>
      <div class="pedido-whatsapp-resumen" id="pedidoWhatsAppResumen" aria-label="Resumen de productos"></div>
      <form id="pedidoWhatsAppForm" class="carrito-checkout">
        <label>Nombre
          <input name="nombre" type="text" autocomplete="name" maxlength="120" required>
        </label>
        <label>Teléfono de contacto
          <input name="telefono" type="tel" autocomplete="tel" maxlength="20" inputmode="tel" required>
        </label>
        <label>Forma de pago
          <select name="pago" required>
            <option value="" disabled selected>Selecciona cómo pagar</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Depósito">Depósito</option>
            <option value="Efectivo">Efectivo (se coordina por WhatsApp)</option>
          </select>
        </label>
        <label class="pedido-direccion-guardada" hidden>Usar una dirección guardada
          <select name="direccionGuardada"><option value="">Escribir otra</option></select>
        </label>
        <label>Colonia o punto de entrega (opcional)
          <input name="entrega" type="text" maxlength="200" autocomplete="street-address">
        </label>
        <label>Notas (opcional)
          <textarea name="notas" rows="2" maxlength="500"></textarea>
        </label>
        <button class="btn-quiero-productos" type="submit">Enviar pedido a Mariru</button>
        <p class="pedido-whatsapp-aviso" id="pedidoWhatsAppAviso" role="status">El reporte se enviará automáticamente al WhatsApp de la tienda. Mariru confirmará disponibilidad, entrega y pago.</p>
      </form>
    </section>`;
  document.body.appendChild(modal);

  const close = () => {
    // Mientras se envía no se cierra: evita cambiar de contexto con una respuesta pendiente
    if (modal._enviando) {
      mostrarToast("Espera a que termine el envío del pedido.", true);
      return;
    }
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  };
  modal.querySelector('[name="direccionGuardada"]').addEventListener("change", event => {
    const direccion = modal._direcciones?.find(d => d.id === event.target.value);
    if (direccion) aplicarDireccionGuardada(modal.querySelector("#pedidoWhatsAppForm"), direccion);
  });
  modal.querySelector("#cerrarPedidoWhatsApp").addEventListener("click", close);
  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });
  modal.querySelector("#pedidoWhatsAppForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!Array.isArray(modal._items) || !modal._items.length) {
      mostrarToast("No hay productos válidos para incluir en el pedido.", true);
      return;
    }

    const datos = new FormData(form);
    const botonEnviar = form.querySelector('[type="submit"]');
    const aviso = document.getElementById("pedidoWhatsAppAviso");
    const payload = {
      items: modal._items.map(item => ({
        id: item.id,
        cantidad: item.cantidad,
        talla: item.talla || null,
      })),
      nombre: datos.get("nombre").trim(),
      telefono: datos.get("telefono").trim(),
      pago: datos.get("pago"),
      entrega: datos.get("entrega").trim(),
      notas: datos.get("notas").trim(),
    };

    // El reporte de WhatsApp tiene un límite: se avisa antes de enviar, no después
    const largo = estimarLargoReporte(payload, modal._items);
    if (largo > LIMITE_REPORTE_WHATSAPP) {
      aviso.textContent = `El pedido es demasiado largo para el mensaje de WhatsApp (${largo} de ${LIMITE_REPORTE_WHATSAPP} caracteres). Acorta las notas o el punto de entrega, o divide el pedido en dos.`;
      return;
    }

    modal._enviando = true;
    botonEnviar.disabled = true;
    botonEnviar.textContent = "Enviando pedido…";
    aviso.textContent = "Enviando el reporte a WhatsApp de Mariru…";
    try {
      if (!appCheckConfigurado) {
        throw new Error("El envío automático aún no está configurado para este sitio. Contacta a Mariru por WhatsApp.");
      }
      payload.requestId = await obtenerIdSolicitudPedido(payload);
      const respuesta = await enviarPedidoWhatsApp(payload);
      if (respuesta.data.processing) {
        aviso.textContent = `El pedido ${respuesta.data.orderId} ya está en proceso de envío. No vuelvas a enviarlo; espera la confirmación de Mariru.`;
        botonEnviar.textContent = "Pedido en proceso";
        return;
      }
      if (!respuesta.data.sent) {
        throw new Error("El pedido se registró, pero el envío aún no se confirmó. Contacta a Mariru antes de volver a intentarlo.");
      }

      try {
        sessionStorage.removeItem("mariruWhatsAppOrderRequest");
      } catch (error) {
        console.error("No se pudo limpiar la clave de reintento del pedido.", error);
      }
      if (modal._fromCart) {
        try {
          localStorage.removeItem("carritoMariru");
          actualizarContadorCarrito();
          mostrarCarrito();
        } catch (error) {
          console.error("El reporte se envió, pero no se pudo limpiar el carrito local.", error);
        }
      }
      aviso.textContent = `El reporte ${respuesta.data.orderId} fue aceptado por WhatsApp para enviarse a Mariru. Espera su confirmación; esto no procesa ningún pago.`;
      botonEnviar.textContent = "Pedido enviado";
    } catch (error) {
      console.error("No se pudo enviar el reporte del pedido.", error?.code || error);
      aviso.textContent = error?.message || "No se pudo enviar el pedido. Contacta a Mariru antes de volver a intentarlo.";
      const requiereRevision = new Set([
        "functions/already-exists",
        "functions/deadline-exceeded",
        "functions/internal",
        "functions/unavailable",
      ]).has(error?.code);
      botonEnviar.disabled = requiereRevision;
      botonEnviar.textContent = requiereRevision ? "Contacta a Mariru antes de reintentar" : "Revisar datos y reintentar";
    } finally {
      modal._enviando = false;
    }
  });
  return modal;
}

/* ---- Límite del reporte de WhatsApp (mismo formato que crearReportePedido en functions/index.js) ---- */
const LIMITE_REPORTE_WHATSAPP = 1024;

function estimarLargoReporte(payload, items) {
  const precio = valor => `$${Number(valor || 0).toLocaleString("es-MX")}`;
  const renglones = items.map(item => {
    const opciones = item.talla ? ` (Talla ${item.talla})` : "";
    return `- ${item.nombre}${opciones} [${item.id}]: ${item.cantidad} x ${precio(item.precio)} = ${precio(item.cantidad * item.precio)}`;
  });
  const total = items.reduce((suma, item) => suma + item.cantidad * item.precio, 0);
  const lineas = [
    `PEDIDO ${"x".repeat(36)} - MARIRU BAZAR`,
    "Vendedor: Mariru Bazar | WhatsApp: +52 662 238 0735 | Correo: Mariru_bazar@gmail.com",
    `Fecha/hora Hermosillo: ${"x".repeat(40)}`,
    "Zona: Hermosillo, Sonora, México",
    `Cliente: ${payload.nombre} | Teléfono: ${payload.telefono}`,
    `Entrega: ${payload.entrega || "Por acordar por WhatsApp"}`,
    `Pago elegido: ${payload.pago}${payload.pago === "Efectivo" ? " (coordinar por WhatsApp)" : ""}`,
    "Productos:",
    ...renglones,
    `Total productos: ${precio(total)}`,
    `Notas: ${payload.notas || "Sin notas"}`,
  ];
  return lineas.join("\n").length;
}

/* ---- Direcciones guardadas en Mi cuenta (solo con sesión) ---- */
function aplicarDireccionGuardada(form, direccion) {
  const entrega = [
    direccion.alias && `${direccion.alias}:`,
    `${direccion.calle}, ${direccion.colonia}, C.P. ${direccion.codigoPostal}`,
    direccion.referencias && `(${direccion.referencias})`,
  ].filter(Boolean).join(" ");
  form.querySelector('[name="entrega"]').value = entrega.slice(0, 200);
  if (direccion.destinatario) form.querySelector('[name="nombre"]').value = direccion.destinatario.slice(0, 120);
  if (direccion.telefono) form.querySelector('[name="telefono"]').value = direccion.telefono.slice(0, 20);
}

async function cargarDireccionesGuardadas(modal) {
  const contenedor = modal.querySelector(".pedido-direccion-guardada");
  const selector = contenedor.querySelector("select");
  contenedor.hidden = true;
  modal._direcciones = [];
  const usuario = auth.currentUser;
  if (!usuario) return;
  try {
    const snapshot = await getDocs(collection(db, "usuarios", usuario.uid, "direcciones"));
    const direcciones = snapshot.docs
      .map(documento => ({ id: documento.id, ...documento.data() }))
      .sort((a, b) => Number(b.predeterminada === true) - Number(a.predeterminada === true));
    if (!direcciones.length || modal.classList.contains("hidden")) return;
    modal._direcciones = direcciones;
    selector.replaceChildren(new Option("Escribir otra", ""), ...direcciones.map(d =>
      new Option(`${d.alias} — ${d.calle}, ${d.colonia}`, d.id)));
    contenedor.hidden = false;
    // La principal se propone por defecto si el campo de entrega sigue vacío
    const form = modal.querySelector("#pedidoWhatsAppForm");
    if (!form.querySelector('[name="entrega"]').value) {
      selector.value = direcciones[0].id;
      aplicarDireccionGuardada(form, direcciones[0]);
    }
  } catch (error) {
    console.warn("No se pudieron cargar las direcciones guardadas.", error?.code || error);
  }
}

async function obtenerIdSolicitudPedido(payload) {
  const huella = JSON.stringify(payload);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(huella));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  let guardado;
  try {
    guardado = JSON.parse(sessionStorage.getItem("mariruWhatsAppOrderRequest") || "null");
  } catch (error) {
    console.error("No se pudo recuperar la clave de reintento del pedido.", error);
    throw new Error("No se pudo preparar un envío seguro. Revisa el almacenamiento de este navegador.");
  }
  if (guardado?.fingerprint === fingerprint && /^[0-9a-f-]{36}$/i.test(guardado.requestId)) {
    return guardado.requestId;
  }

  const requestId = crypto.randomUUID();
  try {
    sessionStorage.setItem("mariruWhatsAppOrderRequest", JSON.stringify({ fingerprint, requestId }));
  } catch (error) {
    console.error("No se pudo guardar la clave de reintento del pedido.", error);
    throw new Error("No se pudo guardar la clave segura del pedido. Revisa el almacenamiento de este navegador.");
  }
  return requestId;
}

function abrirPedidoWhatsApp(items, desdeCarrito = false) {
  if (!Array.isArray(items) || !items.length || items.some(item =>
    typeof item.id !== "string" ||
    !item.id ||
    !Number.isSafeInteger(Number(item.cantidad)) ||
    Number(item.cantidad) < 1
  )) {
    mostrarToast("Hay un producto inválido en el pedido.", true);
    return;
  }

  const resumenPorProducto = new Map();
  const cantidadesPorProducto = new Map();
  for (const item of items) {
    const producto = productos.find(actual => actual.id === item.id);
    cantidadesPorProducto.set(
      item.id,
      (cantidadesPorProducto.get(item.id) || 0) + Number(item.cantidad)
    );
    if (!producto) {
      mostrarToast(`No hay suficientes unidades disponibles de ${producto?.nombre || item.nombre || "un producto"}.`, true);
      return;
    }
    const clave = `${item.id}|${item.talla || ""}`;
    const existente = resumenPorProducto.get(clave);
    resumenPorProducto.set(clave, {
      ...item,
      cantidad: (existente?.cantidad || 0) + Number(item.cantidad),
      nombre: producto.nombre,
      precio: Number(producto.precio || 0),
    });
  }
  for (const [id, cantidad] of cantidadesPorProducto) {
    const producto = productos.find(actual => actual.id === id);
    if (cantidad > Number(producto?.stock || 0)) {
      mostrarToast(`No hay suficientes unidades disponibles de ${producto?.nombre || "un producto"}.`, true);
      return;
    }
  }

  const modal = asegurarModalPedido();
  if (modal._enviando) {
    mostrarToast("Espera a que termine el envío del pedido anterior.", true);
    return;
  }
  modal._items = [...resumenPorProducto.values()];
  modal._fromCart = desdeCarrito;
  const form = modal.querySelector("#pedidoWhatsAppForm");
  form.reset();
  const resumen = modal.querySelector("#pedidoWhatsAppResumen");
  resumen.replaceChildren(...modal._items.map(item => {
    const producto = productos.find(actual => actual.id === item.id);
    const opciones = item.talla ? `Talla ${item.talla}` : "";
    const fila = el("p", "pedido-whatsapp-resumen-item");
    fila.textContent = `${producto?.nombre || item.nombre} ${opciones ? `(${opciones}) ` : ""}· ${item.cantidad} × $${Number(producto?.precio ?? item.precio).toLocaleString("es-MX")}`;
    return fila;
  }));
  const total = modal._items.reduce((suma, item) => {
    const precio = Number(productos.find(actual => actual.id === item.id)?.precio ?? item.precio ?? 0);
    return suma + precio * item.cantidad;
  }, 0);
  resumen.appendChild(el("strong", "pedido-whatsapp-resumen-total", `Total de productos: $${total.toLocaleString("es-MX")}`));
  const botonEnviar = form.querySelector('[type="submit"]');
  botonEnviar.disabled = false;
  botonEnviar.textContent = "Enviar pedido a Mariru";
  form.querySelectorAll("input, select, textarea").forEach(campo => { campo.disabled = false; });
  modal.querySelector("#pedidoWhatsAppAviso").textContent =
    "El reporte se enviará automáticamente al WhatsApp de la tienda. Mariru confirmará disponibilidad, entrega y pago.";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  form.querySelector('[name="nombre"]').focus();
  cargarDireccionesGuardadas(modal);
}

function inicializarNotaCompra() {
  const claveAceptacion = "mariruNotaCompraAceptada-v1";
  const tachuela = `<svg class="compra-nota-tachuela" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <g transform="rotate(32 24 24)">
      <path d="M24 27v14" stroke="#8b8d98" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M24 28v11" stroke="#e9eaf0" stroke-width="1"/>
      <path d="M20 11h8l1 11h-10Z" fill="#ba567a"/>
      <path d="M20 11h3v11h-4Z" fill="#edb0c5"/>
      <ellipse cx="24" cy="25" rx="11" ry="4.5" fill="#943e61"/>
      <ellipse cx="24" cy="23" rx="11" ry="4.5" fill="#d77d9e"/>
      <ellipse cx="24" cy="11" rx="9" ry="4.5" fill="#a8496b"/>
      <ellipse cx="24" cy="9" rx="9" ry="4.5" fill="#e69bb7"/>
      <ellipse cx="21" cy="8" rx="4" ry="1.5" fill="#ffe4ee"/>
    </g>
  </svg>`;
  const ventana = document.createElement("div");
  ventana.className = "compra-nota-overlay";
  ventana.setAttribute("aria-hidden", "true");
  ventana.inert = true;
  ventana.innerHTML = `
    <section id="compraNotaDialogo" class="compra-nota-dialogo" role="dialog" aria-modal="true" aria-labelledby="compraNotaTitulo" aria-describedby="compraNotaTexto">
      ${tachuela}
      <span class="compra-nota-etiqueta">Una notita de Mariru</span>
      <h2 id="compraNotaTitulo">Antes de tu pedido</h2>
      <div id="compraNotaTexto" class="compra-nota-contenido">
        <p><strong>Solo en Hermosillo.</strong> Acordamos la entrega contigo por WhatsApp.</p>
        <p><strong>Tú eliges cómo pagar.</strong> Transferencia, depósito o efectivo, coordinado con Mariru. Sin cobros en esta página.</p>
        <p><strong>Espera nuestra confirmación.</strong> Recibimos tu solicitud por WhatsApp y confirmamos disponibilidad, entrega y pago.</p>
      </div>
      <button type="button" class="compra-nota-aceptar">¡Entendido!</button>
    </section>`;
  document.body.appendChild(ventana);

  const botonAceptar = ventana.querySelector(".compra-nota-aceptar");
  const dialogo = ventana.querySelector(".compra-nota-dialogo");
  let cerrando = false;
  let animacionApertura = null;
  let focoAnterior = null;
  const textoAceptado = () => {
    try {
      return localStorage.getItem(claveAceptacion) === "true";
    } catch (error) {
      console.error("No se pudo comprobar la aceptación de la nota de compra.", error);
      return false;
    }
  };
  const abrir = () => {
    if (cerrando) return;
    focoAnterior = document.activeElement;
    ventana.inert = false;
    ventana.classList.add("visible");
    ventana.setAttribute("aria-hidden", "false");
    document.body.classList.add("compra-nota-abierta");
    botonAceptar.focus({ preventScroll: true });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && dialogo.animate) {
      animacionApertura = dialogo.animate([
        { transform: "translateY(12px)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 },
      ], { duration: 420, easing: "cubic-bezier(.2, .8, .2, 1)" });
    }
  };
  const cerrar = async () => {
    if (cerrando) return;
    cerrando = true;
    animacionApertura?.cancel();
    try {
      localStorage.setItem(claveAceptacion, "true");
    } catch (error) {
      console.error("No se pudo guardar la aceptación de la nota de compra.", error);
      mostrarToast("No se pudo guardar tu aceptación. La nota volverá a mostrarse al actualizar la página.", true);
    }
    const animaciones = [];
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && dialogo.animate) {
      animaciones.push(ventana.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220, easing: "ease-out", fill: "forwards",
      }));
      await Promise.allSettled(animaciones.map(animacion => animacion.finished));
    }
    ventana.classList.remove("visible");
    ventana.setAttribute("aria-hidden", "true");
    ventana.inert = true;
    document.body.classList.remove("compra-nota-abierta");
    animaciones.forEach(animacion => animacion.cancel());
    cerrando = false;
    if (focoAnterior?.isConnected) focoAnterior.focus({ preventScroll: true });
    ventana.remove();
  };

  botonAceptar.addEventListener("click", cerrar);
  ventana.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      cerrar();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      botonAceptar.focus();
    }
  });

  if (!textoAceptado()) abrir();
}

inicializarNotaCompra();
