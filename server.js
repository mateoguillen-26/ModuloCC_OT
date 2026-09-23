const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const { q, transaccion } = require('./src/db');
const C = require('./src/constantes');
const noti = require('./src/notificaciones');

const PORT = Number(process.env.PORT || 3000);
const RECARGO_TARJETA = Number(process.env.RECARGO_TARJETA ?? 6); // %
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------- utilidades

const ESTADOS_IDS = C.ESTADOS.map((e) => e.id);
const hoy = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD local
const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const txt = (v) => (v === undefined || v === null ? null : String(v).trim() || null);
const redondear = (n) => Math.round(n * 100) / 100;

class ErrorCliente extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}
const exigir = (cond, msg, status) => { if (!cond) throw new ErrorCliente(msg, status); };

// --------------------------------------------------------- tiempo real (SSE)

const suscriptores = new Set(); // { res, token } — token null = usuario interno

function emitir(evento, datos, token) {
  const linea = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const s of suscriptores) {
    if (s.token === null || (token && s.token === token)) s.res.write(linea);
  }
}

function abrirSSE(req, res, token) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const s = { res, token };
  suscriptores.add(s);
  const latido = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(latido); suscriptores.delete(s); });
}

function avisarCambioOrden(ordenId, motivo) {
  const o = q.get('SELECT id, token, cliente_id, estado FROM ordenes WHERE id = ?', ordenId);
  if (!o) return;
  emitir('orden', { id: o.id, cliente_id: o.cliente_id, estado: o.estado, motivo }, o.token);
}

// ------------------------------------------------------------- autenticación
// Opcional: si APP_PASSWORD está definido, el panel interno exige iniciar sesión.

const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SECRETO = process.env.SESSION_SECRET || crypto.createHash('sha256').update('ot:' + APP_PASSWORD).digest('hex');
const firmar = (v) => crypto.createHmac('sha256', SECRETO).update(v).digest('hex');

function leerCookie(req, nombre) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function sesionValida(req) {
  if (!APP_PASSWORD) return true;
  const c = leerCookie(req, 'ot_sesion');
  if (!c) return false;
  const [emitida, firma] = c.split('.');
  const firmaOk = firma && firma.length === 64 &&
    crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(firmar(emitida)));
  return firmaOk && Date.now() - Number(emitida) < 30 * 24 * 3600 * 1000;
}

app.post('/api/login', (req, res) => {
  const pass = Buffer.from(String(req.body?.password || ''));
  const esperado = Buffer.from(APP_PASSWORD);
  const ok = APP_PASSWORD && pass.length === esperado.length && crypto.timingSafeEqual(pass, esperado);
  if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
  const emitida = String(Date.now());
  res.cookie('ot_sesion', `${emitida}.${firmar(emitida)}`, {
    httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.clearCookie('ot_sesion'); res.json({ ok: true }); });

app.get('/api/config', (req, res) => {
  res.json({
    ...C,
    recargoTarjeta: RECARGO_TARJETA,
    moneda: process.env.MONEDA || 'USD',
    nombreNegocio: process.env.NOMBRE_NEGOCIO || 'Joyería',
    requiereLogin: Boolean(APP_PASSWORD),
    sesion: sesionValida(req),
    smtp: noti.smtpConfigurado,
    whatsapp: noti.whatsappConfigurado,
  });
});

// ------------------------------------------------ seguimiento público cliente

function ordenPublica(token) {
  const o = q.get(
    `SELECT o.id, o.numero, o.tipo, o.subtipo, o.estado, o.fecha_creacion, o.fecha_cliente, o.detalles,
            c.nombre AS cliente, a.nombre AS asesor, a.telefono AS asesor_telefono
       FROM ordenes o JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN asesores a ON a.id = o.asesor_id
      WHERE o.token = ?`, token);
  if (!o) return null;
  o.cliente = (o.cliente || '').split(' ')[0];
  o.pasos = C.pasosDe(o.tipo, JSON.parse(o.detalles || '{}'));
  delete o.detalles;
  o.asesor_telefono = noti.telefonoInternacional(o.asesor_telefono);
  o.historial = q.all('SELECT estado, fecha FROM historial WHERE orden_id = ? ORDER BY fecha, id', o.id);
  o.fotos = q.all(
    `SELECT archivo, categoria FROM fotos WHERE orden_id = ? AND categoria IN ('referencia','terminado') ORDER BY id`, o.id);
  delete o.id;
  return o;
}

app.get('/api/publico/:token', (req, res) => {
  const o = ordenPublica(req.params.token);
  if (!o) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(o);
});

app.get('/api/publico/:token/eventos', (req, res) => {
  if (!q.get('SELECT 1 FROM ordenes WHERE token = ?', req.params.token)) return res.status(404).end();
  abrirSSE(req, res, req.params.token);
});

// Todo lo que sigue en /api requiere sesión.
app.use('/api', (req, res, next) => {
  if (sesionValida(req)) return next();
  res.status(401).json({ error: 'Sesión requerida' });
});

app.get('/api/eventos', (req, res) => abrirSSE(req, res, null));

// ------------------------------------------------------------------ asesores

app.get('/api/asesores', (req, res) => {
  res.json(q.all(`SELECT a.*, (SELECT COUNT(*) FROM ordenes o WHERE o.asesor_id = a.id AND o.estado <> 'entregado') AS activas
                    FROM asesores a ORDER BY a.activo DESC, a.nombre`));
});

app.post('/api/asesores', (req, res) => {
  const b = req.body || {};
  exigir(txt(b.nombre), 'El nombre del asesor es obligatorio');
  const r = q.run('INSERT INTO asesores (nombre, telefono, email) VALUES (?, ?, ?)', txt(b.nombre), txt(b.telefono), txt(b.email));
  res.status(201).json(q.get('SELECT * FROM asesores WHERE id = ?', r.lastInsertRowid));
});

app.put('/api/asesores/:id', (req, res) => {
  const b = req.body || {};
  exigir(txt(b.nombre), 'El nombre del asesor es obligatorio');
  q.run('UPDATE asesores SET nombre = ?, telefono = ?, email = ?, activo = ? WHERE id = ?',
    txt(b.nombre), txt(b.telefono), txt(b.email), b.activo === false ? 0 : 1, req.params.id);
  res.json(q.get('SELECT * FROM asesores WHERE id = ?', req.params.id));
});

// ------------------------------------------------------------------ clientes

function datosCliente(b) {
  exigir(txt(b.nombre), 'El nombre del cliente es obligatorio');
  exigir(txt(b.telefono) || txt(b.email), 'Registre al menos un teléfono o correo del cliente');
  if (txt(b.email)) exigir(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email).trim()), 'Correo electrónico no válido');
  return [txt(b.nombre), txt(b.telefono), txt(b.email)?.toLowerCase() ?? null,
    txt(b.tipo_evento), txt(b.fecha_evento), txt(b.notas)];
}

function crearCliente(b) {
  const r = q.run(
    'INSERT INTO clientes (nombre, telefono, email, tipo_evento, fecha_evento, notas) VALUES (?, ?, ?, ?, ?, ?)',
    ...datosCliente(b));
  return Number(r.lastInsertRowid);
}

app.get('/api/clientes', (req, res) => {
  const busca = `%${String(req.query.q || '').trim()}%`;
  res.json(q.all(
    `SELECT c.*, COUNT(o.id) AS ordenes, MAX(o.fecha_creacion) AS ultima_orden,
            COALESCE(SUM(CASE WHEN o.estado <> 'entregado' THEN 1 ELSE 0 END), 0) AS activas
       FROM clientes c LEFT JOIN ordenes o ON o.cliente_id = c.id
      WHERE c.nombre LIKE ? OR c.telefono LIKE ? OR c.email LIKE ?
      GROUP BY c.id ORDER BY c.nombre LIMIT 200`, busca, busca, busca));
});

app.post('/api/clientes', (req, res) => {
  const id = crearCliente(req.body || {});
  res.status(201).json(q.get('SELECT * FROM clientes WHERE id = ?', id));
});

app.get('/api/clientes/:id', (req, res) => {
  const c = q.get('SELECT * FROM clientes WHERE id = ?', req.params.id);
  exigir(c, 'Cliente no encontrado', 404);
  c.ordenes = q.all(
    `SELECT o.id, o.numero, o.tipo, o.subtipo, o.estado, o.fecha_creacion, o.fecha_cliente, o.total, o.detalles,
            a.nombre AS asesor,
            COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.orden_id = o.id), 0) AS pagado,
            (SELECT MAX(fecha) FROM historial h WHERE h.orden_id = o.id AND h.estado = 'entregado') AS fecha_entrega
       FROM ordenes o LEFT JOIN asesores a ON a.id = o.asesor_id
      WHERE o.cliente_id = ? ORDER BY o.fecha_creacion DESC, o.id DESC`, c.id)
    .map((o) => ({ ...o, detalles: JSON.parse(o.detalles || '{}') }));
  c.whatsapp = noti.telefonoInternacional(c.telefono);
  res.json(c);
});

app.put('/api/clientes/:id', (req, res) => {
  exigir(q.get('SELECT 1 FROM clientes WHERE id = ?', req.params.id), 'Cliente no encontrado', 404);
  q.run('UPDATE clientes SET nombre = ?, telefono = ?, email = ?, tipo_evento = ?, fecha_evento = ?, notas = ? WHERE id = ?',
    ...datosCliente(req.body || {}), req.params.id);
  emitir('cliente', { id: Number(req.params.id) });
  res.json(q.get('SELECT * FROM clientes WHERE id = ?', req.params.id));
});

// ------------------------------------------------------------------- órdenes

function calcularTotal(b) {
  if (b.precio_modo === 'desglosado') {
    return redondear((num(b.gramos) || 0) * (num(b.costo_gramo) || 0) + (num(b.costo_gemas) || 0));
  }
  return redondear(num(b.precio_fijo) || 0);
}

function validarOrden(b) {
  exigir(C.TIPOS_ORDEN.some((t) => t.id === b.tipo), 'Seleccione el tipo de orden');
  if (b.tipo === 'fabricacion') {
    exigir(C.TIPOS_FABRICACION.some((t) => t.id === b.subtipo), 'Seleccione qué se va a fabricar');
  }
  if (b.estado) exigir(ESTADOS_IDS.includes(b.estado), 'Estado no válido');
  exigir(['fijo', 'desglosado'].includes(b.precio_modo || 'fijo'), 'Modo de precio no válido');
  const detalles = b.detalles && typeof b.detalles === 'object' ? b.detalles : {};
  return {
    tipo: b.tipo,
    subtipo: b.tipo === 'fabricacion' ? b.subtipo : null,
    asesor_id: num(b.asesor_id),
    fecha_creacion: txt(b.fecha_creacion) || hoy(),
    fecha_taller: txt(b.fecha_taller),
    fecha_cliente: txt(b.fecha_cliente),
    detalles: JSON.stringify(detalles),
    precio_modo: b.precio_modo || 'fijo',
    precio_fijo: num(b.precio_fijo),
    gramos: num(b.gramos),
    costo_gramo: num(b.costo_gramo),
    costo_gemas: num(b.costo_gemas),
    total: calcularTotal(b),
    notificar: b.notificar === false ? 0 : 1,
    observaciones: txt(b.observaciones),
  };
}

function ordenCompleta(id) {
  const o = q.get(
    `SELECT o.*, a.nombre AS asesor_nombre, a.telefono AS asesor_telefono
       FROM ordenes o LEFT JOIN asesores a ON a.id = o.asesor_id WHERE o.id = ?`, id);
  if (!o) return null;
  o.detalles = JSON.parse(o.detalles || '{}');
  o.cliente = q.get('SELECT * FROM clientes WHERE id = ?', o.cliente_id);
  o.historial = q.all('SELECT * FROM historial WHERE orden_id = ? ORDER BY fecha DESC, id DESC', id);
  o.fotos = q.all('SELECT * FROM fotos WHERE orden_id = ? ORDER BY id', id);
  o.pagos = q.all('SELECT * FROM pagos WHERE orden_id = ? ORDER BY fecha, id', id);
  o.notificaciones = q.all('SELECT * FROM notificaciones WHERE orden_id = ? ORDER BY id DESC LIMIT 50', id);
  o.pagado = redondear(o.pagos.reduce((s, p) => s + p.monto, 0));
  o.saldo = redondear(o.total - o.pagado);
  o.enlace_seguimiento = noti.enlaceSeguimiento(o);
  o.cliente_whatsapp = noti.telefonoInternacional(o.cliente.telefono);
  o.servicios_previos = q.get('SELECT COUNT(*) AS n FROM ordenes WHERE cliente_id = ? AND id <> ?', o.cliente_id, id).n;
  return o;
}

async function cambiarEstado(ordenId, estado, { comentario, usuario, notificar }) {
  q.run(`UPDATE ordenes SET estado = ?, actualizado = datetime('now','localtime') WHERE id = ?`, estado, ordenId);
  q.run('INSERT INTO historial (orden_id, estado, comentario, usuario) VALUES (?, ?, ?, ?)',
    ordenId, estado, txt(comentario), txt(usuario));
  const o = q.get('SELECT * FROM ordenes WHERE id = ?', ordenId);
  if (notificar && o.notificar) {
    const cliente = q.get('SELECT * FROM clientes WHERE id = ?', o.cliente_id);
    await noti.notificarEstado(o, cliente, estado);
  }
  avisarCambioOrden(ordenId, 'estado');
}

app.get('/api/ordenes', (req, res) => {
  const filtros = [];
  const params = [];
  if (req.query.estado === 'activas') filtros.push(`o.estado <> 'entregado'`);
  else if (req.query.estado === 'atrasadas') { filtros.push(`o.estado <> 'entregado' AND o.fecha_cliente < ?`); params.push(hoy()); }
  else if (req.query.estado === 'proximas') {
    filtros.push(`o.estado <> 'entregado' AND o.fecha_cliente BETWEEN ? AND date(?, '+7 day')`);
    params.push(hoy(), hoy());
  } else if (req.query.estado) { filtros.push('o.estado = ?'); params.push(String(req.query.estado)); }
  if (req.query.tipo) { filtros.push('o.tipo = ?'); params.push(String(req.query.tipo)); }
  if (req.query.asesor) { filtros.push('o.asesor_id = ?'); params.push(String(req.query.asesor)); }
  if (req.query.q) {
    const b = `%${String(req.query.q).trim()}%`;
    filtros.push('(o.numero LIKE ? OR c.nombre LIKE ? OR c.telefono LIKE ? OR c.email LIKE ?)');
    params.push(b, b, b, b);
  }
  const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : '';
  const entregadasAlFinal = `CASE WHEN o.estado = 'entregado' THEN 1 ELSE 0 END`;
  const orden = {
    entrega_asc: `${entregadasAlFinal}, o.fecha_cliente IS NULL, o.fecha_cliente ASC, o.id DESC`,
    entrega_desc: `${entregadasAlFinal}, o.fecha_cliente IS NULL, o.fecha_cliente DESC, o.id DESC`,
    reciente: 'o.fecha_creacion DESC, o.id DESC',
    antiguas: 'o.fecha_creacion ASC, o.id ASC',
  }[req.query.orden] || `${entregadasAlFinal}, o.fecha_cliente IS NULL, o.fecha_cliente ASC, o.id DESC`;
  res.json(q.all(
    `SELECT o.id, o.numero, o.tipo, o.subtipo, o.estado, o.fecha_creacion, o.fecha_taller, o.fecha_cliente,
            o.total, o.actualizado, c.id AS cliente_id, c.nombre AS cliente, c.telefono AS cliente_telefono,
            a.nombre AS asesor,
            COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.orden_id = o.id), 0) AS pagado,
            (SELECT archivo FROM fotos f WHERE f.orden_id = o.id ORDER BY f.id LIMIT 1) AS foto
       FROM ordenes o JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN asesores a ON a.id = o.asesor_id
      ${where}
      ORDER BY ${orden}
      LIMIT 500`, ...params));
});

app.get('/api/resumen', (req, res) => {
  const porEstado = Object.fromEntries(q.all('SELECT estado, COUNT(*) AS n FROM ordenes GROUP BY estado').map((r) => [r.estado, r.n]));
  const h = hoy();
  res.json({
    porEstado,
    atrasadas: q.get(`SELECT COUNT(*) AS n FROM ordenes WHERE estado <> 'entregado' AND fecha_cliente < ?`, h).n,
    proximas: q.get(`SELECT COUNT(*) AS n FROM ordenes WHERE estado <> 'entregado' AND fecha_cliente BETWEEN ? AND date(?, '+7 day')`, h, h).n,
    saldoPendiente: redondear(q.get(
      `SELECT COALESCE(SUM(o.total - COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.orden_id = o.id), 0)), 0) AS s
         FROM ordenes o WHERE o.estado <> 'cotizado'`).s),
  });
});

app.get('/api/ordenes/:id', (req, res) => {
  const o = ordenCompleta(req.params.id);
  exigir(o, 'Orden no encontrada', 404);
  res.json(o);
});

app.post('/api/ordenes', async (req, res) => {
  const b = req.body || {};
  const d = validarOrden(b);
  const estadoInicial = b.estado || 'cotizado';
  const id = transaccion(() => {
    let clienteId = num(b.cliente_id);
    if (clienteId) exigir(q.get('SELECT 1 FROM clientes WHERE id = ?', clienteId), 'Cliente no encontrado');
    else clienteId = crearCliente(b.cliente || {});
    const r = q.run(
      `INSERT INTO ordenes (token, cliente_id, asesor_id, tipo, subtipo, estado, fecha_creacion, fecha_taller, fecha_cliente,
                            detalles, precio_modo, precio_fijo, gramos, costo_gramo, costo_gemas, total, notificar, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomBytes(12).toString('base64url'), clienteId, d.asesor_id, d.tipo, d.subtipo, estadoInicial,
      d.fecha_creacion, d.fecha_taller, d.fecha_cliente, d.detalles, d.precio_modo, d.precio_fijo,
      d.gramos, d.costo_gramo, d.costo_gemas, d.total, d.notificar, d.observaciones);
    const nuevoId = Number(r.lastInsertRowid);
    q.run('UPDATE ordenes SET numero = ? WHERE id = ?', `OT-${String(nuevoId).padStart(5, '0')}`, nuevoId);
    return nuevoId;
  });
  await cambiarEstado(id, estadoInicial, { comentario: 'Orden creada', usuario: b.usuario, notificar: true });
  res.status(201).json(ordenCompleta(id));
});

app.put('/api/ordenes/:id', (req, res) => {
  const actual = q.get('SELECT * FROM ordenes WHERE id = ?', req.params.id);
  exigir(actual, 'Orden no encontrada', 404);
  const b = req.body || {};
  const d = validarOrden(b);
  transaccion(() => {
    if (b.cliente) {
      const previo = q.get('SELECT * FROM clientes WHERE id = ?', actual.cliente_id);
      q.run('UPDATE clientes SET nombre = ?, telefono = ?, email = ?, tipo_evento = ?, fecha_evento = ?, notas = ? WHERE id = ?',
        ...datosCliente({ ...previo, ...b.cliente }), actual.cliente_id);
    }
    q.run(
      `UPDATE ordenes SET asesor_id = ?, tipo = ?, subtipo = ?, fecha_creacion = ?, fecha_taller = ?, fecha_cliente = ?,
              detalles = ?, precio_modo = ?, precio_fijo = ?, gramos = ?, costo_gramo = ?, costo_gemas = ?, total = ?,
              notificar = ?, observaciones = ?, actualizado = datetime('now','localtime')
        WHERE id = ?`,
      d.asesor_id, d.tipo, d.subtipo, d.fecha_creacion, d.fecha_taller, d.fecha_cliente, d.detalles, d.precio_modo,
      d.precio_fijo, d.gramos, d.costo_gramo, d.costo_gemas, d.total, d.notificar, d.observaciones, req.params.id);
  });
  avisarCambioOrden(Number(req.params.id), 'edicion');
  res.json(ordenCompleta(req.params.id));
});

app.post('/api/ordenes/:id/estado', async (req, res) => {
  const b = req.body || {};
  exigir(q.get('SELECT 1 FROM ordenes WHERE id = ?', req.params.id), 'Orden no encontrada', 404);
  exigir(ESTADOS_IDS.includes(b.estado), 'Estado no válido');
  await cambiarEstado(Number(req.params.id), b.estado, { comentario: b.comentario, usuario: b.usuario, notificar: b.notificar !== false });
  res.json(ordenCompleta(req.params.id));
});

// Reenvía la notificación del estado actual.
app.post('/api/ordenes/:id/notificar', async (req, res) => {
  const o = q.get('SELECT * FROM ordenes WHERE id = ?', req.params.id);
  exigir(o, 'Orden no encontrada', 404);
  await noti.notificarEstado(o, q.get('SELECT * FROM clientes WHERE id = ?', o.cliente_id), o.estado);
  avisarCambioOrden(o.id, 'notificacion');
  res.json(ordenCompleta(o.id));
});

// --------------------------------------------------------------------- fotos

const subida = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

app.post('/api/ordenes/:id/fotos', subida.array('fotos', 20), (req, res) => {
  const ordenId = req.params.id;
  const categoria = C.CATEGORIAS_FOTO.some((c) => c.id === req.body?.categoria) ? req.body.categoria : 'referencia';
  if (!q.get('SELECT 1 FROM ordenes WHERE id = ?', ordenId)) {
    for (const f of req.files || []) fs.rmSync(f.path, { force: true });
    throw new ErrorCliente('Orden no encontrada', 404);
  }
  exigir(req.files?.length, 'No se recibieron imágenes');
  for (const f of req.files) {
    q.run('INSERT INTO fotos (orden_id, categoria, archivo, nombre_original) VALUES (?, ?, ?, ?)',
      ordenId, categoria, f.filename, f.originalname);
  }
  avisarCambioOrden(Number(ordenId), 'fotos');
  res.status(201).json(ordenCompleta(ordenId));
});

app.delete('/api/fotos/:id', (req, res) => {
  const f = q.get('SELECT * FROM fotos WHERE id = ?', req.params.id);
  exigir(f, 'Foto no encontrada', 404);
  q.run('DELETE FROM fotos WHERE id = ?', f.id);
  fs.rmSync(path.join(UPLOADS_DIR, path.basename(f.archivo)), { force: true });
  avisarCambioOrden(f.orden_id, 'fotos');
  res.json(ordenCompleta(f.orden_id));
});

// --------------------------------------------------------------------- pagos

app.post('/api/ordenes/:id/pagos', (req, res) => {
  const b = req.body || {};
  exigir(q.get('SELECT 1 FROM ordenes WHERE id = ?', req.params.id), 'Orden no encontrada', 404);
  exigir(C.FORMAS_PAGO.some((f) => f.id === b.forma), 'Seleccione la forma de pago');

  let monto = num(b.monto);
  let oro = [null, null, null];
  if (b.forma === 'oro') {
    const gramos = num(b.oro_gramos);
    const valor = num(b.oro_valor_gramo);
    exigir(gramos > 0 && valor > 0, 'Indique los gramos de oro y el valor por gramo');
    monto = redondear(gramos * valor);
    oro = [gramos, txt(b.oro_kilataje), valor];
  }
  exigir(monto > 0, 'El monto debe ser mayor que cero');
  monto = redondear(monto);
  const recargo = b.forma === 'tarjeta' ? redondear(monto * RECARGO_TARJETA / 100) : 0;

  q.run(
    `INSERT INTO pagos (orden_id, fecha, forma, monto, recargo, total_cobrado, oro_gramos, oro_kilataje, oro_valor_gramo, referencia, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.params.id, txt(b.fecha) || hoy(), b.forma, monto, recargo, redondear(monto + recargo),
    ...oro, txt(b.referencia), txt(b.notas));
  avisarCambioOrden(Number(req.params.id), 'pago');
  res.status(201).json(ordenCompleta(req.params.id));
});

app.delete('/api/pagos/:id', (req, res) => {
  const p = q.get('SELECT * FROM pagos WHERE id = ?', req.params.id);
  exigir(p, 'Pago no encontrado', 404);
  q.run('DELETE FROM pagos WHERE id = ?', p.id);
  avisarCambioOrden(p.orden_id, 'pago');
  res.json(ordenCompleta(p.orden_id));
});

// ------------------------------------------------------------ archivos, errores

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, req, res, next) => {
  if (err instanceof ErrorCliente) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `Error al subir fotos: ${err.message}` });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Órdenes de trabajo listas en http://localhost:${PORT}`);
  if (!APP_PASSWORD) console.log('Aviso: APP_PASSWORD no está definido; el panel no pide contraseña.');
});
