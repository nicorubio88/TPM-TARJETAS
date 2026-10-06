const {makeEnv}=require('./env.js');
let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c) pass++; else { fail++; fails.push(m); } };
const base={tipo:'Roja',detectadoPor:'Perez, Juan',descripcion:'x',categoria:'Fuga (aceite / aire / agua / vapor)',prioridad:'Media',areaResponsable:'Mantenimiento Mecánico',poolResponsable:['Mec, A']};
const E=makeEnv(s=>s.replace("case 'ping':","case '__mig': out = migrarArbol_(); break;\n      case 'ping':"));
const mk=(a,e,c,extra)=>E.call({action:'crear',data:Object.assign({},base,{areaEquipo:a,equipo:e,componente:c,clienteId:Math.random()+''},extra||{})}).id;
const a1=mk('PULPERS','PULPER D30','TROMMEL PULPER D30');          // tiene equivalente seguro
const a2=mk('POPE','POPE','MANDO POPE');                            // tiene equivalente seguro
const a3=mk('SECADORES','PRIMER BATERIA (1 AL 12)','POLEAS DE SOGA 1º BAT');   // sin equivalente seguro
const a4=mk('PULPERS','Rastrillo Pulper E22','',{sistema:'RASTRILLO E22'});    // tarjeta nueva (ya con sistema)
const a5=mk('LABORATORIO','LABORATORIO DE CALIDAD','');
delete E.PROPS.migracion_arbol_v1; E.call({action:'ping'});
const T={}; E.call({action:'listar'}).tarjetas.forEach(t=>T[t.ID]=t);
ok(T[a1].Sistema==='REG.TROMMEL D30' && T[a1].Equipo==='Regadera Trommel Pulper D30' && T[a1]['Area equipo']==='PULPERS' && T[a1]['Componente/Ubicacion']===''&& T[a1].Sector==='PULPERS','migra a sistema, descripción y área nuevos');
ok(T[a1]['Ubicacion anterior']==='PULPERS › PULPER D30 › TROMMEL PULPER D30','guarda la ubicación anterior');
ok(T[a2].Sistema && T[a2]['Ubicacion anterior']==='POPE › POPE › MANDO POPE','POPE › MANDO POPE migra ('+T[a2].Sistema+')');
ok(!T[a3].Sistema && T[a3].Equipo==='PRIMER BATERIA (1 AL 12)' && T[a3]['Ubicacion anterior']==='SECADORES › PRIMER BATERIA (1 AL 12) › POLEAS DE SOGA 1º BAT','sin equivalente seguro: queda como estaba y con la ubicación anterior anotada');
ok(T[a4].Sistema==='RASTRILLO E22' && !T[a4]['Ubicacion anterior'],'tarjeta nueva: se guarda el sistema elegido y no se toca');
ok(T[a5].Sistema==='LUG.LAB.CALIDAD','lugares (laboratorio) migran a su código');
const h=E.call({action:'historial',id:a1}).historial; ok(h.some(x=>x.Accion==='Migracion arbol'),'la migración queda en el historial');
const n=E.SHEETS.Historial.getLastRow(); E.call({action:'ping'}); delete E.PROPS.x; ok(E.SHEETS.Historial.getLastRow()===n,'corre una sola vez');
// corrección: sistema como dato de la carga (pide identificarse y queda en el historial)
let r=E.call({action:'actualizar',id:a3,cambios:{areaEquipo:'SECADORES',equipo:'Mando M1S4 Secador 2 1ra. Bateria Cup',componente:'',sistema:'MAN.M1S4'}});
ok(!r.ok,'corregir la ubicación pide identificarse');
r=E.call({action:'actualizar',id:a3,usuario:'Rubio, Nicolas',cambios:{areaEquipo:'SECADORES',equipo:'Mando M1S4 Secador 2 1ra. Bateria Cup',componente:'',sistema:'MAN.M1S4'}});
const t3=E.call({action:'listar'}).tarjetas.find(t=>t.ID===a3);
ok(r.ok && t3.Sistema==='MAN.M1S4' && t3['Ubicacion anterior'].startsWith('SECADORES › PRIMER'),'corrección al árbol nuevo guarda el sistema y conserva la ubicación anterior');
ok(E.call({action:'historial',id:a3}).historial.some(x=>x.Campo==='Sistema' && x.Despues==='MAN.M1S4' && x.Usuario==='Rubio, Nicolas'),'historial: cambio de sistema con quién');
// EAM: el código de equipo del EAM completa el sistema si falta
const E2=makeEnv(s=>"DriveApp.getFileById=function(){ return {getMimeType:function(){return 'text/csv'},getBlob:function(){return {getDataAsString:function(){return PropertiesService.getScriptProperties().getProperty('__CSV')||'';}}}}};\n"+s);
const b1=E2.call({action:'crear',data:Object.assign({},base,{areaEquipo:'X',equipo:'Y',componente:''})}).id;
E2.PROPS.__CSV='ID_Tarjeta\tOT_EAM\tDescripcion_OT\tEquipo\tDescripcion_Equipo\tEstado\n'+b1+'\t1\tx\tTECI.RET251\tTornillo 251\tListo para planificar';
E2.call({action:'sincronizarEAM'}); ok(E2.call({action:'listar'}).tarjetas[0].Sistema==='TECI.RET251','el código de equipo del EAM completa el Sistema');
console.log('ARBOL: '+pass+' OK, '+fail+' FALLAS'); fails.forEach(f=>console.log('  ✖ '+f));
