"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");

initializeApp();
const db = getFirestore();
const WHATSAPP_ACCESS_TOKEN = defineSecret("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = defineString("WHATSAPP_PHONE_NUMBER_ID");
const WHATSAPP_STORE_RECIPIENT = defineString("WHATSAPP_STORE_RECIPIENT");
const WHATSAPP_ORDER_TEMPLATE_NAME = defineString("WHATSAPP_ORDER_TEMPLATE_NAME");
const WHATSAPP_ORDER_TEMPLATE_LANGUAGE = defineString("WHATSAPP_ORDER_TEMPLATE_LANGUAGE", {
  default: "es_MX",
});
const WHATSAPP_GRAPH_API_VERSION = defineString("WHATSAPP_GRAPH_API_VERSION");
const MAX_ITEMS = 30;
const MAX_QUANTITY_PER_ORDER = 100;

function requireText(value, field, maxLength, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) {
    return "";
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `El campo ${field} no es válido.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new HttpsError("invalid-argument", `Revisa el campo ${field}.`);
  }
  return normalized;
}

const WHATSAPP_PAYMENT_METHODS = new Set(["Transferencia", "Depósito", "Efectivo"]);
const STORE_PHONE = "+52 662 238 0735";
const STORE_EMAIL = "Mariru_bazar@gmail.com";

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requireText(value, field, maxLength, true);
}

function formatHermosilloDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Hermosillo",
  }).format(date);
}

function crearReportePedido({ orderId, cliente, telefono, entrega, pago, notas, items, total, fecha }) {
  const renglonesProductos = items.map(item => {
    const opciones = [item.talla && `Talla ${item.talla}`, item.color && `Color ${item.color}`]
      .filter(Boolean)
      .join(", ");
    return `- ${item.nombre}${opciones ? ` (${opciones})` : ""} [${item.id}]: ${item.cantidad} x $${item.precio.toLocaleString("es-MX")} = $${(item.cantidad * item.precio).toLocaleString("es-MX")}`;
  });
  return [
    `PEDIDO ${orderId} - MARIRU BAZAR`,
    `Vendedor: Mariru Bazar | WhatsApp: ${STORE_PHONE} | Correo: ${STORE_EMAIL}`,
    `Fecha/hora Hermosillo: ${fecha}`,
    "Zona: Hermosillo, Sonora, México",
    `Cliente: ${cliente} | Teléfono: ${telefono}`,
    `Entrega: ${entrega || "Por acordar por WhatsApp"}`,
    `Pago elegido: ${pago}${pago === "Efectivo" ? " (coordinar por WhatsApp)" : ""}`,
    "Productos:",
    ...renglonesProductos,
    `Total productos: $${total.toLocaleString("es-MX")}`,
    `Notas: ${notas || "Sin notas"}`,
  ].join("\n");
}

async function enviarPlantillaPedido(reporte) {
  const version = WHATSAPP_GRAPH_API_VERSION.value();
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID.value();
  const destinatario = WHATSAPP_STORE_RECIPIENT.value().replace(/\D/g, "");
  const templateName = WHATSAPP_ORDER_TEMPLATE_NAME.value();
  const language = WHATSAPP_ORDER_TEMPLATE_LANGUAGE.value();

  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(phoneNumberId) ||
      !/^\d{8,15}$/.test(destinatario) || !/^[a-z0-9_]+$/.test(templateName) ||
      !/^[a-z]{2}_[A-Z]{2}$/.test(language)) {
    throw new HttpsError("failed-precondition", "La configuración de WhatsApp Business está incompleta o no es válida.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: destinatario,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: [{
            type: "body",
            parameters: [{ type: "text", text: reporte }],
          }],
        },
      }),
      signal: AbortSignal.timeout(20000),
    }
  );

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`WhatsApp API respondió con HTTP ${response.status} y una respuesta no válida.`);
  }
  const messageId = result?.messages?.[0]?.id;
  if (!response.ok || typeof messageId !== "string") {
    const apiCode = result?.error?.code;
    throw new Error(`WhatsApp API rechazó el envío (HTTP ${response.status}, código ${apiCode || "desconocido"}).`);
  }
  return messageId;
}

exports.submitWhatsAppOrder = onCall({
  region: "us-central1",
  enforceAppCheck: true,
  secrets: [WHATSAPP_ACCESS_TOKEN],
  timeoutSeconds: 60,
  maxInstances: 5,
}, async request => {
  const data = request.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "La solicitud del pedido no es válida.");
  }
  const allowedFields = new Set([
    "requestId",
    "items",
    "nombre",
    "telefono",
    "entrega",
    "pago",
    "notas",
  ]);
  if (Object.keys(data).some(key => !allowedFields.has(key))) {
    throw new HttpsError("invalid-argument", "La solicitud contiene campos no permitidos.");
  }

  const requestId = requireText(data.requestId, "requestId", 64);
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new HttpsError("invalid-argument", "La solicitud de compra no es válida.");
  }
  const nombre = requireText(data.nombre, "nombre", 120);
  const telefono = requireText(data.telefono, "teléfono", 20);
  const telefonoDigitos = telefono.replace(/\D/g, "");
  if (!/^[+0-9()\s-]+$/.test(telefono) || telefonoDigitos.length < 7 || telefonoDigitos.length > 15) {
    throw new HttpsError("invalid-argument", "Escribe un número de teléfono válido.");
  }
  const entrega = optionalText(data.entrega, "punto de entrega", 200);
  const notas = optionalText(data.notas, "notas", 500);
  const metodoPago = requireText(data.pago, "método de pago", 40);
  if (!WHATSAPP_PAYMENT_METHODS.has(metodoPago)) {
    throw new HttpsError("invalid-argument", "La forma de pago no es válida.");
  }
  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > MAX_ITEMS) {
    throw new HttpsError("invalid-argument", "El pedido está vacío o contiene demasiadas opciones de producto.");
  }

  const items = data.items.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).some(key => !new Set(["id", "cantidad", "talla"]).has(key))) {
      throw new HttpsError("invalid-argument", "Hay un producto no válido en el pedido.");
    }
    if (!Number.isSafeInteger(item.cantidad) || item.cantidad < 1) {
      throw new HttpsError("invalid-argument", "La cantidad de un producto no es válida.");
    }
    return {
      id: requireText(item.id, "producto", 150),
      cantidad: item.cantidad,
      talla: item.talla == null ? null : requireText(item.talla, "talla", 40),
    };
  });
  const cantidades = new Map();
  for (const item of items) {
    cantidades.set(item.id, (cantidades.get(item.id) || 0) + item.cantidad);
  }
  if ([...cantidades.values()].some(cantidad => cantidad > MAX_QUANTITY_PER_ORDER)) {
    throw new HttpsError("invalid-argument", "La cantidad de un producto supera el límite permitido.");
  }

  const orderRef = db.collection("pedidos").doc(requestId.toLowerCase());
  const productRefs = new Map(
    [...cantidades.keys()].map(id => [id, db.collection("productos").doc(id)])
  );
  const fecha = formatHermosilloDate(new Date());
  let reservado;

  try {
    reservado = await db.runTransaction(async transaction => {
      const previous = await transaction.get(orderRef);
      if (previous.exists) {
        const estado = previous.data().estado;
        if (estado === "Enviado a WhatsApp") {
          return { existente: true, enviado: true };
        }
        if (estado === "Enviando a WhatsApp") {
          return { existente: true, procesando: true };
        }
        throw new HttpsError(
          "already-exists",
          "Este pedido ya tuvo un intento de envío que no pudo confirmarse. Contacta a Mariru antes de volver a intentarlo."
        );
      }

      const productSnapshots = new Map();
      for (const [id, ref] of productRefs) {
        productSnapshots.set(id, await transaction.get(ref));
      }
      const productosActuales = new Map();
      for (const [id, snapshot] of productSnapshots) {
        if (!snapshot.exists) {
          throw new HttpsError("failed-precondition", "Un producto del pedido ya no está disponible.");
        }
        const producto = snapshot.data();
        const stock = Number(producto.stock);
        const precio = Number(producto.precio);
        if (!Number.isSafeInteger(stock) || stock < cantidades.get(id) ||
            !Number.isFinite(precio) || precio < 0 || precio > 10000000) {
          throw new HttpsError("failed-precondition", `No hay stock suficiente o el precio no es válido para ${producto.nombre || "un producto"}.`);
        }
        productosActuales.set(id, { ...producto, stock, precio });
      }

      const productosPedido = items.map(item => {
        const producto = productosActuales.get(item.id);
        const tallas = Array.isArray(producto.tallas) ? producto.tallas.filter(Boolean) : [];
        // Si el producto tiene tallas, la talla es obligatoria (la interfaz también la exige)
        if (tallas.length && !item.talla) {
          throw new HttpsError("invalid-argument", `Elige una talla para ${producto.nombre || "un producto"}.`);
        }
        if (item.talla && !tallas.includes(item.talla)) {
          throw new HttpsError("failed-precondition", `Las opciones de ${producto.nombre || "un producto"} ya no están disponibles.`);
        }
        return {
          ...item,
          nombre: requireText(producto.nombre, "nombre de producto", 200),
          precio: producto.precio,
        };
      });
      const total = productosPedido.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
      if (!Number.isFinite(total) || total < 0 || total > 100000000) {
        throw new HttpsError("failed-precondition", "El total del pedido no es válido.");
      }
      const reporte = crearReportePedido({
        orderId: orderRef.id,
        cliente: nombre,
        telefono,
        entrega,
        pago: metodoPago,
        notas,
        items: productosPedido,
        total,
        fecha,
      });
      if (reporte.length > 1024) {
        throw new HttpsError(
          "invalid-argument",
          "El reporte es demasiado largo para el mensaje de WhatsApp. Divide el carrito en pedidos más pequeños."
        );
      }

      for (const [id, producto] of productosActuales) {
        transaction.update(productRefs.get(id), {
          stock: producto.stock - cantidades.get(id),
        });
      }
      transaction.create(orderRef, {
        items: productosPedido,
        subtotal: total,
        total,
        totalItems: productosPedido.reduce((suma, item) => suma + item.cantidad, 0),
        metodoPago,
        nombre,
        telefono,
        entrega,
        notas,
        estado: "Enviando a WhatsApp",
        fecha: FieldValue.serverTimestamp(),
        creadoEn: FieldValue.serverTimestamp(),
        zona: "Hermosillo, Sonora, México",
        // Con sesión, el pedido queda en "Mis pedidos" (reglas: lectura solo del dueño). Sin sesión, es pedido de invitado.
        ...(request.auth ? {
          usuario: {
            uid: request.auth.uid,
            email: request.auth.token.email || "",
          },
        } : {}),
      });
      return { existente: false, reporte, cantidades: Object.fromEntries(cantidades) };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("No se pudo preparar el pedido para WhatsApp.", error);
    throw new HttpsError("internal", "No se pudo preparar el pedido. Inténtalo de nuevo.");
  }

  if (reservado.existente) {
    return {
      sent: reservado.enviado === true,
      processing: reservado.procesando === true,
      repeated: true,
      orderId: orderRef.id,
    };
  }

  let whatsappMessageId;
  try {
    whatsappMessageId = await enviarPlantillaPedido(reservado.reporte);
  } catch (error) {
    console.error("Falló el envío del reporte de pedido a WhatsApp.", error);
    try {
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists || snapshot.data().estado !== "Enviando a WhatsApp") return;
        const refs = new Map(
          Object.keys(reservado.cantidades).map(id => [id, db.collection("productos").doc(id)])
        );
        const productSnapshots = new Map();
        for (const [id, ref] of refs) {
          productSnapshots.set(id, await transaction.get(ref));
        }
        for (const [id, productSnapshot] of productSnapshots) {
          if (!productSnapshot.exists) continue;
          const stockActual = Number(productSnapshot.data().stock);
          if (Number.isSafeInteger(stockActual)) {
            transaction.update(refs.get(id), {
              stock: stockActual + reservado.cantidades[id],
            });
          }
        }
        transaction.update(orderRef, {
          estado: "Error de envío a WhatsApp",
          errorEnvio: "El envío no se pudo confirmar. Revisar en Meta antes de reenviar.",
          actualizadoEn: FieldValue.serverTimestamp(),
        });
      });
    } catch (rollbackError) {
      console.error("No se pudo restaurar el inventario tras un fallo de WhatsApp.", rollbackError);
    }
    throw new HttpsError(
      "unavailable",
      "No se pudo confirmar el envío del pedido a WhatsApp. Contacta a Mariru antes de volver a intentarlo."
    );
  }

  try {
    await orderRef.update({
      estado: "Enviado a WhatsApp",
      whatsappMessageId,
      enviadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("WhatsApp aceptó el envío, pero no se pudo guardar el estado del pedido.", error);
    throw new HttpsError(
      "internal",
      `WhatsApp aceptó el envío del pedido ${orderRef.id}, pero no se pudo actualizar su estado. Contacta a Mariru antes de reintentar.`
    );
  }
  return { sent: true, repeated: false, orderId: orderRef.id };
});
