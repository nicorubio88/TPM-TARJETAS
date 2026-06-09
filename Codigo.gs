/**
 * SISTEMA DE TARJETAS TPM — Planta Tornquist (Papelera del Sur)
 * Mantenimiento Autonomo / Planificado / Mejora Enfocada
 * Backend Google Apps Script. API JSON consumida por el frontend estatico.
 *
 * DESPLIEGUE:
 *  1) Crear una Google Sheet y copiar su ID en SHEET_ID (o crear el script
 *     ligado a la planilla con Extensiones > Apps Script y dejar SHEET_ID vacio).
 *  2) Pegar este archivo, guardar.
 *  3) Implementar > Nueva implementacion > Aplicacion web.
 *     Ejecutar como: yo.  Acceso: cualquier persona.
 *  4) Ejecutar una vez la funcion setup() para crear la hoja y encabezados.
 *  5) Copiar la URL /exec en comun.js (CONFIG.API_URL) del frontend.
 */

const SHEET_ID = '';            // dejar vacio si el script esta ligado a la planilla
const SHEET_NAME = 'Tarjetas';
const TZ = 'America/Argentina/Buenos_Aires';
const FOTOS_FOLDER_ID = '';     // opcional: ID de carpeta de Drive para fotos. Vacio = crea/usa "Fotos Tarjetas TPM"

// Notificaciones: email o Google Group por grupo responsable (opcional)
const NOTIF = {
  'Mantenimiento': '',          // ej: 'mantenimiento-tornquist@googlegroups.com'
  'Operacion': '',
  'Mejora Enfocada': ''
};

const GRUPO_POR_COLOR = { 'Roja': 'Mantenimiento', 'Azul': 'Operacion', 'Verde': 'Mejora Enfocada' };
const PREFIJO_COLOR   = { 'Roja': 'ROJ', 'Azul': 'AZU', 'Verde': 'VER' };

const HEADERS = [
  'ID', 'Fecha alta', 'Tipo', 'Grupo responsable', 'Detectado por', 'Turno',
  'Sector', 'Equipo', 'Componente/Ubicacion', 'Categoria', 'Descripcion',
  'Prioridad', 'Foto URL', 'Responsable asignado', 'Fecha compromiso',
  'Estado', 'Fecha cierre', 'Accion de cierre', 'Costo estimado', 'Notas',
  'Etapa MA', 'Dimension mejora'
];

/* ============================ ROUTING ============================ */

function doGet(e)  { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  var req = {};
  try {
    if (e && e.postData && e.postData.contents) req = JSON.parse(e.postData.contents);
    else if (e && e.parameter) req = e.parameter;
  } catch (err) { req = (e && e.parameter) || {}; }

  var action = req.action || 'listar';
  var out;
  try {
    switch (action) {
      case 'setup':       out = setup(); break;
      case 'crear':       out = crear_(req.data || req); break;
      case 'listar':      out = { ok: true, tarjetas: listar_() }; break;
      case 'actualizar':  out = actualizar_(req.id, req.cambios || {}); break;
      case 'cerrar':      out = cerrar_(req.id, req.accion || '', req.costo); break;
      default:            out = { ok: false, error: 'Accion desconocida: ' + action };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================ SHEET ============================ */

function getSheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No hay planilla. Defini SHEET_ID o liga el script a una Google Sheet.');
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#548235').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150);
    sh.setColumnWidth(11, 280);
  }
  return sh;
}

function setup() {
  getSheet_();
  return { ok: true, mensaje: 'Hoja "' + SHEET_NAME + '" lista con ' + HEADERS.length + ' columnas.' };
}

/* ============================ CREAR ============================ */

function crear_(d) {
  var tipo = (d.tipo || '').trim();
  if (['Roja', 'Azul', 'Verde'].indexOf(tipo) === -1) throw new Error('Tipo de tarjeta invalido (Roja/Azul/Verde).');
  if (!d.detectadoPor) throw new Error('Falta "Detectado por".');
  if (!d.sector)       throw new Error('Falta el sector.');
  if (!d.descripcion)  throw new Error('Falta la descripcion.');

  var grupo = GRUPO_POR_COLOR[tipo];
  var id = generarId_(tipo);
  var ahora = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');

  var fotoUrl = d.fotoUrl || '';
  if (d.fotoData) { try { fotoUrl = guardarFoto_(d.fotoData, id); } catch (err) {} }

  var fila = [
    id, ahora, tipo, grupo, d.detectadoPor, d.turno || '',
    d.sector, d.equipo || '', d.componente || '', d.categoria || '', d.descripcion,
    d.prioridad || 'Media', fotoUrl, d.responsable || '', d.fechaCompromiso || '',
    'Abierta', '', '', d.costo || '', d.notas || '',
    d.etapaMa || '', d.dimensionMejora || ''
  ];

  getSheet_().appendRow(fila);
  try { notificar_(grupo, id, tipo, d); } catch (err) {}
  return { ok: true, id: id, grupo: grupo };
}

function generarId_(tipo) {
  var fecha = Utilities.formatDate(new Date(), TZ, 'yyMMdd-HHmm');
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var rnd = '';
  for (var i = 0; i < 3; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
  return PREFIJO_COLOR[tipo] + '-' + fecha + '-' + rnd;
}

function carpetaFotos_() {
  if (FOTOS_FOLDER_ID) return DriveApp.getFolderById(FOTOS_FOLDER_ID);
  var it = DriveApp.getFoldersByName('Fotos Tarjetas TPM');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Fotos Tarjetas TPM');
}

function guardarFoto_(dataUrl, id) {
  var m = String(dataUrl).match(/^data:(.*?);base64,(.*)$/);
  if (!m) return '';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], id + '.jpg');
  var file = carpetaFotos_().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

/* ============================ LISTAR ============================ */

function listar_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var datos = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var hoy = new Date();
  return datos.map(function (r) {
    var o = {};
    HEADERS.forEach(function (h, i) { o[h] = r[i]; });
    var alta = parseFecha_(o['Fecha alta']);
    var cierre = o['Fecha cierre'] ? parseFecha_(o['Fecha cierre']) : null;
    var fin = cierre || hoy;
    o.diasAbierta = alta ? Math.max(0, Math.round((fin - alta) / 86400000)) : '';
    var comp = o['Fecha compromiso'] ? parseFecha_(o['Fecha compromiso']) : null;
    o.vencida = !!(comp && o['Estado'] !== 'Cerrada' && o['Estado'] !== 'Anulada' && comp < hoy);
    return o;
  });
}

function parseFecha_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var s = String(v).trim().replace(' ', 'T');
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* ============================ ACTUALIZAR / CERRAR ============================ */

function buscarFila_(id) {
  var sh = getSheet_();
  var ids = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function colDe_(nombre) { return HEADERS.indexOf(nombre) + 1; }

function actualizar_(id, cambios) {
  var fila = buscarFila_(id);
  if (fila === -1) throw new Error('No se encontro la tarjeta ' + id);
  var sh = getSheet_();
  var mapa = {
    responsable: 'Responsable asignado', fechaCompromiso: 'Fecha compromiso',
    estado: 'Estado', prioridad: 'Prioridad', notas: 'Notas', categoria: 'Categoria', etapaMa: 'Etapa MA'
  };
  Object.keys(cambios).forEach(function (k) {
    if (mapa[k]) sh.getRange(fila, colDe_(mapa[k])).setValue(cambios[k]);
  });
  return { ok: true, id: id };
}

function cerrar_(id, accion, costo) {
  var fila = buscarFila_(id);
  if (fila === -1) throw new Error('No se encontro la tarjeta ' + id);
  if (!accion) throw new Error('Indica la accion de cierre.');
  var sh = getSheet_();
  var ahora = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  sh.getRange(fila, colDe_('Estado')).setValue('Cerrada');
  sh.getRange(fila, colDe_('Fecha cierre')).setValue(ahora);
  sh.getRange(fila, colDe_('Accion de cierre')).setValue(accion);
  if (costo !== undefined && costo !== null && costo !== '') sh.getRange(fila, colDe_('Costo estimado')).setValue(costo);
  return { ok: true, id: id };
}

/* ============================ NOTIFICACION ============================ */

function notificar_(grupo, id, tipo, d) {
  var dest = NOTIF[grupo];
  if (!dest) return;
  var asunto = '[Tarjeta TPM ' + tipo + '] ' + id + ' - ' + (d.sector || '') + (d.equipo ? ' / ' + d.equipo : '');
  var cuerpo =
    'Nueva tarjeta ' + tipo + ' asignada a ' + grupo + '.\n\n' +
    'ID: ' + id + '\nSector: ' + (d.sector || '') + '\nEquipo: ' + (d.equipo || '') +
    '\nComponente: ' + (d.componente || '') + '\nCategoria: ' + (d.categoria || '') +
    '\nPrioridad: ' + (d.prioridad || 'Media') + '\nDetectado por: ' + (d.detectadoPor || '') +
    '\n\nDescripcion:\n' + (d.descripcion || '');
  MailApp.sendEmail(dest, asunto, cuerpo);
}
