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
    allowedHosts: true,
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
        categorias: resolve(__dirname, "src/categorias.html"),
        pedidos: resolve(__dirname, "src/categorias.html"),
        producto: resolve(__dirname, "src/producto.html"),
        sobreMi: resolve(__dirname, "src/sobre-mi.html"),
        carrito: resolve(__dirname, "src/carrito.html"),
        admin: resolve(__dirname, "src/admin.html"),
        loginAdmin: resolve(__dirname, "src/login-admin.html"),
        seed: resolve(__dirname, "src/seed.html"),
      },
    },
  },
});
