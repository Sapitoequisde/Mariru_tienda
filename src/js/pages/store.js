import { auth, db } from "../services/firebase.js";
import { collection, getDocs, doc, updateDoc, increment, addDoc, serverTimestamp } from "firebase/firestore";

let productos = [];

async function cargarProductos() {
  const snapshot = await getDocs(collection(db, "productos"));
  productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  return productos;
}

function mostrarProductosEn(contenedor, lista) {
  contenedor.innerHTML = "";

  if (lista.length === 0) {
    const categorias = [...new Set(productos.map(p => p.categoria).filter(Boolean))];
    contenedor.innerHTML = `
      <div class="catalogo-sin-resultados">
        <h3>No encontramos resultados</h3>
        <p>Prueba otra búsqueda o revisa estas categorías:</p>
        <div class="sin-resultados-chips">
          ${categorias.map(c => `<button class="chip chip-sugerencia" data-categoria="${c}">${c}</button>`).join("") || '<span class="chip chip-sugerencia">Todos</span>'}
        </div>
      </div>
    `;

    contenedor.querySelectorAll(".chip-sugerencia").forEach(chip => {
      chip.addEventListener("click", () => {
        const categoria = chip.dataset.categoria;
        const chipsContainer = document.getElementById("chipsInicio");
        if (!chipsContainer) return;
        chipsContainer.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.categoria === categoria));
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set("categoria", categoria);
        window.location.search = urlParams.toString();
      });
    });
    return;
  }

  lista.forEach(producto => {
    const card = document.createElement("div");
    card.className = "product-card";
    const imagen = producto.imagenes?.[0];
    const imagenMarkup = imagen
      ? `<img src="${imagen}" alt="${producto.nombre}" loading="lazy">`
      : `<span class="product-image-placeholder">✦</span>`;
    const stock = Number(producto.stock || 0);
    const stockText = stock === 0 ? "Agotado" : stock <= 3 ? `¡Solo quedan ${stock}!` : `${stock} disponibles`;
    const stockClass = stock === 0 ? "out" : stock <= 3 ? "low" : "";
    card.innerHTML = `
      <div class="product-image">${imagenMarkup}<span class="product-category">${producto.categoria || "Mariru"}</span></div>
      <div class="product-content">
        <div class="product-name">${producto.nombre}</div>
        <div class="product-meta">
          <div class="product-price">$${Number(producto.precio || 0).toLocaleString("es-MX")}</div>
          <span class="product-stock ${stockClass}">${stockText}</span>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      window.location.href = `producto.html?id=${producto.id}`;
    });
    contenedor.appendChild(card);
  });
}

// ============================================
// INICIO
// ============================================
const grid = document.getElementById("productGrid");

if (grid) {
  const renderSkeleton = () => {
    grid.innerHTML = Array.from({ length: 8 }, () => `
      <div class="product-card skeleton-card">
        <div class="skeleton-image"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
      </div>
    `).join("");
  };

  renderSkeleton();

  cargarProductos().then(() => {
    const chipsContainer = document.getElementById("chipsInicio");
    const inputBusquedaInicio = document.getElementById("searchInput");

    function aplicarFiltrosInicio() {
      const chipActivo = chipsContainer ? chipsContainer.querySelector(".chip.active") : null;
      const categoria = chipActivo ? chipActivo.dataset.categoria : "todos";
      const texto = inputBusquedaInicio ? inputBusquedaInicio.value.toLowerCase().trim() : "";

      let resultado = categoria === "todos" ? productos : productos.filter(p => p.categoria === categoria);
      if (texto !== "") {
        resultado = resultado.filter(p => p.nombre.toLowerCase().includes(texto));
      }
      mostrarProductosEn(grid, resultado);
    }

    const params = new URLSearchParams(window.location.search);
    const categoriaParam = params.get("categoria");

    if (categoriaParam && chipsContainer) {
      const chipObjetivo = chipsContainer.querySelector(`.chip[data-categoria="${categoriaParam}"]`);
      if (chipObjetivo) {
        chipsContainer.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        chipObjetivo.classList.add("active");
      }
    }

    aplicarFiltrosInicio();

    if (chipsContainer) {
      chipsContainer.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
          chipsContainer.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          aplicarFiltrosInicio();
        });
      });
    }

    if (inputBusquedaInicio) {
      inputBusquedaInicio.addEventListener("input", aplicarFiltrosInicio);
    }
  }).catch(error => {
    console.error("No se pudieron cargar los productos desde Firestore.", error);
    grid.innerHTML = `<p class="catalogo-error">No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.</p>`;
  });
}

// ============================================
// PRODUCTO
// ============================================
const contenedorImagen = document.getElementById("productoImagen");

if (contenedorImagen) {
  cargarProductos().then(cargarProducto).catch(error => {
    console.error("No se pudo cargar el producto desde Firestore.", error);
    document.getElementById("productoDescripcion").textContent = "No pudimos cargar este producto.";
  });
}

function cargarProducto() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const producto = productos.find(p => p.id === id);
  if (!producto) return;

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
      stockBadge.classList.remove("low");
    }
  }

  document.getElementById("productoNombre").textContent = producto.nombre;
  document.getElementById("productoDescripcion").textContent = producto.descripcion || "";
  document.getElementById("productoPrecio").textContent = `$${Number(producto.precio || 0).toLocaleString("es-MX")}`;
  renderizarImagenProducto(producto);

  const contenedorTallas = document.getElementById("productoTallas");
  const tallas = Array.isArray(producto.tallas) ? producto.tallas.filter(Boolean) : [];
  const colores = Array.isArray(producto.colores) ? producto.colores.filter(Boolean) : [];
  let tallaSeleccionada = null;
  let colorSeleccionado = null;

  if (tallas.length) {
    contenedorTallas.innerHTML = `<span class="opciones-label">Elige tu talla</span><div class="opciones-lista"></div>`;
    const listaTallas = contenedorTallas.querySelector(".opciones-lista");
    tallas.forEach(talla => {
      const btn = document.createElement("button");
      btn.className = "talla-btn";
      btn.textContent = talla;
      btn.type = "button";
      btn.setAttribute("aria-label", `Talla ${talla}`);
      btn.addEventListener("click", () => {
        tallaSeleccionada = talla;
        seleccionarTalla(btn);
      });
      listaTallas.appendChild(btn);
    });
  }

  const contenedorColores = document.getElementById("productoColores");
  if (colores.length) {
    contenedorColores.innerHTML = `<span class="opciones-label">Elige un color</span><div class="opciones-lista"></div>`;
    const listaColores = contenedorColores.querySelector(".opciones-lista");
    colores.forEach((color, index) => {
    const swatch = document.createElement("button");
    swatch.className = "color-swatch";
    swatch.type = "button";
    swatch.setAttribute("aria-label", `Color ${index + 1}`);
    swatch.title = `Color ${index + 1}`;
    swatch.style.backgroundColor = color;
    swatch.addEventListener("click", () => {
      colorSeleccionado = color;
      seleccionarColor(swatch);
    });
    listaColores.appendChild(swatch);
    });
  }

  const btnFavorite = document.getElementById("btnFavorite");
  const favoritos = JSON.parse(localStorage.getItem("mariruFavoritos") || "[]");
  const esFavorito = favoritos.includes(producto.id);
  if (btnFavorite) {
    btnFavorite.classList.toggle("active", esFavorito);
    btnFavorite.textContent = esFavorito ? "♥" : "♡";
    btnFavorite.addEventListener("click", () => {
      const guardados = JSON.parse(localStorage.getItem("mariruFavoritos") || "[]");
      const indice = guardados.indexOf(producto.id);
      if (indice >= 0) {
        guardados.splice(indice, 1);
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
    modalGuia.addEventListener("click", event => {
      if (event.target === modalGuia) {
        modalGuia.classList.add("hidden");
        modalGuia.setAttribute("aria-hidden", "true");
      }
    });
  }

  document.getElementById("btnAgregar").addEventListener("click", () => {
    if (!validarOpciones(tallas, colores, tallaSeleccionada, colorSeleccionado)) return;
    agregarAlCarrito(producto, { talla: tallaSeleccionada, color: colorSeleccionado });
    alert(`${producto.nombre} agregado al carrito`);
  });

  document.getElementById("btnComprar").addEventListener("click", () => {
    if (!validarOpciones(tallas, colores, tallaSeleccionada, colorSeleccionado)) return;
    agregarAlCarrito(producto, { talla: tallaSeleccionada, color: colorSeleccionado });
    window.location.href = "carrito.html";
  });

  const costoEnvio = document.getElementById("costoEnvio");
  if (costoEnvio) {
    const envio = Number(producto.precio || 0) > 500 ? 0 : 80;
    costoEnvio.textContent = `$${envio}`;
  }
}

function renderizarImagenProducto(producto) {
  const contenedor = document.getElementById("productoImagen");
  const imagenes = Array.isArray(producto.imagenes) ? producto.imagenes.filter(Boolean) : [];
  if (!imagenes.length) {
    contenedor.innerHTML = `<span class="producto-imagen-placeholder">✦</span>`;
    return;
  }

  contenedor.innerHTML = `<img src="${imagenes[0]}" alt="${producto.nombre}">`;
}

function validarOpciones(tallas, colores, talla, color) {
  if (tallas.length && !talla) {
    alert("Selecciona una talla antes de continuar.");
    return false;
  }
  if (colores.length && !color) {
    alert("Selecciona un color antes de continuar.");
    return false;
  }
  return true;
}

function seleccionarTalla(btnSeleccionado) {
  document.querySelectorAll(".talla-btn").forEach(b => b.classList.remove("selected"));
  btnSeleccionado.classList.add("selected");
}

function seleccionarColor(swatchSeleccionado) {
  document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
  swatchSeleccionado.classList.add("selected");
}

// ============================================
// CATEGORÍAS
// ============================================
const categoriasTiles = document.getElementById("categoriasTiles");

if (categoriasTiles) {
  cargarProductos().then(inicializarCategorias).catch(error => {
    console.error("No se pudieron cargar las categorías desde Firestore.", error);
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

  inputBusqueda.addEventListener("input", () => {
    const texto = inputBusqueda.value.toLowerCase().trim();

    if (texto === "") {
      sugerenciasBox.classList.remove("visible");
      return;
    }

    const coincidencias = productos.filter(p => p.nombre.toLowerCase().includes(texto));

    sugerenciasBox.innerHTML = coincidencias.length
      ? coincidencias.map(p => `<div class="sugerencia-item" data-id="${p.id}">${p.nombre} · $${p.precio}</div>`).join("")
      : "Sin resultados";

    sugerenciasBox.classList.add("visible");

    document.querySelectorAll(".sugerencia-item").forEach(item => {
      item.addEventListener("click", () => {
        window.location.href = `producto.html?id=${item.dataset.id}`;
      });
    });
  });
}

// ============================================
// CARRITO - localStorage
// ============================================
function obtenerCarrito() {
  const datos = localStorage.getItem("carritoMariru");
  return datos ? JSON.parse(datos) : [];
}

function guardarCarrito(carrito) {
  localStorage.setItem("carritoMariru", JSON.stringify(carrito));
}

function agregarAlCarrito(producto, opciones = {}) {
  const carrito = obtenerCarrito();
  const existente = carrito.find(item =>
    item.id === producto.id &&
    item.talla === opciones.talla &&
    item.color === opciones.color
  );

  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: 1,
      talla: opciones.talla || null,
      color: opciones.color || null,
    });
  }

  guardarCarrito(carrito);
}

function quitarDelCarrito(id) {
  let carrito = obtenerCarrito();
  carrito = carrito.filter(item => item.id !== id);
  guardarCarrito(carrito);
  mostrarCarrito();
}

// ============================================
// CARRITO (carrito.html)
// ============================================
const listaCarrito = document.getElementById("carritoLista");

if (listaCarrito) {
  mostrarCarrito();
  document.getElementById("btnFinalizar").addEventListener("click", finalizarPedido);
}

function mostrarCarrito() {
  const carrito = obtenerCarrito();
  const main = document.getElementById("carritoMain");
  const panel = document.getElementById("carritoPanel");
  const vacioCentro = document.getElementById("carritoVacioCentro");

  if (carrito.length === 0) {
    main.style.display = "none";
    panel.style.display = "none";
    vacioCentro.style.display = "flex";
    return;
  }

  main.style.display = "block";
  panel.style.display = "flex";
  vacioCentro.style.display = "none";

  listaCarrito.innerHTML = "";
  let subtotal = 0;

  carrito.forEach(item => {
    subtotal += item.precio * item.cantidad;
    const div = document.createElement("div");
    div.className = "carrito-item";
    div.innerHTML = `
      <div><strong>${item.nombre} (x${item.cantidad})</strong>
      <small>${item.talla ? `Talla: ${item.talla}` : ""}${item.talla && item.color ? " · " : ""}${item.color ? "Color seleccionado" : ""}</small></div>
      <button class="carrito-item-quitar" data-id="${item.id}">✕</button>
    `;
    listaCarrito.appendChild(div);
  });

  const envio = subtotal > 500 ? 0 : 80;
  document.getElementById("carritoSubtotal").textContent = `$${subtotal}`;
  const envioEl = document.getElementById("carritoEnvio");
  if (envioEl) {
    envioEl.textContent = `$${envio}`;
  }

  document.querySelectorAll(".carrito-item-quitar").forEach(btn => {
    btn.addEventListener("click", () => {
      quitarDelCarrito(btn.dataset.id);
    });
  });
}

async function finalizarPedido() {
  const carrito = obtenerCarrito();
  if (carrito.length === 0) return;

  const btnFinalizar = document.getElementById("btnFinalizar");
  const checkoutForm = document.getElementById("checkoutForm");

  if (btnFinalizar) {
    btnFinalizar.disabled = true;
    btnFinalizar.textContent = "Procesando...";
  }

  const nombre = document.getElementById("checkoutNombre")?.value.trim();
  const telefono = document.getElementById("checkoutTelefono")?.value.trim();
  const direccion = document.getElementById("checkoutDireccion")?.value.trim();
  const metodoPago = document.getElementById("checkoutPago")?.value || "Transferencia";
  const notas = document.getElementById("checkoutNotas")?.value.trim() || "";

  if (!nombre || !telefono || !direccion) {
    alert("Completa tu nombre, teléfono y dirección antes de enviar tu pedido.");
    if (btnFinalizar) {
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = "Quiero estos productos";
    }
    return;
  }

  const subtotal = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
  const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0);

  try {
    const productosSnapshot = await getDocs(collection(db, "productos"));
    const stockPorId = new Map(
      productosSnapshot.docs.map(docSnapshot => [docSnapshot.id, Number(docSnapshot.data().stock || 0)])
    );

    const sinStock = carrito.filter(item => (stockPorId.get(item.id) || 0) < item.cantidad);

    if (sinStock.length) {
      alert("Alguno de los productos ya no tiene stock suficiente. Ajusta tu carrito e inténtalo de nuevo.");
      throw new Error("Stock insuficiente");
    }

    const pedido = {
      items: carrito,
      subtotal,
      totalItems,
      metodoPago,
      nombre,
      telefono,
      direccion,
      notas,
      estado: "Registrado",
      fecha: serverTimestamp(),
      usuario: auth.currentUser
        ? {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email || "",
            nombre: auth.currentUser.displayName || nombre,
          }
        : null,
      creadoEn: serverTimestamp(),
    };

    await addDoc(collection(db, "pedidos"), pedido);

    for (const item of carrito) {
      await updateDoc(doc(db, "productos", item.id), {
        stock: increment(-item.cantidad),
      });
    }

    localStorage.removeItem("carritoMariru");
    if (checkoutForm) checkoutForm.reset();
    alert("Gracias por tu pedido, pronto nos pondremos en contacto contigo.");
    window.location.href = "inicio.html";
  } catch (error) {
    console.error("No se pudo finalizar el pedido.", error);
    alert("No se pudo completar tu pedido. Revisa el stock y vuelve a intentarlo.");
    if (btnFinalizar) {
      btnFinalizar.disabled = false;
      btnFinalizar.textContent = "Quiero estos productos";
    }
  }
}