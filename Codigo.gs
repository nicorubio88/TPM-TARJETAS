/**
 * SISTEMA DE TARJETAS TPM — Planta Tornquist (Papelera del Sur)
 * Mantenimiento Autonomo / Planificado / Calidad / Mejora Enfocada
 * Backend Google Apps Script v3. API JSON consumida por el frontend estatico.
 *
 * DESPLIEGUE / ACTUALIZACION:
 *  1) Pegar este archivo completo en el editor de Apps Script (reemplaza al anterior).
 *  2) Completar la CONFIGURACION de abajo (todo es opcional salvo que la planilla este ligada).
 *  3) Ejecutar una vez setup() -> crea/migra las hojas Tarjetas, Historial, Paradas, Personas y Arbol.
 *  4) Implementar > Gestionar implementaciones > (lapiz) > Version: Nueva version > Implementar.
 *     Asi se mantiene la MISMA URL /exec y no hay que tocar comun.js.
 *
 * HOJAS
 *  - Tarjetas   : una fila por tarjeta (columnas en HEADERS; las nuevas se agregan al final solas).
 *  - Historial  : cada alta / cambio / cierre / verificacion, con valor anterior y nuevo y quien lo hizo.
 *  - Paradas    : calendario de paradas programadas (fecha, descripcion, horas-hombre disponibles).
 *  - Personas   : nomina (Sector, Nombre, Email, Activo). Si esta vacia se usa personas.js.
 *                 Cargando el Email de cada persona, el sistema le avisa cuando le resuelven su tarjeta.
 *  - Arbol      : arbol de equipos (Area, Subarea, Equipo). Si esta vacia se usa arbol.js.
 */

/* ============================ CONFIGURACION ============================ */

const VERSION_BACKEND = 12; // subir junto con VERSION_BACKEND_MIN en comun.js
const SHEET_ID = '';            // dejar vacio si el script esta ligado a la planilla
const TZ = 'America/Argentina/Buenos_Aires';
const FOTOS_FOLDER_ID = '';     // opcional: carpeta de Drive para fotos. Vacio = crea/usa "Fotos Tarjetas TPM"
const APP_URL = 'https://seal-app-27qrt.ondigitalocean.app/';             // URL publica del frontend (DigitalOcean), ej 'https://tarjetas-xxxx.ondigitalocean.app/'
                                // se usa para poner links en los emails

// Aviso de tarjeta NUEVA por grupo responsable (email o Google Group, opcional)
const NOTIF = {
  'Mantenimiento': '',
  'Operacion': '',
  'Mejora Enfocada': ''
};

// Derivacion de SEGURIDAD al sistema EHS.
//  - EHS_EMAIL: email/grupo de Seguridad e Higiene que recibe cada tarjeta de condicion insegura (funciona ya).
//  - EHS_API_URL: URL /exec del Apps Script de EHS. Si se completa, ademas se crea el registro alla
//    via POST (ver mapearEHS_ para ajustar los nombres de campos que espera EHS).
const EHS_EMAIL = '';
const EHS_API_URL = '';
const CATEGORIAS_SEGURIDAD = ['Condicion insegura'];

/* ============================ ESTRUCTURA ============================ */

const SHEET_NAME = 'Tarjetas';
const GRUPO_POR_COLOR = { 'Roja': 'Mantenimiento', 'Azul': 'Operacion', 'Verde': 'Mejora Enfocada' };
const PREFIJO_COLOR   = { 'Roja': 'ROJ', 'Azul': 'AZU', 'Verde': 'VER' };
const CONDICIONES = ['Maquina en marcha', 'Maquina parada', 'Parada planificada', 'A definir'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];
const ESTADOS_ABIERTOS = ['Abierta', 'En proceso'];
// 'Cerrada' = resuelta, pendiente de verificacion por el sector. 'Verificada' = cierre definitivo.
const ESTADOS_RESUELTOS = ['Cerrada', 'Verificada'];

const HEADERS = [
  'ID', 'Fecha alta', 'Tipo', 'Grupo responsable', 'Detectado por', 'Turno',
  'Sector', 'Equipo', 'Componente/Ubicacion', 'Categoria', 'Descripcion',
  'Prioridad', 'Foto URL', 'Responsable asignado', 'Fecha compromiso',
  'Estado', 'Fecha cierre', 'Accion de cierre', 'Costo estimado', 'Notas',
  'Etapa MA', 'Dimension mejora', 'Area equipo',
  // v2 — planificacion
  'Condicion intervencion', 'Especialidad', 'Horas estimadas', 'Repuestos', 'Cerrado por',
  // v3 — cierre, verificacion, pilares, trazabilidad
  'Foto cierre URL', 'Verificado por', 'Fecha verificacion', 'Reaperturas', 'Reprogramaciones',
  'Parada objetivo', 'N OT', 'LOTO / Permiso', 'Causa', 'Agregar a MP', 'Actualizar estandar',
  'Sector detector', 'Enviado a EHS',
  // v4 — planificacion automatica
  'Personas necesarias', 'Ejecutores', 'Fecha planificada', 'Horario planificado',
  // v5 — control de duplicados de la cola sin conexion
  'Cliente ID',
  // v6 — area que resuelve y datos reales del cierre
  'Area responsable', 'Horas reales', 'Personas reales'
];
const COLS_FECHAHORA = ['Fecha alta', 'Fecha cierre', 'Fecha verificacion'];
const COLS_FECHA = ['Fecha compromiso', 'Parada objetivo', 'Fecha planificada'];

const H_HIST = ['Fecha', 'ID', 'Accion', 'Campo', 'Antes', 'Despues', 'Usuario'];
const H_PARADAS = ['ID', 'Fecha', 'Descripcion', 'HH disponibles', 'Estado', 'Duracion (h)', 'Hora inicio'];
// Configuracion por area: criticidad del area (A/B/C) y, por color, supervisor (responsable por defecto)
// y ejecutores (quienes hacen el trabajo). La fila con Area = '*' es el valor por defecto para todas.
// Areas que resuelven: equipo de cada area y modo de reparto (equipo = rojas entre todos los tecnicos;
// supervisor = azules/verdes a un supervisor). Personas separadas por ";".
const H_RESP = ['Area', 'Colores', 'Modo', 'HorasDia', 'Personas', 'Ayuda'];
const H_AREAS = ['Area', 'Criticidad', 'Supervisor Roja', 'Ejecutores Roja', 'Supervisor Azul', 'Ejecutores Azul', 'Supervisor Verde', 'Ejecutores Verde'];
const H_PERSONAS = ['Sector', 'Nombre', 'Email', 'Activo'];
const H_ARBOL = ['Area', 'Subarea', 'Equipo'];

/* ============================ ROUTING ============================ */

var _EN_WEBAPP = false;
function doGet(e)  { _EN_WEBAPP = true; return handle_(e); }
function doPost(e) { _EN_WEBAPP = true; return handle_(e); }

const ACCIONES_ESCRITURA = ['guardarResponsables', 'crear', 'actualizar', 'actualizarLote', 'cerrar', 'verificar', 'guardarParada', 'borrarParada', 'sembrarMaestros', 'guardarAreas', 'derivarEHS', 'setup'];

function handle_(e) {
  var req = {};
  try {
    if (e && e.postData && e.postData.contents) req = JSON.parse(e.postData.contents);
    else if (e && e.parameter) req = e.parameter;
  } catch (err) { req = (e && e.parameter) || {}; }

  var action = req.action || 'listar';
  var usuario = String(req.usuario || '').trim();
  var out, lock = null;
  try {
    migrarV3_();   // toma y suelta su propio lock; va ANTES del lock de la accion (los locks no son reentrantes)
    if (ACCIONES_ESCRITURA.indexOf(action) > -1) {
      lock = LockService.getScriptLock();
      lock.waitLock(25000);
    }
    switch (action) {
      case 'ping':            out = { ok: true, ts: ahora_(), version: VERSION_BACKEND }; break;
      case 'setup':           out = setup(); break;
      case 'crear':           out = crear_(req.data || req, usuario); break;
      case 'listar':          out = { ok: true, tarjetas: listar_(req.desde), paradas: listarParadas_() }; break;
      case 'actualizar':      out = actualizar_(req.id, req.cambios || {}, usuario); break;
      case 'actualizarLote':  out = actualizarLote_(req.items || [], usuario); break;
      case 'guardarAreas':    out = guardarAreas_(req.filas || [], usuario); break;
      case 'guardarResponsables': out = guardarResponsables_(req.filas || [], usuario); break;
      case 'cerrar':          out = cerrar_(req, usuario); break;
      case 'verificar':       out = verificar_(req, usuario); break;
      case 'historial':       out = { ok: true, historial: historial_(req.id) }; break;
      case 'guardarParada':   out = guardarParada_(req.parada || {}, usuario); break;
      case 'borrarParada':    out = borrarParada_(req.id, usuario); break;
      case 'maestros':        out = maestros_(); break;
      case 'sembrarMaestros': out = sembrarMaestros_(req.personas, req.arbol, req.forzar); break;
      case 'derivarEHS':      out = derivarEHSManual_(req.id, usuario); break;
      case 'historialEstimacion': out = { ok: true, filas: historialEstimacion_() }; break;
      default:                out = { ok: false, error: 'Accion desconocida: ' + action };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    flushLog_();   // el historial se escribe en bloque, todavia dentro del lock
    if (lock) try { lock.releaseLock(); } catch (e2) {}
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================ HOJAS ============================ */

function ss_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No hay planilla. Defini SHEET_ID o liga el script a una Google Sheet.');
  return ss;
}

// Cache por ejecucion (cada llamado a la web app arranca de cero): evita releer hojas e IDs.
var _CACHE = { hojas: {}, ids: null };

function hoja_(nombre, headers) {
  if (_CACHE.hojas[nombre]) return _CACHE.hojas[nombre];
  var ss = ss_();
  var sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#548235').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < headers.length) {
    // Migracion: la hoja vieja tiene menos columnas -> se completan los encabezados nuevos al final
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#548235').setFontColor('#FFFFFF');
  }
  _CACHE.hojas[nombre] = sh;
  return sh;
}

function getSheet_() { return hoja_(SHEET_NAME, HEADERS); }

function setup() {
  getSheet_(); hoja_('Historial', H_HIST); hoja_('Paradas', H_PARADAS);
  hoja_('Personas', H_PERSONAS); hoja_('Arbol', H_ARBOL); hoja_('Areas', H_AREAS); hoja_('Responsables', H_RESP);
  // Desde el editor (no hay lock tomado) corre la migracion; desde la web app ya corrio en handle_.
  if (!_EN_WEBAPP) migrarV3_();
  return { ok: true, mensaje: 'Hojas listas. Tarjetas tiene ' + HEADERS.length + ' columnas.' };
}

/* Migracion unica a v3: en v1/v2 "Cerrada" era el cierre definitivo. En v3 "Cerrada" = resuelta
   pendiente de verificar. Las cerradas antes de la migracion pasan a "Verificada" para no llenar
   la bandeja de verificacion con el historial. Se ejecuta una sola vez (marca en Script Properties). */
function migrarV3_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('migracion_v3')) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    if (props.getProperty('migracion_v3')) return;
    var sh = getSheet_(), n = sh.getLastRow() - 1, cambiadas = 0;
    if (n > 0) {
      var rng = sh.getRange(2, 1, n, HEADERS.length), v = rng.getValues();
      var cE = colDe_('Estado') - 1, cF = colDe_('Fecha cierre') - 1, cV = colDe_('Verificado por') - 1, cFV = colDe_('Fecha verificacion') - 1;
      v.forEach(function (r) {
        if (r[cE] === 'Cerrada' && !r[cV]) { r[cE] = 'Verificada'; r[cV] = '(migracion v3)'; r[cFV] = r[cF]; cambiadas++; }
      });
      if (cambiadas) rng.setValues(v);
    }
    props.setProperty('migracion_v3', ahora_() + ' · ' + cambiadas + ' tarjetas');
    if (cambiadas) log_('-', 'Migracion v3', 'Estado', 'Cerrada', 'Verificada (' + cambiadas + ')', 'sistema');
    flushLog_();
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function ahora_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function colDe_(nombre) { return HEADERS.indexOf(nombre) + 1; }

function fmt_(v, col) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, TZ, COLS_FECHA.indexOf(col) > -1 ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
  }
  return v;
}

/* ============================ HISTORIAL ============================ */

var _LOG = [];
function log_(id, accion, campo, antes, despues, usuario) {
  _LOG.push([ahora_(), id, accion, campo || '', String(antes == null ? '' : antes), String(despues == null ? '' : despues), usuario || '']);
}
function flushLog_() {
  if (!_LOG.length) return;
  try {
    var sh = hoja_('Historial', H_HIST);
    sh.getRange(sh.getLastRow() + 1, 1, _LOG.length, H_HIST.length).setValues(_LOG);
  } catch (e) {}
  _LOG = [];
}

function historial_(id) {
  var sh = hoja_('Historial', H_HIST);
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, H_HIST.length).getValues()
    .filter(function (r) { return String(r[1]) === String(id); })
    .map(function (r) {
      var o = {}; H_HIST.forEach(function (h, i) { o[h] = fmt_(r[i], h); }); return o;
    });
}

/* ============================ CREAR ============================ */

function normCondicion_(v) { return CONDICIONES.indexOf(v) > -1 ? v : 'A definir'; }

function crear_(d, usuario) {
  var tipo = String(d.tipo || '').trim();
  if (['Roja', 'Azul', 'Verde'].indexOf(tipo) === -1) throw new Error('Tipo de tarjeta invalido (Roja/Azul/Verde).');
  if (!d.detectadoPor) throw new Error('Falta "Detectado por".');
  if (!d.areaEquipo)   throw new Error('Falta el area del equipo.');
  if (!d.descripcion)  throw new Error('Falta la descripcion.');
  if (!String(d.categoria || '').trim()) throw new Error('Falta la categoria de anomalia.');
  if (PRIORIDADES.indexOf(d.prioridad) === -1) throw new Error('Falta la prioridad (Alta, Media o Baja).');
  if (!String(d.areaResponsable || '').trim()) throw new Error('Falta el area que resuelve la tarjeta.');

  // Idempotencia para la cola sin conexion: si el mismo envio llega dos veces, no se duplica.
  // Se busca el Cliente ID en las ultimas 1000 filas (un reintento llega siempre poco despues).
  var sh = getSheet_();
  if (d.clienteId) {
    var n = sh.getLastRow() - 1;
    if (n > 0) {
      var desdeF = Math.max(2, sh.getLastRow() - 999), cant = sh.getLastRow() - desdeF + 1;
      var cid = sh.getRange(desdeF, colDe_('Cliente ID'), cant, 1).getValues();
      var ids = sh.getRange(desdeF, 1, cant, 1).getValues();
      for (var i = cid.length - 1; i >= 0; i--) {
        if (String(cid[i][0]) === String(d.clienteId)) return { ok: true, id: ids[i][0], grupo: GRUPO_POR_COLOR[tipo], duplicado: true };
      }
    }
  }

  var grupo = GRUPO_POR_COLOR[tipo];
  var id = generarId_(tipo);
  var fotoUrl = d.fotoUrl || '', fotoError = '';
  if (d.fotoData) {
    try { fotoUrl = guardarFoto_(d.fotoData, id); }
    catch (err) { fotoError = 'No se pudo guardar la foto: ' + (err.message || err); }
  }

  var fila = {};
  HEADERS.forEach(function (h) { fila[h] = ''; });
  fila['ID'] = id; fila['Fecha alta'] = d.fechaAlta || ahora_(); fila['Tipo'] = tipo; fila['Grupo responsable'] = grupo;
  fila['Detectado por'] = d.detectadoPor; fila['Turno'] = d.turno || '';
  fila['Sector'] = d.sector || d.areaEquipo || '';   // compatibilidad: historicamente = area del equipo
  fila['Equipo'] = d.equipo || ''; fila['Componente/Ubicacion'] = d.componente || '';
  fila['Categoria'] = d.categoria || ''; fila['Descripcion'] = d.descripcion;
  fila['Prioridad'] = d.prioridad; fila['Foto URL'] = fotoUrl;
  fila['Responsable asignado'] = d.responsable || ''; fila['Fecha compromiso'] = d.fechaCompromiso || '';
  fila['Estado'] = 'Abierta'; fila['Costo estimado'] = d.costo || ''; fila['Notas'] = d.notas || '';
  fila['Etapa MA'] = d.etapaMa || ''; fila['Dimension mejora'] = d.dimensionMejora || ''; fila['Area equipo'] = d.areaEquipo || '';
  fila['Condicion intervencion'] = normCondicion_(d.condicion);
  fila['Reaperturas'] = 0; fila['Reprogramaciones'] = 0;
  fila['Sector detector'] = d.sectorDetector || '';
  fila['Horas estimadas'] = d.horasEstimadas || '';
  fila['Personas necesarias'] = d.personasNecesarias || '';
  fila['Especialidad'] = d.especialidad || ''; fila['Repuestos'] = d.repuestos || '';
  fila['Cliente ID'] = d.clienteId || '';
  fila['Area responsable'] = d.areaResponsable;
  // Responsable: el elegido; si no, el menos cargado del equipo del area responsable
  if (!fila['Responsable asignado'] || fila['Responsable asignado'] === '__auto__') {
    fila['Responsable asignado'] = menosCargado_(poolResponsable_(d.areaResponsable, d.poolResponsable));
  }

  var esSeguridad = CATEGORIAS_SEGURIDAD.indexOf(d.categoria) > -1;
  if (esSeguridad) fila['Enviado a EHS'] = 'Pendiente';

  sh.appendRow(HEADERS.map(function (h) { return fila[h]; }));
  if (_CACHE.ids) _CACHE.ids.push(id);
  log_(id, 'Alta', '', '', tipo + ' · ' + (d.areaEquipo || '') + (d.equipo ? ' › ' + d.equipo : ''), usuario || d.detectadoPor);

  try { notificar_(grupo, id, tipo, d, fotoUrl); } catch (err) {}
  var ehs = '';
  if (esSeguridad) { ehs = derivarEHS_(id, fila); escribir_(id, { 'Enviado a EHS': ehs }); }
  return { ok: true, id: id, grupo: grupo, responsable: fila['Responsable asignado'], fotoError: fotoError, ehs: ehs };
}

function generarId_(tipo) {
  var fecha = Utilities.formatDate(new Date(), TZ, 'yyMMdd-HHmm');
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var rnd = '';
  for (var i = 0; i < 3; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
  return PREFIJO_COLOR[tipo] + '-' + fecha + '-' + rnd;
}

/* ============================ FOTOS ============================ */

function carpetaFotos_() {
  if (FOTOS_FOLDER_ID) return DriveApp.getFolderById(FOTOS_FOLDER_ID);
  var it = DriveApp.getFoldersByName('Fotos Tarjetas TPM');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Fotos Tarjetas TPM');
}

// Devuelve un link de miniatura: los links "uc?export=view" ya no se muestran embebidos en <img>.
function guardarFoto_(dataUrl, nombre) {
  var m = String(dataUrl).match(/^data:(.*?);base64,(.*)$/);
  if (!m) throw new Error('formato de imagen invalido');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nombre + '.jpg');
  var file = carpetaFotos_().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1200';
}

/* ============================ LISTAR ============================ */

function listar_(desde) {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var datos = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var hoy = new Date();
  var dDesde = desde ? parseFecha_(desde) : null;
  var out = [];
  datos.forEach(function (r) {
    if (!r[0]) return;
    var o = {};
    HEADERS.forEach(function (h, i) { o[h] = r[i]; });
    var alta = parseFecha_(o['Fecha alta']);
    var cierre = o['Fecha cierre'] ? parseFecha_(o['Fecha cierre']) : null;
    var est = o['Estado'];
    var abierta = ESTADOS_ABIERTOS.indexOf(est) > -1;
    // filtro de periodo: siempre van las abiertas y las pendientes de verificar
    if (dDesde && !abierta && est !== 'Cerrada') {
      var verif = o['Fecha verificacion'] ? parseFecha_(o['Fecha verificacion']) : null;
      var reciente = (alta && alta >= dDesde) || (cierre && cierre >= dDesde) || (verif && verif >= dDesde);
      if (!reciente) return;
    }
    var fin = cierre || hoy;
    o.diasAbierta = alta ? Math.max(0, Math.round((fin - alta) / 86400000)) : '';
    var comp = o['Fecha compromiso'] ? parseFecha_(o['Fecha compromiso']) : null;
    // vence al terminar el dia compromiso
    o.vencida = !!(comp && abierta && (comp.getTime() + 86400000) < hoy.getTime());
    if (!o['Condicion intervencion']) o['Condicion intervencion'] = 'A definir';
    HEADERS.forEach(function (h) { o[h] = fmt_(o[h], h); });
    out.push(o);
  });
  return out;
}

function parseFecha_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var s = String(v).trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00';
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* ============================ LECTURA / ESCRITURA POR ID ============================ */

function buscarFila_(id) {
  if (!_CACHE.ids) {
    var sh = getSheet_(), n = sh.getLastRow() - 1;
    _CACHE.ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  }
  var i = _CACHE.ids.lastIndexOf(String(id));
  return i === -1 ? -1 : i + 2;
}

function leer_(id) {
  var fila = buscarFila_(id);
  if (fila === -1) throw new Error('No se encontro la tarjeta ' + id);
  var r = getSheet_().getRange(fila, 1, 1, HEADERS.length).getValues()[0];
  var o = { _fila: fila };
  HEADERS.forEach(function (h, i) { o[h] = fmt_(r[i], h); });
  return o;
}

// Lee la fila una vez, cambia las columnas pedidas y la escribe en una sola operacion.
function escribir_(id, valores) {
  var fila = buscarFila_(id);
  if (fila === -1) throw new Error('No se encontro la tarjeta ' + id);
  var rng = getSheet_().getRange(fila, 1, 1, HEADERS.length), r = rng.getValues()[0], cambio = false;
  Object.keys(valores).forEach(function (col) {
    var c = colDe_(col);
    if (c > 0) { r[c - 1] = valores[col]; cambio = true; }
  });
  if (cambio) rng.setValues([r]);
}

/* ============================ ACTUALIZAR ============================ */

const MAPA_CAMPOS = {
  responsable: 'Responsable asignado', fechaCompromiso: 'Fecha compromiso', estado: 'Estado',
  prioridad: 'Prioridad', notas: 'Notas', categoria: 'Categoria', etapaMa: 'Etapa MA',
  condicion: 'Condicion intervencion', especialidad: 'Especialidad', horasEstimadas: 'Horas estimadas',
  repuestos: 'Repuestos', paradaObjetivo: 'Parada objetivo', nOT: 'N OT', loto: 'LOTO / Permiso',
  tipo: 'Tipo', dimensionMejora: 'Dimension mejora', costo: 'Costo estimado',
  personas: 'Personas necesarias', ejecutores: 'Ejecutores', fechaPlanificada: 'Fecha planificada', horario: 'Horario planificado',
  areaResponsable: 'Area responsable',
  // correcciones de la carga (se registran en el Historial como "Corrección", con quien la hizo)
  descripcion: 'Descripcion', areaEquipo: 'Area equipo', equipo: 'Equipo', componente: 'Componente/Ubicacion',
  detectadoPor: 'Detectado por', turno: 'Turno'
};
const CAMPOS_CORRECCION = ['descripcion', 'areaEquipo', 'equipo', 'componente', 'detectadoPor', 'turno'];

function actualizar_(id, cambios, usuario) {
  var t = leer_(id);
  if (cambios.estado === 'Cerrada' || cambios.estado === 'Verificada') {
    throw new Error('Para cerrar usa "Marcar como resuelta" (pide la accion realizada) y para verificar, "Verificar".');
  }
  if (cambios.estado === 'Anulada' && !String(cambios.motivo || '').trim()) {
    throw new Error('Para anular indica el motivo.');
  }
  if (cambios.condicion !== undefined) cambios.condicion = normCondicion_(cambios.condicion);
  // categoria y prioridad son obligatorias: se pueden cambiar, no borrar
  if (cambios.categoria !== undefined && !String(cambios.categoria).trim() && t['Categoria']) throw new Error('La categoria de anomalia es obligatoria.');
  if (cambios.prioridad !== undefined && PRIORIDADES.indexOf(cambios.prioridad) === -1) throw new Error('Prioridad invalida (Alta, Media o Baja).');
  if (cambios.areaResponsable !== undefined && !String(cambios.areaResponsable).trim() && t['Area responsable']) throw new Error('El area que resuelve es obligatoria.');
  if (cambios.responsable === '__auto__') {
    cambios.responsable = menosCargado_(poolResponsable_(cambios.areaResponsable || t['Area responsable'], cambios.poolResponsable), id);
  }
  if (cambios.tipo !== undefined && !GRUPO_POR_COLOR[cambios.tipo]) delete cambios.tipo;
  if (cambios.descripcion !== undefined && !String(cambios.descripcion).trim()) throw new Error('La descripcion no puede quedar vacia.');
  if (cambios.detectadoPor !== undefined && !String(cambios.detectadoPor).trim()) throw new Error('Indica quien detecto la anomalia.');
  if (cambios.areaEquipo !== undefined && !String(cambios.areaEquipo).trim()) throw new Error('La ubicacion (area) no puede quedar vacia.');
  // una correccion real (cambia un dato de la carga) exige saber quien la hace
  var corrige = CAMPOS_CORRECCION.some(function (k) {
    return cambios[k] !== undefined && MAPA_CAMPOS[k] && String(t[MAPA_CAMPOS[k]] == null ? '' : t[MAPA_CAMPOS[k]]) !== String(cambios[k] == null ? '' : cambios[k]);
  });
  if (corrige && !String(usuario || '').trim()) throw new Error('Para corregir una tarjeta identificate (quien hace el cambio queda registrado).');

  var valores = {};
  Object.keys(cambios).forEach(function (k) {
    var col = MAPA_CAMPOS[k];
    if (!col) return;
    var antes = String(t[col] == null ? '' : t[col]);
    var despues = String(cambios[k] == null ? '' : cambios[k]);
    if (antes === despues) return;
    valores[col] = cambios[k];
    log_(id, CAMPOS_CORRECCION.indexOf(k) > -1 ? 'Correccion' : 'Cambio', col, antes, despues, usuario);
    if (k === 'areaEquipo') valores['Sector'] = cambios[k];   // compatibilidad: Sector = area del equipo
    if (k === 'detectadoPor') valores['Sector detector'] = cambios.sectorDetector || '';
    if (k === 'fechaCompromiso' && antes) valores['Reprogramaciones'] = (Number(t['Reprogramaciones']) || 0) + 1;
    if (k === 'tipo') valores['Grupo responsable'] = GRUPO_POR_COLOR[cambios.tipo];
  });
  if (cambios.estado === 'Anulada') {
    valores['Notas'] = ((valores['Notas'] !== undefined ? valores['Notas'] : t['Notas']) || '') +
      (t['Notas'] ? '\n' : '') + '[Anulada ' + ahora_() + (usuario ? ' por ' + usuario : '') + '] ' + cambios.motivo;
  }
  if (Object.keys(valores).length) escribir_(id, valores);
  return { ok: true, id: id, cambios: Object.keys(valores).length };
}

// Aplica muchos cambios en un solo llamado (lo usa "Aplicar plan" y la asignacion en lote).
function actualizarLote_(items, usuario) {
  var ok = 0, errores = [];
  items.forEach(function (it) {
    try { actualizar_(it.id, it.cambios || {}, usuario); ok++; }
    catch (e) { errores.push(it.id + ': ' + (e.message || e)); }
  });
  return { ok: true, actualizadas: ok, errores: errores };
}

/* ============================ CERRAR (resolver) ============================ */

function cerrar_(req, usuario) {
  var id = req.id, accion = String(req.accion || '').trim(), cerradoPor = String(req.cerradoPor || '').trim();
  if (!accion) throw new Error('Indica la accion de cierre.');
  if (!cerradoPor) throw new Error('Indica quien resolvio la tarjeta.');
  var hr = parseFloat(req.horasReales), pr = parseInt(req.personasReales, 10);
  if (!(hr > 0)) throw new Error('Indica cuantas horas llevo realmente.');
  if (!(pr >= 1)) throw new Error('Indica cuantas personas trabajaron.');
  if (!String(req.causa || '').trim()) throw new Error('Indica la causa.');
  var t = leer_(id);
  if (ESTADOS_ABIERTOS.indexOf(t['Estado']) === -1) throw new Error('La tarjeta no esta abierta (estado: ' + t['Estado'] + ').');

  var fotoCierre = '', fotoError = '';
  if (req.fotoCierreData) {
    try { fotoCierre = guardarFoto_(req.fotoCierreData, id + '-despues'); }
    catch (err) { fotoError = 'No se pudo guardar la foto del despues: ' + (err.message || err); }
  }
  var v = {
    'Estado': 'Cerrada', 'Fecha cierre': ahora_(), 'Accion de cierre': accion, 'Cerrado por': cerradoPor,
    'Causa': req.causa || '', 'Horas reales': hr, 'Personas reales': pr, 'Agregar a MP': req.agregarMP ? 'Si' : '', 'Actualizar estandar': req.actualizarEstandar ? 'Si' : ''
  };
  if (fotoCierre) v['Foto cierre URL'] = fotoCierre;
  if (req.costo !== undefined && req.costo !== null && req.costo !== '') v['Costo estimado'] = req.costo;
  escribir_(id, v);
  log_(id, 'Resuelta', 'Estado', t['Estado'], 'Cerrada', usuario || cerradoPor);
  log_(id, 'Resuelta', 'Accion de cierre', '', accion, usuario || cerradoPor);

  try { avisarDetector_(t, accion, cerradoPor, fotoCierre); } catch (err) {}
  return { ok: true, id: id, fotoError: fotoError };
}

/* ============================ VERIFICAR (2do paso) ============================ */

function verificar_(req, usuario) {
  var id = req.id, quien = String(req.verificadoPor || usuario || '').trim();
  if (!quien) throw new Error('Indica quien verifica.');
  var t = leer_(id);
  if (t['Estado'] !== 'Cerrada') throw new Error('Solo se verifican tarjetas resueltas (estado actual: ' + t['Estado'] + ').');
  var ok = req.ok === true || req.ok === 'true';
  if (ok) {
    escribir_(id, { 'Estado': 'Verificada', 'Verificado por': quien, 'Fecha verificacion': ahora_() });
    log_(id, 'Verificada', 'Estado', 'Cerrada', 'Verificada', quien);
  } else {
    var com = String(req.comentario || '').trim();
    if (!com) throw new Error('Indica por que no queda resuelta.');
    var nota = (t['Notas'] ? t['Notas'] + '\n' : '') + '[Reabierta ' + ahora_() + ' por ' + quien + '] ' + com +
      ' (cierre anterior: ' + t['Accion de cierre'] + ')';
    escribir_(id, {
      'Estado': 'Abierta', 'Fecha cierre': '', 'Accion de cierre': '', 'Cerrado por': '', 'Foto cierre URL': '',
      'Reaperturas': (Number(t['Reaperturas']) || 0) + 1, 'Notas': nota
    });
    log_(id, 'Reabierta', 'Estado', 'Cerrada', 'Abierta', quien);
    log_(id, 'Reabierta', 'Motivo', '', com, quien);
    try { avisarReapertura_(t, quien, com); } catch (err) {}
  }
  return { ok: true, id: id };
}

/* ============================ PARADAS ============================ */

function listarParadas_() {
  var sh = hoja_('Paradas', H_PARADAS);
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, H_PARADAS.length).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      var hora = r[6] instanceof Date ? Utilities.formatDate(r[6], TZ, 'HH:mm') : String(r[6] || '').replace(/^'/, '');
      return { id: String(r[0]), fecha: r[1] instanceof Date ? Utilities.formatDate(r[1], TZ, 'yyyy-MM-dd') : String(r[1]),
        descripcion: r[2], hh: r[3], estado: r[4] || 'Programada', duracion: r[5], horaInicio: hora };
    })
    .sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
}

function guardarParada_(p, usuario) {
  if (!p.fecha) throw new Error('Falta la fecha de la parada.');
  var sh = hoja_('Paradas', H_PARADAS);
  var nuevoId = 'PAR-' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
  var fila = [p.id || nuevoId, p.fecha, p.descripcion || '', p.hh || '', p.estado || 'Programada',
    p.duracion || '', p.horaInicio ? "'" + p.horaInicio : ''];
  var n = sh.getLastRow();
  if (p.id && n > 1) {
    var ids = sh.getRange(2, 1, n - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(p.id)) {
      sh.getRange(i + 2, 1, 1, H_PARADAS.length).setValues([fila]);
      log_(p.id, 'Parada', 'Editada', '', p.fecha + ' ' + (p.descripcion || ''), usuario);
      return { ok: true, id: p.id };
    }
  }
  sh.appendRow(fila);
  log_(fila[0], 'Parada', 'Alta', '', p.fecha + ' ' + (p.descripcion || ''), usuario);
  return { ok: true, id: fila[0] };
}

function borrarParada_(id, usuario) {
  var sh = hoja_('Paradas', H_PARADAS);
  var n = sh.getLastRow();
  if (n < 2) return { ok: true };
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) {
    sh.deleteRow(i + 2); log_(id, 'Parada', 'Borrada', '', '', usuario);
    return { ok: true };
  }
  return { ok: true };
}

/* ============================ DATOS MAESTROS ============================ */

function maestros_() {
  var personas = {}, arbol = {}, nP = 0, nA = 0;
  var sp = hoja_('Personas', H_PERSONAS);
  if (sp.getLastRow() > 1) {
    sp.getRange(2, 1, sp.getLastRow() - 1, H_PERSONAS.length).getValues().forEach(function (r) {
      if (!r[1]) return;
      if (String(r[3]).toLowerCase() === 'no') return;   // Activo = No -> baja
      (personas[r[0] || 'Sin sector'] = personas[r[0] || 'Sin sector'] || []).push(String(r[1]));
      nP++;
    });
  }
  var sa = hoja_('Arbol', H_ARBOL);
  if (sa.getLastRow() > 1) {
    sa.getRange(2, 1, sa.getLastRow() - 1, H_ARBOL.length).getValues().forEach(function (r) {
      if (!r[0]) return;
      arbol[r[0]] = arbol[r[0]] || {};
      if (r[1]) { arbol[r[0]][r[1]] = arbol[r[0]][r[1]] || []; if (r[2]) arbol[r[0]][r[1]].push(String(r[2])); }
      nA++;
    });
  }
  return { ok: true, personas: nP ? personas : null, arbol: nA ? arbol : null, areas: leerAreas_(), responsables: leerResponsables_() };
}

function sembrarMaestros_(personas, arbol, forzar) {
  var res = { ok: true, personas: 0, arbol: 0 };
  if (personas) {
    var sp = hoja_('Personas', H_PERSONAS);
    if (sp.getLastRow() > 1 && !forzar) res.personasMsg = 'La hoja Personas ya tiene datos: no se toco.';
    else {
      if (sp.getLastRow() > 1) sp.getRange(2, 1, sp.getLastRow() - 1, H_PERSONAS.length).clearContent();
      var filas = [];
      Object.keys(personas).forEach(function (s) { personas[s].forEach(function (n) { filas.push([s, n, '', 'Si']); }); });
      if (filas.length) sp.getRange(2, 1, filas.length, H_PERSONAS.length).setValues(filas);
      res.personas = filas.length;
    }
  }
  if (arbol) {
    var sa = hoja_('Arbol', H_ARBOL);
    if (sa.getLastRow() > 1 && !forzar) res.arbolMsg = 'La hoja Arbol ya tiene datos: no se toco.';
    else {
      if (sa.getLastRow() > 1) sa.getRange(2, 1, sa.getLastRow() - 1, H_ARBOL.length).clearContent();
      var fa = [];
      Object.keys(arbol).forEach(function (a) {
        var subs = Object.keys(arbol[a]);
        if (!subs.length) fa.push([a, '', '']);
        subs.forEach(function (s) {
          if (!arbol[a][s].length) fa.push([a, s, '']);
          arbol[a][s].forEach(function (e) { fa.push([a, s, e]); });
        });
      });
      if (fa.length) sa.getRange(2, 1, fa.length, H_ARBOL.length).setValues(fa);
      res.arbol = fa.length;
    }
  }
  return res;
}

/* ---------- Areas: criticidad, supervisores y ejecutores ---------- */
function leerAreas_() {
  var sh = hoja_('Areas', H_AREAS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, H_AREAS.length).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { var o = {}; H_AREAS.forEach(function (h, i) { o[h] = String(r[i] == null ? '' : r[i]); }); return o; });
}

function guardarAreas_(filas, usuario) {
  var sh = hoja_('Areas', H_AREAS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, H_AREAS.length).clearContent();
  var v = filas.filter(function (f) { return f && f.Area; })
    .map(function (f) { return H_AREAS.map(function (h) { return f[h] || ''; }); });
  if (v.length) sh.getRange(2, 1, v.length, H_AREAS.length).setValues(v);
  log_('-', 'Configuracion', 'Areas', '', v.length + ' filas', usuario);
  return { ok: true, filas: v.length };
}

/* ---------- Areas que resuelven ---------- */
function leerResponsables_() {
  var sh = hoja_('Responsables', H_RESP);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, H_RESP.length).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { var o = {}; H_RESP.forEach(function (h, i) { o[h] = String(r[i] == null ? '' : r[i]); }); return o; });
}

function guardarResponsables_(filas, usuario) {
  var sh = hoja_('Responsables', H_RESP);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, H_RESP.length).clearContent();
  var v = filas.filter(function (f) { return f && String(f.Area || '').trim(); })
    .map(function (f) { return H_RESP.map(function (h) { return f[h] == null ? '' : f[h]; }); });
  if (v.length) sh.getRange(2, 1, v.length, H_RESP.length).setValues(v);
  log_('-', 'Configuracion', 'Areas que resuelven', '', v.length + ' areas', usuario);
  return { ok: true, filas: v.length };
}

function listaNombres_(txt) {
  if (Array.isArray(txt)) return txt.map(String).filter(String);
  return String(txt || '').split(';').map(function (x) { return x.trim(); }).filter(String);
}

// Equipo del area: el de la hoja Responsables si esta configurada; si no, el que manda el frontend (defaults de la nomina).
function poolResponsable_(area, enviado) {
  var r = leerResponsables_().filter(function (x) { return x.Area === area; })[0];
  return r ? listaNombres_(r.Personas) : listaNombres_(enviado);
}

// El del equipo con menos tarjetas abiertas como responsable (empate: orden alfabetico).
function menosCargado_(pool, excluirId) {
  if (!pool.length) return '';
  var sh = getSheet_(), n = sh.getLastRow() - 1, carga = {};
  if (n > 0) {
    var cR = colDe_('Responsable asignado'), cE = colDe_('Estado');
    var v = sh.getRange(2, 1, n, Math.max(cR, cE)).getValues();
    v.forEach(function (r) {
      if (excluirId && String(r[0]) === String(excluirId)) return;
      if (ESTADOS_ABIERTOS.indexOf(r[cE - 1]) > -1 && r[cR - 1]) carga[r[cR - 1]] = (carga[r[cR - 1]] || 0) + 1;
    });
  }
  return pool.slice().sort(function (a, b) { return ((carga[a] || 0) - (carga[b] || 0)) || a.localeCompare(b); })[0];
}

function emailDe_(nombre) {
  if (!nombre) return '';
  var sp = hoja_('Personas', H_PERSONAS);
  if (sp.getLastRow() < 2) return '';
  var d = sp.getRange(2, 1, sp.getLastRow() - 1, 3).getValues();
  for (var i = 0; i < d.length; i++) if (String(d[i][1]).trim() === String(nombre).trim()) return String(d[i][2] || '').trim();
  return '';
}

/* ============================ AVISOS POR EMAIL ============================ */

function linkApp_(pagina) { return APP_URL ? APP_URL.replace(/\/?$/, '/') + pagina : ''; }

function notificar_(grupo, id, tipo, d, fotoUrl) {
  var dest = NOTIF[grupo];
  if (!dest) return;
  var asunto = '[Tarjeta TPM ' + tipo + '] ' + id + ' - ' + (d.areaEquipo || '') + (d.equipo ? ' / ' + d.equipo : '');
  var cuerpo =
    'Nueva tarjeta ' + tipo + ' asignada a ' + grupo + '.\n\n' +
    'ID: ' + id + '\nArea: ' + (d.areaEquipo || '') + '\nEquipo: ' + (d.equipo || '') +
    '\nComponente: ' + (d.componente || '') + '\nCategoria: ' + (d.categoria || '') +
    '\nPrioridad: ' + (d.prioridad || 'Media') + '\nArea que resuelve: ' + (d.areaResponsable || '') + '\nCondicion: ' + normCondicion_(d.condicion) +
    '\nDetectado por: ' + (d.detectadoPor || '') +
    '\n\nDescripcion:\n' + (d.descripcion || '') +
    (fotoUrl ? '\n\nFoto: ' + fotoUrl : '') +
    (APP_URL ? '\n\nSeguimiento: ' + linkApp_('seguimiento.html?id=' + encodeURIComponent(id)) : '');
  MailApp.sendEmail(dest, asunto, cuerpo);
}

// Cierre del circulo: quien detecto se entera de que se resolvio y se le pide verificar.
function avisarDetector_(t, accion, cerradoPor, fotoCierre) {
  var mail = emailDe_(t['Detectado por']);
  if (!mail) return;
  var link = linkApp_('mis-tarjetas.html');
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<h2 style="color:#548235;margin:0 0 6px">Tu tarjeta fue resuelta 👏</h2>' +
    '<p style="color:#444">Gracias por cuidar la línea. La tarjeta <b>' + t['ID'] + '</b> que cargaste el ' + t['Fecha alta'] +
    ' en <b>' + (t['Area equipo'] || '') + (t['Equipo'] ? ' › ' + t['Equipo'] : '') + '</b> ya fue resuelta por <b>' + cerradoPor + '</b>.</p>' +
    '<p style="background:#F3F6EE;padding:10px;border-radius:6px"><b>Lo que viste:</b> ' + t['Descripcion'] + '<br><b>Lo que se hizo:</b> ' + accion + '</p>' +
    '<table><tr>' +
    (t['Foto URL'] ? '<td style="padding-right:8px"><div style="font-size:11px;color:#777">Antes</div><img src="' + t['Foto URL'] + '" width="240"></td>' : '') +
    (fotoCierre ? '<td><div style="font-size:11px;color:#777">Después</div><img src="' + fotoCierre + '" width="240"></td>' : '') +
    '</tr></table>' +
    '<p>¿Quedó bien? Verificalo en el equipo y confirmalo' + (link ? ' en <a href="' + link + '">Mis tarjetas</a>' : ' en la app, sección Mis tarjetas') + '.</p></div>';
  MailApp.sendEmail({ to: mail, subject: '✔ Tu tarjeta ' + t['ID'] + ' fue resuelta — verificala', htmlBody: html });
}

function avisarReapertura_(t, quien, comentario) {
  var dest = [emailDe_(t['Responsable asignado']), emailDe_(t['Cerrado por']), NOTIF[t['Grupo responsable']]]
    .filter(function (x) { return x; });
  if (!dest.length) return;
  MailApp.sendEmail(dest.join(','), '↻ Tarjeta ' + t['ID'] + ' reabierta en la verificación',
    'La tarjeta ' + t['ID'] + ' (' + (t['Area equipo'] || '') + ' › ' + (t['Equipo'] || '') + ') fue reabierta por ' + quien +
    '.\n\nMotivo: ' + comentario + '\nCierre anterior: ' + t['Accion de cierre'] +
    (APP_URL ? '\n\n' + linkApp_('seguimiento.html?id=' + encodeURIComponent(t['ID'])) : ''));
}

/* ============================ SEGURIDAD -> EHS ============================ */

// Ajustar aca los nombres de campos que espera el "crear" del sistema EHS.
function mapearEHS_(t) {
  return {
    action: 'crear',
    data: {
      origen: 'Tarjeta TPM ' + t['ID'],
      tipo: 'Condicion insegura',
      sector: t['Area equipo'], area: t['Area equipo'],
      lugar: [t['Equipo'], t['Componente/Ubicacion']].filter(String).join(' › '),
      descripcion: t['Descripcion'],
      detectadoPor: t['Detectado por'], reportadoPor: t['Detectado por'],
      fotoUrl: t['Foto URL'], prioridad: t['Prioridad']
    }
  };
}

function derivarEHS_(id, t) {
  var hechos = [];
  if (EHS_EMAIL) {
    try {
      MailApp.sendEmail(EHS_EMAIL, '[SEH] Condición insegura desde Tarjeta TPM ' + id + ' - ' + (t['Area equipo'] || ''),
        'Se cargó una tarjeta TPM con categoría Seguridad.\n\nID: ' + id + '\nÁrea: ' + (t['Area equipo'] || '') +
        '\nEquipo: ' + (t['Equipo'] || '') + ' ' + (t['Componente/Ubicacion'] || '') +
        '\nDetectado por: ' + (t['Detectado por'] || '') + '\nPrioridad: ' + (t['Prioridad'] || '') +
        '\n\nDescripción:\n' + (t['Descripcion'] || '') + (t['Foto URL'] ? '\n\nFoto: ' + t['Foto URL'] : ''));
      hechos.push('Email');
    } catch (e) { hechos.push('Error email'); }
  }
  if (EHS_API_URL) {
    try {
      var r = UrlFetchApp.fetch(EHS_API_URL, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(mapearEHS_(t)), muteHttpExceptions: true });
      var j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
      hechos.push(j.ok ? 'EHS ' + (j.id || 'OK') : 'Error API');
    } catch (e) { hechos.push('Error API'); }
  }
  return hechos.length ? hechos.join(' + ') + ' ' + ahora_() : 'Pendiente';
}

function derivarEHSManual_(id, usuario) {
  var t = leer_(id);
  var res = derivarEHS_(id, t);
  escribir_(id, { 'Enviado a EHS': res });
  log_(id, 'Derivada a EHS', 'Enviado a EHS', t['Enviado a EHS'], res, usuario);
  return { ok: true, id: id, ehs: res };
}


/* ============================ HISTORIAL PARA ESTIMAR ============================
   Cierres con horas reales de los ultimos 3 anos, solo los campos que usa la estimacion
   (liviano: se cachea en el celular). */
var CAMPOS_EST = ['ID', 'Tipo', 'Categoria', 'Area equipo', 'Equipo', 'Componente/Ubicacion', 'Descripcion', 'Accion de cierre',
  'Horas reales', 'Personas reales', 'Horas estimadas', 'Personas necesarias', 'Especialidad', 'Repuestos', 'Area responsable',
  'Condicion intervencion', 'Cerrado por', 'Ejecutores', 'Estado', 'Fecha cierre'];
function historialEstimacion_() {
  var sh = getSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var idx = CAMPOS_EST.map(function (c) { return HEADERS.indexOf(c); });
  var limite = new Date(); limite.setFullYear(limite.getFullYear() - 3);
  var iE = HEADERS.indexOf('Estado'), iH = HEADERS.indexOf('Horas reales'), iF = HEADERS.indexOf('Fecha cierre');
  var out = [];
  for (var r = v.length - 1; r >= 0 && out.length < 3000; r--) {
    var f = v[r];
    if (!f[0] || (f[iE] !== 'Cerrada' && f[iE] !== 'Verificada') || !(parseFloat(f[iH]) > 0)) continue;
    var fc = f[iF] ? parseFecha_(f[iF]) : null;
    if (fc && fc < limite) continue;
    var o = {};
    CAMPOS_EST.forEach(function (c, i) { var val = f[idx[i]]; o[c] = (c === 'Descripcion' || c === 'Accion de cierre') ? String(val || '').slice(0, 200) : fmt_(val, c); });
    out.push(o);
  }
  return out;
}
