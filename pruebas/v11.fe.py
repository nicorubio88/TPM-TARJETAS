import asyncio, re, json, urllib.request
from playwright.async_api import async_playwright
B='http://localhost:8080/'; res={'ok':0,'fail':[]}
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(); ctx=await br.new_context(viewport={'width':1350,'height':950})
    async def fw(route):
      r=await route.fetch(url='http://localhost:8789/', method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
    await ctx.route('https://script.google.com/**', fw)
    await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
    await ctx.add_init_script("try{localStorage.setItem('tpm_yo',JSON.stringify('Rubio, Nicolas'))}catch(e){}")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    # ---- formulario: lugares nuevos, intendencia, orden condicion -> prioridad
    await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(900)
    areas=await pg.evaluate("Array.from(document.querySelectorAll('#areaEquipo option')).map(o=>o.value)")
    ok('LABORATORIO' in areas,'Laboratorio como lugar')
    await pg.select_option('#areaEquipo','ALISTAMIENTO'); await pg.wait_for_timeout(100)
    subs=await pg.evaluate("Array.from(document.querySelectorAll('#equipo option')).map(o=>o.value)")
    ok('Zona Cortadora' in subs and 'Depósito' in subs,'Alistamiento: zona cortadora y depósito')
    await pg.click('.tipo[data-t=Roja]'); await pg.wait_for_timeout(100)
    ok(await pg.locator('#areasel .op[data-a="Intendencia"]').count()==1,'Intendencia resuelve rojas')
    pasos=await pg.evaluate("Array.from(document.querySelectorAll('.paso')).map(x=>x.innerText)")
    i8=[x for x in pasos if x.startswith('8')][0]; i9=[x for x in pasos if x.startswith('9')][0]
    ok('marcha' in i8.lower() and 'prioridad' in i9.lower(),'primero máquina en marcha/parada, después prioridad')
    await pg.click('#condsel .op[data-c="Maquina parada"]'); await pg.wait_for_timeout(100)
    ok('máquina parada' in await pg.inner_text('#prioTit'),'la prioridad se pide dentro de "máquina parada"')
    ok(await pg.evaluate("personaValida('Poulain, Mauro') && personaValida('Belarra, Marcelo') && sectorDe('Guglielmo, Simon')==='Ingeniería' && personaValida('Fernandez, Diego')"),'nuevas personas de Ingeniería')
    # ---- seguimiento: filtros
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(1800)
    await pg.select_option('#fEstado',''); await pg.wait_for_timeout(200)
    tot=await pg.evaluate('filtradas().length')
    ids=await pg.evaluate('filtradas().map(t=>t.ID)'); target=ids[3]
    await pg.fill('#fID', target[-3:].lower()); await pg.wait_for_timeout(200)
    f=await pg.evaluate('filtradas().map(t=>t.ID)'); ok(target in f and len(f)<tot and all(target[-3:] in x for x in f),'filtro por código de tarjeta (%d)'%len(f))
    await pg.fill('#fID',''); await pg.select_option('#fSector','Operario'); await pg.wait_for_timeout(200)
    ok(await pg.evaluate("filtradas().length>0 && filtradas().every(t=>(t['Sector detector']||sectorDe(t['Detectado por']))==='Operario')"),'filtro por sector')
    await pg.select_option('#fSector',''); await pg.select_option('#fPrio','Alta'); await pg.wait_for_timeout(200)
    ok(await pg.evaluate("filtradas().length>0 && filtradas().every(t=>t.Prioridad==='Alta')"),'filtro por prioridad')
    await pg.select_option('#fPrio',''); await pg.select_option('#fOrden','condprio'); await pg.wait_for_timeout(200)
    seq=await pg.evaluate("filtradas().map(t=>[ORD_COND[condicionDe(t)], ORD_PRIO[t.Prioridad]??1])")
    ok(seq==sorted(seq),'orden por máquina y prioridad')
    ok('Prioridad' in await pg.inner_text('#tbody tr:first-child'),'la lista muestra la prioridad')
    # ---- corregir + historial
    await pg.select_option('#fOrden','fecha'); await pg.select_option('#fEstado','_abiertas'); await pg.wait_for_timeout(200)
    tid=await pg.evaluate('filtradas()[0].ID')
    await pg.evaluate("abrir(%s)"%json.dumps(tid)); await pg.wait_for_timeout(900)
    ok('Creó la tarjeta' in await pg.inner_text('#hist'),'historial visible al abrir')
    await pg.click('#secCorr summary'); await pg.fill('#cDesc','Descripción corregida en prueba')
    await pg.select_option('#cArea','LABORATORIO'); await pg.select_option('#cSub','Laboratorio de Calidad')
    await pg.click('#cGuardar'); await pg.wait_for_timeout(1500)
    ok('Corrección guardada' in await pg.inner_text('#msg'),'guarda corrección')
    h=await pg.inner_text('#hist')
    ok('Corrigió' in h and 'Descripcion' in h and 'Rubio, Nicolas' in h and 'LABORATORIO' in h,'historial muestra qué se corrigió y quién')
    ok('LABORATORIO' in await pg.inner_text('#mDetalle'),'la tarjeta muestra la ubicación corregida')
    # sin identificarse no corrige
    await pg.evaluate("setYo('')"); await pg.click('#secCorr summary'); await pg.fill('#cDesc','otra'); await pg.click('#cGuardar'); await pg.wait_for_timeout(300)
    ok('Identificate' in await pg.inner_text('#msg'),'pide identificarse para corregir')
    ok(not errs,'sin errores JS '+str(errs[:3]))
    # ---- aviso de backend viejo
    await pg.goto(B+'index.html'); await pg.wait_for_timeout(1500)
    ok(await pg.locator('#avisoBackend').count()==0,'sin aviso con backend al día')
    c2=await br.new_context()
    async def viejo(route): await route.fulfill(status=200, body='{"ok":false,"error":"Accion desconocida: ping"}', content_type='application/json')
    await c2.route('https://script.google.com/**', viejo)
    p2=await c2.new_page(); await p2.goto(B+'index.html'); await p2.wait_for_timeout(1500)
    ok(await p2.locator('#avisoBackend').count()==1,'aviso con backend viejo publicado')
    await c2.close()
    await br.close()
  print('V11: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
asyncio.run(main())
