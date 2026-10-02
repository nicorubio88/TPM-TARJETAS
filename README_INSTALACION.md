# Sistema de Tarjetas TPM — Planta Tornquist · v11

## ⚠️ Importante al actualizar el backend (por qué no aparecía "máquina en marcha / parada")

Pegar el `Codigo.gs` y guardar **no alcanza**: la URL `/exec` sigue corriendo la versión publicada anterior.
Después de pegar el código: **Implementar → Administrar implementaciones → ✏️ Editar → Versión: _Nueva versión_ → Implementar**.
No crear una implementación nueva (cambia la URL y habría que tocar `config.js`).
Para comprobarlo: abrir `seguimiento.html`; si el backend está viejo, todas las pantallas muestran una franja roja avisándolo y
las tarjetas nuevas guardan Condición, Prioridad, Área responsable y Cliente ID.

## Novedades v11

- Lugares nuevos: Alistamiento → **Zona Cortadora** y **Depósito**; área **Laboratorio** (Laboratorio de Calidad, Equipos de ensayo).
- **Intendencia** como área que resuelve tarjetas rojas (edificios e instalaciones).
- Al elegir **máquina en marcha / parada**, el paso siguiente pide la **prioridad Alta / Media / Baja dentro de ese estado**.
  Seguimiento ordena por "Condición + prioridad" y muestra la etiqueta en la tabla.
- Ingeniería: Marcelo Belarra, Diego Fernandez, Simon Guglielmo, Mauro Poulain.
- Seguimiento: filtros por **código de tarjeta (ID)**, **sector de quien la cargó** y **prioridad**.
- **Corregir datos de la carga** (quién, turno, lugar, descripción) desde la tarjeta. Pide identificarse y queda en el
  **historial** de la tarjeta (qué cambió, de qué a qué, quién y cuándo), visible al abrirla.


Registrar anomalías, planificarlas (en marcha / con parada), resolverlas, verificarlas en el equipo
y medir apertura vs. cierre, lugares críticos, participación y repeticiones.
Arquitectura: frontend HTML estático (GitHub → DigitalOcean) + backend Google Apps Script + Google Sheet.

## Circuito de una tarjeta

1. **Carga** (menos de un minuto): quién, color, dónde (buscador o QR del equipo), qué ve, foto, ¿en marcha o con parada?
   El resto ("Más datos") es opcional y lo completa el supervisor. Sin señal, queda en el celular y se envía sola.
2. **Planificación** (Seguimiento): responsable, fecha, especialidad, horas, repuestos, LOTO/permiso, N° OT, parada objetivo.
   Se puede asignar en lote. Las de seguridad se derivan a Seguridad e Higiene.
3. **Resolución**: acción, causa, foto del después, y si hay que **agregar al plan preventivo** o **actualizar el estándar / LUP**.
   Queda en estado **Resuelta · a verificar** y se avisa a quien la cargó.
4. **Verificación**: quien detectó (desde *Mis tarjetas*) o el operador confirma en el equipo → **Verificada**.
   Si no quedó bien, se **reabre**, cuenta una reapertura y se avisa al responsable.
5. **Aprendizaje**: si la misma familia de falla vuelve en el mismo equipo dentro de 90 días se marca **↻ Repetida**,
   y el equipo aparece como **candidato a Mejora Enfocada** (con botón para abrir la tarjeta verde de Kaizen).

## Pantallas

| Archivo | Para qué |
|---|---|
| `index.html` | Inicio: avisos personales (para verificar / asignadas) y destacados del mes. |
| `formulario.html` | Carga rápida. Acepta `?u=AREA|SUBAREA|EQUIPO` (QR), `?tipo=Verde`, `?desc=...`. |
| `mis-tarjetas.html` | Lo que reporté, qué pasó, verificar las resueltas, lo que tengo asignado, mi meta del mes. |
| `planificacion.html` | **Planificación automática** en marcha (día por día) y en parada (Gantt dentro de la ventana), con gente asignada; se ajusta a mano y se aplica. |
| `seguimiento.html` | Filtros, gestión, resolución, verificación, historial, asignación en lote, **📅 Paradas**, **■ Plan de parada**, orden de trabajo, CSV. |
| `dashboard.html` | Período y área · apertura vs. cierre semanal con backlog · condición de máquina · pilares · participación por sector vs. meta · reconocimiento · repeticiones/Kaizen · lugares críticos · fuguai · aging · kanban. |
| `tv.html?area=PULPERS` | Tablero para TV por área (o `?area=todas`). Se actualiza solo cada 5 minutos. |
| `qr.html` | Genera e imprime etiquetas QR por equipo. |
| `config.html` | Estado del backend, pasar nómina y árbol a la planilla, herramientas. |
| `como-funciona.html`, `guias.html` | Material de consulta. |
| `comun.js` | Configuración, catálogos, KPIs, repeticiones, cola sin conexión, identidad del dispositivo. |
| `personas.js`, `arbol.js` | Nómina y árbol de respaldo (si las hojas Personas/Arbol están vacías). |
| `planificador.js` | Motor de planificación (criterio, estimaciones, asignación). |
| `sw.js`, `manifest.json`, `icon-*.png` | App instalable en el celular y apertura sin señal. |
| `qrcode.js` | Librería de QR (MIT, Kazuhiko Arase). |
| `Codigo.gs` | Backend Apps Script. |

## Actualizar desde la v1/v2 (no se pierde nada)

1. **Backend:** en Apps Script, reemplazar todo por el nuevo `Codigo.gs`. Completar la configuración de arriba del archivo (ver abajo).
   Ejecutar `setup()` una vez (autorizar permisos: ahora también usa Properties, Lock y, si se configura EHS, UrlFetch).
   Luego **Implementar → Gestionar implementaciones → ✏ → Versión: nueva → Implementar** (misma URL /exec).
2. **Frontend:** subir a GitHub todos los archivos (DigitalOcean redespliega solo).
3. **Planilla:** no hay que tocarla. Se agregan solas las columnas nuevas y las hojas *Historial*, *Paradas*, *Personas* y *Arbol*.
   **Migración automática (una sola vez):** las tarjetas que estaban "Cerradas" pasan a "Verificada" (verificado por "(migracion v3)"),
   para que la bandeja de verificación arranque vacía. Las tarjetas viejas quedan con condición "A definir".
4. En **config.html → "Copiar nómina y árbol a la planilla"**. Después, completar la columna **Email** en la hoja *Personas*.

## Configuración (arriba de `Codigo.gs`)

| Constante | Qué hace |
|---|---|
| `APP_URL` | URL de DigitalOcean. Se usa para poner links en los emails. |
| `NOTIF` | Email/grupo por grupo responsable: aviso de tarjeta nueva. |
| `EHS_EMAIL` | Email/grupo de Seguridad e Higiene: recibe cada tarjeta de condición insegura. |
| `EHS_API_URL` | (opcional) URL /exec del sistema EHS para crear el registro allá. Ajustar nombres de campos en `mapearEHS_()`. |

Avisos por email que ya funcionan si la persona tiene email en la hoja *Personas*:
tarjeta resuelta → a quien la detectó (con foto antes/después); reabierta → al responsable y a quien la resolvió.

Parámetros en `comun.js`: `META_TARJETAS_PERSONA_MES` (2), `DIAS_REPETICION` (90), `UMBRAL_KAIZEN` (3), `PERIODO_DEFECTO_DIAS` (365).

## Identidad (no es contraseña)

Cada dispositivo guarda "quién lo usa" (chip 👤 arriba a la derecha). Se usa para precargar "Detectado por", armar
*Mis tarjetas* y firmar cada cambio en la hoja *Historial*. **No hay control de acceso**: cualquiera con el link puede modificar.
El control por usuario/PIN queda para una etapa siguiente.

## Hojas de la planilla

- **Tarjetas**: una fila por tarjeta. Estados: Abierta · En proceso · Cerrada (= resuelta, a verificar) · Verificada · Anulada.
  Columnas v3: Foto cierre URL, Verificado por, Fecha verificacion, Reaperturas, Reprogramaciones, Parada objetivo, N OT,
  LOTO / Permiso, Causa, Agregar a MP, Actualizar estandar, Sector detector, Enviado a EHS.
- **Historial**: Fecha · ID · Acción · Campo · Antes · Después · Usuario.
- **Paradas**: ID · Fecha · Descripción · HH disponibles · Estado.
- **Personas**: Sector · Nombre · Email · Activo (poner "No" para dar de baja sin perder historial).
- **Arbol**: Área · Subárea · Equipo.

## Indicadores clave

- **Apertura vs. cierre semanal + backlog**: si la línea de backlog sube, se abre más de lo que se cierra.
- **% de cierre**, **tiempo medio de cierre**, **vencidas**, **> 30 días**, **reprogramadas**, **reaperturas**.
- **Autonomía** = azules / (azules + rojas): madurez del Mantenimiento Autónomo.
- **Participación por sector** = tarjetas por persona por mes vs. meta, y % de personas que reportaron.
- **Repetidas ↻** y **candidatos Kaizen**: equipos con ≥ 3 tarjetas en 90 días o con fallas que volvieron.
- **Pilares**: azules resueltas (MA), cierres derivados al preventivo (MP), defectos de calidad (QM), verdes y ahorro (ME),
  estándares/LUP (paso 3), condiciones inseguras (Seguridad).

## v4 — Planificación automática

**Al cargar:** paso 7 opcional "¿Cuánto lleva y cuántas personas?" (15 min … más de 1 turno · 1 a 4+ personas).
Al elegir área y color se muestra y asigna el **supervisor por defecto** como responsable.

**Configuración › Áreas** (hoja *Areas*): por área, criticidad **A/B/C**, y por color **supervisor** y **ejecutores**.
La fila *Por defecto* vale para todas. Sin configurar: rojas → técnicos de Mantenimiento (Mecánico/Eléctrico),
azules → Operarios, verdes → Ingeniería/I+D/Producción.

**Criterio de prioridad (puntaje)** — editable en `CONFIG.PESOS` de `comun.js`:

| Factor | Puntos |
|---|---|
| Prioridad | Alta 30 · Media 15 · Baja 5 |
| Seguridad (condición insegura) | +25 |
| Calidad (defecto de calidad) | +15 |
| Criticidad del área | A +20 · B +10 · C 0 |
| Repetida ↻ | +15 |
| Vencida | +10 |
| Antigüedad | +1 cada 3 días (máx. +10) |
| Verde (mejora) | −10 |

**Estimaciones:** duración y personas = lo cargado → mediana de tarjetas parecidas (mismo color y fuguai, mínimo 3) →
por defecto (roja 2 h × 2, azul 0,5 h × 1, verde 4 h × 2). HH = duración × personas.

**Máquina en marcha:** cada persona dedica `HORAS_DIA_TARJETAS` por día (técnicos 4 h, operarios 1 h, otros 2 h).
Por puntaje, cada tarjeta va al primer día hábil en que N ejecutores pueden terminarla (si es larga, sigue al día siguiente).
Si la tarjeta pide especialidad y hay suficientes de esa especialidad, se usan solo esos.

**Máquina parada:** las paradas ahora tienen **hora de inicio** y **duración**. Dentro de esa ventana cada tarjeta
arranca cuando sus ejecutores quedan libres; si no termina antes del fin, queda "para la próxima parada".
Las ya asignadas a esa parada van primero. (No contempla dos trabajos sobre el mismo equipo en simultáneo: revisarlo en el Gantt.)

**Ajuste manual y aplicación:** en cada tarea se puede cambiar a cualquier persona (queda "fijado a mano").
**Aplicar plan** escribe en cada tarjeta: Ejecutores, Fecha planificada, Horario planificado, Parada objetivo (si es parada)
y el supervisor como responsable si estaba vacío. Los ejecutores la ven en *Mis tarjetas*.

Columnas nuevas en *Tarjetas*: Personas necesarias · Ejecutores · Fecha planificada · Horario planificado.
En *Paradas*: Duracion (h) · Hora inicio. Hoja nueva: *Areas*. Todo se agrega solo al publicar el nuevo `Codigo.gs`.

## v5 — Dashboard por prioridad y revisión completa

**Dashboard ordenado por prioridad** (bloques numerados):
1. **Colocadas vs. retiradas** — colocadas, retiradas, % de retiro, colgadas hoy, a verificar; curva acumulada (la clásica
   del tablero de tarjetas) y curva semanal con colgadas al cierre.
2. **Promedio de generación** — tarjetas por persona por mes (vs. meta), promedio semanal, participación (% de la nómina
   que reportó), % detectadas por operación; tendencia mensual con línea de meta y participación por sector.
3. **Velocidad de retiro** — tiempo medio y mediana, % resueltas en plazo, vencidas, > 30 días, reprogramadas, antigüedad.
4. **Quién retira y cómo queda** — autonomía, % retiradas por operación, % verificadas en el equipo, reaperturas, reconocimiento.
5. **Qué se encuentra** — Pareto de los 7 fuguai y tarjetas por paso del Autónomo.
6. **Dónde** — áreas y equipos críticos, candidatos a Mejora Enfocada.
7. **Tracción de los pilares.**
8. **Planificación** — condición de máquina y kanban.

Los indicadores de resultado de los pilares (averías, MTBF, MTTR, OEE, defectos) salen del registro de producción, no de las tarjetas.

**Categoría y prioridad obligatorias:** pasos 5 y 6 del formulario, validadas también en el backend.

**Revisión y pruebas:** ver `INFORME_PRUEBAS.md` (bugs corregidos y lo que queda por probar en producción).
Columna nueva en *Tarjetas*: `Cliente ID` (control de duplicados de la cola sin conexión). Se agrega sola.
La carpeta `pruebas/` no hace falta subirla a DigitalOcean (si se sube, no afecta).

## v6 — Área que resuelve, reparto automático y cierre con datos reales

**Formulario en 3 bloques** (A · qué pasa y dónde, B · quién lo resuelve, C · para planificar), con barra de avance y resumen final.
Obligatorios: quién, dónde, qué, **tipo de anomalía**, **color**, **área que lo resuelve** y **prioridad**.
El sistema sugiere (sin imponer) color, área y prioridad según el tipo de anomalía; si el color tiene una sola área, se elige sola.

**Áreas que resuelven** (Configuración › hoja *Responsables*):

| Área | Color | Reparto | Por defecto |
|---|---|---|---|
| Mantenimiento Mecánico | Roja | Técnicos: se reparte entre todos | sector Mantenimiento Mecánico |
| Mantenimiento Eléctrico | Roja | Técnicos: se reparte entre todos | sector Mantenimiento Eléctrico |
| ICOPRO | Roja | Técnicos: se reparte entre todos | sector ICOPRO |
| Ingeniería | Roja | Se reparte entre todos | sector Ingeniería |
| Mantenimiento (a derivar) | Roja | Al jefe, que la deriva | sector Mantenimiento |
| Producción | Azul | Supervisores: **solo entre los 4 supervisores** | sector Producción (**elegir los 4 en Configuración**) |
| Mejora Enfocada | Verde | Supervisores | Ingeniería e I+D |

**Responsable:** automático = el del equipo con menos tarjetas abiertas; o se elige a mano (del equipo o cualquier persona).
La planificación asigna gente **solo del equipo del área**; en azules, a un solo supervisor que la hace ejecutar por su gente.

**Tiempo de a 1 hora:** 1 h … 8 h o "más de 8 h" (se indica cuántas).

**Cierre con información completa:** causa, **horas reales** y **personas reales** obligatorias (precargadas con lo estimado).
Las estimaciones futuras usan lo real.

Columnas nuevas en *Tarjetas*: Area responsable · Horas reales · Personas reales. Hoja nueva: *Responsables*.
La hoja *Areas* queda solo para la criticidad A/B/C.

## v10 · Estimación por historial, Gantt, órdenes de trabajo y objetivo por persona
**Archivos que cambian:** `Codigo.gs` (acción nueva `historialEstimacion`; al crear guarda especialidad y repuestos sugeridos), `comun.js`, `planificador.js`, `planificacion.html`, `formulario.html`, `seguimiento.html`, `dashboard.html`, `mis-tarjetas.html`, `config.html`, `estilos.css`, `sw.js`.
En Apps Script: pegar `Codigo.gs` y publicar una **nueva versión** de la implementación.

- **Estimación por historial:** para cada tarjeta se buscan cierres parecidos y se usa lo REAL (horas, personas, especialidad, repuestos, marcha/parada). Orden: mismo equipo y mismo trabajo → mismo trabajo en otro equipo (ej. "cambio de bomba") → mismo equipo → color y tipo de anomalía → valor por defecto. Mientras más tarjetas se cierren con horas reales, mejor estima.
- **Al cargar la tarjeta** (paso 10) aparece "Según el historial: 3 casos… ~4 h × 2 personas · Mecánica · repuestos usados…" con un botón para usarlo. En Seguimiento › gestión, "Completar los vacíos con esto".
- **Planificación:** vista **Gantt por persona** (días en marcha, horas en parada) y botón **📄 Órdenes de trabajo**: una hoja de ruta por persona y una orden de trabajo por tarea (la lleva el primero de los ejecutores), lista para imprimir y entregar.
- **Corrección:** las tarjetas asignadas a una parada que ya pasó y no se hicieron vuelven a entrar primero en la próxima parada (antes quedaban fuera de todo plan).
- **Objetivo por persona:** 2 rojas + 1 azul + 1 verde por mes (`CONFIG.OBJETIVO_MES` en comun.js). Dashboard bloque 2 → "Objetivo por persona" con mes, sector, búsqueda y quiénes cumplen. Seguimiento → filtro **Persona** con rol (la detectó / responsable / ejecuta / la resolvió) y ficha con su avance del mes. Mis tarjetas muestra el avance por color.
