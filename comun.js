/* ============================================================
   SISTEMA DE TARJETAS TPM — Planta Tornquist
   comun.js  ·  configuracion, catalogos, capa de datos y helpers
   Compartido por index / formulario / dashboard / seguimiento
   ============================================================ */

const CONFIG = {
  /* Pega aca la URL /exec de tu Apps Script para usar Google Sheet.
     Si la dejas vacia, la app funciona en MODO DEMO con datos locales
     del navegador (localStorage), ideal para probar antes de publicar. */
  API_URL: 'https://script.google.com/macros/s/AKfycbxUYpbmGe-T0Rc-jD0dxkzdAnwOzop9ikIvajMgxDRa5gj33a5ErLSkbNTar4kNkJkN/exec',
  PLANTA: 'Tornquist'
};

const DEMO = !CONFIG.API_URL;
const DEMO_KEY = 'tarjetasTPM_demo';

/* -------------------- Catalogos -------------------- */

const TIPOS = {
  Roja:  { color: '#C0392B', grupo: 'Mantenimiento',   desc: 'Requiere expertise tecnica — la resuelve mantenimiento (electrico, mecanico, instrumentista).' },
  Azul:  { color: '#2D6CB5', grupo: 'Operacion',       desc: 'Baja complejidad tecnica — la resuelve el operador del sector.' },
  Verde: { color: '#4E9A2F', grupo: 'Mejora Enfocada', desc: 'Es una mejora — la puede resolver cualquiera, va al pipeline de Mejora Enfocada.' }
};

const SECTORES = [
  'Pulper', 'Planta de Pasta', 'Mesas-Prensas', 'Secado', 'Estucado', 'Pope-Sexta',
  'Caldera', 'Efluente Primario', 'Efluente Secundario', 'Laboratorio', 'Cellier',
  'Rebobinadora', 'Alistado', 'Cortadora', 'Despacho',
  'MP Fibrosa', 'MP Cellier', 'MP Quimicos', 'Sector Camiones',
  'Mantenimiento Electrico', 'Mantenimiento Icopro', 'Mantenimiento Mecanico',
  'Administracion / Oficinas'
];

const TURNOS = ['A', 'B', 'C', 'D'];
const PRIORIDADES = ['Alta', 'Media', 'Baja'];
const ESTADOS = ['Abierta', 'En proceso', 'Cerrada', 'Anulada'];

/* Categorias de anomalia (Mantenimiento Autonomo) para rojas y azules */
const CATEGORIAS_ANOMALIA = [
  'Suciedad / contaminacion',
  'Lubricacion deficiente',
  'Ajuste / apriete flojo',
  'Lugar de dificil acceso',
  'Foco de suciedad / fuga',
  'Desgaste / deterioro',
  'Anomalia electrica / instrumentacion',
  'Ruido / vibracion anormal',
  'Condicion insegura',
  'Defecto que afecta calidad',
  'Elemento innecesario / fuera de lugar'
];

/* Tipos de mejora para tarjetas verdes */
const TIPOS_MEJORA = [
  'Seguridad', 'Calidad', 'Productividad', 'Costo',
  'Ergonomia', 'Medio Ambiente', 'Facilidad de operacion / limpieza'
];

/* -------------------- Capa de datos -------------------- */

async function api(action, body) {
  if (DEMO) return demoApi(action, body || {});
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, body || {}))
  });
  return res.json();
}

/* Modo demo: replica la logica del backend usando localStorage */
function demoLeer_() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || []; } catch (e) { return []; } }
function demoGuardar_(arr) { localStorage.setItem(DEMO_KEY, JSON.stringify(arr)); }

function demoApi(action, p) {
  let arr = demoLeer_();
  const hoy = new Date();
  if (action === 'crear') {
    const d = p.data || p;
    if (['Roja', 'Azul', 'Verde'].indexOf(d.tipo) === -1) return { ok: false, error: 'Tipo invalido' };
    const grupo = TIPOS[d.tipo].grupo;
    const id = demoId_(d.tipo);
    arr.push({
      'ID': id, 'Fecha alta': fmtNow_(), 'Tipo': d.tipo, 'Grupo responsable': grupo,
      'Detectado por': d.detectadoPor || '', 'Turno': d.turno || '', 'Sector': d.sector || '',
      'Equipo': d.equipo || '', 'Componente/Ubicacion': d.componente || '', 'Categoria': d.categoria || '',
      'Descripcion': d.descripcion || '', 'Prioridad': d.prioridad || 'Media', 'Foto URL': d.fotoUrl || '',
      'Responsable asignado': d.responsable || '', 'Fecha compromiso': d.fechaCompromiso || '',
      'Estado': 'Abierta', 'Fecha cierre': '', 'Accion de cierre': '', 'Costo estimado': d.costo || '', 'Notas': d.notas || ''
    });
    demoGuardar_(arr);
    return { ok: true, id: id, grupo: grupo };
  }
  if (action === 'listar') {
    return { ok: true, tarjetas: arr.map(function (o) { return demoCalc_(o, hoy); }) };
  }
  if (action === 'actualizar') {
    const t = arr.find(function (x) { return x['ID'] === p.id; });
    if (!t) return { ok: false, error: 'No encontrada' };
    const mapa = { responsable: 'Responsable asignado', fechaCompromiso: 'Fecha compromiso', estado: 'Estado', prioridad: 'Prioridad', notas: 'Notas', categoria: 'Categoria' };
    Object.keys(p.cambios || {}).forEach(function (k) { if (mapa[k]) t[mapa[k]] = p.cambios[k]; });
    demoGuardar_(arr);
    return { ok: true, id: p.id };
  }
  if (action === 'cerrar') {
    const t = arr.find(function (x) { return x['ID'] === p.id; });
    if (!t) return { ok: false, error: 'No encontrada' };
    if (!p.accion) return { ok: false, error: 'Falta accion de cierre' };
    t['Estado'] = 'Cerrada'; t['Fecha cierre'] = fmtNow_(); t['Accion de cierre'] = p.accion;
    if (p.costo) t['Costo estimado'] = p.costo;
    demoGuardar_(arr);
    return { ok: true, id: p.id };
  }
  return { ok: true };
}

function demoCalc_(o, hoy) {
  const r = Object.assign({}, o);
  const alta = new Date(String(o['Fecha alta']).replace(' ', 'T'));
  const cierre = o['Fecha cierre'] ? new Date(String(o['Fecha cierre']).replace(' ', 'T')) : null;
  const fin = cierre || hoy;
  r.diasAbierta = isNaN(alta) ? '' : Math.max(0, Math.round((fin - alta) / 86400000));
  const comp = o['Fecha compromiso'] ? new Date(String(o['Fecha compromiso']).replace(' ', 'T')) : null;
  r.vencida = !!(comp && o['Estado'] !== 'Cerrada' && o['Estado'] !== 'Anulada' && comp < hoy);
  return r;
}

function demoId_(tipo) {
  const pref = { Roja: 'ROJ', Azul: 'AZU', Verde: 'VER' }[tipo];
  const f = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const fecha = String(f.getFullYear()).slice(2) + p(f.getMonth() + 1) + p(f.getDate()) + '-' + p(f.getHours()) + p(f.getMinutes());
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rnd = ''; for (let i = 0; i < 3; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pref + '-' + fecha + '-' + rnd;
}

function fmtNow_() {
  const f = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()) + ' ' + p(f.getHours()) + ':' + p(f.getMinutes());
}

/* -------------------- KPIs (calculo en cliente) -------------------- */

function calcularKPIs(tarjetas) {
  const k = {
    total: tarjetas.length, abiertas: 0, enProceso: 0, cerradas: 0, anuladas: 0,
    vencidas: 0, pctCierre: 0, antiguedadProm: 0, tiempoCierreProm: 0,
    porColor: { Roja: { t: 0, ab: 0 }, Azul: { t: 0, ab: 0 }, Verde: { t: 0, ab: 0 } },
    porSector: {}, porGrupo: {}
  };
  let sumAnt = 0, nAnt = 0, sumCierre = 0, nCierre = 0;
  tarjetas.forEach(function (t) {
    const est = t['Estado'];
    if (est === 'Abierta') k.abiertas++;
    else if (est === 'En proceso') k.enProceso++;
    else if (est === 'Cerrada') k.cerradas++;
    else if (est === 'Anulada') k.anuladas++;
    if (t.vencida) k.vencidas++;
    const c = t['Tipo']; if (k.porColor[c]) { k.porColor[c].t++; if (est === 'Abierta' || est === 'En proceso') k.porColor[c].ab++; }
    const s = t['Sector'] || '—'; k.porSector[s] = (k.porSector[s] || 0) + 1;
    const g = t['Grupo responsable'] || '—'; k.porGrupo[g] = (k.porGrupo[g] || 0) + 1;
    if (est === 'Abierta' || est === 'En proceso') { if (t.diasAbierta !== '') { sumAnt += t.diasAbierta; nAnt++; } }
    if (est === 'Cerrada' && t.diasAbierta !== '') { sumCierre += t.diasAbierta; nCierre++; }
  });
  const cerrables = k.total - k.anuladas;
  k.pctCierre = cerrables ? Math.round((k.cerradas / cerrables) * 100) : 0;
  k.antiguedadProm = nAnt ? Math.round(sumAnt / nAnt) : 0;
  k.tiempoCierreProm = nCierre ? Math.round(sumCierre / nCierre) : 0;
  return k;
}

/* -------------------- Helpers UI -------------------- */

function colorTipo(t) { return (TIPOS[t] || {}).color || '#888'; }

function badgeTipo(t) {
  return '<span class="badge" style="background:' + colorTipo(t) + '">' + (t || '') + '</span>';
}

function badgeEstado(e, vencida) {
  let cls = 'st-abierta';
  if (e === 'Cerrada') cls = 'st-cerrada';
  else if (e === 'En proceso') cls = 'st-proceso';
  else if (e === 'Anulada') cls = 'st-anulada';
  let txt = e || '';
  if (vencida && (e === 'Abierta' || e === 'En proceso')) { cls = 'st-vencida'; txt = e + ' · vencida'; }
  return '<span class="estado ' + cls + '">' + txt + '</span>';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function opciones(arr, sel) {
  return arr.map(function (v) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
}

function hoyISO() { const f = new Date(); const p = (n) => String(n).padStart(2, '0'); return f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()); }
