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
      await ctx.add_init_script("try{localStorage.setItem('tpm_yo',JSON.stringify('Rubio, Nicolas'))}catch(e){}")
      pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
      await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2000)
      id=await pg.evaluate("TODAS.find(t=>esAbierta(t)&&t.Tipo==='Roja').ID")
      await pg.evaluate("abrir('%s')"%id); await pg.wait_for_timeout(300)
      await pg.click('#secCorr summary'); await pg.wait_for_timeout(150)
      ok(await pg.locator('#cColor .op').count()==3,'3 colores para corregir')
      ok('(actual)' in await pg.inner_text('#cColor .op.sel'),'marca el color actual')
      ok(not await pg.is_visible('#cAreaRespBox'),'sin cambio no pide área')
      await pg.click('#cColor .op[data-t="Azul"]'); await pg.wait_for_timeout(150)
      ok(await pg.is_visible('#cAreaRespBox') and await pg.locator('#cAreaResp option').count()>0,'al cambiar de color pide el área que resuelve')
      av=await pg.inner_text('#cColorAviso'); ok('Roja' in av and 'Azul' in av and 'no cambia' in av,'aviso del cambio y de que el código no cambia')
      await pg.click('#cGuardar'); await pg.wait_for_timeout(1800)
      t=await pg.evaluate("(()=>{var t=TODAS.find(x=>x.ID==='%s'); return [t.Tipo,t['Grupo responsable'],t['Area responsable']]})()"%id)
      ok(t[0]=='Azul' and t[1]=='Operacion','tarjeta pasa a Azul ('+str(t)+')')
      await pg.wait_for_timeout(600)
      ok('Color' in await pg.inner_text('#hist') and 'Azul' in await pg.inner_text('#hist'),'historial muestra el cambio de color')
      # tarjeta verificada: se puede corregir el color sin pedir área
      vid=await pg.evaluate("TODAS.find(t=>t.Estado==='Verificada'&&t.Tipo!=='Verde').ID")
      await pg.click('#mCerrarX'); await pg.evaluate("abrir('%s')"%vid); await pg.wait_for_timeout(300)
      await pg.click('#secCorr summary'); await pg.click('#cColor .op[data-t="Verde"]'); await pg.wait_for_timeout(150)
      ok(not await pg.is_visible('#cAreaRespBox'),'verificada: no pide área')
      await pg.click('#cGuardar'); await pg.wait_for_timeout(1800)
      ok(await pg.evaluate("TODAS.find(x=>x.ID==='%s').Tipo"%vid)=='Verde','verificada corregida a Verde')
      if vw['width']<500: await pg.locator('#secCorr').screenshot(path='/tmp/claude-0/color_m.png')
      ok(not errs,'sin errores JS '+str(errs[:2]))
      await ctx.close()
    await br.close()
  print('COLOR: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
asyncio.run(main())
