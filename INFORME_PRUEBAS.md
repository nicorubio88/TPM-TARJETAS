# Informe de pruebas · Tarjetas TPM v11

## v12 · 02/10/2026

Backend 111/111 · Estimación 12/12 · Frontend general 207/207 · v10 21/21 · v11 19/19 ·
v12 (parada planificada: 4 casilleros, ayudas de prioridad, dashboard, filtro, plan de parada; escritorio y celular) 19/19.

## v11 · 02/10/2026

| Batería | Resultado |
|---|---|
| Backend (incluye correcciones con historial e identificación obligatoria) | **109 / 109 OK** |
| Estimación por historial | **12 / 12 OK** |
| Frontend general (12 páginas, vacía y con datos, escritorio y celular) | **207 / 207 OK** |
| Planificación v10 (Gantt, órdenes, objetivo mensual) | **21 / 21 OK** |
| v11 (lugares, Intendencia, condición→prioridad, Ingeniería, filtros ID/sector/prioridad, corrección + historial, aviso de backend viejo) | **19 / 19 OK** |

---

# Informe anterior · v6

Fecha: 27/09/2026. Todo se probó antes de entregar, contra el `Codigo.gs` real ejecutándose sobre una planilla simulada
(Sheets, Drive, Mail, Lock, Properties y UrlFetch simulados e instrumentados) y las páginas reales en Chromium.

## Resultado

| Batería | Resultado |
|---|---|
| Análisis estático (ESLint: variables sin definir, claves duplicadas, redeclaraciones, código inalcanzable) | 0 errores en páginas y backend |
| Backend (`pruebas/backend.test.js`, 9 grupos) | **99 / 99 OK** |
| Frontend: 12 páginas × planilla vacía y con 220 tarjetas, escritorio y celular, flujos completos | **197 / 197 OK** |
| Planificador: nadie fuera de su área, azules a 1 solo supervisor, capacidad diaria respetada | OK |
| Modo sin conexión (service worker + cola) | 5 / 5 páginas abren sin señal; la cola se envía al volver |
| Referencias a archivos y lista de caché offline | sin faltantes |

Qué cubre el frontend: sin errores JavaScript ni textos rotos (NaN, undefined, null) en ninguna pantalla;
textos maliciosos (`<img onerror>`, `<script>`, comillas) en descripción, repuestos, notas, OT, ejecutores y paradas
no se ejecutan en ninguna pantalla ni impresión; todos los filtros, modales, historial, impresiones, CSV,
paradas, planificación (marcha y parada, fijar persona, aplicar), configuración de áreas, QR de los 590 equipos,
tablero TV, verificación desde Mis tarjetas y las validaciones del formulario.
Los números del Dashboard se compararon con un cálculo independiente hecho aparte.

## Bugs encontrados y corregidos en esta revisión

1. **Lock anidado (crítico).** La migración tomaba y soltaba el lock dentro de una escritura que ya lo tenía:
   liberaba el lock antes de tiempo y dos escrituras simultáneas podían pisarse. Ahora la migración corre antes.
2. **Control de duplicados sin límite.** La cola sin conexión guardaba cada envío en Script Properties (tope 500 KB):
   con los años se llenaba. Ahora usa la columna *Cliente ID* de la propia planilla.
3. **Paradas con el mismo ID.** Dos paradas creadas en el mismo segundo recibían el mismo ID; editar o borrar una
   podía tocar la otra. Ahora el ID lleva un sufijo aleatorio.
4. **"Aplicar plan" lento.** Cada campo hacía varias lecturas y escrituras a la planilla. Ahora una lectura y una
   escritura por tarjeta y el historial en un solo bloque: un lote de 30 tarjetas pasó de ~360 a ≤100 accesos.
5. **Barra de "colgadas" desbordada** en Lugares críticos cuando las colgadas superaban a las colocadas del período.
6. **Ejes ilegibles** en los gráficos al ir de a dos por fila.
7. `sectorDe` definida dos veces (personas.js y comun.js). Mismo comportamiento; ahora comun.js solo la define si falta.
8. Guía de categorías desactualizada respecto de las subcategorías de calidad.

## Cambio pedido durante la revisión

- **Categoría de anomalía y prioridad obligatorias.** Pasan a ser los pasos 5 y 6 del formulario (sin valor por defecto:
  hay que elegir) y el backend rechaza tarjetas sin ellas. En Seguimiento se pueden cambiar pero no borrar.
  Las tarjetas viejas sin categoría siguen visibles y se completan al gestionarlas.

## v6 — reglas nuevas probadas

- Área que resuelve obligatoria (formulario y backend); no se puede borrar.
- Reparto parejo: 8 azules entre 4 supervisores = 2 cada uno; rojas entre todos los técnicos del área.
- La configuración de la hoja *Responsables* manda sobre lo que envía el celular.
- Responsable elegido a mano se respeta; cambiar de área reasigna automático dentro del nuevo equipo.
- Cierre sin causa, sin horas reales o sin personas reales se rechaza.

## Lo que NO se pudo probar aquí (probar al publicar)

- Google Sheets, Drive y Gmail reales: permisos, cuotas y la vista de las fotos (`drive.google.com/thumbnail`).
- Cuota de mails de Apps Script: 100 por día en cuentas personales, 1.500 en Workspace. Con muchos cierres por día
  los avisos al detector pueden agotarla.
- El `crear` del sistema EHS (`EHS_API_URL`): el formato de campos es una suposición (ajustar en `mapearEHS_`).
- Instalación como app en celulares reales (Android/iOS) y cámara.

## Cómo repetir las pruebas del backend

Con Node 18+: `cd pruebas && node backend.test.js`

## v7 · Área ICOPRO (28/09/2026)
- Nueva área que resuelve **ICOPRO** (rojas, modo equipo, reparte entre las 5 personas del sector ICOPRO).
- Categoría "Anomalía eléctrica / instrumentación" separada en **Anomalía eléctrica** (sugiere Mant. Eléctrico) y **Anomalía de instrumentación / control** (sugiere ICOPRO). Las tarjetas viejas siguen contando en la familia 4.
- Si la hoja Responsables ya estaba guardada, ICOPRO aparece igual (se agrega sola).
- Pruebas: backend 99/99, frontend 201/201 (4 nuevas de ICOPRO).

## v8 · Ingeniería en rojas y alta de Nicolás Rubio (29/09/2026)
- Nueva área que resuelve **Ingeniería** para tarjetas rojas (reparte entre las 3 personas del sector Ingeniería).
- Alta en la nómina: **Rubio, Nicolas** · sector Gerencia de Planta. Aparece aunque la hoja Personas ya esté cargada.
- Pruebas: backend 99/99, frontend 203/203.

## v9 · Foto: cámara o archivo del dispositivo (29/09/2026)
- Al cargar la tarjeta y al resolverla hay dos botones: **📷 Sacar foto** (abre la cámara) y **🖼️ Subir desde el celular / dispositivo** (galería o archivos, también desde la PC).
- Se puede quitar la foto elegida. La foto sigue siendo opcional.
- Pruebas: backend 99/99, frontend 207/207 (4 nuevas de foto).

## v10 · Estimación por historial, Gantt, órdenes de trabajo, objetivo por persona (29/09/2026)
- Backend 103/103 (nuevas: historial compacto, crear con especialidad y repuestos).
- Motor de estimación 12/12 (niveles mismo equipo+trabajo, trabajo parecido en otro equipo, defecto; sinónimos y plurales; lo cargado manda).
- Frontend 207/207 (recorrido completo, desborde en celular, XSS, errores JS).
- Flujo v10 21/21: Gantt en marcha y en parada, órdenes de trabajo (una hoja de ruta por persona y una OT por tarea), parada vencida que vuelve a entrar, sugerencia al cargar y "usar estimación", filtro por persona y rol, objetivo en dashboard y Mis tarjetas, Gantt y dashboard en celular sin desborde.
- Lint sin errores nuevos.
