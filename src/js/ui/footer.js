/**
 * footer.js — Inyecta el footer global: marca, contacto y enlaces (compra, ayuda y legales).
 * Se usa en todas las páginas con id="siteFooter".
 */

const SVG_WHATSAPP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.5 4.1 1.6 5.9L.2 24l6.5-1.7a11.8 11.8 0 0 0 5.4 1.3h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.3-6.1-3.5-8.3Zm-8.3 18.1h-.1a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.9 1 1-3.8-.3-.4a9.8 9.8 0 1 1 8.7 4.8Zm5.4-7.3c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.8-1.6.1-.2.1-.4 0-.6-.1-.2-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.4 5.4 4.8 2 .9 2.8 1 3.8.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3Z"/></svg>`;

const SVG_INSTAGRAM = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5ZM17.5 6a1.25 1.25 0 1 1-1.25 1.25A1.25 1.25 0 0 1 17.5 6Z"/></svg>`;

const GRUPOS = [
  {
    titulo: "Compra",
    enlaces: [
      ["inicio.html", "Catálogo"],
      ["sobre-mi.html", "Cómo comprar"],
      ["carrito.html", "Mi carrito"],
      ["cuenta.html", "Mi cuenta"],
    ],
  },
  {
    titulo: "Ayuda",
    enlaces: [
      ["contacto.html", "Contacto"],
      ["envios.html", "Envíos y devoluciones"],
    ],
  },
  {
    titulo: "Legal",
    enlaces: [
      ["terminos.html", "Términos y condiciones"],
      ["privacidad.html", "Aviso de privacidad"],
      ["cookies.html", "Política de cookies"],
    ],
  },
];

export function inyectarFooter() {
  const footer = document.getElementById("siteFooter");
  if (!footer) return;

  const paginaActual = window.location.pathname.split("/").pop() || "index.html";
  const enlace = ([href, texto]) =>
    `<li><a href="${href}"${href === paginaActual ? ' aria-current="page"' : ""}>${texto}</a></li>`;

  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-marca">
        <a href="inicio.html" class="footer-logo" aria-label="Mariru Bazar, ir al inicio">
          <img src="/assets/logo-mariru.webp" alt="" width="56" height="56" loading="lazy">
          <span>Mariru Bazar</span>
        </a>
        <p class="footer-descripcion">Hallazgos de ropa, accesorios, maquillaje y perfumes elegidos por Mariru. Ventas y entregas solo en Hermosillo, Sonora.</p>
        <div class="footer-redes">
          <a class="footer-whatsapp" href="https://wa.me/526622380735" target="_blank" rel="noreferrer">
            ${SVG_WHATSAPP}<span>Escribir por WhatsApp</span>
          </a>
          <a class="footer-red" href="https://www.instagram.com/mariru.bazarr" target="_blank" rel="noreferrer" aria-label="Instagram de Mariru Bazar">
            ${SVG_INSTAGRAM}
          </a>
        </div>
      </div>
      ${GRUPOS.map(grupo => `
        <nav class="footer-grupo" aria-label="${grupo.titulo}">
          <h2 class="footer-grupo-titulo">${grupo.titulo}</h2>
          <ul>${grupo.enlaces.map(enlace).join("")}</ul>
        </nav>`).join("")}
    </div>
    <div class="footer-base">
      <p>&copy; ${new Date().getFullYear()} Mariru Bazar. Todos los derechos reservados.</p>
      <p>Sin pagos en línea: el pago y la entrega se acuerdan con Mariru por WhatsApp.</p>
    </div>
  `;
}
