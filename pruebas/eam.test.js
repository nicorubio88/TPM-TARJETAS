const {makeEnv}=require('./env.js');
let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c) pass++; else { fail++; fails.push(m); } };
const base={tipo:'Roja',detectadoPor:'Perez, Juan',areaEquipo:'PULPERS',equipo:'PULPER D30',componente:'PULPER D30',descripcion:'fuga',categoria:'Fuga (aceite / aire / agua / vapor)',prioridad:'Media',areaResponsable:'Mantenimiento Mecánico',poolResponsable:['Mec, A','Mec, B']};
const mock=src=>"DriveApp.getFileById=function(id){ if(PropertiesService.getScriptProperties().getProperty('__ERR')) throw new Error('No se encontro el archivo '+id); return {getMimeType:function(){return 'text/csv'},getBlob:function(){return {getDataAsString:function(){return PropertiesService.getScriptProperties().getProperty('__CSV')||'';}}}}};\n"+src;
const E=makeEnv(mock);
const id=k=>E.call({action:'crear',data:Object.assign({},base,{clienteId:k})}).id;
const A=id('a'), B=id('b'), C=id('c'), D=id('d');
E.call({action:'cerrar',id:C,accion:'Se limpio a mano',cerradoPor:'Tec, Uno',causa:'Otra',horasReales:1,personasReales:1,usuario:'Tec, Uno'});
const H='ID_Tarjeta\tOT_EAM\tDescripcion_OT\tEquipo\tDescripcion_Equipo\tHs_Estimadas\tPersonas_Necesarias\tAsignado_A\tFecha_Inicio_Programada\tEmpleados\tHs_Reales\tFecha_Cierre\tComentario_Cierre\tEstado';
const csv=[H,
 `Prueba\t159395\tSe atranca\tPULPER E20\tPulper E20\t6\t1\t\t2026-09-30 0:00\t\t0\t\t\tListo para planificar`,
 `${B}\t159459\tProgramar cambio de motor\tVCIO.BO04\tBomba\t6\t2\tMARCONI JORGE\t2026-10-05 0:00\t\t0\t\t\tPlanificado`,
 `${A.toLowerCase()}\t159460\tMotor sucio\tBOMB-TQ 260\tBomba Tanque 260\t1\t1\tMARCONI JORGE\t2026-10-01 0:00\tARRIETA JUAN CRUZ, MARCONI JORGE\t2\t2026-10-01 10:20\tSe limpió motor y ventilación\tTerminado`,
 `${C}\t159462\tx\tx\tx\t1\t1\t\t2026-10-01 0:00\tARRIETA JUAN CRUZ\t1,5\t2026-10-01 11:00\tOtra cosa\tTerminado`,
 `${D}\t159463\trevisar\tT\tT\t1\t1\t\t2026-10-02 0:00\tMARCONI JORGE\t1\t\t\tListo para planificar`].join('\r\n');
E.PROPS.__CSV=csv;
let r=E.call({action:'sincronizarEAM',usuario:'Plan, Ner'});
ok(r.ok,'sincroniza '+JSON.stringify(r).slice(0,200));
ok(r.leidas===5 && r.cruzadas===4 && r.cerradas===2,'conteos leidas/cruzadas/cerradas '+[r.leidas,r.cruzadas,r.cerradas]);
ok(r.sinTarjeta.length===1 && r.sinTarjeta[0]==='PRUEBA','reporta OT sin tarjeta');
const T=()=>{ const o={}; E.call({action:'listar'}).tarjetas.forEach(t=>o[t.ID]=t); return o; };
let t=T();
ok(t[A].Estado==='Verificada','A verificada');
ok(t[A]['Accion de cierre']==='Se limpió motor y ventilación','A accion = comentario de cierre');
ok(t[A]['Fecha cierre']==='2026-10-01 10:20','A fecha de cierre del EAM');
ok(t[A]['Ejecutores']==='Arrieta, Juan Cruz; Marconi, Jorge' && t[A]['Cerrado por']==='Arrieta, Juan Cruz; Marconi, Jorge','A ejecutores normalizados: '+t[A]['Ejecutores']);
ok(+t[A]['Horas reales']===2 && +t[A]['Personas reales']===2,'A horas y personas reales');
ok(t[A]['Causa']==='A completar (cerrada desde EAM)','A causa pendiente');
ok(String(t[A]['N OT'])==='159460' && t[A]['Verificado por']==='EAM · OT 159460','A N OT y verificado por EAM');
ok(/\[EAM\] OT 159460/.test(t[A].Notas),'A nota EAM');
ok(t[B].Estado==='En proceso' && t[B]['Responsable asignado']==='Marconi, Jorge','B planificado → en proceso con responsable');
ok(t[B]['Fecha planificada']==='2026-10-05' && +t[B]['Horas estimadas']===6 && +t[B]['Personas necesarias']===2 && String(t[B]['N OT'])==='159459','B fecha, horas, personas, OT');
ok(t[C].Estado==='Verificada' && t[C]['Accion de cierre']==='Se limpio a mano' && t[C].Causa==='Otra','C (resuelta a mano) se verifica sin pisar el cierre');
ok(t[D].Estado==='Abierta' && String(t[D]['N OT'])==='159463' && !t[D]['Fecha planificada'],'D listo para planificar: solo N OT');
ok(t[B]['Estado EAM']==='Planificado' && t[D]['Estado EAM']==='Listo para planificar' && t[A]['Estado EAM']==='Terminado','guarda el estado de la OT en el EAM');
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t[B]['Actualizado EAM']),'marca cuándo actualizó el EAM');
let h=E.call({action:'historial',id:A}).historial;
ok(h.some(x=>x.Accion==='Cierre EAM' && x.Campo==='Estado' && x.Despues==='Verificada' && /EAM · OT 159460/.test(x.Usuario)),'historial registra cierre EAM');
const nHist=E.SHEETS.Historial.getLastRow();
// cambio de estado en el EAM (Planificado -> En ejecucion) se registra

r=E.call({action:'sincronizarEAM'});
ok(r.ok && r.cerradas===0 && r.actualizadas===0 && E.SHEETS.Historial.getLastRow()===nHist,'segunda lectura no cambia nada (idempotente)');
// trigger (sin web app)
r=E.call({action:'estadoEAM'}); ok(r.ok && r.ultima && r.ultima.leidas===5,'estadoEAM devuelve la última lectura');
// separador ; con comillas y fechas dd/mm/yyyy
const B2=id('e');
E.PROPS.__CSV='﻿ID_Tarjeta;OT_EAM;Descripcion_OT;Asignado_A;Fecha_Inicio_Programada;Empleados;Hs_Reales;Fecha_Cierre;Comentario_Cierre;Estado\n'+
  `${B2};200;"Cambio; rodamiento";PEREZ ANA;07/10/2026 08:00;"PEREZ ANA, GOMEZ LUIS";"3,5";08/10/2026 16:45;"Se cambió ""rodamiento"" 6205";Terminado`;
r=E.call({action:'sincronizarEAM'}); t=T();
ok(r.ok && t[B2].Estado==='Verificada' && t[B2]['Fecha cierre']==='2026-10-08 16:45' && +t[B2]['Horas reales']===3.5 && t[B2]['Accion de cierre']==='Se cambió "rodamiento" 6205','CSV con ; comillas y fechas dd/mm/aaaa');
// errores
E.PROPS.__CSV='Columna1,Columna2\n1,2'; r=E.call({action:'sincronizarEAM'}); ok(!r.ok && /ID_Tarjeta/.test(r.error),'CSV sin columnas requeridas da error claro');
E.PROPS.__ERR='1'; r=E.call({action:'sincronizarEAM'}); ok(!r.ok && /No se encuentra el CSV/.test(r.error),'archivo inaccesible da error claro'); 
ok(E.call({action:'estadoEAM'}).ultima.ok===false,'el error manual queda visible en estadoEAM'); delete E.PROPS.__ERR;
// completar causa
r=E.call({action:'completarCausa',id:A,causa:'Falta de limpieza / inspeccion'}); ok(!r.ok,'completar causa sin identificarse');
r=E.call({action:'completarCausa',id:D,causa:'Otra',usuario:'Plan, Ner'}); ok(!r.ok,'no se completa causa de tarjeta abierta');
r=E.call({action:'completarCausa',id:A,causa:'',usuario:'Plan, Ner'}); ok(!r.ok,'causa vacía');
r=E.call({action:'completarCausa',id:A,causa:'Falta de limpieza / inspeccion',agregarMP:true,usuario:'Plan, Ner'}); t=T();
ok(r.ok && t[A].Causa==='Falta de limpieza / inspeccion' && t[A]['Agregar a MP']==='Si','causa completada');
h=E.call({action:'historial',id:A}).historial; ok(h.some(x=>x.Campo==='Causa' && x.Usuario==='Plan, Ner'),'causa en historial con quién');
ok(E.st.lockErrors===0,'sin locks anidados');
// funcion del disparador (fuera de la web app)
{ const E2=makeEnv(src=>mock(src).replace("case 'ping':","case '__trig': out = sincronizarEAM(); break;\n      case 'ping':"));
  const a=E2.call({action:'crear',data:Object.assign({},base,{clienteId:'z'})}).id;
  E2.PROPS.__CSV=H+'\n'+a+'\t9\td\te\te\t1\t1\t\t2026-10-01\tLOPEZ PEDRO\t1\t2026-10-01 09:00\tok\tTerminado';
  const r3=E2.call({action:'__trig'});
  ok(r3.ok && r3.origen==='automatico' && r3.cerradas===1 && E2.st.lockErrors===0 && !E2.st.lockHeld,'disparador automático cierra y libera el lock');
  ok(E2.call({action:'historial',id:a}).historial.some(x=>x.Accion==='Cierre EAM'),'disparador escribe el historial');
  E2.PROPS.__ERR='1'; const r4=E2.call({action:'__trig'}); ok(!r4.ok && JSON.parse(E2.PROPS.EAM_ULTIMA).ok===false,'error del disparador queda registrado para mostrarlo');
}
console.log('EAM: '+pass+' OK, '+fail+' FALLAS'); fails.forEach(f=>console.log('  ✖ '+f));
