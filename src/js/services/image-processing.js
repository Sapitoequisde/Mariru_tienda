/**
 * image-processing.js — Quita el fondo de las fotos de producto y las convierte a PNG.
 *
 * - Usa @imgly/background-removal (licencia AGPL-3.0) en el navegador: la foto no sale
 *   del equipo para procesarse. El modelo (~40 MB) se descarga de staticimgly.com la
 *   primera vez y el navegador lo guarda en caché.
 * - La librería se importa solo cuando se necesita, para no hacer más lento el panel.
 */

import { restaurarMascaraProducto } from "./product-mask.mjs";

let libreria = null;

function cargarLibreria() {
  libreria ??= import("@imgly/background-removal");
  return libreria;
}

/** "foto playa.JPG" → "foto playa.png" */
export function nombrePng(nombre) {
  const base = String(nombre || "imagen").replace(/\.[^.]+$/, "") || "imagen";
  return `${base}.png`;
}

/**
 * Devuelve un File PNG con fondo transparente.
 * onProgreso(texto) recibe mensajes legibles mientras se descarga el modelo.
 */
export async function quitarFondo(archivo, onProgreso = () => {}) {
  const { removeBackground } = await cargarLibreria();
  const blob = await removeBackground(archivo, {
    model: "isnet_fp16",
    output: { format: "image/png", quality: 1 },
    progress: (clave, actual, total) => {
      if (clave.startsWith("fetch") && total > 0) {
        onProgreso(`Descargando el modelo para quitar fondos (${Math.round((actual / total) * 100)} %)… solo la primera vez.`);
      }
    },
  });
  return restaurarOpacidadProducto(archivo, blob);
}

/** Reutiliza un recorte sin volver a ejecutar el modelo ni degradar el original. */
export async function restaurarOpacidadProducto(original, recorte) {
  const [imagen, mascara] = await Promise.all([createImageBitmap(original), createImageBitmap(recorte)]);
  const canvas = document.createElement("canvas");
  canvas.width = imagen.width;
  canvas.height = imagen.height;
  const contexto = canvas.getContext("2d", { willReadFrequently: true });
  contexto.drawImage(imagen, 0, 0);
  const datosOriginales = contexto.getImageData(0, 0, canvas.width, canvas.height);
  contexto.clearRect(0, 0, canvas.width, canvas.height);
  contexto.drawImage(mascara, 0, 0, canvas.width, canvas.height);
  const datosMascara = contexto.getImageData(0, 0, canvas.width, canvas.height);
  imagen.close();
  mascara.close();
  const datos = restaurarMascaraProducto(datosOriginales.data, datosMascara.data, canvas.width, canvas.height);
  contexto.putImageData(new ImageData(datos, canvas.width, canvas.height), 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    resultado => resultado ? resolve(resultado) : reject(new Error("No se pudo preparar la imagen.")), "image/png",
  ));
  return new File([blob], nombrePng(original.name), { type: "image/png" });
}

/**
 * Miniatura WebP (conserva la transparencia) de hasta `lado` px para el catálogo:
 * pesa una fracción del PNG original y es la que se descarga en las tarjetas.
 */
export async function crearMiniatura(archivo, lado = 640) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No se pudo crear la miniatura."))), "image/webp", 0.85);
  });
  const base = String(archivo.name || "imagen").replace(/\.[^.]+$/, "") || "imagen";
  return new File([blob], `${base}-mini.webp`, { type: blob.type || "image/webp" });
}

/** Convierte cualquier imagen a PNG sin quitar el fondo (respaldo si falla el recorte). */
export async function convertirAPng(archivo) {
  const bitmap = await createImageBitmap(archivo);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("No se pudo convertir la imagen a PNG."))), "image/png");
  });
  return new File([blob], nombrePng(archivo.name), { type: "image/png" });
}
