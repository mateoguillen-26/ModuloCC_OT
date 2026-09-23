// Notificaciones automáticas al cliente por correo (SMTP) y WhatsApp (API de WhatsApp Cloud).
// Si un canal no está configurado, se registra como "manual" para que el asesor lo envíe con un clic.
const nodemailer = require('nodemailer');
const { q } = require('./db');
const { MENSAJES_ESTADO, ESTADOS } = require('./constantes');

const env = process.env;
const smtpConfigurado = Boolean(env.SMTP_HOST && env.SMTP_USER);
const whatsappConfigurado = Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);

const transporte = smtpConfigurado
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: Number(env.SMTP_PORT) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

function urlBase() {
  return (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, '');
}

function enlaceSeguimiento(orden) {
  return `${urlBase()}/seguimiento.html?t=${orden.token}`;
}

// Deja solo dígitos y antepone el código de país cuando el número es local (empieza con 0).
function telefonoInternacional(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0') && env.CODIGO_PAIS) d = env.CODIGO_PAIS + d.slice(1);
  return d;
}

function armarMensaje(orden, cliente, estado) {
  const plantilla = MENSAJES_ESTADO[estado] || 'Hola {nombre}, tu orden {orden} fue actualizada. {enlace}';
  const primerNombre = (cliente.nombre || '').split(' ')[0];
  return plantilla
    .replace('{nombre}', primerNombre)
    .replace('{orden}', orden.numero)
    .replace('{enlace}', enlaceSeguimiento(orden));
}

function registrar(ordenId, estado, canal, destino, mensaje, resultado, detalle) {
  q.run(
    `INSERT INTO notificaciones (orden_id, estado_orden, canal, destino, mensaje, resultado, detalle)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ordenId, estado, canal, destino, mensaje, resultado, detalle || null,
  );
}

async function enviarEmail(cliente, orden, estado, mensaje) {
  const nombreEstado = ESTADOS.find((e) => e.id === estado)?.nombre || estado;
  const negocio = env.NOMBRE_NEGOCIO || 'Joyería';
  await transporte.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: cliente.email,
    subject: `${negocio} · Orden ${orden.numero}: ${nombreEstado}`,
    text: mensaje,
    html: `<div style="font-family:Georgia,serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e6dcc3">
      <h2 style="color:#8a6d1f;margin:0 0 4px">${negocio}</h2>
      <p style="color:#666;margin:0 0 20px">Orden ${orden.numero} · <b>${nombreEstado}</b></p>
      <p style="font-size:16px;line-height:1.5">${mensaje.replace(enlaceSeguimiento(orden), '')}</p>
      <p><a href="${enlaceSeguimiento(orden)}" style="background:#8a6d1f;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px">Ver seguimiento</a></p>
    </div>`,
  });
}

async function enviarWhatsapp(telefono, mensaje) {
  const cuerpo = env.WHATSAPP_TEMPLATE
    ? {
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'template',
        template: {
          name: env.WHATSAPP_TEMPLATE,
          language: { code: env.WHATSAPP_TEMPLATE_LANG || 'es' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: mensaje }] }],
        },
      }
    : { messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: mensaje } };

  const r = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

// Envía la notificación de cambio de estado por todos los canales disponibles del cliente.
async function notificarEstado(orden, cliente, estado) {
  const mensaje = armarMensaje(orden, cliente, estado);

  if (cliente.email) {
    if (transporte) {
      try {
        await enviarEmail(cliente, orden, estado, mensaje);
        registrar(orden.id, estado, 'email', cliente.email, mensaje, 'enviado');
      } catch (e) {
        registrar(orden.id, estado, 'email', cliente.email, mensaje, 'error', e.message);
      }
    } else {
      registrar(orden.id, estado, 'email', cliente.email, mensaje, 'manual', 'SMTP no configurado');
    }
  }

  const tel = telefonoInternacional(cliente.telefono);
  if (tel) {
    if (whatsappConfigurado) {
      try {
        await enviarWhatsapp(tel, mensaje);
        registrar(orden.id, estado, 'whatsapp', tel, mensaje, 'enviado');
      } catch (e) {
        registrar(orden.id, estado, 'whatsapp', tel, mensaje, 'error', e.message);
      }
    } else {
      registrar(orden.id, estado, 'whatsapp', tel, mensaje, 'manual', 'WhatsApp API no configurada');
    }
  }
}

module.exports = {
  notificarEstado, enlaceSeguimiento, telefonoInternacional,
  smtpConfigurado, whatsappConfigurado,
};
