import asyncio, re, json, time, urllib.request
from playwright.async_api import async_playwright
B='http://localhost:8080/'; API='http://localhost:8790/'
res={'ok':0,'fail':[]}; T=[]
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
DEMORA=2.5
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    ctx=await br.new_context(viewport={'width':1366,'height':900})
    estado={'caido':False}
    async def fw(route):
      if estado['caido']: return await route.abort('internetdisconnected')
      await asyncio.sleep(DEMORA)
      r=await route.fetch(url=API, method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
    await ctx.route('https://script.google.com/**', fw)
    await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
    await ctx.add_init_script("try{localStorage.setItem('tpm_yo',JSON.stringify('Rubio, Nicolas'))}catch(e){}")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    async def medir(url, cond):
      t0=time.time(); await pg.goto(B+url)
      while time.time()-t0<20:
        if await pg.evaluate(cond): return round(time.time()-t0,2)
        await pg.wait_for_timeout(50)
      return 99
    casos=[('dashboard.html',"document.getElementById('porCondicion') && document.getElementById('porCondicion').innerText.length>10"),
           ('seguimiento.html',"typeof TODAS!=='undefined' && TODAS.length>300 && document.querySelectorAll('#tbody tr').length>10"),
           ('index.html',"document.body.innerText.length>400 && !!document.querySelector('.kpi, .card')"),
           ('tv.html?area=todas',"document.getElementById('kpis') && document.getElementById('kpis').innerText.length>5"),
           ('planificacion.html',"typeof TODAS!=='undefined' && TODAS.length>300")]
    for u,cond in casos:
      t1=await medir(u,cond); await pg.wait_for_timeout(DEMORA*1000+1500)
      t2=await medir(u,cond)
      pill=await pg.evaluate("!!document.getElementById('pillDatos')")
      await pg.wait_for_timeout(DEMORA*1000+1500)
      pill2=await pg.evaluate("!!document.getElementById('pillDatos')")
      T.append('%s: primera vez %.1f s → con datos guardados %.1f s'%(u,t1,t2))
      ok((t1>=DEMORA-0.2 or u=='index.html') and t2<1.0,'%s: al volver a entrar se ve en menos de 1 s (%.2f s; primera %.2f s)'%(u,t2,t1))
      ok(pill and not pill2,'%s: muestra "Actualizando…" y lo saca al llegar los datos'%u)
    # después de guardar, Seguimiento no muestra datos viejos
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(DEMORA*1000+1500)
    i=await pg.evaluate("TODAS.find(t=>esAbierta(t)).ID")
    await pg.evaluate("abrir('%s')"%i); await pg.wait_for_timeout(300)
    nueva='Alta' if await pg.input_value('#gPrioridad')!='Alta' else 'Baja'
    await pg.select_option('#gPrioridad',nueva); await pg.click('#gGuardar'); await pg.wait_for_timeout(DEMORA*2000+1500)
    ok(await pg.evaluate("TODAS.find(t=>t.ID==='%s').Prioridad"%i)==nueva,'después de guardar se ve el dato nuevo (no el guardado viejo)')
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(600)
    ok(await pg.evaluate("TODAS.find(t=>t.ID==='%s').Prioridad"%i)==nueva,'al volver a entrar, lo guardado ya tiene el cambio')
    # sin conexión con datos guardados
    await pg.wait_for_timeout(DEMORA*1000+1000); estado['caido']=True
    await pg.goto(B+'dashboard.html'); await pg.wait_for_timeout(1500)
    pt=await pg.evaluate("(document.getElementById('pillDatos')||{}).textContent||''")
    ok('Sin conexión' in pt and len(await pg.inner_text('#porCondicion'))>10,'sin conexión muestra los últimos datos con aviso (%s)'%pt)
    estado['caido']=False
    # versión: no hay pedido extra de verificación cuando la lista ya trae la versión
    pedidos=[]
    pg.on('request', lambda r: pedidos.append(r.post_data) if 'script.google' in r.url else None)
    await pg.evaluate("sessionStorage.clear()"); await pg.goto(B+'dashboard.html'); await pg.wait_for_timeout(DEMORA*1000+7000)
    acc=[json.loads(x)['action'] for x in pedidos if x]
    ok(acc.count('ping')==0 and acc.count('listar')==1,'un solo pedido al abrir (sin ping aparte): %s'%acc)
    ok(not await pg.evaluate("!!document.getElementById('avisoBackend')"),'sin aviso de versión con el servidor al día')
    ok(not errs,'sin errores JS %s'%errs[:2])
    await br.close()
  print('\n'.join(T))
  print('RAPIDO: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
asyncio.run(main())
