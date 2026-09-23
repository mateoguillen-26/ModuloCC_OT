'use strict';

/* =====================================================================
   Utilidades
   ===================================================================== */

let CFG = null;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = () => $('#app');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opts = {}) {
  const o = { ...opts, headers: { ...(opts.headers || {}) } };
  if (o.body && !(o.body instanceof FormData)) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(o.body);
  }
  const r = await fetch(url, o);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && CFG?.requiereLogin && !url.endsWith('/login')) {
    vistaLogin();
    throw new Error('Sesión requerida');
  }
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

const hoyISO = () => new Date().toLocaleDateString('sv-SE');
const aFecha = (s) => new Date(s.length === 10 ? `${s}T12:00:00` : s.replace(' ', 'T'));
const fecha = (s) => (s ? aFecha(s).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fechaHora = (s) => (s ? aFecha(s).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const diasHasta = (s) => Math.round((aFecha(s) - aFecha(hoyISO())) / 86400000);
const dinero = (n) => new Intl.NumberFormat('es', { style: 'currency', currency: CFG.moneda }).format(Number(n) || 0);
const numero = (n) => (Number(n) || 0);

const nombreDe = (lista, id) => CFG[lista].find((x) => x.id === id)?.nombre || id || '—';
const badgeEstado = (id) => `<span class="badge e-${esc(id)}">${esc(nombreDe('ESTADOS', id))}</span>`;
const tipoTexto = (o) => (o.tipo === 'fabricacion' ? nombreDe('TIPOS_FABRICACION', o.subtipo) : nombreDe('TIPOS_ORDEN', o.tipo));

// Nivel de cercanía de la entrega: vencida (pasó la fecha), vispera (0 a 2 días), pronto (3 a 7 días).
function urgencia(fechaLimite, estado) {
  if (!fechaLimite || estado === 'entregado') return '';
  const d = diasHasta(fechaLimite);
  return d < 0 ? 'vencida' : d <= 2 ? 'vispera' : d <= 7 ? 'pronto' : '';
}

function fechaEntrega(fechaLimite, estado) {
  if (!fechaLimite) return '<span class="muted">—</span>';
  const u = urgencia(fechaLimite, estado);
  if (!u) return fecha(fechaLimite);
  const d = diasHasta(fechaLimite);
  const nota = d < 0 ? `${-d} d de atraso` : d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`;
  return `<span class="fecha-u u-${u}">${fecha(fechaLimite)}<small>${nota}</small></span>`;
}

function toast(msg, error = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' error' : '');
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), error ? 6000 : 3500);
}

const leerLocal = (k, def = '') => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const guardarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

// Asigna un valor en un objeto siguiendo una ruta tipo "detalles.anillos.0.talla".
function ponerRuta(obj, ruta, valor) {
  const partes = ruta.split('.');
  let cur = obj;
  partes.slice(0, -1).forEach((p, i) => {
    if (cur[p] === undefined) cur[p] = /^\d+$/.test(partes[i + 1]) ? [] : {};
    cur = cur[p];
  });
  cur[partes.at(-1)] = valor;
}

function serializar(form) {
  const datos = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'file') continue;
    if (el.type === 'radio' && !el.checked) continue;
    ponerRuta(datos, el.name, el.type === 'checkbox' ? el.checked : el.value);
  }
  return datos;
}

const opciones = (lista, sel, vacio) =>
  (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') +
  lista.map((x) => {
    const id = typeof x === 'string' ? x : x.id;
    const nom = typeof x === 'string' ? x : x.nombre;
    return `<option value="${esc(id)}" ${String(sel ?? '') === String(id) ? 'selected' : ''}>${esc(nom)}</option>`;
  }).join('');

function campo(etiqueta, nombre, valor, { tipo = 'text', extra = '', clase = '', lista } = {}) {
  const id = 'f-' + nombre.replace(/\./g, '-');
  const dl = lista ? ` list="dl-${lista}"` : '';
  const control = tipo === 'textarea'
    ? `<textarea id="${id}" name="${esc(nombre)}" ${extra}>${esc(valor)}</textarea>`
    : `<input id="${id}" type="${tipo}" name="${esc(nombre)}" value="${esc(valor)}"${dl} ${tipo === 'number' ? 'step="any" min="0"' : ''} ${extra}>`;
  return `<div class="${clase}"><label for="${id}">${esc(etiqueta)}</label>${control}</div>`;
}

const datalists = () => `
  <datalist id="dl-materiales">${CFG.MATERIALES.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
  <datalist id="dl-formas">${CFG.FORMAS_GEMA.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
  <datalist id="dl-labs"><option value="GIA"><option value="IGI"><option value="HRD"><option value="AGS"></datalist>`;

function abrirVisor(src) {
  const v = document.createElement('div');
  v.className = 'visor';
  v.innerHTML = `<img src="${esc(src)}" alt="">`;
  v.onclick = () => v.remove();
  document.body.append(v);
}

function mostrarPrevias(input, destino) {
  destino.innerHTML = '';
  for (const f of input.files) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    destino.append(img);
  }
}

async function subirFotos(ordenId, archivos, categoria) {
  if (!archivos?.length) return null;
  const fd = new FormData();
  fd.append('categoria', categoria);
  for (const f of archivos) fd.append('fotos', f);
  return api(`/api/ordenes/${ordenId}/fotos`, { method: 'POST', body: fd });
}

/* =====================================================================
   Enrutador y tiempo real
   ===================================================================== */

let vista = {}; // { alCambio(evento) } de la vista activa
let ignorarHasta = 0; // evita reaccionar a los eventos causados por uno mismo
const marcarPropio = () => { ignorarHasta = Date.now() + 2000; };

const RUTAS = [
  [/^#?\/?$/, () => vistaTablero(), 'tablero'],
  [/^#\/ordenes\/nueva(?:\?cliente=(\d+))?$/, (m) => vistaFormOrden(null, m[1]), 'tablero'],
  [/^#\/ordenes\/(\d+)$/, (m) => vistaOrden(m[1]), 'tablero'],
  [/^#\/ordenes\/(\d+)\/editar$/, (m) => vistaFormOrden(m[1]), 'tablero'],
  [/^#\/clientes$/, () => vistaClientes(), 'clientes'],
  [/^#\/clientes\/(\d+)$/, (m) => vistaCliente(m[1]), 'clientes'],
  [/^#\/asesores$/, () => vistaAsesores(), 'asesores'],
];

async function enrutar() {
  if (CFG.requiereLogin && !CFG.sesion) return vistaLogin();
  const hash = location.hash || '#/';
  const ruta = RUTAS.find(([re]) => re.test(hash));
  vista = {};
  document.body.classList.remove('hoja-taller');
  $$('.barra nav a').forEach((a) => a.classList.toggle('activo', ruta && a.dataset.nav === ruta[2]));
  window.scrollTo(0, 0);
  if (!ruta) { app().innerHTML = '<p class="vacio">Página no encontrada. <a href="#/">Volver</a></p>'; return; }
  try {
    await ruta[1](hash.match(ruta[0]));
  } catch (e) {
    if (e.message !== 'Sesión requerida') app().innerHTML = `<p class="vacio">${esc(e.message)} · <a href="#/">Volver</a></p>`;
  }
}

function conectarEnVivo() {
  const indicador = $('#en-vivo');
  const es = new EventSource('/api/eventos');
  es.onopen = () => indicador.classList.add('ok');
  es.onerror = () => indicador.classList.remove('ok');
  es.addEventListener('orden', (e) => {
    const d = JSON.parse(e.data);
    if (Date.now() < ignorarHasta) return;
    vista.alCambio?.(d);
  });
  es.addEventListener('cliente', (e) => {
    if (Date.now() < ignorarHasta) return;
    vista.alCambio?.({ cliente_id: JSON.parse(e.data).id, motivo: 'cliente' });
  });
}

function antirrebote(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* =====================================================================
   Inicio de sesión
   ===================================================================== */

function vistaLogin() {
  $('.barra').style.display = 'none';
  app().innerHTML = `
    <form class="tarjeta login" id="form-login">
      <h1>${esc(CFG.nombreNegocio)}</h1>
      <p class="muted">Órdenes de trabajo · acceso interno</p>
      ${campo('Contraseña', 'password', '', { tipo: 'password', extra: 'autofocus required' })}
      <p><button class="btn btn-oro" style="width:100%">Entrar</button></p>
    </form>`;
  $('#form-login').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/login', { method: 'POST', body: serializar(e.target) });
      location.reload();
    } catch (err) { toast(err.message, true); }
  };
}

/* =====================================================================
   Tablero de órdenes
   ===================================================================== */

const filtros = { q: '', estado: 'activas', tipo: '', asesor: '', orden: 'entrega_asc' };

const ORDENAMIENTOS = [
  { id: 'entrega_asc', nombre: '↑ Entrega más próxima' },
  { id: 'entrega_desc', nombre: '↓ Entrega más lejana' },
  { id: 'reciente', nombre: 'Creadas recientemente' },
  { id: 'antiguas', nombre: 'Creadas hace más tiempo' },
];

async function vistaTablero() {
  const [resumen, asesores] = await Promise.all([api('/api/resumen'), api('/api/asesores')]);
  const pe = resumen.porEstado;
  const activas = CFG.ESTADOS.filter((e) => e.id !== 'entregado').reduce((s, e) => s + (pe[e.id] || 0), 0);

  app().innerHTML = `
    <div class="encabezado">
      <div><h1>Órdenes de trabajo</h1><p class="muted" style="margin:0">Seguimiento de la producción en tiempo real</p></div>
    </div>
    <div class="kpis">
      <div class="kpi" data-estado="activas"><div class="v">${activas}</div><div class="l">Órdenes activas</div></div>
      <div class="kpi ${resumen.atrasadas ? 'alerta' : ''}" data-estado="atrasadas"><div class="v">${resumen.atrasadas}</div><div class="l">Atrasadas (fecha al cliente vencida)</div></div>
      <div class="kpi ${resumen.proximas ? 'aviso-kpi' : ''}" data-estado="proximas"><div class="v">${resumen.proximas}</div><div class="l">Entregas en los próximos 7 días</div></div>
      <div class="kpi"><div class="v" style="font-size:24px">${dinero(resumen.saldoPendiente)}</div><div class="l">Saldo por cobrar</div></div>
    </div>
    <div class="embudo">
      ${CFG.ESTADOS.map((e) => `<button data-estado="${e.id}" class="${filtros.estado === e.id ? 'activo' : ''}"><b>${pe[e.id] || 0}</b>${esc(e.nombre)}</button>`).join('')}
    </div>
    <div class="tarjeta">
      <div class="filtros">
        <input id="f-q" type="search" placeholder="Buscar por N.º de orden, cliente, teléfono o correo" value="${esc(filtros.q)}">
        <select id="f-estado">
          <option value="activas">Todas las activas</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="proximas">Por entregar en 7 días</option>
          <option value="">Todas (incluye entregadas)</option>
          ${opciones(CFG.ESTADOS)}
        </select>
        <select id="f-tipo">${opciones(CFG.TIPOS_ORDEN, filtros.tipo, 'Todos los tipos')}</select>
        <select id="f-asesor">${opciones(asesores.map((a) => ({ id: a.id, nombre: a.nombre })), filtros.asesor, 'Todos los asesores')}</select>
        <select id="f-orden" title="Ordenar por fecha" aria-label="Ordenar por fecha">${opciones(ORDENAMIENTOS, filtros.orden)}</select>
      </div>
      <div class="leyenda">
        <span><i class="u-vencida"></i>Entrega vencida</span>
        <span><i class="u-vispera"></i>En víspera (hoy a 2 días)</span>
        <span><i class="u-pronto"></i>Próxima (3 a 7 días)</span>
      </div>
      <div id="lista-ordenes" class="tabla-wrap"><p class="cargando">Cargando…</p></div>
    </div>`;

  $('#f-estado').value = filtros.estado;
  const aplicar = () => {
    Object.assign(filtros, { q: $('#f-q').value, estado: $('#f-estado').value, tipo: $('#f-tipo').value, asesor: $('#f-asesor').value, orden: $('#f-orden').value });
    $$('.embudo button').forEach((b) => b.classList.toggle('activo', b.dataset.estado === filtros.estado));
    cargarListaOrdenes();
  };
  $('#f-q').oninput = antirrebote(aplicar);
  ['#f-estado', '#f-tipo', '#f-asesor', '#f-orden'].forEach((s) => { $(s).onchange = aplicar; });
  $$('[data-estado]').forEach((el) => {
    el.onclick = () => {
      filtros.estado = filtros.estado === el.dataset.estado && el.tagName === 'BUTTON' ? 'activas' : el.dataset.estado;
      $('#f-estado').value = filtros.estado;
      aplicar();
    };
  });

  await cargarListaOrdenes();
  vista.alCambio = antirrebote(() => { if (location.hash === '' || location.hash === '#/') vistaTablero(); }, 500);
}

async function cargarListaOrdenes() {
  const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
  const ordenes = await api('/api/ordenes?' + params);
  const cont = $('#lista-ordenes');
  if (!cont) return;
  if (!ordenes.length) {
    cont.innerHTML = '<p class="vacio">No hay órdenes con estos filtros. <a href="#/ordenes/nueva">Crear una orden</a></p>';
    return;
  }
  cont.innerHTML = `
    <table>
      <thead><tr><th></th><th>Orden</th><th>Cliente</th><th>Tipo</th><th>Asesor</th><th>Estado</th>
        <th>Fecha taller</th><th>Fecha cliente</th><th class="num">Total</th><th class="num">Saldo</th></tr></thead>
      <tbody>
        ${ordenes.map((o) => `
          <tr class="clic fila-${urgencia(o.fecha_cliente, o.estado) || 'normal'}" data-id="${o.id}">
            <td>${o.foto ? `<img class="miniatura" src="/uploads/${esc(o.foto)}" alt="" loading="lazy">` : '<div class="miniatura vacia">◇</div>'}</td>
            <td style="white-space:nowrap"><b>${esc(o.numero)}</b><div class="muted chico">${fecha(o.fecha_creacion)}</div></td>
            <td>${esc(o.cliente)}<div class="muted chico">${esc(o.cliente_telefono || '')}</div></td>
            <td><span class="badge t-tipo">${esc(tipoTexto(o))}</span></td>
            <td>${esc(o.asesor || '—')}</td>
            <td>${badgeEstado(o.estado)}</td>
            <td>${o.estado === 'entregado' ? fecha(o.fecha_taller) : fechaEntrega(o.fecha_taller, ['enviado_oficina', 'recibido_oficina'].includes(o.estado) ? 'entregado' : o.estado)}</td>
            <td>${fechaEntrega(o.fecha_cliente, o.estado)}</td>
            <td class="num">${dinero(o.total)}</td>
            <td class="num ${o.total - o.pagado > 0.009 ? 'vencida' : ''}">${dinero(o.total - o.pagado)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  $$('tr.clic', cont).forEach((tr) => { tr.onclick = () => { location.hash = `#/ordenes/${tr.dataset.id}`; }; });
}

/* =====================================================================
   Formulario de orden (nueva / editar)
   ===================================================================== */

function anilloVacio(etiqueta) {
  return { etiqueta, talla: '', material: CFG.MATERIALES[0], ancho: '', espesor: '', grabado: '', diamantes_cantidad: '', diamantes_tamano: '' };
}

function htmlInstrucciones(tipo, subtipo, d) {
  if (!tipo) return '<p class="muted">Seleccione el tipo de orden para ver las instrucciones de fabricación.</p>';

  if (tipo === 'fabricacion' && subtipo === 'boda') {
    const anillos = d.anillos?.length ? d.anillos : [anilloVacio('Anillo de ella'), anilloVacio('Anillo de él')];
    return `
      ${anillos.map((a, i) => `
        <div class="bloque-anillo">
          <div class="grid g4">
            ${campo('Identificación', `detalles.anillos.${i}.etiqueta`, a.etiqueta, { clase: 'span2' })}
            ${campo('Talla', `detalles.anillos.${i}.talla`, a.talla)}
            ${campo('Tipo de material', `detalles.anillos.${i}.material`, a.material, { lista: 'materiales' })}
            ${campo('Ancho (mm)', `detalles.anillos.${i}.ancho`, a.ancho, { tipo: 'number' })}
            ${campo('Espesor (mm)', `detalles.anillos.${i}.espesor`, a.espesor, { tipo: 'number' })}
            ${campo('Cantidad de diamantes', `detalles.anillos.${i}.diamantes_cantidad`, a.diamantes_cantidad, { tipo: 'number' })}
            ${campo('Tamaño de diamantes', `detalles.anillos.${i}.diamantes_tamano`, a.diamantes_tamano, { extra: 'placeholder="ej. 1.5 mm / 0.015 ct"' })}
            ${campo('Grabado interno', `detalles.anillos.${i}.grabado`, a.grabado, { clase: 'span-todo', extra: 'placeholder="Texto, fecha, tipografía…"' })}
          </div>
          ${anillos.length > 1 ? `<p style="margin:8px 0 0"><button type="button" class="btn btn-chico btn-peligro" data-quitar-anillo="${i}">Quitar este anillo</button></p>` : ''}
        </div>`).join('')}
      <p><button type="button" class="btn btn-chico" id="agregar-anillo">+ Agregar anillo</button></p>
      ${campo('Instrucciones adicionales de fabricación', 'detalles.instrucciones', d.instrucciones, { tipo: 'textarea' })}`;
  }

  if (tipo === 'fabricacion' && subtipo === 'compromiso') {
    const g = d.gema || {};
    const cert = d.certificado || {};
    const s = d.secundarios || {};
    return `
      <div class="grid g3">
        ${campo('Talla', 'detalles.talla', d.talla)}
        ${campo('Material', 'detalles.material', d.material ?? CFG.MATERIALES[0], { lista: 'materiales', clase: 'span2' })}
      </div>
      <div class="sub">Gema principal</div>
      <div class="grid g4">
        ${campo('Gema', 'detalles.gema.tipo', g.tipo ?? 'Diamante')}
        ${campo('Forma', 'detalles.gema.forma', g.forma, { lista: 'formas' })}
        ${campo('Peso (ct)', 'detalles.gema.peso', g.peso, { tipo: 'number' })}
        ${campo('Medidas (mm)', 'detalles.gema.medidas', g.medidas)}
        ${campo('Color', 'detalles.gema.color', g.color, { extra: 'placeholder="ej. F"' })}
        ${campo('Pureza', 'detalles.gema.pureza', g.pureza, { extra: 'placeholder="ej. VS1"' })}
        ${campo('Laboratorio del certificado', 'detalles.certificado.laboratorio', cert.laboratorio, { lista: 'labs' })}
        ${campo('Código del certificado de autenticidad', 'detalles.certificado.codigo', cert.codigo)}
      </div>
      <div class="sub">Diamantes secundarios</div>
      <div class="grid g4">
        ${campo('Cantidad', 'detalles.secundarios.cantidad', s.cantidad, { tipo: 'number' })}
        ${campo('Peso total (ct)', 'detalles.secundarios.peso', s.peso, { tipo: 'number' })}
        ${campo('Tamaño c/u', 'detalles.secundarios.tamano', s.tamano, { extra: 'placeholder="ej. 1.2 mm"' })}
        ${campo('Engaste', 'detalles.secundarios.engaste', s.engaste, { extra: 'placeholder="pavé, micropavé…"' })}
      </div>
      <div style="margin-top:14px">${campo('Instrucciones adicionales de fabricación', 'detalles.instrucciones', d.instrucciones, { tipo: 'textarea' })}</div>`;
  }

  if (tipo === 'fabricacion') {
    return `
      <div class="grid g2">
        ${campo('Descripción de la pieza', 'detalles.descripcion', d.descripcion)}
        ${campo('Material', 'detalles.material', d.material ?? CFG.MATERIALES[0], { lista: 'materiales' })}
      </div>
      <div style="margin-top:14px">${campo('Instrucciones de fabricación', 'detalles.instrucciones', d.instrucciones, { tipo: 'textarea' })}</div>`;
  }

  // Compostura o mantenimiento
  const materiales = d.materiales?.length ? d.materiales : [{}];
  return `
    ${campo('Artículo recibido', 'detalles.articulo', d.articulo, { extra: 'placeholder="ej. Anillo de compromiso oro blanco con solitario"' })}
    <div style="margin-top:14px">${campo('Instrucciones', 'detalles.instrucciones', d.instrucciones, { tipo: 'textarea', extra: 'rows="5" placeholder="Describa el trabajo a realizar…"' })}</div>
    <div class="sub">Materiales recibidos</div>
    ${materiales.map((m, i) => `
      <div class="fila-material">
        ${campo('Descripción', `detalles.materiales.${i}.descripcion`, m.descripcion, { extra: 'placeholder="ej. Oro 18k, diamante suelto"' })}
        ${campo('Cantidad', `detalles.materiales.${i}.cantidad`, m.cantidad, { tipo: 'number' })}
        ${campo('Peso (g)', `detalles.materiales.${i}.peso`, m.peso, { tipo: 'number' })}
        ${campo('Observaciones', `detalles.materiales.${i}.observaciones`, m.observaciones)}
        <button type="button" class="btn btn-chico btn-peligro" data-quitar-material="${i}" title="Quitar">✕</button>
      </div>`).join('')}
    <p><button type="button" class="btn btn-chico" id="agregar-material">+ Agregar material</button></p>`;
}

async function vistaFormOrden(id, clientePre) {
  const editando = Boolean(id);
  const [asesores, orden, clienteSel] = await Promise.all([
    api('/api/asesores'),
    editando ? api(`/api/ordenes/${id}`) : null,
    clientePre ? api(`/api/clientes/${clientePre}`) : null,
  ]);
  const o = orden || {
    tipo: '', subtipo: '', estado: 'cotizado', fecha_creacion: hoyISO(), detalles: {},
    precio_modo: 'fijo', notificar: 1, asesor_id: '',
  };
  let cliente = orden?.cliente || clienteSel || {};
  let clienteId = orden ? null : clienteSel?.id || null; // al editar, los datos del cliente se actualizan directamente
  const activos = asesores.filter((a) => a.activo || a.id === o.asesor_id);

  app().innerHTML = `
    <div class="encabezado">
      <div><h1>${editando ? `Editar orden ${esc(o.numero)}` : 'Nueva orden de trabajo'}</h1></div>
    </div>
    <form id="form-orden" novalidate>
      ${datalists()}
      <div class="tarjeta">
        <div class="cab"><h2>Cliente</h2>
          ${editando ? '' : '<div style="position:relative;flex:1;max-width:380px"><input id="buscar-cliente" type="search" placeholder="Buscar cliente registrado…" autocomplete="off"><div id="sugerencias" class="tarjeta" style="position:absolute;z-index:5;left:0;right:0;padding:6px;display:none"></div></div>'}
        </div>
        <div id="cliente-campos"></div>
      </div>

      <div class="tarjeta">
        <h2>Datos de la orden</h2>
        <div class="grid g4">
          <div class="span2"><label>Tipo de orden</label>
            <div class="modo">${CFG.TIPOS_ORDEN.map((t) => `<label><input type="radio" name="tipo" value="${t.id}" ${o.tipo === t.id ? 'checked' : ''}>${esc(t.nombre)}</label>`).join('')}</div>
          </div>
          <div class="span2" id="caja-subtipo"><label>¿Qué se fabrica?</label>
            <div class="modo">${CFG.TIPOS_FABRICACION.map((t) => `<label><input type="radio" name="subtipo" value="${t.id}" ${o.subtipo === t.id ? 'checked' : ''}>${esc(t.nombre)}</label>`).join('')}</div>
          </div>
          <div><label for="f-asesor_id">Asesor responsable</label>
            <select id="f-asesor_id" name="asesor_id">${opciones(activos.map((a) => ({ id: a.id, nombre: a.nombre })), o.asesor_id, '— Sin asignar —')}</select>
            ${asesores.length ? '' : '<div class="chico muted">Registre asesores en <a href="#/asesores">Asesores</a></div>'}
          </div>
          ${editando ? `<div><label>Estado actual</label><div style="padding-top:6px">${badgeEstado(o.estado)}</div></div>`
            : `<div><label for="f-estado">Estado inicial</label><select id="f-estado" name="estado">${opciones(CFG.ESTADOS, o.estado)}</select></div>`}
          ${campo('Fecha de creación', 'fecha_creacion', o.fecha_creacion, { tipo: 'date' })}
          ${campo('Fecha pedida al taller', 'fecha_taller', o.fecha_taller, { tipo: 'date' })}
          ${campo('Fecha ofrecida al cliente', 'fecha_cliente', o.fecha_cliente, { tipo: 'date' })}
          <div class="span-todo"><label class="check"><input type="checkbox" name="notificar" ${o.notificar ? 'checked' : ''}> Notificar automáticamente al cliente cada avance</label></div>
        </div>
      </div>

      <div class="tarjeta">
        <h2 id="titulo-instrucciones">Instrucciones de fabricación</h2>
        <div id="instrucciones"></div>
      </div>

      ${editando ? '' : `
      <div class="tarjeta">
        <h2>Fotografías</h2>
        <div class="grid g2">
          <div><label>Referencia para la producción</label>
            <input type="file" id="fotos-referencia" accept="image/*" multiple><div class="previas" id="prev-referencia"></div></div>
          <div id="caja-estado-actual"><label>Estado actual del artículo</label>
            <input type="file" id="fotos-estado" accept="image/*" multiple><div class="previas" id="prev-estado"></div></div>
        </div>
      </div>`}

      <div class="tarjeta">
        <h2>Valor total a cobrar</h2>
        <div class="modo">
          <label><input type="radio" name="precio_modo" value="fijo" ${o.precio_modo !== 'desglosado' ? 'checked' : ''}>Valor fijo</label>
          <label><input type="radio" name="precio_modo" value="desglosado" ${o.precio_modo === 'desglosado' ? 'checked' : ''}>Desglosado</label>
        </div>
        <div id="precio-fijo" class="grid g4">${campo(`Valor total (${CFG.moneda})`, 'precio_fijo', o.precio_fijo, { tipo: 'number' })}</div>
        <div id="precio-desglosado" class="grid g4">
          ${campo('Gramos de oro', 'gramos', o.gramos, { tipo: 'number' })}
          ${campo('Costo por gramo', 'costo_gramo', o.costo_gramo, { tipo: 'number' })}
          ${campo('Costo de gemas', 'costo_gemas', o.costo_gemas, { tipo: 'number' })}
          <div><label>Total calculado</label><div class="calculo" id="total-calc"></div></div>
        </div>
        <div style="margin-top:14px">${campo('Observaciones generales', 'observaciones', o.observaciones, { tipo: 'textarea', extra: 'rows="2"' })}</div>
      </div>

      <div class="encabezado" style="margin-top:18px">
        <span></span>
        <div class="acciones">
          <a class="btn" href="${editando ? `#/ordenes/${id}` : '#/'}">Cancelar</a>
          <button class="btn btn-oro" id="guardar">${editando ? 'Guardar cambios' : 'Crear orden'}</button>
        </div>
      </div>
    </form>`;

  const form = $('#form-orden');

  // ---- cliente
  function pintarCliente() {
    const bloqueado = Boolean(clienteId);
    const dis = bloqueado ? 'disabled' : '';
    $('#cliente-campos').innerHTML = `
      ${bloqueado ? `<div class="aviso"><span>Cliente registrado: <b>${esc(cliente.nombre)}</b> · <a href="#/clientes/${clienteId}">ver historial</a></span>
        <button type="button" class="btn btn-chico" id="quitar-cliente">Usar otro cliente</button></div>` : ''}
      <div class="grid g3">
        ${campo('Nombre completo *', 'cliente.nombre', cliente.nombre, { extra: dis })}
        ${campo('Teléfono', 'cliente.telefono', cliente.telefono, { tipo: 'tel', extra: dis })}
        ${campo('Correo electrónico', 'cliente.email', cliente.email, { tipo: 'email', extra: dis })}
        <div><label for="f-cliente-tipo_evento">Celebración</label>
          <select id="f-cliente-tipo_evento" name="cliente.tipo_evento" ${dis}>${opciones([{ id: 'boda', nombre: 'Boda' }, { id: 'aniversario', nombre: 'Aniversario' }, { id: 'otro', nombre: 'Otro' }], cliente.tipo_evento, '—')}</select></div>
        ${campo('Fecha de boda o aniversario', 'cliente.fecha_evento', cliente.fecha_evento, { tipo: 'date', extra: dis })}
      </div>`;
    const q = $('#quitar-cliente');
    if (q) q.onclick = () => { clienteId = null; cliente = {}; pintarCliente(); };
  }
  pintarCliente();

  const buscar = $('#buscar-cliente');
  if (buscar) {
    const sug = $('#sugerencias');
    buscar.oninput = antirrebote(async () => {
      const t = buscar.value.trim();
      if (t.length < 2) { sug.style.display = 'none'; return; }
      const res = await api('/api/clientes?q=' + encodeURIComponent(t));
      sug.innerHTML = res.length
        ? res.slice(0, 8).map((c) => `<div class="clic" data-id="${c.id}" style="padding:6px 8px;cursor:pointer;border-radius:6px">
            <b>${esc(c.nombre)}</b> <span class="muted chico">${esc(c.telefono || '')} ${esc(c.email || '')} · ${c.ordenes} orden(es)</span></div>`).join('')
        : '<div class="muted" style="padding:6px 8px">Sin coincidencias: complete los datos para registrar un cliente nuevo.</div>';
      sug.style.display = 'block';
      $$('[data-id]', sug).forEach((el) => {
        el.onmouseenter = () => { el.style.background = 'var(--oro-claro)'; };
        el.onmouseleave = () => { el.style.background = ''; };
        el.onclick = () => {
          cliente = res.find((c) => String(c.id) === el.dataset.id);
          clienteId = cliente.id;
          sug.style.display = 'none';
          buscar.value = '';
          pintarCliente();
        };
      });
    }, 250);
    buscar.onblur = () => setTimeout(() => { $('#sugerencias').style.display = 'none'; }, 200);
  }

  // ---- tipo / instrucciones
  const tipoActual = () => form.querySelector('[name=tipo]:checked')?.value || '';
  const subtipoActual = () => form.querySelector('[name=subtipo]:checked')?.value || '';

  function pintarInstrucciones(detalles) {
    const tipo = tipoActual();
    const subtipo = subtipoActual();
    $('#caja-subtipo').style.display = tipo === 'fabricacion' ? '' : 'none';
    const cajaEstado = $('#caja-estado-actual');
    if (cajaEstado) cajaEstado.style.display = tipo && tipo !== 'fabricacion' ? '' : 'none';
    $('#titulo-instrucciones').textContent = tipo === 'fabricacion'
      ? `Instrucciones de fabricación${subtipo ? ' · ' + nombreDe('TIPOS_FABRICACION', subtipo) : ''}`
      : tipo ? `Instrucciones de ${nombreDe('TIPOS_ORDEN', tipo).toLowerCase()}` : 'Instrucciones';
    $('#instrucciones').innerHTML = tipo === 'fabricacion' && !subtipo
      ? '<p class="muted">Seleccione qué se va a fabricar.</p>'
      : htmlInstrucciones(tipo, subtipo, detalles || {});
  }
  const detallesActuales = () => serializar(form).detalles || {};

  pintarInstrucciones(o.detalles);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo' || e.target.name === 'subtipo') pintarInstrucciones(detallesActuales());
    if (e.target.name === 'precio_modo') pintarPrecio();
  });
  form.addEventListener('click', (e) => {
    const t = e.target;
    const d = detallesActuales();
    if (t.id === 'agregar-anillo') {
      d.anillos = [...(d.anillos || []), anilloVacio(`Anillo ${(d.anillos?.length || 0) + 1}`)];
      pintarInstrucciones(d);
    } else if (t.dataset.quitarAnillo !== undefined) {
      d.anillos.splice(Number(t.dataset.quitarAnillo), 1);
      pintarInstrucciones(d);
    } else if (t.id === 'agregar-material') {
      d.materiales = [...(d.materiales || []), {}];
      pintarInstrucciones(d);
    } else if (t.dataset.quitarMaterial !== undefined) {
      d.materiales.splice(Number(t.dataset.quitarMaterial), 1);
      pintarInstrucciones(d);
    }
  });

  // ---- precio
  function pintarPrecio() {
    const modo = form.querySelector('[name=precio_modo]:checked').value;
    $('#precio-fijo').style.display = modo === 'fijo' ? '' : 'none';
    $('#precio-desglosado').style.display = modo === 'desglosado' ? '' : 'none';
    const g = numero(form.gramos.value);
    const cg = numero(form.costo_gramo.value);
    const gem = numero(form.costo_gemas.value);
    $('#total-calc').innerHTML = `${g} g × ${dinero(cg)} + ${dinero(gem)} = <b>${dinero(g * cg + gem)}</b>`;
  }
  pintarPrecio();
  ['gramos', 'costo_gramo', 'costo_gemas'].forEach((n) => form[n].addEventListener('input', pintarPrecio));

  // ---- fotos (solo al crear)
  if (!editando) {
    $('#fotos-referencia').onchange = (e) => mostrarPrevias(e.target, $('#prev-referencia'));
    $('#fotos-estado').onchange = (e) => mostrarPrevias(e.target, $('#prev-estado'));
  }

  // ---- guardar
  form.onsubmit = async (e) => {
    e.preventDefault();
    const datos = serializar(form);
    if (!datos.tipo) return toast('Seleccione el tipo de orden', true);
    if (datos.tipo === 'fabricacion' && !datos.subtipo) return toast('Seleccione qué se va a fabricar', true);
    if (clienteId) { datos.cliente_id = clienteId; delete datos.cliente; }
    else if (!datos.cliente?.nombre?.trim()) return toast('Ingrese el nombre del cliente', true);
    datos.usuario = leerLocal('ot_usuario');

    const btn = $('#guardar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      marcarPropio();
      const res = await api(editando ? `/api/ordenes/${id}` : '/api/ordenes', { method: editando ? 'PUT' : 'POST', body: datos });
      if (!editando) {
        await subirFotos(res.id, $('#fotos-referencia').files, 'referencia');
        if (datos.tipo !== 'fabricacion') await subirFotos(res.id, $('#fotos-estado').files, 'estado_actual');
      }
      toast(editando ? 'Cambios guardados' : `Orden ${res.numero} creada`);
      location.hash = `#/ordenes/${res.id}`;
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = editando ? 'Guardar cambios' : 'Crear orden';
    }
  };
}

/* =====================================================================
   Detalle de orden
   ===================================================================== */

function dlFila(etiqueta, valor, clase = '') {
  if (valor === undefined || valor === null || valor === '') return '';
  return `<dt class="${clase}">${esc(etiqueta)}</dt><dd class="${clase}">${valor}</dd>`;
}

function htmlDetalleInstrucciones(o) {
  const d = o.detalles || {};
  const texto = (t) => (t ? `<div class="instrucciones">${esc(t)}</div>` : '');
  const e = esc;

  if (o.tipo === 'fabricacion' && o.subtipo === 'boda') {
    return `${(d.anillos || []).map((a) => `
      <div class="bloque-anillo"><h4>${e(a.etiqueta || 'Anillo')}</h4>
        <dl class="dl">
          ${dlFila('Talla', e(a.talla))}
          ${dlFila('Material', e(a.material))}
          ${dlFila('Ancho', a.ancho ? e(a.ancho) + ' mm' : '')}
          ${dlFila('Espesor', a.espesor ? e(a.espesor) + ' mm' : '')}
          ${dlFila('Diamantes', a.diamantes_cantidad ? `${e(a.diamantes_cantidad)} × ${e(a.diamantes_tamano || '—')}` : '')}
          ${dlFila('Grabado interno', a.grabado ? `<i>“${e(a.grabado)}”</i>` : '')}
        </dl></div>`).join('')}
      ${d.instrucciones ? `<div class="sub">Instrucciones adicionales</div>${texto(d.instrucciones)}` : ''}`;
  }

  if (o.tipo === 'fabricacion' && o.subtipo === 'compromiso') {
    const g = d.gema || {};
    const c = d.certificado || {};
    const s = d.secundarios || {};
    return `
      <dl class="dl">${dlFila('Talla', e(d.talla))}${dlFila('Material', e(d.material))}</dl>
      <div class="sub">Gema principal</div>
      <dl class="dl">
        ${dlFila('Gema', e(g.tipo))}${dlFila('Forma', e(g.forma))}
        ${dlFila('Peso', g.peso ? e(g.peso) + ' ct' : '')}${dlFila('Medidas', g.medidas ? e(g.medidas) + ' mm' : '')}
        ${dlFila('Color / pureza', [g.color, g.pureza].filter(Boolean).map(e).join(' · '))}
        ${dlFila('Certificado', [c.laboratorio, c.codigo].filter(Boolean).map(e).join(' · '))}
      </dl>
      ${s.cantidad || s.peso ? `<div class="sub">Diamantes secundarios</div>
      <dl class="dl">
        ${dlFila('Cantidad', e(s.cantidad))}${dlFila('Peso total', s.peso ? e(s.peso) + ' ct' : '')}
        ${dlFila('Tamaño c/u', e(s.tamano))}${dlFila('Engaste', e(s.engaste))}
      </dl>` : ''}
      ${d.instrucciones ? `<div class="sub">Instrucciones adicionales</div>${texto(d.instrucciones)}` : ''}`;
  }

  if (o.tipo === 'fabricacion') {
    return `<dl class="dl">${dlFila('Pieza', e(d.descripcion))}${dlFila('Material', e(d.material))}</dl>
      ${texto(d.instrucciones)}`;
  }

  const mats = (d.materiales || []).filter((m) => m.descripcion || m.cantidad || m.peso);
  return `
    <dl class="dl">${dlFila('Artículo', e(d.articulo))}</dl>
    ${texto(d.instrucciones) || '<p class="muted">Sin instrucciones.</p>'}
    <div class="sub">Materiales recibidos</div>
    ${mats.length ? `<table><thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">Peso (g)</th><th>Observaciones</th></tr></thead><tbody>
      ${mats.map((m) => `<tr><td>${e(m.descripcion)}</td><td class="num">${e(m.cantidad)}</td><td class="num">${e(m.peso)}</td><td>${e(m.observaciones)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">No se registraron materiales.</p>'}`;
}

function htmlFotos(o) {
  const categorias = o.tipo === 'fabricacion'
    ? CFG.CATEGORIAS_FOTO.filter((c) => c.id !== 'estado_actual')
    : CFG.CATEGORIAS_FOTO;
  return categorias.map((c) => {
    const fotos = o.fotos.filter((f) => f.categoria === c.id);
    return `
      <div class="sub">${esc(c.nombre)}</div>
      ${fotos.length ? `<div class="fotos">${fotos.map((f) => `
        <div class="foto"><img src="/uploads/${esc(f.archivo)}" alt="${esc(f.nombre_original || '')}" loading="lazy">
          <button type="button" class="no-print" data-borrar-foto="${f.id}" title="Eliminar foto">✕</button></div>`).join('')}</div>`
        : '<p class="muted chico">Sin fotos.</p>'}
      <div class="subir no-print">
        <input type="file" accept="image/*" multiple data-categoria="${c.id}">
        <button type="button" class="btn btn-chico" data-subir="${c.id}">Subir</button>
      </div>`;
  }).join('');
}

function waEnlace(tel, texto) {
  return `https://wa.me/${String(tel || '').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}

function htmlPagos(o) {
  return `
    <div class="totales">
      <div><span class="muted chico">Total</span><b>${dinero(o.total)}</b></div>
      <div><span class="muted chico">Pagado</span><b>${dinero(o.pagado)}</b></div>
      <div class="saldo ${o.saldo <= 0.009 ? 'cero' : ''}"><span class="muted chico">Saldo</span><b>${dinero(o.saldo)}</b></div>
    </div>
    <p class="chico muted" style="margin-top:-6px">
      ${o.precio_modo === 'desglosado'
        ? `Desglose: ${numero(o.gramos)} g × ${dinero(o.costo_gramo)} = ${dinero(numero(o.gramos) * numero(o.costo_gramo))} · Gemas ${dinero(o.costo_gemas)}`
        : 'Valor fijo'}
    </p>
    ${o.pagos.length ? `<div class="tabla-wrap"><table>
      <thead><tr><th>Fecha</th><th>Forma</th><th class="num">Abono</th><th class="num">Recargo</th><th class="num">Cobrado</th><th>Detalle</th><th></th></tr></thead>
      <tbody>${o.pagos.map((p) => `<tr>
        <td>${fecha(p.fecha)}</td>
        <td>${esc(nombreDe('FORMAS_PAGO', p.forma))}</td>
        <td class="num">${dinero(p.monto)}</td>
        <td class="num">${p.recargo ? dinero(p.recargo) : '—'}</td>
        <td class="num"><b>${dinero(p.total_cobrado)}</b></td>
        <td class="chico">${p.forma === 'oro' ? `${esc(p.oro_gramos)} g ${esc(p.oro_kilataje || '')} × ${dinero(p.oro_valor_gramo)}` : ''} ${esc(p.referencia || '')} ${esc(p.notas || '')}</td>
        <td class="no-print"><button class="btn btn-chico btn-peligro" data-borrar-pago="${p.id}" title="Eliminar pago">✕</button></td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay pagos registrados.</p>'}

    <form id="form-pago" class="no-print" style="margin-top:14px;border-top:1px solid var(--linea);padding-top:14px">
      <div class="sub" style="margin-top:0">Registrar pago</div>
      <div class="grid g4">
        <div><label for="p-forma">Forma de pago</label><select id="p-forma" name="forma">${opciones(CFG.FORMAS_PAGO)}</select></div>
        ${campo('Fecha', 'fecha', hoyISO(), { tipo: 'date' })}
        <div id="caja-monto">${campo('Monto a abonar', 'monto', o.saldo > 0 ? o.saldo.toFixed(2) : '', { tipo: 'number' })}</div>
        ${campo('Referencia / comprobante', 'referencia', '')}
      </div>
      <div id="caja-oro" class="grid g4" style="margin-top:10px">
        ${campo('Gramos de oro', 'oro_gramos', '', { tipo: 'number' })}
        <div><label for="p-kil">Kilataje</label><select id="p-kil" name="oro_kilataje">${opciones(['18k', '14k', '24k', '10k', 'Otro'], '18k')}</select></div>
        ${campo('Valor por gramo', 'oro_valor_gramo', '', { tipo: 'number' })}
      </div>
      <div class="calculo" id="calc-pago" style="margin-top:10px"></div>
      <p style="margin-bottom:0"><button class="btn btn-oro">Registrar pago</button></p>
    </form>`;
}

function htmlNotificaciones(o) {
  const icono = { email: '✉', whatsapp: '☏' };
  const res = { enviado: 'Enviado', manual: 'Pendiente de envío manual', error: 'Error' };
  return `
    ${o.notificaciones.length ? `<ul class="linea-tiempo">${o.notificaciones.map((n) => `
      <li><div class="chico muted">${fechaHora(n.fecha)} · ${icono[n.canal] || ''} ${esc(n.canal)} · ${esc(n.destino || '')}</div>
        <div><span class="badge ${n.resultado === 'enviado' ? 'e-recibido_oficina' : n.resultado === 'error' ? 'e-cotizado' : 'e-en_proceso'}">${res[n.resultado] || esc(n.resultado)}</span>
          ${badgeEstado(n.estado_orden)}</div>
        ${n.resultado !== 'enviado' ? `<div style="margin-top:4px">
          ${n.canal === 'whatsapp' ? `<a class="btn btn-chico btn-wa" target="_blank" rel="noopener" href="${waEnlace(n.destino, n.mensaje)}">Enviar por WhatsApp</a>` : ''}
          ${n.canal === 'email' ? `<a class="btn btn-chico" href="mailto:${esc(n.destino)}?subject=${encodeURIComponent(`Orden ${o.numero}`)}&body=${encodeURIComponent(n.mensaje)}">Enviar correo</a>` : ''}
          ${n.detalle && n.resultado === 'error' ? `<div class="chico vencida">${esc(n.detalle)}</div>` : ''}
        </div>` : ''}
      </li>`).join('')}</ul>` : '<p class="muted">Sin notificaciones enviadas.</p>'}
    <button class="btn btn-chico" id="reenviar">Reenviar aviso del estado actual</button>
    <p class="chico muted">Canales automáticos: correo ${CFG.smtp ? '✓ activo' : '✗ sin configurar'} · WhatsApp ${CFG.whatsapp ? '✓ activo' : '✗ sin configurar (envío con un clic)'}</p>`;
}

async function vistaOrden(id) {
  const o = await api(`/api/ordenes/${id}`);
  const idx = CFG.ESTADOS.findIndex((e) => e.id === o.estado);
  const siguiente = CFG.ESTADOS[Math.min(idx + 1, CFG.ESTADOS.length - 1)].id;
  const c = o.cliente;
  const mensajeCompartir = `Hola ${c.nombre.split(' ')[0]}, puedes seguir el avance de tu orden ${o.numero} aquí: ${o.enlace_seguimiento}`;

  app().innerHTML = `
    <div class="solo-print" style="margin-bottom:10px"><h2>${esc(CFG.nombreNegocio)} · Orden de trabajo</h2>
      <span class="chico">Impreso el ${fechaHora(new Date().toISOString())}</span></div>
    <div class="encabezado">
      <div>
        <p class="muted chico no-print" style="margin:0"><a href="#/">← Órdenes</a></p>
        <h1>${esc(o.numero)} <span class="badge t-tipo" style="vertical-align:middle">${esc(tipoTexto(o))}</span> ${badgeEstado(o.estado)}</h1>
      </div>
      <div class="acciones no-print">
        <a class="btn" href="#/ordenes/${o.id}/editar">Editar</a>
        <button class="btn" id="imprimir-taller" title="Sin precios ni datos de contacto">Hoja para taller</button>
        <button class="btn" id="imprimir">Imprimir / PDF</button>
        <button class="btn" id="copiar-enlace">Copiar enlace de seguimiento</button>
        ${c.telefono ? `<a class="btn btn-wa" target="_blank" rel="noopener" href="${waEnlace(o.cliente_whatsapp || c.telefono, mensajeCompartir)}">Compartir por WhatsApp</a>` : ''}
      </div>
    </div>
    <div id="aviso-cambios"></div>

    <div class="pasos">${CFG.ESTADOS.map((e, i) => `<div class="paso ${i <= idx ? 'hecho' : ''} ${i === idx ? 'actual' : ''}"><span>${esc(e.nombre)}</span></div>`).join('')}</div>

    <div class="detalle">
      <div>
        <form class="tarjeta no-print" id="form-estado">
          <div class="cab"><h3>Actualizar estado</h3></div>
          <div class="grid g3">
            <div><label for="n-estado">Nuevo estado</label><select id="n-estado" name="estado">${opciones(CFG.ESTADOS, siguiente)}</select></div>
            ${campo('Registrado por', 'usuario', leerLocal('ot_usuario'), { extra: 'placeholder="Su nombre"' })}
            ${campo('Comentario', 'comentario', '', { extra: 'placeholder="Opcional"' })}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:10px;flex-wrap:wrap">
            <label class="check"><input type="checkbox" name="notificar" ${o.notificar ? 'checked' : 'disabled'}> Notificar al cliente ${o.notificar ? '' : '(desactivado en esta orden)'}</label>
            <button class="btn btn-oro">Actualizar estado</button>
          </div>
        </form>

        <div class="tarjeta">
          <h2>${o.tipo === 'fabricacion' ? 'Instrucciones de fabricación' : `Instrucciones de ${esc(nombreDe('TIPOS_ORDEN', o.tipo).toLowerCase())}`}</h2>
          ${htmlDetalleInstrucciones(o)}
          ${o.observaciones ? `<div class="sub">Observaciones</div><div class="instrucciones">${esc(o.observaciones)}</div>` : ''}
        </div>

        <div class="tarjeta" id="caja-fotos"><h2>Fotografías</h2>${htmlFotos(o)}</div>

        <div class="tarjeta solo-oficina" id="caja-pagos"><h2>Valor y pagos</h2>${htmlPagos(o)}</div>
      </div>

      <div>
        <div class="tarjeta">
          <div class="cab"><h3>Cliente</h3><a class="chico no-print" href="#/clientes/${c.id}">Historial (${o.servicios_previos} servicio${o.servicios_previos === 1 ? '' : 's'} previo${o.servicios_previos === 1 ? '' : 's'}) →</a></div>
          <dl class="dl">
            ${dlFila('Nombre', `<b>${esc(c.nombre)}</b>`)}
            ${dlFila('Teléfono', esc(c.telefono), 'solo-oficina')}
            ${dlFila('Correo', esc(c.email), 'solo-oficina')}
            ${dlFila(c.tipo_evento === 'aniversario' ? 'Aniversario' : c.tipo_evento === 'otro' ? 'Celebración' : 'Fecha de boda', c.fecha_evento ? fecha(c.fecha_evento) : '')}
          </dl>
        </div>
        <div class="tarjeta">
          <h3>Fechas y responsable</h3>
          <dl class="dl">
            ${dlFila('Creación', fecha(o.fecha_creacion))}
            ${dlFila('Pedida al taller', fechaEntrega(o.fecha_taller, ['enviado_oficina', 'recibido_oficina', 'entregado'].includes(o.estado) ? 'entregado' : o.estado))}
            ${dlFila('Ofrecida al cliente', fechaEntrega(o.fecha_cliente, o.estado))}
            ${dlFila('Asesor', esc(o.asesor_nombre || 'Sin asignar'))}
          </dl>
        </div>
        <div class="tarjeta">
          <h3>Historial de estados</h3>
          <ul class="linea-tiempo">${o.historial.map((h) => `
            <li>${badgeEstado(h.estado)} <span class="chico muted">${fechaHora(h.fecha)}${h.usuario ? ' · ' + esc(h.usuario) : ''}</span>
              ${h.comentario ? `<div class="chico">${esc(h.comentario)}</div>` : ''}</li>`).join('')}</ul>
        </div>
        <div class="tarjeta solo-oficina no-print"><h3>Notificaciones al cliente</h3>${htmlNotificaciones(o)}</div>
      </div>
    </div>`;

  const recargar = async () => { marcarPropio(); await vistaOrden(id); };
  const accion = async (fn, ok) => {
    try { marcarPropio(); await fn(); if (ok) toast(ok); await vistaOrden(id); } catch (e) { toast(e.message, true); }
  };

  // Acciones de encabezado
  $('#imprimir').onclick = () => { document.body.classList.remove('hoja-taller'); window.print(); };
  $('#imprimir-taller').onclick = () => {
    document.body.classList.add('hoja-taller');
    window.print();
    setTimeout(() => document.body.classList.remove('hoja-taller'), 500);
  };
  $('#copiar-enlace').onclick = async () => {
    try { await navigator.clipboard.writeText(o.enlace_seguimiento); toast('Enlace de seguimiento copiado'); } catch { prompt('Copie el enlace:', o.enlace_seguimiento); }
  };

  // Estado
  $('#form-estado').onsubmit = (e) => {
    e.preventDefault();
    const d = serializar(e.target);
    guardarLocal('ot_usuario', d.usuario || '');
    accion(() => api(`/api/ordenes/${id}/estado`, { method: 'POST', body: d }), `Estado actualizado: ${nombreDe('ESTADOS', d.estado)}`);
  };

  // Fotos
  $('#caja-fotos').onclick = (e) => {
    const t = e.target;
    if (t.tagName === 'IMG') abrirVisor(t.src);
    if (t.dataset.borrarFoto && confirm('¿Eliminar esta foto?')) {
      accion(() => api(`/api/fotos/${t.dataset.borrarFoto}`, { method: 'DELETE' }), 'Foto eliminada');
    }
    if (t.dataset.subir) {
      const input = $(`input[data-categoria="${t.dataset.subir}"]`);
      if (!input.files.length) return toast('Seleccione una o más fotos', true);
      t.disabled = true;
      t.textContent = 'Subiendo…';
      accion(() => subirFotos(id, input.files, t.dataset.subir), 'Fotos agregadas');
    }
  };

  // Pagos
  const fp = $('#form-pago');
  const pintarPago = () => {
    const forma = fp.forma.value;
    const esOro = forma === 'oro';
    $('#caja-oro').style.display = esOro ? '' : 'none';
    $('#caja-monto').style.display = esOro ? 'none' : '';
    const monto = esOro ? numero(fp.oro_gramos.value) * numero(fp.oro_valor_gramo.value) : numero(fp.monto.value);
    const recargo = forma === 'tarjeta' ? monto * CFG.recargoTarjeta / 100 : 0;
    $('#calc-pago').innerHTML = forma === 'tarjeta'
      ? `Abono ${dinero(monto)} + recargo tarjeta ${CFG.recargoTarjeta}% ${dinero(recargo)} = <b>Total a cobrar ${dinero(monto + recargo)}</b>`
      : esOro ? `${numero(fp.oro_gramos.value)} g × ${dinero(fp.oro_valor_gramo.value)} = <b>Abono ${dinero(monto)}</b>`
        : `<b>Total a cobrar ${dinero(monto)}</b>`;
  };
  fp.addEventListener('input', pintarPago);
  fp.addEventListener('change', pintarPago);
  pintarPago();
  fp.onsubmit = (e) => {
    e.preventDefault();
    accion(() => api(`/api/ordenes/${id}/pagos`, { method: 'POST', body: serializar(fp) }), 'Pago registrado');
  };
  $('#caja-pagos').addEventListener('click', (e) => {
    const b = e.target.dataset.borrarPago;
    if (b && confirm('¿Eliminar este pago?')) accion(() => api(`/api/pagos/${b}`, { method: 'DELETE' }), 'Pago eliminado');
  });

  // Notificaciones
  $('#reenviar').onclick = () => accion(() => api(`/api/ordenes/${id}/notificar`, { method: 'POST' }), 'Aviso procesado');

  // Cambios hechos por otros usuarios
  vista.alCambio = (d) => {
    if (String(d.id) !== String(id)) return;
    const escribiendo = $$('#app form input:not([type=checkbox]):not([type=date]):not([type=file]), #app form textarea')
      .some((el) => el.value && el.value !== el.defaultValue);
    if (escribiendo) {
      $('#aviso-cambios').innerHTML = '<div class="aviso no-print"><span>Otro usuario actualizó esta orden.</span><button class="btn btn-chico" id="ver-cambios">Ver cambios</button></div>';
      $('#ver-cambios').onclick = recargar;
    } else {
      toast(`${o.numero} actualizada: ${nombreDe('ESTADOS', d.estado)}`);
      recargar();
    }
  };
}

/* =====================================================================
   Clientes
   ===================================================================== */

function formCliente(c = {}) {
  return `
    <div class="grid g3">
      ${campo('Nombre completo *', 'nombre', c.nombre, { extra: 'required' })}
      ${campo('Teléfono', 'telefono', c.telefono, { tipo: 'tel' })}
      ${campo('Correo electrónico', 'email', c.email, { tipo: 'email' })}
      <div><label for="f-tipo_evento">Celebración</label>
        <select id="f-tipo_evento" name="tipo_evento">${opciones([{ id: 'boda', nombre: 'Boda' }, { id: 'aniversario', nombre: 'Aniversario' }, { id: 'otro', nombre: 'Otro' }], c.tipo_evento, '—')}</select></div>
      ${campo('Fecha de boda o aniversario', 'fecha_evento', c.fecha_evento, { tipo: 'date' })}
      ${campo('Notas', 'notas', c.notas)}
    </div>`;
}

async function vistaClientes() {
  app().innerHTML = `
    <div class="encabezado"><h1>Clientes</h1>
      <div class="acciones"><button class="btn btn-oro" id="nuevo-cliente">+ Nuevo cliente</button></div></div>
    <form class="tarjeta" id="form-cliente" style="display:none">
      <h3>Nuevo cliente</h3>${formCliente()}
      <p style="margin-bottom:0"><button class="btn btn-oro">Guardar cliente</button></p>
    </form>
    <div class="tarjeta">
      <input id="buscar" type="search" placeholder="Buscar por nombre, teléfono o correo" style="margin-bottom:12px">
      <div id="lista-clientes" class="tabla-wrap"></div>
    </div>`;

  $('#nuevo-cliente').onclick = () => { const f = $('#form-cliente'); f.style.display = f.style.display === 'none' ? '' : 'none'; };
  $('#form-cliente').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const c = await api('/api/clientes', { method: 'POST', body: serializar(e.target) });
      toast('Cliente registrado');
      location.hash = `#/clientes/${c.id}`;
    } catch (err) { toast(err.message, true); }
  };

  const cargar = async () => {
    const lista = await api('/api/clientes?q=' + encodeURIComponent($('#buscar').value));
    $('#lista-clientes').innerHTML = lista.length ? `
      <table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Boda / aniversario</th><th class="num">Órdenes</th><th class="num">Activas</th><th>Última orden</th></tr></thead>
      <tbody>${lista.map((c) => `<tr class="clic" data-id="${c.id}">
        <td><b>${esc(c.nombre)}</b></td><td>${esc(c.telefono || '—')}</td><td>${esc(c.email || '—')}</td>
        <td>${c.fecha_evento ? fecha(c.fecha_evento) : '—'}</td><td class="num">${c.ordenes}</td><td class="num">${c.activas}</td>
        <td>${c.ultima_orden ? fecha(c.ultima_orden) : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="vacio">No hay clientes registrados.</p>';
    $$('#lista-clientes tr.clic').forEach((tr) => { tr.onclick = () => { location.hash = `#/clientes/${tr.dataset.id}`; }; });
  };
  $('#buscar').oninput = antirrebote(cargar);
  await cargar();
  vista.alCambio = antirrebote(cargar, 500);
}

function resumenDetalle(o) {
  const d = o.detalles || {};
  if (o.tipo === 'fabricacion' && o.subtipo === 'boda') {
    const a = d.anillos || [];
    return `${a.length} anillo(s) · ${[...new Set(a.map((x) => x.material).filter(Boolean))].join(', ')} · tallas ${a.map((x) => x.talla || '?').join(' / ')}`;
  }
  if (o.tipo === 'fabricacion' && o.subtipo === 'compromiso') {
    const g = d.gema || {};
    return `${g.tipo || 'Gema'} ${g.forma || ''} ${g.peso ? g.peso + ' ct' : ''} · ${d.material || ''} · talla ${d.talla || '?'}`;
  }
  if (o.tipo === 'fabricacion') return `${d.descripcion || ''} ${d.material ? '· ' + d.material : ''}`;
  return `${d.articulo || ''} ${d.instrucciones ? '· ' + d.instrucciones.slice(0, 60) : ''}`;
}

async function vistaCliente(id) {
  const c = await api(`/api/clientes/${id}`);
  const facturado = c.ordenes.reduce((s, o) => s + o.total, 0);
  const pagado = c.ordenes.reduce((s, o) => s + o.pagado, 0);
  let evento = '';
  if (c.fecha_evento) {
    const d = diasHasta(c.fecha_evento);
    const etiqueta = c.tipo_evento === 'aniversario' ? 'Aniversario' : c.tipo_evento === 'boda' ? 'Boda' : 'Celebración';
    evento = `${etiqueta}: ${fecha(c.fecha_evento)} ${d > 0 ? `<span class="pronto">(faltan ${d} días)</span>` : d === 0 ? '<span class="pronto">(¡hoy!)</span>' : ''}`;
  }

  app().innerHTML = `
    <div class="encabezado">
      <div><p class="muted chico" style="margin:0"><a href="#/clientes">← Clientes</a></p><h1>${esc(c.nombre)}</h1>
        <p class="muted" style="margin:0">${[esc(c.telefono), esc(c.email)].filter(Boolean).join(' · ')}${evento ? ' · ' + evento : ''}</p></div>
      <div class="acciones">
        <button class="btn" id="editar-cliente">Editar datos</button>
        ${c.telefono ? `<a class="btn btn-wa" target="_blank" rel="noopener" href="${waEnlace(c.whatsapp, `Hola ${c.nombre.split(' ')[0]}, `)}">WhatsApp</a>` : ''}
        <a class="btn btn-oro" href="#/ordenes/nueva?cliente=${c.id}">+ Nueva orden</a>
      </div>
    </div>
    <form class="tarjeta" id="form-cliente" style="display:none">
      <h3>Datos del cliente</h3>${formCliente(c)}
      <p style="margin-bottom:0"><button class="btn btn-oro">Guardar</button></p>
    </form>
    <div class="kpis">
      <div class="kpi"><div class="v">${c.ordenes.length}</div><div class="l">Servicios registrados</div></div>
      <div class="kpi"><div class="v">${c.ordenes.filter((o) => o.estado !== 'entregado').length}</div><div class="l">Órdenes activas</div></div>
      <div class="kpi"><div class="v" style="font-size:24px">${dinero(facturado)}</div><div class="l">Total facturado</div></div>
      <div class="kpi ${facturado - pagado > 0.009 ? 'alerta' : ''}"><div class="v" style="font-size:24px">${dinero(facturado - pagado)}</div><div class="l">Saldo pendiente</div></div>
    </div>
    <div class="tarjeta">
      <h2>Historial de servicios</h2>
      ${c.ordenes.length ? `<div class="tabla-wrap"><table>
        <thead><tr><th>Orden</th><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Asesor</th><th>Estado</th><th>Entrega</th><th class="num">Total</th><th class="num">Saldo</th></tr></thead>
        <tbody>${c.ordenes.map((o) => `<tr class="clic" data-id="${o.id}">
          <td><b>${esc(o.numero)}</b></td><td>${fecha(o.fecha_creacion)}</td>
          <td><span class="badge t-tipo">${esc(tipoTexto(o))}</span></td>
          <td class="chico">${esc(resumenDetalle(o))}</td><td>${esc(o.asesor || '—')}</td>
          <td>${badgeEstado(o.estado)}</td>
          <td>${o.fecha_entrega ? fecha(o.fecha_entrega) : fechaEntrega(o.fecha_cliente, o.estado)}</td>
          <td class="num">${dinero(o.total)}</td><td class="num ${o.total - o.pagado > 0.009 ? 'vencida' : ''}">${dinero(o.total - o.pagado)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="vacio">Este cliente aún no tiene órdenes.</p>'}
    </div>
    ${c.notas ? `<div class="tarjeta"><h3>Notas</h3><div class="instrucciones">${esc(c.notas)}</div></div>` : ''}`;

  $$('tr.clic').forEach((tr) => { tr.onclick = () => { location.hash = `#/ordenes/${tr.dataset.id}`; }; });
  $('#editar-cliente').onclick = () => { const f = $('#form-cliente'); f.style.display = f.style.display === 'none' ? '' : 'none'; };
  $('#form-cliente').onsubmit = async (e) => {
    e.preventDefault();
    try {
      marcarPropio();
      await api(`/api/clientes/${id}`, { method: 'PUT', body: serializar(e.target) });
      toast('Cliente actualizado');
      vistaCliente(id);
    } catch (err) { toast(err.message, true); }
  };
  vista.alCambio = antirrebote((d) => {
    if (String(d.cliente_id) === String(id) && $('#form-cliente').style.display === 'none') vistaCliente(id);
  }, 500);
}

/* =====================================================================
   Asesores
   ===================================================================== */

async function vistaAsesores() {
  const asesores = await api('/api/asesores');
  app().innerHTML = `
    <div class="encabezado"><h1>Asesores</h1></div>
    <form class="tarjeta" id="form-asesor">
      <h3>Agregar asesor</h3>
      <div class="grid g4">
        ${campo('Nombre *', 'nombre', '', { extra: 'required' })}
        ${campo('Teléfono', 'telefono', '', { tipo: 'tel' })}
        ${campo('Correo', 'email', '', { tipo: 'email' })}
        <div><label>&nbsp;</label><button class="btn btn-oro" style="width:100%">Agregar</button></div>
      </div>
    </form>
    <div class="tarjeta">
      ${asesores.length ? `<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th class="num">Órdenes activas</th><th>Activo</th><th></th></tr></thead>
      <tbody>${asesores.map((a) => `<tr data-id="${a.id}">
        <td><input name="nombre" value="${esc(a.nombre)}"></td>
        <td><input name="telefono" value="${esc(a.telefono || '')}"></td>
        <td><input name="email" value="${esc(a.email || '')}"></td>
        <td class="num">${a.activas}</td>
        <td><input type="checkbox" name="activo" ${a.activo ? 'checked' : ''}></td>
        <td><button class="btn btn-chico" data-guardar="${a.id}">Guardar</button></td>
      </tr>`).join('')}</tbody></table>` : '<p class="vacio">Aún no hay asesores registrados.</p>'}
    </div>`;

  $('#form-asesor').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/asesores', { method: 'POST', body: serializar(e.target) }); toast('Asesor agregado'); vistaAsesores(); } catch (err) { toast(err.message, true); }
  };
  $$('[data-guardar]').forEach((b) => {
    b.onclick = async () => {
      const tr = b.closest('tr');
      const datos = { nombre: $('[name=nombre]', tr).value, telefono: $('[name=telefono]', tr).value, email: $('[name=email]', tr).value, activo: $('[name=activo]', tr).checked };
      try { await api(`/api/asesores/${b.dataset.guardar}`, { method: 'PUT', body: datos }); toast('Asesor actualizado'); } catch (err) { toast(err.message, true); }
    };
  });
}

/* =====================================================================
   Arranque
   ===================================================================== */

(async function iniciar() {
  CFG = await api('/api/config');
  $('#nombre-negocio').textContent = CFG.nombreNegocio;
  document.title = `Órdenes · ${CFG.nombreNegocio}`;
  window.addEventListener('hashchange', enrutar);
  if (!CFG.requiereLogin || CFG.sesion) conectarEnVivo();
  enrutar();
})();
