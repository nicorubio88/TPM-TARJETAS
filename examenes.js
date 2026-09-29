/* ============================================================
   EXAMENES DE CAPACITACION
   Cada examen: titulo, descripcion y preguntas.
   Pregunta: p (texto), o (opciones [id, texto]), ok (id correcta), ex (explicacion).
   Para agregar un examen nuevo (Autonomo, Calidad...) se copia un bloque
   y se abre con examen.html?e=<clave>.
   ============================================================ */
const EXAMENES = {
  mp: {
    titulo: 'Mantenimiento Planificado',
    desc: 'Pilar de Mantenimiento Planificado y cómo lo sostiene el sistema de tarjetas.',
    preguntas: [
      { p: '¿Cuál es el objetivo central del pilar de Mantenimiento Planificado?',
        o: [['a', 'Reparar más rápido cuando el equipo se rompe'], ['b', 'Pasar de apagar incendios a mantener con plan, buscando cero averías'], ['c', 'Reemplazar al Mantenimiento Autónomo'], ['d', 'Reducir la cantidad de técnicos']],
        ok: 'b', ex: 'El Planificado busca eliminar las averías: dejar de reaccionar a las fallas y mantener los equipos con un plan basado en datos. Se apoya en un Autónomo sólido.' },
      { p: '¿Para qué limpiamos el equipo?',
        o: [['a', 'Para que se vea prolijo en las auditorías'], ['b', 'Para inspeccionar: al limpiar tocamos y miramos el equipo, y aparecen anomalías como pernos flojos, fugas, desgaste o ruidos'], ['c', 'Porque lo pide Seguridad e Higiene'], ['d', 'Para ocupar el tiempo muerto del turno']],
        ok: 'b', ex: 'Limpiar es inspeccionar. La suciedad esconde defectos y acelera el deterioro. Mantener el equipo limpio es una condición básica y la primera defensa contra el deterioro forzado.' },
      { p: 'Un mecánico que va a cambiar un rodamiento ve un perno flojo, una pérdida de aceite y una guarda suelta en el mismo equipo. ¿Qué tiene que hacer?',
        o: [['a', 'Nada: detectar anomalías es tarea del operador'], ['b', 'Hacer solo su trabajo y avisar de palabra'], ['c', 'Cargar una tarjeta por cada anomalía: el técnico también detecta y alimenta el sistema'], ['d', 'Esperar a que falle para repararlo todo junto']],
        ok: 'c', ex: 'Cualquiera que vea una anomalía carga la tarjeta, y el técnico es quien mejor ve el equipo por dentro. Lo que no se registra no se planifica ni queda en el historial. Limpieza, lubricación y ajuste son responsabilidad de todos.' },
      { p: '¿Qué se hace en el Paso 1 del Mantenimiento Planificado?',
        o: [['a', 'Armar el plan de predictivo'], ['b', 'Evaluar los equipos: clasificarlos por criticidad y relevar su historial de fallas'], ['c', 'Comprar repuestos para todos los equipos'], ['d', 'Capacitar a los operadores en limpieza']],
        ok: 'b', ex: 'Antes de planificar hay que saber qué importa: se clasifican los equipos A, B o C y se analizan sus fallas, tiempos y costos para decidir dónde concentrar el esfuerzo.' },
      { p: 'Si la bomba de vacío para, para toda la máquina, y además falló 5 veces en un año. En la matriz de criticidad, ¿dónde queda?',
        o: [['a', 'Criticidad C: se atiende cuando haya tiempo'], ['b', 'Criticidad B'], ['c', 'Criticidad A: alto impacto y alta frecuencia'], ['d', 'No entra en la matriz porque es una bomba']],
        ok: 'c', ex: 'La matriz cruza el impacto de la falla con su frecuencia. Si para la máquina y falla seguido, es crítica A. En el sistema, las áreas A suman puntos y sus tarjetas se priorizan antes.' },
      { p: '¿Qué es el "deterioro forzado"?',
        o: [['a', 'El desgaste normal de un equipo por uso'], ['b', 'El deterioro acelerado por no cumplir condiciones básicas o de uso: suciedad, falta de lubricación, agua, sobrecarga'], ['c', 'Un cambio de repuesto obligatorio por calendario'], ['d', 'Una falla causada por un corte de energía']],
        ok: 'b', ex: 'El deterioro natural es inevitable. El forzado lo provocamos nosotros al no respetar las condiciones. En el ejemplo, el agua que entraba al rodamiento lo hacía fallar una y otra vez.' },
      { p: 'En el Paso 2 (revertir el deterioro), cambiar el rodamiento de la bomba no alcanza. ¿Qué más hay que hacer?',
        o: [['a', 'Comprar dos rodamientos de repuesto'], ['b', 'Corregir la debilidad que causa la falla, por ejemplo agregar una protección para que no entre agua'], ['c', 'Cambiar el rodamiento más seguido'], ['d', 'Nada, con cambiarlo es suficiente']],
        ok: 'b', ex: 'El paso 2 tiene dos partes: restaurar a la condición original y corregir las debilidades que acortan la vida útil. Si no, el equipo vuelve a fallar por la misma causa.' },
      { p: 'Una tarjeta roja que requiere parar la máquina, ¿cómo la trata el sistema?',
        o: [['a', 'La cierra automáticamente'], ['b', 'La asigna a producción'], ['c', 'La ubica en el plan de la próxima parada, con horario, horas y personas del área que la resuelve'], ['d', 'La manda a Mejora Enfocada']],
        ok: 'c', ex: 'Cada tarjeta indica si se hace en marcha o con parada, cuántas horas y cuántas personas. El sistema arma el plan de parada ordenado por puntaje y con la gente del área que corresponde.' },
      { p: 'Paso 3 (gestión de información): ¿qué datos tiene que dejar cada intervención al cerrar la tarjeta?',
        o: [['a', 'Solo la fecha'], ['b', 'Qué se hizo, causa, horas reales, personas reales, repuestos y OT'], ['c', 'El nombre del supervisor'], ['d', 'Solo una foto']],
        ok: 'b', ex: 'Con esos datos se arma el historial del equipo: qué falló, por qué y cuánto costó. También mejora las estimaciones del plan y permite detectar repeticiones.' },
      { p: 'Al cerrar una tarjeta se marca "Agregar al plan preventivo". ¿Para qué sirve?',
        o: [['a', 'Para que la tarjeta no cuente en los indicadores'], ['b', 'Para convertir lo aprendido en una rutina periódica (por ejemplo, medir vibraciones todos los meses), que es la base del Paso 4'], ['c', 'Para reabrir la tarjeta'], ['d', 'Para avisarle a Calidad']],
        ok: 'b', ex: 'Así el historial se transforma en mantenimiento periódico: el Paso 4 arma el sistema preventivo a partir de datos reales y no de supuestos.' }
    ]
  },
  tpm: {
    titulo: 'Tarjetas TPM y pilares',
    desc: 'Repaso general de la capacitación: anomalías, colores de tarjeta y los tres pilares.',
    preguntas: [
      { p: '¿Qué es una anomalía (fuguai) en TPM?',
        o: [['a', 'Solo una falla que ya paró la máquina'], ['b', 'Cualquier diferencia respecto de la condición ideal del equipo que puede llevar a una falla, defecto o accidente'], ['c', 'Un error del operador'], ['d', 'Un reclamo de calidad del cliente']],
        ok: 'b', ex: 'La anomalía es la parte chica del iceberg que se ve antes de la falla: suciedad, pernos flojos, fugas, ruidos. Detectarla temprano evita la parada.' },
      { p: '¿Cuál de estas NO es uno de los 7 tipos de anomalía?',
        o: [['a', 'Lugar de difícil acceso'], ['b', 'Foco de contaminación'], ['c', 'Baja producción del turno'], ['d', 'Elemento innecesario']],
        ok: 'c', ex: 'Los 7 tipos son: condición básica incumplida, foco de contaminación, difícil acceso, deterioro, fuente de defecto de calidad, lugar inseguro y elemento innecesario.' },
      { p: 'Un operador ve un perno flojo en la guarda y lo puede ajustar él mismo con la herramienta del puesto. ¿Qué color de tarjeta corresponde?',
        o: [['a', 'Roja'], ['b', 'Azul'], ['c', 'Verde'], ['d', 'No hace falta tarjeta']],
        ok: 'b', ex: 'La azul la resuelve producción. La roja requiere mantenimiento (mecánico, eléctrico, ICOPRO o ingeniería) y la verde es una mejora. Aunque se resuelva en el momento, se registra.' },
      { p: '¿Cuál es el objetivo del Paso 1 de Mantenimiento Autónomo (limpieza inicial)?',
        o: [['a', 'Dejar la máquina linda para una auditoría'], ['b', 'Limpiar para inspeccionar: al tocar el equipo aparecen las anomalías y se ponen tarjetas'], ['c', 'Reemplazar al personal de limpieza'], ['d', 'Pintar el equipo']],
        ok: 'b', ex: 'Limpiar es inspeccionar. En el ejemplo del Pulper D30, un día de limpieza a fondo destapó 23 anomalías.' },
      { p: 'En el Paso 2 de Autónomo, ¿qué se ataca?',
        o: [['a', 'Las fuentes de suciedad y los lugares de difícil acceso'], ['b', 'El presupuesto de mantenimiento'], ['c', 'El plan de producción'], ['d', 'La capacitación en seguridad']],
        ok: 'a', ex: 'Se elimina la causa de la suciedad (tapar la guarda, poner una bandeja) y se facilita el acceso (llevar el engrasador afuera).' },
      { p: 'En Mantenimiento Planificado, ¿para qué sirve la matriz de criticidad del Paso 1?',
        o: [['a', 'Para decidir a quién sancionar'], ['b', 'Para saber qué equipos importan más, según el impacto de su falla y su frecuencia'], ['c', 'Para calcular sueldos'], ['d', 'Para comprar repuestos más baratos']],
        ok: 'b', ex: 'Cruza impacto con frecuencia. La bomba de vacío cae en la zona A porque, si para, para la máquina.' },
      { p: 'En Mantenimiento de Calidad, ¿qué muestra la matriz QA?',
        o: [['a', 'En qué etapa del proceso nace cada defecto de calidad'], ['b', 'El ranking de operadores'], ['c', 'Los costos del mes'], ['d', 'El stock de repuestos']],
        ok: 'a', ex: 'Cruza defectos con etapas. En el ejemplo, la mancha de aceite se concentraba en prensas.' },
      { p: 'Al cerrar una tarjeta en el sistema, ¿qué datos son obligatorios?',
        o: [['a', 'Solo la foto'], ['b', 'Acción realizada, quién la resolvió, causa, horas reales y personas reales'], ['c', 'Nada, alcanza con cambiar el estado'], ['d', 'El número de OT y el costo']],
        ok: 'b', ex: 'Con esos datos se arma el historial del equipo, se mejoran las estimaciones de la planificación y se detectan repeticiones.' }
    ]
  }
};
