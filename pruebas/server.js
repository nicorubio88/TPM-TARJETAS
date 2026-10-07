const {makeEnv}=require('./env.js'), http=require('http'), fs=require('fs');
const port=+process.argv[2], seed=process.argv[3]==='seed'||process.argv[3]==='demo', demo=process.argv[3]==='demo';
const E=makeEnv(); E.PROPS.EAM_CARPETA_ID='TEST'; E.call({action:'setup'});
if(seed){
  const PER=eval(fs.readFileSync('/home/claude/tpm/TPM-TARJETAS-main/personas.js','utf8').split('const PERSONAS =')[0]+';PERSONAS_POR_SECTOR');
  const ARB=eval(fs.readFileSync('/home/claude/tpm/TPM-TARJETAS-main/arbol.js','utf8')+';ARBOL_EQUIPO');
  E.call({action:'sembrarMaestros',personas:PER,arbol:ARB});
  const gente=Object.values(PER).flat(); const eqs=[]; for(const a in ARB) for(const s in ARB[a]) (ARB[a][s].length?ARB[a][s]:['']).forEach(e=>eqs.push([a,s,e]));
  const cats=['Suciedad / falta de limpieza','Fuga (aceite / aire / agua / vapor)','Ruido / vibracion / sobretemperatura','Dificil inspeccion','Condicion insegura','Contaminacion / cuerpo extrano que afecta calidad','Ajuste / apriete flojo','Dificil limpieza'];
  let sd=7; const rnd=()=>{sd=(sd*16807)%2147483647; return sd/2147483647;}; const pick=a=>a[Math.floor(rnd()*a.length)];
  const p=n=>String(n).padStart(2,'0'); const fmt=d=>d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
  const now=Date.now(), hot=eqs.slice(40,44);
  const DESC={Roja:['Ruido en rodamiento lado accionamiento','Pérdida de aceite en reductor','Motor recalienta, se siente olor a quemado','Vibración anormal en bomba','Correa con desgaste y patinando','Sensor de nivel da lecturas erráticas','Fuga de vapor en brida','Válvula no cierra del todo'],
    Azul:['Acumulación de fibra y pasta en bandeja','Perno flojo en guarda','Falta lubricar cadena de transporte','Suciedad sobre motor, no disipa','Manguera de aire suelta','Nivel de aceite bajo en visor'],
    Verde:['Instalar bandeja para juntar goteo y evitar limpieza diaria','Colocar visor para inspeccionar sin sacar la guarda','Cambiar engrasador a lugar accesible','Marcar rangos normales en manómetros (control visual)']};
  for(let i=0;i<220;i++){
    const alta=new Date(now-Math.floor(rnd()*200)*864e5-rnd()*8*36e5); const eq=rnd()<0.25?pick(hot):pick(eqs); const det=pick(gente.slice(0,90));
    const tipo=rnd()<0.45?'Roja':rnd()<0.75?'Azul':'Verde';
    const AR={Roja:['Mantenimiento Mecánico','Mantenimiento Eléctrico'],Azul:['Producción'],Verde:['Mejora Enfocada']}[tipo]; const ar=pick(AR);
    const POOL={'Mantenimiento Mecánico':PER['Mantenimiento Mecánico'],'Mantenimiento Eléctrico':PER['Mantenimiento Eléctrico'],'Producción':PER['Producción'],'Mejora Enfocada':PER['Ingeniería']}[ar];
    const r=E.call({action:'crear',usuario:det,data:{tipo,detectadoPor:det,areaResponsable:ar,poolResponsable:POOL,areaEquipo:eq[0],equipo:eq[1],componente:eq[2],descripcion:demo?pick(DESC[tipo]):'Anomalía de prueba '+i,categoria:eq===hot[0]?cats[1]:pick(cats),
      prioridad:pick(['Alta','Media','Media','Baja']),condicion:pick(['Maquina en marcha','Maquina parada','A definir']),fechaAlta:fmt(alta),costo:tipo==='Verde'?Math.round(rnd()*3000):'',horasEstimadas:pick(['',1,2,3,4]),personasNecesarias:pick(['',1,2,3])}});
    if(rnd()<0.35) E.call({action:'actualizar',id:r.id,cambios:{especialidad:pick(['Mecanica','Electrica']),fechaCompromiso:fmt(new Date(alta.getTime()+(5+rnd()*20)*864e5)).slice(0,10)}});
    const ci=alta.getTime()+(1+rnd()*25)*864e5;
    if(ci<now && rnd()<0.7){ E.call({action:'cerrar',id:r.id,accion:'Se corrigió',cerradoPor:pick(gente),horasReales:pick([1,2,3,4]),personasReales:pick([1,2]),causa:pick(['Desgaste natural','Operacion incorrecta','Otra']),agregarMP:rnd()<0.2,actualizarEstandar:rnd()<0.15});
      E.api.escribir_ ? 0:0; const T=E.SHEETS.Tarjetas, h=T.rows[0], f=T.rows.findIndex(x=>x[0]===r.id); T.rows[f][h.indexOf('Fecha cierre')]=new Date(ci);
      if(rnd()<0.7) E.call({action:'verificar',id:r.id,ok:true,verificadoPor:det}); }
  }
  // XSS: textos maliciosos en todos los campos libres (no en la demo)
  if(!demo){
  const x=E.call({action:'crear',data:{tipo:'Roja',detectadoPor:'Bolletta, Franco',areaEquipo:'PULPERS',equipo:'PULPER D30',componente:'PULPER D30',descripcion:'<img src=x onerror="window.__xss=1"> "comillas" \'simples\' & <b>negrita</b>',categoria:'Condicion insegura',prioridad:'Alta',areaResponsable:'Mantenimiento Mecánico',poolResponsable:['Bender, Lucas']}});
  E.call({action:'actualizar',id:x.id,cambios:{repuestos:'<script>window.__xss=2</script>',notas:'"><svg onload=window.__xss=3>',ejecutores:'<i>x</i>, y; Bolletta, Franco',horario:'<u>h</u>',nOT:'"onmouseover="window.__xss=4'}});
  }
  const d=new Date(now+10*864e5); E.call({action:'guardarParada',parada:{fecha:fmt(d).slice(0,10),descripcion:'Parada <b>mensual</b>',hh:120,duracion:12,horaInicio:'06:00'}});
}
http.createServer((req,res)=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ let out; try{ out=JSON.stringify(E.raw(b)); }catch(e){ out=JSON.stringify({ok:false,error:String(e)}); }
  res.writeHead(200,{'Content-Type':'application/json'}); res.end(out); }); }).listen(port,()=>console.log('api',port,seed?'seed':'vacío'));
