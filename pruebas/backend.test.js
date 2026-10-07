const {makeEnv}=require('./env.js');
let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c) pass++; else { fail++; fails.push(m); } };
const hoyISO=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const base={tipo:'Roja',detectadoPor:'Perez, Juan',areaEquipo:'PULPERS',equipo:'PULPER D30',componente:'PULPER D30',descripcion:'fuga',categoria:'Fuga (aceite / aire / agua / vapor)',prioridad:'Media',areaResponsable:'Mantenimiento Mecánico',poolResponsable:['Mec, A','Mec, B','Mec, C']};

/* ---------- 1. planilla vacia ---------- */
{ const E=makeEnv();
  let r=E.call({action:'listar'}); ok(r.ok && r.tarjetas.length===0 && r.paradas.length===0,'listar vacío');
  r=E.call({action:'maestros'}); ok(r.ok && r.personas===null && r.arbol===null && Array.isArray(r.areas),'maestros vacío');
  r=E.call({action:'historial',id:'X'}); ok(r.ok && r.historial.length===0,'historial vacío');
  r=E.call({action:'ping'}); ok(r.ok,'ping');
  r=E.call({action:'noexiste'}); ok(!r.ok && /desconocida/.test(r.error),'acción desconocida');
  r=E.raw('{no es json'); ok(r.ok!==undefined,'JSON inválido no rompe');
  r=E.call({action:'setup'}); ok(r.ok && ['Tarjetas','Historial','Paradas','Personas','Arbol','Areas'].every(n=>E.SHEETS[n]),'setup crea 6 hojas');
  ok(E.st.lockErrors===0,'sin locks anidados (vacío)');
}
/* ---------- 2. crear: validaciones y datos ---------- */
{ const E=makeEnv();
  for (const [k,v] of [['tipo','Negra'],['detectadoPor',''],['areaEquipo',''],['descripcion',''],['categoria',''],['prioridad',''],['prioridad','Urgentisima'],['areaResponsable','']]) {
    const r=E.call({action:'crear',data:Object.assign({},base,{[k]:v})}); ok(!r.ok,'crear rechaza '+k+' inválido');
  }
  let r=E.call({action:'crear',usuario:'Perez, Juan',data:Object.assign({},base,{condicion:'xx',horasEstimadas:'2',personasNecesarias:'3',clienteId:'c1',sectorDetector:'Operario'})});
  ok(r.ok && /^ROJ-\d{6}-\d{4}-[A-Z0-9]{3}$/.test(r.id),'formato de ID');
  ok(r.responsable==='Mec, A','reparto: primero el menos cargado (empate → alfabético)');
  let r2=E.call({action:'crear',data:Object.assign({},base,{clienteId:'c1'})}); ok(r2.duplicado && r2.id===r.id,'mismo Cliente ID no duplica');
  let r3=E.call({action:'crear',data:base}); ok(r3.responsable==='Mec, B','reparto: sigue con el menos cargado');
  let r4=E.call({action:'crear',data:base}); ok(r4.responsable==='Mec, C','reparto parejo entre todo el equipo');
  let r5=E.call({action:'crear',data:Object.assign({},base,{responsable:'Elegido, A'})}); ok(r5.responsable==='Elegido, A','responsable elegido a mano se respeta');
  E.call({action:'guardarResponsables',filas:[{Area:'Producción',Colores:'Azul',Modo:'supervisor',HorasDia:6,Personas:'Sup, 1; Sup, 2; Sup, 3; Sup, 4'}]});
  const az=[]; for(let i=0;i<8;i++) az.push(E.call({action:'crear',data:Object.assign({},base,{tipo:'Azul',areaResponsable:'Producción',poolResponsable:['Otro, X']})}).responsable);
  ok(az.every(x=>/^Sup, [1-4]$/.test(x)),'azules: solo entre los 4 supervisores (la hoja manda sobre lo enviado)');
  ok(['Sup, 1','Sup, 2','Sup, 3','Sup, 4'].every(n=>az.filter(x=>x===n).length===2),'azules: 8 tarjetas → 2 por supervisor');
  let rv=E.call({action:'crear',data:Object.assign({},base,{areaResponsable:'Área sin equipo',poolResponsable:[]})}); ok(rv.ok && rv.responsable==='','área sin equipo: queda sin responsable');
  const L=E.call({action:'listar'}).tarjetas; const t=L.find(x=>x.ID===r.id);
  ok(L.filter(x=>x['Area responsable']==='Mantenimiento Mecánico').length===4,'área responsable guardada');
  ok(t['Condicion intervencion']==='A definir','condición inválida → A definir');
  ok(t['Horas estimadas']=='2' && t['Personas necesarias']=='3','horas y personas guardadas');
  ok(t['Estado']==='Abierta' && t.diasAbierta===0 && t.vencida===false,'estado inicial');
  ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t['Fecha alta']),'fecha alta formateada local');
  ok(t['Sector detector']==='Operario','sector del detector');
  let ra=E.call({action:'actualizar',id:r.id,cambios:{areaResponsable:''}}); ok(!ra.ok,'no se borra el área responsable');
  ra=E.call({action:'actualizar',id:r.id,cambios:{areaResponsable:'Producción',responsable:'__auto__'}}); const t2=E.call({action:'listar'}).tarjetas.find(x=>x.ID===r.id); ok(ra.ok && /^Sup, /.test(t2['Responsable asignado']) && t2['Area responsable']==='Producción','cambiar de área reasigna automático dentro del nuevo equipo');
  const h=E.call({action:'historial',id:r.id}).historial; ok(h[0].Accion==='Alta' && h[0].Usuario==='Perez, Juan','historial de alta');
  let rf=E.call({action:'crear',data:Object.assign({},base,{fotoData:'data:image/jpeg;base64,/9j/AA=='})}); ok(rf.ok && !rf.fotoError,'foto válida');
  let rf2=E.call({action:'crear',data:Object.assign({},base,{fotoData:'basura'})}); ok(rf2.ok && /foto/.test(rf2.fotoError),'foto inválida: la tarjeta se crea y avisa');
  let rs=E.call({action:'crear',data:Object.assign({},base,{categoria:'Condicion insegura'})}); ok(rs.ehs==='Pendiente','seguridad sin EHS configurado → Pendiente');
  ok(E.st.lockErrors===0,'sin locks anidados (crear)');
}
/* ---------- 3. actualizar / lote ---------- */
{ const E=makeEnv(); const id=E.call({action:'crear',data:base}).id;
  let r=E.call({action:'actualizar',id:'NOPE',cambios:{prioridad:'Alta'}}); ok(!r.ok,'actualizar id inexistente');
  r=E.call({action:'actualizar',id,cambios:{prioridad:'Media'}}); ok(r.ok && r.cambios===0,'sin cambios reales → 0');
  r=E.call({action:'actualizar',id,cambios:{estado:'Cerrada'}}); ok(!r.ok,'no se cierra por actualizar');
  r=E.call({action:'actualizar',id,cambios:{categoria:''}}); ok(!r.ok,'no se borra la categoría');
  r=E.call({action:'actualizar',id,cambios:{prioridad:''}}); ok(!r.ok,'no se borra la prioridad');
  r=E.call({action:'actualizar',id,cambios:{categoria:'Dificil inspeccion',prioridad:'Alta'}}); ok(r.ok && r.cambios===2,'se pueden cambiar categoría y prioridad');
  r=E.call({action:'actualizar',id,cambios:{estado:'Verificada'}}); ok(!r.ok,'no se verifica por actualizar');
  r=E.call({action:'actualizar',id,cambios:{estado:'Anulada'}}); ok(!r.ok,'anular sin motivo');
  E.call({action:'actualizar',id,usuario:'Jefe',cambios:{condicion:'Parada planificada'}});
  ok(E.call({action:'listar'}).tarjetas.find(x=>x.ID===id)['Condicion intervencion']==='Parada planificada','acepta condición Parada planificada');
  ok(E.call({action:'ping'}).version===21,'ping devuelve versión 20');
  E.call({action:'actualizar',id,usuario:'Jefe',cambios:{fechaCompromiso:'2026-01-10'}});
  E.call({action:'actualizar',id,usuario:'Jefe',cambios:{fechaCompromiso:'2026-01-10'}});
  E.call({action:'actualizar',id,usuario:'Jefe',cambios:{fechaCompromiso:'2026-01-15',tipo:'Azul',condicion:'Maquina parada',campoRaro:'x'}});
  let t=E.call({action:'listar'}).tarjetas[0];
  ok(t.Reprogramaciones==1,'reprogramaciones = 1 (primera fecha no cuenta, repetida no cuenta)');
  ok(t.Tipo==='Azul' && t['Grupo responsable']==='Operacion','reclasificar color');
  ok(t.vencida===true,'compromiso pasado → vencida');
  ok(t['Fecha compromiso']==='2026-01-15','fecha compromiso formateada');
  r=E.call({action:'actualizar',id,cambios:{tipo:'Violeta'}}); t=E.call({action:'listar'}).tarjetas[0]; ok(t.Tipo==='Azul','color inválido ignorado');
  E.call({action:'actualizar',id,cambios:{fechaCompromiso:hoyISO()}}); t=E.call({action:'listar'}).tarjetas[0]; ok(t.vencida===false,'compromiso hoy no está vencida');
  const id2=E.call({action:'crear',data:base}).id;
  r=E.call({action:'actualizarLote',items:[{id,cambios:{ejecutores:'A, B; C, D',fechaPlanificada:'2026-10-01',horario:'08:00-10:00',personas:2}},{id:'NOPE',cambios:{}},{id:id2,cambios:{paradaObjetivo:'2026-10-07'}}]});
  ok(r.ok && r.actualizadas===2 && r.errores.length===1,'lote: 2 ok + 1 error informado');
  t=E.call({action:'listar'}).tarjetas.find(x=>x.ID===id);
  ok(t.Ejecutores==='A, B; C, D' && t['Fecha planificada']==='2026-10-01' && t['Horario planificado']==='08:00-10:00' && t['Personas necesarias']==2,'lote guarda planificación');
  r=E.call({action:'actualizar',id:id2,usuario:'Jefe',cambios:{estado:'Anulada',motivo:'duplicada'}});
  t=E.call({action:'listar'}).tarjetas.find(x=>x.ID===id2); ok(t.Estado==='Anulada' && /Anulada.*duplicada/.test(t.Notas),'anular con motivo deja nota');
  // rendimiento: lote de 30
  const ids=[]; for(let i=0;i<30;i++) ids.push(E.call({action:'crear',data:base}).id);
  const antes=E.st.ranges; E.call({action:'actualizarLote',items:ids.map(x=>({id:x,cambios:{ejecutores:'A, B',fechaPlanificada:'2026-10-02',horario:'x'}}))});
  const usados=E.st.ranges-antes; ok(usados<=100,'lote de 30 usa ≤100 accesos a la planilla (usó '+usados+')');
  ok(E.st.lockErrors===0,'sin locks anidados (actualizar)');
}
/* ---------- 4. cerrar / verificar ---------- */
{ const E=makeEnv();
  E.call({action:'sembrarMaestros',personas:{'Operario':['Perez, Juan'],'Mantenimiento Mecánico':['Tec, Uno']},arbol:{'PULPERS':{'PULPER D30':['PULPER D30']}}});
  E.SHEETS.Personas.rows[1][2]='juan@x'; E.SHEETS.Personas.rows[2][2]='tec@x';
  const id=E.call({action:'crear',data:Object.assign({},base,{responsable:'Tec, Uno'})}).id;
  let r=E.call({action:'cerrar',id,accion:'',cerradoPor:'Tec, Uno',causa:'Otra',horasReales:1,personasReales:1}); ok(!r.ok,'cerrar sin acción');
  r=E.call({action:'cerrar',id,accion:'x',cerradoPor:'',causa:'Otra',horasReales:1,personasReales:1}); ok(!r.ok,'cerrar sin quién');
  r=E.call({action:'cerrar',id,accion:'x',cerradoPor:'Tec, Uno',causa:'Otra',personasReales:1}); ok(!r.ok && /horas/.test(r.error),'cerrar sin horas reales');
  r=E.call({action:'cerrar',id,accion:'x',cerradoPor:'Tec, Uno',causa:'Otra',horasReales:2}); ok(!r.ok && /personas/.test(r.error),'cerrar sin personas reales');
  r=E.call({action:'cerrar',id,accion:'x',cerradoPor:'Tec, Uno',horasReales:2,personasReales:1}); ok(!r.ok && /causa/.test(r.error),'cerrar sin causa');
  r=E.call({action:'verificar',id,ok:true,verificadoPor:'Perez, Juan'}); ok(!r.ok,'verificar abierta');
  const m0=E.st.mails.length;
  r=E.call({action:'cerrar',id,accion:'Cambio de junta',cerradoPor:'Tec, Uno',causa:'Desgaste natural',horasReales:3,personasReales:2,agregarMP:true,actualizarEstandar:false,fotoCierreData:'data:image/jpeg;base64,/9j/AA=='});
  ok(r.ok,'cerrar ok');
  ok(E.st.mails.length===m0+1 && E.st.mails[E.st.mails.length-1].to==='juan@x' && /Antes|Después/.test(E.st.mails[E.st.mails.length-1].htmlBody),'mail al detector con fotos');
  let t=E.call({action:'listar'}).tarjetas[0];
  ok(t['Horas reales']==3 && t['Personas reales']==2,'horas y personas reales guardadas');
  ok(t.Estado==='Cerrada' && t['Cerrado por']==='Tec, Uno' && t['Agregar a MP']==='Si' && t['Actualizar estandar']==='' && t.Causa==='Desgaste natural' && /thumbnail/.test(t['Foto cierre URL']),'datos de cierre');
  r=E.call({action:'cerrar',id,accion:'otra',cerradoPor:'Tec, Uno',causa:'Otra',horasReales:1,personasReales:1}); ok(!r.ok,'no se cierra dos veces');
  r=E.call({action:'verificar',id,ok:false,verificadoPor:'Perez, Juan'}); ok(!r.ok,'reabrir sin comentario');
  const m1=E.st.mails.length;
  r=E.call({action:'verificar',id,ok:'false',verificadoPor:'Perez, Juan',comentario:'sigue goteando'}); ok(r.ok,'reabrir');
  ok(E.st.mails.length===m1+1 && /tec@x/.test(E.st.mails[E.st.mails.length-1].to),'mail de reapertura al responsable');
  t=E.call({action:'listar'}).tarjetas[0];
  ok(t.Estado==='Abierta' && t.Reaperturas==1 && t['Fecha cierre']==='' && t['Foto cierre URL']==='' && /sigue goteando/.test(t.Notas),'reapertura limpia cierre y deja nota');
  E.call({action:'cerrar',id,accion:'Cambio de sello',cerradoPor:'Tec, Uno',causa:'Otra',horasReales:1,personasReales:1});
  r=E.call({action:'verificar',id,ok:true,verificadoPor:'Perez, Juan'}); t=E.call({action:'listar'}).tarjetas[0];
  ok(t.Estado==='Verificada' && t['Verificado por']==='Perez, Juan' && t['Fecha verificacion'],'verificada');
  r=E.call({action:'actualizar',id,cambios:{estado:'Abierta'}}); ok(r.ok,'(actualizar de verificada permitido por API)');
  const H=E.call({action:'historial',id}).historial; ok(H.length>=8,'historial completo ('+H.length+')');
  ok(E.st.lockErrors===0,'sin locks anidados (cerrar)');
}
/* ---------- 5. listar con período ---------- */
{ const E=makeEnv();
  const a=E.call({action:'crear',data:Object.assign({},base,{fechaAlta:'2025-01-01 10:00'})}).id;  // vieja abierta
  const b=E.call({action:'crear',data:Object.assign({},base,{fechaAlta:'2025-01-01 10:00'})}).id;  // vieja cerrada
  E.call({action:'cerrar',id:b,accion:'x',cerradoPor:'y',causa:'Otra',horasReales:1,personasReales:1}); E.api.escribir_ && 0;
  E.call({action:'verificar',id:b,ok:true,verificadoPor:'z'});
  const vm=require('vm'); // forzar fecha de cierre vieja
  const T=E.SHEETS.Tarjetas; const hdr=T.rows[0]; const fb=T.rows.findIndex(r=>r[0]===b);
  T.rows[fb][hdr.indexOf('Fecha cierre')]=new Date(2025,0,5); T.rows[fb][hdr.indexOf('Fecha verificacion')]=new Date(2025,0,6);
  const c=E.call({action:'crear',data:base}).id;
  const L=E.call({action:'listar',desde:'2026-01-01'}).tarjetas.map(t=>t.ID);
  ok(L.includes(a) && !L.includes(b) && L.includes(c),'período: incluye abiertas viejas, excluye cerradas viejas');
  const t=E.call({action:'listar'}).tarjetas.find(x=>x.ID===b); ok(t.diasAbierta===4,'días abierta usa fecha de cierre ('+t.diasAbierta+')');
}
/* ---------- 6. paradas y áreas ---------- */
{ const E=makeEnv();
  let r=E.call({action:'guardarParada',parada:{}}); ok(!r.ok,'parada sin fecha');
  r=E.call({action:'guardarParada',parada:{fecha:'2026-12-01',descripcion:'B',duracion:12,horaInicio:'06:00',hh:100}}); const idB=r.id;
  E.call({action:'guardarParada',parada:{fecha:'2026-11-01',descripcion:'A'}});
  let P=E.call({action:'listar'}).paradas; ok(P.length===2 && P[0].fecha==='2026-11-01','paradas ordenadas por fecha');
  const pb=P.find(p=>p.id===idB); ok(pb.horaInicio==='06:00' && pb.duracion==12 && pb.hh==100,'parada: hora y duración ('+pb.horaInicio+')');
  E.call({action:'guardarParada',parada:{id:idB,fecha:'2026-12-02',descripcion:'B2',duracion:8,horaInicio:'07:30'}});
  P=E.call({action:'listar'}).paradas; ok(P.length===2 && P.find(p=>p.id===idB).fecha==='2026-12-02' && P.find(p=>p.id===idB).horaInicio==='07:30','editar parada');
  E.call({action:'borrarParada',id:idB}); ok(E.call({action:'listar'}).paradas.length===1,'borrar parada');
  E.call({action:'guardarAreas',filas:[{Area:'*',Criticidad:'B'},{Area:''},{Area:'MESAS',Criticidad:'A','Ejecutores Azul':'X, Y; Z, W'}]});
  const A=E.call({action:'maestros'}).areas; ok(A.length===2 && A.find(a=>a.Area==='MESAS')['Ejecutores Azul']==='X, Y; Z, W','guardar/leer áreas (fila vacía descartada)');
  E.call({action:'guardarAreas',filas:[{Area:'*'}]}); ok(E.call({action:'maestros'}).areas.length===1,'guardar áreas reemplaza');
}
/* ---------- 7. maestros ---------- */
{ const E=makeEnv();
  let r=E.call({action:'sembrarMaestros',personas:{S:['A, B','C, D']},arbol:{AR:{SUB:['E1'],SUB2:[]},AR2:{}}});
  ok(r.personas===2 && r.arbol===3,'sembrar ('+r.arbol+' filas árbol)');
  r=E.call({action:'sembrarMaestros',personas:{S:['X']}}); ok(r.personasMsg && !r.personas,'no pisa sin forzar');
  r=E.call({action:'sembrarMaestros',personas:{S:['X']},forzar:true}); ok(r.personas===1,'forzar reemplaza');
  E.SHEETS.Personas.rows.push(['S','Baja, Z','','No']);
  const m=E.call({action:'maestros'}); ok(m.personas.S.length===1 && m.arbol.AR.SUB[0]==='E1' && Array.isArray(m.arbol.AR.SUB2) && m.arbol.AR2,'maestros lee y respeta Activo=No');
}
/* ---------- 8. migración v3 (planilla v2) ---------- */
{ const E=makeEnv();
  const H2=['ID','Fecha alta','Tipo','Grupo responsable','Detectado por','Turno','Sector','Equipo','Componente/Ubicacion','Categoria','Descripcion','Prioridad','Foto URL','Responsable asignado','Fecha compromiso','Estado','Fecha cierre','Accion de cierre','Costo estimado','Notas','Etapa MA','Dimension mejora','Area equipo'];
  const sh=E.call && null; E.call({action:'ping'}); // crea nada
  const S=require('./env.js'); // noop
  const E2=makeEnv(); const T={}; 
  E2.call({action:'ping'});
  E2.SHEETS.Tarjetas.rows=[H2, ['A',new Date(2026,5,1),'Roja','Mantenimiento','x','','P','','','','d','Media','','','','Abierta','','','','','','','P'], ['B',new Date(2026,5,1),'Roja','Mantenimiento','x','','P','','','','d','Media','','','','Cerrada',new Date(2026,5,3),'ok','','','','','P']];
  delete E2.PROPS.migracion_v3;
  const L=E2.call({action:'listar'}).tarjetas;
  ok(L.find(t=>t.ID==='B').Estado==='Verificada' && L.find(t=>t.ID==='A').Estado==='Abierta','migración: Cerrada → Verificada');
  ok(E2.SHEETS.Tarjetas.rows[0].length===E2.api.HEADERS.length,'migración: encabezados completos');
  E2.SHEETS.Tarjetas.rows[2][15]='Cerrada'; E2.SHEETS.Tarjetas.rows[2][E2.api.HEADERS.indexOf('Verificado por')]='';
  E2.call({action:'listar'}); ok(E2.SHEETS.Tarjetas.rows[2][15]==='Cerrada','migración corre una sola vez');
  ok(E2.st.lockErrors===0,'sin locks anidados (migración)');
  // escritura que dispara la migración por primera vez (el caso del bug)
  const E3=makeEnv(); E3.call({action:'ping'}); delete E3.PROPS.migracion_v3;
  const r=E3.call({action:'crear',data:base}); ok(r.ok && E3.st.lockErrors===0,'primera escritura + migración sin lock anidado');
}
/* ---------- 9. EHS configurado ---------- */
{ const E=makeEnv(src=>src.replace("const EHS_EMAIL = '';","const EHS_EMAIL = 'seh@x';").replace("const EHS_API_URL = '';","const EHS_API_URL = 'https://ehs/exec';").replace("const APP_URL = '';","const APP_URL = 'https://app.x';").replace("'Mantenimiento': '',","'Mantenimiento': 'mant@x',"));
  const r=E.call({action:'crear',data:Object.assign({},base,{categoria:'Condicion insegura'})});
  ok(/Email/.test(r.ehs) && /EHS EHS-9/.test(r.ehs),'EHS: mail + API ('+r.ehs+')');
  ok(E.st.fetches.length===1 && JSON.parse(E.st.fetches[0].o.payload).data.descripcion==='fuga','EHS: payload enviado');
  ok(E.st.mails.some(m=>m.to==='mant@x' && /seguimiento\.html\?id=/.test(m.body)),'aviso de tarjeta nueva al grupo con link');
  const t=E.call({action:'listar'}).tarjetas[0]; ok(/Email/.test(t['Enviado a EHS']),'estado EHS guardado');
  const r2=E.call({action:'derivarEHS',id:r.id}); ok(r2.ok,'derivar manual');
}
/* ---------- historial para estimar ---------- */
{ const E=makeEnv(); E.call({action:'setup'});
  const a=E.call({action:'crear',data:Object.assign({},base,{descripcion:'Cambio de bomba de vacío',especialidad:'Mecanica',repuestos:'Sello 45'})}); ok(a.ok,'crear con especialidad y repuestos');
  const b=E.call({action:'crear',data:Object.assign({},base,{descripcion:'otra'})});
  E.call({action:'cerrar',id:a.id,accion:'Se cambió la bomba',cerradoPor:'Mec, A',horasReales:5,personasReales:2,causa:'Desgaste natural'});
  let r=E.call({action:'historialEstimacion'}); ok(r.ok && r.filas.length===1,'historial solo trae cerradas con horas reales');
  const f=r.filas[0]; ok(f['Horas reales']==5 && f['Especialidad']==='Mecanica' && f['Repuestos']==='Sello 45' && /bomba/.test(f['Accion de cierre']),'historial trae horas, especialidad, repuestos y acción');
  ok(!('Foto URL' in f) && !('Notas' in f),'historial es compacto');
}
/* ---------- correcciones con historial ---------- */
{ const E=makeEnv(); E.call({action:'setup'});
  const a=E.call({action:'crear',data:Object.assign({},base,{descripcion:'mal cargada'})});
  let r=E.call({action:'actualizar',id:a.id,cambios:{descripcion:'bien cargada',areaEquipo:'LABORATORIO',equipo:'LABORATORIO DE CALIDAD',componente:''},usuario:''});
  ok(!r.ok && /identificate/i.test(r.error),'corrección exige identificarse');
  r=E.call({action:'actualizar',id:a.id,cambios:{descripcion:'bien cargada',areaEquipo:'LABORATORIO',equipo:'LABORATORIO DE CALIDAD',componente:''},usuario:'Rubio, Nicolas'});
  ok(r.ok,'corrige descripción y ubicación');
  const t=E.call({action:'listar'}).tarjetas.find(x=>x.ID===a.id); ok(t['Descripcion']==='bien cargada' && t['Area equipo']==='LABORATORIO' && t['Sector']==='LABORATORIO','datos corregidos');
  const h=E.call({action:'historial',id:a.id}).historial; ok(h.some(x=>x.Accion==='Correccion' && x.Campo==='Descripcion' && x.Antes==='mal cargada' && x.Usuario==='Rubio, Nicolas'),'historial: qué, antes, después y quién');
  ok(!E.call({action:'actualizar',id:a.id,cambios:{descripcion:'  '},usuario:'X'}).ok,'no deja descripción vacía');
  ok(E.call({action:'actualizar',id:a.id,cambios:{prioridad:'Alta',tipo:'Roja'},usuario:''}).ok,'gestión sin cambiar datos de carga no exige identificarse');
}

/* ---------- corrección de color ---------- */
{ const E=makeEnv(); const id=E.call({action:'crear',data:base}).id;
  let r=E.call({action:'actualizar',id,cambios:{tipo:'Azul'}}); ok(!r.ok && /identificate/i.test(r.error),'cambiar color pide identificarse');
  r=E.call({action:'actualizar',id,usuario:'Rubio, Nicolas',cambios:{tipo:'Azul',areaResponsable:'Producción',responsable:'Sup, Uno'}});
  let t=E.call({action:'listar'}).tarjetas.find(x=>x.ID===id);
  ok(r.ok && t.Tipo==='Azul' && t['Grupo responsable']==='Operacion' && t['Area responsable']==='Producción','color corregido a Azul con grupo y área nuevos');
  ok(t.ID===id,'el código de la tarjeta no cambia');
  let h=E.call({action:'historial',id}).historial;
  ok(h.some(x=>x.Accion==='Correccion' && x.Campo==='Tipo' && x.Antes==='Roja' && x.Despues==='Azul' && x.Usuario==='Rubio, Nicolas'),'historial: corrección de color con quién');
  r=E.call({action:'actualizar',id,usuario:'X',cambios:{tipo:'Violeta'}}); t=E.call({action:'listar'}).tarjetas.find(x=>x.ID===id); ok(t.Tipo==='Azul','color inválido se ignora');
}
console.log('BACKEND: '+pass+' OK, '+fail+' FALLAS'); fails.forEach(f=>console.log('  ✖ '+f));
