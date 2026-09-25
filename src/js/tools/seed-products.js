import { auth, db } from "../services/firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

const productosIniciales = [
  { id: "1", nombre: "Bolsa mini rosa", categoria: "accesorios", precio: 250, stock: 20, descripcion: "Bolsa mini tipo satchel, ideal para el día a día.", tallas: null, colores: ["#b7d9ec", "#b98a8a", "#3a2a2a"], imagenes: ["/assets/productos/1.jpg"] },
  { id: "2", nombre: "Sombra de ojos glow", categoria: "maquillaje", precio: 180, stock: 20, descripcion: "Sombra de ojos con acabado brillante, larga duración.", tallas: null, colores: ["#e58aa5", "#d4af37", "#7a5c8a"], imagenes: ["/assets/productos/2.jpg"] },
  { id: "3", nombre: "Suéter oversize", categoria: "ropa", precio: 420, stock: 20, descripcion: "Suéter oversize de punto suave, corte holgado.", tallas: ["XCHI", "CH", "M", "L", "XL"], colores: ["#e58aa5", "#b7d9ec", "#3a2a2a"], imagenes: ["/assets/productos/3.jpg"] },
  { id: "4", nombre: "Broche gatito", categoria: "accesorios", precio: 90, stock: 20, descripcion: "Broche en forma de gatito, dorado con detalles.", tallas: null, colores: ["#d4af37", "#c0c0c0"], imagenes: ["/assets/productos/4.jpg"] },
  { id: "5", nombre: "Labial mate", categoria: "maquillaje", precio: 150, stock: 20, descripcion: "Labial mate de larga duración, tono versátil.", tallas: null, colores: ["#b03a4b", "#8a2c3a", "#d4708a"], imagenes: ["/assets/productos/5.jpg"] },
  { id: "6", nombre: "Falda plisada", categoria: "ropa", precio: 380, stock: 20, descripcion: "Falda plisada midi, entalla en la cintura.", tallas: ["CH", "M", "L", "XL"], colores: ["#e58aa5", "#3a2a2a"], imagenes: ["/assets/productos/6.jpg"] },
  { id: "7", nombre: "Perfume floral mini", categoria: "perfumes", precio: 220, stock: 20, descripcion: "Fragancia floral ligera, ideal para el día.", tallas: null, colores: ["#f2c6d3", "#e58aa5"], imagenes: ["/assets/productos/7.jpg"] },
  { id: "8", nombre: "Perfume ámbar", categoria: "perfumes", precio: 260, stock: 20, descripcion: "Fragancia amaderada con notas de ámbar.", tallas: null, colores: ["#a84e70", "#3a2a2a"], imagenes: ["/assets/productos/8.jpg"] },
  { id: "9", nombre: "Aretes de luna", categoria: "accesorios", precio: 120, stock: 20, descripcion: "Aretes colgantes en forma de luna creciente.", tallas: null, colores: ["#d4af37", "#c0c0c0"], imagenes: ["/assets/productos/9.jpg"] },
  { id: "10", nombre: "Blusa satinada", categoria: "ropa", precio: 340, stock: 20, descripcion: "Blusa satinada de manga larga, caída fluida.", tallas: ["CH", "M", "L"], colores: ["#e58aa5", "#b7d9ec", "#ffffff"], imagenes: ["/assets/productos/10.jpg"] },
  { id: "11", nombre: "Delineador líquido", categoria: "maquillaje", precio: 95, stock: 20, descripcion: "Delineador líquido de punta fina, resistente al agua.", tallas: null, colores: ["#3a2a2a", "#3a2a6a"], imagenes: ["/assets/productos/11.jpg"] },
  { id: "12", nombre: "Diadema de lazo", categoria: "accesorios", precio: 75, stock: 20, descripcion: "Diadema con lazo, acabado satinado.", tallas: null, colores: ["#e58aa5", "#3a2a2a", "#b7d9ec"], imagenes: ["/assets/productos/12.jpg"] },
];

const boton = document.getElementById("btnSeed");
const estado = document.getElementById("seedStatus");

boton.disabled = true;
estado.textContent = "Verificando sesión de administrador...";

onAuthStateChanged(auth, user => {
  if (!user) {
    estado.textContent = "Inicia sesión con una cuenta administradora antes de cargar el catálogo.";
    return;
  }

  boton.disabled = false;
  estado.textContent = "Sesión detectada. Puedes cargar el catálogo de prueba.";
});

boton.addEventListener("click", async () => {
  boton.disabled = true;
  estado.textContent = "Cargando productos e imágenes...";

  try {
    for (const producto of productosIniciales) {
      const { id, ...datos } = producto;
      await setDoc(doc(db, "productos", id), datos, { merge: true });
    }
    estado.textContent = "¡Listo! Productos e imágenes cargados en Firestore.";
  } catch (error) {
    console.error("No se pudo cargar el catálogo de prueba.", error);
    estado.textContent = "No se pudo cargar el catálogo. Verifica que tu cuenta tenga admin: true.";
    boton.disabled = false;
  }
});