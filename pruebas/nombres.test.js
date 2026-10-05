const {makeEnv}=require('./env.js'); const fs=require('fs');
let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c) pass++; else { fail++; fails.push(m); } };
const PJS=fs.readFileSync('/home/claude/tpm-tarjetas/personas.js','utf8');
const base={tipo:'Roja',detectadoPor:'Perez, Juan',areaEquipo:'PULPERS',equipo:'PULPER D30',componente:'PULPER D30',descripcion:'fuga',categoria:'Fuga (aceite / aire / agua / vapor)',prioridad:'Media',areaResponsable:'Mantenimiento Mecánico',poolResponsable:['Mec, A']};
const mock=(src,pj)=>"var __PJS="+JSON.stringify(pj)+"; UrlFetchApp={fetch:function(u){ if(!/personas\\.js$/.test(u)) throw new Error('url '+u); return {getContentText:function(){return __PJS;}}; }};\nDriveApp.getFileById=function(){ return {getMimeType:function(){return 'text/csv'},getBlob:function(){return {getDataAsString:function(){return PropertiesService.getScriptProperties().getProperty('__CSV')||'';}}}}};\n"+src.replace("case 'ping':","case '__nom': out = {r:(req.n||[]).map(eamNombre_), p:(req.p||[]).map(eamPersonas_)}; break;\n      case 'ping':");
const E=makeEnv(s=>mock(s,PJS));
const casos=[['MARCONI JORGE','Marconi, Jorge'],['Guillermo Panis','Panis, Guillermo Adrian'],['Jonatan Brian Batstoc','Batstoc, Jonatan Braian'],['COLLI Y OCKIER MAXIMILIANO','Colli Y Ockier, Maximiliano'],
 ['ARRIETA JUAN CRUZ','Arrieta, Ceferino Juan Cruz'],['HIRSCH GUSTAVO','Hirsch, Gustavo'],['GISLER GUILLERMO','Gisler, Guillermo'],['MONTERO MARCELO','Montero, Marcelo'],['SCHLEGEL SERGIO','Schlegel, Sergio Daniel'],
 ['CIVERCHIA BRANKO ELOY','Civerchia, Branko'],['RINCON FABIO','Rincon, Fabio Maria'],['BENZI LUCAS','Benzi, Lucas'],['Montero, Marcelo','Montero, Marcelo']];
const r=E.call({action:'__nom',n:casos.map(c=>c[0])});
casos.forEach((c,i)=>ok(r.r[i]===c[1],'"'+c[0]+'" → "'+c[1]+'" (dio "'+r.r[i]+'")'));
const gs=E.call({action:'__nom',n:['GOÑI SANTIAGO L.']}).r[0]; ok(/^Go[nñ]i, Santiago/.test(gs),'GOÑI SANTIAGO L. → '+gs);
const p=E.call({action:'__nom',p:['ARRIETA JUAN CRUZ, GOÑI SANTIAGO L.','CIVERCHIA BRANKO ELOY, SCHLEGEL SERGIO']}).p;
ok(p[1].join('; ')==='Civerchia, Branko; Schlegel, Sergio Daniel','varios empleados → '+p[1].join('; '));
// sin lista (no se pudo leer personas.js): heurística
const E2=makeEnv(s=>mock(s,''));
const h=E2.call({action:'__nom',n:['MARCONI JORGE','Guillermo Panis','COLLI Y OCKIER MAXIMILIANO','Jonatan Brian Batstoc','DE LA FUENTE JUAN']}).r;
ok(h[0]==='Marconi, Jorge' && h[1]==='Panis, Guillermo' && h[2]==='Colli y Ockier, Maximiliano' && h[3]==='Batstoc, Jonatan Brian' && h[4]==='De la Fuente, Juan','heurística sin lista: '+h.join(' | '));
// ambiguo: no inventa
const E3=makeEnv(s=>mock(s,'"Perez, Juan", "Perez, Juan Carlos"'));
ok(E3.call({action:'__nom',n:['PEREZ JUAN CARLOS']}).r[0]==='Perez, Juan Carlos','elige el más completo');
// ---- sincronización con nombres reales + reparación de cierres viejos por EAM (caso CFP)
const H='ID_Tarjeta\tOT_EAM\tDescripcion_OT\tEquipo\tDescripcion_Equipo\tHs_Estimadas\tPersonas_Necesarias\tAsignado_A\tFecha_Inicio_Programada\tEmpleados\tHs_Reales\tFecha_Cierre\tComentario_Cierre\tEstado';
const a=E.call({action:'crear',data:Object.assign({},base,{clienteId:'a'})}).id, b=E.call({action:'crear',data:Object.assign({},base,{clienteId:'b'})}).id;
E.PROPS.__CSV=[H, a+'\t1\tx\tx\tx\t1\t1\tGuillermo Panis\t2026-10-05 0:00\t\t0\t\t\tPlanificado',
 b+'\t159471\tx\tx\tx\t2\t2\t\t2026-09-30 0:00\tARRIETA JUAN CRUZ, GOÑI SANTIAGO L.\t4\t2026-09-30 13:32\t\tTerminado'].join('\n');
E.call({action:'sincronizarEAM'});
let T=()=>{const o={}; E.call({action:'listar'}).tarjetas.forEach(t=>o[t.ID]=t); return o;}; let t=T();
ok(t[a]['Responsable asignado']==='Panis, Guillermo Adrian','sincronización guarda el nombre de la lista: '+t[a]['Responsable asignado']);
// simular cierre viejo (antes del arreglo): nombres heurísticos y horas de una sola OT
E.api.escribir_(b,{'Ejecutores':'Arrieta, Juan Cruz; Goñi, Santiago L.','Cerrado por':'Arrieta, Juan Cruz; Goñi, Santiago L.','Horas reales':4});
E.PROPS.__CSV=[H, b+'\t159471\tx\tx\tx\t2\t2\t\t2026-09-30 0:00\tARRIETA JUAN CRUZ, GOÑI SANTIAGO L.\t4\t2026-09-30 13:32\t\tTerminado',
 b+'\t159472\tNo enfria\tx\tx\t2\t1\t\t2026-09-29 0:00\tGOÑI SANTIAGO L.\t2\t2026-09-29 13:36\t\tTerminado'].join('\n');
let rr=E.call({action:'sincronizarEAM'}); t=T();
ok(+t[b]['Horas reales']===6,'CFP: horas reales pasan a 6 (suma de las dos OT): '+t[b]['Horas reales']);
ok(/^Arrieta, Ceferino Juan Cruz; Go[nñ]i, Santiago/.test(t[b]['Ejecutores']) && t[b]['Cerrado por']===t[b]['Ejecutores'],'CFP: ejecutores con nombres de la lista: '+t[b]['Ejecutores']);
ok(String(t[b]['N OT'])==='159471; 159472','CFP: las dos OT');
rr=E.call({action:'sincronizarEAM'}); ok(rr.actualizadas===0,'segunda lectura no cambia nada');
// cierre manual verificado por persona: no se toca
const c=E.call({action:'crear',data:Object.assign({},base,{clienteId:'c'})}).id;
E.call({action:'cerrar',id:c,accion:'manual',cerradoPor:'Tec, Uno',causa:'Otra',horasReales:1,personasReales:1,usuario:'Tec, Uno'});
E.call({action:'verificar',id:c,ok:true,verificadoPor:'Perez, Juan'});
E.PROPS.__CSV=[H, c+'\t9\tx\tx\tx\t1\t1\t\t2026-09-30 0:00\tMARCONI JORGE\t5\t2026-09-30 13:32\totra\tTerminado'].join('\n');
E.call({action:'sincronizarEAM'}); t=T();
ok(t[c]['Ejecutores']!=='Marconi, Jorge' && +t[c]['Horas reales']===1 && t[c]['Accion de cierre']==='manual','verificada por una persona: el EAM no pisa su cierre');
// ---- reparación de "__auto__"
const E4=makeEnv(s=>mock(s,PJS)); const d=E4.call({action:'crear',data:Object.assign({},base,{clienteId:'d'})}).id;
E4.api.escribir_(d,{'Responsable asignado':'__auto__','Ejecutores':'__auto__; Mec, A'});
delete E4.PROPS.reparar_auto_v1; E4.call({action:'ping'});
const td=E4.call({action:'listar'}).tarjetas[0];
ok(td['Responsable asignado']==='' && td['Ejecutores']==='Mec, A','repara "__auto__" guardado literal');
ok(E4.call({action:'historial',id:d}).historial.some(x=>x.Accion==='Reparacion'),'la reparación queda en el historial');
const r5=E4.call({action:'actualizar',id:d,usuario:'X',cambios:{responsable:'__auto__',areaResponsable:'Area inexistente'}}); 
ok(E4.call({action:'listar'}).tarjetas[0]['Responsable asignado']!=='__auto__','nunca vuelve a guardar "__auto__"');
console.log('NOMBRES/REPARACION: '+pass+' OK, '+fail+' FALLAS'); fails.forEach(f=>console.log('  ✖ '+f));
