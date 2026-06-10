# Sistema de Tarjetas TPM — Planta Tornquist

Software para gestionar las tarjetas de Mantenimiento Autónomo / Planificado y Mejora:
cargar la tarjeta, asignar el responsable automáticamente según el color y seguir el cierre.
Misma arquitectura que el sistema de seguridad (EHS): frontend HTML + backend Google Apps Script + Google Sheet.

## Lógica del color (asignación automática)

- **Roja** → la resuelve **Mantenimiento** (expertise técnica: eléctrico, mecánico, instrumentista).
- **Azul** → la resuelve **Operación** (baja complejidad: el operador del sector).
- **Verde** → es una **mejora**, la puede resolver cualquiera → va a **Mejora Enfocada**.

## Archivos

| Archivo | Qué es |
|---|---|
| `Codigo.gs` | Backend. Se pega en Google Apps Script. Lee y escribe la Google Sheet. |
| `comun.js` | Configuración, catálogos (sectores, turnos, categorías) y capa de datos del frontend. |
| `personas.js` | Nómina de planta (nombre y sector) para los desplegables de "detectado por" y "responsable". |
| `arbol.js` | Árbol de equipo de la máquina (23 áreas → 123 subáreas → 590 equipos) para los desplegables encadenados de ubicación. |
| `estilos.css` | Estilos compartidos. |
| `index.html` | Inicio con las tres secciones. |
| `formulario.html` | Carga de tarjeta. |
| `dashboard.html` | KPIs y gráficos. |
| `seguimiento.html` | Listado, filtros, asignación y cierre. |

## Probar sin instalar nada (modo demo)

Abrí `index.html` en el navegador. Si `CONFIG.API_URL` está vacío, la app corre en **modo demo**:
guarda las tarjetas en el navegador (localStorage). Sirve para mostrar el flujo y validar la interfaz.
Para producción, seguí los pasos de abajo.

## Instalación en producción

### 1. Crear la Google Sheet
Crear una planilla nueva en Google Drive (ej: "Tarjetas TPM Tornquist"). Copiar su ID
(el código que está en la URL entre `/d/` y `/edit`).

### 2. Cargar el backend
1. En la planilla: **Extensiones → Apps Script**.
2. Borrar el contenido y pegar `Codigo.gs`.
3. Si creaste el script desde la planilla, dejá `SHEET_ID = ''`. Si es un proyecto aparte,
   pegá el ID en `const SHEET_ID = '...'`.
4. (Opcional) Cargar los emails o grupos de notificación en `NOTIF` por cada grupo responsable.
5. Guardar.

### 3. Crear la hoja
En el editor de Apps Script, seleccionar la función `setup` y ejecutarla una vez
(autorizar los permisos cuando lo pida). Crea la hoja "Tarjetas" con sus columnas.

### 4. Publicar como aplicación web
1. **Implementar → Nueva implementación → Aplicación web**.
2. Ejecutar como: **yo**. Acceso: **cualquier persona**.
3. Copiar la URL que termina en `/exec`.

### 5. Conectar el frontend
1. Abrir `comun.js` y pegar la URL en `CONFIG.API_URL`.
2. Subir los 8 archivos del frontend (`comun.js`, `personas.js`, `arbol.js`, `estilos.css`, `index.html`,
   `formulario.html`, `dashboard.html`, `seguimiento.html`) a un hosting estático
   (Digital Ocean App Platform + GitHub, igual que el sistema EHS, o cualquier servidor web).

Listo. El formulario carga tarjetas en la planilla, el dashboard muestra los indicadores
y seguimiento permite asignar responsables y cerrar.

## Fotos, nómina y kanban

- **Fotos:** el formulario permite sacar o adjuntar una foto; en el celular abre la cámara. La imagen se reduce
  en el navegador y, en producción, se guarda en una carpeta de Google Drive ("Fotos Tarjetas TPM", o la que
  indiques en `FOTOS_FOLDER_ID`); en la planilla queda el link. En modo demo la foto se guarda en el navegador.
- **Árbol de equipo:** la ubicación se elige con 3 desplegables encadenados (Área → Subárea/Equipo → Equipo específico), sin texto libre. Para modificar el árbol, editá `arbol.js`. Si la subárea no tiene tercer nivel, el sistema lo indica y no lo exige.
- **Nómina:** los nombres salen de `personas.js`. Para altas, bajas o cambios de personal, editá ese archivo
  (está agrupado por sector). No contiene sueldos ni datos sensibles, solo nombre y sector.
- **Kanban:** el dashboard muestra el tablero de acciones con columnas por prioridad (Alta/Media/Baja) y filas
  por estado (Pendiente / En proceso / Cerradas); las vencidas se resaltan en rojo.

## Estructura de datos (hoja "Tarjetas")

ID · Fecha alta · Tipo · Grupo responsable · Detectado por · Turno · Sector · Equipo ·
Componente/Ubicación · Categoría · Descripción · Prioridad · Foto URL · Responsable asignado ·
Fecha compromiso · Estado · Fecha cierre · Acción de cierre · Costo estimado · Notas ·
Etapa MA · Dimensión mejora · Área equipo

La **Categoría** usa los 7 fuguai del Mantenimiento Autónomo agrupados: condición básica
(limpieza/lubricación/ajuste), focos de contaminación, lugares de difícil acceso (limpieza,
lubricación, inspección, operación), deterioro, calidad, seguridad y MUDA. La **Etapa MA**
ubica la tarjeta en el Paso 1 (restaurar), 2 (eliminar focos / facilitar acceso) o 3 (estandarizar).

El **ID** es anticolisión y lleva el color como prefijo: `ROJ-AAMMDD-HHMM-XXX` (roja), `AZU-...`, `VER-...`.

## KPIs del dashboard

Total · abiertas · cerradas · % de cierre · vencidas · tiempo medio de cierre (días) ·
abiertas por color · por estado · por color · top sectores · por grupo responsable.

## Cómo se conecta con el pilar

- Las tarjetas **verdes** llevan un campo de **costo/ahorro estimado**: alimentan el árbol de pérdidas
  y el pipeline de Mejora Enfocada (Kobetsu Kaizen).
- El **tiempo medio de cierre** y las **vencidas** son los indicadores de salud del tablero de tarjetas
  (equivalente al MTTR para las anomalías de Mantenimiento Autónomo).
- Las **categorías** son los 7 fuguai del Paso 1 de Mantenimiento Autónomo (condición básica,
  focos de contaminación, lugares de difícil acceso, deterioro, calidad, seguridad, MUDA), y el
  campo **Etapa MA** permite ver en el dashboard el avance del pilar por pasos, no solo el cierre.
