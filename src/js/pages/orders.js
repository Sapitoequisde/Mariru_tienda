import { auth, db } from "../services/firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";

const estado = document.getElementById("pedidosEstado");
const lista = document.getElementById("pedidosLista");

function escapar(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatoFecha(fecha) {
  if (!fecha?.toDate) return "Fecha pendiente";
  return fecha.toDate().toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function mostrarAcceso() {
  estado.innerHTML = `
    <div class="pedidos-vacio">
      <span class="pedidos-vacio-icono">♡</span>
      <h2>Inicia sesión para ver tus pedidos</h2>
      <p>Tus compras se guardan en tu cuenta para que puedas consultarlas cuando quieras.</p>
      <a class="pedidos-login" href="inicio.html?login=1">Iniciar sesión</a>
    </div>
  `;
  lista.innerHTML = "";
}

function mostrarPedidos(pedidos) {
  estado.innerHTML = "";

  if (pedidos.length === 0) {
    lista.innerHTML = `
      <div class="pedidos-vacio">
        <span class="pedidos-vacio-icono">✦</span>
        <h2>Aún no tienes pedidos</h2>
        <p>Cuando realices una compra, aparecerá aquí su resumen.</p>
        <a class="pedidos-login" href="inicio.html">Explorar productos</a>
      </div>
    `;
    return;
  }

  lista.innerHTML = pedidos.map((pedido, index) => {
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    const cantidad = items.reduce((total, item) => total + Number(item.cantidad || 0), 0);
    const numero = pedidos.length - index;
    return `
      <article class="pedido-card">
        <header class="pedido-card-header">
          <div>
            <span class="pedido-label">Pedido #${numero}</span>
            <strong>${escapar(formatoFecha(pedido.fecha))}</strong>
          </div>
          <span class="pedido-estado">Registrado</span>
        </header>
        <div class="pedido-card-items">
          ${items.map(item => `
            <div class="pedido-producto">
              <span>${escapar(item.nombre || "Producto")}</span>
              <span>${Number(item.cantidad || 0)} × $${Number(item.precio || 0).toLocaleString("es-MX")}</span>
            </div>
          `).join("")}
        </div>
        <footer class="pedido-card-footer">
          <span>${cantidad} ${cantidad === 1 ? "artículo" : "artículos"}</span>
          <strong>Total: $${Number(pedido.subtotal || 0).toLocaleString("es-MX")}</strong>
        </footer>
      </article>
    `;
  }).join("");
}

async function cargarPedidos(user) {
  try {
    const pedidosQuery = query(
      collection(db, "pedidos"),
      where("usuario.uid", "==", user.uid),
    );
    const snapshot = await getDocs(pedidosQuery);
    const pedidos = snapshot.docs
      .map(documento => ({ id: documento.id, ...documento.data() }))
      .sort((a, b) => (b.fecha?.toMillis?.() || 0) - (a.fecha?.toMillis?.() || 0));
    mostrarPedidos(pedidos);
  } catch (error) {
    console.error("No se pudieron cargar los pedidos del usuario.", error);
    estado.innerHTML = `
      <div class="pedidos-vacio">
        <h2>No se pudieron cargar tus pedidos</h2>
        <p>Intenta actualizar la página nuevamente.</p>
      </div>
    `;
  }
}

onAuthStateChanged(auth, user => {
  if (!user) {
    mostrarAcceso();
    return;
  }
  estado.innerHTML = "<p>Cargando tus pedidos...</p>";
  cargarPedidos(user);
});
