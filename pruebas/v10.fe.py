import asyncio, re, json, urllib.request, datetime
from playwright.async_api import async_playwright
B='http://localhost:8080/'; res={'ok':0,'fail':[]}
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
def api(port, body):
  r=urllib.request.urlopen(urllib.request.Request('http://localhost:%d/'%port, data=json.dumps(body).encode(), method='POST')); return json.loads(r.read())
async def main():
  # tarjeta que quedo de una parada pasada
  ayer=(datetime.date.today()-datetime.timedelta(days=3)).isoformat()
  c=api(8789,{'action':'crear','data':{'tipo':'Roja','detectadoPor':'Bolletta, Franco','areaEquipo':'PULPERS','equipo':'PULPER D30','componente':'PULPER D30','descripcion':'Cambio de rodamiento lado acople (quedó de la parada)','categoria':'Ruido / vibracion / sobretemperatura','prioridad':'Baja','areaResponsable':'Mantenimiento Mecánico','poolResponsable':['Bender, Lucas'],'condicion':'Maquina parada','horasEstimadas':2,'personasNecesarias':1}})
  api(8789,{'action':'actualizar','id':c['id'],'cambios':{'paradaObjetivo':ayer}})
  async with async_playwright() as p:
    br=await p.chromium.launch()
    ctx=await br.new_context(viewport={'width':1350,'height':950})
    async def fw(route):
      r=await route.fetch(url='http://localhost:8789/', method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
    await ctx.route('https://script.google.com/**', fw)
    await ctx.add_init_script("window.print=function(){window.__printed=(window.__printed||0)+1};try{localStorage.setItem('tpm_yo',JSON.stringify('Bolletta, Franco'))}catch(e){}")
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    # ---- planificacion
    await pg.goto(B+'planificacion.html'); await pg.wait_for_timeout(2500)
    ok('cierres con horas reales' in await pg.inner_text('#histInfo'),'planificación informa base del historial')
    ok('📊 historial' in await pg.inner_text('#plan'),'filas estimadas por historial')
    await pg.click('#vista button[data-v=gantt]'); await pg.wait_for_timeout(300)
    ok(await pg.locator('#plan table.gt tbody tr').count()>0 and await pg.locator('#plan .blq').count()>0,'Gantt marcha por persona')
    await pg.click('#ordenes'); await pg.wait_for_timeout(400)
    nR=await pg.locator('#printArea .ruta').count(); nO=await pg.locator('#printArea .orden-print').count()
    nA=await pg.evaluate('PLAN.asignadas.length'); nP=await pg.evaluate('personasDelPlan().length')
    ok(nR==nP and nO==nA,'OT: una hoja de ruta por persona (%d/%d) y una OT por tarea (%d/%d)'%(nR,nP,nO,nA))
    ok(await pg.evaluate('window.__printed||0')>=1,'OT se manda a imprimir')
    ok('HOJA DE RUTA' in await pg.inner_text('#printArea'),'hoja de ruta con título')
    await pg.evaluate("document.body.classList.remove('print-ot')")
    await pg.click('.tab[data-m=parada]'); await pg.wait_for_timeout(500)
    ok(await pg.locator('#plan .gp-fila').count()>0,'Gantt parada por persona')
    ok('↩' in await pg.inner_text('#avisos'),'aviso de tarjetas que quedaron de una parada anterior')
    await pg.click('#vista button[data-v=lista]'); await pg.wait_for_timeout(300)
    ok('quedó de la parada' in await pg.inner_text('#plan') or c['id'] in await pg.inner_text('#fuera'),'la tarjeta de la parada vencida vuelve a entrar')
    # ---- formulario: sugerencia por historial
    await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(1500)
    hist=await pg.evaluate("JSON.parse(localStorage.getItem('tpm_hist_est')||'{}').filas||[]")
    ok(len(hist)>20,'historial cacheado en el dispositivo (%d)'%len(hist))
    h=hist[0]
    await pg.select_option('#areaEquipo',h['Area equipo']); await pg.wait_for_timeout(100)
    try:
      await pg.select_option('#equipo',h['Equipo']); await pg.wait_for_timeout(100)
      if h['Componente/Ubicacion'] and await pg.is_enabled('#componente'): await pg.select_option('#componente',h['Componente/Ubicacion'])
    except Exception as e: pass
    await pg.click('.tipo[data-t=%s]'%h['Tipo']); await pg.fill('#descripcion',h['Descripcion']); await pg.wait_for_timeout(300)
    t=await pg.inner_text('#sugHist'); ok('Según el historial' in t,'sugiere por historial al cargar: '+t[:90])
    if await pg.locator('#usarEst').count():
      await pg.click('#usarEst'); await pg.wait_for_timeout(200)
      ok(await pg.evaluate('String(tiempoSel)')!='' and 'Usando' in await pg.inner_text('#sugHist'),'usar la estimación completa horas')
    # ---- seguimiento: filtro por persona
    await pg.goto(B+'seguimiento.html?persona='+urllib.parse.quote('Bolletta, Franco')); await pg.wait_for_timeout(1800)
    ok('Objetivo de' in await pg.inner_text('#fichaPersona'),'ficha de la persona con objetivo')
    ids=await pg.evaluate("filtradas().map(t=>[t['Detectado por'],t['Responsable asignado'],t['Ejecutores'],t['Cerrado por']].join('|'))")
    ok(len(ids)>0 and all('Bolletta, Franco' in x for x in ids),'filtro por persona (%d tarjetas)'%len(ids))
    await pg.select_option('#fRol','det'); await pg.wait_for_timeout(200)
    d=await pg.evaluate("filtradas().every(t=>t['Detectado por']==='Bolletta, Franco')"); ok(d,'filtro por rol: la detectó')
    # ---- dashboard: objetivo por persona
    await pg.goto(B+'dashboard.html'); await pg.wait_for_timeout(2500)
    ok(await pg.locator('#oTabla tbody tr').count()>0 and 'Cumplen el objetivo' in await pg.inner_text('#oKpis'),'dashboard: objetivo por persona')
    await pg.select_option('#oVer','si'); await pg.wait_for_timeout(200)
    rows=await pg.locator('#oTabla tbody tr').all_inner_texts(); ok(all('Cumple' in r for r in rows),'filtro "los que cumplen"')
    # ---- mis tarjetas
    await pg.goto(B+'mis-tarjetas.html'); await pg.wait_for_timeout(1500)
    ok(await pg.locator('#resumen .obj').count()==3,'mis tarjetas: objetivo por color')
    # movil: gantt y dashboard sin desborde del body
    m=await ctx.new_page(); await m.set_viewport_size({'width':390,'height':844})
    await m.goto(B+'planificacion.html'); await m.wait_for_timeout(2000); await m.click('#vista button[data-v=gantt]'); await m.wait_for_timeout(300)
    w=await m.evaluate('document.documentElement.scrollWidth'); ok(w<=392,'Gantt en celular no desborda la página (%d)'%w)
    await m.goto(B+'dashboard.html'); await m.wait_for_timeout(2000)
    w=await m.evaluate('document.documentElement.scrollWidth'); ok(w<=392,'dashboard en celular (%d)'%w)
    ok(not errs,'sin errores JS '+str(errs[:3]))
    await br.close()
  print('V10: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
import urllib.parse
asyncio.run(main())
