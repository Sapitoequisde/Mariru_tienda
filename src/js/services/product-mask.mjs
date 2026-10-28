/** El modelo decide la silueta; los colores y la opacidad vienen del original. */
export function restaurarMascaraProducto(original, mascara, ancho, alto) {
  const total = ancho * alto;
  if (original.length !== total * 4 || mascara.length !== total * 4) throw new Error("Las imágenes no tienen el mismo tamaño.");
  const exterior = new Uint8Array(total);
  const cola = new Int32Array(total);
  let inicio = 0;
  let fin = 0;
  const visitar = indice => {
    if (!exterior[indice] && (mascara[indice * 4 + 3] < 32 || original[indice * 4 + 3] === 0)) {
      exterior[indice] = 1;
      cola[fin++] = indice;
    }
  };
  for (let x = 0; x < ancho; x++) { visitar(x); visitar((alto - 1) * ancho + x); }
  for (let y = 0; y < alto; y++) { visitar(y * ancho); visitar(y * ancho + ancho - 1); }
  while (inicio < fin) {
    const indice = cola[inicio++];
    const x = indice % ancho;
    if (x > 0) visitar(indice - 1);
    if (x < ancho - 1) visitar(indice + 1);
    if (indice >= ancho) visitar(indice - ancho);
    if (indice < total - ancho) visitar(indice + ancho);
  }
  const salida = new Uint8ClampedArray(original.length);
  for (let i = 0; i < total; i++) {
    if (exterior[i] || original[i * 4 + 3] === 0) continue;
    const x = i % ancho;
    const borde = x === 0 || x === ancho - 1 || i < ancho || i >= total - ancho
      || exterior[i - 1] || exterior[i + 1] || exterior[i - ancho] || exterior[i + ancho];
    salida[i * 4] = original[i * 4];
    salida[i * 4 + 1] = original[i * 4 + 1];
    salida[i * 4 + 2] = original[i * 4 + 2];
    // Solo el contorno usa suavizado. Una caja blanca no debe volverse de cristal.
    salida[i * 4 + 3] = borde
      ? Math.min(original[i * 4 + 3], Math.max(128, mascara[i * 4 + 3]))
      : original[i * 4 + 3];
  }
  return salida;
}
