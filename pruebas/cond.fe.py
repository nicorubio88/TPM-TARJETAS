import asyncio, re
from playwright.async_api import async_playwright
res={'ok':0,'fail':[]}
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch(); ctx=await br.new_context(viewport={'width':1440,'height':1000})
    async def fw(route):
      r=await route.fetch(url='http://localhost:8790/', method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
    await ctx.route('https://script.google.com/**', fw); await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto('http://localhost:8080/dashboard.html'); await pg.wait_for_timeout(4000)
    exp=await pg.evaluate("""(()=>{var o={}; TODAS.filter(esAbierta).forEach(t=>{var c=condicionDe(t); o[c]=(o[c]||0)+1;}); o.total=TODAS.filter(esAbierta).length; return o;})()""")
    tot=sum(int(x) for x in re.findall(r'(\d+)\npendientes hoy', await pg.inner_text('#porColor')))
    ok(tot==exp['total'],'total por color = pendientes (%s vs %s)'%(tot,exp['total']))
    suma=0
    for c,nm in [('Maquina en marcha','m'),('Maquina parada','p'),('Parada planificada','pl')]:
      await pg.click('#vistaCond button[data-c="%s"]'%c); await pg.wait_for_timeout(400)
      n=sum(int(x) for x in re.findall(r'(\d+)\npendientes hoy', await pg.inner_text('#porColor'))); suma+=n
      ok(n==exp.get(c,0),'%s: pendientes por color = %s (%s)'%(c,exp.get(c,0),n))
      av=await pg.inner_text('#condAviso'); ok(str(exp.get(c,0)) in av,'aviso %s: %s'%(c,av[:80]))
      if c=='Maquina en marcha': ok('no deberían quedar abiertas' in av and 'meta 7 d' in await pg.inner_text('#porColor'),'marcha usa meta 7 días')
      await pg.screenshot(path='/tmp/claude-0/cond_%s.png'%nm, clip={'x':0,'y':560,'width':1440,'height':640})
      await pg.click('#vista button[data-v="todas"]'); await pg.wait_for_timeout(300); ok(await pg.is_visible('#todasAcum svg'),'todas juntas con filtro '+c)
      await pg.click('#vista button[data-v="color"]'); await pg.wait_for_timeout(200)
    ok(suma + exp.get('A definir',0) == exp['total'],'marcha+parada+planificada+sin clasificar = total')
    await pg.click('#vistaCond button[data-c=""]'); await pg.wait_for_timeout(300)
    ok('sin clasificar' in await pg.inner_text('#condAviso'),'total avisa las sin clasificar')
    ok(not errs,'sin errores JS '+str(errs[:2]))
    await br.close()
  print('COND: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
asyncio.run(main())
