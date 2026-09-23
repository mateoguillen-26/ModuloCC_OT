# Órdenes de Trabajo · Joyería

Aplicativo web para registrar, compartir y seguir en tiempo real las órdenes de trabajo de la fábrica
(anillos de boda, anillos de compromiso, composturas y mantenimientos).

## Funciones

- **Clientes**: nombre, teléfono, correo, fecha de boda o aniversario, con **historial de servicios**
  (todas sus órdenes, totales facturados y saldo pendiente).
- **Órdenes**: número automático (`OT-00001`), fecha de creación, fecha pedida al taller, fecha ofrecida
  al cliente, tipo (Fabricación, Compostura, Mantenimiento) y asesor responsable.
- **Estados**: Cotizado → Iniciado → Enviado a taller → Recibido en taller → En proceso →
  Enviado a oficina → Recibido en oficina → Entregado, con historial (quién, cuándo, comentario).
- **Instrucciones según el tipo**
  - *Anillos de boda*: por cada anillo, talla, grabado interno, material, ancho, espesor,
    cantidad y tamaño de diamantes.
  - *Anillo de compromiso*: talla, material, gema principal (forma, peso, color, pureza),
    certificado de autenticidad (laboratorio y código) y diamantes secundarios (cantidad y peso).
  - *Compostura / mantenimiento*: instrucciones libres, fotos del estado actual y registro de materiales recibidos.
- **Fotografías** de referencia para la producción, estado actual del artículo y pieza terminada.
- **Valor a cobrar**: valor fijo, o desglosado (gramos × costo por gramo + costo de gemas).
- **Pagos**: tarjeta (recargo automático del 6 %), transferencia, efectivo y pago en oro
  (gramos × valor por gramo, con kilataje). Calcula pagado y saldo.
- **Tiempo real**: todos los usuarios ven al instante los cambios (estado, fotos, pagos).
- **Seguimiento para el cliente**: cada orden tiene un enlace público que se actualiza solo
  (sin precios ni datos internos).
- **Notificaciones automáticas** en cada cambio de estado, por correo y WhatsApp. Si un canal no está
  configurado, el aviso queda pendiente con un botón para enviarlo con un clic.
- **Hoja para taller** imprimible (sin precios ni datos de contacto del cliente) e impresión / PDF completa.

## Instalación

Requiere [Node.js](https://nodejs.org) 22.13 o superior (usa la base SQLite incluida en Node).

```bash
npm install
cp .env.example .env      # y edite los valores
npm start
```

Abra `http://localhost:3000`. Primero registre los asesores en la pestaña **Asesores**.

**Datos de prueba**: `npm run seed` carga 3 asesores, 5 clientes y 6 órdenes con fotos ilustrativas,
pagos e historial (solo si la base está vacía; `npm run seed -- --forzar` los agrega igualmente).
Las fechas se calculan a partir del día en que se ejecuta, para mostrar órdenes vencidas, en víspera y próximas.

**Colores de entrega** en el tablero (según la fecha ofrecida al cliente): rojo = vencida,
naranja = en víspera (hoy a 2 días), amarillo = próxima (3 a 7 días). La lista se puede ordenar por
fecha de entrega (más próxima o más lejana) o por fecha de creación.

## Configuración (`.env`)

| Variable | Uso |
|---|---|
| `APP_PASSWORD` | Contraseña del panel interno. **Defínala antes de publicar el sistema en internet.** |
| `PUBLIC_URL` | Dirección pública del sistema; se usa en los enlaces de seguimiento que recibe el cliente. |
| `NOMBRE_NEGOCIO`, `MONEDA` | Nombre mostrado y moneda (código ISO: USD, MXN, PEN…). |
| `RECARGO_TARJETA` | Porcentaje de recargo por tarjeta (por defecto 6). |
| `CODIGO_PAIS` | Convierte teléfonos locales (`0999…`) al formato de WhatsApp (`593999…`). |
| `SMTP_*` | Servidor de correo para los avisos automáticos (p. ej. Gmail con contraseña de aplicación). |
| `WHATSAPP_*` | API de WhatsApp Cloud (Meta). Para escribir primero al cliente Meta exige una plantilla aprobada con un parámetro `{{1}}`; indíquela en `WHATSAPP_TEMPLATE`. |

## Datos

- Base de datos: `data/ordenes.db` (SQLite). Fotos: `uploads/`.
- **Respaldo**: copie periódicamente las carpetas `data/` y `uploads/`.

## Publicación

Para que el taller, la oficina y los clientes accedan desde cualquier lugar, instale el sistema en un
servidor o VPS con Node.js (o un servicio como Railway / Render con disco persistente), detrás de HTTPS,
y defina `APP_PASSWORD` y `PUBLIC_URL`.
