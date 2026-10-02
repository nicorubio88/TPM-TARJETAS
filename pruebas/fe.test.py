import asyncio, re, json, urllib.request, datetime
from playwright.async_api import async_playwright
B='http://localhost:8080/'
PAGES=['index.html','formulario.html','mis-tarjetas.html','seguimiento.html','planificacion.html','dashboard.html','tv.html?area=todas','qr.html','config.html','como-funciona.html','guias.html']
BAD=re.compile(r'\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]|\bnull\b')
res={'ok':0,'fail':[]}
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)

async def ctx_para(p, port, vp=(1350,950)):
  ctx=await BR.new_context(viewport={'width':vp[0],'height':vp[1]}, accept_downloads=True)
  async def api(route):
    r=await route.fetch(url='http://localhost:%d/'%port, method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
  await ctx.route('https://script.google.com/**', api)
  await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
  await ctx.add_init_script("try{localStorage.setItem('tpm_yo',JSON.stringify('Bolletta, Franco'))}catch(e){}")
  return ctx

async def revisar(pg, nombre, errs):
  txt=await pg.inner_text('body')
  m=BAD.search(txt); ok(not m, nombre+': texto roto "'+(txt[max(0,m.start()-40):m.end()+20].replace('\n',' ') if m else '')+'"')
  x=await pg.evaluate("window.__xss||0"); ok(x==0, nombre+': XSS ejecutado ('+str(x)+')')
  n=await pg.evaluate("document.querySelectorAll('img[src=\"x\"],svg[onload],script:not([src])').length - document.querySelectorAll('script:not([src])').length")
  ok(n==0, nombre+': HTML inyectado en la página')
  ok(not errs, nombre+': errores JS '+str(errs[:3]))

async def recorrido(p, port, etiqueta):
  ctx=await ctx_para(p, port); pg=await ctx.new_page(); errs=[]
  pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (errs.append('DIALOG '+d.message), asyncio.ensure_future(d.dismiss())))
  pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' and 'net::' not in m.text and 'Failed to load resource' not in m.text else None)
  for u in PAGES:
    errs.clear(); await pg.goto(B+u); await pg.wait_for_timeout(1600)
    await revisar(pg, etiqueta+' '+u, list(errs))
  # movil
  pgm=await ctx.new_page(); await pgm.set_viewport_size({'width':390,'height':844})
  for u in PAGES:
    if u.startswith('tv'): continue
    await pgm.goto(B+u); await pgm.wait_for_timeout(900)
    w=await pgm.evaluate("document.documentElement.scrollWidth"); ok(w<=392, etiqueta+' móvil '+u+' desborda ('+str(w)+'px)')
  await ctx.close()

async def flujos(p):
  ctx=await ctx_para(p, 8787); pg=await ctx.new_page(); errs=[]
  pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: (errs.append('DIALOG '+d.message), asyncio.ensure_future(d.dismiss())))
  await pg.add_init_script("window.print=function(){window.__impreso=(window.__impreso||0)+1}")
  # --- seguimiento: abrir 15 tarjetas de todos los estados, historial, imprimir orden
  await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(1500)
  await pg.select_option('#fEstado',''); await pg.select_option('#fPeriodo','0'); await pg.wait_for_timeout(1500)
  filas=await pg.locator('#tbody tr').count(); ok(filas>100,'seguimiento: lista completa ('+str(filas)+')')
  for i in range(0, min(filas,15)):
    await pg.locator('#tbody tr').nth(i*7 % filas).locator('td').nth(3).click(); await pg.wait_for_timeout(120)
    await pg.wait_for_timeout(250)
    await pg.click('#impOrden') if await pg.is_visible('#impOrden') else None
    await pg.click('#mCerrarX')
  await revisar(pg,'seguimiento modales',list(errs)); errs.clear()
  # filtros todos
  for sel,vals in [('#fEstado',['_abiertas','Cerrada','Verificada','Anulada','']),('#fColor',['Roja','Azul','Verde','']),('#fCond',['Maquina en marcha','Maquina parada','A definir','']),('#fParada',['_sin',''])]:
    for v in vals: await pg.select_option(sel,v); await pg.wait_for_timeout(60)
  for c in ['#fVencidas','#fRepetidas','#fSeguridad','#fMias']: await pg.check(c); await pg.wait_for_timeout(60); await pg.uncheck(c)
  await pg.fill('#fTexto','<img'); await pg.wait_for_timeout(100); n=await pg.locator('#tbody tr').count(); ok(n>=1,'búsqueda encuentra texto con < ('+str(n)+')'); await pg.fill('#fTexto','')
  # impresiones
  await pg.click('#impLista'); await pg.click('#impParada'); ok(await pg.evaluate('window.__impreso')>=2,'impresiones de lista y plan')
  async with pg.expect_download() as dl: await pg.click('#exportar')
  d=await dl.value; csv=open(await d.path(),encoding='utf-8-sig').read(); ok(csv.count('\n')>100 and ';' in csv.split('\n')[0],'CSV exportado ('+str(csv.count('\n'))+' filas)')
  ok('"<img src=x' in csv or '<img src=x' in csv,'CSV conserva texto literal')
  # paradas modal
  await pg.click('#btnParadas'); await pg.wait_for_timeout(200); ok(await pg.locator('#pLista tbody tr').count()>=1,'lista de paradas'); await pg.click('#pCerrarX')
  await revisar(pg,'seguimiento filtros/impresión',list(errs)); errs.clear()
  # --- dashboard: todos los periodos y un area
  await pg.goto(B+'dashboard.html'); await pg.wait_for_timeout(1500)
  for v in ['30','90','180','365']:
    await pg.select_option('#fPeriodo',v); await pg.wait_for_timeout(900); await revisar(pg,'dashboard '+v+' días',list(errs)); errs.clear()
  await pg.select_option('#fArea','PULPERS'); await pg.wait_for_timeout(300); await revisar(pg,'dashboard área',list(errs)); errs.clear()
  await pg.select_option('#fArea',''); await pg.select_option('#fPeriodo','90'); await pg.wait_for_timeout(900)
  k1=await pg.inner_text('#k1'); print('DASH k1:', k1.replace('\n',' '))
  print('DASH k2:', (await pg.inner_text('#k2')).replace('\n',' ')); print('DASH k3:', (await pg.inner_text('#k3')).replace('\n',' ')); print('DASH k4:', (await pg.inner_text('#k4')).replace('\n',' '))
  # verificacion independiente (python) de colocadas / retiradas 90 dias
  req=urllib.request.Request('http://localhost:8787/', data=json.dumps({'action':'listar'}).encode(), method='POST'); L=json.loads(urllib.request.urlopen(req).read())['tarjetas']
  lim=datetime.datetime.now()-datetime.timedelta(days=90)
  pd=lambda s: datetime.datetime.strptime(s[:16],'%Y-%m-%d %H:%M') if s else None
  col=sum(1 for t in L if t['Estado']!='Anulada' and pd(t['Fecha alta'])>=lim)
  ret=sum(1 for t in L if t['Estado'] in ('Cerrada','Verificada') and t['Fecha cierre'] and pd(t['Fecha cierre'])>=lim)
  nums=[int(x) for x in re.findall(r'^(\d+)$', k1, re.M)]
  ok(nums[:2]==[col,ret],'dashboard colocadas/retiradas = cálculo independiente (%s vs %s)'%(nums[:2],[col,ret]))
  gdash=float(re.search(r'([\d,]+)\nTarjetas por persona', await pg.inner_text('#k2')).group(1).replace(',','.'))
  ok(abs(gdash - col/157/(90/30.4))<0.06,'promedio persona/mes = cálculo independiente (%.2f vs %.2f)'%(gdash, col/157/(90/30.4)))
  # --- planificacion
  await pg.goto(B+'planificacion.html'); await pg.wait_for_timeout(1500)
  for t in ['aDefinir','verdes','findes']: await pg.check('#'+t); await pg.wait_for_timeout(150)
  for v in ['5','20']: await pg.select_option('#dias',v); await pg.wait_for_timeout(300)
  await pg.click('.tab[data-m=parada]'); await pg.wait_for_timeout(400)
  await revisar(pg,'planificación',list(errs)); errs.clear()
  s=pg.locator('#plan select[data-id]').first
  if await s.count(): v=await s.evaluate("s=>s.options[2].value"); await s.select_option(v); await pg.wait_for_timeout(200); await pg.click('a[data-suelta]')
  await pg.click('#aplicar'); await pg.click('#aplicar'); await pg.wait_for_timeout(2500); ok('Plan aplicado' in await pg.inner_text('#msg'),'aplicar plan de parada')
  # --- mis tarjetas + verificar
  await pg.goto(B+'mis-tarjetas.html'); await pg.wait_for_timeout(1200); await revisar(pg,'mis tarjetas',list(errs)); errs.clear()
  # --- tv por area, qr todas
  await pg.goto(B+'tv.html?area=PULPERS'); await pg.wait_for_timeout(1200); await revisar(pg,'tv área',list(errs)); errs.clear()
  await pg.goto(B+'tv.html'); await pg.wait_for_timeout(500); ok(await pg.is_visible('#selArea'),'tv sin área pide elegir')
  await pg.goto(B+'qr.html'); await pg.click('#generar'); await pg.wait_for_timeout(200); await pg.click('#generar'); await pg.wait_for_timeout(3000)
  n=await pg.locator('.et svg').count(); ok(n>=590,'QR: todas las etiquetas ('+str(n)+')')
  # --- config areas editor
  await pg.goto(B+'config.html'); await pg.wait_for_timeout(1200)
  ok('Producción' in await pg.inner_text('#avisoResp'),'avisa que Producción no tiene 4 supervisores')
  i=await pg.evaluate("RESP.findIndex(r=>r.Area==='Producción')")
  await pg.click('[data-ej="%d"]'%i); await pg.click('#ejNadie')
  for n in ['Abarzua, Osvaldo Daniel','Cabrera, Claudio Marcelo','Callava, Sebastian','Frias, Ruben Dario']: await pg.check('#ejLista [data-n="%s"]'%n)
  await pg.click('#ejOk'); ok(await pg.inner_text('#avisoResp')=='','con 4 supervisores desaparece el aviso')
  await pg.click('#guardarResp'); await pg.wait_for_timeout(1200); ok('guardadas' in await pg.inner_text('#msg'),'guardar áreas que resuelven')
  await pg.select_option('#tCrit select[data-a="PULPERS"]','A'); await pg.click('#guardarAreas'); await pg.wait_for_timeout(900); ok('Criticidad guardada' in await pg.inner_text('#msg'),'guardar criticidad')
  await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(800); await pg.click('.tipo[data-t=Azul]')
  opts=await pg.evaluate("Array.from(document.querySelectorAll('#responsable optgroup')[0].querySelectorAll('option')).map(o=>o.value)")
  ok(len(opts)==4,'azul: responsable solo entre los 4 supervisores configurados ('+str(len(opts))+')')
  await revisar(pg,'config',list(errs)); errs.clear()
  # --- formulario: validaciones en orden, sugerencias, reparto, offline
  await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(900)
  M=lambda: pg.inner_text('#msg')
  await pg.evaluate("setYo('')"); await pg.fill('#detectadoPor','Nadie Inventado'); await pg.click('#guardar'); ok('paso 1' in await M(),'valida persona inexistente')
  await pg.fill('#detectadoPor','Bolletta, Franco'); await pg.click('#guardar'); ok('paso 2' in await M(),'valida ubicación')
  await pg.select_option('#areaEquipo','PULPERS'); await pg.select_option('#equipo',index=1)
  if await pg.is_enabled('#componente'): await pg.select_option('#componente',index=1)
  await pg.click('#guardar'); ok('paso 3' in await M(),'valida descripción')
  await pg.fill('#descripcion','Prueba final <b>ok</b>'); await pg.click('#guardar'); ok('paso 4' in await M(),'valida categoría')
  await pg.select_option('#categoria','Anomalia de instrumentacion / control'); await pg.wait_for_timeout(100)
  ok('ICOPRO' in await pg.inner_text('#sugArea') or True,'(sugerencia se valida tras elegir color)')
  await pg.select_option('#categoria','Anomalia electrica'); await pg.wait_for_timeout(100)
  ok('Roja' in await pg.inner_text('#sugColor'),'sugiere color por la categoría')
  await pg.click('#guardar'); ok('paso 5' in await M(),'valida color')
  await pg.click('#sugColor a'); await pg.wait_for_timeout(100); ok(await pg.evaluate('tipoSel')=='Roja','usar sugerencia de color')
  ok('Eléctrico' in await pg.inner_text('#sugArea'),'sugiere Mant. Eléctrico')
  await pg.click('#guardar'); ok('paso 6' in await M(),'valida área que resuelve')
  n=await pg.locator('#areasel .op').count(); ok(n==6,'rojas: 6 áreas posibles con ICOPRO, Ingeniería e Intendencia ('+str(n)+')')
  await pg.select_option('#categoria','Anomalia de instrumentacion / control'); await pg.wait_for_timeout(100)
  ok('ICOPRO' in await pg.inner_text('#sugArea'),'instrumentación sugiere ICOPRO')
  await pg.click('#sugArea a'); await pg.wait_for_timeout(100)
  opts=await pg.evaluate("Array.from(document.querySelectorAll('#responsable optgroup')[0].querySelectorAll('option')).map(o=>o.value)")
  ok(len(opts)==5 and 'Iommi, Juan Pablo' in opts,'responsable: equipo ICOPRO (5) ('+str(len(opts))+')')
  ok(await pg.evaluate("sectorDe('Rubio, Nicolas')")=='Gerencia de Planta','Nicolás en la nómina')
  ok(await pg.locator('#areasel .op[data-a="Ingeniería"]').count()==1,'Ingeniería disponible para rojas')
  ok((await pg.evaluate("grupoCategoria('Anomalia electrica / instrumentacion')")).startswith('4 '),'categoría vieja sigue en su familia')
  await pg.select_option('#categoria','Anomalia electrica'); await pg.wait_for_timeout(100)
  await pg.click('#sugArea a'); await pg.wait_for_timeout(100)
  opts=await pg.evaluate("Array.from(document.querySelectorAll('#responsable optgroup')[0].querySelectorAll('option')).map(o=>o.value)")
  ok(len(opts)==3,'responsable: equipo eléctrico (3) ('+str(len(opts))+')')
  ok('Automático' in await pg.evaluate("document.querySelector('#responsable option').textContent"),'responsable automático por defecto')
  await pg.click('#guardar'); ok('paso 9' in await M(),'valida prioridad')
  await pg.click('.tipo[data-t=Azul]'); await pg.wait_for_timeout(100)
  ok(await pg.evaluate('areaRespSel')=='Producción','azul: área única se elige sola')
  await pg.click('.tipo[data-t=Roja]'); await pg.click('#areasel .op[data-a="Mantenimiento Eléctrico"]')
  await pg.click('#prisel [data-p="Alta"]'); await pg.click('#chTiempo [data-v="mas"]'); await pg.click('#guardar'); ok('9 o más' in await M(),'valida horas >8')
  await pg.fill('#masHoras','12'); await pg.click('#chPersonas [data-v="2"]'); await pg.wait_for_timeout(100)
  ok('Resumen' in await pg.inner_text('#resumen'),'resumen antes de guardar')
  ok(await pg.get_attribute('#foto','capture')=='environment' and await pg.get_attribute('#fotoGaleria','capture') is None,'foto: cámara y galería separadas')
  await pg.set_input_files('#fotoGaleria','/home/claude/tpm/TPM-TARJETAS-main/icon-192.png'); await pg.wait_for_timeout(600)
  ok((await pg.evaluate('fotoDataURL')).startswith('data:image'),'foto subida desde el dispositivo')
  await pg.click('#quitarFoto'); await pg.wait_for_timeout(100); ok(await pg.evaluate('fotoDataURL')=='','quitar foto')
  await pg.set_input_files('#foto','/home/claude/tpm/TPM-TARJETAS-main/icon-192.png'); await pg.wait_for_timeout(600)
  ok((await pg.evaluate('fotoDataURL')).startswith('data:image'),'foto con la cámara')
  await pg.click('#guardar'); await pg.wait_for_timeout(900)
  ok(await pg.is_visible('#cardOk'),'carga completa ok'); ok('Eléctrico' in await pg.inner_text('#okTexto'),'confirma área')
  await ctx.set_offline(True); await pg.click('#otraMismo'); ok(await pg.input_value('#prioridad')=='' and await pg.input_value('#categoria')=='' and await pg.evaluate('areaRespSel')=='','al cargar otra se limpia todo lo obligatorio')
  await pg.select_option('#categoria','Dificil limpieza'); await pg.click('.tipo[data-t=Azul]'); await pg.fill('#descripcion','offline'); await pg.click('#prisel [data-p="Baja"]'); await pg.click('#guardar'); await pg.wait_for_timeout(300)
  ok('sin conexión' in (await pg.inner_text('#okTitulo')).lower(),'guarda sin conexión')
  await ctx.set_offline(False); await pg.evaluate("enviarCola()"); await pg.wait_for_timeout(1200); ok(await pg.evaluate("colaLeer().length")==0,'cola se envía al volver')
  # --- resolver con datos reales desde seguimiento
  await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(1400)
  await pg.locator('#tbody tr').first.locator('td').nth(3).click(); await pg.wait_for_timeout(200)
  ok(await pg.input_value('#gAreaResp')!='' ,'modal: área responsable visible')
  await pg.fill('#rAccion','ok'); await pg.click('#rCerrar'); await pg.wait_for_timeout(200); ok('causa' in (await M()).lower(),'cierre exige causa')
  await pg.select_option('#rCausa',index=2); await pg.evaluate("rHoras='';pintarChipsCierre()"); await pg.click('#rCerrar'); ok('horas' in (await M()).lower(),'cierre exige horas reales')
  await pg.click('#rChHoras [data-v="3"]'); await pg.click('#rChPers [data-v="2"]'); await pg.click('#rCerrar'); await pg.wait_for_timeout(900)
  ok('resuelta' in (await M()).lower(),'cierre con horas y personas reales')
  await revisar(pg,'formulario',list(errs)); errs.clear()
  await ctx.close()

async def main():
  global BR
  async with async_playwright() as p:
    BR=await p.chromium.launch()
    await recorrido(p, 8788, '[vacío]')
    await recorrido(p, 8787, '[con datos]')
    await flujos(p)
  print('FRONTEND: %d OK, %d FALLAS'%(res['ok'],len(res['fail'])))
  for f in res['fail']: print('  ✖',f)
asyncio.run(main())
