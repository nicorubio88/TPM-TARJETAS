const {makeEnv}=require('./env.js'); const zlib=require('zlib');
let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c) pass++; else { fail++; fails.push(m); } };
global.__zlib=zlib;
const base={tipo:'Roja',detectadoPor:'Perez, Juan',areaEquipo:'PULPERS',equipo:'PULPER D30',componente:'PULPER D30',descripcion:'fuga',categoria:'Fuga (aceite / aire / agua / vapor)',prioridad:'Media',areaResponsable:'Mantenimiento Mecánico',poolResponsable:['Mec, A']};
const mock=src=>`
var __C={}, __stats={gets:0,hits:0,puts:0};
CacheService={getScriptCache:function(){return {get:function(k){__stats.gets++; if(__C[k]!==undefined){__stats.hits++;return __C[k];} return null;},put:function(k,v){__stats.puts++; __C[k]=v;}};}};
Utilities.newBlob=function(d,m){ var b=(typeof d==='string')?__B.from(d,'utf8'):__B.from(d); return {getBytes:function(){return b;},getDataAsString:function(){return b.toString('utf8');}}; };
Utilities.gzip=function(bl){ var z=__Z.gzipSync(bl.getBytes()); return {getBytes:function(){return z;}}; };
Utilities.ungzip=function(bl){ var u=__Z.gunzipSync(bl.getBytes()); return {getDataAsString:function(){return u.toString('utf8');}}; };
Utilities.base64Encode=function(b){ return __B.from(b).toString('base64'); };
Utilities.base64Decode=function(s){ return __B.from(s,'base64'); };
DriveApp.getFileById=function(){ return {getMimeType:function(){return 'text/csv'},getBlob:function(){return {getDataAsString:function(){return PropertiesService.getScriptProperties().getProperty('__CSV')||'';}}}}};
` + src.replace("case 'ping':","case '__stats': out = __stats; break;\n      case 'ping':");
const E=makeEnv(s=>"var __B=Buffer; var __Z=__zlib;"+mock(s));
for(let i=0;i<5;i++) E.call({action:'crear',data:Object.assign({},base,{clienteId:'c'+i})});
let a=E.call({action:'listar',desde:'2026-01-01'}), b=E.call({action:'listar',desde:'2026-01-01'});
ok(!a.cache && b.cache===true,'la segunda lectura sale de la caché');
ok(JSON.stringify(a.tarjetas)===JSON.stringify(b.tarjetas) && b.tarjetas.length===5,'la caché devuelve exactamente lo mismo');
ok(a.version===20 && b.version===20,'la lista trae la versión del servidor');
const id=a.tarjetas[0].ID;
E.call({action:'actualizar',id,usuario:'X',cambios:{prioridad:'Alta'}});
let c=E.call({action:'listar',desde:'2026-01-01'});
ok(!c.cache && c.tarjetas.find(t=>t.ID===id).Prioridad==='Alta','después de guardar, la lista se recalcula con el cambio');
ok(E.call({action:'listar',desde:'2026-01-01'}).cache===true,'y vuelve a quedar en caché');
E.call({action:'cerrar',id,accion:'x',cerradoPor:'Tec, Uno',causa:'Otra',horasReales:1,personasReales:1});
ok(E.call({action:'listar',desde:'2026-01-01'}).tarjetas.find(t=>t.ID===id).Estado==='Cerrada','el cierre se ve enseguida');
// un error en una escritura no invalida pero tampoco rompe
E.call({action:'listar',desde:'2026-01-01'});
E.call({action:'cerrar',id:'NO-EXISTE',accion:'x',cerradoPor:'a',causa:'Otra',horasReales:1,personasReales:1});
ok(E.call({action:'listar',desde:'2026-01-01'}).cache===true,'un error al guardar no descarta la caché');
// lectura del EAM con cambios invalida
const H='ID_Tarjeta\tOT_EAM\tDescripcion_OT\tEquipo\tDescripcion_Equipo\tHs_Estimadas\tPersonas_Necesarias\tAsignado_A\tFecha_Inicio_Programada\tEmpleados\tHs_Reales\tFecha_Cierre\tComentario_Cierre\tEstado';
const id2=a.tarjetas[1].ID;
E.PROPS.__CSV=H+'\n'+id2+'\t5\tx\tx\tx\t1\t1\t\t2026-10-05 0:00\t\t0\t\t\tPlanificado';
E.call({action:'listar',desde:'2026-01-01'});
// el disparador automático (fuera de la web app) también invalida
const E2=makeEnv(s=>"var __B=Buffer; var __Z=__zlib;"+mock(s).replace("case 'ping':","case '__trig': out = sincronizarEAM(); break;\n      case 'ping':"));
const x=E2.call({action:'crear',data:base}).id; E2.call({action:'listar'}); ok(E2.call({action:'listar'}).cache===true,'(E2) en caché');
E2.PROPS.__CSV=H+'\n'+x+'\t7\tx\tx\tx\t2\t1\tMARCONI JORGE\t2026-10-07 0:00\t\t0\t\t\tPlanificado';
E2.call({action:'__trig'}); let l2=E2.call({action:'listar'});
ok(!l2.cache && l2.tarjetas[0]['Estado EAM']==='Planificado','la lectura automática del EAM invalida la caché');
ok(E.call({action:'sincronizarEAM'}).ok && E.call({action:'listar',desde:'2026-01-01'}).tarjetas.find(t=>t.ID===id2)['N OT']==5,'la lectura manual del EAM se ve enseguida');
// sin CacheService (cuota, error): funciona igual
const E3=makeEnv(s=>"var __B=Buffer; var __Z=__zlib;"+mock(s)+"\n;CacheService={getScriptCache:function(){throw new Error('cuota');}};");
E3.call({action:'crear',data:base}); ok(E3.call({action:'listar'}).tarjetas.length===1,'si la caché falla, la lista sale igual');
console.log('CACHE: '+pass+' OK, '+fail+' FALLAS'); fails.forEach(f=>console.log('  ✖ '+f));
