/* ============================================================
   SISTEMA DE TARJETAS TPM — Planta Tornquist  ·  v3
   comun.js  ·  configuracion, catalogos, capa de datos y helpers
   Compartido por todas las paginas. Cargar DESPUES de arbol.js y personas.js.
   ============================================================ */

/* global sectorDe */  // la trae personas.js (o el respaldo de mas abajo)
const CONFIG = {
  /* ╔══════════════════════════════════════════════════════════════╗
     ║  PEGÁ AQUÍ LA URL /exec DE TU APPS SCRIPT (entre las comillas) ║
     ╚══════════════════════════════════════════════════════════════╝ */
  API_URL: 'https://script.google.com/macros/s/AKfycbxUYpbmGe-T0Rc-jD0dxkzdAnwOzop9ikIvajMgxDRa5gj33a5ErLSkbNTar4kNkJkN/exec',
  PLANTA: 'Tornquist',
  META_TARJETAS_PERSONA_MES: 2,   // meta de cultura: tarjetas por persona por mes
  DIAS_REPETICION: 90,            // misma falla en el mismo equipo dentro de N dias de resuelta = repeticion
  UMBRAL_KAIZEN: 3,               // equipo con >= N tarjetas en 90 dias = candidato a Mejora Enfocada
  PERIODO_DEFECTO_DIAS: 365,      // cuanto historial traen Seguimiento y Dashboard por defecto

  /* ---- Planificacion automatica ---- */
  // Criterio de prioridad (puntaje). Se suma todo lo que aplique; mayor puntaje = se planifica antes.
  PESOS: {
    prioridad: { Alta: 30, Media: 15, Baja: 5 },
    seguridad: 25,          // categoria 6 · condicion insegura
    calidad: 15,            // categoria 5 · defecto de calidad
    criticidad: { A: 20, B: 10, C: 0 },   // criticidad del area (hoja Areas)
    repetida: 15,           // la falla volvio dentro de DIAS_REPETICION
    vencida: 10,
    antiguedadMax: 10,      // +1 punto cada 3 dias abierta, hasta este tope
    verde: -10              // las mejoras compiten despues de las anomalias
  },
  // Horas por persona y por dia que se pueden dedicar a tarjetas con la maquina en marcha
  HORAS_DIA_TARJETAS: { Roja: 4, Azul: 1, Verde: 2 },
  // Si la tarjeta no tiene estimacion y no hay historial parecido
  DURACION_DEFECTO: { Roja: 2, Azul: 0.5, Verde: 4 },
  PERSONAS_DEFECTO: { Roja: 2, Azul: 1, Verde: 2 }
};

/* -------------------- Catalogos -------------------- */

const TIPOS = {
  Roja:  { color: '#C0392B', grupo: 'Mantenimiento',   desc: 'Requiere expertise tecnica — la resuelve mantenimiento (electrico, mecanico, instrumentista).' },
  Azul:  { color: '#2D6CB5', grupo: 'Operacion',       desc: 'Baja complejidad tecnica — la resuelve el operador del sector.' },
  Verde: { color: '#4E9A2F', grupo: 'Mejora Enfocada', desc: 'Es una mejora — la puede resolver cualquiera, va al pipeline de Mejora Enfocada.' }
};

const TURNOS = ['A', 'B', 'C', 'D'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];
/* 'Cerrada' se muestra como "Resuelta · a verificar". 'Verificada' es el cierre definitivo. */
const ESTADOS = ['Abierta', 'En proceso', 'Cerrada', 'Verificada', 'Anulada'];
const ESTADO_LABEL = { 'Cerrada': 'Resuelta · a verificar', 'Verificada': 'Verificada' };

/* Categorias de anomalia = los 7 fuguai del Mantenimiento Autonomo, agrupados. */
const CATEGORIAS_TPM = {
  '1 · Condicion basica incumplida': ['Suciedad / falta de limpieza', 'Lubricacion deficiente', 'Ajuste / apriete flojo'],
  '2 · Foco de contaminacion (fuente)': ['Fuga (aceite / aire / agua / vapor)', 'Fuente de polvo / viruta / particulas', 'Derrame / dispersion de material'],
  '3 · Lugar de dificil acceso': ['Dificil limpieza', 'Dificil lubricacion', 'Dificil inspeccion', 'Dificil operacion / ajuste'],
  '4 · Deterioro / pequena deficiencia': ['Desgaste / juego / holgura', 'Ruido / vibracion / sobretemperatura', 'Anomalia electrica / instrumentacion', 'Grieta / deformacion / corrosion'],
  '5 · Defecto de calidad': ['Contaminacion / cuerpo extrano que afecta calidad', 'Variable de proceso fuera de estandar', 'Defecto visible en el producto (arruga, mancha, gramaje, humedad)'],
  '6 · Seguridad': ['Condicion insegura'],
  '7 · MUDA': ['Elemento innecesario / fuera de lugar']
};

const ETAPAS_MA = ['Paso 1 · Restaurar condiciones', 'Paso 2 · Eliminar focos / facilitar acceso', 'Paso 3 · Estandarizar (LILA)'];
const ETAPA_SUGERIDA = {
  '1 · Condicion basica incumplida': 'Paso 1 · Restaurar condiciones',
  '4 · Deterioro / pequena deficiencia': 'Paso 1 · Restaurar condiciones',
  '2 · Foco de contaminacion (fuente)': 'Paso 2 · Eliminar focos / facilitar acceso',
  '3 · Lugar de dificil acceso': 'Paso 2 · Eliminar focos / facilitar acceso'
};

const CONDICIONES = {
  'Maquina en marcha': { corto: 'En marcha', icono: '▶', color: '#2E7D32', soft: '#E3F1E1',
    ayuda: 'Se resuelve sin parar: ajuste exterior, limpieza fuera de zona de riesgo, cambio de algo sin partes en movimiento ni energia peligrosa.' },
  'Maquina parada':    { corto: 'Parada',    icono: '■', color: '#B3261E', soft: '#FBE4E2',
    ayuda: 'Necesita parar: abrir guardas, bloqueo de energia (LOTO), desarme, cambio de piezas en movimiento, trabajo en zona de riesgo.' },
  'A definir':         { corto: 'A definir', icono: '?', color: '#7A7F76', soft: '#EEF0EC',
    ayuda: 'No estoy seguro. Lo define mantenimiento o el planificador.' }
};

const ESPECIALIDADES = ['Mecanica', 'Electrica', 'Instrumentacion', 'Lubricacion', 'Operacion', 'Contratista'];
const LOTO_OPCIONES = ['No requiere', 'LOTO (bloqueo de energia)', 'Permiso trabajo en caliente', 'Permiso trabajo en altura', 'Permiso espacio confinado', 'LOTO + permiso'];
const CAUSAS = ['Falta de limpieza / inspeccion', 'Falta de lubricacion', 'Desgaste natural', 'Operacion incorrecta', 'Falla de diseño / instalacion', 'Montaje / reparacion anterior deficiente', 'Condicion ambiental (polvo, humedad, temperatura)', 'Repuesto / material fuera de especificacion', 'Otra'];
const DIMENSIONES_MEJORA = ['Seguridad', 'Calidad', 'Productividad', 'Costo', 'Ergonomia', 'Medio Ambiente', 'Facilidad de operacion / limpieza'];

/* ============================================================
   Almacenamiento local seguro (puede no estar disponible)
   ============================================================ */
const LS = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

/* ============================================================
   Datos maestros: personas y arbol.
   Fuente: hojas "Personas" y "Arbol" de la planilla (si tienen datos);
   si no, personas.js / arbol.js. Se cachean en el dispositivo.
   ============================================================ */
(function aplicarMaestrosCache() {
  const m = LS.get('tpm_maestros', null);
  if (!m) return;
  if (m.personas && typeof PERSONAS_POR_SECTOR !== 'undefined') {
    Object.keys(PERSONAS_POR_SECTOR).forEach(function (k) { delete PERSONAS_POR_SECTOR[k]; });
    Object.assign(PERSONAS_POR_SECTOR, m.personas);
  }
  if (m.areas) window.AREAS_CFG = m.areas;
  if (m.arbol && typeof ARBOL_EQUIPO !== 'undefined') {
    Object.keys(ARBOL_EQUIPO).forEach(function (k) { delete ARBOL_EQUIPO[k]; });
    Object.assign(ARBOL_EQUIPO, m.arbol);
  }
})();

async function refrescarMaestros(forzar) {
  const m = LS.get('tpm_maestros', null);
  if (!forzar && m && (Date.now() - (m.ts || 0)) < 6 * 3600 * 1000) return false;
  try {
    const r = await api('maestros');
    if (r.ok) { LS.set('tpm_maestros', { ts: Date.now(), personas: r.personas, arbol: r.arbol, areas: r.areas || [] }); window.AREAS_CFG = r.areas || []; return true; }
  } catch (e) {}
  return false;
}

function todasLasPersonas() {
  const out = [];
  if (typeof PERSONAS_POR_SECTOR === 'undefined') return out;
  Object.keys(PERSONAS_POR_SECTOR).forEach(function (s) { PERSONAS_POR_SECTOR[s].forEach(function (n) { out.push(n); }); });
  return out.sort(function (a, b) { return a.localeCompare(b, 'es'); });
}

/* personas.js (compartido con EHS y Causa Raiz) ya trae sectorDe(); esta es solo la version de respaldo. */
if (typeof window.sectorDe !== 'function') {
  window.sectorDe = function (nombre) {
    if (!nombre || typeof PERSONAS_POR_SECTOR === 'undefined') return '';
    for (const s in PERSONAS_POR_SECTOR) if (PERSONAS_POR_SECTOR[s].indexOf(nombre) > -1) return s;
    return '';
  };
}

function personasDelSector(s) { return (typeof PERSONAS_POR_SECTOR !== 'undefined' && PERSONAS_POR_SECTOR[s]) ? PERSONAS_POR_SECTOR[s].length : 0; }

/* ============================================================
   Areas: criticidad, supervisor (responsable por defecto) y ejecutores por color.
   Fuente: hoja "Areas" de la planilla (se edita en config.html).
   Si un area no esta configurada usa la fila '*'; si tampoco hay, estos valores por defecto:
     Roja  -> tecnicos de los sectores Mantenimiento (Mecanico / Electrico)
     Azul  -> Operarios
     Verde -> Ingenieria, I+D y Produccion
   Los nombres de ejecutores se separan con ";" (los nombres llevan coma).
   ============================================================ */
window.AREAS_CFG = window.AREAS_CFG || [];
function _personasDeSectores(re) {
  if (typeof PERSONAS_POR_SECTOR === 'undefined') return [];
  let out = [];
  Object.keys(PERSONAS_POR_SECTOR).forEach(function (s) { if (re.test(s)) out = out.concat(PERSONAS_POR_SECTOR[s]); });
  return out;
}
function areaPorDefecto() {
  const jefeMant = (typeof PERSONAS_POR_SECTOR !== 'undefined' && PERSONAS_POR_SECTOR['Mantenimiento']) ? PERSONAS_POR_SECTOR['Mantenimiento'][0] : '';
  return {
    Area: '*', Criticidad: 'B',
    'Supervisor Roja': jefeMant, 'Ejecutores Roja': _personasDeSectores(/^Mantenimiento/i).join('; '),
    'Supervisor Azul': '', 'Ejecutores Azul': _personasDeSectores(/^Operari/i).join('; '),
    'Supervisor Verde': '', 'Ejecutores Verde': _personasDeSectores(/Ingenier|I\+D|Producci/i).join('; ')
  };
}
function cfgArea(area) {
  const base = areaPorDefecto();
  const gen = (window.AREAS_CFG || []).find(function (f) { return f.Area === '*'; }) || {};
  const esp = (window.AREAS_CFG || []).find(function (f) { return f.Area === area; }) || {};
  const out = {};
  Object.keys(base).forEach(function (k) { out[k] = esp[k] || gen[k] || base[k]; });
  out.Area = area;
  return out;
}
function listaNombres(txt) { return String(txt || '').split(';').map(function (x) { return x.trim(); }).filter(String); }
function supervisorPara(area, tipo) { return cfgArea(area)['Supervisor ' + tipo] || ''; }
function ejecutoresPara(area, tipo) { return listaNombres(cfgArea(area)['Ejecutores ' + tipo]); }
function criticidadArea(area) { const c = String(cfgArea(area).Criticidad || 'B').toUpperCase(); return ['A', 'B', 'C'].indexOf(c) > -1 ? c : 'B'; }
function especialidadDe(nombre) {
  const s = sectorDe(nombre);
  if (/el[eé]ctric/i.test(s)) return 'Electrica';
  if (/mec[aá]nic/i.test(s)) return 'Mecanica';
  if (/instrument/i.test(s)) return 'Instrumentacion';
  if (/operari|producci/i.test(s)) return 'Operacion';
  return '';
}

/* ---------- Estimacion de duracion (h) y personas ----------
   1) lo cargado en la tarjeta; 2) mediana de tarjetas parecidas (mismo color y familia de anomalia);
   3) valor por defecto del color. Devuelve { v, fuente }. */
function _mediana(a) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function estadisticasEstimacion(ts) {
  const st = {};
  ts.forEach(function (t) {
    const k = t['Tipo'] + '|' + grupoCategoria(t['Categoria']);
    const h = parseFloat(t['Horas estimadas']), p = parseFloat(t['Personas necesarias']);
    st[k] = st[k] || { h: [], p: [] };
    if (h > 0) st[k].h.push(h); if (p > 0) st[k].p.push(p);
  });
  return st;
}
function duracionDe(t, st) {
  const h = parseFloat(t['Horas estimadas']);
  if (h > 0) return { v: h, fuente: 'tarjeta' };
  const e = st && st[t['Tipo'] + '|' + grupoCategoria(t['Categoria'])];
  if (e && e.h.length >= 3) return { v: _mediana(e.h), fuente: 'historial' };
  return { v: CONFIG.DURACION_DEFECTO[t['Tipo']] || 1, fuente: 'defecto' };
}
function personasDe(t, st) {
  const p = parseInt(t['Personas necesarias'], 10);
  if (p > 0) return { v: p, fuente: 'tarjeta' };
  const e = st && st[t['Tipo'] + '|' + grupoCategoria(t['Categoria'])];
  if (e && e.p.length >= 3) return { v: Math.round(_mediana(e.p)), fuente: 'historial' };
  return { v: CONFIG.PERSONAS_DEFECTO[t['Tipo']] || 1, fuente: 'defecto' };
}
function hhDe(t) { const h = parseFloat(t['Horas estimadas']) || 0, p = parseInt(t['Personas necesarias'], 10) || 1; return h * p; }

/* ---------- Criterio de prioridad para planificar ---------- */
function puntaje(t) {
  const P = CONFIG.PESOS, det = [];
  const add = function (l, v) { if (v) det.push([l, v]); };
  add('Prioridad ' + (t['Prioridad'] || 'Media'), P.prioridad[t['Prioridad'] || 'Media'] || 0);
  const g = grupoCategoria(t['Categoria']);
  if (g.indexOf('6 ') === 0) add('Seguridad', P.seguridad);
  if (g.indexOf('5 ') === 0) add('Calidad', P.calidad);
  const c = criticidadArea(t['Area equipo']); add('Área crítica ' + c, P.criticidad[c] || 0);
  if (t.repetidaDe) add('Repetida ↻', P.repetida);
  if (t.vencida) add('Vencida', P.vencida);
  add('Antigüedad ' + (t.diasAbierta || 0) + ' d', Math.min(P.antiguedadMax, Math.floor((t.diasAbierta || 0) / 3)));
  if (t['Tipo'] === 'Verde') add('Mejora (verde)', P.verde);
  return { total: det.reduce(function (s, d) { return s + d[1]; }, 0), detalle: det };
}
function textoPuntaje(p) { return p.detalle.map(function (d) { return d[0] + ' ' + (d[1] > 0 ? '+' : '') + d[1]; }).join(' · '); }

/* Lista plana de equipos para el buscador: "AREA › SUBAREA › EQUIPO" */
function listaEquipos() {
  const out = [];
  if (typeof ARBOL_EQUIPO === 'undefined') return out;
  Object.keys(ARBOL_EQUIPO).forEach(function (a) {
    const subs = ARBOL_EQUIPO[a];
    Object.keys(subs).forEach(function (s) {
      if (!subs[s].length) out.push({ area: a, sub: s, eq: '', label: a + ' › ' + s });
      subs[s].forEach(function (e) { out.push({ area: a, sub: s, eq: e, label: a + ' › ' + s + ' › ' + e }); });
    });
  });
  return out;
}

/* ============================================================
   Identidad del dispositivo (NO es autenticacion):
   quien usa este celular/PC. Se usa para "Detectado por",
   "Mis tarjetas" y para firmar los cambios en el Historial.
   ============================================================ */
function getYo() { return LS.get('tpm_yo', '') || ''; }
function setYo(n) { LS.set('tpm_yo', n || ''); pintarChipYo(); }

/* ============================================================
   Capa de datos
   ============================================================ */
async function api(action, body) {
  if (!CONFIG.API_URL) throw new Error('Falta configurar CONFIG.API_URL en comun.js (URL /exec del Apps Script).');
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action, usuario: getYo() }, body || {}))
  });
  return res.json();
}

function desdeISO(dias) {
  if (!dias) return '';
  const d = new Date(Date.now() - dias * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ---------- Cola sin conexion (solo altas de tarjetas) ---------- */
function colaLeer() { return LS.get('tpm_cola', []); }
function encolar(data) {
  const cola = colaLeer();
  cola.push(data);
  if (!LS.set('tpm_cola', cola)) {
    // sin espacio (fotos grandes): se guarda sin la foto
    data.fotoData = ''; data.notas = (data.notas ? data.notas + ' ' : '') + '[foto no guardada: sin espacio offline]';
    cola[cola.length - 1] = data;
    if (!LS.set('tpm_cola', cola)) return false;
  }
  pintarChipYo();
  return true;
}
let _enviandoCola = false;
async function enviarCola() {
  if (_enviandoCola) return 0;
  let cola = colaLeer();
  if (!cola.length) return 0;
  _enviandoCola = true; let enviadas = 0;
  try {
    while (cola.length) {
      const r = await api('crear', { data: cola[0] });
      if (!r.ok) break;
      cola.shift(); LS.set('tpm_cola', cola); enviadas++;
    }
  } catch (e) { /* sigue sin conexion */ }
  _enviandoCola = false; pintarChipYo();
  return enviadas;
}
window.addEventListener('online', function () { enviarCola(); });

/* ============================================================
   Estados y fechas
   ============================================================ */
function esAbierta(t) { return t['Estado'] === 'Abierta' || t['Estado'] === 'En proceso'; }
function esResuelta(t) { return t['Estado'] === 'Cerrada' || t['Estado'] === 'Verificada'; }
function fechaDe(v) {
  if (!v) return null;
  let s = String(v).trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function condicionDe(t) { const c = t['Condicion intervencion']; return CONDICIONES[c] ? c : 'A definir'; }
function grupoCategoria(cat) {
  if (!cat) return 'Sin categoria';
  for (const g in CATEGORIAS_TPM) if (CATEGORIAS_TPM[g].indexOf(cat) > -1) return g;
  return cat;
}
function lunesDe(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; }
function fmtCorto(d) { return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }

/* ============================================================
   Repeticiones y candidatos a Mejora Enfocada
   Marca t.repetidaDe = ID de la tarjeta anterior (mismo equipo + misma familia
   de anomalia) que se habia resuelto dentro de los ultimos DIAS_REPETICION dias.
   ============================================================ */
function claveEquipo(t) { return [t['Area equipo'] || '', t['Equipo'] || '', t['Componente/Ubicacion'] || ''].join(' › ').replace(/( › )+$/, ''); }

function marcarRepeticiones(ts) {
  const porClave = {};
  ts.slice().sort(function (a, b) { return String(a['Fecha alta']).localeCompare(String(b['Fecha alta'])); }).forEach(function (t) {
    t.repetidaDe = '';
    if (t['Estado'] === 'Anulada' || !t['Equipo']) return;
    const k = claveEquipo(t) + '|' + grupoCategoria(t['Categoria']);
    const alta = fechaDe(t['Fecha alta']);
    (porClave[k] || []).forEach(function (p) {
      const cierre = fechaDe(p['Fecha cierre']);
      if (cierre && alta && cierre <= alta && (alta - cierre) <= CONFIG.DIAS_REPETICION * 86400000) t.repetidaDe = p['ID'];
    });
    (porClave[k] = porClave[k] || []).push(t);
  });
  return ts;
}

function candidatosKaizen(ts) {
  const lim = Date.now() - 90 * 86400000, eq = {};
  ts.forEach(function (t) {
    if (t['Estado'] === 'Anulada' || !t['Equipo']) return;
    const a = fechaDe(t['Fecha alta']); if (!a || a.getTime() < lim) return;
    const k = claveEquipo(t);
    const e = eq[k] = eq[k] || { clave: k, area: t['Area equipo'], equipo: t['Equipo'], comp: t['Componente/Ubicacion'] || '', n: 0, rep: 0, abiertas: 0, cats: {} };
    e.n++; if (t.repetidaDe) e.rep++; if (esAbierta(t)) e.abiertas++;
    const g = grupoCategoria(t['Categoria']); e.cats[g] = (e.cats[g] || 0) + 1;
  });
  return Object.values(eq).filter(function (e) { return e.n >= CONFIG.UMBRAL_KAIZEN || e.rep > 0; })
    .sort(function (a, b) { return (b.rep - a.rep) || (b.n - a.n); });
}

/* ============================================================
   KPIs. "desde" (Date) define el periodo para flujos (altas, resoluciones,
   rankings). El backlog (abiertas, vencidas, aging) es siempre la foto actual.
   ============================================================ */
function calcularKPIs(tarjetas, desde) {
  const dd = desde ? desde.getTime() : 0;
  const enP = function (v) { const d = fechaDe(v); return !!d && d.getTime() >= dd; };
  const k = {
    total: 0, abiertas: 0, enProceso: 0, cerradas: 0, verificadas: 0, pendVerificar: 0, anuladas: 0,
    resueltasPeriodo: 0, vencidas: 0, pctCierre: 0, antiguedadProm: 0, tiempoCierreProm: 0,
    autonomia: 0, reaperturas: 0, reprogramadas: 0, repetidas: 0,
    porColor: { Roja: { t: 0, ab: 0 }, Azul: { t: 0, ab: 0 }, Verde: { t: 0, ab: 0 } },
    porSector: {}, porGrupo: {}, porEtapa: {}, porDetector: {}, porResolvedor: {}, porSectorDetector: {},
    porArea: {}, porAreaAbiertas: {}, porEquipo: {}, porCategoria: {},
    aging: { d7: 0, d30: 0, dmas: 0 }, detectoresUnicos: 0,
    porCondicion: { 'Maquina en marcha': { n: 0, h: 0, sinH: 0 }, 'Maquina parada': { n: 0, h: 0, sinH: 0 }, 'A definir': { n: 0, h: 0, sinH: 0 } },
    pilares: { maAzules: 0, mpDerivadas: 0, estandares: 0, calidad: 0, verdes: 0, ahorroUSD: 0, seguridad: 0 }
  };
  let sumAnt = 0, nAnt = 0, sumCierre = 0, nCierre = 0, azul = 0, roja = 0;
  tarjetas.forEach(function (t) {
    const est = t['Estado'], abierta = esAbierta(t);
    // ---- foto actual (backlog) ----
    if (est === 'Abierta') k.abiertas++;
    else if (est === 'En proceso') k.enProceso++;
    else if (est === 'Cerrada') k.pendVerificar++;
    if (t.vencida) k.vencidas++;
    const c = t['Tipo'];
    if (abierta) {
      if (k.porColor[c]) k.porColor[c].ab++;
      const pc = k.porCondicion[condicionDe(t)]; const hs = hhDe(t);
      pc.n++; if (hs > 0) pc.h += hs; else pc.sinH++;
      if (t.diasAbierta !== '') { sumAnt += t.diasAbierta; nAnt++; if (t.diasAbierta <= 7) k.aging.d7++; else if (t.diasAbierta <= 30) k.aging.d30++; else k.aging.dmas++; }
      const ar = t['Area equipo']; if (ar) k.porAreaAbiertas[ar] = (k.porAreaAbiertas[ar] || 0) + 1;
      if (Number(t['Reprogramaciones']) > 0) k.reprogramadas++;
    }
    // ---- resoluciones en el periodo ----
    if (esResuelta(t) && enP(t['Fecha cierre'])) {
      k.resueltasPeriodo++;
      if (t.diasAbierta !== '') { sumCierre += t.diasAbierta; nCierre++; }
      const rs = t['Cerrado por']; if (rs) k.porResolvedor[rs] = (k.porResolvedor[rs] || 0) + 1;
      if (t['Agregar a MP'] === 'Si') k.pilares.mpDerivadas++;
      if (t['Actualizar estandar'] === 'Si') k.pilares.estandares++;
      if (t['Tipo'] === 'Azul') k.pilares.maAzules++;
    }
    if (est === 'Verificada' && enP(t['Fecha verificacion'])) k.verificadas++;
    // ---- altas en el periodo ----
    if (!enP(t['Fecha alta'])) return;
    k.total++;
    if (est === 'Anulada') { k.anuladas++; return; }
    if (esResuelta(t)) k.cerradas++;
    if (k.porColor[c]) k.porColor[c].t++;
    if (c === 'Azul') azul++; if (c === 'Roja') roja++;
    if (c === 'Verde') { k.pilares.verdes++; k.pilares.ahorroUSD += parseFloat(t['Costo estimado']) || 0; }
    const s = t['Sector'] || '—'; k.porSector[s] = (k.porSector[s] || 0) + 1;
    const g = t['Grupo responsable'] || '—'; k.porGrupo[g] = (k.porGrupo[g] || 0) + 1;
    const et = t['Etapa MA'] || 'Sin etapa'; k.porEtapa[et] = (k.porEtapa[et] || 0) + 1;
    const det = t['Detectado por']; if (det) k.porDetector[det] = (k.porDetector[det] || 0) + 1;
    const sd = t['Sector detector'] || sectorDe(det) || 'Sin sector'; k.porSectorDetector[sd] = k.porSectorDetector[sd] || { n: 0, personas: {} };
    k.porSectorDetector[sd].n++; if (det) k.porSectorDetector[sd].personas[det] = 1;
    const ar = t['Area equipo']; if (ar) k.porArea[ar] = (k.porArea[ar] || 0) + 1;
    if (t['Equipo']) { const eqK = t['Equipo'] + (t['Componente/Ubicacion'] ? ' › ' + t['Componente/Ubicacion'] : ''); k.porEquipo[eqK] = (k.porEquipo[eqK] || 0) + 1; }
    const gc = grupoCategoria(t['Categoria']); k.porCategoria[gc] = (k.porCategoria[gc] || 0) + 1;
    if (gc.indexOf('5 ') === 0) k.pilares.calidad++;
    if (gc.indexOf('6 ') === 0) k.pilares.seguridad++;
    k.reaperturas += Number(t['Reaperturas']) || 0;
    if (t.repetidaDe) k.repetidas++;
  });
  k.detectoresUnicos = Object.keys(k.porDetector).length;
  const cerrables = k.total - k.anuladas;
  k.pctCierre = cerrables ? Math.round((k.cerradas / cerrables) * 100) : 0;
  k.antiguedadProm = nAnt ? Math.round(sumAnt / nAnt) : 0;
  k.tiempoCierreProm = nCierre ? Math.round(sumCierre / nCierre) : 0;
  k.autonomia = (azul + roja) ? Math.round(azul / (azul + roja) * 100) : 0;
  return k;
}

/* ============================================================
   Indicadores de tarjetas (Suzuki / JIPM) para un periodo:
   colocadas vs retiradas, % de retiro, promedio de generacion,
   velocidad de retiro, quien detecta y quien retira.
   ============================================================ */
function esDeOperacion(nombre) { return /operari|producci|alistamiento/i.test(sectorDe(nombre) || ''); }
function indicadoresTarjetas(ts, desde, dias) {
  const dd = desde.getTime(), semanas = Math.max(1, dias / 7), meses = Math.max(1 / 4.35, dias / 30.4);
  const nomina = Math.max(1, todasLasPersonas().length);
  const o = { colocadas: 0, retiradas: 0, pctRetiro: 0, porSemana: 0, retiradasSemana: 0, porPersonaMes: 0, participacion: 0,
    reportaron: 0, nomina: nomina, tiempoMedio: 0, mediana: 0, enPlazo: null, conCompromiso: 0, detOperacion: 0, retOperacion: 0,
    verificadas: 0, verificables: 0, pctVerificadas: 0 };
  const det = {}, tiempos = []; let enPlazo = 0, detOp = 0, retOp = 0;
  ts.forEach(function (t) {
    if (t['Estado'] === 'Anulada') return;
    const al = fechaDe(t['Fecha alta']), ci = esResuelta(t) ? fechaDe(t['Fecha cierre']) : null;
    if (al && al.getTime() >= dd) {
      o.colocadas++;
      if (t['Detectado por']) { det[t['Detectado por']] = 1; if (esDeOperacion(t['Detectado por'])) detOp++; }
    }
    if (ci && ci.getTime() >= dd) {
      o.retiradas++;
      if (al) tiempos.push((ci - al) / 86400000);
      if (t['Cerrado por'] && esDeOperacion(t['Cerrado por'])) retOp++;
      const comp = fechaDe(t['Fecha compromiso']);
      if (comp) { o.conCompromiso++; if (ci.getTime() <= comp.getTime() + 86400000) enPlazo++; }
      o.verificables++; if (t['Estado'] === 'Verificada') o.verificadas++;
    }
  });
  o.pctRetiro = o.colocadas ? Math.round(o.retiradas / o.colocadas * 100) : 0;
  o.porSemana = o.colocadas / semanas; o.retiradasSemana = o.retiradas / semanas;
  o.porPersonaMes = o.colocadas / nomina / meses;
  o.reportaron = Object.keys(det).length; o.participacion = Math.round(o.reportaron / nomina * 100);
  o.tiempoMedio = tiempos.length ? tiempos.reduce(function (a, b) { return a + b; }, 0) / tiempos.length : 0;
  o.mediana = _mediana(tiempos);
  o.enPlazo = o.conCompromiso ? Math.round(enPlazo / o.conCompromiso * 100) : null;
  o.detOperacion = o.colocadas ? Math.round(detOp / o.colocadas * 100) : 0;
  o.retOperacion = o.retiradas ? Math.round(retOp / o.retiradas * 100) : 0;
  o.pctVerificadas = o.verificables ? Math.round(o.verificadas / o.verificables * 100) : 0;
  return o;
}

/* Curva clasica de Suzuki: tarjetas colocadas y retiradas ACUMULADAS en el periodo (por semana).
   La distancia entre las dos curvas son las tarjetas que siguen colgadas. */
function serieAcumulada(ts, semanas) {
  const s = serieSemanal(ts, semanas); let c = 0, r = 0;
  return s.map(function (w) { c += w.altas; r += w.resueltas; return { label: w.label, hasta: w.hasta, colocadas: c, retiradas: r }; });
}

/* Promedio de generacion por mes: tarjetas por persona de la nomina y personas que reportaron. */
function serieMensual(ts, meses) {
  const hoy = new Date(), out = [], nomina = Math.max(1, todasLasPersonas().length);
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  for (let i = meses - 1; i >= 0; i--) {
    const a = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1), b = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1);
    out.push({ desde: a, hasta: b, label: nombres[a.getMonth()] + ' ' + String(a.getFullYear()).slice(2), n: 0, ret: 0, det: {}, parcial: i === 0 });
  }
  ts.forEach(function (t) {
    if (t['Estado'] === 'Anulada') return;
    const al = fechaDe(t['Fecha alta']), ci = esResuelta(t) ? fechaDe(t['Fecha cierre']) : null;
    out.forEach(function (m) {
      if (al && al >= m.desde && al < m.hasta) { m.n++; if (t['Detectado por']) m.det[t['Detectado por']] = 1; }
      if (ci && ci >= m.desde && ci < m.hasta) m.ret++;
    });
  });
  out.forEach(function (m) {
    // el mes en curso se proyecta al mes completo para que sea comparable
    const f = m.parcial ? Math.max(1 / 31, (hoy - m.desde) / (m.hasta - m.desde)) : 1;
    m.porPersona = m.n / nomina / f; m.personas = Object.keys(m.det).length;
  });
  return out;
}

/* Serie semanal: altas, resoluciones y backlog al cierre de cada semana (lunes a domingo). */
function serieSemanal(ts, semanas) {
  semanas = semanas || 12;
  const ini = lunesDe(new Date()); ini.setDate(ini.getDate() - 7 * (semanas - 1));
  const out = [];
  for (let i = 0; i < semanas; i++) {
    const a = new Date(ini); a.setDate(a.getDate() + 7 * i);
    const b = new Date(a); b.setDate(b.getDate() + 7);
    out.push({ desde: a, hasta: b, label: fmtCorto(a), altas: 0, resueltas: 0, backlog: 0 });
  }
  ts.forEach(function (t) {
    if (t['Estado'] === 'Anulada') return;
    const al = fechaDe(t['Fecha alta']), ci = esResuelta(t) ? fechaDe(t['Fecha cierre']) : null;
    out.forEach(function (w) {
      if (al && al >= w.desde && al < w.hasta) w.altas++;
      if (ci && ci >= w.desde && ci < w.hasta) w.resueltas++;
      if (al && al < w.hasta && (!ci || ci >= w.hasta)) w.backlog++;
    });
  });
  return out;
}

/* ============================================================
   Helpers de UI
   ============================================================ */
function colorTipo(t) { return (TIPOS[t] || {}).color || '#888'; }
function badgeTipo(t) { return '<span class="badge" style="background:' + colorTipo(t) + '">' + esc(t || '') + '</span>'; }

function badgeEstado(e, vencida) {
  let cls = 'st-abierta';
  if (e === 'Cerrada') cls = 'st-resuelta';
  else if (e === 'Verificada') cls = 'st-cerrada';
  else if (e === 'En proceso') cls = 'st-proceso';
  else if (e === 'Anulada') cls = 'st-anulada';
  let txt = ESTADO_LABEL[e] || e || '';
  if (vencida && (e === 'Abierta' || e === 'En proceso')) { cls = 'st-vencida'; txt = e + ' · vencida'; }
  return '<span class="estado ' + cls + '">' + esc(txt) + '</span>';
}

function badgeCondicion(c, largo) {
  const d = CONDICIONES[c] || CONDICIONES['A definir'];
  return '<span class="cond" style="background:' + d.soft + ';color:' + d.color + '" title="' + esc(c || 'A definir') + '">' +
    d.icono + (largo === false ? '' : ' ' + d.corto) + '</span>';
}

function badgeRepetida(t) { return t.repetidaDe ? '<span class="cond" style="background:#FDF0DC;color:#8A5A0A" title="Repite ' + esc(t.repetidaDe) + '">↻ Repetida</span>' : ''; }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function opciones(arr, sel) {
  return arr.map(function (v) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
}
function opcionesGrupos(obj, sel) {
  return Object.keys(obj).map(function (g) {
    return '<optgroup label="' + esc(g) + '">' + opciones(obj[g], sel) + '</optgroup>';
  }).join('');
}

function hoyISO() { const f = new Date(); const p = (n) => String(n).padStart(2, '0'); return f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()); }

/* Los links viejos de Drive ("uc?export=view&id=") no se ven embebidos: se pasan a miniatura. */
function fotoSrc(url) {
  if (!url) return '';
  const m = String(url).match(/[?&]id=([\w-]+)/) || String(url).match(/\/d\/([\w-]+)/);
  if (m && String(url).indexOf('drive.google.com') > -1) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
  return url;
}

/* Campo de persona con busqueda (datalist). Devuelve el nombre valido o ''. */
function montarBuscadorPersona(input, valorInicial) {
  let dl = document.getElementById('dl-personas');
  if (!dl) {
    dl = document.createElement('datalist'); dl.id = 'dl-personas';
    dl.innerHTML = todasLasPersonas().map(function (n) { return '<option value="' + esc(n) + '">' + esc(sectorDe(n)) + '</option>'; }).join('');
    document.body.appendChild(dl);
  }
  input.setAttribute('list', 'dl-personas'); input.setAttribute('autocomplete', 'off');
  if (valorInicial) input.value = valorInicial;
}
function personaValida(n) { return !!n && todasLasPersonas().indexOf(n) > -1; }

/* Reduce la foto (max 1024px, JPEG) y devuelve un dataURL. */
function comprimirImagen(file, maxLado, calidad) {
  maxLado = maxLado || 1024; calidad = calidad || 0.7;
  return new Promise(function (resolve, reject) {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onerror = function () { reject(new Error('No se pudo leer la imagen')); };
    reader.onload = function (e) {
      const img = new Image();
      img.onerror = function () { reject(new Error('Imagen invalida')); };
      img.onload = function () {
        let w = img.width, h = img.height;
        if (w > h && w > maxLado) { h = Math.round(h * maxLado / w); w = maxLado; }
        else if (h > maxLado) { w = Math.round(w * maxLado / h); h = maxLado; }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', calidad));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* grafico semanal en SVG: barras abiertas/resueltas + linea de backlog */
function graficoSemanal(serie){
  var W = 900, H = 260, pl = 58, pr = 52, pt = 16, pb = 40;
  var maxB = Math.max.apply(null, serie.map(function(s){ return Math.max(s.altas, s.resueltas); }).concat([1]));
  var maxL = Math.max.apply(null, serie.map(function(s){ return s.backlog; }).concat([1]));
  var iw = (W - pl - pr) / serie.length, bw = Math.max(3, Math.min(16, iw * 0.34));
  var y = function(v){ return pt + (H - pt - pb) * (1 - v / maxB); };
  var yl = function(v){ return pt + (H - pt - pb) * (1 - v / maxL); };
  var s = '<svg viewBox="0 0 '+W+' '+H+'" class="svgchart" role="img" aria-label="Apertura y cierre semanal">';
  [0, .5, 1].forEach(function(f){ var v = Math.round(maxB * f); s += '<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(v)+'" y2="'+y(v)+'" class="grid"/><text x="'+(pl-6)+'" y="'+(y(v)+4)+'" text-anchor="end" class="ax">'+v+'</text>'; });
  s += '<text x="'+(W-pr+6)+'" y="'+(yl(maxL)+4)+'" class="ax" fill="#B8402A">'+maxL+'</text>';
  var pts = [];
  serie.forEach(function(w, i){
    var cx = pl + iw * i + iw / 2;
    s += '<rect x="'+(cx-bw-1)+'" y="'+y(w.altas)+'" width="'+bw+'" height="'+(H-pb-y(w.altas))+'" rx="2" fill="#8FA7D6"><title>Semana '+w.label+': '+w.altas+' abiertas</title></rect>';
    s += '<rect x="'+(cx+1)+'" y="'+y(w.resueltas)+'" width="'+bw+'" height="'+(H-pb-y(w.resueltas))+'" rx="2" fill="#548235"><title>Semana '+w.label+': '+w.resueltas+' resueltas</title></rect>';
    pts.push([cx, yl(w.backlog), w]);
    if (serie.length <= 16 || i % Math.ceil(serie.length / 13) === 0) s += '<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle" class="ax">'+w.label+'</text>';
  });
  s += '<polyline fill="none" stroke="#B8402A" stroke-width="2.5" points="'+pts.map(function(p){ return p[0]+','+p[1]; }).join(' ')+'"/>';
  pts.forEach(function(p){ s += '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.5" fill="#fff" stroke="#B8402A" stroke-width="2"><title>Backlog al '+fmtCorto(new Date(p[2].hasta - 86400000))+': '+p[2].backlog+'</title></circle>'; });
  return s + '</svg>';
}


/* ============================================================
   Barra superior comun: navegacion, "quien soy" y cola pendiente
   ============================================================ */
const NAV = [
  ['index.html', 'Inicio'], ['formulario.html', 'Cargar'], ['mis-tarjetas.html', 'Mis tarjetas'],
  ['seguimiento.html', 'Seguimiento'], ['planificacion.html', 'Planificación'], ['dashboard.html', 'Dashboard'], ['como-funciona.html', 'Cómo funciona']
];

function pintarChipYo() {
  const f = document.getElementById('flag'); if (!f) return;
  const yo = getYo(), n = colaLeer().length;
  f.innerHTML = (n ? '<span class="chip warn" title="Tarjetas guardadas sin conexión">⏳ ' + n + ' sin enviar</span> ' : '') +
    '<span class="chip" id="chipYo" title="Quién usa este dispositivo (no es contraseña)">👤 ' + (yo ? esc(yo.split(',')[0]) : 'Identificate') + '</span>';
  document.getElementById('chipYo').onclick = abrirQuienSoy;
}

function abrirQuienSoy() {
  let m = document.getElementById('mYo');
  if (!m) {
    m = document.createElement('div'); m.className = 'modal-bg'; m.id = 'mYo';
    m.innerHTML = '<div class="modal" style="max-width:420px"><h3>¿Quién usa este dispositivo?</h3>' +
      '<p class="sub" style="margin:4px 0 8px">Queda recordado acá. Se usa para cargar tus tarjetas, mostrarte las tuyas y registrar quién hace cada cambio. No es una contraseña.</p>' +
      '<input id="yoInput" placeholder="Escribí tu apellido..."><div id="yoErr" class="sub" style="color:#8A2E1C;margin:6px 0 0"></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="yoOk">Guardar</button><button class="btn sec" id="yoCancel">Cancelar</button></div></div>';
    document.body.appendChild(m);
    montarBuscadorPersona(document.getElementById('yoInput'));
    document.getElementById('yoCancel').onclick = function () { m.classList.remove('show'); };
    document.getElementById('yoOk').onclick = function () {
      const v = document.getElementById('yoInput').value.trim();
      if (!personaValida(v)) { document.getElementById('yoErr').textContent = 'Elegí un nombre de la lista.'; return; }
      setYo(v); m.classList.remove('show');
      document.dispatchEvent(new CustomEvent('tpm-yo', { detail: v }));
    };
  }
  document.getElementById('yoInput').value = getYo();
  document.getElementById('yoErr').textContent = '';
  m.classList.add('show');
  setTimeout(function () { document.getElementById('yoInput').focus(); }, 50);
}

document.addEventListener('DOMContentLoaded', function () {
  const nav = document.querySelector('.topbar nav');
  if (nav && !nav.hasAttribute('data-fija')) {
    const aqui = (location.pathname.split('/').pop() || 'index.html');
    nav.innerHTML = NAV.map(function (n) { return '<a href="' + n[0] + '"' + (n[0] === aqui ? ' class="activo"' : '') + '>' + n[1] + '</a>'; }).join('') + '<span id="flag"></span>';
  }
  pintarChipYo();
  enviarCola();
  refrescarMaestros();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
});
