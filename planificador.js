/* ============================================================
   SISTEMA DE TARJETAS TPM — Planta Tornquist
   planificador.js · planificacion automatica estimada
   Requiere comun.js. Sin dependencias externas.

   CRITERIO
   1. Se calcula el puntaje de cada tarjeta abierta (ver puntaje() en comun.js):
      prioridad + seguridad + calidad + criticidad del area + repeticion + vencida + antiguedad.
   2. Se ordenan de mayor a menor puntaje.
   3. Duracion y personas: lo cargado en la tarjeta, o la mediana de tarjetas parecidas, o un valor por defecto.
   4. Ejecutores: SOLO el equipo del "Area responsable" de la tarjeta (config.html > Areas que resuelven).
      - modo 'equipo' (rojas): se eligen N tecnicos del area; primero el responsable asignado, despues
        los de la especialidad pedida y los menos cargados.
      - modo 'supervisor' (azules/verdes): la tarjeta va a UN supervisor (el responsable si ya tiene,
        si no el menos cargado); consume duracion x personas de la capacidad de su gente.
      Siempre se puede fijar a mano otra persona.
   5. MARCHA: cada persona tiene HORAS_DIA_TARJETAS por dia; la tarjeta va al primer dia en que
      N personas pueden terminarla (si dura mas que un dia, sigue los dias siguientes).
   6. PARADA: dentro de la ventana de la parada (duracion en horas) cada tarjeta arranca cuando
      sus N ejecutores estan libres; si no termina antes del fin de la parada, "no entra".
   ============================================================ */

function _ordenarPool(pool, t, libre, preferido, espSug) {
  const esp = t['Especialidad'] || espSug || '';
  return pool.slice().sort(function (a, b) {
    const pa = a === preferido ? 0 : 1, pb = b === preferido ? 0 : 1;
    const ea = esp && especialidadDe(a) === esp ? 0 : 1, eb = esp && especialidadDe(b) === esp ? 0 : 1;
    return (pa - pb) || (ea - eb) || (libre(b) - libre(a)) || a.localeCompare(b);
  });
}

/* Pool de ejecutores de la tarjeta: los fijados a mano, o los del area y color.
   Si la tarjeta pide una especialidad y hay suficientes de esa especialidad, solo ellos. */
function _poolPara(x, fijos) {
  if (fijos[x.id] && fijos[x.id].length) return fijos[x.id].slice();
  const pool = ejecutoresPara(x.t), esp = x.t['Especialidad'] || x.espSug, resp = x.t['Responsable asignado'];
  if (x.modo === 'supervisor') return (resp && pool.indexOf(resp) > -1) ? [resp] : pool;
  if (resp && pool.indexOf(resp) > -1) {   // el responsable elegido va primero
    x.preferido = resp;
  }
  if (esp) {
    const m = pool.filter(function (p) { return especialidadDe(p) === esp; });
    if (m.length >= x.n) return m;
  }
  return pool;
}

/* Parada objetivo vigente: una parada que ya paso y la tarjeta sigue abierta = no se hizo, vuelve a planificarse. */
function paradaVigente(t) { const p = String(t['Parada objetivo'] || '').slice(0, 10); return p && p >= hoyISO() ? p : ''; }
function paradaVencida(t) { const p = String(t['Parada objetivo'] || '').slice(0, 10); return p && p < hoyISO() ? p : ''; }

function _tarjetasPlanificables(ts, opts) {
  return ts.filter(function (t) {
    if (!esAbierta(t)) return false;
    if (t['Tipo'] === 'Verde' && !opts.incluirVerdes) return false;
    if (opts.area && t['Area equipo'] !== opts.area) return false;
    if (opts.areaResp && areaRespDe(t) !== opts.areaResp) return false;
    return true;
  });
}

function _enriquecer(t, st) {
  const d = duracionDe(t, st), p = personasDe(t, st), pt = puntaje(t), modo = modoDe(t), est = estimarPorHistorial(t, st);
  return { t: t, id: t['ID'], dur: d.v, durFuente: d.fuente, n: p.v, nFuente: p.fuente, pts: pt.total, ptsTxt: textoPuntaje(pt),
    est: est, espSug: t['Especialidad'] ? '' : est.especialidad, repSug: t['Repuestos'] ? '' : est.repuestos.join(', '),
    modo: modo, areaResp: areaRespDe(t),
    // en modo supervisor se asigna 1 persona (el supervisor) que consume duracion x personas de su gente
    nAsig: modo === 'supervisor' ? 1 : p.v, horasPorAsig: modo === 'supervisor' ? d.v * p.v : d.v };
}

/* ---------------- MAQUINA EN MARCHA ---------------- */
function diasHabiles(n, findes) {
  const out = []; const d = new Date(); d.setHours(0, 0, 0, 0);
  while (out.length < n) {
    const dow = d.getDay();
    if (findes || (dow !== 0 && dow !== 6)) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* Horas por dia para tarjetas: las de su area responsable (config); si no figura, por especialidad. */
function capacidadDiaria(nombre) {
  const a = areasResponsables().find(function (r) { return listaNombres(r.Personas).indexOf(nombre) > -1; });
  if (a && a.HorasDia) return a.HorasDia;
  const e = especialidadDe(nombre);
  if (e === 'Mecanica' || e === 'Electrica' || e === 'Instrumentacion') return CONFIG.HORAS_DIA_TARJETAS.Roja;
  if (e === 'Operacion') return CONFIG.HORAS_DIA_TARJETAS.Azul;
  return CONFIG.HORAS_DIA_TARJETAS.Verde;
}

function planificarMarcha(ts, opts) {
  opts = opts || {};
  const D = opts.dias || 10, fijos = opts.fijos || {};
  const st = estadisticasEstimacion(ts, opts.hist);
  const dias = diasHabiles(D, opts.findes);
  const cand = _tarjetasPlanificables(ts, opts).filter(function (t) {
    const c = condicionDe(t);
    if (paradaVigente(t)) return false;   // ya va a una parada futura
    return c === 'Maquina en marcha' || (c === 'A definir' && opts.incluirADefinir);
  }).map(function (t) { return _enriquecer(t, st); }).sort(function (a, b) { return (b.pts - a.pts) || (b.t.diasAbierta - a.t.diasAbierta); });

  const cap = {};
  const capDe = function (p) { if (!cap[p]) { const c = capacidadDiaria(p); cap[p] = dias.map(function () { return c; }); } return cap[p]; };
  const libreTotal = function (p) { return capDe(p).reduce(function (s, x) { return s + x; }, 0); };

  const asignadas = [], sinCapacidad = [], sinGente = [];
  cand.forEach(function (x) {
    const pool = _poolPara(x, fijos);
    if (!pool.length) { sinGente.push(x); return; }
    const n = Math.min(x.nAsig, pool.length); x.faltan = x.nAsig - n;
    const H = x.horasPorAsig;
    let hecho = false;
    for (let d = 0; d < D && !hecho; d++) {
      const opciones = _ordenarPool(pool, x.t, libreTotal, x.preferido, x.espSug).map(function (p) {
        const c = capDe(p); if (c[d] <= 0) return null;
        let resta = H, k = d;
        while (k < D && resta > 1e-9) { resta -= c[k]; k++; }
        return resta > 1e-9 ? null : { p: p, fin: k - 1 };
      }).filter(Boolean);
      // estables: el orden de _ordenarPool desempata
      opciones.sort(function (a, b) { return (a.fin - b.fin) || ((a.p === x.preferido ? 0 : 1) - (b.p === x.preferido ? 0 : 1)); });
      if (opciones.length < n) continue;
      const elegidos = opciones.slice(0, n);
      x.tramos = [];   // para el Gantt: persona, dia y horas de cada tramo
      elegidos.forEach(function (o) {
        const c = capDe(o.p); let resta = H, k = d;
        while (resta > 1e-9) { const u = Math.min(c[k], resta); if (u > 1e-9) x.tramos.push({ p: o.p, d: k, h: u }); c[k] -= u; resta -= u; k++; }
      });
      x.dia = d; x.fin = Math.max.apply(null, elegidos.map(function (o) { return o.fin; }));
      x.fecha = dias[d]; x.fechaFin = dias[x.fin]; x.ejecutores = elegidos.map(function (o) { return o.p; });
      x.hh = x.dur * x.n; hecho = true;
      asignadas.push(x);
    }
    if (!hecho) sinCapacidad.push(x);
  });

  const carga = {};
  Object.keys(cap).forEach(function (p) {
    const total = capacidadDiaria(p) * D, libre = cap[p].reduce(function (s, v) { return s + v; }, 0);
    if (total - libre > 0) carga[p] = { usado: total - libre, total: total };
  });
  const aDefinir = _tarjetasPlanificables(ts, opts).filter(function (t) { return condicionDe(t) === 'A definir'; }).length;
  return { tipo: 'marcha', dias: dias, asignadas: asignadas, sinCapacidad: sinCapacidad, sinGente: sinGente, carga: carga, aDefinir: aDefinir };
}

/* ---------------- MAQUINA PARADA ---------------- */
function planificarParada(ts, parada, opts) {
  opts = opts || {};
  const fijos = opts.fijos || {};
  const W = parseFloat(parada && parada.duracion) || 8;
  const st = estadisticasEstimacion(ts, opts.hist);
  const cand = _tarjetasPlanificables(ts, opts).filter(function (t) {
    const c = condicionDe(t), pv = paradaVigente(t);
    if (parada && pv && pv !== parada.fecha) return false;   // asignada a otra parada futura
    return c === 'Maquina parada' || (c === 'A definir' && opts.incluirADefinir) || (parada && pv === parada.fecha);
  }).map(function (t) { return _enriquecer(t, st); })
    .sort(function (a, b) {
      // primero las ya asignadas a esta parada, despues por puntaje
      // 1) las ya asignadas a esta parada, 2) las que quedaron de una parada anterior, 3) por puntaje
      const rango = function (x) { return parada && paradaVigente(x.t) === parada.fecha ? 0 : paradaVencida(x.t) ? 1 : 2; };
      return (rango(a) - rango(b)) || (b.pts - a.pts);
    });

  const libre = {};
  const libreDe = function (p) { return libre[p] || 0; };
  const asignadas = [], noEntran = [], sinGente = [];
  cand.forEach(function (x) {
    const pool = _poolPara(x, fijos);
    if (!pool.length) { sinGente.push(x); return; }
    const n = Math.min(x.nAsig, pool.length); x.faltan = x.nAsig - n;
    const orden = pool.slice().sort(function (a, b) { return ((a === x.preferido ? 0 : 1) - (b === x.preferido ? 0 : 1)) || (libreDe(a) - libreDe(b)) || a.localeCompare(b); });
    const elegidos = orden.slice(0, n);
    const ini = Math.max.apply(null, elegidos.map(libreDe)), fin = ini + x.dur;
    if (fin > W + 1e-9) { noEntran.push(x); return; }
    elegidos.forEach(function (p) { libre[p] = fin; });
    x.ini = ini; x.finH = fin; x.ejecutores = elegidos; x.hh = x.dur * x.n;
    asignadas.push(x);
  });
  const carga = {};
  asignadas.forEach(function (x) { x.ejecutores.forEach(function (p) { carga[p] = carga[p] || { usado: 0, total: W }; carga[p].usado += x.dur; }); });
  return { tipo: 'parada', ventana: W, asignadas: asignadas, noEntran: noEntran, sinGente: sinGente, carga: carga };
}

function horaMas(hIni, horas) {
  const m = String(hIni || '06:00').match(/(\d{1,2}):(\d{2})/) || [0, 6, 0];
  let min = (+m[1]) * 60 + (+m[2]) + Math.round(horas * 60);
  const dia = Math.floor(min / 1440); min = min % 1440;
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0') + (dia ? ' (+' + dia + 'd)' : '');
}
