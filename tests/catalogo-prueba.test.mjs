import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importarCatalogoPrueba, validarCatalogoPrueba } from "../src/js/pages/admin-test-catalog.mjs";

const productos = JSON.parse(await readFile(new URL("../src/data/catalogo-prueba.json", import.meta.url), "utf8"));
const almacen = () => {
  const registros = new Map();
  const subidas = [];
  return {
    registros, subidas,
    existe: async id => registros.has(id),
    subirImagen: async (id, ruta, i) => {
      subidas.push(ruta);
      return { url: `https://storage.test/${id}/${i}.png`, miniatura: `https://storage.test/${id}/${i}.webp` };
    },
    crear: async (id, datos) => {
      if (registros.has(id)) return false;
      registros.set(id, datos);
      return true;
    },
  };
};

test("15 productos reales de referencia: cinco por categoría y dos fotos diferentes", () => {
  validarCatalogoPrueba(productos);
  for (const categoria of ["bolsos", "perfumes", "maquillaje"]) {
    assert.equal(productos.filter(p => p.categoria === categoria).length, 5);
  }
  for (const producto of productos) {
    assert.equal(new Set(producto.imagenes).size, 2);
    assert.equal(producto.fuente.moneda, "MXN");
    assert.ok(producto.fuente.url.startsWith("https://"));
    assert.ok(producto.descripcion.length > 100);
  }
});

test("rechaza IDs repetidos antes de subir archivos", () => {
  const repetidos = structuredClone(productos);
  repetidos[1].id = repetidos[0].id;
  assert.throws(() => validarCatalogoPrueba(repetidos));
});

test("crea 15 registros y 30 fotos; repetir la carga conserva ediciones y stock", async () => {
  const datos = almacen();
  assert.deepEqual(await importarCatalogoPrueba({ productos, ...datos }), { creados: 15, omitidos: 0, actualizados: 0 });
  assert.equal(datos.subidas.length, 30);
  const primero = datos.registros.get(productos[0].id);
  primero.stock = 2;
  primero.precio = 300;
  assert.deepEqual(await importarCatalogoPrueba({ productos, ...datos }), { creados: 0, omitidos: 15, actualizados: 0 });
  assert.equal(datos.subidas.length, 30);
  assert.equal(primero.stock, 2);
  assert.equal(primero.precio, 300);
  assert.ok(!("imagenesOrigen" in primero));
  assert.equal(primero.miniaturas.length, 2);
});

test("reanuda una carga interrumpida sin volver a escribir los productos completos", async () => {
  const datos = almacen();
  await assert.rejects(importarCatalogoPrueba({
    productos, ...datos,
    subirImagen: async (...args) => {
      if (datos.registros.size === 5) throw new Error("Sin conexión");
      return datos.subirImagen(...args);
    },
  }));
  assert.equal(datos.registros.size, 5);
  assert.deepEqual(await importarCatalogoPrueba({ productos, ...datos }), { creados: 10, omitidos: 5, actualizados: 0 });
  assert.equal(datos.registros.size, 15);
});

test("una creación concurrente se cuenta como existente y no se reemplaza", async () => {
  const datos = almacen();
  const resultado = await importarCatalogoPrueba({ productos, ...datos, crear: async () => false });
  assert.deepEqual(resultado, { creados: 0, omitidos: 15, actualizados: 0 });
  assert.equal(datos.registros.size, 0);
});
