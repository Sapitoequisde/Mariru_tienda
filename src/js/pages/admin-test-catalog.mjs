import { necesitaReparacionMedios } from "../services/demo-media.mjs";

/** Importación reanudable: conserva los datos y permite reparar únicamente fotos v1. */
export function validarCatalogoPrueba(productos) {
  if (!Array.isArray(productos) || productos.length !== 15) throw new Error("El lote debe contener 15 productos.");
  const ids = new Set();
  for (const producto of productos) {
    if (!/^mariru-demo-20261025-\d{2}$/.test(producto.id) || ids.has(producto.id)
      || !producto.nombre || !producto.descripcion || producto.esPrueba !== true
      || !Number.isFinite(producto.precio) || producto.precio <= 0
      || !Number.isSafeInteger(producto.stock) || producto.stock < 0
      || !Array.isArray(producto.imagenes) || producto.imagenes.length < 2
      || producto.imagenes.some(ruta => !/^assets\/productos-prueba\/prueba-\d{2}-\d(?:-v2)?\.png$/.test(ruta))) {
      throw new Error("El lote tiene un producto o una imagen no válidos.");
    }
    ids.add(producto.id);
  }
}

export async function importarCatalogoPrueba({ productos, existe, subirImagen, crear, actualizarImagenes, progreso = () => {} }) {
  validarCatalogoPrueba(productos);
  let creados = 0;
  let omitidos = 0;
  let actualizados = 0;
  for (const [indice, producto] of productos.entries()) {
    progreso(`Producto ${indice + 1} de ${productos.length}: ${producto.nombre}`);
    const actual = await existe(producto.id);
    const reparar = actualizarImagenes && necesitaReparacionMedios(actual, producto);
    if (actual && !reparar) { omitidos++; continue; }
    const imagenes = [];
    const miniaturas = [];
    for (const [i, ruta] of producto.imagenes.entries()) {
      const medio = await subirImagen(producto.id, ruta, i);
      imagenes.push(medio.url);
      miniaturas.push(medio.miniatura);
    }
    const { id, imagenesOrigen, ...datos } = producto;
    if (reparar) {
      const actualizado = await actualizarImagenes(id, { imagenes, miniaturas, revisionImagenes: producto.revisionImagenes }, actual);
      if (actualizado) actualizados++;
      else omitidos++;
      continue;
    }
    const creado = await crear(id, { ...datos, imagenes, miniaturas });
    if (creado) creados++;
    else omitidos++;
  }
  return { creados, omitidos, actualizados };
}
