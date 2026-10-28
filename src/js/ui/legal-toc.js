/**
 * legal-toc.js — Índice lateral de las páginas legales.
 * Toma cada <h2> de .legal-main, le asigna un id y crea un enlace en #legalIndice.
 */
const indice = document.getElementById("legalIndice");
const titulos = document.querySelectorAll(".legal-main .legal-seccion > h2");

if (indice && titulos.length) {
  const lista = document.createElement("ol");
  titulos.forEach((titulo, i) => {
    if (!titulo.id) titulo.id = `seccion-${i + 1}`;
    const enlace = document.createElement("a");
    enlace.href = `#${titulo.id}`;
    // Los títulos ya llevan su número ("1. ..."); el índice muestra solo el texto
    enlace.textContent = titulo.textContent.replace(/^\d+\.\s*/, "");
    const item = document.createElement("li");
    item.appendChild(enlace);
    lista.appendChild(item);
  });

  const encabezado = document.createElement("p");
  encabezado.className = "legal-indice-titulo";
  encabezado.textContent = "En esta página";
  indice.replaceChildren(encabezado, lista);

  // Marca la sección visible
  const enlaces = new Map([...lista.querySelectorAll("a")].map(a => [a.hash.slice(1), a]));
  const observador = new IntersectionObserver(entradas => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      enlaces.forEach(a => a.removeAttribute("aria-current"));
      enlaces.get(entrada.target.id)?.setAttribute("aria-current", "location");
    }
  }, { rootMargin: "-20% 0px -70% 0px" });
  titulos.forEach(titulo => observador.observe(titulo));
}
