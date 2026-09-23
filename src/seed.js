// Carga datos de prueba: asesores, clientes y órdenes con fotos, pagos e historial.
// Uso: npm run seed — agrega solo lo que falta (asesores por nombre, clientes por correo),
// así que puede ejecutarse de nuevo sin duplicar registros.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { q, transaccion } = require('./db');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ------------------------------------------------------------ fechas relativas

const dia = (desplazamiento) => {
  const d = new Date();
  d.setDate(d.getDate() + desplazamiento);
  return d.toLocaleDateString('sv-SE');
};
const momento = (desplazamiento, hora) => `${dia(desplazamiento)} ${hora}:00`;

// ------------------------------------------------------- fotos ilustrativas SVG

const OROS = {
  amarillo: ['#f6e27a', '#d4a52c', '#9c7415'],
  blanco: ['#f4f4f4', '#c9ccd1', '#8b9097'],
  rosa: ['#f7c6a8', '#d98f6c', '#a35e40'],
};

function degradado(id, [claro, medio, oscuro]) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${claro}"/><stop offset=".5" stop-color="${medio}"/><stop offset="1" stop-color="${oscuro}"/></linearGradient>`;
}

function lienzo(fondo, contenido, texto) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <radialGradient id="fondo" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${fondo}"/></radialGradient>
    ${degradado('oroA', OROS.amarillo)}${degradado('oroB', OROS.blanco)}${degradado('oroR', OROS.rosa)}
    <linearGradient id="brillo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bfe3f5"/></linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#fondo)"/>
  <ellipse cx="300" cy="500" rx="200" ry="22" fill="#000" opacity=".08"/>
  ${contenido}
  <text x="300" y="566" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#6d655a">${texto}</text>
</svg>`;
}

const aro = (cx, cy, rx, ry, grosor, oro) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="url(#${oro})" stroke-width="${grosor}"/>
   <ellipse cx="${cx}" cy="${cy - grosor / 4}" rx="${rx - grosor / 3}" ry="${ry - grosor / 3}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3"/>`;

const diamante = (cx, cy, r) =>
  `<polygon points="${cx},${cy - r} ${cx + r * 0.9},${cy - r * 0.2} ${cx},${cy + r} ${cx - r * 0.9},${cy - r * 0.2}" fill="url(#brillo)" stroke="#7aa9c2" stroke-width="2"/>
   <polyline points="${cx - r * 0.9},${cy - r * 0.2} ${cx + r * 0.9},${cy - r * 0.2}" stroke="#7aa9c2" stroke-width="1.5" fill="none"/>
   <polyline points="${cx - r * 0.45},${cy - r * 0.6} ${cx},${cy - r * 0.2} ${cx + r * 0.45},${cy - r * 0.6}" stroke="#7aa9c2" stroke-width="1.5" fill="none"/>`;

const FOTOS = {
  bodaAmarillo: () => lienzo('#efe3c4',
    `${aro(250, 300, 130, 130, 34, 'oroA')}${aro(360, 320, 110, 110, 26, 'oroA')}
     ${[0, 1, 2, 3, 4].map((i) => diamante(318 + i * 22, 214 + Math.abs(i - 2) * 5, 8)).join('')}`,
    'Referencia · argollas oro amarillo 18k'),
  bodaBicolor: () => lienzo('#e9e4dc',
    `${aro(245, 300, 125, 125, 30, 'oroB')}${aro(365, 310, 115, 115, 30, 'oroA')}`,
    'Referencia · oro blanco y amarillo'),
  grabado: () => lienzo('#efe3c4',
    `<ellipse cx="300" cy="290" rx="190" ry="150" fill="none" stroke="url(#oroA)" stroke-width="50"/>
     <text x="300" y="300" text-anchor="middle" font-family="Brush Script MT, cursive" font-size="44" fill="#85671d">Siempre juntos · 14.11</text>`,
    'Grabado interno solicitado'),
  solitario: () => lienzo('#e8ecef',
    `${aro(300, 340, 140, 140, 24, 'oroB')}
     <path d="M270 212 L300 240 L330 212" fill="none" stroke="#c9ccd1" stroke-width="8"/>
     ${diamante(300, 175, 55)}`,
    'Referencia · solitario oro blanco'),
  halo: () => lienzo('#f3e2d6',
    `${aro(300, 345, 135, 135, 22, 'oroR')}
     ${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return diamante(300 + Math.cos(a) * 62, 178 + Math.sin(a) * 62, 11); }).join('')}
     ${diamante(300, 178, 42)}`,
    'Referencia · halo oro rosa'),
  anilloDanado: () => lienzo('#e6e6e6',
    `${aro(300, 300, 140, 140, 28, 'oroA')}
     <path d="M395 190 l18 12 -10 10 16 14" stroke="#5a4a2a" stroke-width="5" fill="none"/>
     <circle cx="300" cy="160" r="26" fill="none" stroke="#9c7415" stroke-width="6" stroke-dasharray="10 8"/>
     <text x="300" y="115" text-anchor="middle" font-family="Arial" font-size="20" fill="#b3261e">engaste flojo</text>`,
    'Estado actual al recibir'),
  cadenaRota: () => lienzo('#ececec',
    `${Array.from({ length: 9 }, (_, i) => `<ellipse cx="${90 + i * 50 + (i > 4 ? 30 : 0)}" cy="${300 + (i % 2) * 6}" rx="30" ry="18" fill="none" stroke="url(#oroA)" stroke-width="9" transform="rotate(${i % 2 ? 20 : -20} ${90 + i * 50 + (i > 4 ? 30 : 0)} 300)"/>`).join('')}
     <text x="345" y="250" text-anchor="middle" font-family="Arial" font-size="20" fill="#b3261e">eslabón roto</text>`,
    'Estado actual · cadena 18k'),
  dije: () => lienzo('#f1e6cf',
    `<path d="M300 110 L300 150" stroke="url(#oroA)" stroke-width="6"/>
     <circle cx="300" cy="104" r="12" fill="none" stroke="url(#oroA)" stroke-width="6"/>
     <path d="M300 470 C 170 380 140 300 170 240 C 200 180 270 180 300 230 C 330 180 400 180 430 240 C 460 300 430 380 300 470 Z"
       fill="none" stroke="url(#oroA)" stroke-width="22" stroke-linejoin="round"/>
     <text x="300" y="345" text-anchor="middle" font-family="Brush Script MT, cursive" font-size="72" fill="#9c7415">M&amp;J</text>
     ${diamante(300, 232, 16)}`,
    'Referencia · dije corazón personalizado'),
  anilloPulido: () => lienzo('#efe3c4',
    `${aro(300, 300, 140, 140, 30, 'oroA')}
     ${[[200, 170], [410, 200], [420, 380], [180, 400]].map(([x, y]) => `<path d="M${x} ${y - 16} L${x + 4} ${y - 4} L${x + 16} ${y} L${x + 4} ${y + 4} L${x} ${y + 16} L${x - 4} ${y + 4} L${x - 16} ${y} L${x - 4} ${y - 4} Z" fill="#fff" opacity=".9"/>`).join('')}`,
    'Pieza terminada · pulido y rodinado'),
};

function guardarFoto(ordenId, categoria, clave) {
  const archivo = `${crypto.randomBytes(16).toString('hex')}.svg`;
  fs.writeFileSync(path.join(UPLOADS_DIR, archivo), FOTOS[clave]());
  q.run('INSERT INTO fotos (orden_id, categoria, archivo, nombre_original) VALUES (?, ?, ?, ?)',
    ordenId, categoria, archivo, `${clave}.svg`);
}

// -------------------------------------------------------------------- datos

const ASESORES = [
  { nombre: 'Valeria Andrade', telefono: '0991234567', email: 'valeria@joyeria.test' },
  { nombre: 'Martín Salazar', telefono: '0987651234', email: 'martin@joyeria.test' },
  { nombre: 'Camila Rojas', telefono: '0998765432', email: 'camila@joyeria.test' },
];

const ESTADOS = ['cotizado', 'iniciado', 'enviado_taller', 'recibido_taller', 'en_proceso', 'enviado_oficina', 'recibido_oficina', 'entregado'];

// asesor: índice en ASESORES; hastaEstado: estado actual; los días son relativos a hoy.
const ORDENES = [
  {
    cliente: { nombre: 'Daniela Torres Vega', telefono: '0981112233', email: 'daniela.torres@correo.test', tipo_evento: 'boda', fecha_evento: dia(9), notas: 'Prefiere acabado mate.' },
    asesor: 0, tipo: 'fabricacion', subtipo: 'boda', hastaEstado: 'en_proceso', creada: -24, taller: -1, cliente_dias: 1,
    detalles: {
      anillos: [
        { etiqueta: 'Anillo de ella', talla: '5.5', material: 'Oro amarillo 18k', ancho: '3', espesor: '1.6', grabado: 'Sebastián 14.11', diamantes_cantidad: '5', diamantes_tamano: '1.5 mm' },
        { etiqueta: 'Anillo de él', talla: '10', material: 'Oro amarillo 18k', ancho: '5', espesor: '1.8', grabado: 'Daniela 14.11', diamantes_cantidad: '', diamantes_tamano: '' },
      ],
      instrucciones: 'Acabado mate con borde pulido brillante. Canto redondeado (comfort fit).',
    },
    precio: { precio_modo: 'desglosado', gramos: 14.2, costo_gramo: 88, costo_gemas: 275 },
    pagos: [{ dias: -24, forma: 'transferencia', monto: 700, referencia: 'TRX-458812' }],
    fotos: [['referencia', 'bodaAmarillo'], ['referencia', 'grabado']],
  },
  {
    cliente: { nombre: 'Andrés Molina', telefono: '0994445566', email: 'andres.molina@correo.test', tipo_evento: 'boda', fecha_evento: dia(60), notas: 'Propuesta sorpresa: no contactar a la novia.' },
    asesor: 1, tipo: 'fabricacion', subtipo: 'compromiso', hastaEstado: 'recibido_taller', creada: -12, taller: 3, cliente_dias: 5,
    detalles: {
      talla: '6', material: 'Oro blanco 18k',
      gema: { tipo: 'Diamante', forma: 'Redondo brillante', peso: '0.70', medidas: '5.7', color: 'F', pureza: 'VS1' },
      certificado: { laboratorio: 'GIA', codigo: '2436789015' },
      secundarios: { cantidad: '24', peso: '0.18', tamano: '1.1 mm', engaste: 'Micropavé en el aro' },
      instrucciones: 'Solitario de 6 garras, galería calada. Rodinado final.',
    },
    precio: { precio_modo: 'desglosado', gramos: 4.8, costo_gramo: 95, costo_gemas: 3150 },
    pagos: [{ dias: -12, forma: 'tarjeta', monto: 1500, referencia: 'Voucher 00921' }],
    fotos: [['referencia', 'solitario']],
  },
  {
    cliente: { nombre: 'Lucía Fernández', telefono: '0967778899', email: 'lucia.f@correo.test', tipo_evento: 'aniversario', fecha_evento: dia(-3), notas: '' },
    asesor: 2, tipo: 'compostura', hastaEstado: 'enviado_taller', creada: -10, taller: -4, cliente_dias: -2,
    detalles: {
      articulo: 'Anillo de compromiso oro amarillo 18k con solitario 0.40 ct',
      instrucciones: 'Ajustar garras del engaste (piedra floja). Reducir talla de 7 a 6. Limpieza y pulido general.',
      materiales: [
        { descripcion: 'Anillo con solitario 0.40 ct', cantidad: '1', peso: '3.9', observaciones: 'Rayones en el aro' },
        { descripcion: 'Oro 18k para ajuste', cantidad: '1', peso: '0.3', observaciones: 'Aportado por el cliente' },
      ],
    },
    precio: { precio_modo: 'fijo', precio_fijo: 85 },
    pagos: [{ dias: -10, forma: 'efectivo', monto: 40 }],
    fotos: [['estado_actual', 'anilloDanado']],
  },
  {
    cliente: { nombre: 'Gabriel y Sofía Ramírez', telefono: '0952223344', email: 'sofia.ramirez@correo.test', tipo_evento: 'boda', fecha_evento: dia(45), notas: 'Pareja referida por Daniela Torres.' },
    asesor: 0, tipo: 'fabricacion', subtipo: 'boda', hastaEstado: 'iniciado', creada: -3, taller: 14, cliente_dias: 20,
    detalles: {
      anillos: [
        { etiqueta: 'Anillo de ella', talla: '6', material: 'Oro blanco 18k', ancho: '2.5', espesor: '1.5', grabado: 'G & S 2026', diamantes_cantidad: '9', diamantes_tamano: '1.3 mm' },
        { etiqueta: 'Anillo de él', talla: '11', material: 'Oro bicolor 18k', ancho: '6', espesor: '2', grabado: 'G & S 2026', diamantes_cantidad: '1', diamantes_tamano: '2 mm' },
      ],
      instrucciones: 'Anillo de él con franja central en oro blanco. Diamante de él engastado a ras (gypsy).',
    },
    precio: { precio_modo: 'desglosado', gramos: 16.5, costo_gramo: 90, costo_gemas: 420 },
    pagos: [{ dias: -3, forma: 'oro', oro_gramos: 6, oro_kilataje: '18k', oro_valor_gramo: 62, referencia: 'Cadena antigua fundida' }],
    fotos: [['referencia', 'bodaBicolor']],
  },
  {
    cliente: { nombre: 'Patricia Herrera', telefono: '0973334455', email: 'patricia.h@correo.test', tipo_evento: 'aniversario', fecha_evento: dia(120), notas: 'Cliente frecuente.' },
    asesor: 1, tipo: 'mantenimiento', hastaEstado: 'entregado', creada: -20, taller: -12, cliente_dias: -8,
    detalles: {
      articulo: 'Cadena oro amarillo 18k (45 cm) y anillo de matrimonio',
      instrucciones: 'Soldar eslabón roto de la cadena. Pulido, limpieza ultrasónica y rodinado del anillo.',
      materiales: [
        { descripcion: 'Cadena 18k 45 cm', cantidad: '1', peso: '7.2', observaciones: 'Eslabón roto cerca del broche' },
        { descripcion: 'Anillo de matrimonio 18k', cantidad: '1', peso: '4.1', observaciones: '' },
      ],
    },
    precio: { precio_modo: 'fijo', precio_fijo: 60 },
    pagos: [{ dias: -20, forma: 'efectivo', monto: 30 }, { dias: -8, forma: 'tarjeta', monto: 30, referencia: 'Voucher 01144' }],
    fotos: [['estado_actual', 'cadenaRota'], ['terminado', 'anilloPulido']],
  },
];

ORDENES.push({
  cliente: { nombre: 'Mariana Jaramillo', telefono: '0985556677', email: 'mariana.j@correo.test', tipo_evento: 'aniversario', fecha_evento: dia(30), notas: 'Regalo de aniversario, entregar en estuche.' },
  asesor: 2, tipo: 'fabricacion', subtipo: 'personalizada', hastaEstado: 'enviado_taller', creada: -6, taller: 8, cliente_dias: 12,
  detalles: {
    tipo_joya: 'Dije', descripcion: 'Dije corazón calado con iniciales M&J', material: 'Oro amarillo 18k',
    medidas: '22 × 20 mm, cadena 45 cm', peso_estimado: '4.5', acabado: 'Pulido brillante', grabado: '10 años · 15.10.2016',
    gemas: [
      { tipo: 'Diamante', forma: 'Redondo brillante', cantidad: '1', peso: '0.10', certificado: '' },
      { tipo: 'Zafiro azul', forma: 'Redondo brillante', cantidad: '6', peso: '0.12', certificado: '' },
    ],
    instrucciones: 'Iniciales en letra cursiva. Grabado al reverso del corazón. Incluir cadena tipo veneciana 45 cm.',
  },
  precio: { precio_modo: 'desglosado', gramos: 6.2, costo_gramo: 88, costo_gemas: 260 },
  pagos: [{ dias: -6, forma: 'transferencia', monto: 400, referencia: 'TRX-470031' }],
  fotos: [['referencia', 'dije']],
});

// Segunda orden de Patricia (historial de servicios previos).
const ORDEN_PREVIA_PATRICIA = {
  asesor: 2, tipo: 'fabricacion', subtipo: 'compromiso', hastaEstado: 'entregado', creada: -300, taller: -285, cliente_dias: -280,
  detalles: {
    talla: '6.5', material: 'Oro rosa 18k',
    gema: { tipo: 'Diamante', forma: 'Óvalo', peso: '0.50', color: 'G', pureza: 'VS2' },
    certificado: { laboratorio: 'IGI', codigo: 'LG5501238' },
    secundarios: { cantidad: '14', peso: '0.14', tamano: '1.2 mm', engaste: 'Halo' },
  },
  precio: { precio_modo: 'fijo', precio_fijo: 2200 },
  pagos: [{ dias: -300, forma: 'transferencia', monto: 1100 }, { dias: -280, forma: 'transferencia', monto: 1100 }],
  fotos: [['referencia', 'halo']],
};

const COMENTARIOS = {
  cotizado: 'Orden creada', iniciado: 'Anticipo recibido', enviado_taller: 'Enviado con modelo y fotos',
  recibido_taller: 'Recibido por el taller', en_proceso: 'En fundición / armado', enviado_oficina: 'Terminado, enviado a oficina',
  recibido_oficina: 'Control de calidad aprobado', entregado: 'Entregado al cliente',
};

// ------------------------------------------------------------------ inserción

function crearOrden(clienteId, asesorId, o) {
  const total = o.precio.precio_modo === 'desglosado'
    ? Math.round((o.precio.gramos * o.precio.costo_gramo + o.precio.costo_gemas) * 100) / 100
    : o.precio.precio_fijo;
  const r = q.run(
    `INSERT INTO ordenes (token, cliente_id, asesor_id, tipo, subtipo, estado, fecha_creacion, fecha_taller, fecha_cliente,
                          detalles, precio_modo, precio_fijo, gramos, costo_gramo, costo_gemas, total, notificar, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    crypto.randomBytes(12).toString('base64url'), clienteId, asesorId, o.tipo, o.subtipo || null, o.hastaEstado,
    dia(o.creada), dia(o.taller), dia(o.cliente_dias), JSON.stringify(o.detalles), o.precio.precio_modo,
    o.precio.precio_fijo ?? null, o.precio.gramos ?? null, o.precio.costo_gramo ?? null, o.precio.costo_gemas ?? null,
    total, momento(0, '09:00'));
  const id = Number(r.lastInsertRowid);
  q.run('UPDATE ordenes SET numero = ? WHERE id = ?', `OT-${String(id).padStart(5, '0')}`, id);

  // Historial repartido entre la fecha de creación y hoy (o la entrega).
  const pasos = ESTADOS.slice(0, ESTADOS.indexOf(o.hastaEstado) + 1);
  const fin = o.hastaEstado === 'entregado' ? o.cliente_dias : 0;
  pasos.forEach((estado, i) => {
    const d = Math.round(o.creada + ((fin - o.creada) * i) / Math.max(pasos.length - 1, 1));
    q.run('INSERT INTO historial (orden_id, estado, comentario, usuario, fecha) VALUES (?, ?, ?, ?, ?)',
      id, estado, COMENTARIOS[estado], ASESORES[o.asesor].nombre.split(' ')[0], momento(d, `${10 + i}:15`));
  });

  for (const p of o.pagos) {
    const monto = p.forma === 'oro' ? p.oro_gramos * p.oro_valor_gramo : p.monto;
    const recargo = p.forma === 'tarjeta' ? Math.round(monto * 6) / 100 : 0;
    q.run(
      `INSERT INTO pagos (orden_id, fecha, forma, monto, recargo, total_cobrado, oro_gramos, oro_kilataje, oro_valor_gramo, referencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, dia(p.dias), p.forma, monto, recargo, monto + recargo,
      p.oro_gramos ?? null, p.oro_kilataje ?? null, p.oro_valor_gramo ?? null, p.referencia ?? null);
  }

  for (const [categoria, clave] of o.fotos) guardarFoto(id, categoria, clave);
  return id;
}

let nuevas = 0;
transaccion(() => {
  const asesorIds = ASESORES.map((a) => q.get('SELECT id FROM asesores WHERE nombre = ?', a.nombre)?.id
    ?? Number(q.run('INSERT INTO asesores (nombre, telefono, email) VALUES (?, ?, ?)', a.nombre, a.telefono, a.email).lastInsertRowid));
  for (const o of ORDENES) {
    const c = o.cliente;
    if (q.get('SELECT 1 FROM clientes WHERE email = ?', c.email)) continue;
    nuevas++;
    const clienteId = Number(q.run(
      `INSERT INTO clientes (nombre, telefono, email, tipo_evento, fecha_evento, notas, creado) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      c.nombre, c.telefono, c.email, c.tipo_evento, c.fecha_evento, c.notas || null, momento(o.creada, '09:00')).lastInsertRowid);
    if (c.nombre === 'Patricia Herrera') crearOrden(clienteId, asesorIds[ORDEN_PREVIA_PATRICIA.asesor], ORDEN_PREVIA_PATRICIA);
    crearOrden(clienteId, asesorIds[o.asesor], o);
  }
});

console.log(nuevas
  ? `Datos de prueba agregados: ${nuevas} cliente(s) nuevo(s) con sus órdenes, fotos y pagos.`
  : 'Los datos de prueba ya estaban cargados; no se agregó nada.');
