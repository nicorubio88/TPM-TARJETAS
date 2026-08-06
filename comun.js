/* ============================================================
   SISTEMA DE TARJETAS TPM — Planta Tornquist
   comun.js  ·  configuracion, catalogos, capa de datos y helpers
   Compartido por index / formulario / dashboard / seguimiento
   ============================================================ */

const CONFIG = {
  /* ╔══════════════════════════════════════════════════════════════╗
     ║  PEGÁ AQUÍ LA URL /exec DE TU APPS SCRIPT (entre las comillas) ║
     ║  Ej: 'https://script.google.com/macros/s/AKfy.../exec'        ║
     ╚══════════════════════════════════════════════════════════════╝
     Esta versión guarda SIEMPRE en la nube (Google Sheet); se ve desde
     cualquier dispositivo. Si esta URL queda vacía, la app avisa que
     falta configurarla (ya no usa datos locales). */
  API_URL: 'https://script.google.com/macros/s/AKfycbxUYpbmGe-T0Rc-jD0dxkzdAnwOzop9ikIvajMgxDRa5gj33a5ErLSkbNTar4kNkJkN/exec',
  PLANTA: 'Tornquist'
};

/* -------------------- Catalogos -------------------- */

const TIPOS = {
  Roja:  { color: '#C0392B', grupo: 'Mantenimiento',   desc: 'Requiere expertise tecnica — la resuelve mantenimiento (electrico, mecanico, instrumentista).' },
  Azul:  { color: '#2D6CB5', grupo: 'Operacion',       desc: 'Baja complejidad tecnica — la resuelve el operador del sector.' },
  Verde: { color: '#4E9A2F', grupo: 'Mejora Enfocada', desc: 'Es una mejora — la puede resolver cualquiera, va al pipeline de Mejora Enfocada.' }
};

/* NOTA: la constante SECTORES (23 sectores de proceso) fue eliminada.
   Era codigo muerto de una version anterior al arbol de equipos y no se
   usaba en ninguna pantalla. La ubicacion fisica sale de ARBOL_EQUIPO
   (arbol.js) y el sector organizacional de la persona sale de
   PERSONAS_POR_SECTOR (personas.js). Ver AUDITORIA-DATOS.md */


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

/* -------------------- Capa de datos (nube) -------------------- */

async function api(action, body) {
  if (!CONFIG.API_URL) {
    throw new Error('Falta configurar CONFIG.API_URL en comun.js (URL /exec del Apps Script).');
  }
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, body || {}))
  });
  return res.json();
}

/* -------------------- KPIs (calculo en cliente) -------------------- */

function calcularKPIs(tarjetas) {
  const k = {
    total: tarjetas.length, abiertas: 0, enProceso: 0, cerradas: 0, anuladas: 0,
    vencidas: 0, pctCierre: 0, antiguedadProm: 0, tiempoCierreProm: 0,
    porColor: { Roja: { t: 0, ab: 0 }, Azul: { t: 0, ab: 0 }, Verde: { t: 0, ab: 0 } },
    porSector: {}, porGrupo: {}, porEtapa: {}, porDetector: {}, porArea: {}, porEquipo: {},
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
    const ar = t['Area equipo']; if (ar) k.porArea[ar] = (k.porArea[ar] || 0) + 1;
    if (t['Equipo']) {
      const eqK = t['Equipo'] + (t['Componente/Ubicacion'] ? ' › ' + t['Componente/Ubicacion'] : '');
      k.porEquipo[eqK] = (k.porEquipo[eqK] || 0) + 1;
    }
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
