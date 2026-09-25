import { auth, db, storage } from "../services/firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc, updateDoc, addDoc, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

let productos = [];
let pedidos = [];

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

  cargarTodo();
});

document.getElementById("btnLogout").addEventListener("click", async () => {
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
    estado.textContent = "Datos en tiempo real · Firestore";
    estado.classList.add("connected");
  };

  onSnapshot(
    collection(db, "productos"),
    snapshot => {
      productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      productosListos = true;
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
  estado.textContent = "Error de conexión con Firestore";
  estado.classList.remove("connected");
  document.getElementById("adminNotificaciones").innerHTML = `
    <div class="admin-notif-banner admin-notif-error">
      ⚠️ ${mensaje}. Verifica la conexión y los permisos de Firebase.
    </div>
  `;
}

function pintarResumen() {
  const totalVentas = pedidos.reduce((total, pedido) => total + Number(pedido.subtotal || 0), 0);
  const totalUnidades = productos.reduce((total, producto) => total + Number(producto.stock || 0), 0);
  const alertas = productos.filter(producto => Number(producto.stock || 0) <= 5);
  const totalVendidas = pedidos.reduce(
    (total, pedido) => total + (pedido.items || []).reduce((subtotal, item) => subtotal + Number(item.cantidad || 0), 0),
    0
  );

  document.getElementById("resumenVentas").textContent = `$${totalVentas.toLocaleString("es-MX")}`;
  document.getElementById("resumenVentasDetalle").textContent = `${totalVendidas} unidad${totalVendidas === 1 ? "" : "es"} vendida${totalVendidas === 1 ? "" : "s"}`;
  document.getElementById("resumenPedidos").textContent = pedidos.length.toLocaleString("es-MX");
  document.getElementById("resumenPedidosDetalle").textContent = pedidos.length === 1 ? "Pedido registrado" : "Pedidos registrados";
  document.getElementById("resumenStock").textContent = totalUnidades.toLocaleString("es-MX");
  document.getElementById("resumenStockDetalle").textContent = `${productos.length} producto${productos.length === 1 ? "" : "s"} en catálogo`;
  document.getElementById("resumenAlertas").textContent = alertas.length.toLocaleString("es-MX");
  document.getElementById("resumenAlertasDetalle").textContent = alertas.length ? "Requieren revisión" : "Todo en orden";
  document.getElementById("adminFechaActual").textContent = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full",
  }).format(new Date());
}

// ===== Tabla de stock =====
function pintarTablaStock() {
  const tbody = document.getElementById("tablaStockBody");
  tbody.innerHTML = "";

  if (productos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-tabla-vacia">No hay productos registrados en Firestore.</td></tr>`;
    return;
  }

  productos.forEach(producto => {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td>${producto.nombre}</td>
      <td>${producto.categoria}</td>
      <td>$${producto.precio}</td>
      <td><input type="number" class="input-stock" value="${producto.stock}" min="0" data-id="${producto.id}"></td>
      <td>
        <button class="btn-fila-guardar" data-id="${producto.id}">Guardar</button>
        <button class="btn-fila-eliminar" data-id="${producto.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(fila);
  });

  document.querySelectorAll(".btn-fila-guardar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const input = document.querySelector(`.input-stock[data-id="${id}"]`);
      const nuevoStock = parseInt(input.value);
      await updateDoc(doc(db, "productos", id), { stock: nuevoStock });
      productos.find(p => p.id === id).stock = nuevoStock;
      pintarNotificaciones();
      pintarResumen();
      pintarGraficas();
      btn.textContent = "Guardado ✓";
      setTimeout(() => (btn.textContent = "Guardar"), 1200);
    });
  });

  document.querySelectorAll(".btn-fila-eliminar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!confirm("¿Eliminar este producto?")) return;
      await deleteDoc(doc(db, "productos", id));
      productos = productos.filter(p => p.id !== id);
      pintarTablaStock();
      pintarNotificaciones();
      pintarResumen();
      pintarGraficas();
    });
  });
}

// ===== Agregar producto =====
let imagenesSeleccionadas = [];
let videosSeleccionados = [];
let coloresSeleccionados = [];

const btnMostrarForm = document.getElementById("btnMostrarFormAgregar");
const formAgregar = document.getElementById("formAgregar");

btnMostrarForm.addEventListener("click", () => {
  formAgregar.classList.toggle("visible");
});

// ----- Colores -----
document.getElementById("btnAgregarColor").addEventListener("click", () => {
  const color = document.getElementById("colorPicker").value;
  coloresSeleccionados.push(color);
  pintarColores();
});

function pintarColores() {
  const contenedor = document.getElementById("coloresLista");
  contenedor.innerHTML = "";
  coloresSeleccionados.forEach((color, index) => {
    const chip = document.createElement("div");
    chip.className = "color-chip";
    chip.style.backgroundColor = color;
    chip.innerHTML = `<span class="chip-quitar">✕</span>`;
    chip.querySelector(".chip-quitar").addEventListener("click", () => {
      coloresSeleccionados.splice(index, 1);
      pintarColores();
    });
    contenedor.appendChild(chip);
  });
}

// ----- Imágenes (cantidad indefinida) -----
document.getElementById("btnAgregarImagenes").addEventListener("click", () => {
  document.getElementById("inputImagenes").click();
});

document.getElementById("inputImagenes").addEventListener("change", (e) => {
  imagenesSeleccionadas.push(...Array.from(e.target.files));
  pintarMediaPreview(imagenesSeleccionadas, "previewImagenes", "imagen");
  e.target.value = ""; // permite volver a elegir más después
});

// ----- Videos (cantidad indefinida) -----
document.getElementById("btnAgregarVideos").addEventListener("click", () => {
  document.getElementById("inputVideos").click();
});

document.getElementById("inputVideos").addEventListener("change", (e) => {
  videosSeleccionados.push(...Array.from(e.target.files));
  pintarMediaPreview(videosSeleccionados, "previewVideos", "video");
  e.target.value = "";
});

function pintarMediaPreview(lista, idContenedor, tipo) {
  const contenedor = document.getElementById(idContenedor);
  contenedor.innerHTML = "";
  lista.forEach((archivo, index) => {
    const item = document.createElement("div");
    item.className = "media-item";

    if (tipo === "imagen") {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(archivo);
      item.appendChild(img);
    } else {
      const icono = document.createElement("div");
      icono.className = "media-video-icono";
      icono.textContent = "🎬";
      item.appendChild(icono);
    }

    const nombre = document.createElement("span");
    nombre.className = "media-nombre";
    nombre.textContent = archivo.name;
    item.appendChild(nombre);

    const quitar = document.createElement("span");
    quitar.className = "chip-quitar";
    quitar.textContent = "✕";
    quitar.addEventListener("click", () => {
      lista.splice(index, 1);
      pintarMediaPreview(lista, idContenedor, tipo);
    });
    item.appendChild(quitar);

    contenedor.appendChild(item);
  });
}

// ----- Guardar producto (con subida de archivos) -----
formAgregar.addEventListener("submit", async (e) => {
  e.preventDefault();

  const statusEl = document.getElementById("formStatus");
  const btnGuardar = document.getElementById("btnGuardarProducto");
  btnGuardar.disabled = true;
  statusEl.textContent = "Guardando producto...";

  const tallasTexto = document.getElementById("nuevaTallas").value.trim();
  const tallas = tallasTexto ? tallasTexto.split(",").map(t => t.trim()).filter(Boolean) : null;

  const nuevoProducto = {
    nombre: document.getElementById("nuevoNombre").value.trim(),
    categoria: document.getElementById("nuevaCategoria").value,
    precio: parseFloat(document.getElementById("nuevoPrecio").value),
    stock: parseInt(document.getElementById("nuevoStock").value),
    descripcion: document.getElementById("nuevaDescripcion").value.trim(),
    tallas,
    colores: coloresSeleccionados,
    imagenes: [],
    videos: [],
  };

  // 1. Creamos el producto primero para tener un ID
  const docRef = await addDoc(collection(db, "productos"), nuevoProducto);

  // 2. Subimos cada imagen a Storage, bajo una carpeta con el ID del producto
  const urlsImagenes = [];
  for (let i = 0; i < imagenesSeleccionadas.length; i++) {
    statusEl.textContent = `Subiendo imagen ${i + 1} de ${imagenesSeleccionadas.length}...`;
    const archivo = imagenesSeleccionadas[i];
    const refArchivo = ref(storage, `productos/${docRef.id}/imagenes/${Date.now()}-${archivo.name}`);
    await uploadBytes(refArchivo, archivo);
    const url = await getDownloadURL(refArchivo);
    urlsImagenes.push(url);
  }

  // 3. Subimos cada video igual
  const urlsVideos = [];
  for (let i = 0; i < videosSeleccionados.length; i++) {
    statusEl.textContent = `Subiendo video ${i + 1} de ${videosSeleccionados.length}...`;
    const archivo = videosSeleccionados[i];
    const refArchivo = ref(storage, `productos/${docRef.id}/videos/${Date.now()}-${archivo.name}`);
    await uploadBytes(refArchivo, archivo);
    const url = await getDownloadURL(refArchivo);
    urlsVideos.push(url);
  }

  // 4. Actualizamos el producto con las URLs ya subidas
  await updateDoc(doc(db, "productos", docRef.id), {
    imagenes: urlsImagenes,
    videos: urlsVideos,
  });

  productos.push({ id: docRef.id, ...nuevoProducto, imagenes: urlsImagenes, videos: urlsVideos });

  // Limpiar formulario
  formAgregar.reset();
  imagenesSeleccionadas = [];
  videosSeleccionados = [];
  coloresSeleccionados = [];
  pintarColores();
  pintarMediaPreview([], "previewImagenes", "imagen");
  pintarMediaPreview([], "previewVideos", "video");
  formAgregar.classList.remove("visible");

  statusEl.textContent = "¡Producto guardado con éxito!";
  btnGuardar.disabled = false;
  setTimeout(() => (statusEl.textContent = ""), 3000);

  pintarTablaStock();
  pintarNotificaciones();
  pintarResumen();
  pintarGraficas();
});

// ===== Notificaciones de bajo stock =====
function pintarNotificaciones() {
  const contenedor = document.getElementById("adminNotificaciones");
  const bajos = productos.filter(p => p.stock <= 5);

  if (bajos.length === 0) {
    contenedor.innerHTML = "";
    return;
  }

  contenedor.innerHTML = `
    <div class="admin-notif-banner">
      ⚠️ ${bajos.length} producto${bajos.length === 1 ? "" : "s"} con stock bajo:
      ${bajos.map(p => `${p.nombre} (${p.stock})`).join(", ")}
    </div>
  `;
}

// ===== Gráficas =====
let chartStock, chartVentasCategoria, chartTopVentas;

function pintarGraficas() {
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
  pedidos.forEach(pedido => {
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
  pedidos.forEach(pedido => {
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
document.getElementById("btnReporte").addEventListener("click", () => {
  const ventasPorProducto = {};
  pedidos.forEach(pedido => {
    (pedido.items || []).forEach(item => {
      ventasPorProducto[item.id] = (ventasPorProducto[item.id] || 0) + item.cantidad;
    });
  });

  const totalVentas = pedidos.reduce((acc, p) => acc + (p.subtotal || 0), 0);

  let csv = "Producto,Categoría,Precio,Stock actual,Unidades vendidas,Ingresos generados\n";
  productos.forEach(p => {
    const vendidos = ventasPorProducto[p.id] || 0;
    csv += `"${p.nombre}",${p.categoria},${p.precio},${p.stock},${vendidos},${vendidos * p.precio}\n`;
  });
  csv += `\nTotal de pedidos,${pedidos.length}\n`;
  csv += `Total vendido ($),${totalVentas}\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-mariru-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});