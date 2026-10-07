import asyncio, re
from playwright.async_api import async_playwright
B='http://localhost:8080/'; res={'ok':0,'fail':[]}
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    ctx=await br.new_context(viewport={'width':1350,'height':950})
    async def fw(route):
      r=await route.fetch(url='http://localhost:8789/', method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
    await ctx.route('https://script.google.com/**', fw)
    await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
    await ctx.add_init_script("try{localStorage.setItem('tpm_yo',JSON.stringify('Rubio, Nicolas'))}catch(e){}")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2000)
    ok(await pg.evaluate("todasLasPersonas().filter(n=>/abarz/i.test(n)).length")==0,'Abarzúa fuera de la lista')
    ok(await pg.evaluate("resolverPersona('Fernandez, Adolfo')")=='Fernandez, Adolfo Antonio','resuelve nombre incompleto')
    ok(await pg.evaluate("resolverPersona('rincon fabio')")=='Rincon, Fabio Maria','resuelve sin coma ni mayúsculas')
    ok(await pg.evaluate("resolverPersona('Fernandez')")=='','apellido solo y ambiguo: no adivina')
    ok(await pg.evaluate("resolverPersona('Mecanico de Turno, ')")=='','texto que no es persona: vacío')
    ids=await pg.evaluate("TODAS.filter(t=>esAbierta(t)).slice(0,3).map(t=>t.ID)")
    # 1) tarjeta con ejecutor mal escrito (caso AZU-261001-1743-TEZ)
    await pg.evaluate("api('actualizar',{id:'%s',usuario:'Rubio, Nicolas',cambios:{ejecutores:'Fernandez, Adolfo',horasEstimadas:'1',personas:'1'}})"%ids[0])
    # 2) responsable que ya no está en la nómina
    await pg.evaluate("api('actualizar',{id:'%s',usuario:'Rubio, Nicolas',cambios:{responsable:'Abarzua, Osvaldo Daniel',ejecutores:''}})"%ids[1])
    # 3) texto basura como responsable
    await pg.evaluate("api('actualizar',{id:'%s',usuario:'Rubio, Nicolas',cambios:{responsable:'Mecanico de Turno, ',ejecutores:'Rincon Fabio'}})"%ids[2])
    await pg.evaluate("cargar()"); await pg.wait_for_timeout(1500)
    esperado=['Fernandez, Adolfo Antonio','Rubio, Nicolas','Rincon, Fabio Maria']
    for k,id in enumerate(ids):
      await pg.evaluate("abrir('%s')"%id); await pg.wait_for_timeout(300)
      ok(await pg.input_value('#rPor')==esperado[k],'precarga válida de "resuelta por" tarjeta %d: %s'%(k,await pg.input_value('#rPor')))
      if k==1:
        ok(await pg.input_value('#gResponsable')=='Abarzua, Osvaldo Daniel','responsable dado de baja se muestra (no se pierde)')
      await pg.fill('#rAccion','Se corrigió la anomalía'); await pg.select_option('#rCausa', index=1)
      if not await pg.locator('#rChHoras .chipsel.on').count(): await pg.click('#rChHoras .chipsel >> nth=0')
      if not await pg.locator('#rChPers .chipsel.on').count(): await pg.click('#rChPers .chipsel >> nth=0')
      await pg.click('#rCerrar'); await pg.wait_for_timeout(1800)
      t=await pg.evaluate("(()=>{var t=TODAS.find(x=>x.ID==='%s'); return [t.Estado,t['Cerrado por']]})()"%id)
      ok(t[0]=='Cerrada' and t[1]==esperado[k],'tarjeta %d se cierra (%s)'%(k,t))
    # verificar escribiendo nombre aproximado
    await pg.evaluate("abrir('%s')"%ids[0]); await pg.wait_for_timeout(300)
    await pg.fill('#vQuien','gisler guillermo'); await pg.click('#vOk'); await pg.wait_for_timeout(1800)
    t=await pg.evaluate("(()=>{var t=TODAS.find(x=>x.ID==='%s'); return [t.Estado,t['Verificado por']]})()"%ids[0])
    ok(t==['Verificada','Gisler, Guillermo'],'verifica con nombre aproximado '+str(t))
    # nombre inexistente: mensaje claro
    await pg.evaluate("abrir('%s')"%ids[1]); await pg.wait_for_timeout(300)
    await pg.fill('#vQuien','Perez Juan'); await pg.click('#vOk'); await pg.wait_for_timeout(500)
    ok('no está en la lista' in await pg.inner_text('body'),'mensaje claro con nombre inexistente')
    # gestión: ejecutores se normalizan / se rechaza desconocido
    oid=await pg.evaluate("TODAS.find(t=>esAbierta(t)&&t['Area responsable']).ID")
    await pg.click('#mCerrarX'); await pg.evaluate("abrir('%s')"%oid); await pg.wait_for_timeout(300)
    await pg.fill('#gEjecutores','gisler guillermo; Perez Juan'); await pg.click('#gGuardar'); await pg.wait_for_timeout(600)
    ok('Perez Juan' in await pg.inner_text('body') and 'no está en la lista' in await pg.inner_text('body'),'rechaza ejecutor desconocido')
    await pg.fill('#gEjecutores','gisler guillermo'); await pg.click('#gGuardar'); await pg.wait_for_timeout(1800)
    ok(await pg.evaluate("TODAS.find(x=>x.ID==='%s').Ejecutores"%oid)=='Gisler, Guillermo','ejecutor guardado con nombre de la lista')
    ok(not errs,'sin errores JS '+str(errs[:2]))
    await br.close()
  print('CIERRE: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
asyncio.run(main())
