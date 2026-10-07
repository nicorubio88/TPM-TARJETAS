import asyncio, re
from playwright.async_api import async_playwright
B='http://localhost:8080/'; res={'ok':0,'fail':[]}
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    for vw in ({'width':1350,'height':950},{'width':390,'height':844}):
      ctx=await br.new_context(viewport=vw)
      async def fw(route):
        r=await route.fetch(url='http://localhost:8789/', method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
      await ctx.route('https://script.google.com/**', fw)
      await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
      pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
      await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(900)
      n=await pg.locator('#condsel .op').count(); ok(n==3,'3 casilleros de condición, sin "No sé" (%d)'%n)
      pp=pg.locator('#condsel .op[data-c="Parada planificada"]')
      ok('Para parada planificada' in await pp.inner_text(),'título casillero parada planificada')
      await pp.click(); await pg.wait_for_timeout(150)
      ok('parada planificada' in await pg.inner_text('#prioTit'),'título prioridad parada planificada')
      t=await pg.inner_text('#prisel')
      ok('Próxima parada sí o sí' in t and 'esperar una parada más' in t and 'más de 2 paradas' in t,'ayudas Alta/Media/Baja de parada planificada')
      await pg.locator('#condsel .op[data-c="Maquina en marcha"]').click(); await pg.wait_for_timeout(150)
      ok('atenderla ya' in await pg.inner_text('#prisel'),'vuelve la ayuda estándar en marcha')
      if vw['width']>1000:
        boxes=await pg.evaluate("[...document.querySelectorAll('#condsel .op')].map(e=>Math.round(e.getBoundingClientRect().top))")
        ok(len(set(boxes))==1,'los 4 en una fila en escritorio')
      await pg.goto(B+'dashboard.html'); await pg.wait_for_timeout(1800)
      ok(await pg.locator('#porCondicion .card').count()==4,'dashboard: 4 condiciones')
      await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(1800)
      ok(await pg.locator('#fCond option[value="Parada planificada"]').count()==1,'seguimiento: filtro parada planificada')
      ok(await pg.evaluate("esCondParada('Parada planificada') && esCondParada('Maquina parada') && !esCondParada('Maquina en marcha')"),'esCondParada')
      ok(not errs,'sin errores JS '+str(errs[:2]))
      await ctx.close()
    await br.close()
  print('V12: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
asyncio.run(main())
