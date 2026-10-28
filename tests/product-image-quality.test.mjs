import test from "node:test";
import assert from "node:assert/strict";
import { restaurarMascaraProducto } from "../src/js/services/product-mask.mjs";
import { resolverMediosDemo } from "../src/js/services/demo-media.mjs";
import { importarCatalogoPrueba } from "../src/js/pages/admin-test-catalog.mjs";
import { readFile } from "node:fs/promises";

const lote = JSON.parse(await readFile(new URL("../src/data/catalogo-prueba.json", import.meta.url), "utf8"));
const referencia = lote[8];
const antiguo = {
  ...referencia, revisionImagenes: 1, precio: 123, stock: 2,
  imagenes: [1, 2].map(i => `https://storage.test/productos/${referencia.id}/pruebas-v1/foto-${i}.png`),
};
function fixture() {
  const original = new Uint8ClampedArray(7 * 7 * 4).fill(255);
  const mascara = new Uint8ClampedArray(original.length);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) mascara[(y * 7 + x) * 4 + 3] = 90;
  return { original, mascara };
}
test("el interior blanco conserva opacidad y color; solo se elimina el fondo", () => {
  const { original, mascara } = fixture();
  const salida = restaurarMascaraProducto(original, mascara, 7, 7);
  assert.deepEqual([...salida.slice((3 * 7 + 3) * 4, (3 * 7 + 3) * 4 + 4)], [255, 255, 255, 255]);
  assert.equal(salida[3], 0);
  assert.ok(salida[(1 * 7 + 1) * 4 + 3] >= 128);
});
test("rellena los agujeros falsos de la máscara dentro de un producto opaco", () => {
  const { original, mascara } = fixture();
  mascara[(3 * 7 + 3) * 4 + 3] = 0;
  const salida = restaurarMascaraProducto(original, mascara, 7, 7);
  assert.equal(salida[(3 * 7 + 3) * 4 + 3], 255);
});
test("conserva una transparencia que sí existe en la fotografía original", () => {
  const { original, mascara } = fixture();
  original[(3 * 7 + 3) * 4 + 3] = 150;
  assert.equal(restaurarMascaraProducto(original, mascara, 7, 7)[(3 * 7 + 3) * 4 + 3], 150);
});
test("las fotos v1 ya cargadas muestran la corrección sin cambiar precio o stock", () => {
  const salida = resolverMediosDemo(antiguo, lote, "/tienda/");
  assert.ok(salida.imagenes[0].endsWith("prueba-09-1-v2.png"));
  assert.ok(salida.miniaturas[0].endsWith("prueba-09-1-v2-mini.webp"));
  assert.equal(salida.precio, 123);
  assert.equal(salida.stock, 2);
  assert.equal(antiguo.revisionImagenes, 1);
});
test("respeta fotos subidas por el administrador y documentos que ya están corregidos", () => {
  const editado = { ...antiguo, imagenes: ["https://storage.test/subida-manual.png"] };
  assert.equal(resolverMediosDemo(editado, lote), editado);
  const actualizado = { ...antiguo, revisionImagenes: 2 };
  assert.equal(resolverMediosDemo(actualizado, lote), actualizado);
});
test("la actualización en Firebase modifica únicamente imágenes y su versión", async () => {
  let cambios;
  const resultado = await importarCatalogoPrueba({
    productos: lote,
    existe: async id => id === referencia.id ? antiguo : true,
    subirImagen: async (_id, _ruta, indice) => ({ url: `foto-${indice}`, miniatura: `mini-${indice}` }),
    crear: async () => { throw new Error("No debe crear documentos"); },
    actualizarImagenes: async (_id, datos) => { cambios = datos; return true; },
  });
  assert.deepEqual(Object.keys(cambios).sort(), ["imagenes", "miniaturas", "revisionImagenes"]);
  assert.equal(resultado.actualizados, 1);
  assert.equal(resultado.omitidos, 14);
});
