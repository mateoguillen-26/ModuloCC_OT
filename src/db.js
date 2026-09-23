const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'ordenes.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS asesores (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  tipo_evento TEXT,            -- boda | aniversario
  fecha_evento TEXT,
  notas TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ordenes (
  id INTEGER PRIMARY KEY,
  numero TEXT UNIQUE,
  token TEXT NOT NULL UNIQUE,  -- enlace público de seguimiento
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  asesor_id INTEGER REFERENCES asesores(id),
  tipo TEXT NOT NULL,          -- fabricacion | compostura | mantenimiento
  subtipo TEXT,                -- boda | compromiso | otro (solo fabricación)
  estado TEXT NOT NULL DEFAULT 'cotizado',
  fecha_creacion TEXT NOT NULL,
  fecha_taller TEXT,
  fecha_cliente TEXT,
  detalles TEXT NOT NULL DEFAULT '{}',   -- JSON con instrucciones según tipo
  precio_modo TEXT NOT NULL DEFAULT 'fijo', -- fijo | desglosado
  precio_fijo REAL,
  gramos REAL,
  costo_gramo REAL,
  costo_gemas REAL,
  total REAL NOT NULL DEFAULT 0,
  notificar INTEGER NOT NULL DEFAULT 1,
  observaciones TEXT,
  actualizado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS historial (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  estado TEXT NOT NULL,
  comentario TEXT,
  usuario TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS fotos (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  archivo TEXT NOT NULL,
  nombre_original TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  forma TEXT NOT NULL,         -- tarjeta | transferencia | efectivo | oro
  monto REAL NOT NULL,         -- valor abonado a la orden
  recargo REAL NOT NULL DEFAULT 0,
  total_cobrado REAL NOT NULL, -- monto + recargo
  oro_gramos REAL,
  oro_kilataje TEXT,
  oro_valor_gramo REAL,
  referencia TEXT,
  notas TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id INTEGER PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  estado_orden TEXT,
  canal TEXT NOT NULL,         -- email | whatsapp
  destino TEXT,
  mensaje TEXT NOT NULL,
  resultado TEXT NOT NULL,     -- enviado | manual | error
  detalle TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS ix_ordenes_cliente ON ordenes(cliente_id);
CREATE INDEX IF NOT EXISTS ix_ordenes_estado ON ordenes(estado);
CREATE INDEX IF NOT EXISTS ix_historial_orden ON historial(orden_id);
CREATE INDEX IF NOT EXISTS ix_fotos_orden ON fotos(orden_id);
CREATE INDEX IF NOT EXISTS ix_pagos_orden ON pagos(orden_id);
`);

// Ejecuta fn dentro de una transacción.
function transaccion(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

const q = {
  all: (sql, ...p) => db.prepare(sql).all(...p),
  get: (sql, ...p) => db.prepare(sql).get(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

module.exports = { db, q, transaccion };
