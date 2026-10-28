# Productos de prueba - 25 de octubre de 2026

## Carga en Firebase

Entra al panel con una cuenta administradora y pulsa **Cargar 15 productos de prueba** en Tu inventario. La carga publica los productos y sube sus PNG transparentes y miniaturas WebP a Firebase Storage.

El boton requiere una sesion administradora. El proyecto conserva las reglas de Firestore y Storage. No se incluyen credenciales ni se modifica el inventario existente. Los IDs estables permiten reanudar una carga interrumpida: se omiten los documentos que ya existen, incluso si se editaron su precio o stock.

Los productos llevan `esPrueba: true` y `lotePrueba: mariru-demo-20261025`. Las existencias son ficticias para probar el catalogo. Los precios son referencias consultadas en MXN el 2026-10-25, no una cotizacion ni una afirmacion de disponibilidad de Mariru.

## Fuentes y precios

| Producto | Categoria | Precio MXN | Fuente |
|---|---|---:|---|
| Crossbody Cafe Madison Cady | bolsos | $249.50 | [Ficha de referencia](https://chenson.com.mx/products/crossbody-cafe-madison-cady) |
| Crossbody Café Oscuro Madison Colección Felicia | bolsos | $274.50 | [Ficha de referencia](https://chenson.com.mx/products/felicia-2) |
| Satchel Beige Madison Colección Alain | bolsos | $399.50 | [Ficha de referencia](https://chenson.com.mx/products/satchel-beige-madison-coleccion-alain-1) |
| Crossbody Negro Madison Colección Malana | bolsos | $274.50 | [Ficha de referencia](https://chenson.com.mx/products/malana-11) |
| Satchel Negro Madison Chepina | bolsos | $349.50 | [Ficha de referencia](https://chenson.com.mx/products/satchel-negro-madison-chepina) |
| Calvin Klein Eternity Parfum Hombre 100ml | perfumes | $1,270.00 | [Ficha de referencia](https://castillodefrancia.com/products/calvin-klein-eternity-parfum-hombre-100ml) |
| Yves Saint Laurent Black Opium Eau de Parfum Mujer 90ml | perfumes | $3,225.00 | [Ficha de referencia](https://castillodefrancia.com/products/yves-saint-laurent-black-opium-eau-de-parfum-mujer-90ml) |
| Versace Crystal Noir Eau de Parfum Mujer 90ml | perfumes | $1,665.00 | [Ficha de referencia](https://castillodefrancia.com/products/versace-crystal-noir-eau-de-parfum-mujer-90ml) |
| Montblanc Legend Spirit Eau de Toilette Hombre 100ml | perfumes | $1,240.00 | [Ficha de referencia](https://castillodefrancia.com/products/montblanc-legend-spirit-eau-de-toilette-hombre-100ml) |
| Burberry The Beat Eau de Toilette Hombre 100ml | perfumes | $1,030.00 | [Ficha de referencia](https://castillodefrancia.com/products/burberry-the-beat-eau-de-toilette-hombre-100ml) |
| Coraline X Beauty Creations - Labial Jelly - Welcome Home | maquillaje | $232.00 | [Ficha de referencia](https://beautycreationscosmetics.com.mx/products/coraline-x-beauty-creations-labial-jelly-welcome-home) |
| La Más Draga X Beauty Creations - Paleta de Rostro y Sombras | maquillaje | $459.00 | [Ficha de referencia](https://beautycreationscosmetics.com.mx/products/la-mas-draga-x-beauty-creations-paleta-de-sombras-multiusos) |
| Goosebumps X Beauty Creations - Aceite De Labios Y Mejillas pH - Monster Blood II | maquillaje | $90.30 | [Ficha de referencia](https://beautycreationscosmetics.com.mx/products/goosebumps-x-beauty-creations-aceite-de-labios-y-mejillas-ph-monster-blood-ii) |
| Coraline X Beauty Creations - Rubor Duo Color - Cute As A Button | maquillaje | $209.00 | [Ficha de referencia](https://beautycreationscosmetics.com.mx/products/coraline-x-beauty-creations-rubor-duo-color-cute-as-a-button) |
| Coraline X Beauty Creations - Paleta De Sombras - Beyond The Door | maquillaje | $371.00 | [Ficha de referencia](https://beautycreationscosmetics.com.mx/products/coraline-x-beauty-creations-paleta-de-sombras-beyond-the-door) |

## Imagenes y descripciones

Cada producto incluye dos fotografias distintas del mismo articulo, descargadas de las fichas de referencia. Se prepararon con el procesador de eliminacion de fondos que ya usa el panel; no se generaron representaciones ficticias de los productos. Los PNG finales estan en `public/assets/productos-prueba/`. Las descripciones se redactaron a partir de las caracteristicas de las fichas, sin copiar sus textos promocionales.

## Validacion

- `node --test tests/catalogo-prueba.test.mjs`: estructura, tres categorias, importacion, duplicados, reintentos y concurrencia.
- `npm run build`: empaquetado de datos y carga diferida del importador.
- Prueba del panel con Firebase simulado: carga de 15 documentos, 30 fotos y 30 miniaturas; segunda carga sin duplicados.
- Inspeccion de PNG: canal alfa transparente y producto visible.

Las pruebas automatizadas no escriben en Firebase real. La carga real se inicia desde el panel con la sesion administradora.
