const { defineConfig } = require("vite");
const tailwindcss = require("@tailwindcss/vite").default;
const { resolve } = require("node:path");

module.exports = defineConfig({
  root: "src",
  envDir: __dirname,
  base: process.env.GITHUB_ACTIONS ? "/Mariru_tienda/" : "/",
  publicDir: "../public",
  plugins: [tailwindcss()],
  server: {
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/index.html"),
        inicio: resolve(__dirname, "src/inicio.html"),
        pedidos: resolve(__dirname, "src/pedidos.html"),
        // Redirección de la dirección antigua de "Mis pedidos"
        categorias: resolve(__dirname, "src/categorias.html"),
        producto: resolve(__dirname, "src/producto.html"),
        sobreMi: resolve(__dirname, "src/sobre-mi.html"),
        carrito: resolve(__dirname, "src/carrito.html"),
        admin: resolve(__dirname, "src/admin.html"),
        terminos: resolve(__dirname, "src/terminos.html"),
        privacidad: resolve(__dirname, "src/privacidad.html"),
        cookies: resolve(__dirname, "src/cookies.html"),
        envios: resolve(__dirname, "src/envios.html"),
        contacto: resolve(__dirname, "src/contacto.html"),
        cuenta: resolve(__dirname, "src/cuenta.html"),
      },
    },
  },
});
