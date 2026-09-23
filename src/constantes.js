// Catálogos compartidos por el servidor y el cliente (se exponen en /api/config).

const ESTADOS = [
  { id: 'cotizado', nombre: 'Cotizado' },
  { id: 'iniciado', nombre: 'Iniciado' },
  { id: 'enviado_taller', nombre: 'Enviado a taller' },
  { id: 'recibido_taller', nombre: 'Recibido en taller' },
  { id: 'en_proceso', nombre: 'En proceso' },
  { id: 'enviado_oficina', nombre: 'Enviado a oficina' },
  { id: 'recibido_oficina', nombre: 'Recibido en oficina' },
  { id: 'entregado', nombre: 'Entregado' },
];

const TIPOS_ORDEN = [
  { id: 'fabricacion', nombre: 'Fabricación' },
  { id: 'compostura', nombre: 'Compostura' },
  { id: 'mantenimiento', nombre: 'Mantenimiento' },
];

const TIPOS_FABRICACION = [
  { id: 'boda', nombre: 'Anillos de boda' },
  { id: 'compromiso', nombre: 'Anillo de compromiso' },
  { id: 'otro', nombre: 'Otra pieza' },
];

const FORMAS_PAGO = [
  { id: 'tarjeta', nombre: 'Tarjeta' },
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'oro', nombre: 'Pago en oro' },
];

const MATERIALES = [
  'Oro amarillo 18k',
  'Oro blanco 18k',
  'Oro rosa 18k',
  'Oro bicolor 18k',
  'Platino',
];

const FORMAS_GEMA = [
  'Redondo brillante', 'Princesa', 'Óvalo', 'Esmeralda', 'Cojín', 'Pera',
  'Marquesa', 'Radiante', 'Asscher', 'Corazón',
];

const CATEGORIAS_FOTO = [
  { id: 'referencia', nombre: 'Referencia de diseño / producción' },
  { id: 'estado_actual', nombre: 'Estado actual del artículo' },
  { id: 'terminado', nombre: 'Pieza terminada' },
];

// Mensaje al cliente para cada estado. {nombre}, {orden} y {enlace} se reemplazan.
const MENSAJES_ESTADO = {
  cotizado: 'Hola {nombre}, hemos registrado la cotización de tu orden {orden}. Puedes seguir su avance aquí: {enlace}',
  iniciado: 'Hola {nombre}, tu orden {orden} ha sido iniciada. ¡Comenzamos a trabajar en tu pieza! Seguimiento: {enlace}',
  enviado_taller: 'Hola {nombre}, tu orden {orden} fue enviada a nuestro taller de fabricación. Seguimiento: {enlace}',
  recibido_taller: 'Hola {nombre}, nuestro taller ya recibió tu orden {orden} y la está preparando. Seguimiento: {enlace}',
  en_proceso: 'Hola {nombre}, tu pieza de la orden {orden} está en proceso de elaboración. Seguimiento: {enlace}',
  enviado_oficina: 'Hola {nombre}, tu pieza de la orden {orden} está terminada y en camino a nuestra oficina. Seguimiento: {enlace}',
  recibido_oficina: 'Hola {nombre}, ¡tu pieza de la orden {orden} está lista para ser entregada! Contáctanos para coordinar la entrega. {enlace}',
  entregado: 'Hola {nombre}, tu orden {orden} ha sido entregada. ¡Gracias por confiar en nosotros! Te deseamos muchas felicidades.',
};

module.exports = {
  ESTADOS, TIPOS_ORDEN, TIPOS_FABRICACION, FORMAS_PAGO, MATERIALES,
  FORMAS_GEMA, CATEGORIAS_FOTO, MENSAJES_ESTADO,
};
