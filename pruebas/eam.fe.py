import asyncio, re
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
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2200)
    ok(await pg.is_visible('#eamBar'),'barra EAM visible')
    ok('todavía no se sincronizó' in await pg.inner_text('#eamTxt'),'texto sin sincronizar')
    ok(await pg.locator('#fEstado option[value="_causaEAM"]').count()==1,'filtro causa a completar')
    id=await pg.evaluate("(()=>{var t=TODAS.find(x=>x.Estado==='Verificada'); t.Causa=CAUSA_EAM_PENDIENTE; t['Verificado por']='EAM · OT 159460'; render(); return t.ID})()")
    await pg.select_option('#fEstado','_causaEAM'); await pg.wait_for_timeout(200)
    f=await pg.evaluate('filtradas().map(t=>t.ID)'); ok(f==[id],'filtro devuelve la cerrada por EAM')
    await pg.evaluate("abrir('%s')"%id); await pg.wait_for_timeout(300)
    ok(await pg.is_visible('#secCausa'),'bloque completar causa visible')
    ok(await pg.locator('#kCausa option').count()>5,'causas cargadas')
    await pg.locator('#secCausa').screenshot(path='/tmp/claude-0/eam_causa.png')
    await pg.click('#mCerrarX')
    await pg.click('#eamSync'); await pg.wait_for_timeout(1200)
    ok('EAM:' in await pg.inner_text('#msg'),'botón sincronizar informa el resultado/error')
    ok('falló' in await pg.inner_text('#eamTxt'),'barra muestra la falla')
    other=await pg.evaluate("TODAS.find(x=>x.Causa!==CAUSA_EAM_PENDIENTE).ID")
    await pg.evaluate("abrir('%s')"%other); await pg.wait_for_timeout(200)
    ok(not await pg.is_visible('#secCausa'),'bloque oculto en tarjetas normales')
    await pg.click('#mCerrarX')
    await pg.screenshot(path='/tmp/claude-0/eam_bar.png', clip={'x':0,'y':0,'width':1350,'height':330})
    ok(not errs,'sin errores JS '+str(errs[:2]))
    await br.close()
  print('EAM-FE: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
asyncio.run(main())
