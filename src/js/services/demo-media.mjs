/** Reconoce exclusivamente las dos fotos originales del lote, no las ediciones del panel. */
export function esMedioDemoOriginal(url, id) {
  try {
    return decodeURIComponent(String(url)).includes(`productos/${id}/pruebas-v1/foto-`);
  } catch { return false; }
}

export function necesitaReparacionMedios(actual, referencia) {
  return actual?.esPrueba === true && actual.lotePrueba === referencia.lotePrueba
    && Number(actual.revisionImagenes || 1) < Number(referencia.revisionImagenes || 1)
    && actual.imagenes?.length === 2 && actual.imagenes.every(url => esMedioDemoOriginal(url, referencia.id));
}

/** Compatibilidad de los documentos v1 con las fotografías corregidas de la aplicación. */
export function resolverMediosDemo(producto, catalogo, base = "/") {
  const referencia = catalogo.find(item => item.id === producto.id);
  if (!referencia || !necesitaReparacionMedios(producto, referencia)) return producto;
  const orden = producto.imagenes.map(url => Number(decodeURIComponent(url).match(/foto-(\d+)\.png/)?.[1]) - 1);
  if (orden.some(indice => indice !== 0 && indice !== 1)) return producto;
  return {
    ...producto,
    imagenes: orden.map(indice => `${base}${referencia.imagenes[indice]}`),
    miniaturas: orden.map(indice => `${base}${referencia.imagenes[indice].replace(/\.png$/, "-mini.webp")}`),
  };
}
