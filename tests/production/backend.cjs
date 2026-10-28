/* Reproducible contract tests. No Firebase/Meta network connections or real writes. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'reports/full-test-2026-10-25');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

function sandbox() {
  const docs = new Map();
  let failSend = false, failFinal = false, failRollback = false, sent = 0;
  let tail = Promise.resolve();
  const ref = p => ({ path: p, id: p.split('/').at(-1), async update(data) {
    if (failFinal && data.estado === 'Enviado a WhatsApp') throw Error('Simulated final-state failure');
    Object.assign(docs.get(p), structuredClone(data));
  } });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction(fn) {
    // Serialize transactions as an atomic in-memory model; not a Firestore emulator.
    const run = tail.then(async () => {
      const writes = [];
      const result = await fn({
        get: async r => ({ exists: docs.has(r.path), data: () => structuredClone(docs.get(r.path)) }),
        update: (r, value) => writes.push(['update', r.path, value]),
        create: (r, value) => writes.push(['create', r.path, value]),
      });
      if (failRollback && writes.some(([, , data]) => data.estado === 'Error de envío a WhatsApp')) throw Error('Simulated rollback failure');
      for (const [type, p, value] of writes) {
        if (type === 'create') docs.set(p, structuredClone(value));
        else Object.assign(docs.get(p), structuredClone(value));
      }
      return result;
    });
    tail = run.catch(() => {});
    return run;
  } };
  const params = {
    WHATSAPP_ACCESS_TOKEN: 'SIMULATION_ONLY', WHATSAPP_PHONE_NUMBER_ID: '12345678',
    WHATSAPP_STORE_RECIPIENT: '526621234567', WHATSAPP_ORDER_TEMPLATE_NAME: 'mariru_nuevo_pedido',
    WHATSAPP_ORDER_TEMPLATE_LANGUAGE: 'es_MX', WHATSAPP_GRAPH_API_VERSION: 'v25.0',
  };
  const modules = {
    'node:crypto': crypto,
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => ({ testTimestamp: true }) } },
    'firebase-functions/v2/https': { HttpsError, onCall: (options, handler) => ({ options: handler ? options : {}, handler: handler || options }) },
    'firebase-functions/params': { defineSecret: name => ({ value: () => params[name] }), defineString: name => ({ value: () => params[name] }) },
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8'), {
    require: name => { if (!modules[name]) throw Error(`Unexpected dependency: ${name}`); return modules[name]; },
    exports, Map, Set, Number, Date, Intl, AbortSignal, console: { error() {} },
    fetch: async () => {
      if (failSend) throw Error('Simulated Meta failure');
      sent++;
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: `sim-${sent}` }] }) };
    },
  });
  docs.set('productos/p1', { nombre: 'Blusa de prueba', precio: 100, stock: 5, tallas: ['M'], categoria: 'ropa', imagenes: [] });
  return { docs, exports, params, set failSend(v) { failSend = v; }, set failFinal(v) { failFinal = v; }, set failRollback(v) { failRollback = v; }, get sent() { return sent; } };
}
const body = () => ({ requestId: crypto.randomUUID(), nombre: 'Cliente QA', telefono: '6621234567', entrega: '', pago: 'Transferencia', notas: '', items: [{ id: 'p1', cantidad: 1, talla: 'M' }] });
const invoke = (s, data, auth) => s.exports.submitWhatsAppOrder.handler({ data, auth });
const rejectsCode = (fn, code) => assert.rejects(fn, error => error.code === code);
async function test(id, title, fn, pending = null) {
  try { await fn(sandbox()); results.push({ id, title, status: 'PASS', environment: 'SIMULATED_BACKEND' }); }
  catch (error) { results.push({ id, title, status: 'FAIL', environment: 'SIMULATED_BACKEND', pending, detail: String(error.message).slice(0, 650) }); }
}

(async () => {
  await test('B01', 'App Check enforced on current callable', s => assert.equal(s.exports.submitWhatsAppOrder.options.enforceAppCheck, true));
  await test('B02', 'Invalid request body rejected', s => rejectsCode(() => invoke(s, null), 'invalid-argument'));
  await test('B03', 'Unknown request fields rejected', s => rejectsCode(() => invoke(s, { ...body(), admin: true }), 'invalid-argument'));
  await test('B04', 'Invalid request ID rejected', s => rejectsCode(() => invoke(s, { ...body(), requestId: 'bad' }), 'invalid-argument'));
  await test('B05', 'Empty customer name rejected', s => rejectsCode(() => invoke(s, { ...body(), nombre: ' ' }), 'invalid-argument'));
  await test('B06', 'Invalid phone rejected', s => rejectsCode(() => invoke(s, { ...body(), telefono: 'abc' }), 'invalid-argument'));
  await test('B07', 'Invalid payment rejected', s => rejectsCode(() => invoke(s, { ...body(), pago: 'Tarjeta' }), 'invalid-argument'));
  await test('B08', 'Empty cart rejected', s => rejectsCode(() => invoke(s, { ...body(), items: [] }), 'invalid-argument'));
  await test('B09', 'Zero quantity rejected', s => rejectsCode(() => invoke(s, { ...body(), items: [{ id: 'p1', cantidad: 0 }] }), 'invalid-argument'));
  await test('B10', 'Fractional quantity rejected', s => rejectsCode(() => invoke(s, { ...body(), items: [{ id: 'p1', cantidad: 1.5 }] }), 'invalid-argument'));
  await test('B11', 'Client supplied price rejected', s => rejectsCode(() => invoke(s, { ...body(), items: [{ id: 'p1', cantidad: 1, precio: 1 }] }), 'invalid-argument'));
  await test('B12', 'Missing product rejected', s => rejectsCode(() => invoke(s, { ...body(), items: [{ id: 'missing', cantidad: 1 }] }), 'failed-precondition'));
  await test('B13', 'Insufficient stock rejected without reservation', async s => {
    const data = body(); data.items[0].cantidad = 6;
    await rejectsCode(() => invoke(s, data), 'failed-precondition'); assert.equal(s.docs.get('productos/p1').stock, 5);
  });
  await test('B14', 'Invalid size rejected', s => rejectsCode(() => invoke(s, { ...body(), items: [{ id: 'p1', cantidad: 1, talla: 'XXL' }] }), 'failed-precondition'));
  await test('B15', 'A product with sizes requires a size', s => rejectsCode(() => invoke(s, { ...body(), items: [{ id: 'p1', cantidad: 1, talla: null }] }), 'failed-precondition'), 'P08');
  await test('B16', 'Negative price rejected', s => { s.docs.get('productos/p1').precio = -1; return rejectsCode(() => invoke(s, body()), 'failed-precondition'); });
  await test('B17', 'Valid guest request uses authoritative price and reserves once', async s => {
    const data = body(); const response = await invoke(s, data);
    assert.equal(response.sent, true); assert.equal(s.docs.get(`pedidos/${data.requestId}`).total, 100); assert.equal(s.docs.get('productos/p1').stock, 4);
  });
  await test('B18', 'Duplicate cart lines aggregate inventory correctly', async s => {
    const data = body(); data.items.push({ ...data.items[0], cantidad: 2 });
    await invoke(s, data); assert.equal(s.docs.get('productos/p1').stock, 2); assert.equal(s.docs.get(`pedidos/${data.requestId}`).total, 300);
  });
  await test('B19', 'Replay is idempotent and does not resend', async s => {
    const data = body(); await invoke(s, data); const response = await invoke(s, data);
    assert.equal(response.repeated, true); assert.equal(s.sent, 1); assert.equal(s.docs.get('productos/p1').stock, 4);
  });
  await test('B20', 'Authenticated order can appear in customer history', async s => {
    const data = body(); await invoke(s, data, { uid: 'qa-customer', token: { email: 'qa@example.test' } });
    assert.equal(s.docs.get(`pedidos/${data.requestId}`).usuario?.uid, 'qa-customer');
  }, 'P03');
  await test('B21', 'Meta failure restores stock and records failure', async s => {
    s.failSend = true; const data = body(); await rejectsCode(() => invoke(s, data), 'unavailable');
    assert.equal(s.docs.get('productos/p1').stock, 5); assert.equal(s.docs.get(`pedidos/${data.requestId}`).estado, 'Error de envío a WhatsApp');
  });
  await test('B22', 'A failed submission is not counted as a sale', async s => {
    s.failSend = true; const data = body(); await rejectsCode(() => invoke(s, data), 'unavailable');
    const nodes = new Map();
    const source = fs.readFileSync(path.join(ROOT, 'src/js/pages/admin.js'), 'utf8');
    const code = source.slice(source.indexOf('function pintarResumen()'), source.indexOf('// ===== Tabla de stock'));
    vm.runInNewContext(`${code}; pintarResumen();`, {
      pedidos: [s.docs.get(`pedidos/${data.requestId}`)], productos: [],
      document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } },
      Intl, Date, Number,
    });
    assert.equal(nodes.get('resumenVentas').textContent, '$0');
  }, 'P04');
  await test('B23', 'Replay recovers after Meta accepted but final state update failed', async s => {
    s.failFinal = true; const data = body(); await rejectsCode(() => invoke(s, data), 'internal'); s.failFinal = false;
    const response = await invoke(s, data); assert.equal(response.sent, true);
  }, 'P06');
  await test('B24', 'Failed compensation can be resolved by replay', async s => {
    s.failSend = true; s.failRollback = true; const data = body(); await rejectsCode(() => invoke(s, data), 'unavailable');
    s.failSend = false; s.failRollback = false; const response = await invoke(s, data); assert.equal(response.sent, true);
  }, 'P06');
  await test('B25', 'Two simultaneous requests do not oversell final unit (serialized model)', async s => {
    s.docs.get('productos/p1').stock = 1;
    const responses = await Promise.allSettled([invoke(s, body()), invoke(s, body())]);
    assert.equal(responses.filter(r => r.status === 'fulfilled').length, 1); assert.equal(s.docs.get('productos/p1').stock, 0);
  });
  await test('B26', 'Long report is rejected before reserving stock', async s => {
    const data = body(); data.notas = 'n'.repeat(500); data.entrega = 'e'.repeat(200);
    await rejectsCode(() => invoke(s, data), 'invalid-argument'); assert.equal(s.docs.get('productos/p1').stock, 5);
  });
  await test('B27', 'Legacy callable rejects unauthenticated use', s => rejectsCode(() => s.exports.placeOrder.handler({ data: {} }), 'unauthenticated'));
  await test('B28', 'Legacy endpoint enforces the same App Check policy', s => assert.equal(s.exports.placeOrder.options.enforceAppCheck, true), 'P02');
  await test('B29', 'Legacy endpoint follows delivery by agreement without automatic fee', async s => {
    const data = { requestId: crypto.randomUUID(), nombre: 'QA', telefono: '6621234567', direccion: 'Hermosillo', metodoPago: 'Transferencia', notas: '', items: [{ id: 'p1', cantidad: 1, talla: 'M' }] };
    await s.exports.placeOrder.handler({ auth: { uid: 'qa', token: {} }, data });
    const order = [...s.docs.entries()].find(([key]) => key.startsWith('pedidos/'))[1]; assert.equal(order.total, 100);
  }, 'P02');
  await test('B30', 'Quantity above per-product limit rejected', s => rejectsCode(() => invoke(s, { ...body(), items: [{ id: 'p1', cantidad: 101, talla: 'M' }] }), 'invalid-argument'));
  const inventory = await import(pathToFileURL(path.join(ROOT, 'src/js/pages/admin-inventory.mjs')).href);
  await test('B31', 'Inventory search normalizes accents', () => assert.equal(inventory.filtrarInventario([{ nombre: 'Ámbar', stock: 1 }], { busqueda: 'ambar' }).length, 1));
  await test('B32', 'Stock validation rejects empty, fractional, negative and infinite values', () => {
    for (const value of ['', ' ', '-1', '1.2', 'Infinity', 'text']) assert.equal(inventory.esStockValido(value), false);
    for (const value of ['0', '2']) assert.equal(inventory.esStockValido(value), true);
  });
  fs.writeFileSync(path.join(OUT, 'backend-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ suite: 'backend', passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, failures: results.filter(r => r.status === 'FAIL').map(r => ({ id: r.id, pending: r.pending, title: r.title })) }, null, 2));
  process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 2; });
