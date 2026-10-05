# Prueba de punta a punta sobre una copia con datos como los reales (309 tarjetas) + CSV real del EAM.
import asyncio, re, json, urllib.request, datetime
from playwright.async_api import async_playwright
B='http://localhost:8080/'; API='http://localhost:8790/'
res={'ok':0,'fail':[]}; LOG=[]
def ok(c,m):
  if c: res['ok']+=1
  else: res['fail'].append(m)
  LOG.append(('OK ' if c else 'FALLA ')+m)
def api(o):
  r=urllib.request.urlopen(urllib.request.Request(API,data=json.dumps(o).encode(),method='POST')); return json.loads(r.read())
def num(x):
  try: return float(x)
  except: return float('nan')
def card(i):
  return next((t for t in api({'action':'listar'})['tarjetas'] if t['ID']==i), None)
TSV=open('/tmp/claude-0/qa/eam_real.tsv').read()
MAL=re.compile(r'NaN|undefined|\[object Object\]|Infinity')
async def main():
  async with async_playwright() as p:
    br=await p.chromium.launch()
    async def contexto(vw):
      ctx=await br.new_context(viewport=vw)
      async def fw(route):
        r=await route.fetch(url=API, method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
      await ctx.route('https://script.google.com/**', fw)
      await ctx.route(re.compile(r'https://fonts\..*'), lambda r: r.abort())
      await ctx.add_init_script("try{localStorage.setItem('tpm_yo',JSON.stringify('Rubio, Nicolas'))}catch(e){}")
      pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
      return ctx,pg,errs
    ctx,pg,errs=await contexto({'width':1366,'height':900})
    M=lambda: pg.inner_text('#msg')

    # ===== A. Todas las pantallas cargan con datos reales, en escritorio y celular
    PAGES=['index.html','formulario.html','mis-tarjetas.html','seguimiento.html','planificacion.html','dashboard.html','tv.html?area=todas','qr.html','config.html','como-funciona.html','guias.html']
    for vw in ({'width':1366,'height':900},{'width':390,'height':844}):
      c2,p2,e2=await contexto(vw)
      for pgn in PAGES:
        await p2.goto(B+pgn); await p2.wait_for_timeout(2500 if pgn in ('dashboard.html','planificacion.html') else 1500)
        txt=await p2.inner_text('body'); m=MAL.findall(txt)
        ok(not e2 and not m, 'A %s (%s): carga sin errores %s %s'%(pgn, 'celular' if vw['width']<500 else 'escritorio', e2[:1], m[:2])); e2.clear()
      await c2.close()
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2500)
    r=await pg.evaluate("(()=>{var malos=[],n=0; TODAS.forEach(t=>{ try{ abrir(t.ID); n++; var x=document.getElementById('mDetalle').innerText; if(/NaN|undefined|\\[object Object\\]/.test(x)) malos.push(t.ID);}catch(e){ malos.push(t.ID+' '+e.message);} }); document.getElementById('mCerrarX').click(); return [n,malos.slice(0,5),TODAS.filter(t=>t['Responsable asignado']==='__auto__').length]})()")
    ok(r[0]==309 and not r[1],'A: las 309 tarjetas abren sin errores ni textos rotos %s'%r[1])
    ok(r[2]==0,'A: no queda ningún responsable "__auto__" (reparación automática)')

    # ===== B. Lectura del EAM con el CSV real
    await pg.click('#eamSync'); await pg.wait_for_timeout(3000)
    st=api({'action':'estadoEAM'})['ultima']
    ok(st['ok'] and st['leidas']==20 and st['cruzadas']==19 and not st['sinTarjeta'] and not st['errores'],'B: lee las 20 OT reales, 19 tarjetas, sin errores (%s)'%{k:st.get(k) for k in ('leidas','cruzadas','cerradas','actualizadas','sinTarjeta','errores')})
    t=card('ROJ-261001-1418-PGM'); ok(t['Estado']=='En proceso' and t['Responsable asignado']=='Marconi, Jorge' and t['Fecha planificada']=='2026-10-05' and num(t['Horas estimadas'])==6 and str(t['N OT'])=='159459' and t['Estado EAM']=='Planificado','B: PGM planificada desde EAM')
    ok(card('ROJ-261002-1349-D7F')['Responsable asignado']=='Panis, Guillermo Adrian','B: "Guillermo Panis" → Panis, Guillermo Adrian')
    ok(card('ROJ-261002-1407-JBU')['Responsable asignado']=='Batstoc, Jonatan Braian','B: "Jonatan Brian Batstoc" → Batstoc, Jonatan Braian')
    t=card('ROJ-261001-1426-FG8'); ok(t['Estado']=='Verificada' and t['Ejecutores']=='Arrieta, Ceferino Juan Cruz; Marconi, Jorge' and num(t['Horas reales'])==2 and num(t['Personas reales'])==2 and t['Accion de cierre']=='Se limpió motor y ventilación' and t['Fecha cierre']=='2026-10-01 10:20' and t['Causa']=='A completar (cerrada desde EAM)','B: FG8 cerrada por EAM con datos reales (%s)'%t['Ejecutores'])
    t=card('ROJ-260930-1028-CFP'); ok(t['Estado']=='Verificada' and str(t['N OT'])=='159471; 159472' and num(t['Horas reales'])==6 and t['Fecha cierre']=='2026-09-30 13:32','B: CFP dos OT → 6 h, última fecha (%s, %s)'%(t['Horas reales'],t['Fecha cierre']))
    ok(card('ROJ-260721-0929-T6V')['Ejecutores']=='Colli Y Ockier, Maximiliano','B: COLLI Y OCKIER → Colli Y Ockier, Maximiliano')
    t=card('ROJ-261001-1739-GR2'); ok(num(t['Horas reales'])==12 and t['Ejecutores']=='Benzi, Lucas; Montero, Marcelo','B: GR2 12 h, dos ejecutores')
    t=card('ROJ-261002-0812-2F4'); ok(t['Estado']=='Verificada' and t['Accion de cierre']=='Se cambio espiral' and t['Verificado por']=='EAM · OT 159441','B: resuelta a mano + Terminado en EAM: se verifica sin pisar el cierre')
    t=card('ROJ-260814-2158-YPG'); ok(t['Estado']=='Cerrada' and t['Estado EAM']=='Listo para planificar','B: YPG resuelta acá y abierta en EAM')
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2500)
    f=await pg.evaluate("(()=>{var o={}; ['_planEAM','_vincEAM','_EAM','_causaEAM','_desfEAM','_plan'].forEach(function(v){ document.getElementById('fEstado').value=v; o[v]=filtradas().map(t=>t.ID); }); return o})()")
    ok('ROJ-261001-1418-PGM' in f['_planEAM'] and len(f['_planEAM'])==7,'B: filtro Planificadas en EAM (%d)'%len(f['_planEAM']))
    ok(f['_desfEAM']==['ROJ-260814-2158-YPG'],'B: filtro desfasadas = YPG %s'%f['_desfEAM'])
    ok(len(f['_EAM'])==11 and 'ROJ-260930-1028-CFP' in f['_EAM'],'B: filtro Cerradas por EAM (%d)'%len(f['_EAM']))
    ok('ROJ-261001-1426-FG8' in f['_causaEAM'],'B: FG8 con causa a completar')
    b=await pg.inner_text('#eamTxt'); ok('planificadas en EAM' in b and 'desfasadas' in b,'B: franja con totales')
    st2=api({'action':'sincronizarEAM'}); ok(st2['ok'] and st2['cerradas']==0 and st2['actualizadas']==0,'B: segunda lectura no cambia nada')

    # ===== C. Ciclo completo de una tarjeta nueva desde la pantalla
    await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(1200)
    await pg.fill('#detectadoPor','Bolletta, Franco')
    await pg.select_option('#areaEquipo','PULPERS'); await pg.wait_for_timeout(100); await pg.select_option('#equipo',index=1)
    if await pg.is_enabled('#componente'): await pg.select_option('#componente',index=1)
    await pg.fill('#descripcion','QA ciclo completo: pierde aceite el reductor')
    await pg.select_option('#categoria','Fuga (aceite / aire / agua / vapor)')
    await pg.click('.tipo[data-t=Roja]'); await pg.click('#areasel .op[data-a="Mantenimiento Mecánico"]')
    await pg.click('#condsel .op[data-c="Parada planificada"]'); await pg.click('#prisel [data-p="Alta"]')
    ok('Próxima parada' in await pg.inner_text('#prisel'),'C1: parada planificada muestra sus prioridades')
    await pg.set_input_files('#fotoGaleria','/home/claude/tpm/TPM-TARJETAS-main/icon-192.png'); await pg.wait_for_timeout(600)
    await pg.click('#guardar'); await pg.wait_for_timeout(1500)
    ok(await pg.is_visible('#cardOk'),'C1: tarjeta cargada desde el formulario')
    NUEVA=await pg.evaluate("(document.getElementById('okTexto').innerText.match(/ROJ-[0-9A-Z-]+/)||[''])[0]") or [t['ID'] for t in api({'action':'listar'})['tarjetas'] if 'QA ciclo completo' in t['Descripcion']][0]
    t=card(NUEVA); ok(t and t['Estado']=='Abierta' and t['Condicion intervencion']=='Parada planificada' and t['Prioridad']=='Alta' and t['Area responsable']=='Mantenimiento Mecánico' and t['Responsable asignado'] and t['Foto URL'],'C1: se guardó todo (condición, prioridad, área, responsable, foto) %s'%NUEVA)
    # gestión
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2500)
    await pg.fill('#fID',NUEVA[-3:]); await pg.wait_for_timeout(300)
    ok(await pg.locator('#tbody tr').count()>=1,'C2: se encuentra por código')
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.wait_for_timeout(400)
    await pg.fill('#gCompromiso','2026-10-20'); await pg.select_option('#gEspecialidad','Mecanica'); await pg.fill('#gHoras','3'); await pg.fill('#gOT','777001')
    await pg.click('#gGuardar'); await pg.wait_for_timeout(1500)
    t=card(NUEVA); ok(t['Fecha compromiso']=='2026-10-20' and t['Especialidad']=='Mecanica' and num(t['Horas estimadas'])==3 and str(t['N OT'])=='777001','C2: gestión guardada (fecha, especialidad, horas, OT)')
    # corrección de carga + color
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.wait_for_timeout(400)
    await pg.click('#secCorr summary'); await pg.fill('#cDesc','QA ciclo completo: pierde aceite el reductor (corregido)')
    await pg.click('#cColor .op[data-t="Azul"]'); await pg.wait_for_timeout(150); await pg.click('#cGuardar'); await pg.wait_for_timeout(1500)
    t=card(NUEVA); ok(t['Tipo']=='Azul' and t['Grupo responsable']=='Operacion' and t['Area responsable']=='Producción' and t['Descripcion'].endswith('(corregido)'),'C3: corrección de descripción y color a Azul guardada')
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.click('#secCorr summary'); await pg.click('#cColor .op[data-t="Roja"]'); await pg.wait_for_timeout(150)
    await pg.select_option('#cAreaResp','Mantenimiento Mecánico'); await pg.click('#cGuardar'); await pg.wait_for_timeout(1500)
    ok(card(NUEVA)['Tipo']=='Roja','C3: vuelve a Roja')
    # cierre: validaciones y cierre real
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.wait_for_timeout(400)
    await pg.fill('#rAccion',''); await pg.click('#rCerrar'); await pg.wait_for_timeout(300); m1=(await M()).lower()
    await pg.fill('#rAccion','Se cambió el retén del reductor'); await pg.click('#rCerrar'); await pg.wait_for_timeout(300); m2=(await M()).lower()
    ok(('acción' in m1 or 'accion' in m1 or 'qué se hizo' in m1 or 'hizo' in m1) and 'causa' in m2,'C4: cierre valida acción y causa (%s | %s)'%(m1[:40],m2[:40]))
    await pg.select_option('#rCausa','Desgaste natural'); await pg.click('#rChHoras [data-v="2"]'); await pg.click('#rChPers [data-v="2"]')
    async def corte(route): await route.abort('internetdisconnected')
    await ctx.unroute('https://script.google.com/**'); await ctx.route('https://script.google.com/**', corte)
    await pg.click('#rCerrar'); await pg.wait_for_timeout(800); m3=(await M()).lower()
    await ctx.unroute('https://script.google.com/**')
    async def fw2(route):
      r=await route.fetch(url=API, method='POST', post_data=route.request.post_data); await route.fulfill(response=r)
    await ctx.route('https://script.google.com/**', fw2)
    ok(('conexión' in m3 or 'conexion' in m3 or 'error' in m3) and card(NUEVA)['Estado']=='Abierta','C4: sin señal avisa y no rompe nada (%s)'%m3[:50])
    ok(await pg.is_visible('#rCerrar') and await pg.input_value('#rAccion')=='Se cambió el retén del reductor','C4: tras el corte la tarjeta sigue abierta en pantalla con lo escrito')
    await pg.click('#rCerrar'); await pg.wait_for_timeout(1500)
    t=card(NUEVA); ok(t['Estado']=='Cerrada' and t['Accion de cierre']=='Se cambió el retén del reductor' and t['Causa']=='Desgaste natural' and num(t['Horas reales'])==2 and num(t['Personas reales'])==2,'C4: cierre guardado completo')
    # verificación: rechazo → reapertura → nuevo cierre → verificada
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.wait_for_timeout(400)
    ok(await pg.is_visible('#secVerificar'),'C5: aparece la verificación')
    await pg.fill('#vCom',''); await pg.click('#vNo'); await pg.wait_for_timeout(500); ok(card(NUEVA)['Estado']=='Cerrada','C5: reabrir exige comentario')
    await pg.fill('#vCom','Sigue goteando'); await pg.click('#vNo'); await pg.wait_for_timeout(1500)
    t=card(NUEVA); ok(t['Estado']=='Abierta' and num(t['Reaperturas'])==1,'C5: no quedó bien → reabierta (reaperturas 1)')
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.wait_for_timeout(400)
    await pg.fill('#rAccion','Se cambió el reductor completo'); await pg.select_option('#rCausa','Desgaste natural'); await pg.click('#rChHoras [data-v="4"]'); await pg.click('#rChPers [data-v="2"]'); await pg.click('#rCerrar'); await pg.wait_for_timeout(1500)
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.wait_for_timeout(400); await pg.click('#vOk'); await pg.wait_for_timeout(1500)
    t=card(NUEVA); ok(t['Estado']=='Verificada' and t['Verificado por'],'C5: segundo cierre y verificación → Verificada')
    h=api({'action':'historial','id':NUEVA})['historial']; acc=[x['Accion'] for x in h]
    ok(all(a in acc for a in ['Alta','Correccion','Resuelta','Verificada']) and any(x['Campo']=='Tipo' for x in h) and all(x['Usuario'] for x in h if x['Accion']=='Correccion'),'C6: historial completo con quién (%d movimientos)'%len(h))
    await pg.evaluate("abrir('%s')"%NUEVA); await pg.wait_for_timeout(1200)
    ok('Corrigió' in await pg.inner_text('#hist') and 'Color' in await pg.inner_text('#hist'),'C6: historial visible al abrir la tarjeta')
    await pg.click('#mCerrarX')
    # el EAM no pisa un cierre verificado por una persona
    api({'action':'__setcsv','csv':TSV.rstrip('\n')+'\n'+NUEVA+'\t777001\tx\tx\tx\t1\t1\tMARCONI JORGE\t2026-10-05 0:00\tMARCONI JORGE\t9\t2026-10-05 10:00\totro texto\tTerminado\n'})
    api({'action':'sincronizarEAM'}); t=card(NUEVA)
    ok(t['Accion de cierre']=='Se cambió el reductor completo' and num(t['Horas reales'])==4 and 'EAM' not in str(t['Verificado por']),'C7: el EAM no pisa un cierre verificado por una persona')

    # ===== D. Tarjeta que se gestiona y cierra solo por el EAM + causa desde la pantalla
    await pg.goto(B+'formulario.html'); await pg.wait_for_timeout(1200)
    await pg.fill('#detectadoPor','Bolletta, Franco'); await pg.select_option('#areaEquipo','PULPERS'); await pg.wait_for_timeout(100); await pg.select_option('#equipo',index=1)
    if await pg.is_enabled('#componente'): await pg.select_option('#componente',index=1)
    await pg.fill('#descripcion','QA EAM: ruido en bomba'); await pg.select_option('#categoria','Ruido / vibracion / sobretemperatura')
    await pg.click('.tipo[data-t=Roja]'); await pg.click('#areasel .op[data-a="Mantenimiento Mecánico"]'); await pg.click('#condsel .op[data-c="Maquina en marcha"]'); await pg.click('#prisel [data-p="Media"]')
    await pg.click('#guardar'); await pg.wait_for_timeout(1500)
    E2=[t['ID'] for t in api({'action':'listar'})['tarjetas'] if t['Descripcion']=='QA EAM: ruido en bomba'][0]
    api({'action':'__setcsv','csv':TSV.rstrip('\n')+'\n'+E2+'\t888001\tRevisar bomba\tx\tx\t3\t2\tSCHLEGEL SERGIO\t2026-10-08 0:00\t\t0\t\t\tPlanificado\n'})
    api({'action':'sincronizarEAM'}); t=card(E2)
    ok(t['Estado']=='En proceso' and t['Responsable asignado']=='Schlegel, Sergio Daniel' and t['Fecha planificada']=='2026-10-08' and num(t['Horas estimadas'])==3 and num(t['Personas necesarias'])==2,'D1: planificada en EAM → En proceso con responsable de la lista')
    api({'action':'__setcsv','csv':TSV.rstrip('\n')+'\n'+E2+'\t888001\tRevisar bomba\tx\tx\t3\t2\tSCHLEGEL SERGIO\t2026-10-08 0:00\tSCHLEGEL SERGIO, CIVERCHIA BRANKO ELOY\t2,5\t08/10/2026 15:40\tSe cambió rodamiento lado acople\tTerminado\n'})
    r=api({'action':'sincronizarEAM'}); t=card(E2)
    ok(r['cerradas']==1 and t['Estado']=='Verificada' and t['Fecha cierre']=='2026-10-08 15:40' and num(t['Horas reales'])==2.5 and t['Ejecutores']=='Schlegel, Sergio Daniel; Civerchia, Branko' and t['Accion de cierre']=='Se cambió rodamiento lado acople','D2: Terminado en EAM → Verificada con datos reales')
    await pg.goto(B+'seguimiento.html'); await pg.wait_for_timeout(2500)
    await pg.evaluate("abrir('%s')"%E2); await pg.wait_for_timeout(400)
    ok(await pg.is_visible('#secCausa'),'D3: pide completar la causa')
    await pg.select_option('#kCausa','Desgaste natural'); await pg.check('#kMP'); await pg.click('#kGuardar'); await pg.wait_for_timeout(1500)
    t=card(E2); ok(t['Causa']=='Desgaste natural' and t['Agregar a MP']=='Si','D3: causa y plan preventivo guardados')
    await pg.evaluate("abrir('%s')"%E2); await pg.wait_for_timeout(300); ok(not await pg.is_visible('#secCausa'),'D3: ya no pide causa')
    await pg.click('#mCerrarX')

    # ===== E. Acciones en lote y planificación con datos reales
    await pg.select_option('#fEstado','_sinplan'); await pg.wait_for_timeout(300)
    ids=await pg.evaluate("filtradas().slice(0,3).map(t=>t.ID)")
    for i in ids: await pg.check('#tbody tr:has-text("%s") input[type=checkbox]'%i)
    await pg.select_option('#bCond','Maquina parada'); await pg.click('#bAplicar'); await pg.wait_for_timeout(2000)
    ok(all(card(i)['Condicion intervencion']=='Maquina parada' for i in ids),'E1: condición en lote guardada en 3 tarjetas')
    await pg.goto(B+'planificacion.html'); await pg.wait_for_timeout(3500)
    ok(not errs,'E2: planificación sin errores %s'%errs[:1])
    eam_en_plan=await pg.evaluate("typeof PLAN!=='undefined' && PLAN ? (PLAN.asignadas||[]).filter(x=>planificadaEAM(x.t)).length : -1")
    ok(eam_en_plan==0,'E2: el planificador no re-planifica las tarjetas del EAM')

    # ===== F. Celular: cargar y cerrar
    c3,p3,e3=await contexto({'width':390,'height':844})
    await p3.goto(B+'formulario.html'); await p3.wait_for_timeout(1200)
    await p3.fill('#detectadoPor','Bolletta, Franco'); await p3.select_option('#areaEquipo','PULPERS'); await p3.wait_for_timeout(100); await p3.select_option('#equipo',index=1)
    if await p3.is_enabled('#componente'): await p3.select_option('#componente',index=1)
    await p3.fill('#descripcion','QA celular'); await p3.select_option('#categoria','Suciedad / falta de limpieza')
    await p3.click('.tipo[data-t=Azul]'); await p3.click('#condsel .op[data-c="Maquina en marcha"]'); await p3.click('#prisel [data-p="Baja"]'); await p3.click('#guardar'); await p3.wait_for_timeout(1500)
    ok(await p3.is_visible('#cardOk'),'F: carga desde el celular')
    C=[t['ID'] for t in api({'action':'listar'})['tarjetas'] if t['Descripcion']=='QA celular'][0]
    await p3.goto(B+'seguimiento.html'); await p3.wait_for_timeout(2500); await p3.evaluate("abrir('%s')"%C); await p3.wait_for_timeout(300)
    await p3.fill('#rAccion','Limpieza'); await p3.select_option('#rCausa','Falta de limpieza / inspeccion'); await p3.click('#rChHoras [data-v="1"]'); await p3.click('#rChPers [data-v="1"]'); await p3.click('#rCerrar'); await p3.wait_for_timeout(1500)
    ok(card(C)['Estado']=='Cerrada','F: cierre desde el celular')
    ok(not e3,'F: celular sin errores %s'%e3[:1]); await c3.close()
    ok(not errs,'sin errores JS en todo el recorrido %s'%errs[:2])
    await br.close()
  print('E2E DATOS REALES: %d OK, %d FALLAS'%(res['ok'],len(res['fail']))); [print('  ✖',f) for f in res['fail']]
  open('/tmp/claude-0/qa/real.log.txt','w').write('\n'.join(LOG))
asyncio.run(main())
