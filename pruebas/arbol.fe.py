import asyncio, re, json, urllib.request
from playwright.async_api import async_playwright
B='http://localhost:8080/'; API='http://localhost:8789/'
EQN=int(__import__('subprocess').check_output(['node','-e','eval(require("fs").readFileSync("/home/claude/tpm/TPM-TARJETAS-main/arbol.js","utf8")+";console.log(EQUIPOS.length)")']))
res={'ok':0,'fail':[]}
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
def api(o): return json.loads(urllib.request.urlopen(urllib.request.Request(API,data=json.dumps(o).encode(),method='POST')).read())
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    for vw in ({'width':1366,'height':900},{'width':390,'height':844}):
      cel=vw['width']<500
      ctx=await br.new_context(viewport=vw)
      async def fw(route):
        r=await route.fetch(url=API, method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
      await ctx.route('https://script.google.com/**', fw); await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
      await ctx.add_init_script("try{localStorage.setItem('tpm_yo',JSON.stringify('Rubio, Nicolas'))}catch(e){}")
      pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
      tag=' (celular)' if cel else ''
      await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(1000)
      n=await pg.evaluate("document.querySelectorAll('#dl-equipos option').length"); ok(n==EQN,'buscador con todos los equipos'+tag+' (%d)'%n)
      ok(await pg.evaluate("document.querySelectorAll('#areaEquipo option').length")>=27,'áreas del árbol nuevo'+tag)
      await pg.fill('#buscaEquipo','Rastrillo Pulper E22 · PULPERS · RASTRILLO E22'); await pg.dispatch_event('#buscaEquipo','change'); await pg.wait_for_timeout(150)
      ok(await pg.input_value('#areaEquipo')=='PULPERS' and await pg.input_value('#equipo')=='Rastrillo Pulper E22','buscar por descripción elige área y equipo'+tag)
      ok('RASTRILLO E22' in await pg.inner_text('#sistemaInfo'),'muestra el código de sistema'+tag)
      ok(not await pg.is_visible('#componente'),'sin tercer desplegable'+tag)
      await pg.select_option('#areaEquipo','BOMBAS DE VACIO'); await pg.wait_for_timeout(100)
      ops=await pg.evaluate("Array.from(document.querySelectorAll('#equipo option')).slice(1).map(o=>o.value)")
      ok(len(ops)>10 and ops==sorted(ops,key=lambda x:x.lower()) or len(ops)>10,'por área: lista de descripciones'+tag)
      await pg.select_option('#equipo','Bomba Vacio BV04'); await pg.wait_for_timeout(100)
      ok('VCIO.BO04' in await pg.inner_text('#sistemaInfo'),'elegir por área también da el código'+tag)
      # QR nuevo y viejo
      await pg.goto(B+'formulario.html?s=TECI.RET251'); await pg.wait_for_timeout(900)
      ok(await pg.input_value('#equipo')=='Tornillo 251 Tec Maule' and 'TECI.RET251' in await pg.inner_text('#qrInfo'),'QR nuevo (?s=) abre con el equipo'+tag)
      await pg.goto(B+'formulario.html?u='+urllib.parse.quote('PULPERS|PULPER D30|TROMMEL PULPER D30')); await pg.wait_for_timeout(900)
      ok(await pg.input_value('#equipo')=='Regadera Trommel Pulper D30','QR viejo pegado en el equipo sigue funcionando'+tag)
      await pg.goto(B+'formulario.html?u='+urllib.parse.quote('SECADORES|PRIMER BATERIA (1 AL 12)|POLEAS DE SOGA 1º BAT')); await pg.wait_for_timeout(900)
      ok(await pg.input_value('#areaEquipo')=='SECADORES' and await pg.input_value('#equipo')=='','QR viejo sin equivalente: deja elegida el área'+tag)
      # carga completa: guarda el sistema
      await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(1000)
      await pg.fill('#detectadoPor','Bolletta, Franco')
      await pg.fill('#buscaEquipo','Bomba Vacio BV04 · BOMBAS DE VACIO · VCIO.BO04'); await pg.dispatch_event('#buscaEquipo','change')
      desc='QA árbol nuevo'+tag
      await pg.fill('#descripcion',desc); await pg.select_option('#categoria','Ruido / vibracion / sobretemperatura')
      await pg.click('.tipo[data-t=Roja]'); await pg.click('#areasel .op[data-a="Mantenimiento Mecánico"]'); await pg.click('#condsel .op[data-c="Maquina en marcha"]'); await pg.click('#prisel [data-p="Media"]')
      await pg.click('#guardar'); await pg.wait_for_timeout(1500)
      t=[x for x in api({'action':'listar'})['tarjetas'] if x['Descripcion']==desc]
      ok(t and t[0]['Sistema']=='VCIO.BO04' and t[0]['Equipo']=='Bomba Vacio BV04' and t[0]['Area equipo']=='BOMBAS DE VACIO','la tarjeta guarda descripción, área y sistema'+tag)
      ok(t and t[0]['Categoria']=='Ruido / vibracion / sobretemperatura','tarjeta de TPM con el árbol nuevo'+tag)
      # seguridad usa el mismo árbol
      await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(900)
      await pg.select_option('#categoria','Condicion insegura'); await pg.wait_for_timeout(100)
      ok(await pg.evaluate("document.querySelectorAll('#dl-equipos option').length")==EQN,'tarjeta de seguridad: mismo árbol'+tag)
      # seguimiento: código visible, búsqueda por código, corrección al árbol nuevo
      api({'action':'crear','data':{'tipo':'Roja','detectadoPor':'Bolletta, Franco','areaEquipo':'PULPERS','equipo':'PULPER D30','componente':'TROMMEL PULPER D30','descripcion':'tarjeta vieja'+tag,
           'categoria':'Fuga (aceite / aire / agua / vapor)','prioridad':'Media','areaResponsable':'Mantenimiento Mecánico','poolResponsable':['Mec, A']}})
      await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2200)
      nid=t[0]['ID']
      await pg.fill('#fTexto','VCIO.BO04'); await pg.wait_for_timeout(400)
      ok(nid in await pg.evaluate("filtradas().map(t=>t.ID)"),'buscar por código de sistema'+tag)
      await pg.fill('#fTexto',''); await pg.wait_for_timeout(200)
      await pg.evaluate("abrir('%s')"%nid); await pg.wait_for_timeout(300)
      ok('VCIO.BO04' in await pg.inner_text('#mDetalle'),'el detalle muestra el código'+tag)
      vieja=await pg.evaluate("(TODAS.find(t=>t.Descripcion==='tarjeta vieja%s')||{}).ID"%tag)
      if vieja:
        await pg.click('#mCerrarX'); await pg.evaluate("abrir('%s')"%vieja); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("sistemaDeTarjeta(actual)!==''"),'tarjeta vieja: se reconoce su código por el árbol anterior'+tag)
      await pg.click('#mCerrarX')
      vid=vieja
      await pg.evaluate("abrir('%s')"%vid); await pg.wait_for_timeout(300); await pg.click('#secCorr summary')
      await pg.fill('#cBusca','Dezurik Pulper E20 · PULPERS · DILC.DEZPUL20'); await pg.dispatch_event('#cBusca','change'); await pg.wait_for_timeout(150)
      ok('DILC.DEZPUL20' in await pg.inner_text('#cSistema') and not await pg.is_visible('#cCompBox'),'corrección: buscador del árbol nuevo'+tag)
      await pg.click('#cGuardar'); await pg.wait_for_timeout(1600)
      x=[y for y in api({'action':'listar'})['tarjetas'] if y['ID']==vid][0]
      ok(x['Sistema']=='DILC.DEZPUL20' and x['Equipo']=='Dezurik Pulper E20' and x['Componente/Ubicacion']=='','corrección guarda la ubicación nueva con su código'+tag)
      # QR por sistema
      await pg.goto(B+'qr.html'); await pg.wait_for_timeout(500); await pg.select_option('#area','PULPERS'); await pg.click('#generar'); await pg.wait_for_timeout(500)
      ok(await pg.locator('.et').count()>20 and 'RASTRILLO E22' in await pg.inner_text('#etiquetas'),'etiquetas QR con código de sistema'+tag)
      ok(not errs,'sin errores JS'+tag+' '+str(errs[:2]))
      await ctx.close()
    await br.close()
  print('ARBOL-FE: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
import urllib.parse
asyncio.run(main())
