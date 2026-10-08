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

const VERSION_BACKEND = 21; // subir junto con VERSION_BACKEND_MIN en comun.js
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

// Integracion con el EAM (ordenes de trabajo conectadas a SAP).
//  El EAM exporta un CSV a Drive (siempre el mismo archivo, se pisa). Un disparador cada 15 min lo lee:
//  - OT abierta en el EAM  -> la tarjeta toma N OT, responsable, fecha programada, horas y personas.
//  - OT "Terminado"        -> la tarjeta se cierra sola como Verificada con los datos reales del EAM.
//  Para activarlo: correr UNA VEZ instalarDisparadorEAM() desde el editor (pide permiso de Drive).
const EAM_CSV_ID = '1GmR74AUz5E2GS5LE1x3ZKNEOzFFYck1H';   // ot_cerradas_tarjetas.csv (export automatico del EAM) (se puede cambiar en Propiedades: EAM_CSV_ID)
const EAM_ESTADOS_CERRADOS = ['terminado', 'cerrado', 'cerrada', 'finalizado', 'completado'];
const EAM_ESTADOS_SIN_PROGRAMA = ['listo para planificar', 'pendiente', 'solicitado', 'abierto', 'solicitud de trabajo', 'en espera de emision', ''];
const CAUSA_EAM_PENDIENTE = 'A completar (cerrada desde EAM)';
const EAM_MINUTOS = 15;

// Copia de seguridad SEMANAL de la planilla: todos los domingos a las 3 a.m. (carpeta "Backups Tarjetas TPM").
// Se guardan las copias de los ultimos BACKUP_DIAS dias (12 domingos) + una por mes durante BACKUP_MESES meses.
const BACKUP_HORA = 3;          // 3 a.m. (hora de Argentina)
const BACKUP_DIAS = 84;
const BACKUP_MESES = 12;
const BACKUP_CARPETA = 'Backups Tarjetas TPM';

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
  'Area responsable', 'Horas reales', 'Personas reales',
  // v13 — integracion EAM: ultimo estado de la OT y cuando cambio algo desde el EAM
  'Estado EAM', 'Actualizado EAM',
  // v20 — arbol de equipos por SISTEMA (codigo unico del lugar) y ubicacion del arbol anterior (no se pierde)
  'Sistema', 'Ubicacion anterior',
  // v21 — intercambio con el EAM: cierre con horas por persona y dia, exclusion de la migracion y rechazos del EAM
  'Fecha inicio real', 'Horas detalle', 'Export EAM', 'Rechazo EAM'
];
const COLS_FECHAHORA = ['Fecha alta', 'Fecha cierre', 'Fecha verificacion', 'Fecha inicio real'];
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

const ACCIONES_ESCRITURA = ['sincronizarEAM', 'completarCausa', 'guardarResponsables', 'crear', 'actualizar', 'actualizarLote', 'cerrar', 'verificar', 'guardarParada', 'borrarParada', 'sembrarMaestros', 'guardarAreas', 'derivarEHS', 'setup'];

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
    repararAuto_();
    migrarArbol_();
    migrarExportEAM_();
    if (ACCIONES_ESCRITURA.indexOf(action) > -1) {
      lock = LockService.getScriptLock();
      lock.waitLock(25000);
    }
    switch (action) {
      case 'ping':            out = { ok: true, ts: ahora_(), version: VERSION_BACKEND }; break;
      case 'setup':           out = setup(); break;
      case 'crear':           out = crear_(req.data || req, usuario); break;
      case 'listar':          out = listarRapido_(req.desde); break;
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
      case 'sincronizarEAM':  out = sincronizarEAMSeguro_(usuario || 'manual'); break;
      case 'estadoEAM':       out = estadoEAM_(); break;
      case 'descargaEAM':     out = (function () { var x = armarExportEAM_(); return { ok: true, tarjetas: x.tarjetas, horas: x.horas, res: x.res }; })(); break;
      case 'completarCausa':  out = completarCausa_(req, usuario); break;
      case 'historialEstimacion': out = { ok: true, filas: historialEstimacion_() }; break;
      default:                out = { ok: false, error: 'Accion desconocida: ' + action };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    if (lock && out && out.ok !== false) invalidarCacheListar_();   // cualquier escritura invalida la lista guardada
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
// Reparacion (oct-2026): tarjetas guardadas con responsable "__auto__" cuando el servidor publicado era viejo.
function repararAuto_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('reparar_auto_v1')) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    if (props.getProperty('reparar_auto_v1')) return;
    var sh = getSheet_(), n = sh.getLastRow() - 1, cambiadas = 0;
    if (n > 0) {
      var rng = sh.getRange(2, 1, n, HEADERS.length), v = rng.getValues();
      var cR = colDe_('Responsable asignado') - 1, cE = colDe_('Ejecutores') - 1;
      v.forEach(function (r) {
        var t = false;
        if (r[cR] === '__auto__') { log_(r[0], 'Reparacion', 'Responsable asignado', '__auto__', '(sin asignar)', 'sistema'); r[cR] = ''; t = true; }
        if (String(r[cE]).indexOf('__auto__') > -1) { r[cE] = String(r[cE]).split(';').map(function (x) { return x.trim(); }).filter(function (x) { return x && x !== '__auto__'; }).join('; '); t = true; }
        if (t) cambiadas++;
      });
      if (cambiadas) { rng.setValues(v); invalidarCacheListar_(); }
    }
    props.setProperty('reparar_auto_v1', ahora_() + ' · ' + cambiadas + ' tarjetas');
    flushLog_();
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

// Migracion (oct-2026) al arbol de equipos por SISTEMA. Corre una sola vez.
//  - A TODAS las tarjetas viejas se les guarda la ubicacion anterior ("AREA › SUBAREA › EQUIPO") en 'Ubicacion anterior'.
//  - Las que tienen equivalente seguro en el arbol nuevo pasan a: Area = area nueva, Equipo = Descripcion, Sistema = codigo.
//  - Las que no, quedan con su ubicacion vieja (se corrigen desde "Corregir datos de la carga").
function migrarArbol_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('migracion_arbol_v1')) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    if (props.getProperty('migracion_arbol_v1')) return;
    var sh = getSheet_(), n = sh.getLastRow() - 1, migradas = 0, guardadas = 0;
    if (n > 0) {
      var rng = sh.getRange(2, 1, n, HEADERS.length), v = rng.getValues();
      var c = function (h) { return colDe_(h) - 1; };
      var cA = c('Area equipo'), cS = c('Sector'), cE = c('Equipo'), cC = c('Componente/Ubicacion'), cSis = c('Sistema'), cU = c('Ubicacion anterior');
      v.forEach(function (r) {
        if (!r[0] || r[cSis] || r[cU]) return;
        var a = String(r[cA] || '').trim(), e = String(r[cE] || '').trim(), k = String(r[cC] || '').trim();
        if (!a && !e) return;
        r[cU] = [a, e, k].filter(String).join(' › '); guardadas++;
        var m = MIGRACION_ARBOL[a + '|' + e + '|' + k] || MIGRACION_ARBOL[a + '|' + e + '|'];
        if (!m) return;
        log_(r[0], 'Migracion arbol', 'Ubicacion', r[cU], m[2] + ' › ' + m[1] + ' (' + m[0] + ')', 'sistema');
        r[cSis] = m[0]; r[cE] = m[1]; r[cA] = m[2]; r[cS] = m[2]; r[cC] = '';
        migradas++;
      });
      if (guardadas) { rng.setValues(v); invalidarCacheListar_(); }
    }
    props.setProperty('migracion_arbol_v1', ahora_() + ' · ' + migradas + ' migradas de ' + guardadas);
    flushLog_();
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

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
      if (cambiadas) { rng.setValues(v); invalidarCacheListar_(); }
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
  fila['Sistema'] = d.sistema || '';
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

/* ---------- Lista guardada en cache (acelera Seguimiento, Dashboard, Inicio, TV...) ----------
   Armar la lista de ~300 tarjetas lleva 1–3 s en Apps Script. Se guarda comprimida en CacheService por 10 minutos y
   se descarta apenas cambia algo (cualquier escritura de la app, la lectura del EAM, reparaciones). */
const CACHE_LISTAR_SEG = 600;
function invalidarCacheListar_() {
  try {
    var pr = PropertiesService.getScriptProperties(), prev = +pr.getProperty('cache_listar_ver') || 0;
    pr.setProperty('cache_listar_ver', String(Math.max(Date.now(), prev + 1)));   // siempre distinta, aunque caiga en el mismo milisegundo
  } catch (e) {}
}
function listarRapido_(desde) {
  var cache = null, key = '';
  try {
    cache = CacheService.getScriptCache();
    var ver = PropertiesService.getScriptProperties().getProperty('cache_listar_ver') || '0';
    key = 'L' + ver + '_' + String(desde || 'todo');
    var c = cache.get(key);
    if (c) {
      var txt = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(c), 'application/x-gzip')).getDataAsString();
      var o = JSON.parse(txt); o.cache = true; o.version = VERSION_BACKEND; return o;
    }
  } catch (e) { cache = null; }
  var out = { ok: true, tarjetas: listar_(desde), paradas: listarParadas_(), version: VERSION_BACKEND };
  try {
    if (cache) {
      var gz = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(out), 'application/json')).getBytes());
      if (gz.length < 95000) cache.put(key, gz, CACHE_LISTAR_SEG);   // limite de CacheService: 100 KB por valor
    }
  } catch (e) {}
  return out;
}

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
  detectadoPor: 'Detectado por', turno: 'Turno', sistema: 'Sistema'
};
const CAMPOS_CORRECCION = ['descripcion', 'areaEquipo', 'equipo', 'componente', 'detectadoPor', 'turno', 'tipo', 'sistema'];

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
    valores[col] = (col === 'Responsable asignado' && cambios[k] === '__auto__') ? '' : cambios[k];
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
  var det = (req.horasDetalle || []).map(function (x) { return { p: String(x.p || '').trim(), f: String(x.f || '').slice(0, 10), h: Math.round(eamNum_(x.h) * 100) / 100 }; })
    .filter(function (x) { return x.p && x.h > 0; });
  if (det.some(function (x) { return x.h > 24 || !/^\d{4}-\d{2}-\d{2}$/.test(x.f); })) throw new Error('Revisa las horas: cada fila necesita fecha y entre 0 y 24 horas.');
  if (det.some(function (x) { return x.f > ahora_().slice(0, 10); })) throw new Error('Las horas no pueden tener fecha futura.');
  if (det.length) {
    req.horasReales = det.reduce(function (a, x) { return a + x.h; }, 0);
    req.personasReales = Object.keys(det.reduce(function (o, x) { o[x.p] = 1; return o; }, {})).length;
  }
  var ini = req.fechaInicio ? eamFecha_(req.fechaInicio) : '';
  if (ini && ini > ahora_()) throw new Error('El inicio del trabajo no puede ser una fecha futura.');
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
  if (det.length) v['Horas detalle'] = det.map(function (x) { return x.p + '|' + x.f + '|' + x.h; }).join('; ');
  if (ini) v['Fecha inicio real'] = ini;
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
function avisarDetector_(t, accion, cerradoPor, fotoCierre, verificada) {
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
    (verificada ? '<p>La orden de trabajo quedó cerrada en el EAM. Si ves que el problema sigue, cargá una tarjeta nueva.</p></div>'
      : '<p>¿Quedó bien? Verificalo en el equipo y confirmalo' + (link ? ' en <a href="' + link + '">Mis tarjetas</a>' : ' en la app, sección Mis tarjetas') + '.</p></div>');
  MailApp.sendEmail({ to: mail, subject: '✔ Tu tarjeta ' + t['ID'] + ' fue resuelta' + (verificada ? '' : ' — verificala'), htmlBody: html });
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


/* ============================ INTEGRACION EAM ============================ */

// Para el disparador de tiempo (sin web app): toma el lock y escribe el historial al final.
function sincronizarEAM() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return { ok: false, error: 'ocupado' }; }
  try { return sincronizarEAMSeguro_('automatico'); }
  finally { flushLog_(); try { lock.releaseLock(); } catch (e2) {} }
}

// Corre la lectura y, si falla, deja el error guardado para mostrarlo en Seguimiento.
function sincronizarEAMSeguro_(origen) {
  try { return sincronizarEAM_(origen); }
  catch (err) {
    var m = String(err && err.message ? err.message : err);
    if (/permis|authoriz|autoriz/i.test(m)) m = 'Falta autorizar Drive: en el editor de Apps Script corré instalarDisparadorEAM() una vez y aceptá los permisos. (' + m + ')';
    else if (/no se encontr|not found|no item|no existe|does not exist/i.test(m)) m = 'No se encuentra el CSV del EAM en Drive (ID ' + (PropertiesService.getScriptProperties().getProperty('EAM_CSV_ID') || EAM_CSV_ID) + '). ' + m;
    var r = { ok: false, error: m, fecha: ahora_(), origen: origen };
    PropertiesService.getScriptProperties().setProperty('EAM_ULTIMA', JSON.stringify(r));
    r.exportacion = exportarEAMSeguro_();   // el envio al EAM no depende de que se haya podido leer el archivo de vuelta
    return r;
  }
}

// Correr UNA VEZ desde el editor de Apps Script: crea el disparador cada 15 minutos (y autoriza Drive).
function instalarDisparadorEAM() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'sincronizarEAM') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('sincronizarEAM').timeBased().everyMinutes(EAM_MINUTOS).create();
  return sincronizarEAM();
}

function estadoEAM_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('EAM_ULTIMA'), b = props.getProperty('BACKUP_ULTIMO');
  // del backup solo se informa si anduvo: ni link a la carpeta ni a la copia (los backups son solo del dueño del script)
  var bk = b ? JSON.parse(b) : null;
  if (bk) bk = { ok: bk.ok, fecha: bk.fecha, guardados: bk.guardados, error: bk.ok ? '' : 'revisar en Apps Script' };
  var ex = props.getProperty('EAM_EXPORT_ULTIMA');
  return { ok: true, ultima: p ? JSON.parse(p) : null, cada: EAM_MINUTOS, backup: bk, exportacion: ex ? JSON.parse(ex) : null };
}

function eamNorm_(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// CSV con separador detectado (tab, ; o ,) y comillas RFC 4180.
function eamParseCsv_(txt) {
  txt = String(txt || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  var primera = txt.split('\n')[0], sep = ',';
  [['\t', (primera.match(/\t/g) || []).length], [';', (primera.match(/;/g) || []).length], [',', (primera.match(/,/g) || []).length]]
    .reduce(function (m, x) { if (x[1] > m) { sep = x[0]; return x[1]; } return m; }, 0);
  var filas = [], fila = [], campo = '', q = false;
  for (var i = 0; i < txt.length; i++) {
    var c = txt[i];
    if (q) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; }
      else campo += c;
    } else if (c === '"' && campo === '') q = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(function (f) { return f.some(function (x) { return String(x).trim(); }); });
}

function eamLeerArchivo_() {
  var id = PropertiesService.getScriptProperties().getProperty('EAM_CSV_ID') || EAM_CSV_ID;
  var f = DriveApp.getFileById(id);
  if (f.getMimeType && f.getMimeType() === 'application/vnd.google-apps.spreadsheet') {
    return SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues();
  }
  var blob = f.getBlob(), txt = blob.getDataAsString('UTF-8');
  if (txt.indexOf('�') > -1) txt = blob.getDataAsString('ISO-8859-1');   // export de Windows / Excel
  return eamParseCsv_(txt);
}

// "2026-10-01 10:20" | "01/10/2026 10:20" | Date -> "yyyy-MM-dd HH:mm" ('' si no se entiende)
function eamFecha_(v, soloDia) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, soloDia ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
  var s = String(v || '').trim(), m, p = function (n) { return ('0' + n).slice(-2); };
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/))) {
    return m[1] + '-' + p(m[2]) + '-' + p(m[3]) + (soloDia ? '' : ' ' + p(m[4] || 0) + ':' + (m[5] || '00'));
  }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/))) {
    return m[3] + '-' + p(m[2]) + '-' + p(m[1]) + (soloDia ? '' : ' ' + p(m[4] || 0) + ':' + (m[5] || '00'));
  }
  return '';
}
function eamNum_(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }

// ---------- Nombres del EAM -> nombres de la lista de personas ----------
// El EAM exporta "MARCONI JORGE", "Guillermo Panis", "Jonatan Brian Batstoc", "COLLI Y OCKIER MAXIMILIANO".
// Se buscan en la lista de personas de la app (personas.js publicado + hoja Personas) para guardar
// exactamente "Panis, Guillermo Adrian", "Batstoc, Jonatan Braian", etc. Si no aparece, se arma "Apellido, Nombre".
var _PERSONAS_EAM = null;
function eamPersonasConocidas_() {
  if (_PERSONAS_EAM) return _PERSONAS_EAM;
  var set = {}, cache = null;
  try { cache = CacheService.getScriptCache(); var c = cache.get('personas_eam_v1'); if (c) { _PERSONAS_EAM = JSON.parse(c); return _PERSONAS_EAM; } } catch (e) {}
  try {
    var txt = UrlFetchApp.fetch(String(APP_URL).replace(/\/?$/, '/') + 'personas.js', { muteHttpExceptions: true }).getContentText();
    (String(txt).match(/"([^"\n]{2,60},[^"\n]{1,60})"/g) || []).forEach(function (q) { set[q.slice(1, -1).trim()] = 1; });
  } catch (e) {}
  try {
    var sh = ss_().getSheetByName('Personas');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { if (String(r[0]).indexOf(',') > -1) set[String(r[0]).trim()] = 1; });
  } catch (e) {}
  _PERSONAS_EAM = Object.keys(set);
  try { if (cache && _PERSONAS_EAM.length) cache.put('personas_eam_v1', JSON.stringify(_PERSONAS_EAM), 21600); } catch (e) {}
  return _PERSONAS_EAM;
}
function eamTok_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(String);
}
function eamLev1_(a, b) {   // distancia de edicion <= 1 (para "Brian"/"Braian", "Goni"/"Goñi")
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  var i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}
function eamTokOk_(x, T) {
  return T.some(function (t) {
    if (t === x) return true;
    if (t.length === 1 || x.length === 1) return t[0] === x[0];          // inicial: "L." = "Luis"
    return x.length >= 4 && t.length >= 4 && eamLev1_(x, t);
  });
}
function eamBuscarPersona_(raw, lista) {
  var T = eamTok_(raw), mejor = null, puntos = -1, empate = false;
  if (!T.length) return '';
  lista.forEach(function (p) {
    var k = p.indexOf(','), S = eamTok_(p.slice(0, k)), N = eamTok_(p.slice(k + 1));
    if (!S.length || !S.every(function (x) { return eamTokOk_(x, T); })) return;
    var nOk = N.filter(function (x) { return eamTokOk_(x, T); }).length;
    if (N.length && !nOk) return;                                           // apellido solo no alcanza
    var pts = S.length * 2 + nOk;
    if (pts > puntos) { mejor = p; puntos = pts; empate = false; } else if (pts === puntos && p !== mejor) empate = true;
  });
  return empate ? '' : (mejor || '');
}
var EAM_PARTICULAS = ['y', 'de', 'del', 'la', 'las', 'los', 'da', 'van', 'von', 'di'];
function eamNombre_(s) {
  var w = String(s || '').trim().replace(/\s+/g, ' ');
  if (!w) return '';
  var hallado = eamBuscarPersona_(w, eamPersonasConocidas_());
  if (hallado) return hallado;
  if (w.indexOf(',') > -1) return w;
  var cap = function (x) { return x.toLowerCase().replace(/(^|[\s'-])(\S)/g, function (a, b, c) { return b + c.toUpperCase(); }); };
  var p = w.split(' ');
  if (p.length === 1) return cap(w);
  var esPart = function (x) { return EAM_PARTICULAS.indexOf(String(x).toLowerCase()) > -1; };
  var ap, nom;
  if (w === w.toUpperCase()) {            // "COLLI Y OCKIER MAXIMILIANO": apellido primero (+ particulas)
    var i = 1; while (i < p.length - 1 && esPart(p[i])) i += 2;
    ap = p.slice(0, i); nom = p.slice(i);
  } else {                                // "Guillermo Panis": nombre primero, apellido al final
    var j = p.length - 1; while (j > 1 && esPart(p[j - 1])) j -= 2;
    ap = p.slice(j); nom = p.slice(0, j);
  }
  return cap(ap.join(' ')).replace(/ (Y|De|Del|La|Las|Los|Da|Van|Von|Di) /g, function (m) { return m.toLowerCase(); }) + ', ' + cap(nom.join(' '));
}
function eamPersonas_(s) {   // "ARRIETA JUAN CRUZ, MARCONI JORGE" -> ["Arrieta, Ceferino Juan Cruz", "Marconi, Jorge"]
  var out = [];
  String(s || '').split(/[,;\/]/).map(eamNombre_).forEach(function (n) { if (n && out.indexOf(n) === -1) out.push(n); });
  return out;
}

// Agrupa las filas del CSV por ID_Tarjeta. Con varias OT para la misma tarjeta:
//  - N OT = todas ("159471; 159472")
//  - se considera Terminada solo cuando TODAS las OT estan terminadas: fecha de cierre = la ultima,
//    horas reales = suma, empleados = todos, comentarios = todos
//  - si alguna sigue abierta, manda la programacion de esa OT abierta (la mas avanzada)
function eamCombinar_(rows, C, g) {
  var grupos = {}, orden = [];
  rows.forEach(function (r) {
    var id = g(r, 'id').toUpperCase();
    if (!id) return;
    if (!grupos[id]) { grupos[id] = []; orden.push(id); }
    grupos[id].push(r);
  });
  var cerr = function (r) { return EAM_ESTADOS_CERRADOS.indexOf(g(r, 'est').toLowerCase()) > -1; };
  var uniq = function (arr) { var o = []; arr.forEach(function (x) { x = String(x || '').trim(); if (x && o.indexOf(x) === -1) o.push(x); }); return o; };
  return orden.map(function (id) {
    var rs = grupos[id];
    if (rs.length === 1) return rs[0];
    var abiertas = rs.filter(function (r) { return !cerr(r); });
    var base = abiertas.length
      ? (abiertas.filter(function (r) { return EAM_ESTADOS_SIN_PROGRAMA.indexOf(g(r, 'est').toLowerCase()) === -1; })[0] || abiertas[0])
      : rs.slice().sort(function (a, b) { return eamFecha_(g(b, 'fCierre')).localeCompare(eamFecha_(g(a, 'fCierre'))); })[0];
    var out = base.slice();
    var set = function (k, v) { if (C[k] > -1) out[C[k]] = v; };
    set('ot', uniq(rs.map(function (r) { return g(r, 'ot'); })).join('; '));
    set('desc', uniq(rs.map(function (r) { return g(r, 'desc'); })).join(' / '));
    if (!abiertas.length) {
      set('com', uniq(rs.map(function (r) { return g(r, 'com'); })).join(' / '));
      set('emp', uniq([].concat.apply([], rs.map(function (r) { return g(r, 'emp').split(/[,;]/); }))).join(', '));
      set('hsReal', rs.reduce(function (s, r) { return s + eamNum_(g(r, 'hsReal')); }, 0));
      out._hsOT = rs.map(function (r) { return eamNum_(g(r, 'hsReal')); });
    }
    return out;
  });
}

function sincronizarEAM_(origen) {
  var filas = eamLeerArchivo_();
  if (filas.length < 1) throw new Error('El CSV del EAM esta vacio.');
  var h = filas[0].map(eamNorm_), ix = function () {
    for (var i = 0; i < arguments.length; i++) { var k = h.indexOf(arguments[i]); if (k > -1) return k; } return -1;
  };
  var C = {
    id: ix('idtarjeta', 'tarjeta', 'id'), ot: ix('oteam', 'ot', 'orden', 'nroot'), desc: ix('descripcionot', 'descripcion'),
    hsEst: ix('hsestimadas', 'horasestimadas'), pers: ix('personasnecesarias'), asig: ix('asignadoa', 'asignado'),
    fProg: ix('fechainicioprogramada', 'fechaprogramada'), emp: ix('empleados'), hsReal: ix('hsreales', 'horasreales'),
    fCierre: ix('fechacierre'), com: ix('comentariocierre', 'comentario'), est: ix('estado'),
    eqCod: ix('equipo', 'sistema')   // codigo del equipo en el EAM = Sistema del arbol de equipos
  };
  if (C.id === -1 || C.est === -1) throw new Error('El CSV del EAM no tiene las columnas ID_Tarjeta y Estado.');
  var g = function (r, k) { return C[k] === -1 ? '' : String(r[C[k]] == null ? '' : r[C[k]]).trim(); };

  var sh = getSheet_(), n = sh.getLastRow() - 1;
  var datos = n > 0 ? sh.getRange(2, 1, n, HEADERS.length).getValues() : [];
  var porId = {};
  datos.forEach(function (r, i) { porId[String(r[0]).trim().toUpperCase()] = i; });
  var col = function (nombre) { return HEADERS.indexOf(nombre); };
  var res = { ok: true, fecha: ahora_(), origen: origen, leidas: filas.length - 1, cruzadas: 0, cerradas: 0, actualizadas: 0, sinTarjeta: [], errores: [] };
  var quien = 'EAM';

  // una tarjeta puede tener varias OT: se combinan en una sola fila antes de aplicar
  eamCombinar_(filas.slice(1), C, g).forEach(function (r) {
    var id = g(r, 'id').toUpperCase();
    if (!id) return;
    var i = porId[id];
    if (i === undefined) { res.sinTarjeta.push(id); return; }
    res.cruzadas++;
    try {
      var fila = datos[i], v = {}, antes = {};
      var val = function (c) { return fmt_(fila[col(c)], c); };
      var poner = function (c, x) {
        if (x === '' || x == null) return;
        if (String(val(c) == null ? '' : val(c)) === String(x)) return;
        antes[c] = val(c); v[c] = x;
      };
      var ot = g(r, 'ot'), estEAM = g(r, 'est'), estN = estEAM.toLowerCase(), estado = String(val('Estado') || '');
      var abierta = ESTADOS_ABIERTOS.indexOf(estado) > -1 || estado === '';
      poner('N OT', ot);
      poner('Estado EAM', estEAM || '(sin estado)');
      if (!val('Sistema') && g(r, 'eqCod') && !/;/.test(g(r, 'eqCod'))) poner('Sistema', g(r, 'eqCod'));

      if (EAM_ESTADOS_CERRADOS.indexOf(estN) > -1) {
        if (estado === 'Verificada' && /^EAM/.test(String(val('Verificado por')))) {
          // cerrada por el EAM: el EAM sigue mandando en quien la hizo y en las horas (corrige cierres viejos)
          var conocidas = eamPersonasConocidas_(), empV = eamPersonas_(g(r, 'emp'));
          var noConocida = function (txt) { return String(txt || '').split(';').map(function (x) { return x.trim(); }).filter(String).some(function (x) { return conocidas.indexOf(x) === -1; }); };
          if (empV.length && conocidas.length && noConocida(val('Ejecutores')) && !noConocida(empV.join('; '))) {
            if (String(val('Cerrado por')) === String(val('Ejecutores'))) poner('Cerrado por', empV.join('; '));
            poner('Ejecutores', empV.join('; '));
          }
          var hsT = eamNum_(g(r, 'hsReal'));
          if (r._hsOT && hsT > 0 && r._hsOT.indexOf(+val('Horas reales')) > -1 && +val('Horas reales') !== hsT) {
            poner('Horas reales', hsT);
            if (empV.length > (+val('Personas reales') || 0)) poner('Personas reales', empV.length);
          }
        } else if (estado === 'Verificada' || estado === 'Anulada') { /* ya cerrada: solo el N OT */ }
        else {
          var emp = eamPersonas_(g(r, 'emp')), hs = eamNum_(g(r, 'hsReal'));
          var por = emp.length ? emp.join('; ') : eamNombre_(g(r, 'asig')) || 'EAM';
          if (abierta) {
            var accion = g(r, 'com') || ('OT ' + ot + ' terminada en el EAM' + (g(r, 'desc') ? ': ' + g(r, 'desc') : ''));
            poner('Accion de cierre', accion);
            poner('Fecha cierre', eamFecha_(g(r, 'fCierre')) || ahora_());
            poner('Cerrado por', por);
            if (emp.length) poner('Ejecutores', emp.join('; '));
            if (hs > 0) poner('Horas reales', hs);
            poner('Personas reales', emp.length || (hs > 0 ? 1 : ''));
            poner('Causa', CAUSA_EAM_PENDIENTE);
          } else {
            // resuelta a mano y pendiente de verificar: se completan solo los datos que falten
            if (!val('Horas reales') && hs > 0) poner('Horas reales', hs);
            if (!val('Personas reales') && emp.length) poner('Personas reales', emp.length);
            if (!val('Ejecutores') && emp.length) poner('Ejecutores', emp.join('; '));
          }
          poner('Estado', 'Verificada');
          poner('Verificado por', 'EAM · OT ' + ot);
          poner('Fecha verificacion', ahora_());
          var nota = '[EAM] OT ' + ot + ' terminada' + (g(r, 'fCierre') ? ' el ' + (eamFecha_(g(r, 'fCierre')) || g(r, 'fCierre')) : '') + ' → tarjeta verificada automaticamente.';
          poner('Notas', (val('Notas') ? val('Notas') + '\n' : '') + nota);
          res.cerradas++;
        }
      } else if (EAM_ESTADOS_ANULADOS.indexOf(estN) > -1) {
        // Mantenimiento descarto la OT: la tarjeta queda anulada (rechazada por Mantenimiento) y deja de exportarse
        if (abierta) {
          poner('Estado', 'Anulada');
          poner('Notas', (val('Notas') ? val('Notas') + '\n' : '') + '[EAM] OT ' + ot + ' ' + estEAM + ' por Mantenimiento → tarjeta anulada.' + (g(r, 'com') ? ' ' + g(r, 'com') : ''));
          res.anuladas = (res.anuladas || 0) + 1;
        }
      } else if (abierta) {
        // OT viva en el EAM: el EAM manda en la programacion
        poner('Responsable asignado', eamNombre_(g(r, 'asig')));
        var hsE = eamNum_(g(r, 'hsEst')), pe = parseInt(eamNum_(g(r, 'pers')), 10);
        if (hsE > 0) poner('Horas estimadas', hsE);
        if (pe > 0) poner('Personas necesarias', pe);
        if (EAM_ESTADOS_SIN_PROGRAMA.indexOf(estN) === -1) {
          var fp = eamFecha_(g(r, 'fProg'), true);
          poner('Fecha planificada', fp);
          if (!val('Fecha compromiso')) poner('Fecha compromiso', fp);
          if (estado === 'Abierta' || estado === '') poner('Estado', 'En proceso');
        }
      }

      var cols = Object.keys(v);
      if (!cols.length) return;
      v['Actualizado EAM'] = ahora_();
      cols.forEach(function (c) { fila[col(c)] = v[c]; });
      fila[col('Actualizado EAM')] = v['Actualizado EAM'];
      sh.getRange(i + 2, 1, 1, HEADERS.length).setValues([fila]);
      var accLog = v['Estado'] === 'Verificada' ? 'Cierre EAM' : 'EAM';
      cols.forEach(function (c) { if (c !== 'Notas') log_(id, accLog, c, antes[c], v[c], quien + (ot ? ' · OT ' + ot : '')); });
      if (v['Estado'] !== 'Verificada') res.actualizadas++;
      else if (abierta) {
        var t = {}; HEADERS.forEach(function (hh, k) { t[hh] = fmt_(fila[k], hh); });
        try { avisarDetector_(t, t['Accion de cierre'], t['Cerrado por'], '', true); } catch (e) {}
      }
    } catch (err) {
      res.errores.push(id + ': ' + (err.message || err));
    }
  });
  res.sinTarjeta = res.sinTarjeta.slice(0, 30);
  // rechazos del EAM (tarjetas_rechazadas.csv) y despues la exportacion Tarjetas -> EAM
  try { res.rechazos = leerRechazosEAM_(sh, datos); } catch (e) { res.errores.push('Rechazos: ' + (e.message || e)); }
  if (res.cerradas || res.actualizadas || res.anuladas || res.rechazos) invalidarCacheListar_();
  res.exportacion = exportarEAMSeguro_();
  if (res.exportacion.error) res.errores.push('Exportacion: ' + res.exportacion.error);
  PropertiesService.getScriptProperties().setProperty('EAM_ULTIMA', JSON.stringify(res));
  return res;
}

// Completar la causa de una tarjeta cerrada desde el EAM (el EAM no la exporta).
function completarCausa_(req, usuario) {
  var quien = String(usuario || '').trim();
  if (!quien) throw new Error('Identificate para completar la causa.');
  var causa = String(req.causa || '').trim();
  if (!causa) throw new Error('Indica la causa.');
  var t = leer_(req.id);
  if (ESTADOS_RESUELTOS.indexOf(t['Estado']) === -1) throw new Error('La tarjeta todavia no esta resuelta.');
  var v = { 'Causa': causa };
  if (req.agregarMP) v['Agregar a MP'] = 'Si';
  if (req.actualizarEstandar) v['Actualizar estandar'] = 'Si';
  escribir_(req.id, v);
  Object.keys(v).forEach(function (c) { log_(req.id, 'Correccion', c, t[c], v[c], quien); });
  return { ok: true, id: req.id };
}


/* ============================ BACKUP DIARIO ============================ */

// Para el disparador semanal (domingos). Mantiene el nombre por compatibilidad con disparadores ya creados.
function backupSemanal() { return backupDiario(); }
function backupDiario() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (e) { return { ok: false, error: 'ocupado' }; }
  try { return backup_('automatico'); }
  finally { flushLog_(); try { lock.releaseLock(); } catch (e2) {} }
}

// Correr UNA VEZ desde el editor: deja programados el backup semanal (domingos) y la lectura del EAM, y hace un primer backup.
function instalarDisparadores() {
  var quedan = { backupDiario: true, backupSemanal: true, sincronizarEAM: true };
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (quedan[tr.getHandlerFunction()]) ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('backupSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(BACKUP_HORA).inTimezone(TZ).create();
  ScriptApp.newTrigger('sincronizarEAM').timeBased().everyMinutes(EAM_MINUTOS).create();
  return { backup: backupDiario(), eam: sincronizarEAM() };
}

function carpetaBackup_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.getFoldersByName(BACKUP_CARPETA);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_CARPETA);
  props.setProperty('BACKUP_FOLDER_ID', f.getId());
  return f;
}

// Copia todas las hojas (valores y formato, sin el script) a una planilla nueva en la carpeta de backups.
function backup_(origen) {
  var props = PropertiesService.getScriptProperties();
  try {
    var ss = ss_(), hoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    var carpeta = carpetaBackup_();
    var nombre = 'Tarjetas TPM · backup ' + hoy + (origen === 'automatico' ? '' : ' ' + Utilities.formatDate(new Date(), TZ, 'HH-mm'));
    var dest = SpreadsheetApp.create(nombre);
    // la planilla nueva trae una hoja vacia ("Hoja 1"/"Sheet1"): se renombra antes de copiar para que no choque
    // con una hoja del mismo nombre en la original, y se borra al final
    var vacias = dest.getSheets().slice();
    vacias.forEach(function (h, k) { h.setName('__vacia_backup_' + k); });
    var hojas = ss.getSheets(), filas = 0;
    hojas.forEach(function (sh) {
      var c = sh.copyTo(dest);
      c.setName(sh.getName());
      filas += Math.max(0, sh.getLastRow() - 1);
    });
    vacias.forEach(function (h) { try { dest.deleteSheet(h); } catch (e) {} });
    var file = DriveApp.getFileById(dest.getId());
    file.moveTo(carpeta);
    var borrados = limpiarBackups_(carpeta);
    var r = { ok: true, fecha: ahora_(), origen: origen, nombre: nombre, url: dest.getUrl(), hojas: hojas.length, filas: filas, borrados: borrados,
              guardados: contarBackups_(carpeta), carpeta: carpeta.getUrl ? carpeta.getUrl() : '' };
    props.setProperty('BACKUP_ULTIMO', JSON.stringify(r));
    return r;
  } catch (err) {
    var e = { ok: false, fecha: ahora_(), origen: origen, error: String(err && err.message ? err.message : err) };
    props.setProperty('BACKUP_ULTIMO', JSON.stringify(e));
    return e;
  }
}

function backupsDe_(carpeta) {
  var out = [], it = carpeta.getFiles();
  while (it.hasNext()) {
    var f = it.next(), m = String(f.getName()).match(/^Tarjetas TPM · backup (\d{4}-\d{2}-\d{2})/);
    if (m) out.push({ f: f, dia: m[1] });
  }
  return out.sort(function (a, b) { return b.dia.localeCompare(a.dia); });
}
function contarBackups_(carpeta) { return backupsDe_(carpeta).length; }

// Conserva: los ultimos BACKUP_DIAS dias y, mas atras, la ultima copia de cada mes por BACKUP_MESES meses. El resto va a la papelera.
function limpiarBackups_(carpeta) {
  var hoy = new Date(), borrados = 0;
  var limDia = Utilities.formatDate(new Date(hoy.getTime() - BACKUP_DIAS * 86400000), TZ, 'yyyy-MM-dd');
  var limMes = Utilities.formatDate(new Date(hoy.getFullYear(), hoy.getMonth() - BACKUP_MESES, 1), TZ, 'yyyy-MM-dd');
  var mesesVistos = {};
  backupsDe_(carpeta).forEach(function (b) {
    if (b.dia > limDia) return;
    var mes = b.dia.slice(0, 7);
    if (b.dia >= limMes && !mesesVistos[mes]) { mesesVistos[mes] = true; return; }   // primer backup guardado de ese mes
    try { b.f.setTrashed(true); borrados++; } catch (e) {}
  });
  return borrados;
}


/* ============================ ARBOL ANTERIOR -> SISTEMA ============================
   "AREA|SUBAREA|EQUIPO" del arbol anterior -> [SISTEMA, Descripcion, AREA] (solo equivalencias seguras).
   Generado junto con arbol.js; el detalle esta en el Excel de revision. */
const MIGRACION_ARBOL = {
"SERVICIOS AUXILIARES|BOMBAS AGUA POZO|BOMBA POZO 1": [
"BOSU.BOPO1",
"Bomba Pozo 1",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|BOMBAS AGUA POZO|BOMBA POZO 2": [
"BOSU.BOPO2",
"Bomba Pozo 2",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|BOMBAS AGUA POZO|BOMBA POZO 3": [
"BOSU.BOPO3",
"Bomba Pozo 3",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|BOMBAS AGUA POZO|BOMBA POZO 4": [
"BOSU.BOPO4",
"Bomba Pozo 4",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|BOMBAS AGUA POZO|BOMBA POZO 5": [
"BOSU.BOPO5",
"Bomba Pozo 5",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|BOMBAS AGUA POZO|BOMBA POZO 6": [
"BOSU.BOPO6",
"Bomba Pozo 6",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO DE AGUA CALDERAS|": [
"CAKE.DESAE",
"Desaireador Agua Calderas",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO DE AGUA CALDERAS|BOMBA AGUA 505 DESCARBONATADORA CALDERAS": [
"TRAG.BO505",
"Bomba 505 Descarbonatadora Calderas",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO DE AGUA CALDERAS|BOMBA AGUA 506 DESCARBONATADORA CALDERAS": [
"TRAG.BO506",
"Bomba 506 Descarbonatadora Calderas",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO DE AGUA CALDERAS|BOMBA AGUA 507 ALIMENTACION TORRES CALDERAS": [
"TRAG.BO507",
"Bomba 507 Agua Alimentación a Torres",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO DE AGUA CALDERAS|BOMBA AGUA 508 ALIMENTACION TORRES CALDERAS": [
"TRAG.BO508",
"Bomba 508 Agua Alimentación a Torres",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO DE AGUA CALDERAS|BOMBA 509 DESAIREADOR CALDERAS": [
"VCDS.BOCD509",
"Bomba 509 Desaireador Calderas",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO DE AGUA CALDERAS|BOMBA 510 DESAIREADOR CALDERAS": [
"VCDS.BOCD510",
"Bomba 510 Desaireador Calderas",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|BOMBA BS01 LODOS SEDIMENTADOR TSE": [
"EFLS.BOREDPIA",
"Bomba BS01 Lodos Sedimentador - TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|BOMBA BS02 LODOS SEDIMENTADOR TSE": [
"EFLS.BOREDPIA2",
"Bomba BS02 Lodos Sedimentador - TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|PRENSA EMECAN TSE": [
"EFLS.PRENLO",
"Prensa Emecan TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|CINTA DE LODOS TSE LONGITUDINAL": [
"EFLS.CINTALO",
"Cinta Longitudinal Lodos TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|CINTA DE LODOS TSE TRANSVERSAL": [
"EFLS.CINTATR",
"Cinta Transversal Lodos TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|BOMBA PILETA LODOS TSE": [
"TSE.BPL",
"Bomba Pileta Lodos TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|AGITADOR TQ UREA TSE": [
"AGIT-EFLS.TQUREA",
"Agitador Tanque Urea TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|BOMBA TQ UREA TSE": [
"BOMB-EFLS.TQUREA",
"Bomba Tanque Urea TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|BOMBA TQ FLOCULANTE TSE": [
"EFLS.BFLOC",
"Bomba Tanque Floculante TSE Contipress",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|SOPLADOR PILETA REACTIVACION TSE": [
"EFLS.SOPAERO",
"Soplador Pileta Aireación TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|BOMBA REGADERA PRENSA EMECAN TSE": [
"BBAREGEMECAN",
"Bomba Regadera Prensa Emecan TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|DECANTADOR SECUNDARIO TSE": [
"EFLS.DECAN",
"Decantador TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|SOPLADOR PIL AIREACION TSE": [
"EFLS.SOPAERO",
"Soplador Pileta Aireación TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|SOPLADOR PIL CLORACION TSE": [
"EFLS.SOPCLO",
"Soplador Pileta Cloracion TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|TRATAMIENTO EFLUENTES SECUNDARIO|CONTIPRESS": [
"EFLS.CONT",
"Contipress TSE",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|CALDERA 4|BOMBA AGUA 501 ALIMENTACION CALDERA 4": [
"CAKE.BO501",
"Bomba 501 Alimentación Agua Caldera 1",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|CALDERA 4|BOMBA AGUA 502 ALIMENTACION CALDERA 4": [
"CAKE.BO502",
"Bomba 502 Alimentación Agua Caldera 1",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|CALDERA 4|BOMBA FUEL OIL 1 CALDERA 4": [
"CA-BOCITD1",
"Bomba 1 Fuel Oil a Tanque Diario",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|CALDERA 4|BOMBA FUEL OIL 2 CALDERA 4": [
"CA-BOCITD2",
"Bomba 2 Fuel Oil a Tanque Diario",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|SALA COMPRESORES|COMPRESOR SULLAIR CS01": [
"COM-SULLAIR.CS1",
"Compresor Sullair CS1",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|SALA COMPRESORES|COMPRESOR SULLAIR CS02": [
"COM-SULLAIR.CS1",
"Compresor Sullair CS1",
"SERVICIOS AUXILIARES"
],
"SERVICIOS AUXILIARES|SALA COMPRESORES|COMPRESOR KAESER": [
"COM-KAESER.CK1",
"Compresor Kaeser CK1",
"SERVICIOS AUXILIARES"
],
"PULPERS|PULPER D30|": [
"PULPER D30",
"Pulper D30",
"PULPERS"
],
"PULPERS|PULPER D30|PULPER D30": [
"PULPER D30",
"Pulper D30",
"PULPERS"
],
"PULPERS|PULPER D30|CINTA DE CARGA PULPER D30": [
"CINTA D30",
"Cinta Pulper D30 (CINTA D30)",
"PULPERS"
],
"PULPERS|PULPER D30|TROMMEL PULPER D30": [
"REG.TROMMEL D30",
"Regadera Trommel Pulper D30",
"PULPERS"
],
"PULPERS|PULPER D30|FIBERIZER PULPER D30": [
"FIBERIZER D30",
"Fiberizer Pulper D30",
"PULPERS"
],
"PULPERS|PULPER D30|DEPURADOR 210 PULPER D30": [
"PULPER D30",
"Pulper D30",
"PULPERS"
],
"PULPERS|PULPER D30|SAC A SAN PULPER D30": [
"SACASAN 2",
"Sac-A-San 2 - DP210 (Pulper D30)",
"PULPERS"
],
"PULPERS|PULPER D30|BOMBA PULPER D30": [
"BOMPULPER D30",
"Bomba Descarga Pulper D30",
"PULPERS"
],
"PULPERS|PULPER D30|BOMBA TQ 200 D30": [
"TAQI.BOACI201",
"Bomba Agua Dilucion 2 (A P210, Tq 200 D30)",
"PULPERS"
],
"PULPERS|PULPER D30|AGITADOR TQ 200 D30": [
"AGIT-TQ200 D30",
"Agitador Tanque 200 D30",
"TQ 200 CORTE"
],
"PULPERS|PULPER E20|": [
"PULPER E20",
"Pulper E20",
"PULPERS"
],
"PULPERS|PULPER E20|PULPER E20": [
"PULPER E20",
"Pulper E20",
"PULPERS"
],
"PULPERS|PULPER E20|CINTA DE CARGA PULPER E20": [
"CINTA E20",
"Cinta Pulper E20",
"PULPERS"
],
"PULPERS|PULPER E20|TROMMEL PULPER E20": [
"REG.TROMMEL E20",
"Regadera Trommel Pulper E20",
"PULPERS"
],
"PULPERS|PULPER E20|FIBERIZER PULPER E20": [
"FIBERIZER E20",
"Fiberizer Pulper E20",
"PULPERS"
],
"PULPERS|PULPER E20|BOMBA PULPER E20": [
"BOMBPULPER E20",
"Bomba Descarga Pulper E20",
"PULPERS"
],
"PULPERS|PULPER E21|": [
"PULPER E21",
"Pulper E21",
"PULPERS"
],
"PULPERS|PULPER E21|PULPER E21": [
"PULPER E21",
"Pulper E21",
"PULPERS"
],
"PULPERS|PULPER E21|CINTA DE CARGA PULPER E21": [
"CINTA E21",
"Cinta Pulper E21",
"PULPERS"
],
"PULPERS|PULPER E21|BOMBA PULPER E21": [
"BOMPULPER E21",
"Bomba Descarga Pulper E21",
"PULPERS"
],
"PULPERS|PULPER E22|": [
"PULPER E22",
"Pulper E22",
"PULPERS"
],
"PULPERS|PULPER E22|PULPER E22": [
"PULPER E22",
"Pulper E22",
"PULPERS"
],
"PULPERS|PULPER E22|CINTA DE CARGA PULPER E22": [
"CINTA E22",
"Cinta Pulper E22",
"PULPERS"
],
"PULPERS|PULPER E22|TROMMEL PULPER E22": [
"REG.TROMMEL E22",
"Regadera Trommel Pulper E22",
"PULPERS"
],
"PULPERS|PULPER E22|FIBERIZER PULPER E22": [
"FIBERIZER E22",
"Fiberizer Pulper E22",
"PULPERS"
],
"PULPERS|PULPER E22|BOMBA PULPER E22": [
"BOMPULPER E22",
"Bomba Descarga Pulper E22",
"PULPERS"
],
"PULPERS|ALMIDON PULPERS|": [
"AGIT-AP.TQA",
"Agitador Tanque Almacenamiento Almidon Pulpers",
"PULPERS"
],
"PULPERS|ALMIDON PULPERS|BOMBA TQ COCINADOR ALMIDON": [
"BOMB-AP.TQC",
"Bomba Descarga Tanque Cocinador Almidon Pulpers",
"PULPERS"
],
"PULPERS|ALMIDON PULPERS|BOMBA TQ ALMACENAMIENTO ALMIDON": [
"BOMB-AP.TQA",
"Bomba Descaga Tanque Almacenamiento Almidon Pulpers",
"PULPERS"
],
"PULPERS|ALMIDON PULPERS|AGITADOR TQ COCINADOR ALMIDON": [
"AGIT-AP.TQC",
"Agitador Tanque Cocinador Almidon Pulpers",
"PULPERS"
],
"PULPERS|ALMIDON PULPERS|AGITADOR TQ ALMACENAMIENTO ALMIDON": [
"AGIT-AP.TQA",
"Agitador Tanque Almacenamiento Almidon Pulpers",
"PULPERS"
],
"PLANTA DE PASTA|SECTOR REFINOS Y FIBERIZER|ZARANDA 102": [
"ZARC.102",
"Zaranda 102",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|SECTOR REFINOS Y FIBERIZER|DEPURADOR V12 CI": [
"MI.V12",
"Depurador V12 CI (DP2)",
"PILETAS LM"
],
"PLANTA DE PASTA|SECTOR REFINOS Y FIBERIZER|FRACCIONADOR 220": [
"FRACC220",
"Fraccionador 220",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC MAULE PLANTA ALTA|SEPARPLAST 231": [
"SEPARPLAST",
"Separplast 231",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC MAULE PLANTA ALTA|SEPARPLAST 232": [
"SEPARTPLAST",
"Separplast 232",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC MAULE PLANTA ALTA|ZARANDA SEPARPLAST": [
"ZARI.ZARSEPAR",
"Zaranda 230 (Separplast)",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC MAULE PLANTA ALTA|BOMBA REGADERA SEPARPLAST": [
"TECI.RESEBO",
"Bomba Regaderas Separplast",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC MAULE PLANTA ALTA|TORNILLO ELEVACION TEC MAULE": [
"TECI.RET251",
"Tornillo 251 Tec Maule",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC BLANES|": [
"DISPTECBLANES",
"Dispersor M108 Tec Blanes",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC BLANES|DISPERSOR TEC BLANES": [
"DISPTECBLANES",
"Dispersor M108 Tec Blanes",
"PLANTA DE PASTA"
],
"PLANTA DE PASTA|TEC BLANES|DEPURADOR DP3": [
"MI.JS",
"Depurador DP3 CI",
"PILETAS LM"
],
"PLANTA DE PASTA|TEC BLANES|FAN SEPARATOR": [
"FAN.SEPARATOR",
"Fan Separator 241 (Maule)",
"PLANTA DE PASTA"
],
"TEC MAULE PTA BAJA|TANQUE AGUA CIRCULANTE|": [
"BOMB-PIL H2O CIR CUP",
"Bomba Tanque de agua circulante cupertina",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE AGUA CIRCULANTE|BOMBA DILUCION 1 TAC": [
"TECI.BODIDI",
"Bomba Agua Dilucion 1",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE AGUA CIRCULANTE|BOMBA DILUCION 3 TAC": [
"TAQI.BOACIST5",
"Bomba Agua Dilucion 3 CI (A Tanque Recupero CI)",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE AGUA CIRCULANTE|BOMBA DILUCION 4 TAC": [
"PILI.2CDIBO",
"Bomba Agua Dilucion 4 (a Tanque Recupero CI)",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE AGUA CIRCULANTE|BOMBA DILUCION 6 TAC": [
"DEPI.3ºBO",
"Bomba Agua Dilucion N°6 (A Fracc 220 y DC240)",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 230|": [
"AGIT-TQ 230",
"Agitador Tanque 230",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 230|BOMBA TQ 230": [
"BOMB-TQ 230",
"Bomba tanque 230",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 230|AGITADOR TQ 230": [
"AGIT-TQ 230",
"Agitador Tanque 230",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 250|": [
"AGTINA 250",
"Agitador Tanque Tina 250",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 250|BOMBA TQ 250": [
"BOMTINA250",
"Bomba Tina 250",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 250|AGITADOR TQ 250": [
"AGTINA 250",
"Agitador Tanque Tina 250",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 250|BOMBA RECIRCULACION TQ 250": [
"BOMTINA250",
"Bomba Tina 250",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 260|": [
"AGIT-TQ 260",
"Agitador Tanque 260",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|TANQUE 260|BOMBA TQ 260": [
"BOMB-TQ 260",
"Bomba Tanque 260",
"TEC MAULE PTA BAJA"
],
"TEC MAULE PTA BAJA|BOMBA TQ 100 DORSO|": [
"BOMB-TQ 100 M3 DORSO",
"Bomba Tanque 100 m3 de dorso",
"TEC MAULE PTA BAJA"
],
"TAP|BOMBA ADT|": [
"BO.TDA-TAP",
"Bomba aporte ADT - TAP",
"TAP"
],
"TAP|BOMBA 1 TQ AGUA A CLARIFICAR - DELTAFLOAT|": [
"BO2.TQAAC-TAP",
"Bomba 2 Tanque Agua a Clarificar - Deltafloat",
"TAP"
],
"TAP|BOMBA 1 TQ AGUA CLARIFICADA - TQ243 Y TQ260|": [
"BO1.TQAC-TAP",
"Bomba 1 Tanque Agua Clarificada - TQ243 y TQ260",
"TAP"
],
"TAP|BOMBA 1 TQ AGUA FILTRADA - PULPO CI|": [
"BO1.TQAF-TAP",
"Bomba 1 Tanque Agua Filtrada - Pulpo CI",
"TAP"
],
"TAP|BOMBA 2 TQ AGUA A CLARIFICAR - TAC|": [
"BO2.TQAAC-TAP",
"Bomba 2 Tanque Agua a Clarificar - Deltafloat",
"TAP"
],
"TAP|BOMBA 2 TQ AGUA CLARIFICADA - SIGMAFILTER|": [
"BO2.TQAC-TAP",
"Bomba 2 Tanque Agua Clarificada - Sigmafilter",
"TAP"
],
"TAP|BOMBA 2 TQ AGUA FILTRADA - FIBERNET|": [
"BO2.TQAF-TAP",
"Bomba 2 Tanque Agua Filtrada - Fibernet",
"TAP"
],
"PILETAS LM|PILETA 210|": [
"AGIT-PIL210I",
"Agitador Pileta 210",
"PILETAS LM"
],
"PILETAS LM|PILETA 210|BOMBA PIL 210": [
"BOMB-PIL210I",
"Bomba Pileta 210",
"PILETAS LM"
],
"PILETAS LM|PILETA 210|AGITADOR PIL 210": [
"AGIT-PIL210I",
"Agitador Pileta 210",
"PILETAS LM"
],
"PILETAS LM|PILETA 401|": [
"AGIT-PIL401",
"Agitador Pileta 401",
"PILETAS LM"
],
"PILETAS LM|PILETA 401|BOMBA PIL 401": [
"BOMB-PIL401",
"Bomba Pileta 401",
"PILETAS LM"
],
"PILETAS LM|PILETA 401|AGITADOR PIL 401": [
"AGIT-PIL401",
"Agitador Pileta 401",
"PILETAS LM"
],
"PILETAS LM|PILETA 101|": [
"AGIT-PIL101C",
"Agitador Pileta 101",
"PILETAS LM"
],
"PILETAS LM|PILETA 101|BOMBA PIL 101": [
"BOMB-PIL101C",
"Bomba Pileta 101",
"PILETAS LM"
],
"PILETAS LM|PILETA 101|AGITADOR PIL 101": [
"AGIT-PIL101C",
"Agitador Pileta 101",
"PILETAS LM"
],
"PILETAS LM|PILETA B|": [
"BOMB-PIL-B",
"Bomba Pileta B",
"PILETAS LM"
],
"PILETAS LM|PILETA B|BOMBA PIL B": [
"BOMB-PIL-B",
"Bomba Pileta B",
"PILETAS LM"
],
"PILETAS LM|BOMBA FILTROS RONNINGEN|": [
"ALIM.BORONN",
"Bomba Filtros Agua Ronningen Peter",
"PILETAS LM"
],
"PILETAS LM|TANQUE ELEVACION|BOMBA 1 TQ ELEV": [
"BOMB-PIL-A",
"Bomba 1 Pileta A",
"PILETAS LM"
],
"PILETAS LM|TANQUE ELEVACION|BOMBA 2 TQ ELEV": [
"BOMB-PIL-A2",
"Bomba 2 Pileta A",
"PILETAS LM"
],
"PILETAS LM|TINA TEC BLANES|": [
"AGI TEC BLANES",
"Agitacion Tina Pasta Tec Blanes",
"PILETAS LM"
],
"PILETAS LM|TINA TEC BLANES|BOMBA TINA TEC BLANES": [
"TECC.BODIL",
"Bomba Dilucion Tina Tec Blanes",
"PILETAS LM"
],
"PILETAS LM|TINA TEC BLANES|AGITADOR TINA TEC BLANES": [
"AGI TEC BLANES",
"Agitacion Tina Pasta Tec Blanes",
"PILETAS LM"
],
"PILETAS LM|BOMBA DEPURACION 1º CI|": [
"MI.BODP",
"Bomba Depuración 1º CI (DC1)",
"PILETAS LM"
],
"PILETAS LM|BOMBA DEPURACION 2º CI|": [
"MI.BODS",
"Bomba Depuración 2º CI (DC2)",
"PILETAS LM"
],
"PILETAS LM|BOMBA DEPURACION 3º CI|": [
"MI.BODT",
"Bomba Depuración 3º CI (DC3)",
"PILETAS LM"
],
"PILETAS LM|BOMBA DP3|": [
"MI.BAJS",
"Bomba Depurador DP3 CI",
"PILETAS LM"
],
"PILETAS LM|BOMBA TQ REBALSE DEP CI|": [
"BOMB-TQ REB AGUA DEP",
"Bomba Tanque rebalse agua depuración CI",
"PILETAS LM"
],
"PILETAS LM|BOMBA PILETA AGUA CIRCULANTE|": [
"BOMB-TEC.TAC",
"Bomba Pileta Agua Circulante (TAC) Cupertina",
"PILETAS LM"
],
"PILETAS LM|BOMBA AUXILIAR CELLIER|": [
"CELL.BOAGTANQ",
"Bomba Auxiliar Cellier",
"PILETAS LM"
],
"PILETAS LM|DEPURADOR V12 CUP|": [
"MD.BAV12CUP",
"Bomba Depurador V12 Cup",
"PILETAS LM"
],
"PILETAS LM|DEPURADOR V22 CI|": [
"MI.V22",
"Depurador V22 CI (DP1)",
"PILETAS LM"
],
"PILETAS LM|BOMBA FAN CI|": [
"MI.BOFAN",
"Bomba Fan Mesa CI",
"PILETAS LM"
],
"PILETAS LM|BOMBA TANQUE 305|": [
"BO.TQ305",
"Bomba Tanque 305",
"PILETAS LM"
],
"PILETAS LM|BOMBA DEPURADOR DP2 CI|": [
"MI.BAV12",
"Bomba Depurador DP2 CI",
"PILETAS LM"
],
"PILETAS LC|PILETA 102|": [
"AGIT-PIL102C",
"Agitador Pileta 102",
"PILETAS LC"
],
"PILETAS LC|PILETA 102|AGITADOR PIL 102": [
"AGIT-PIL102C",
"Agitador Pileta 102",
"PILETAS LC"
],
"PILETAS LC|PILETA 270|": [
"AGIT-PIL270I",
"Agitador Pileta 270",
"PILETAS LC"
],
"PILETAS LC|PILETA 270|AGITADOR PIL 270": [
"AGIT-PIL270I",
"Agitador Pileta 270",
"PILETAS LC"
],
"PILETAS LC|PILETA 220|": [
"AGIT-PIL220I",
"Agitador Pileta 220",
"PILETAS LC"
],
"PILETAS LC|PILETA 220|BOMBA PIL 220": [
"BOMB-PIL220I",
"Bomba Pileta 220",
"PILETAS LC"
],
"PILETAS LC|PILETA 220|AGITADOR PIL 220": [
"AGIT-PIL220I",
"Agitador Pileta 220",
"PILETAS LC"
],
"PILETAS LC|PILETA 301|": [
"AGIT-PIL.301",
"Agitador Pileta 301",
"PILETAS LC"
],
"PILETAS LC|PILETA 301|BOMBA PIL 301": [
"BOMB-PIL.301",
"Bomba Pileta 301",
"PILETAS LC"
],
"PILETAS LC|PILETA 301|AGITADOR PIL 301": [
"AGIT-PIL.301",
"Agitador Pileta 301",
"PILETAS LC"
],
"PILETAS LC|PILETA 242|": [
"AGIT-PIL.242",
"Agitador Pileta 242",
"PILETAS LC"
],
"PILETAS LC|PILETA 242|BOMBA PIL 242": [
"BOMB-PIL.242",
"Bomba Pileta 242",
"PILETAS LC"
],
"PILETAS LC|PILETA 242|AGITADOR PIL 242": [
"AGIT-PIL.242",
"Agitador Pileta 242",
"PILETAS LC"
],
"PILETAS LC|PILETA 303|": [
"AGIT-PIL303D",
"Agitador Pileta 303",
"PILETAS LC"
],
"PILETAS LC|PILETA 303|BOMBA PIL 303": [
"BOMB-PIL303D",
"Bomba Pileta 303",
"PILETAS LC"
],
"PILETAS LC|PILETA 303|AGITADOR PIL 303": [
"AGIT-PIL303D",
"Agitador Pileta 303",
"PILETAS LC"
],
"PILETAS LC|PILETA 304|": [
"AGIT-PIL304D",
"Agitador Pileta 304",
"PILETAS LC"
],
"PILETAS LC|PILETA 304|BOMBA PIL 304": [
"BOMB-PIL304D",
"Bomba Pileta 304",
"PILETAS LC"
],
"PILETAS LC|PILETA 304|AGITADOR PIL 304": [
"AGIT-PIL304D",
"Agitador Pileta 304",
"PILETAS LC"
],
"PILETAS LC|PILETA 103|": [
"AGIT-PIL103C",
"Agitador Pileta 103",
"PILETAS LC"
],
"PILETAS LC|PILETA 103|BOMBA PIL 103": [
"BOMB-PIL103C",
"Bomba Pileta 103",
"PILETAS LC"
],
"PILETAS LC|PILETA 103|AGITADOR PIL 103": [
"AGIT-PIL103C",
"Agitador Pileta 103",
"PILETAS LC"
],
"PILETA AGUA CORTE|PILETA AGUA CORTE|": [
"BOMB-PIL AGUA CORTE",
"Bomba Pileta agua de corte",
"PILETA AGUA CORTE"
],
"PILETA AGUA CORTE|PILETA AGUA CORTE|BOMBA AGUA REFILE POZO COUCH - VARIDUR": [
"BOMREFPC",
"Bomba Refile Pozo Couch",
"MESAS"
],
"PILETA AGUA CORTE|PILETA AGUA CORTE|BOMBA DILUCION PBM": [
"CICO.BOCOPBM",
"Bomba Agua de Corte PBM",
"PILETA AGUA CORTE"
],
"PILETA AGUA CORTE|PILETA AGUA CORTE|BOMBA MEZCLA PIL AGUA CORTE": [
"PILAC.BOM",
"Bomba Mezcla Pileta Agua de Corte",
"PILETA AGUA CORTE"
],
"PILETA AGUA CORTE|PILETA AGUA CORTE|BOMBA AGUA CORTE POZO COUCH": [
"CICO.BOAG",
"Bomba Agua de Corte Pozo Couch",
"PILETA AGUA CORTE"
],
"TQ 200 CORTE|TANQUE 200 CORTE|": [
"AGIT-T200C",
"Agitador Tanque 200 Corte",
"TQ 200 CORTE"
],
"TQ 200 CORTE|TANQUE 200 CORTE|BOMBA 1° NIVEL": [
"BOMB-T200C",
"Bomba Tanque 200 Corte 1° Nivel",
"TQ 200 CORTE"
],
"TQ 200 CORTE|TANQUE 200 CORTE|BOMBA 2° NIVEL": [
"BOMB-T200C2°N",
"Bomba Tanque 200 Corte 2° Nivel",
"TQ 200 CORTE"
],
"HIDROPOLIS|PLANTA ALTA|DENSIDISC 1": [
"DENSI1",
"Densidisc 1 Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|PLANTA ALTA|DENSIDISC 2": [
"DENSI2",
"Densidisc 2 Planta Pasta",
"HIDROPOLIS"
],
"HIDROPOLIS|PLANTA ALTA|ZARANDA 204": [
"EFLU.ZAR204N1",
"Zaranda 204 Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|PLANTA ALTA|ZARANDA 205": [
"EFLU.ZAR205N2",
"Zaranda 205 Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|PLANTA ALTA|ZARANDA 206": [
"EFLU.ZAR206N3",
"Zaranda 206 Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|PILETA ACUMULADORA|": [
"AGIT-PIL ACUM",
"Agitador Pileta acumuladora",
"HIDROPOLIS"
],
"HIDROPOLIS|PILETA ACUMULADORA|BOMBA PIL PASTA RECUPERADA": [
"BOMB-HID.PR",
"Bomba Pileta Pasta Recuperada Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|PILETA ACUMULADORA|BOMBA TDA": [
"BO.ADT",
"Bomba TDA Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|CANAL EFLUENTES|BOMBA EFLUENTES TITULAR": [
"EFLU.BOAUX3",
"Bomba 3 Efluentes Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|CANAL EFLUENTES|BOMBA EFLUENTES 3": [
"EFLU.BOAUX3",
"Bomba 3 Efluentes Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|CANAL EFLUENTES|BOMBA SEDIFLOAT 1": [
"EFLU.BOSDF1",
"Bomba 1 Sedifloat Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|CANAL EFLUENTES|BOMBA SEDIFLOAT 2": [
"EFLU.BOSDF2",
"Bomba 2 Sedifloat Hidropolis",
"HIDROPOLIS"
],
"HIDROPOLIS|TANQUE 450 EFLUENTES|": [
"AGIT-TQ 450 EFLUENTES",
"Agitador Tanque 450 de efluentes",
"HIDROPOLIS"
],
"HIDROPOLIS|TANQUE 450 EFLUENTES|BOMBA TIT TQ 450 EFLUENTES": [
"BOMB-TQ 450 EFLUENTES",
"Bomba 1 Tanque 450 de efluentes",
"HIDROPOLIS"
],
"HIDROPOLIS|TANQUE 450 EFLUENTES|BOMBA AUX TQ 450 EFLUENTES": [
"BOMB-TQ 450 EFLUENTES",
"Bomba 1 Tanque 450 de efluentes",
"HIDROPOLIS"
],
"HIDROPOLIS|TANQUE 450 EFLUENTES|AGITADOR TQ 450 EFLUENTES": [
"AGIT-TQ 450 EFLUENTES",
"Agitador Tanque 450 de efluentes",
"HIDROPOLIS"
],
"HIDROPOLIS|TANQUE 450 PASTA|": [
"AGIT-TQ 450 PASTA",
"Agitador Tanque 450 de pasta",
"HIDROPOLIS"
],
"HIDROPOLIS|TANQUE 450 PASTA|BOMBA TQ 450 PASTA": [
"BOMB-TQ 450 PASTA",
"Bomba Tanque 450 de pasta",
"HIDROPOLIS"
],
"HIDROPOLIS|TANQUE 450 PASTA|AGITADOR TQ 450 PASTA": [
"AGIT-TQ 450 PASTA",
"Agitador Tanque 450 de pasta",
"HIDROPOLIS"
],
"MESAS|SOTANO|BOMBA ALMIDON SPRAY 1": [
"QUI.BOALM1SP",
"Bomba 1 Almidón Spray",
"MESAS"
],
"MESAS|SOTANO|BOMBA ALMIDON SPRAY 2": [
"QUI.BOALM2SP",
"Bomba 2 Almidón Spray",
"MESAS"
],
"MESAS|SOTANO|BOMBA SEAL PIT CUP": [
"TAQC.BOSPITSE",
"Bomba Seal Pit Cupertina",
"MESAS"
],
"MESAS|SOTANO|BOMBA PILETA 102": [
"BOMB-PIL102C",
"Bomba Pileta 102",
"MESAS"
],
"MESAS|SOTANO|BOMBA PILETA 270": [
"BOMB-PIL270I",
"Bomba Pileta 270",
"MESAS"
],
"MESAS|SOTANO|BOMBA V12 CUP": [
"MD.BAV12CUP",
"Bomba Depurador V12 Cup",
"PILETAS LM"
],
"MESAS|SOTANO|BOMBA FAN DORSO": [
"MD.BOFAN",
"Bomba Fan Mesa Dorso",
"MESAS"
],
"MESAS|SOTANO|BOMBA FAN CUP": [
"DILC.BOTINDI",
"Bomba B111 Dilucion Cup",
"MESAS"
],
"MESAS|SOTANO|DEPURADOR V22 CUP": [
"MD.V22",
"Depurador V22 Dorso",
"MESAS"
],
"MESAS|SOTANO|BOMBA RECIRC DORSO": [
"MD.BOFAN",
"Bomba Fan Mesa Dorso",
"MESAS"
],
"MESAS|SOTANO|BOMBA RECUP DORSO": [
"MD.BOFAN",
"Bomba Fan Mesa Dorso",
"MESAS"
],
"MESAS|SOTANO|BOMBA CORTE POZO COUCH": [
"BOMCORTPC",
"Bomba Corte Pozo Couch",
"MESAS"
],
"MESAS|SOTANO|DEPURADOR V22 DORSO": [
"MD.V22",
"Depurador V22 Dorso",
"MESAS"
],
"MESAS|SOTANO|BOMBA REFILE POZO COUCH": [
"BOMREFPC",
"Bomba Refile Pozo Couch",
"MESAS"
],
"MESAS|SOTANO|AGITADOR POZO COUCH": [
"AGITPCOUCH",
"Agitador Pozo Couch",
"MESAS"
],
"MESAS|CUPERTINA|": [
"TRAQUEOCUP",
"RolloTraqueo Cupertina",
"MESAS"
],
"MESAS|CUPERTINA|CAJA FORM MESA CUP": [
"CAF-CUP",
"Caja Formación Cup",
"MESAS"
],
"MESAS|DORSO|": [
"TRAQUEODOR",
"RolloTraqueo Dorso",
"MESAS"
],
"MESAS|DORSO|CAJA FORM MESA DORSO": [
"CAF-DOR",
"Caja Formación Dorso",
"MESAS"
],
"MESAS|DORSO|CAJAS VACIO MESA DORSO": [
"MANDOS MESA DORSO",
"Mandos Mesa Dorso",
"MESAS"
],
"MESAS|DORSO|ROLLOS MESA DORSO": [
"MANDOS MESA DORSO",
"Mandos Mesa Dorso",
"MESAS"
],
"MESAS|DORSO|GUIA TELA MESA DORSO": [
"MANDOS MESA DORSO",
"Mandos Mesa Dorso",
"MESAS"
],
"MESAS|DORSO|TELA MESA DORSO": [
"MANDOS MESA DORSO",
"Mandos Mesa Dorso",
"MESAS"
],
"MESAS|DORSO|CUCHILLAS MESA DORSO": [
"MANDOS MESA DORSO",
"Mandos Mesa Dorso",
"MESAS"
],
"MESAS|DORSO|REGADERAS MESA DORSO": [
"MANDOS MESA DORSO",
"Mandos Mesa Dorso",
"MESAS"
],
"MESAS|CAPA INTERMEDIA|": [
"MANDOS MESA CAPA INTERMEDIA",
"Mandos Mesa Capa Intermedia",
"MESAS"
],
"MESAS|CAPA INTERMEDIA|CAJA FORM MESA CI": [
"CAF-CI",
"Caja Formación CI",
"MESAS"
],
"MESAS|TOP FORMER|": [
"TF.VENVACMFCS",
"Ventilador MFVB1 Top Former",
"MESAS"
],
"MESAS|TOP FORMER|ROLLOS TOP FORMER": [
"TF.VENVACMFCS",
"Ventilador MFVB1 Top Former",
"MESAS"
],
"MESAS|TOP FORMER|GUIA TELA TOP FORMER": [
"MC.M9MAN",
"Mando M9 Rollo Mando Tela Top Former",
"MESAS"
],
"MESAS|TOP FORMER|TELA TOP FORMER": [
"MC.M9MAN",
"Mando M9 Rollo Mando Tela Top Former",
"MESAS"
],
"MESAS|TOP FORMER|CUCHILLAS TOP FORMER": [
"TF.VENVACMFCS",
"Ventilador MFVB1 Top Former",
"MESAS"
],
"MESAS|TOP FORMER|REGADERAS TOP FORMER": [
"TF.VENVACMFCS",
"Ventilador MFVB1 Top Former",
"MESAS"
],
"MESAS|MANDOS MESAS|": [
"MAN-VEREFAUX",
"Ventilador Auxiliar Mandos Mesas",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M7 ROLLO TRANSF CI": [
"MC.M7MAN",
"Mando M7 Rollo Transferencia CI",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M4 RMT DORSO": [
"MC.M4MAN",
"Mando M4 Rollo Mando Tela Dorso",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M8 ROLLO AUX. CI": [
"MC.M8MAN",
"Mando M8 Rollo Aux CI",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M5 ROLLO TRANSF DORSO": [
"MC.M5MAN",
"Mando M5 Rollo Transferencia Dorso",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M1 RMT CUP": [
"MC.M1MAN",
"Mando M1 Rollo Mando Tela Cup",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M2 ROLLO ASPIRANTE CUP": [
"MC.M1MAN",
"Mando M1 Rollo Mando Tela Cup",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M9 TOP FORMER": [
"MC.M9MAN",
"Mando M9 Rollo Mando Tela Top Former",
"MESAS"
],
"MESAS|MANDOS MESAS|MANDO M6 RMT CI": [
"MC.M6MAN",
"Mando M6 Rollo Mando Tela CI",
"MESAS"
],
"MESAS|LOSA COMPRESORES MESAS|COMPRESOR CAJA MESA CI": [
"MI.CECO",
"Compresor Caja Formación CI",
"MESAS"
],
"MESAS|LOSA COMPRESORES MESAS|VENTILADORES TOP FORMER": [
"TF.VENVACMFCS",
"Ventilador MFVB1 Top Former",
"MESAS"
],
"MESAS|LOSA COMPRESORES MESAS|COMPRESOR CAJA MESA CUP": [
"CAF-CUP",
"Caja Formación Cup",
"MESAS"
],
"MESAS|LOSA COMPRESORES MESAS|COMPRESOR CAJA MESA DORSO": [
"MD.CECO",
"Compresor Caja Formación Dorso",
"MESAS"
],
"PRENSAS|PRIMER PRENSA|ROLLOS 1º PRENSA": [
"PR.LAMBO",
"Bomba 1 Laminado (Prensa)",
"PRENSAS"
],
"PRENSAS|PRIMER PRENSA|FIELTRO 1º PRENSA": [
"PR.LAMBO",
"Bomba 1 Laminado (Prensa)",
"PRENSAS"
],
"PRENSAS|PRIMER PRENSA|REGADERAS 1º PRENSA": [
"PR.LAMBO",
"Bomba 1 Laminado (Prensa)",
"PRENSAS"
],
"PRENSAS|PRIMER PRENSA|CUCHILLAS 1º PRENSA": [
"PR.LAMBO",
"Bomba 1 Laminado (Prensa)",
"PRENSAS"
],
"PRENSAS|SEGUNDA PRENSA|ROLLOS 2º PRENSA": [
"2P.M11MAN",
"Mando M11 2° Prensa",
"PRENSAS"
],
"PRENSAS|SEGUNDA PRENSA|FIELTRO 2º PRENSA": [
"2P.M11MAN",
"Mando M11 2° Prensa",
"PRENSAS"
],
"PRENSAS|SEGUNDA PRENSA|REGADERAS 2º PRENSA": [
"2P.M11MAN",
"Mando M11 2° Prensa",
"PRENSAS"
],
"PRENSAS|SEGUNDA PRENSA|CUCHILLAS 2º PRENSA": [
"2P.M11MAN",
"Mando M11 2° Prensa",
"PRENSAS"
],
"PRENSAS|TEM SEC|CENTRAL HIDRAULICA TEM SEC": [
"BO1TEMSEC",
"Bomba 1 central hidraúlica Tem Sec",
"PRENSAS"
],
"PRENSAS|MANDOS PRENSAS|MANDO M10 1º PRENSA": [
"1P.M10MAN",
"Mando M10 1° Prensa",
"PRENSAS"
],
"PRENSAS|MANDOS PRENSAS|MANDO M11 2º PRENSA": [
"2P.M11MAN",
"Mando M11 2° Prensa",
"PRENSAS"
],
"PRENSAS|MANDOS PRENSAS|MANDO M12B TEMSEC 1º NIP": [
"TSNIP1.M12B",
"Mando M12B Tem Sec 1º Nip",
"PRENSAS"
],
"PRENSAS|MANDOS PRENSAS|MANDO M12A TEMSEC CIL BASE": [
"TEMS.M12CIBA",
"Mando M12A Cilindro Base Tem Sec",
"PRENSAS"
],
"PRENSAS|MANDOS PRENSAS|MANDO M12C TEMSEC 2º NIP": [
"TSNIP2.M12C",
"Mando M12C Tem Sec 2º Nip",
"PRENSAS"
],
"SECADORES|PRIMER BATERIA (1 AL 12)|TELA 1º BATERIA SUP": [
"MAN.M1S1",
"Mando M1S1 Rollo Tela Sup., Pos. 10-02B, 1º Bateria",
"SECADORES"
],
"SECADORES|PRIMER BATERIA (1 AL 12)|TELA 1º BATERIA INF": [
"MAN.M1I1",
"Mando M1I1 Rollo Tela Inf., Pos. 10-02, 1º Batería",
"SECADORES"
],
"SECADORES|SEGUNDA BATERIA (13 AL 24)|TELA 2º BATERIA SUP": [
"MAN.M2S1",
"Mando M2S1 Rollo Tela Sup., Pos. 20-05, 2º Bateria",
"SECADORES"
],
"SECADORES|SEGUNDA BATERIA (13 AL 24)|TELA 2º BATERIA INF": [
"MAN.M2I1",
"Mando M2I1 Rollo Tela Inf., Pos. 20-02, 2º Bateria",
"SECADORES"
],
"SECADORES|TERCER BATERIA (25 AL 35)|TELA 3º BATERIA SUP": [
"MAN.M3S1",
"Mando M3S1 Rollo Tela Sup., Pos. 30-03, 3º Bateria",
"SECADORES"
],
"SECADORES|TERCER BATERIA (25 AL 35)|TELA 3º BATERIA INF": [
"MAN.M3I1",
"Mando M3I1 Rollo Tela Inf., Pos. 30-02, 3º Bateria",
"SECADORES"
],
"SECADORES|MONOLUCIDO|MANDO MONOLUCIDO": [
"MONO.MAUX",
"Mando Auxiliar Monolucido",
"SECADORES"
],
"SECADORES|CUARTA BATERIA (36 AL 43)|TELA 4º BATERIA SUP": [
"INT.AC4Y5",
"Intercambiador Aire Caliente Sup 4º / 5º Bateria",
"SECADORES"
],
"SECADORES|QUINTA BATERIA (44 AL 53)|TELA 5º BATERIA SUP": [
"INT.AC4Y5",
"Intercambiador Aire Caliente Sup 4º / 5º Bateria",
"SECADORES"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|": [
"SUMID BBAS VACIO",
"Sumidero de Bombas de Vacio",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 01": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 02": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 03": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 04": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 05": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 06": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 07": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 08": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 09": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 10": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 11": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 12": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA VACIO 13": [
"VCIO.BO01",
"Bomba Vacio BV01",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA SELLO VACIO": [
"VCIO.BOAS",
"Bomba Agua Sello Bombas Vacio",
"BOMBAS DE VACIO"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA ELUTRIACION": [
"AGRE.BOELU",
"Bomba Agua Elutriación",
"PILETAS LM"
],
"BOMBAS DE VACIO|BOMBAS DE VACIO|BOMBA SUMIDERO": [
"VCIO.BOSUMI",
"Bomba Sumidero Bombas Vacio",
"BOMBAS DE VACIO"
],
"PLANTA CONDENSADO|BOMBA BC3 TQ VACIO|": [
"BC3TQVACIO",
"Bomba Tanque de Vacio Titular BC3",
"PLANTA CONDENSADO"
],
"PLANTA CONDENSADO|BOMBA BC5 TQ PULMON|": [
"BOMBC5TQPULMON",
"Bomba Tanque Pulmon Titular BC5",
"PLANTA CONDENSADO"
],
"PLANTA CONDENSADO|BOMBA BC6 TQ PULMON|": [
"BOMBC6TQPULMON",
"Bomba Tanque pulmon Auxiliar BC6",
"PLANTA CONDENSADO"
],
"VENTILADORES Y EXTRACTORES|LOSA TALLER MECANICO|VENT EXTRACTOR MONOLUCIDO": [
"MONO.VEEX",
"Ventilador Extractor Capota Monolucido",
"VENTILADORES Y EXTRACTORES"
],
"VENTILADORES Y EXTRACTORES|LOSA TALLER MECANICO|VENT AIRE CAL INF PRESECADO": [
"INT.ACINFPRE",
"Intercambiador Aire Caliente Inf Presecado",
"VENTILADORES Y EXTRACTORES"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 1|": [
"CICO.CINTABM1",
"Cinta BM 1",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 2|": [
"CICO.CINTABM2",
"Cinta BM 2",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 3|": [
"CICO.CINTABM3",
"Cinta BM 3",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 4|": [
"CICO.CINTABM4",
"Cinta BM 4",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 5|": [
"CICO.CINTABM5",
"Cinta BM 5",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 6|": [
"CICO.CINTABM6",
"Cinta BM 6",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 7|": [
"CICO.CINTABM7",
"Cinta BM 7",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 8|": [
"CICO.CINTABM8",
"Cinta BM 8",
"CINTAS BAJO MAQ"
],
"CINTAS BAJO MAQ|CINTA BAJO MAQ 9|": [
"CICO.CINTABM9",
"Cinta BM 9",
"CINTAS BAJO MAQ"
],
"PULPER BAJO MAQUINA|PULPER BAJO MAQUINA|": [
"BOMBEO PBM",
"Bomba Pulper Bajo Maquina",
"PULPER BAJO MAQUINA"
],
"ESTUCADO|UNI BAR|": [
"CONTRARODILLOUB",
"Contrarrodillo Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|ESTUCADORA UNI BAR": [
"CONTRARODILLOUB",
"Contrarrodillo Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|SOLARONIC UNI BAR": [
"CONTRARODILLOUB",
"Contrarrodillo Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|VENT AIRE COMB MAXON 2 UNI BAR": [
"MAXO.IIVECO",
"Ventilador Aire Combustión Maxon 2 Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|VENT AIRE RECIRC MAXON 2 UNI BAR": [
"MAXO.IIVECO",
"Ventilador Aire Combustión Maxon 2 Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|VENT AIRE COMB SOLARONIC UNI BAR": [
"SOL4.VERE",
"Ventilador Aire Recirculación Solaronic Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|VENT RECIRC SOLARONIC UNI BAR": [
"SOL4.VERE",
"Ventilador Aire Recirculación Solaronic Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|CORREAS MANDO ROLLOS UNI BAR": [
"MANRA-UB",
"Mando Rollo aplicador Uni bar (MERAU)",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|CONTRARODILLO UNI BAR": [
"CONTRARODILLOUB",
"Contrarrodillo Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|ROLLO APLICADOR UNI BAR": [
"RA-UB",
"Rollo aplicador Uni bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|ROLLOS PAPEL UNI BAR": [
"CONTRARODILLOUB",
"Contrarrodillo Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|MANDO M17 CONTRARODILLO UNI BAR": [
"MANRA-UB",
"Mando Rollo aplicador Uni bar (MERAU)",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|MANDO ROLLO APLICADOR UNI BAR": [
"MANRA-UB",
"Mando Rollo aplicador Uni bar (MERAU)",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|SOGA UNI BAR": [
"CONTRARODILLOUB",
"Contrarrodillo Uni Bar",
"ESTUCADO"
],
"ESTUCADO|UNI BAR|VARILLA UNI BAR": [
"VUB",
"Varilla Uni bar (MEVUB)",
"ESTUCADO"
],
"ESTUCADO|CALANDRA 1|": [
"CAL1.MANS",
"Mando Principal Calandra 1 (MEPC1)",
"ESTUCADO"
],
"ESTUCADO|CALANDRA 1|CALANDRA 1": [
"CAL1.MANS",
"Mando Principal Calandra 1 (MEPC1)",
"ESTUCADO"
],
"ESTUCADO|CALANDRA 1|CENTRAL HIDRAULICA CALANDRA 1": [
"CAL1.CHIDRA",
"Central Hidraulica Rollo Kuster Calandra 1",
"ESTUCADO"
],
"ESTUCADO|CALANDRA 1|MANDO M14 CALANDRA 1": [
"CAL1.MANS",
"Mando Principal Calandra 1 (MEPC1)",
"ESTUCADO"
],
"ESTUCADO|CALANDRA 1|ROLLO SUP KUSTER CALANDRA 1": [
"CAL1.CHIDRA",
"Central Hidraulica Rollo Kuster Calandra 1",
"ESTUCADO"
],
"ESTUCADO|CALANDRA 1|ROLLO INF CALANDRA 1": [
"CAL1.CHIDRA",
"Central Hidraulica Rollo Kuster Calandra 1",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|": [
"CONTRARODILLOVB",
"Contrarrodillo Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|ESTUCADORA VARI BAR": [
"CONTRARODILLOVB",
"Contrarrodillo Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|VAPOR ESTUFAS VARI BAR": [
"CONTRARODILLOVB",
"Contrarrodillo Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|VENT NA01 VARI BAR": [
"VABA.INTNB01",
"Intercambiador NA01 Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|INTERCAMBIADOR NA01 VARI BAR": [
"VABA.INTNB01",
"Intercambiador NA01 Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|MANDO M16 SOGA VARI BAR": [
"VABA.SO",
"Mando Soga Vari Bar (MESV)",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|VARILLA VARI BAR": [
"VVB",
"Varilla Vari bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|CORREAS MANDO ROLLOS VARI BAR": [
"MANCONTRARODILLOVB",
"Mando Contrarrodillo Vari Bar (MEVB)",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|CONTRARODILLO VARI BAR": [
"CONTRARODILLOVB",
"Contrarrodillo Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|ROLLO APLICADOR VARI BAR": [
"MANRA-VB",
"Mando Rollo aplicador Vari bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|ROLLOS PAPEL VARI BAR": [
"CONTRARODILLOVB",
"Contrarrodillo Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|MANDO M15 SOGAS VARI BAR": [
"VB.M15",
"Mando M15 Sogas Vari Bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|MANDO M16 CONTRARODILLO VARI BAR": [
"MANCONTRARODILLOVB",
"Mando Contrarrodillo Vari Bar (MEVB)",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|MANDO ROLLO APLICADOR VARI BAR": [
"MANRA-VB",
"Mando Rollo aplicador Vari bar",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|SOGA VARI BAR": [
"VABA.SO",
"Mando Soga Vari Bar (MESV)",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|TENSOR NEUM SOGA EXT VARI BAR": [
"VABA.SO",
"Mando Soga Vari Bar (MESV)",
"ESTUCADO"
],
"ESTUCADO|VARI BAR|TENSOR NEUM SOGA INT VARI BAR": [
"VABA.SO",
"Mando Soga Vari Bar (MESV)",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|": [
"CONTRARODILLOLS",
"Contrarrodillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|ESTUCADORA LABIO SOPLADOR": [
"CONTRARODILLOLS",
"Contrarrodillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|VAPOR ESTUFAS LABIO SOPLADOR": [
"CONTRARODILLOLS",
"Contrarrodillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|SOLARONIC LABIO SOPLADOR": [
"CONTRARODILLOLS",
"Contrarrodillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|CONTRARODILLO LABIO SOPLADOR": [
"CONTRARODILLOLS",
"Contrarrodillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|INTERCAMBIADOR NB01 LABIO SOPLADOR": [
"LABS.INTNA01",
"Intercambiador NB01 Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|ROLLO APLICADOR LABIO SOPLADOR": [
"RA-LS",
"Rollo aplicador Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|ROLLO PREALISADOS LABIO SOPLADOR": [
"RA-LS",
"Rollo aplicador Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|ROLLO SELLADOR CAJA LABIO SOPLADOR": [
"RA-LS",
"Rollo aplicador Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|ROLLOS PAPEL LABIO SOPLADOR": [
"CONTRARODILLOLS",
"Contrarrodillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|MANDO M19 SOGA LABIO SOPLADOR": [
"LABS.SO",
"Mando Soga Labio Soplador (MESLS)",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|CORREAS MANDO ROLLOS LABIO SOPLADOR": [
"MANRA-LS",
"Mando Rollo aplicador Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|SOGA 1 LABIO SOPLADOR": [
"LABS.SO",
"Mando Soga Labio Soplador (MESLS)",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|TENSOR NEUM SOGA 1 LABIO SOPLADOR": [
"LABS.SO",
"Mando Soga Labio Soplador (MESLS)",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|SOGA 3 LABIO SOPLADOR": [
"LABS.SO",
"Mando Soga Labio Soplador (MESLS)",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|TENSOR NEUM SOGA 3 LABIO SOPLADOR": [
"LABS.SO",
"Mando Soga Labio Soplador (MESLS)",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|VENT AIRE COMB SOLARONIC LABIO SOPLADOR": [
"SOL3.VECO",
"Ventilador Aire Combustión Solaronic Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|VENT RECIRC SOLARONIC LABIO SOPLADOR": [
"SOL3.VECO",
"Ventilador Aire Combustión Solaronic Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|VENT NB01 LABIO SOPLADOR": [
"LABS.INTNA01",
"Intercambiador NB01 Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|SOPLADOR LABIO SOPLADOR": [
"CONTRARODILLOLS",
"Contrarrodillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|LABIO SOPLADOR|VENT EXTRACTOR POLVILLO LABIO SOPLADOR": [
"LABS.VEEXPOL",
"Ventilador Extractor Polvillo Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|": [
"CONTRARODILLOCB",
"Contrarrodillo Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|ESTUCADORA COMBI BLADE": [
"CONTRARODILLOCB",
"Contrarrodillo Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|SOLARONIC COMBI BLADE": [
"CONTRARODILLOCB",
"Contrarrodillo Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|CORREAS MANDO ROLLOS COMBI BLADE": [
"MANCONTRARODILLOCB",
"Mando Contrarrodillo Combi Blade (MECB)",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|CONTRARODILLO COMBI BLADE": [
"CONTRARODILLOCB",
"Contrarrodillo Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|MANDO M21 SOGAS COMBI BLADE": [
"MANCONTRARODILLOCB",
"Mando Contrarrodillo Combi Blade (MECB)",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|MANDO ROLLO APLICADOR COMBI BLADE": [
"MANRA-CB",
"Mando Rollo aplicador Combi Balde",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|MANDO CONTRARODILLO COMBI BLADE": [
"MANCONTRARODILLOCB",
"Mando Contrarrodillo Combi Blade (MECB)",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|ROLLO APLICADOR COMBI BLADE": [
"RA-CB",
"Rollo aplicador Combi Balde",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|ROLLOS PAPEL COMBI BLADE": [
"CONTRARODILLOCB",
"Contrarrodillo Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|TENSOR NEUM SOGA EXT COMBI BLADE": [
"COMB.SO",
"Mando Soga Combi Blade (MESG3)",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|TENSOR NEUM SOGA INT COMBI BLADE": [
"COMB.SO",
"Mando Soga Combi Blade (MESG3)",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|VARILLA COMBI BLADE": [
"VCB",
"Varilla Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|VENT AIRE COMB MAXON 1 COMBI BLADE": [
"MAXO.VECO",
"Ventilador Aire Combustión Maxon 1 Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|VENT AIRE RECIRC MAXON 1 COMBI BLADE": [
"MAXO.VECO",
"Ventilador Aire Combustión Maxon 1 Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|VENT AIRE COMB SOLARONIC COMBI BLADE": [
"SOL2.VECO",
"Ventilador Aire Combustión Solaronic Combi Blade",
"ESTUCADO"
],
"ESTUCADO|COMBI BLADE|VENT AIRE RECIRC SOLARONIC COMBI BLADE": [
"SOL2.VECO",
"Ventilador Aire Combustión Solaronic Combi Blade",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ESTACION FINAL UNI BAR": [
"ESTF.AGF4UNIB",
"Agitador Estación Final F3 Uni Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|AGITADOR ESTACION FINAL F3 UNI BAR": [
"ESTF.AGF4UNIB",
"Agitador Estación Final F3 Uni Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ZARANDA ESTACION FINAL F3 UNI BAR": [
"ESTF.ZAF4UNIB",
"Zaranda Estación Final F3 Uni Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|BOMBA PF3 ESTACION FINAL UNI BAR": [
"UB.BOPF3",
"Bomba Estación Final PF3 Uni Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ESTACION FINAL VARI BAR": [
"ESTF.AGF1VARI",
"Agitador Estación Final F1 Vari Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|AGITADOR ESTACION FINAL F1 VARI BAR": [
"ESTF.AGF1VARI",
"Agitador Estación Final F1 Vari Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ZARANDA ESTACION FINAL F1 VARI BAR": [
"ESTF.ZAF1VARI",
"Zaranda Estación Final F1 Vari Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|BOMBA PF1 ESTACION FINAL VARI BAR": [
"VB.BOPF1",
"Bomba Estación Final PF1 Vari Bar",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ESTACION FINAL LABIO SOPLADOR": [
"ESTF.AGF2LABI",
"Agitador Estación Final F2 Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|AGITADOR ESTACION FINAL F2 LABIO SOPLADOR": [
"ESTF.AGF2LABI",
"Agitador Estación Final F2 Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ZARANDA ESTACION FINAL F2 LABIO SOPLADOR": [
"ESTF.ZAF2LABI",
"Zaranda Estación Final F2 Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|BOMBA PF2 ESTACION FINAL LABIO SOPLADOR": [
"LS.BOPF2",
"Bomba Estación Final PF2 Labio Soplador",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ESTACION FINAL COMBI BLADE": [
"ESTF.AGF4COMB",
"Agitador Estación Final F4 Combi Blade",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|AGITADOR ESTACION FINAL PF4 COMBI BLADE": [
"ESTF.AGF4COMB",
"Agitador Estación Final F4 Combi Blade",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|ZARANDA ESTACION FINAL F4 COMBI BLADE": [
"ESTF.ZARCOMB",
"Zaranda Estación Final F4 Combi Blade",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|BOMBA PF4 ESTACION FINAL COMBI BLADE": [
"CB.BOPF4",
"Bomba PF4 Estación Final Combi Blade",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|BOMBA RECUPERO SALSA ESTACION FINAL COMBI BLADE": [
"CB.BOPF4",
"Bomba PF4 Estación Final Combi Blade",
"ESTUCADO"
],
"ESTUCADO|SOTANO ESTUCADO|FILTROS RONNINGER PETER COMBI BLADE": [
"ESTF.FI1RONCB",
"Filtro 1 Ronninger Peter Combi Blade",
"ESTUCADO"
],
"SEXTA BATERIA|ENFRIADORES|BOMBA RECUPERO AGUA ENFRIADORES": [
"BOMB-TREA.I",
"Bomba Tanque Recupero Agua CI",
"SEXTA BATERIA"
],
"SEXTA BATERIA|CALANDRA 2|": [
"CUINFCAL2",
"Cuchilla inferior Calandra 2",
"SEXTA BATERIA"
],
"SEXTA BATERIA|CALANDRA 2|CALANDRA 2": [
"CUINFCAL2",
"Cuchilla inferior Calandra 2",
"SEXTA BATERIA"
],
"SEXTA BATERIA|CALANDRA 2|CUCHILLAS CALANDRA 2": [
"CUINFCAL2",
"Cuchilla inferior Calandra 2",
"SEXTA BATERIA"
],
"SEXTA BATERIA|CALANDRA 2|MANDO CALANDRA 2": [
"CAL2.MAN",
"Mando Rollo Calandra 2 (MECN2)",
"SEXTA BATERIA"
],
"POPE|POPE|PUENTE GRUA 10T POPE": [
"GRUA.ELEVCPPO",
"Puente Grúa 10T Pope",
"POPE"
],
"POPE|POPE|BARRAS BOBINAS POPE": [
"ACPOPE.MAN",
"Acelerador de Barras Pope",
"POPE"
],
"POPE|POPE|MANDO POPE": [
"POPE.MAN",
"Mando Pope (MEPPE)",
"POPE"
],
"POPE|POPE|ACELERADOR DE BARRA POPE": [
"ACPOPE.MAN",
"Acelerador de Barras Pope",
"POPE"
],
"POPE|POPE|ESCANER VALMET": [
"ESCANER VM",
"Escaner - Valmet",
"POPE"
],
"CELLIER|CELLIER|": [
"GRUA.MTACARCE",
"Montacarga Cellier",
"CELLIER"
],
"CELLIER|CELLIER|AGITADOR TQ B1": [
"AGIT-CELL.TQB1",
"Agitador Tanque B1 Cellier",
"CELLIER"
],
"CELLIER|CELLIER|AGITADOR TQ COCINADOR C1": [
"AGCOC1",
"Agitador Tanque Cocinador C1 - Cellier",
"CELLIER"
],
"CELLIER|CELLIER|AGITADOR TQ COCINADOR C2": [
"AGCOC2",
"Agitador Tanque Cocinador C2 - Cellier",
"CELLIER"
],
"CELLIER|CELLIER|BOMBA B1 AGUA SELLO DILUTORES": [
"CELL.BOAGSED1",
"Bomba 1 Agua Sello Dilutores",
"CELLIER"
],
"CELLIER|CELLIER|BOMBA B2 AGUA SELLO DILUTORES": [
"CELL.BOAGSED1",
"Bomba 1 Agua Sello Dilutores",
"CELLIER"
],
"CELLIER|CELLIER|BOMBA TQ E1 Y E2": [
"CELL.BOPE1",
"Bomba PE1 Tanques E1/E2",
"CELLIER"
],
"CELLIER|CELLIER|BOMBA TQ E4 Y E5": [
"CELL.BOPE2",
"Bomba PE2 Tanques E4/E5",
"CELLIER"
],
"CELLIER|CELLIER|BOMBA TQ E6": [
"CELL.BOPE3",
"Bomba PE3 Tanque E6",
"CELLIER"
],
"CELLIER|CELLIER|BOMBA TQ E7": [
"CELL.BOPE4",
"Bomba PE4 Tanque E7",
"CELLIER"
],
"CELLIER|CELLIER|DILUTOR 1": [
"CELL.DL01",
"Dilutor N° 1",
"CELLIER"
],
"CELLIER|CELLIER|DILUTOR 2": [
"CELL.DL02",
"Dilutor Nº 2",
"CELLIER"
],
"CELLIER|CELLIER|DILUTOR 3": [
"CELL.DL03",
"Dilutor Nº 3",
"CELLIER"
],
"CELLIER|CELLIER|SOPLADOR TRANSPORTE CAOLIN": [
"CELL.SOPCA",
"Soplador Transporte Neumatico Caolin Cellier",
"CELLIER"
],
"CELLIER|CELLIER|VENT EXTRACTOR DILUTORES 2 Y 3": [
"CELL.VEXPD2Y3",
"Ventilador Extractor Dilutores 2 y 3",
"CELLIER"
],
"ALISTAMIENTO|REBOBINADORA|VENT EXTRACTOR POLVILLO AXIAL REBOBINADORA": [
"REB-VEAXEXPO",
"Ventilador Extractor Polvillo Axial Rebobinadora Vari Dur",
"ALISTAMIENTO"
],
"ALISTAMIENTO|REBOBINADORA|VENT EXTRACTOR POLVILLO CENTRIFUGO REBOBINADORA": [
"REB-VECEEXPO",
"Ventilador Extractor Polvillo Centrífugo Rebobinadora Vari Dur",
"ALISTAMIENTO"
],
"ALISTAMIENTO|PULPER REFILE REBOBINADORA|": [
"PULPER REFILE",
"Pulper Refile Vari Dur",
"ALISTAMIENTO"
],
"ALISTAMIENTO|PULPER REFILE REBOBINADORA|BOMBA PULPER REFILE": [
"BOMPULPER REFILE",
"Bomba Pulper Refile Vari Dur",
"ALISTAMIENTO"
],
"ALISTAMIENTO|PULPER REFILE REBOBINADORA|MANDO PULPER REFILE": [
"PULPER REFILE",
"Pulper Refile Vari Dur",
"ALISTAMIENTO"
],
"ALISTAMIENTO|PULPER REFILE REBOBINADORA|PULPER REFILE": [
"PULPER REFILE",
"Pulper Refile Vari Dur",
"ALISTAMIENTO"
],
"ALISTAMIENTO|VOLCADOR DE BOBINAS|": [
"ALI.VBOB",
"Volcador Bobinas EHP",
"ALISTAMIENTO"
],
"ALISTAMIENTO|VOLCADOR DE BOBINAS|CILINDORS HIDRAULICOS VOLCADOR DE BOBINAS": [
"ALI.VBOB",
"Volcador Bobinas EHP",
"ALISTAMIENTO"
],
"ALISTAMIENTO|VOLCADOR DE BOBINAS|CENTRAL HIDRAULICA VOLCADOR DE BOBINAS": [
"ALI.VBOB",
"Volcador Bobinas EHP",
"ALISTAMIENTO"
],
"ALISTAMIENTO|VOLCADOR DE BOBINAS|CAJAS RODAMIENTO VOLCADOR DE BOBINAS": [
"ALI.VBOB",
"Volcador Bobinas EHP",
"ALISTAMIENTO"
],
"ALISTAMIENTO|ZONA CORTADORA|": [
"LUG.ALIS.CORTADORA",
"Zona Cortadora",
"ALISTAMIENTO"
],
"ALISTAMIENTO|DEPOSITO|": [
"LUG.ALIS.DEPOSITO",
"Depósito",
"ALISTAMIENTO"
],
"LABORATORIO|LABORATORIO DE CALIDAD|": [
"LUG.LAB.CALIDAD",
"Laboratorio de Calidad",
"LABORATORIO"
],
"LABORATORIO|EQUIPOS DE ENSAYO|": [
"LUG.LAB.ENSAYOS",
"Laboratorio · Equipos de ensayo",
"LABORATORIO"
]
};

/* ============================ EXPORTACION A EAM (Tarjetas -> EAM) ============================
   Especificacion "Intercambio Tarjetas TPM <-> Infor EAM" v1.0 (07/10/2026).
   Cada corrida escribe en Drive, en la carpeta del CSV del EAM (o EAM_CARPETA_ID en Propiedades):
     1) tarjetas_horas.csv      una fila por tarjeta + legajo + dia
     2) tarjetas_para_eam.csv   una fila por tarjeta roja / verde vigente
   Formato: ';' · UTF-8 con BOM · CRLF · fechas 'yyyy-MM-dd HH:mm' · decimales con punto · sin saltos de linea.
   Son fotos completas: cada vez se escribe todo lo vigente. Primero horas, despues tarjetas (seccion 4.3). */
const EAM_TIPOS_EXPORT = { 'Roja': 'CORRECTIVO', 'Verde': 'MEJORA' };
const EAM_PRIORIDAD = { 'Alta': '10', 'Media': '9', 'Baja': '7' };   // 11 E-Emergencia · 10 A-Alerta · 9 P-Precaucion · 7 N-Normal
const EAM_EQUIPO_GENERAL = 'INST-GRAL';   // lugares sin codigo en el EAM (LUG.*, SIN-CODIGO) van a este equipo
const EAM_ESTADOS_FINALES = ['terminado', 'cancelado', 'rechazado'];
const EAM_ESTADOS_ANULADOS = ['cancelado', 'rechazado'];
const EAM_ARCH_TARJETAS = 'tarjetas_para_eam.csv', EAM_ARCH_HORAS = 'tarjetas_horas.csv', EAM_ARCH_RECHAZOS = 'tarjetas_rechazadas.csv';
const EAM_COLS_TARJETAS = ['ID_Tarjeta', 'Estado_Tarjeta', 'Fecha_Tarjeta', 'Descripcion', 'Detalle', 'Equipo', 'Naturaleza', 'Condicion',
  'Taller', 'Prioridad', 'Solicitante', 'Solicitante_Nombre', 'Fecha_Objetivo', 'Sector', 'Hs_Estimadas', 'Personas',
  'Fecha_Inicio_Real', 'Fecha_Fin_Real', 'Comentario_Cierre', 'Lineas_Horas'];
const EAM_COLS_HORAS = ['ID_Tarjeta', 'Legajo', 'Fecha', 'Horas'];

function legajoDe_(nombre) { return LEGAJOS_EAM[String(nombre || '').trim()] || ''; }
function eamTexto_(s, max) {
  var t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return max ? t.slice(0, max) : t;
}
function eamCampo_(v) {
  var s = String(v == null ? '' : v);
  return /[;"]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function eamCsv_(cols, filas) {
  return '﻿' + [cols].concat(filas).map(function (f) { return f.map(eamCampo_).join(';'); }).join('\r\n') + '\r\n';
}
function eamDec_(n) { n = Math.round((+n || 0) * 100) / 100; return n ? String(n) : ''; }
function eamFinal_(estadoEAM) { return EAM_ESTADOS_FINALES.indexOf(String(estadoEAM || '').trim().toLowerCase()) > -1; }
function eamEquipo_(sistema) {
  var s = String(sistema || '').trim();
  return !s || /^LUG\./.test(s) || /^SIN-CODIGO/.test(s) || s.length > 30 ? EAM_EQUIPO_GENERAL : s;
}
function eamTaller_(t) {
  var a = String(t['Area responsable'] || ''), e = String(t['Especialidad'] || '');
  if (/el[eé]ctric/i.test(a)) return 'TE';
  if (/icopro|instrument/i.test(a)) return 'TI';
  if (/mec[aá]nic/i.test(a)) return 'TM';
  if (/producci|operaci/i.test(a)) return 'PR';
  if (/electric/i.test(e)) return 'TE';
  if (/instrument/i.test(e)) return 'TI';
  if (/operacion/i.test(e)) return 'PR';
  return 'TM';   // mecanica, lubricacion, contratistas y sin dato
}
// "Nombre|yyyy-MM-dd|horas; ..." -> [{p, f, h}]
function horasDetalle_(txt) {
  return String(txt || '').split(';').map(function (x) {
    var p = x.split('|'); return { p: String(p[0] || '').trim(), f: String(p[1] || '').trim(), h: eamNum_(p[2]) };
  }).filter(function (x) { return x.p && x.h > 0; });
}

// Arma las dos fotos. No escribe nada: la usan exportarEAM_ y la descarga desde Seguimiento.
function armarExportEAM_() {
  var sh = getSheet_(), n = sh.getLastRow() - 1;
  var datos = n > 0 ? sh.getRange(2, 1, n, HEADERS.length).getValues() : [];
  var hoy = ahora_(), hoyDia = hoy.slice(0, 10), filasT = [], filasH = [], vistos = {};
  var res = { abiertas: 0, cerradas: 0, anuladas: 0, horas: 0, sinLegajo: {}, equipoGeneral: 0, excluidas: 0 };
  datos.forEach(function (r) {
    var t = {}; HEADERS.forEach(function (h, k) { t[h] = fmt_(r[k], h); });
    var id = String(t['ID'] || '').trim();
    if (!id || vistos[id] || !EAM_TIPOS_EXPORT[t['Tipo']]) return;
    if (t['Export EAM'] === 'Excluida') { res.excluidas++; return; }
    if (eamFinal_(t['Estado EAM'])) return;   // el EAM ya confirmo el estado final: se deja de exportar
    // cerrada / anulada en Tarjetas antes de que exista la OT: el EAM la rechaza (no crea una OT solo para cerrarla).
    // Con ese rechazo ya confirmado se deja de exportar, para que no quede en el archivo para siempre.
    if (!String(t['N OT'] || '').trim() && t['Rechazo EAM'] && t['Estado'] !== 'Abierta' && t['Estado'] !== 'En proceso') return;
    vistos[id] = 1;
    var est = t['Estado'], estado = ESTADOS_RESUELTOS.indexOf(est) > -1 ? 'CERRADA' : est === 'Anulada' ? 'ANULADA' : 'ABIERTA';
    var desc = String(t['Descripcion'] || ''), titulo = eamTexto_(desc.split(/\r?\n/)[0] || desc, 80) || eamTexto_(t['Categoria'], 80) || id;
    var detalle = eamTexto_(desc + (t['Categoria'] ? ' | Anomalia: ' + t['Categoria'] : '') + (t['Equipo'] ? ' | Lugar: ' + t['Equipo'] : '') +
      (t['Notas'] ? ' | Notas: ' + t['Notas'] : ''), 2000);
    var eq = eamEquipo_(t['Sistema']); if (eq === EAM_EQUIPO_GENERAL && t['Sistema'] !== EAM_EQUIPO_GENERAL) res.equipoGeneral++;
    var hs = eamNum_(t['Horas estimadas']), pers = parseInt(t['Personas necesarias'], 10);
    var fila = [id, estado, eamFecha_(t['Fecha alta']) || hoy, titulo, detalle === titulo ? '' : detalle, eq,
      EAM_TIPOS_EXPORT[t['Tipo']], condicionDe_(t) === 'Maquina en marcha' ? 'MARCHA' : 'PARADA', eamTaller_(t),
      EAM_PRIORIDAD[t['Prioridad']] || EAM_PRIORIDAD.Media, legajoDe_(t['Detectado por']), eamTexto_(t['Detectado por'], 80),
      eamFecha_(t['Fecha planificada'], true) || eamFecha_(t['Fecha compromiso'], true), eamTexto_(t['Area equipo'] || t['Sector'], 80),
      hs > 0 ? eamDec_(hs) : '', hs > 0 ? String(pers >= 1 ? pers : 1) : '', '', '', '', ''];
    if (estado === 'CERRADA') {
      var fin = eamFecha_(t['Fecha cierre']) || hoy; if (fin > hoy) fin = hoy;
      var ini = eamFecha_(t['Fecha inicio real']);
      if (!ini || ini > fin) {   // cierres sin inicio cargado: inicio = fin - horas reales
        var hr = eamNum_(t['Horas reales']) || 1, d = parseFecha_(fin);
        ini = d ? Utilities.formatDate(new Date(d.getTime() - hr * 3600000), TZ, 'yyyy-MM-dd HH:mm') : fin;
      }
      // horas por persona y dia; si el cierre es viejo (sin detalle) se reparten las horas reales entre los ejecutores
      var det = horasDetalle_(t['Horas detalle']);
      if (!det.length && eamNum_(t['Horas reales']) > 0) {
        var gente = listaNombres_(t['Cerrado por'] || t['Ejecutores']).filter(function (p) { return legajoDe_(p); });
        if (!gente.length) gente = listaNombres_(t['Ejecutores']);
        var cada = eamNum_(t['Horas reales']) / Math.max(1, gente.length);
        det = gente.map(function (p) { return { p: p, f: fin.slice(0, 10), h: cada }; });
      }
      var suma = {};
      det.forEach(function (x) {
        var leg = legajoDe_(x.p); if (!leg) { res.sinLegajo[x.p] = 1; return; }
        var f = eamFecha_(x.f, true) || fin.slice(0, 10); if (f > hoyDia) f = hoyDia;
        var k = leg + '|' + f; suma[k] = (suma[k] || 0) + x.h;
      });
      var lineas = Object.keys(suma).sort().map(function (k) { var p = k.split('|'); return [id, p[0], p[1], eamDec_(Math.min(24, suma[k]))]; });
      lineas.forEach(function (l) { filasH.push(l); });
      res.horas += lineas.length;
      var com = eamTexto_((t['Accion de cierre'] || 'Resuelta en Tarjetas') + (t['Causa'] && t['Causa'] !== CAUSA_EAM_PENDIENTE ? ' | Causa: ' + t['Causa'] : '') +
        (t['Cerrado por'] ? ' | Resuelta por: ' + t['Cerrado por'] : ''), 2000);
      fila[16] = ini; fila[17] = fin; fila[18] = com; fila[19] = String(lineas.length);
      res.cerradas++;
    } else if (estado === 'ANULADA') res.anuladas++;
    else res.abiertas++;
    filasT.push(fila);
  });
  res.sinLegajo = Object.keys(res.sinLegajo);
  res.tarjetas = filasT.length;
  return { tarjetas: eamCsv_(EAM_COLS_TARJETAS, filasT), horas: eamCsv_(EAM_COLS_HORAS, filasH), res: res };
}
function condicionDe_(t) { return CONDICIONES.indexOf(t['Condicion intervencion']) > -1 ? t['Condicion intervencion'] : 'A definir'; }

// Carpeta del intercambio: EAM_CARPETA_ID (Propiedades) o la carpeta donde esta el CSV del EAM.
// Si el CSV del EAM esta compartido desde otra cuenta (sin carpeta visible), se usa / crea la carpeta
// "Intercambio Tarjetas EAM" en el Drive de quien publica el script y se recuerda en EAM_CARPETA_ID.
const EAM_CARPETA_NOMBRE = 'Intercambio Tarjetas EAM';
function carpetaEAM_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('EAM_CARPETA_ID');
  if (id) return DriveApp.getFolderById(id);
  var c = null;
  try {
    var ps = DriveApp.getFileById(props.getProperty('EAM_CSV_ID') || EAM_CSV_ID).getParents();
    if (ps.hasNext()) { c = ps.next(); c.getFilesByName(EAM_ARCH_TARJETAS); }   // prueba de acceso
  } catch (e) { c = null; }
  if (!c) {
    var it = DriveApp.getFoldersByName(EAM_CARPETA_NOMBRE);
    c = it.hasNext() ? it.next() : DriveApp.createFolder(EAM_CARPETA_NOMBRE);
  }
  props.setProperty('EAM_CARPETA_ID', c.getId());
  return c;
}
// Escritura "atomica" en Drive: archivo .tmp completo y despues se reemplaza el definitivo.
function escribirEnCarpeta_(carpeta, nombre, contenido) {
  var tmp = carpeta.createFile(nombre + '.tmp', contenido, MimeType.CSV);
  var viejos = carpeta.getFilesByName(nombre);
  while (viejos.hasNext()) viejos.next().setTrashed(true);
  tmp.setName(nombre);
  return tmp.getId();
}
function exportarEAMSeguro_() {
  try { return exportarEAM_(); }
  catch (e) {
    var r = { ok: false, error: String(e && e.message ? e.message : e), fecha: ahora_() };
    PropertiesService.getScriptProperties().setProperty('EAM_EXPORT_ULTIMA', JSON.stringify(r));
    return r;
  }
}
function exportarEAM_() {
  var x = armarExportEAM_(), props = PropertiesService.getScriptProperties();
  var huella = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, x.horas + '\n' + x.tarjetas, Utilities.Charset.UTF_8));
  x.res.fecha = ahora_(); x.res.ok = true;
  if (huella === props.getProperty('EAM_EXPORT_HUELLA')) { x.res.sinCambios = true; var u = JSON.parse(props.getProperty('EAM_EXPORT_ULTIMA') || '{}'); x.res.carpeta = u.carpeta; x.res.carpetaUrl = u.carpetaUrl; }
  else {
    var carpeta = carpetaEAM_();
    x.res.carpeta = carpeta.getName(); x.res.carpetaUrl = carpeta.getUrl();
    escribirEnCarpeta_(carpeta, EAM_ARCH_HORAS, x.horas);        // primero las horas (seccion 4.3)
    escribirEnCarpeta_(carpeta, EAM_ARCH_TARJETAS, x.tarjetas);
    props.setProperty('EAM_EXPORT_HUELLA', huella);
  }
  props.setProperty('EAM_EXPORT_ULTIMA', JSON.stringify(x.res));
  return x.res;
}

// Rechazos del EAM: se guardan en la tarjeta (columna Rechazo EAM). Es una foto: lo que ya no figura se limpia.
function leerRechazosEAM_(sh, datos) {
  var it;
  try { it = carpetaEAM_().getFilesByName(EAM_ARCH_RECHAZOS); } catch (e) { return null; }
  if (!it.hasNext()) return null;
  var f = it.next(), txt = f.getBlob().getDataAsString('UTF-8');
  if (txt.indexOf('�') > -1) txt = f.getBlob().getDataAsString('ISO-8859-1');
  var filas = eamParseCsv_(txt);
  if (!filas.length) return 0;
  var h = filas[0].map(eamNorm_), cId = h.indexOf('idtarjeta'), cCol = h.indexOf('columna'), cMot = h.indexOf('motivo'), cF = h.indexOf('fechaintento');
  if (cId === -1 || cMot === -1) return null;
  var porId = {};
  filas.slice(1).forEach(function (r) {
    var id = String(r[cId] || '').trim().toUpperCase(); if (!id) return;
    var m = String(r[cMot] || '').trim(), c = cCol > -1 ? String(r[cCol] || '').trim() : '';
    (porId[id] = porId[id] || []).push((c ? c + ': ' : '') + m + (cF > -1 && r[cF] ? ' (' + String(r[cF]).trim() + ')' : ''));
  });
  var col = HEADERS.indexOf('Rechazo EAM'), cambios = 0;
  datos.forEach(function (r, i) {
    var id = String(r[0]).trim().toUpperCase(), nuevo = (porId[id] || []).join(' · ').slice(0, 2000);
    if (String(r[col] || '') === nuevo) return;
    r[col] = nuevo; sh.getRange(i + 2, col + 1).setValue(nuevo); cambios++;
    if (nuevo) log_(r[0], 'EAM', 'Rechazo EAM', '', nuevo, 'EAM');
  });
  return cambios;
}

// Una sola vez: las tarjetas que ya existian antes de la integracion y no van al EAM quedan marcadas.
// Van solo las rojas / verdes abiertas o en proceso SIN OT (las que ya tienen OT en el EAM se excluyen).
function migrarExportEAM_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('migracion_export_eam_v1')) return;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return; }
  try {
    if (props.getProperty('migracion_export_eam_v1')) return;
    var sh = getSheet_(), n = sh.getLastRow() - 1;
    if (n > 0) {
      var c = function (h) { return HEADERS.indexOf(h); };
      var rng = sh.getRange(2, 1, n, HEADERS.length), v = rng.getValues(), marcadas = 0;
      v.forEach(function (r) {
        var abierta = ESTADOS_ABIERTOS.indexOf(String(r[c('Estado')])) > -1;
        var conOT = String(r[c('N OT')] || '').trim() || String(r[c('Estado EAM')] || '').trim();
        if (!abierta || conOT) { r[c('Export EAM')] = 'Excluida'; marcadas++; }
      });
      rng.setValues(v);
      log_('-', 'Migracion EAM', 'Export EAM', '', marcadas + ' tarjetas existentes excluidas (cerradas, anuladas o con OT)', 'sistema');
      invalidarCacheListar_();
    }
    props.setProperty('migracion_export_eam_v1', ahora_());
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}


// Nombre en Tarjetas -> legajo (codigo de personal del EAM). Fuente: Empleados.xlsx del EAM (07/10/2026).
const LEGAJOS_EAM = {
  "Alchao, Jonatan Rodolfo": "4312",
  "Alvarez, Bruno Nicolas": "4374",
  "Antunez, Juan Jose": "4250",
  "Arata, Alan": "4313",
  "Arrieta, Ceferino Juan Cruz": "4333",
  "Baier, Juan Carlos": "4300",
  "Bares, Gustavo Ariel": "4237",
  "Batstoc, Jonatan Braian": "6372",
  "Bauer, Inaki": "4356",
  "Bauer, Juan Horacio": "4111",
  "Belarra, Marcelo": "6093",
  "Bender, Lucas": "6362",
  "Benzi, Lucas": "4375",
  "Berezaga, Mauro Javier": "4277",
  "Bernardt, Leandro Matias": "4310",
  "Bilbao, Sofia": "6356",
  "Biolato, Juan Manuel": "4383",
  "Bolletta, Franco": "6365",
  "Braun, Maximiliano": "4364",
  "Bucchi, Geronimo": "4370",
  "Cabrera, Claudio Marcelo": "4265",
  "Callava, Sebastian": "6332",
  "Camargo, Juan Ceferino": "4280",
  "Candal, Nicolas": "4371",
  "Cassano Medina, Celestino": "4351",
  "Catalan, Alexis": "4349",
  "Cesoni, Oscar Luis": "4267",
  "Civerchia, Branko": "4365",
  "Codutti, Cristian": "6355",
  "Colli Y Ockier, Maximiliano": "6327",
  "Cotta, Sebastian Raul": "4309",
  "Dosal, Eduardo Martin": "4380",
  "Dupuy, David Angel": "4296",
  "Echeguia Donnari, Juan": "4341",
  "Echeguia, Martin Alberto": "6307",
  "Egoburo, Juan": "4367",
  "Esquivel, Gabriel Fernando": "4318",
  "Fahn, Jorge Oscar Benjamin": "4301",
  "Fernandez, Adolfo Antonio": "4220",
  "Fernandez, Angel Alberto": "4180",
  "Fernandez, Diego": "6083",
  "Ferrer, Sergio Rene": "4258",
  "Ferrero, Ariel Norman": "6271",
  "Ferro, Cesar Alexis David": "4381",
  "Flores, Martin Alejandro": "4262",
  "Franco, Gabriel": "4352",
  "Frias, Ruben Dario": "4286",
  "Funes Ibanez, Carlos": "4340",
  "Gamero, Luciano": "6342",
  "Gamero, Ruben Luis": "4159",
  "Garcia Cuevas, Gustavo": "4338",
  "Garcia, Luis Agustin": "6286",
  "Garciarena Serain, Joaquin": "4337",
  "Garrido Olivares, Heriberto": "4317",
  "Getino, Alejandro Hernan": "6310",
  "Giampieri, Gonzalo Jose": "6291",
  "Gimenez, Emiliano": "4363",
  "Gimenez, Lucas": "4376",
  "Gisler, Guillermo": "6358",
  "Godoy, Dario": "4373",
  "Gomez, Mario Hugo": "4190",
  "Goni, Santiago Luis": "6292",
  "Gonzalez, Eduardo Fabian": "4171",
  "Gonzalez, Luis Alberto": "4246",
  "Graff, Ezequiel Adrian": "4292",
  "Gutierrez, Jorge Alberto": "4166",
  "Heiland, Hugo Oscar": "4240",
  "Hernandez Mascaro, Sergio Javier": "6306",
  "Herrada, Mauro Sebastian": "4289",
  "Hirsch, Gustavo": "4321",
  "Iommi, Juan Pablo": "6317",
  "Iriarte, Aldo Jorge": "6258",
  "Issaly, Ignacio": "6303",
  "Izaguirre, Andoni": "4324",
  "Kraemer, Sebastian Edgardo": "4307",
  "Labat, Norberto Andres": "6321",
  "Lambrecht, Horacio Javier": "4316",
  "Lanaro, Gustavo Alberto": "4287",
  "Lanaro, Natalio": "4366",
  "Larralde, Maximiliano": "4348",
  "Lascalea Stremel, Franco": "4339",
  "Lopez, Diego Martin Dario": "6334",
  "Lopez, Rodrigo Ezequiel": "4323",
  "Lorenzo, Nelson Guillermo": "6318",
  "Manfredi, Juan Martin": "6279",
  "Marcolini, Edgardo Ceferino": "4227",
  "Marconi, Jorge": "6296",
  "Marillan, Braian": "4359",
  "Martinez, Cintia Daniela": "6364",
  "Martinez, Santiago": "4378",
  "Medina, Alejandro Daniel": "4304",
  "Meriggi, Cesar Hugo": "6323",
  "Montero, Marcelo": "6359",
  "Morales, Alejandro Daniel": "4382",
  "Moyano, Guillermo Javier": "4325",
  "Murillas Cornelli, Sergio Ruben": "4241",
  "Neville, Sergio Jorge Fabian": "6285",
  "Olmedo Torres, Segundo": "4344",
  "Oteiza, Adrian": "4369",
  "Panis, Guillermo Adrian": "6367",
  "Pastori, Juan Alberto": "4326",
  "Perez, Marcelo Fabian": "4173",
  "Perez, Victor Fernando": "4311",
  "Pieroni, Adrian": "6259",
  "Pollio Biolato, Gaston": "4332",
  "Quintrileo, Juan Carlos": "4193",
  "Quiroga, Facundo": "4357",
  "Raising, Claudio Fabian": "4200",
  "Raising, Hernan Matias": "4295",
  "Riera, Damian Angel": "4285",
  "Rincon, Fabio Maria": "4210",
  "Rodriguez, Carina Noemi": "6314",
  "Rodriguez, Osvaldo Sergio Roque": "4230",
  "Rodriguez, Pablo Hernan": "4275",
  "Salazar Schawn, Cristian": "4330",
  "Sanabria, Edgar": "4354",
  "Sanchez, Matias": "6360",
  "Sandoval, Nicolas Roberto": "4315",
  "Santana, Alfredo Ezequiel": "4379",
  "Schlegel, Sergio Daniel": "4247",
  "Schulz, Fernando Alberto": "4238",
  "Schwab, Dario Hernan": "4319",
  "Schwindt, Ricardo David": "4297",
  "Sepulveda, Agustin": "4368",
  "Sepulveda, Lautaro": "4358",
  "Sigismondi Munoz, Carlos": "4329",
  "Silva, Diego Armando": "4320",
  "Souto Krause, Facundo": "4328",
  "Stefanof, Juan": "4372",
  "Stoessel, Silvana Karen": "6294",
  "Temps, Bernardo Oscar": "4303",
  "Trespalacios, Luciano": "4331",
  "Uribe, Sebastian": "6340",
  "Urriaga, Marcelo Alejandro": "6290",
  "Urriaga, Martin": "6346",
  "Ustua Evangelista, Julian": "4350",
  "Ustua, Juan Manuel": "4293",
  "Vallejos, Jose Luis": "6288",
  "Vallese, Luis Maria": "4269",
  "Venzi, Jorge Enrique": "4175",
  "Vila, Alejandro Emilio": "4306",
  "Vila, Gabriel": "4353",
  "Villalba, Kevin Emmanuel": "4334",
  "Wendorff, Pablo Juan": "6262",
  "Zanotto, Agustin": "4377",
  "Zaracho Ayala, Ernesto": "4347",
  "Zarza, Sandro Ariel": "4263"
  };
