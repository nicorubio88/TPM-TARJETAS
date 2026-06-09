/* ============================================================
   SISTEMA DE TARJETAS TPM — Planta Tornquist
   comun.js  ·  configuracion, catalogos, capa de datos y helpers
   Compartido por index / formulario / dashboard / seguimiento
   ============================================================ */

const CONFIG = {
  /* Pega aca la URL /exec de tu Apps Script para usar Google Sheet.
     Si la dejas vacia, la app funciona en MODO DEMO con datos locales
     del navegador (localStorage), ideal para probar antes de publicar. */
  API_URL: '',
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

/* Categorias de anomalia = los 7 fuguai del Mantenimiento Autonomo, agrupados.
   Aplican a cualquier color (describen QUE se encontro). */
const CATEGORIAS_TPM = {
  '1 · Condicion basica incumplida': [
    'Suciedad / falta de limpieza',
    'Lubricacion deficiente',
    'Ajuste / apriete flojo'
  ],
  '2 · Foco de contaminacion (fuente)': [
    'Fuga (aceite / aire / agua / vapor)',
    'Fuente de polvo / viruta / particulas',
    'Derrame / dispersion de material'
  ],
  '3 · Lugar de dificil acceso': [
    'Dificil limpieza',
    'Dificil lubricacion',
    'Dificil inspeccion',
    'Dificil operacion / ajuste'
  ],
  '4 · Deterioro / pequena deficiencia': [
    'Desgaste / juego / holgura',
    'Ruido / vibracion / sobretemperatura',
    'Anomalia electrica / instrumentacion',
    'Grieta / deformacion / corrosion'
  ],
  '5 · Defecto de calidad': [
    'Contaminacion / cuerpo extrano que afecta calidad'
  ],
  '6 · Seguridad': [
    'Condicion insegura'
  ],
  '7 · MUDA': [
    'Elemento innecesario / fuera de lugar'
  ]
};

/* Etapa del pilar de Mantenimiento Autonomo a la que responde la tarjeta */
const ETAPAS_MA = [
  'Paso 1 · Restaurar condiciones',
  'Paso 2 · Eliminar focos / facilitar acceso',
  'Paso 3 · Estandarizar (LILA)'
];

/* Etapa sugerida segun el grupo de la categoria (el usuario puede cambiarla) */
const ETAPA_SUGERIDA = {
  '1 · Condicion basica incumplida': 'Paso 1 · Restaurar condiciones',
  '4 · Deterioro / pequena deficiencia': 'Paso 1 · Restaurar condiciones',
  '2 · Foco de contaminacion (fuente)': 'Paso 2 · Eliminar focos / facilitar acceso',
  '3 · Lugar de dificil acceso': 'Paso 2 · Eliminar focos / facilitar acceso'
};

/* Dimension de la mejora (solo tarjetas verdes) */
const DIMENSIONES_MEJORA = [
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
      'Estado': 'Abierta', 'Fecha cierre': '', 'Accion de cierre': '', 'Costo estimado': d.costo || '', 'Notas': d.notas || '',
      'Etapa MA': d.etapaMa || '', 'Dimension mejora': d.dimensionMejora || ''
    });
    // en demo, la foto (dataURL) se guarda directo como Foto URL
    if (d.fotoData) arr[arr.length - 1]['Foto URL'] = d.fotoData;
    demoGuardar_(arr);
    return { ok: true, id: id, grupo: grupo };
  }
  if (action === 'listar') {
    return { ok: true, tarjetas: arr.map(function (o) { return demoCalc_(o, hoy); }) };
  }
  if (action === 'actualizar') {
    const t = arr.find(function (x) { return x['ID'] === p.id; });
    if (!t) return { ok: false, error: 'No encontrada' };
    const mapa = { responsable: 'Responsable asignado', fechaCompromiso: 'Fecha compromiso', estado: 'Estado', prioridad: 'Prioridad', notas: 'Notas', categoria: 'Categoria', etapaMa: 'Etapa MA' };
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
    porSector: {}, porGrupo: {}, porEtapa: {}, porDetector: {},
    aging: { d7: 0, d30: 0, dmas: 0 }, detectoresUnicos: 0
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
    const et = t['Etapa MA'] || 'Sin etapa'; k.porEtapa[et] = (k.porEtapa[et] || 0) + 1;
    const det = t['Detectado por']; if (det) k.porDetector[det] = (k.porDetector[det] || 0) + 1;
    if (est === 'Abierta' || est === 'En proceso') {
      if (t.diasAbierta !== '') {
        sumAnt += t.diasAbierta; nAnt++;
        if (t.diasAbierta <= 7) k.aging.d7++; else if (t.diasAbierta <= 30) k.aging.d30++; else k.aging.dmas++;
      }
    }
    if (est === 'Cerrada' && t.diasAbierta !== '') { sumCierre += t.diasAbierta; nCierre++; }
  });
  k.detectoresUnicos = Object.keys(k.porDetector).length;
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

function opcionesGrupos(obj, sel) {
  return Object.keys(obj).map(function (g) {
    const items = obj[g].map(function (v) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
    return '<optgroup label="' + esc(g) + '">' + items + '</optgroup>';
  }).join('');
}

function hoyISO() { const f = new Date(); const p = (n) => String(n).padStart(2, '0'); return f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()); }

/* Lee una foto del input, la reduce (max 1024px, JPEG) y devuelve un dataURL.
   Mantiene el peso bajo para subir a Drive o guardar en demo. */
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
