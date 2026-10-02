const fs=require('fs'), vm=require('vm');
const S='/home/claude/tpm/TPM-TARJETAS-main/';
const ctx={console, window:{}, document:{addEventListener(){},getElementById(){return null}}, localStorage:{getItem(){return null},setItem(){}}, navigator:{}, location:{protocol:'http:'}, fetch(){}};
ctx.window=ctx; ctx.addEventListener=function(){}; vm.createContext(ctx);
for (const f of ['arbol.js','personas.js','comun.js']) vm.runInContext(fs.readFileSync(S+f,'utf8'), ctx, {filename:f});
let pass=0,fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log('  ✖ '+m);} };
const C=(id,o)=>Object.assign({ID:id,Tipo:'Roja',Estado:'Cerrada',Categoria:'Fuga (aceite / aire / agua / vapor)','Area equipo':'VACIO','Equipo':'BOMBAS','Componente/Ubicacion':'BOMBA VACIO 2'},o);
const hist=[
  C('A1',{Descripcion:'Pérdida de agua por el sello de la bomba de vacío','Accion de cierre':'Cambio de sello mecánico','Horas reales':4,'Personas reales':2,Especialidad:'Mecanica',Repuestos:'Sello mecánico 45mm','Condicion intervencion':'Maquina parada'}),
  C('A2',{Descripcion:'Bomba de vacío gotea por sello','Accion de cierre':'Reemplazo sello','Horas reales':5,'Personas reales':2,Especialidad:'Mecanica',Repuestos:'Sello mecánico 45mm; junta','Condicion intervencion':'Maquina parada'}),
  C('B1',{'Componente/Ubicacion':'BOMBA VACIO 1',Descripcion:'Cambio de bomba de vacío completa por rodamiento roto','Horas reales':8,'Personas reales':3,Especialidad:'Mecanica',Repuestos:'Bomba de vacío reacondicionada'}),
  C('B2',{'Area equipo':'PULPERS','Equipo':'PULPER','Componente/Ubicacion':'BOMBA PULPER',Descripcion:'Cambio de bomba por rodamiento roto, ruido','Horas reales':6,'Personas reales':2,Especialidad:'Mecanica'}),
  C('C1',{'Area equipo':'SECADO','Equipo':'SECADORES','Componente/Ubicacion':'TABLERO 3',Tipo:'Roja',Categoria:'Anomalia electrica',Descripcion:'Contactor quemado en tablero','Horas reales':2,'Personas reales':1,Especialidad:'Electrica'}),
  {ID:'X9',Tipo:'Roja',Estado:'Abierta',Descripcion:'otra','Horas estimadas':3}
];
const st=ctx.estadisticasEstimacion([], hist);
let e=ctx.estimarPorHistorial({Tipo:'Roja',Categoria:'Fuga (aceite / aire / agua / vapor)','Area equipo':'VACIO','Equipo':'BOMBAS','Componente/Ubicacion':'BOMBA VACIO 2',Descripcion:'Fuga de agua en el sello de la bomba'},st);
ok(e.nivel==='mismo equipo y trabajo' && e.n===2,'nivel 1 mismo equipo y trabajo: '+e.nivel+' n='+e.n);
ok(e.h===5||e.h===4,'horas mediana ~4.5 → '+e.h); ok(e.p===2,'personas 2'); ok(e.especialidad==='Mecanica','especialidad mecánica');
ok(e.repuestos[0]==='Sello mecánico 45mm','repuesto más usado'); ok(e.condicion==='Maquina parada','suele ser con parada');
e=ctx.estimarPorHistorial({Tipo:'Roja','Area equipo':'PREPARACION','Equipo':'TINAS','Componente/Ubicacion':'BOMBA TINA 4',Descripcion:'Hay que cambiar la bomba, rodamientos rotos'},st);
ok(e.nivel==='trabajo parecido' && e.n>=2,'nivel 2 trabajo parecido en otro equipo: '+e.nivel+' n='+e.n); ok(e.h>=6,'cambio de bomba ~7 h → '+e.h);
e=ctx.estimarPorHistorial({Tipo:'Roja',Categoria:'Anomalia electrica','Area equipo':'X','Equipo':'Y',Descripcion:'nada que ver'},st);
ok(e.nivel==='defecto','sin parecidos → defecto');
ok(ctx.duracionDe({Tipo:'Roja','Horas estimadas':'3'},st).fuente==='tarjeta','lo cargado manda');
ok(/2 casos/.test(ctx.textoEstimacion(ctx.estimarPorHistorial({ID:'Q1',Tipo:'Roja','Area equipo':'VACIO','Equipo':'BOMBAS','Componente/Ubicacion':'BOMBA VACIO 2',Descripcion:'sello de la bomba pierde'},st))),'texto explicativo');
ok(ctx.tokensTrabajo('Pérdida por los rodamientos').join()==='fuga,rodamiento','normaliza sinónimos y plurales: '+ctx.tokensTrabajo('Pérdida por los rodamientos').join());
console.log('ESTIMACION: '+pass+' OK, '+fail+' FALLAS');
