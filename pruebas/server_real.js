// Servidor de prueba con datos parecidos a los REALES (perfil de la planilla al 05/10/2026) + CSV real del EAM.
const {makeEnv}=require('./env.js'), http=require('http'), fs=require('fs');
const port=+process.argv[2]||8790;
const PJS=fs.readFileSync('/home/claude/tpm/TPM-TARJETAS-main/personas.js','utf8');
const mock=src=>"var __PJS="+JSON.stringify(PJS)+";\nUrlFetchApp={fetch:function(u){ return {getContentText:function(){ return /personas\\.js$/.test(u)?__PJS:'{}'; }}; }};\n"+
 "DriveApp.getFileById=function(){ return {getMimeType:function(){return 'text/csv'},getBlob:function(){return {getDataAsString:function(){return PropertiesService.getScriptProperties().getProperty('__CSV')||'';}}}}};\n"+
 src.replace("case 'ping':","case '__setcsv': PropertiesService.getScriptProperties().setProperty('__CSV', req.csv); out={ok:true}; break;\n      case '__raw': out = {rows: getSheet_().getRange(1,1,getSheet_().getLastRow(),HEADERS.length).getValues().length}; break;\n      case 'ping':");
const E=makeEnv(mock); E.call({action:'setup'});
const PER=eval(PJS.split('const PERSONAS =')[0]+';PERSONAS_POR_SECTOR');
const ARB=eval(fs.readFileSync('/home/claude/tpm/TPM-TARJETAS-main/arbol.js','utf8')+';ARBOL_EQUIPO');
const gente=Object.values(PER).flat(); const eqs=[]; for(const a in ARB) for(const s in ARB[a]) (ARB[a][s].length?ARB[a][s]:['']).forEach(e=>eqs.push([a,s,e]));
const cats=['Ajuste / apriete flojo','Desgaste / juego / holgura','Suciedad / falta de limpieza','Dificil operacion / ajuste','Fuga (aceite / aire / agua / vapor)','Ruido / vibracion / sobretemperatura','Condicion insegura','Anomalia electrica / instrumentacion'];
let sd=11; const rnd=()=>{sd=(sd*16807)%2147483647; return sd/2147483647;}; const pick=a=>a[Math.floor(rnd()*a.length)];
const p=n=>String(n).padStart(2,'0'); const fmt=d=>d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
const now=Date.now(), T=()=>E.SHEETS.Tarjetas, H=()=>T().rows[0];
const set=(id,col,v)=>{ const f=T().rows.findIndex(x=>x&&x[0]===id); T().rows[f][H().indexOf(col)]=v; };
const realIds=fs.readFileSync(__dirname+'/eam_real.tsv','utf8').trim().split('\n').slice(1).map(l=>l.split('\t')[0]);
const uniq=[...new Set(realIds)];
const tipos=[]; for(let i=0;i<226;i++) tipos.push('Roja'); for(let i=0;i<42;i++) tipos.push('Verde'); for(let i=0;i<41;i++) tipos.push('Azul');
const ids=[];
tipos.forEach((tipo,i)=>{
  const alta=new Date(now-Math.floor(rnd()*120)*864e5-rnd()*8*36e5), eq=pick(eqs), det=pick(gente.slice(0,120));
  const AR={Roja:['Mantenimiento Mecánico','Mantenimiento Eléctrico','ICOPRO'],Azul:['Producción'],Verde:['Mejora Enfocada']}[tipo], ar=pick(AR);
  const cond=rnd()<0.77?'A definir':pick(['Maquina en marcha','Maquina parada','Parada planificada']);
  const desc=i%34===0?'Pierde pasta por prensa\nSe ve goteo constante\n\ny ruido':pick(['Cambiar de lugar la chapa','Se observa suciedad en el motor','Soporte poleas torcido','Fiberizer 301, pierde aceite']);
  const r=E.call({action:'crear',usuario:det,data:{tipo,detectadoPor:det,areaResponsable:ar,poolResponsable:PER['Mantenimiento Mecánico'],areaEquipo:eq[0],equipo:eq[1],componente:eq[2],descripcion:desc,
    categoria:pick(cats),prioridad:pick(['Media','Media','Baja','Alta']),condicion:cond,fechaAlta:fmt(alta)}});
  ids.push(r.id);
  if(i<uniq.length){ set(r.id,'ID',uniq[i]); ids[i]=uniq[i]; }
});
E.call({action:'listar'});   // refresca cache de IDs
const id=i=>ids[i];
// legado: área responsable vacía en la mayoría, sin categoría (13), sin área equipo (1), sin turno, horario libre, N OT numérico
for(let i=uniq.length;i<ids.length;i++){ if(rnd()<0.7) set(id(i),'Area responsable',''); if(rnd()<0.6) set(id(i),'Turno',''); }
for(let i=0;i<13;i++) set(id(40+i),'Categoria','');
set(id(60),'Area equipo','');
['hasta 2026-10-06','07:00 - 16:00','10:00 a 11:00','09:00-16:00'].forEach((h,k)=>set(id(70+k),'Horario planificado',h));
set(id(80),'N OT',148047);
for(let k=0;k<9;k++) set(id(90+k),'Responsable asignado','__auto__');
set(id(91),'Ejecutores','__auto__');
// estados: 34 resueltas a verificar, 46 verificadas (24 por migración), 1 anulada, 7 en proceso
const quien=()=>pick(gente);
for(let k=0;k<80;k++){ const x=id(120+k); E.call({action:'cerrar',id:x,accion:'Se corrigió',cerradoPor:quien(),horasReales:pick([1,2,4]),personasReales:pick([1,2]),causa:pick(['Desgaste natural','Otra','Falta de limpieza / inspeccion'])});
  if(k>=34){ E.call({action:'verificar',id:x,ok:true,verificadoPor:quien()}); if(k<58) set(x,'Verificado por','(migracion v3)'); } }
E.call({action:'actualizar',id:id(210),usuario:'Rubio, Nicolas',cambios:{estado:'Anulada',motivo:'duplicada'}});
for(let k=0;k<7;k++) E.call({action:'actualizar',id:id(220+k),cambios:{estado:'En proceso',fechaPlanificada:'2026-10-0'+(5+k%4)}});
// las del EAM: algunas ya resueltas a mano como en la planta (YPG, 2F4, XCD)
const real=s=>uniq.indexOf(s);
[['ROJ-260814-2158-YPG','Se limpio motor'],['ROJ-261002-0812-2F4','Se cambio espiral'],['ROJ-260929-0945-XCD','Se reparo']].forEach(([s,a])=>E.call({action:'cerrar',id:s,accion:a,cerradoPor:'Montero, Marcelo',horasReales:1,personasReales:1,causa:'Desgaste natural'}));
E.call({action:'guardarParada',parada:{fecha:fmt(new Date(now+10*864e5)).slice(0,10),descripcion:'Parada mensual',hh:120,duracion:12,horaInicio:'06:00'}});
E.call({action:'__setcsv',csv:fs.readFileSync(__dirname+'/eam_real.tsv','utf8')});
delete E.PROPS.reparar_auto_v1;   // como en producción: la reparación corre en el primer pedido
http.createServer((req,res)=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ let out; try{ out=JSON.stringify(E.raw(b)); }catch(e){ out=JSON.stringify({ok:false,error:String(e)}); }
  res.writeHead(200,{'Content-Type':'application/json'}); res.end(out); }); }).listen(port,()=>console.log('api real-like',port, T().rows.length-1,'tarjetas'));
