const normalizar = valor => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

export function filtrarInventario(productos, { busqueda = "", categoria = "", stock = "", orden = "nombre" } = {}) {
  const texto = normalizar(busqueda.trim());
  return productos.filter(producto => {
    const unidades = Number(producto.stock || 0);
    return (!texto || normalizar(`${producto.nombre} ${producto.descripcion || ""}`).includes(texto))
      && (!categoria || producto.categoria === categoria)
      && (!stock || (stock === "bajo" && unidades > 0 && unidades <= 5)
        || (stock === "agotado" && unidades <= 0)
        || (stock === "disponible" && unidades > 0));
  }).sort((a, b) => {
    const diferencia = orden === "stock" ? Number(a.stock || 0) - Number(b.stock || 0)
      : orden === "precio" ? Number(a.precio || 0) - Number(b.precio || 0) : 0;
    return diferencia || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
}

export function esStockValido(valor) {
  return String(valor).trim() !== "" && Number.isSafeInteger(Number(valor)) && Number(valor) >= 0;
}
