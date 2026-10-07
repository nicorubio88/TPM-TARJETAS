// Intercambio Tarjetas <-> EAM (especificacion v1.0): exportador, importador de estados finales y rechazos.
const {makeEnv}=require('./env.js');
let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c) pass++; else { fail++; fails.push(m); } };
const mock=src=>`
var __FILES={}, __ORDEN=[], __SEQ=0;
function __file(name,content){ var id='F'+(++__SEQ); var f={id:id,name:name,content:content,trashed:false,
  getId:function(){return id}, setName:function(n){f.name=n; __ORDEN.push('rename:'+n); return f}, setTrashed:function(t){f.trashed=t; return f},
  getBlob:function(){return {getDataAsString:function(){return f.content}}}, getMimeType:function(){return 'text/csv'}, getParents:function(){ var d=false; return {hasNext:function(){return !d}, next:function(){d=true; return __FOLDER}}; } };
  __FILES[id]=f; return f; }
var __FOLDER={ getId:function(){return 'C1'}, getName:function(){return 'Carpeta EAM'}, getUrl:function(){return 'https://drive/c1'}, createFile:function(n,c){ __ORDEN.push('create:'+n); return __file(n,c); },
  getFilesByName:function(n){ var l=Object.keys(__FILES).map(function(k){return __FILES[k]}).filter(function(f){return f.name===n && !f.trashed}); var i=0; return {hasNext:function(){return i<l.length}, next:function(){return l[i++]}}; } };
var __EAMCSV=__file('ot_cerradas_tarjetas.csv','');
DriveApp.getFileById=function(id){ return __EAMCSV; };
DriveApp.getFolderById=function(){ return __FOLDER; };
MimeType={CSV:'text/csv'};
Utilities.DigestAlgorithm={MD5:1}; Utilities.Charset={UTF_8:1};
Utilities.computeDigest=function(a,s){ var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return [h]; };
Utilities.base64Encode=function(b){ return String(b); };
` + src + `\n;this.__x={get:function(n){ var it=__FOLDER.getFilesByName(n); return it.hasNext()?it.next().content:null; }, orden:function(){ return __ORDEN; }, csvEAM:function(t){ __EAMCSV.content=t; }, rech:function(t){ var it=__FOLDER.getFilesByName('tarjetas_rechazadas.csv'); if(it.hasNext()) it.next().content=t; else __file('tarjetas_rechazadas.csv',t); }, parse:eamParseCsv_ };`;
const E=makeEnv(mock);
E.call({action:'setup'});
const base={detectadoPor:'Baier, Juan Carlos',areaEquipo:'PULPERS',equipo:'Pulper E20',componente:'',sistema:'PULPER E20',categoria:'Fuga (aceite / aire / agua / vapor)',prioridad:'Media',areaResponsable:'Mantenimiento Mecánico',condicion:'Maquina en marcha'};
const crear=(o,k)=>E.call({action:'crear',usuario:'Baier, Juan Carlos',data:Object.assign({},base,o,{clienteId:k})}).id;
// existentes ANTES de la integracion: se reinicia la marca de migracion para simularlo
const viejaCerr=crear({tipo:'Roja',descripcion:'vieja cerrada'},'v1');
E.call({action:'cerrar',id:viejaCerr,accion:'ok',cerradoPor:'Baier, Juan Carlos',causa:'Otra',horasReales:1,personasReales:1,usuario:'Baier, Juan Carlos'});
const viejaOT=crear({tipo:'Roja',descripcion:'vieja con OT'},'v2');
E.call({action:'actualizar',id:viejaOT,usuario:'Baier, Juan Carlos',cambios:{nOT:'150001'}});
const viejaAb=crear({tipo:'Roja',descripcion:'vieja abierta sin OT'},'v3');
delete E.PROPS.migracion_export_eam_v1;
E.call({action:'ping'});

const X=E.ctx.__x;
const parse=t=>X.parse(t);
const T=()=>{ const o={}; E.call({action:'listar'}).tarjetas.forEach(t=>o[t.ID]=t); return o; };
let t=T();
ok(t[viejaCerr]['Export EAM']==='Excluida' && t[viejaOT]['Export EAM']==='Excluida','migracion: cerradas y con OT quedan excluidas');
ok(!t[viejaAb]['Export EAM'],'migracion: abierta sin OT se exporta');

// nuevas
const ab=crear({tipo:'Roja',descripcion:'Perdida de aire; "acople" del rodillo\nse escucha fuga',prioridad:'Alta',areaResponsable:'Mantenimiento Eléctrico'},'n1');
const conHs=crear({tipo:'Roja',descripcion:'Tapa floja',horasEstimadas:1.5,personasNecesarias:2,condicion:'Maquina parada',prioridad:'Baja',areaResponsable:'ICOPRO'},'n2');
const larga=crear({tipo:'Verde',descripcion:'X'.repeat(120),condicion:'A definir',areaResponsable:'Mejora Enfocada',sistema:'LUG.SEC.BAT2',equipo:'Secadores 2ª batería (13 al 24)',areaEquipo:'SECADORES'},'n3');
const azul=crear({tipo:'Azul',descripcion:'azul',areaResponsable:'Producción'},'n4');
const cer=crear({tipo:'Roja',descripcion:'Luminaria quemada',horasEstimadas:1,personasNecesarias:1},'n5');
const anu=crear({tipo:'Roja',descripcion:'se anula'},'n6');
E.call({action:'actualizar',id:anu,usuario:'Baier, Juan Carlos',cambios:{estado:'Anulada',motivo:'duplicada'}});
// cierre con horas por persona y dia
const hoy=new Date(), p2=n=>String(n).padStart(2,'0'), dia=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
const ayer=new Date(Date.now()-864e5), man=new Date(Date.now()+864e5);
let r=E.call({action:'cerrar',id:cer,accion:'Se reemplazo; "probado"',cerradoPor:'Baier, Juan Carlos',causa:'Desgaste',usuario:'Baier, Juan Carlos',
  horasDetalle:[{p:'Baier, Juan Carlos',f:dia(ayer),h:2.5},{p:'Arrieta, Ceferino Juan Cruz',f:dia(hoy),h:1},{p:'Baier, Juan Carlos',f:dia(ayer),h:0.5},{p:'Rubio, Nicolas',f:dia(hoy),h:1}],
  fechaInicio:dia(ayer)+' 13:00'});
ok(r.ok,'cierre con horas por persona '+JSON.stringify(r));
t=T();
ok(+t[cer]['Horas reales']===5 && +t[cer]['Personas reales']===3,'horas reales = suma, personas distintas ('+t[cer]['Horas reales']+','+t[cer]['Personas reales']+')');
ok(t[cer]['Fecha inicio real']===dia(ayer)+' 13:00','guarda inicio real');
const otro=crear({tipo:'Roja',descripcion:'otro'},'n7');
r=E.call({action:'cerrar',id:otro,accion:'x',cerradoPor:'Baier, Juan Carlos',causa:'Otra',usuario:'Baier, Juan Carlos',horasDetalle:[{p:'Baier, Juan Carlos',f:dia(man),h:1}]});
ok(!r.ok && /futura/.test(r.error),'rechaza horas con fecha futura');
r=E.call({action:'cerrar',id:otro,accion:'x',cerradoPor:'Baier, Juan Carlos',causa:'Otra',usuario:'Baier, Juan Carlos',horasDetalle:[{p:'Baier, Juan Carlos',f:dia(hoy),h:25}]});
ok(!r.ok,'rechaza mas de 24 h por dia');

// exportacion (via lectura del EAM)
X.csvEAM('ID_Tarjeta;OT_EAM;Descripcion_OT;Equipo;Descripcion_Equipo;Hs_Estimadas;Personas_Necesarias;Asignado_A;Fecha_Inicio_Programada;Empleados;Hs_Reales;Fecha_Cierre;Comentario_Cierre;Estado\r\n');
r=E.call({action:'sincronizarEAM',usuario:'x'});
ok(r.ok && r.exportacion && !r.exportacion.sinCambios,'exporta en la sincronizacion '+JSON.stringify(r).slice(0,300));
const ord=X.orden().join(',');
ok(ord.indexOf('create:tarjetas_horas.csv.tmp')>-1 && ord.indexOf('create:tarjetas_horas.csv.tmp') < ord.indexOf('create:tarjetas_para_eam.csv.tmp'),'escribe primero horas, despues tarjetas, con .tmp');
const TC=X.get('tarjetas_para_eam.csv'), HC=X.get('tarjetas_horas.csv');
ok(TC && TC.charCodeAt(0)===0xFEFF && HC.charCodeAt(0)===0xFEFF,'BOM en los dos archivos');
ok(!/[^\r]\n/.test(TC) && /\r\n$/.test(TC),'CRLF en todas las lineas');
const F=parse(TC), Hh=parse(HC);
ok(F[0].join(';')==='ID_Tarjeta;Estado_Tarjeta;Fecha_Tarjeta;Descripcion;Detalle;Equipo;Naturaleza;Condicion;Taller;Prioridad;Solicitante;Solicitante_Nombre;Fecha_Objetivo;Sector;Hs_Estimadas;Personas;Fecha_Inicio_Real;Fecha_Fin_Real;Comentario_Cierre;Lineas_Horas','encabezado exacto');
ok(Hh[0].join(';')==='ID_Tarjeta;Legajo;Fecha;Horas','encabezado horas exacto');
ok(F.slice(1).every(f=>f.length===20),'20 columnas en cada fila');
const fila={}; F.slice(1).forEach(f=>{ const o={}; F[0].forEach((h,i)=>o[h]=f[i]); fila[o.ID_Tarjeta]=o; });
const ids=Object.keys(fila);
ok(ids.indexOf(azul)===-1,'azules no se exportan');
ok(ids.indexOf(viejaCerr)===-1 && ids.indexOf(viejaOT)===-1 && ids.indexOf(viejaAb)>-1,'migracion respetada');
ok(new Set(ids).size===ids.length,'ID sin repetir');
let a=fila[ab];
ok(a.Estado_Tarjeta==='ABIERTA' && a.Naturaleza==='CORRECTIVO' && a.Condicion==='MARCHA' && a.Taller==='TE' && a.Prioridad==='10','abierta: lista de valores '+JSON.stringify(a));
ok(a.Descripcion==='Perdida de aire; "acople" del rodillo','titulo = primera linea con ; y comillas');
ok(a.Detalle.indexOf('se escucha fuga')>-1 && !/\n/.test(a.Detalle),'detalle completo sin saltos');
ok(/"Perdida de aire; ""acople"" del rodillo"/.test(TC),'comillas y ; escapados (CSV estandar)');
ok(a.Equipo==='PULPER E20' && a.Sector==='PULPERS' && a.Solicitante==='4300' && a.Solicitante_Nombre==='Baier, Juan Carlos','equipo, sector, legajo del solicitante');
ok(a.Hs_Estimadas==='' && a.Personas==='' && a.Fecha_Inicio_Real==='' && a.Lineas_Horas==='','sin horas: solicitud de trabajo; cierre vacio');
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.Fecha_Tarjeta),'fecha y hora con formato');
let b=fila[conHs];
ok(b.Hs_Estimadas==='1.5' && b.Personas==='2' && b.Condicion==='PARADA' && b.Taller==='TI' && b.Prioridad==='7','con horas: decimal con punto, personas, ICOPRO=TI, Baja=7');
let c=fila[larga];
ok(c.Descripcion.length===80 && c.Naturaleza==='MEJORA' && c.Condicion==='PARADA' && c.Equipo==='INST-GRAL' && c.Taller==='TM','verde: 80 car., MEJORA, A definir->PARADA, LUG->INST-GRAL, taller TM');
let d=fila[cer];
ok(d.Estado_Tarjeta==='CERRADA' && d.Fecha_Inicio_Real===dia(ayer)+' 13:00' && d.Fecha_Fin_Real>=d.Fecha_Inicio_Real,'cerrada: inicio y fin reales');
ok(/Se reemplazo; "probado"/.test(d.Comentario_Cierre),'comentario de cierre');
const hs=Hh.slice(1).filter(f=>f[0]===cer);
ok(d.Lineas_Horas==='2' && hs.length===2,'Lineas_Horas = filas de horas (sin la persona sin legajo) '+JSON.stringify(hs));
ok(hs.some(f=>f[1]==='4300' && f[2]===dia(ayer) && f[3]==='3') && hs.some(f=>f[1]==='4333' && f[3]==='1'),'mismo legajo y dia se suman; legajos del EAM');
ok(r=JSON.parse(E.PROPS.EAM_EXPORT_ULTIMA), r.sinLegajo.indexOf('Rubio, Nicolas')>-1,'informa personas sin legajo');
ok(fila[anu] && fila[anu].Estado_Tarjeta==='ANULADA','anulada sigue saliendo con su estado');
// segunda corrida sin cambios: no reescribe
const n0=X.orden().length; r=E.call({action:'sincronizarEAM',usuario:'x'});
ok(r.exportacion.sinCambios && X.orden().length===n0,'sin cambios no reescribe');
// descarga desde Seguimiento
r=E.call({action:'descargaEAM'}); ok(r.ok && r.tarjetas===TC && r.horas===HC,'descarga = mismos archivos');

// vuelta del EAM: Terminado (cierre confirmado), Cancelado, Planificado
const lin=(id,ot,est,extra)=>[id,ot,'d','PULPER E20','Pulper','','','','','',0,extra||'','',est].join(';');
X.csvEAM(['ID_Tarjeta;OT_EAM;Descripcion_OT;Equipo;Descripcion_Equipo;Hs_Estimadas;Personas_Necesarias;Asignado_A;Fecha_Inicio_Programada;Empleados;Hs_Reales;Fecha_Cierre;Comentario_Cierre;Estado',
  lin(cer,'200001','Terminado','2026-10-06 15:30'), lin(ab,'200002','Cancelado'), lin(conHs,'200003','Solicitud de trabajo')].join('\r\n'));
r=E.call({action:'sincronizarEAM',usuario:'x'});
t=T();
ok(t[ab].Estado==='Anulada' && /Cancelado por Mantenimiento/.test(t[ab].Notas),'Cancelado: tarjeta anulada con nota');
ok(String(t[conHs]['N OT'])==='200003' && t[conHs].Estado==='Abierta' && !t[conHs]['Fecha planificada'],'Solicitud de trabajo: muestra OT, sin programar');
const F2=parse(X.get('tarjetas_para_eam.csv')).slice(1).map(f=>f[0]);
ok(F2.indexOf(cer)===-1 && F2.indexOf(ab)===-1 && F2.indexOf(conHs)>-1,'estados finales dejan de exportarse');
ok(parse(X.get('tarjetas_horas.csv')).slice(1).every(f=>f[0]!==cer),'sus horas tambien salen del archivo');

// rechazos
X.rech('﻿ID_Tarjeta;Fecha_Intento;Columna;Motivo\r\n'+conHs+';2026-10-07 10:00;Equipo;Equipo X no existe en EAM\r\n'+larga+';2026-10-07 10:00;;AVISO: revisar\r\n');
r=E.call({action:'sincronizarEAM',usuario:'x'}); t=T();
ok(/Equipo: Equipo X no existe/.test(t[conHs]['Rechazo EAM']) && /AVISO/.test(t[larga]['Rechazo EAM']),'rechazos guardados en la tarjeta');
X.rech('ID_Tarjeta;Fecha_Intento;Columna;Motivo\r\n'); r=E.call({action:'sincronizarEAM',usuario:'x'}); t=T();
ok(!t[conHs]['Rechazo EAM'] && !t[larga]['Rechazo EAM'],'rechazo resuelto: se limpia');
ok(E.call({action:'estadoEAM'}).exportacion.tarjetas>0,'estado informa la exportacion');
ok(JSON.parse(E.PROPS.EAM_EXPORT_ULTIMA).carpeta==='Carpeta EAM','informa la carpeta usada');
ok(E.st.lockErrors===0,'sin locks anidados');
console.log('INTERCAMBIO EAM: '+pass+' OK, '+fail+' FALLAS'); fails.forEach(f=>console.log('  ✖ '+f));
