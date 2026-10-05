const {makeEnv}=require('./env.js');
let pass=0, fail=0; const fails=[];
const ok=(c,m)=>{ if(c) pass++; else { fail++; fails.push(m); } };
const base={tipo:'Roja',detectadoPor:'Perez, Juan',areaEquipo:'PULPERS',equipo:'PULPER D30',componente:'PULPER D30',descripcion:'fuga',categoria:'Fuga (aceite / aire / agua / vapor)',prioridad:'Media',areaResponsable:'Mantenimiento Mecánico',poolResponsable:['Mec, A']};
// Drive y SpreadsheetApp simulados: archivos en una carpeta, copias de hojas, papelera
const mock=src=>`
var __DRIVE={files:[],folders:[],creadas:[]};
var __orig=SpreadsheetApp.getActiveSpreadsheet;
SpreadsheetApp.getActiveSpreadsheet=function(){ var __SS0=__orig(); __SS0.getSheets=function(){ return ['Tarjetas','Historial','Hoja 1'].map(function(n){ var sh=__SS0.getSheetByName(n)||__SS0.insertSheet(n); sh.getName=function(){return n;}; sh.copyTo=function(d){ var c={n:'Copia de '+n,rows:JSON.parse(JSON.stringify(sh.rows)),setName:function(x){ if(d._sh.some(function(o){return o!==c&&o.n===x;})) throw new Error('Ya existe una hoja con el nombre "'+x+'". Introduce un nombre distinto.'); this.n=x;},getName:function(){return this.n;}}; d._sh.push(c); return c; }; return sh; }); }; return __SS0; };
SpreadsheetApp.create=function(nombre){ var id='SS'+(__DRIVE.creadas.length+1); var d={_id:id,_n:nombre,_sh:[{n:'Hoja 1',getName:function(){return this.n;},setName:function(x){this.n=x;}}],getId:function(){return id;},getUrl:function(){return 'https://docs/'+id;},getSheets:function(){return this._sh;},deleteSheet:function(h){this._sh=this._sh.filter(function(x){return x!==h;});}}; __DRIVE.creadas.push(d); __DRIVE.files.push({id:id,name:nombre,folder:null,trashed:false}); return d; };
DriveApp.getFoldersByName=function(n){ var f=__DRIVE.folders.filter(function(x){return x.name===n;}); var i=0; return {hasNext:function(){return i<f.length;},next:function(){return f[i++].api;}}; };
DriveApp.createFolder=function(n){ var fo={id:'F'+(__DRIVE.folders.length+1),name:n}; fo.api={getId:function(){return fo.id;},getUrl:function(){return 'https://drive/'+fo.id;},getFiles:function(){ var fs=__DRIVE.files.filter(function(x){return x.folder===fo.id&&!x.trashed;}); var i=0; return {hasNext:function(){return i<fs.length;},next:function(){var x=fs[i++]; return {getName:function(){return x.name;},setTrashed:function(){x.trashed=true;}};}}; }}; __DRIVE.folders.push(fo); return fo.api; };
DriveApp.getFolderById=function(id){ var f=__DRIVE.folders.filter(function(x){return x.id===id;})[0]; if(!f) throw new Error('no folder'); return f.api; };
DriveApp.getFileById=function(id){ var x=__DRIVE.files.filter(function(y){return y.id===id;})[0]; return {moveTo:function(fo){ x.folder=fo.getId(); }}; };
` + src.replace("case 'ping':","case '__bk': out = backupDiario(); break;\n      case '__drive': out = __DRIVE; break;\n      case '__old': (req.dias||[]).forEach(function(d){ __DRIVE.files.push({id:'O'+d,name:'Tarjetas TPM · backup '+d,folder:PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID'),trashed:false}); }); out={ok:true}; break;\n      case 'ping':");
const E=makeEnv(mock);
// el disparador queda semanal, domingos 3 a.m.
{ const trig=[]; const E0=makeEnv(src=>mock(src).replace("case 'ping':","case '__inst': out = instalarDisparadores(); break;\n      case '__trig': out = __T; break;\n      case 'ping':").replace('var __DRIVE=','var __T=[]; ScriptApp={WeekDay:{SUNDAY:\'SUNDAY\'},getProjectTriggers:function(){return [{getHandlerFunction:function(){return \'backupDiario\';}}];},deleteTrigger:function(){__T.push(\'del\');},newTrigger:function(f){var t={f:f};__T.push(t);var b={timeBased:function(){return b;},onWeekDay:function(d){t.dia=d;return b;},atHour:function(h){t.h=h;return b;},everyMinutes:function(m){t.min=m;return b;},everyDays:function(n){t.cadaDias=n;return b;},inTimezone:function(){return b;},create:function(){return t;}};return b;}};\nDriveApp.getFileById0=1; var __DRIVE='));
  const r0=E0.call({action:'__inst'}); const T=E0.call({action:'__trig'});
  const bk=T.find(t=>t.f==='backupSemanal'), eam=T.find(t=>t.f==='sincronizarEAM');
  ok(T[0]==='del','borra el disparador diario viejo');
  ok(bk && bk.dia==='SUNDAY' && bk.h===3 && !bk.cadaDias,'backup semanal: domingos 3 a.m.');
  ok(eam && eam.min===15,'sigue la lectura del EAM cada 15 min');
}
for(let i=0;i<3;i++) E.call({action:'crear',data:Object.assign({},base,{clienteId:'k'+i})});
let r=E.call({action:'__bk'});
ok(r.ok && r.origen==='automatico' && /^Tarjetas TPM · backup \d{4}-\d{2}-\d{2}$/.test(r.nombre),'backup automático con nombre por fecha: '+(r.nombre||r.error));
ok(r.hojas===3 && r.filas>=3,'copia las hojas (filas '+r.filas+')');
let d=E.call({action:'__drive'});
const c=d.creadas[0]; 
ok(c._sh.map(s=>s.n).join(',')==='Tarjetas,Historial,Hoja 1','la copia tiene las hojas con su nombre y sin la hoja vacía');
ok((c._sh[0].rows||[]).length===4,'la copia tiene los datos de Tarjetas');
ok(d.folders.length===1 && d.folders[0].name==='Backups Tarjetas TPM' && d.files[0].folder===d.folders[0].id,'queda en la carpeta Backups Tarjetas TPM');
ok(!E.st.lockHeld && E.st.lockErrors===0,'libera el lock');
const rA=E.call({action:'backupAhora',usuario:'Rubio, Nicolas'});
d=E.call({action:'__drive'});
ok(!rA.ok && d.creadas.length===1,'desde la app no se puede disparar un backup');
r=E.call({action:'__bk'}); d=E.call({action:'__drive'}); ok(r.ok && d.folders.length===1,'el segundo backup reusa la carpeta');
const eb=E.call({action:'estadoEAM'}).backup; ok(eb.ok && eb.fecha===r.fecha && !eb.url && !eb.carpeta && !eb.nombre,'el estado no expone links a la carpeta ni a la copia');
// retención: 30 días + uno por mes 12 meses
const p=n=>String(n).padStart(2,'0'), hoy=new Date(), dia=(off)=>{const x=new Date(hoy.getTime()-off*86400000); return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate());};
const dias=[]; for(let i=1;i<=420;i+=1) dias.push(dia(i));
E.call({action:'__old',dias});
r=E.call({action:'__bk'}); d=E.call({action:'__drive'});
const vivos=d.files.filter(f=>!f.trashed && f.folder).map(f=>f.name.slice(22,32));
const recientes=vivos.filter(x=>x>dia(84)).length, viejos=vivos.filter(x=>x<=dia(84));
const meses=new Set(viejos.map(x=>x.slice(0,7)));
ok(recientes>=1,'conserva lo reciente');
ok(viejos.length===meses.size && meses.size>=9 && meses.size<=13,'más atrás conserva uno por mes ('+viejos.length+')');
ok(!vivos.some(x=>x<dia(400)),'borra lo de más de 12 meses');
ok(r.borrados>300 && r.guardados===vivos.length,'informa borrados y guardados ('+r.borrados+'/'+r.guardados+')');
// error
const E2=makeEnv(src=>mock(src).replace("SpreadsheetApp.create=function(nombre){","SpreadsheetApp.create=function(nombre){ throw new Error('Cuota de Drive');"));
r=E2.call({action:'__bk'}); ok(!r.ok && /Cuota/.test(r.error) && E2.call({action:'estadoEAM'}).backup.ok===false,'error de backup queda registrado');
console.log('BACKUP: '+pass+' OK, '+fail+' FALLAS'); fails.forEach(f=>console.log('  ✖ '+f));
