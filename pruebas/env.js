// Entorno Apps Script simulado, aislado por instancia (vm). Instrumenta llamadas y locks.
const fs=require('fs'), vm=require('vm');
const SRC='/home/claude/tpm/TPM-TARJETAS-main/Codigo.gs';
function conv(x){ if(typeof x==='string'){ if(/^'/.test(x)) return x.slice(1); if(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(x)) return new Date(x.replace(' ','T')+(x.length===10?'T00:00':'')); if(/^\d{1,2}:\d{2}$/.test(x)) { const [h,m]=x.split(':'); return new Date(1899,11,30,+h,+m); } } return x; }
function makeEnv(transform){
  const st={ranges:0,sets:0,appends:0,mails:[],fetches:[],lockHeld:false,lockErrors:0};
  function mkSheet(name){ return { name, rows:[],
    getLastRow(){ let n=this.rows.length; while(n>0 && (!this.rows[n-1]||this.rows[n-1].every(v=>v===''||v==null))) n--; return n; },
    getLastColumn(){ return Math.max(0,...this.rows.map(r=>r?r.length:0)); },
    getRange(r,c,nr=1,nc=1){ st.ranges++; const sh=this; if(r<1||c<1||nr<1||nc<1) throw new Error('Rango invalido '+[r,c,nr,nc]); const R={
      setValues(v){ st.sets++; if(v.length!==nr||v.some(x=>x.length!==nc)) throw new Error('Dimensiones no coinciden '+v.length+'x'+(v[0]||[]).length+' vs '+nr+'x'+nc); v.forEach((row,i)=>row.forEach((x,j)=>{ (sh.rows[r-1+i] ||= []); sh.rows[r-1+i][c-1+j]=conv(x); })); return R; },
      setValue(x){ st.sets++; (sh.rows[r-1] ||= []); sh.rows[r-1][c-1]=conv(x); return R; },
      getValues(){ const out=[]; for(let i=0;i<nr;i++){ const row=[]; for(let j=0;j<nc;j++){ const v=(sh.rows[r-1+i]||[])[c-1+j]; row.push(v==null?'':v);} out.push(row);} return out; },
      clearContent(){ for(let i=0;i<nr;i++) for(let j=0;j<nc;j++) if(sh.rows[r-1+i]) sh.rows[r-1+i][c-1+j]=''; return R; },
      setFontWeight(){return R}, setBackground(){return R}, setFontColor(){return R} }; return R; },
    appendRow(a){ st.appends++; this.rows[this.getLastRow()]=a.map(conv); }, deleteRow(i){ this.rows.splice(i-1,1); },
    setFrozenRows(){}, setColumnWidth(){} }; }
  const SHEETS={}, PROPS={};
  const FOLDER={files:[],createFile(n,c){ const f={n,c,t:false,setName(x){f.n=x;return f},setTrashed(){f.t=true;return f},getId(){return 'F'+FOLDER.files.indexOf(f)},getBlob(){return {getDataAsString:()=>f.c}}}; FOLDER.files.push(f); return f; },
    getFilesByName(n){ const l=FOLDER.files.filter(f=>f.n===n&&!f.t); let i=0; return {hasNext:()=>i<l.length,next:()=>l[i++]}; }};
  const p=n=>String(n).padStart(2,'0');
  const ctx={
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>SHEETS[n]||null, insertSheet:n=>(SHEETS[n]=mkSheet(n))})},
    Utilities:{formatDate:(d,tz,f)=>f.replace('yyyy',d.getFullYear()).replace(/yy(?!yy)/,String(d.getFullYear()).slice(2)).replace('MM',p(d.getMonth()+1)).replace('dd',p(d.getDate())).replace('HH',p(d.getHours())).replace('mm',p(d.getMinutes())).replace('ss',p(d.getSeconds())),
      DigestAlgorithm:{MD5:1}, Charset:{UTF_8:1}, computeDigest:(a,x)=>{ let h=0; for(let i=0;i<x.length;i++) h=(h*31+x.charCodeAt(i))|0; return [h]; }, base64Encode:b=>Buffer.from(String(b)).toString('base64'),
      base64Decode:s=>{ if(!/^[A-Za-z0-9+/=]+$/.test(s)) throw new Error('base64 invalido'); return Buffer.from(s,'base64'); }, newBlob:(b,m,n)=>({b,m,n})},
    DriveApp:{getFoldersByName:()=>({hasNext:()=>true,next:()=>({createFile:()=>{const id='FILE'+Math.random().toString(36).slice(2,7); return {getId:()=>id,setSharing(){}};}})}),getFolderById:()=>FOLDER,Access:{},Permission:{}},
    MimeType:{CSV:'text/csv'},
    MailApp:{sendEmail:(a,b,c)=>st.mails.push(typeof a==='object'?a:{to:a,subject:b,body:c})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>PROPS[k]||null,setProperty:(k,v)=>{PROPS[k]=v}})},
    LockService:{getScriptLock:()=>({waitLock(){ if(st.lockHeld){ st.lockErrors++; throw new Error('LOCK ANIDADO'); } st.lockHeld=true; },releaseLock(){ st.lockHeld=false; }})},
    UrlFetchApp:{fetch:(u,o)=>{ st.fetches.push({u,o}); return {getContentText:()=>'{"ok":true,"id":"EHS-9"}'}; }},
    ContentService:{MimeType:{JSON:1},createTextOutput:t=>({t,setMimeType(){return this}})},
    console, Date, JSON, Math, String, Number, Object, Array, Buffer, isNaN, parseFloat, parseInt, RegExp, Error, __zlib: require('zlib')
  };
  vm.createContext(ctx);
  let src=fs.readFileSync(SRC,'utf8'); if(transform) src=transform(src);
  vm.runInContext(src+'\n;this.__api={doPost,handle_,escribir_,HEADERS,H_HIST};',ctx);
  const reset=()=>vm.runInContext('_CACHE={hojas:{},ids:null};_LOG=[];',ctx);
  const call=(o)=>{ reset(); const r=JSON.parse(ctx.__api.doPost({postData:{contents:JSON.stringify(o)}}).t); if(st.lockHeld){ st.lockErrors++; } return r; };
  return {call,SHEETS,PROPS,st,ctx,FOLDER,api:ctx.__api,raw:(txt)=>{ reset(); return JSON.parse(ctx.__api.doPost({postData:{contents:txt}}).t); }};
}
module.exports={makeEnv};
