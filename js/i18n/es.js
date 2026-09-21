/* Español */
(function (root) {
  'use strict';

  root.I18n.register({
    code: 'es',
    name: 'Español',
    dir: 'ltr',
    locale: 'es-ES',
    weekStart: 1,
    currency: { code: 'ILS', symbol: '₪', position: 'after' },
    dict: {
      app: {
        title: 'SetShifts',
        subtitle: 'Programación con IA para cada sucursal: disponibilidad, solicitudes, puestos y tus reglas',
        language: 'Idioma'
      },

      days: {
        0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
        4: 'Jueves', 5: 'Viernes', 6: 'Sábado'
      },
      daysShort: { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' },

      shifts: { morning: 'Mañana', middle: 'Mediodía', evening: 'Tarde', night: 'Noche' },

      seed: {
        branchCenter: 'Sucursal centro', branchNorth: 'Sucursal norte', branchSouth: 'Sucursal sur',
        employee: 'Empleado {n}',
        noteFloater: 'Cubre todas las sucursales', noteStudent: 'Estudiante: sin mañanas'
      },

      colors: {
        0: 'Ámbar', 1: 'Verde', 2: 'Azul', 3: 'Morado',
        4: 'Rosa', 5: 'Turquesa', 6: 'Gris', 7: 'Marrón'
      },

      tabs: {
        support: 'Soporte',
        schedule: 'Horario', constraints: 'Solicitudes', employees: 'Personal',
        branches: 'Sucursales', users: 'Usuarios', billing: 'Suscripción', settings: 'Ajustes'
      },

      toolbar: {
        prevWeek: 'Semana anterior', nextWeek: 'Semana siguiente', thisWeek: 'Esta semana',
        week: 'Semana {from} – {to}', currentWeek: 'Semana actual',
        generate: 'Generar horario', clear: 'Vaciar horario',
        keepManual: 'Mantener las asignaciones manuales',
        copyText: 'Copiar como texto', excel: 'Excel', csv: 'CSV', print: 'Imprimir',
        moreTools: 'Más herramientas', closeTools: 'Cerrar herramientas',
        viewOnly: 'Solo lectura', exitViewOnly: 'Salir de solo lectura',
        shabbatEnd: 'Fin del Sabbat',
        byBranch: 'Por sucursal', byEmployee: 'Por empleado',
        personalExport: 'Exportación personal (solo sus turnos):',
        choosePerson: 'Elige una persona…',
        holidays: 'Festivos (todas las sucursales cerradas):'
      },

      schedule: {
        branch: 'Sucursal', shift: 'Turno', employee: 'Empleado', totalShifts: 'Turnos en total',
        empty: '— vacío —', add: '+ añadir', addPerson: '+ añadir persona', notAssigned: '— sin asignar —',
        closed: 'Cerrado este día', noBranches: 'No hay sucursales activas. Abre la pestaña Sucursales.',
        required: 'Necesarios: {count}', people: '{count} personas',
        holidayClosed: 'Todas las sucursales cerradas', dayOff: 'Día libre', holiday: 'Festivo',
        missingSabbath: 'Falta la hora de fin del Sabbat'
      },

      status: {
        demoTitle: 'Modo demostración',
        demoBody: 'Los datos se guardan solo en este navegador y no pasan entre dispositivos.',
        synced: 'Sincronizado entre dispositivos', syncedAt: 'Sincronizado entre dispositivos · actualizado {time}',
        localOnly: 'Guardado solo en este dispositivo', readOnly: 'Solo lectura: sin permiso de edición',
        remoteUpdate: 'Actualización recibida de otro dispositivo ({time})',
        localCopy: 'Esta es una copia local: los datos se guardan solo en este navegador y no se sincronizan. ' +
          'Para trabajar desde dos ordenadores usa la versión alojada. Para mover los datos: exporta el JSON en Ajustes e impórtalo allí.',
        viewOnlyBanner: 'Solo lectura: el horario se muestra para revisión y la edición está desactivada. ' +
          'La exportación, la impresión y el cambio de semana siguen funcionando.'
      },

      levels: { error: 'Error', warning: 'Aviso', info: 'Nota' },

      marks: {
        dayOff: 'día libre', blocked: 'bloqueado', prefers: 'prefiere',
        notInBranch: 'no es de esta sucursal', notInShift: 'no hace este turno',
        alreadyAssigned: 'ya asignado', inactive: 'inactivo'
      },

      issueTypes: {
        'duplicate-shift': 'Solapamiento',
        'duplicate-employee-slot': 'Solapamiento',
        'double-booked': 'Dos turnos en un día',
        understaffed: 'Falta personal',
        'constraint-off': 'Solicitud incumplida',
        'constraint-blocked': 'Solicitud incumplida',
        'branch-mismatch': 'Sucursal incorrecta',
        'shift-mismatch': 'Tipo de turno incorrecto',
        'over-max': 'Por encima del límite',
        rest: 'Descanso corto',
        'no-shifts': 'Sin turnos',
        'missing-shabbat-end': 'Falta la hora de fin del Sabbat',
        'inactive-slot': 'Turno cerrado',
        'pending-constraints': 'Solicitudes pendientes',
        'extra-days-off': 'Demasiados días libres',
        'below-target': 'Por debajo del objetivo'
      },

      toast: {
        generated: 'Horario generado: {shifts} sin cubrir',
        generatedFull: 'Horario generado: todos los turnos están cubiertos',
        clearWeekConfirm: '¿Vaciar todas las asignaciones de esta semana? Las solicitudes se mantienen.',
        cleared: 'Horario vaciado',
        copied: 'Horario copiado al portapapeles',
        personalCopied: 'Horario personal copiado al portapapeles',
        viewOnlyOn: 'Solo lectura activado: la edición está desactivada',
        viewOnlyOff: 'Solo lectura desactivado: ya puedes editar',
        copyPrompt: 'Copia el texto:',
        holidayCleared: '{day} vuelve a ser día laborable',
        holidayPrompt: 'Nombre del festivo del {day} (las sucursales cierran y el día cuenta como libre para todos):',
        holidayDefault: 'Festivo',
        holidayHasAssignments: 'Ese día ya hay {count} personas asignadas. ¿Marcarlo como festivo y vaciarlas?',
        holidayMarked: '{day} marcado como festivo: las sucursales están cerradas',
        clearConstraintsConfirm: '¿Borrar todas las solicitudes de esta semana?',
        constraintsCleared: 'Solicitudes borradas',
        noPreviousConstraints: 'No hay solicitudes en la semana anterior',
        constraintsCopied: 'Solicitudes copiadas de la semana anterior',
        requestApproved: 'Solicitud aprobada', requestRejected: 'Solicitud rechazada',
        updateFailed: 'No se pudo actualizar',
        deleteShiftConfirm: '¿Eliminar el turno "{name}"?\n\n{usage}',
        deleteShiftUsed: 'Está configurado en {count} días de sucursal y se borrarán todas sus asignaciones.',
        deleteShiftUnused: 'No lo usa ninguna sucursal.',
        shiftDeleted: 'Turno eliminado{removed}',
        shiftRemovedCount: ' ({count} asignaciones eliminadas)',
        shiftAdded: 'Turno añadido. Configúralo en Sucursales para que aparezca en el horario.',
        newShift: 'Turno {n}',
        applyHoursConfirm: '¿Aplicar el horario predeterminado a las {count} sucursales, de domingo a jueves?\n\n' +
          'Los días abiertos y el número de personas se mantienen. El viernes y la noche del sábado no cambian.',
        hoursUpdated: 'Horas actualizadas en {count} turnos',
        hoursAlready: 'Todos los turnos ya usan estas horas',
        imported: 'Datos importados',
        importedCloud: 'Datos importados y subidos a la nube ({count} semanas)',
        importFailed: 'Archivo no válido: {message}',
        resetConfirm: '¿Restablecer todos los datos (personal, sucursales, horarios y solicitudes) a los valores por defecto?',
        reset: 'Datos restablecidos'
      },

      ui: {
        until: 'hasta {time}', sheet: 'Hoja {n}',
        fileSaved: 'Archivo guardado', fileFailed: 'No se pudo guardar el archivo: {message}',
        unknownError: 'error desconocido', downloadUnavailable: 'Aquí no se pueden descargar archivos',
        loadFailed: 'No se pudieron cargar los datos; se cargaron los valores por defecto',
        saveFailed: 'No se pudieron guardar los datos',
        iconLetters: 'TU',
        dayHeading: '{day} ({date})',
        missingStaff: 'falta personal',
        holidayClosedLine: '{name}: todas las sucursales cerradas',
        spareLine: '— {verb} {shifts} por asignar —',
        unknownBranch: 'Sucursal desconocida', unknownEmployee: 'Persona desconocida',
        weekLabel: 'Semana {from} – {to}', constraintsWeek: 'Solicitudes · {label}',
        holidayAllClosed: 'Todas las sucursales cerradas: día libre para todos',
        holidayNoRequests: 'Festivo: no hacen falta solicitudes',
        branchClosedToday: 'Cerrado este día',
        noActiveBranches: 'No hay sucursales activas.',
        noActiveBranchesTab: 'No hay sucursales activas. Abre la pestaña Sucursales.',
        allClosedOn: 'Todas las sucursales están cerradas el {day}.',
        branchesClosed: 'Sucursales cerradas',
        noHours: 'Sin horario',
        outOf: '{done} de {total}',
        cloudSaved: 'Los datos se guardan en la nube y se actualizan en todos los ordenadores abiertos con este enlace',
        deviceSaved: 'Los datos se guardan solo en este navegador',
        thinking: 'Pensando…',
        noAnswer: '(no se recibió respuesta)',
        chatBlocked: 'No tienes permiso para hacer preguntas en esta página.',
        chatRateLimited: 'Demasiadas preguntas seguidas: inténtalo de nuevo en un momento.',
        chatFailed: 'No he podido responder ahora mismo',
        chatSystem: 'Ayudas a un responsable a gestionar un horario de turnos. Responde en {language}, breve y al grano, ' +
          'y basándote solo en los datos siguientes. Si falta información, dilo en lugar de suponer.',
        chatDataStart: '=== datos de la semana ===',
        chatDataEnd: '=== fin de los datos ===',
        chatQuestion: 'Pregunta: ',
        summaryShabbat: 'Fin del Sabbat: {time}',
        summaryHolidays: 'Festivos cerrados: {days}', summaryNoHolidays: 'Esta semana no hay festivos.',
        summaryRules: 'Reglas de planificación:',
        ruleOnePerDayOn: 'Cada persona trabaja como máximo un turno al día.',
        ruleOnePerDayOff: 'Una persona puede hacer varios turnos al día.',
        ruleRestOn: 'Sin turno de mañana después de un turno de tarde el día anterior.',
        ruleRestOff: 'Sin descanso obligatorio entre un turno de tarde y uno de mañana.',
        summaryBranches: 'Sucursales:', summaryEmployees: 'Personal:',
        summaryCurrent: 'Horario actual:', summaryAvailability: 'Disponibilidad restante:',
        summaryIssues: 'Avisos del horario:', summaryNoIssues: 'Sin avisos: el horario es válido.',
        closedAllWeek: 'cerrado toda la semana', allBranches: 'todas las sucursales',
        peopleCount: '{count} personas',
        empBranches: 'sucursales', empShifts: 'turnos', empMax: 'máximo {count} por semana',
        empAskedOff: 'pidió libre', empBlocked: 'bloqueó', empNote: 'nota',
        empAssignedOf: '{name}: asignado {total} de una cuota de {max}',
        empFreeDays: 'días libres: {days}', none: 'ninguno',
        fileName: 'horario', personalFileName: 'horario-{name}',
        greeting: 'Hola {name}, este es tu horario:',
        shortTitle: 'Turnos'
      },

      alerts: {
        slotLabel: '{day} · {branch} · turno de {shift}',
        deletedEmployee: '(persona eliminada: {id})',
        deletedBranch: '(sucursal eliminada)',
        errorsOne: 'Un error', errorsOther: '{count} errores',
        warningsOne: 'Un aviso', warningsOther: '{count} avisos',
        infosOne: 'Una nota', infosOther: '{count} notas',
        allGood: '✔ El horario es válido: sin solapamientos, huecos ni solicitudes incumplidas',
        showAll: 'Ver los {count} avisos', showLess: 'Ocultar los avisos',
        duplicate: 'Solapamiento: {label} – hay {count} personas asignadas ({names}) en lugar de {need}.',
        duplicateSelf: 'Solapamiento: {name} está asignado dos veces al mismo turno – {label}.',
        doubleBooked: 'Solapamiento: {name} tiene {count} turnos el {day}{where} ({detail}).',
        sameBranch: ' en la misma sucursal', differentBranches: ' en sucursales distintas',
        understaffed: 'Falta personal: {label} – {assigned} de {need} asignados.',
        reasonBusy: '{names} ya tienen otro turno ese día',
        reasonMaxed: '{names} han llegado a su límite semanal de turnos',
        reasonResting: '{names} necesitan descanso entre un turno de tarde y uno de mañana',
        reasonNone: 'Nadie está configurado a la vez para esta sucursal y este turno, o todos lo han bloqueado.',
        reasonFree: 'Hay personas libres ({names}): prueba a generar el horario otra vez.',
        reasonPrefix: 'Motivo: ',
        suggestTwoPerDay: ' Puedes permitir dos turnos al día por persona en Ajustes.',
        suggestRaiseMax: ' Puedes subir el límite semanal en la ficha del empleado.',
        constraintOff: 'Solicitud incumplida: {name} pidió libre el {day} pero está asignado a {shift} en {branch}.',
        constraintBlocked: 'Solicitud incumplida: {name} bloqueó {shift} el {day} pero está asignado a ese turno en {branch}.',
        branchMismatch: '{name} está asignado a {branch} el {day} aunque esa sucursal no está en su ficha.',
        shiftMismatch: '{name} está asignado a {shift} el {day} aunque ese tipo de turno no está en su ficha.',
        overMax: 'Por encima del límite: {name} tiene {total} turnos (máximo {max}).',
        noShifts: '{name} no tiene turnos esta semana.',
        rest: 'Descanso corto: {name} termina una tarde el {previous} y empieza una mañana el {day}.',
        holidayAssignment: 'Asignación en festivo: {day} ({name}) está marcado como cerrado, pero hay asignados: {names}.',
        inactiveSlot: 'Asignación a un turno que no está abierto: {day} · {branch} · {shift} ({names}).',
        missingSabbath: 'No hay hora de fin del Sabbat para esta semana: no se puede calcular el inicio de los turnos de la noche del sábado.',
        pendingOne: 'Hay una solicitud pendiente de aprobación: {name} ({day}). Hasta que se apruebe no afecta al horario.',
        pendingOther: 'Hay {count} solicitudes pendientes de aprobación: {names}. Hasta que se aprueben no afectan al horario.',
        extraDaysOff: '{name} ha pedido {count} días libres ({days}): la política permite un día libre por semana.',
        belowTarget: '{name} pidió libre el {day} y tiene {total} de {expected} turnos posibles: aún le quedan días libres.'
      },

      availability: {
        title: 'Qué queda disponible',
        none: 'No queda disponibilidad – {reason}',
        reasonMaxed: 'todos han llegado a su límite semanal de turnos.',
        reasonNoDays: 'quienes tienen cuota libre no tienen ningún día libre con sus sucursales abiertas.',
        totalOne: '{verb} un turno más por asignar, entre {people}:',
        totalOther: '{verb} {count} turnos más por asignar, entre {people}:',
        peopleOne: 'una persona', peopleOther: '{count} personas',
        left: '{verb} {shifts} de cuota · libre el {days}',
        leftNoDays: '{verb} {shifts} de cuota, pero no hay ningún día libre esta semana',
        full: 'cuota completa ({assigned} de {max})',
        noEmployees: 'No hay personal activo.',
        shiftsOne: 'un turno', shiftsOther: '{count} turnos',
        remains: 'queda', remainPlural: 'quedan'
      },

      constraints: {
        title: 'Solicitudes de {week}',
        clear: 'Borrar esta semana', copyPrevious: 'Copiar de la semana anterior',
        legend: 'Pulsa un turno para alternar: {free} → {preferred} → {blocked}. «Día libre» bloquea todo el día.',
        free: 'Disponible', preferred: 'Prefiere', blocked: 'No puede', dayOff: 'Día libre',
        pendingTitle: 'Solicitudes pendientes de tu aprobación ({count})',
        pendingHint: 'Una solicitud sin aprobar no afecta al horario.',
        approve: 'Aprobar', reject: 'Rechazar',
        approved: 'Aprobada', rejected: 'Rechazada', pending: 'Pendiente de aprobación',
        requestLabel: 'Solicitud: {detail}', requestRejected: 'Solicitud rechazada',
        reason: 'Motivo (opcional)',
        reasonPlaceholder: 'p. ej. boda, examen, cita médica',
        reasonSaved: 'Motivo guardado', reasonGiven: 'Motivo indicado: {text}',
        managerNote: 'Nota del responsable: {text}',
        needsApproval: 'Cada solicitud pasa por tu responsable y solo afecta al horario una vez aprobada.',
        noChange: 'Sin cambios'
      },

      employees: {
        title: 'Personal', add: '+ Añadir persona', active: 'Activo',
        branchesLabel: 'Sucursales (sin selección = todas)',
        shiftTypes: 'Tipos de turno que puede hacer',
        maxShifts: 'Máximo de turnos por semana', note: 'Nota',
        deleteConfirm: '¿Eliminar a {name}? Sus asignaciones se quitarán de todas las semanas.',
        inactive: '(inactivo)', newName: 'Persona nueva'
      },

      branches: {
        title: 'Sucursales', add: '+ Añadir sucursal', active: 'Activa', newName: 'Sucursal nueva',
        hint: 'Cada sucursal tiene sus propios días, horas y número de personas por turno. ' +
          'Poner 0 personas cierra ese turno ese día. Asignar más de lo indicado se marca como solapamiento.',
        peopleLabel: 'Personas', closed: 'Cerrado', day: 'Día',
        copyFrom: 'Copiar días y horas de otra sucursal', chooseBranch: 'Elige una sucursal…',
        copyConfirm: '¿Copiar los días y las horas de {from} a {to}?',
        copied: 'Días y horas copiados',
        deleteConfirm: '¿Eliminar {name}? Sus asignaciones se quitarán de todas las semanas.',
        autoSabbath: 'Según el fin del Sabbat', autoSabbathLabel: 'Fin del Sabbat +30 min'
      },

      why: {
        button: '¿Por qué esta persona?',
        title: '¿Por qué {name}?',
        onlyOption: 'Nadie más podía cubrir este turno.',
        fairest: 'De las {count} personas disponibles, era la elección más justa según las horas acumuladas.',
        alsoPossible: 'También podían cubrirlo: {names}.',
        whoCould: 'Quién no podía ({count})',
        fact: {
          requested: 'Pidió este turno ese día',
          available: 'Sin solicitud de día libre',
          qualified: 'Formado para este turno',
          assignedBranch: 'Asignado a esta sucursal',
          anyBranch: 'Trabaja en cualquier sucursal',
          quota: '{used} de {target} turnos esta semana',
          rest: 'Se respeta el descanso entre tarde y mañana',
          continuity: 'Ya en esta sucursal {count} veces esta semana'
        },
        blocked: {
          inactive: 'no está activo',
          notQualified: 'no está formado para este turno',
          otherBranch: 'trabaja en otra sucursal',
          requestedOff: 'pidió el día libre',
          blockedShift: 'pidió no trabajar en este turno',
          atLimit: 'alcanzó el límite semanal de {max}',
          busySameDay: 'ya trabaja ese día',
          busySameShift: 'ya está en este turno',
          restRule: 'necesita descanso entre tarde y mañana'
        }
      },
      preview: {
        open: 'Vista de empleado',
        title: '¿Qué pantalla quieres ver?',
        hint: 'Solo lectura. Nada de lo que hagas aquí se guarda como esa persona.',
        banner: 'Estás viendo la pantalla de {name}',
        exit: 'Volver a gestión',
        noEmployees: 'Todavía no hay personal activo.'
      },
      support: {
        title: 'Soporte',
        promise: 'Cuéntanos qué falla o qué necesitas. Una persona responde en {hours} horas.',
        whatsapp: 'WhatsApp',
        newTitle: 'Abrir un ticket',
        kindLabel: 'Tipo', subjectLabel: 'Asunto', bodyLabel: '¿Qué ha pasado?',
        send: 'Enviar',
        sent: 'Recibido. Una persona responderá en {hours} horas.',
        sendFailed: 'No se pudo enviar el ticket. Inténtalo de nuevo.',
        loadFailed: 'No se pudieron cargar tus tickets.',
        listTitle: 'Tus tickets',
        empty: 'Aún no hay tickets.',
        replyLabel: 'Nuestra respuesta:',
        errorSubject: 'Escribe un asunto.',
        errorBody: 'Describe qué ha pasado.',
        errorSubjectLong: 'El asunto supera los {max} caracteres.',
        errorBodyLong: 'La descripción supera los {max} caracteres.',
        kind: { bug: 'Algo no funciona', feature: 'Petición de función', question: 'Pregunta' },
        status: { open: 'Abierto', in_progress: 'En curso', answered: 'Respondido', closed: 'Cerrado' }
      },
      settings: {
        rules: 'Reglas de planificación',
        onePerDay: 'Cada persona trabaja como máximo un turno al día',
        rest: 'Sin turno de mañana después de un turno de tarde el día anterior',
        oneDayOff: 'El día marcado como libre en Solicitudes es el único día libre de la semana',
        shiftTypes: 'Tipos de turno',
        addShift: '+ Añadir turno', applyHours: 'Aplicar las horas a todas las sucursales (lun–vie)',
        shiftsHint: 'Define cuántos turnos tiene tu negocio, cómo se llaman, sus horas, color y orden. ' +
          'Las horas de aquí son las predeterminadas; cada sucursal puede cambiarlas. ' +
          'El botón actualiza las sucursales existentes sin tocar los días abiertos ni el número de personas.',
        shiftNamePlaceholder: 'Nombre del turno',
        sabbathTitle: 'Noche del sábado',
        sabbathDefault: 'Hora de fin del Sabbat por defecto para una semana nueva:',
        sabbathHint: 'Cada semana puedes ajustar la hora real en la parte superior de la pestaña Horario. ' +
          'Los turnos de la noche del sábado empiezan media hora después.',
        backup: 'Copia de seguridad',
        exportJson: 'Exportar todos los datos (JSON)', importJson: 'Importar datos',
        reset: 'Restablecer valores por defecto',
        backupHint: 'Los datos se guardan automáticamente en este navegador. Para moverlos entre ordenadores, exporta un archivo JSON.',
        backupHintCloud: 'Los datos se guardan en la nube y se sincronizan en todos los dispositivos. La exportación JSON es para tu propia copia de seguridad.',
        languageTitle: 'Idioma', languageHint: 'Cambia toda la interfaz. Se guarda en este dispositivo.'
      },

      server: {
        confirmEmail: 'Revisa tu correo y confirma la dirección, y luego inicia sesión',
        credentialsRequired: 'Hacen falta el correo y la contraseña',
        passwordTooShort: 'La contraseña debe tener al menos 6 caracteres',
        emailTaken: 'Ese correo ya está registrado',
        companyRequired: 'Hace falta un nombre de empresa',
        badCredentials: 'Correo o contraseña incorrectos',
        userInactive: 'Este usuario no está activo. Contacta con el responsable de la empresa.',
        signInRequired: 'Inicia sesión',
        noPermission: 'No tienes permiso para hacer eso',
        notLinked: 'Este usuario no está vinculado a una ficha de empleado',
        weekPublished: 'El horario de esta semana ya está publicado, así que las solicitudes ya no se pueden cambiar',
        weekPublishedShort: 'El horario de esta semana ya está publicado',
        noRequest: 'No hay ninguna solicitud para ese día',
        badDecision: 'Decisión no válida',
        requestNotFound: 'Solicitud no encontrada',
        weekMissing: 'Esa semana no existe',
        userNotFound: 'Usuario no encontrado',
        cannotChangeOwner: 'El propietario de la cuenta no se puede cambiar'
      },

      notify: {
        published: 'Horario publicado',
        publishedBody: 'El horario de la nueva semana ya está listo. Puedes ver tus turnos.',
        requestApproved: 'Tu solicitud ha sido aprobada',
        requestApprovedBody: 'Tu solicitud para el {day} ha sido aprobada.',
        requestRejected: 'Tu solicitud ha sido rechazada',
        requestRejectedBody: 'Tu solicitud para el {day} ha sido rechazada',
        newRequest: 'Nueva solicitud',
        newRequestBody: 'Alguien ha enviado una solicitud pendiente de tu aprobación.',
        newRequestsBody: 'Hay {count} solicitudes nuevas pendientes de tu aprobación.'
      },

      payments: {
        notConnected: 'El cobro aún no está conectado. Contacta con soporte.',
        mockProvider: 'Proveedor de prueba (desarrollo)',
        mockNote: 'El pago se aprueba al instante sin cargo real. Solo para desarrollo y demostraciones.',
        unknownPlan: 'Plan desconocido',
        serverProvider: 'Cobro por servidor ({name})',
        notConfigured: 'El cobro no está configurado en este entorno',
        requestFailed: 'La solicitud de cobro ha fallado ({status})'
      },

      billing: {
        firstCharge: 'Primer cobro',
        nextCharge: 'Próximo cobro',
        paymentMethod: 'Método de pago',
        cardOnFile: 'Guardado',
        noCard: 'No añadido',
        addCard: 'Añadir método de pago',
        noCardWarning: 'Aún no hay método de pago. Sin él, el acceso termina el {date}.',
        trialNotice: 'No se te cobra durante los primeros {days} días. El primer cobro es el {date} por {price}, y después cada mes, hasta que canceles.',
        cancelBeforeCharge: 'Cancelar antes del cobro',
        cancelTrialConfirm: '¿Cancelar la suscripción? No se te cobrará y el acceso se mantiene hasta el final de la prueba.',
        resume: 'Reanudar la suscripción',
        resumed: 'Suscripción reanudada',
        priceMonthly: '{amount} ILS / mes', priceAmount: '{amount} ILS',
        updateFailed: 'No se pudo actualizar', cancelFailed: 'No se pudo cancelar',
        title: 'Tu suscripción', status: 'Estado', plan: 'Plan', validUntil: 'Válida hasta',
        activeStaff: 'Personal activo', of: '{count} de {max}', unlimited: '{count} (sin límite)',
        plans: 'Planes', choose: 'Elegir', currentPlan: 'Plan actual',
        tooSmall: 'Demasiado pequeño para {count} empleados', cancel: 'Cancelar suscripción',
        cancelConfirm: '¿Cancelar la suscripción? El acceso termina al acabar el periodo pagado.',
        planUpdated: 'Plan actualizado', canceled: 'Suscripción cancelada',
        ownerOnly: 'Solo el propietario de la cuenta puede cambiar la suscripción.',
        perMonth: 'al mes',
        statusTrial: 'Prueba', statusActive: 'Activa', statusPastDue: 'Pago fallido',
        statusCanceled: 'Cancelada', statusExpired: 'Caducada'
      },

      auth: {
        wait: 'Un momento…',
        notifyEnabled: 'Notificaciones activadas',
        notifyBody: 'Te avisaremos de los cambios en el horario.',
        signIn: 'Iniciar sesión', signUp: 'Crear cuenta de empresa',
        email: 'Correo', password: 'Contraseña', name: 'Tu nombre', companyName: 'Nombre de la empresa',
        passwordHint: 'Al menos 6 caracteres',
        enter: 'Entrar', create: 'Crear cuenta', signingIn: 'Entrando…', creating: 'Creando…',
        trialNote: '{days} días gratis. El primer cobro es el {date}; cancela antes y no pagas nada.',
        signOut: 'Salir', blocked: 'Acceso bloqueado',
        blockedOwner: 'Contacta con soporte para activar la suscripción.',
        blockedMember: 'Pide al propietario de la cuenta que renueve la suscripción.',
        enableNotifications: 'Activar notificaciones',
        failedSignIn: 'No se pudo iniciar sesión', failedSignUp: 'No se pudo crear la cuenta'
      },

      users: {
        nameColumn: 'Nombre', emailColumn: 'Correo', createFailed: 'No se pudo crear el usuario',
        title: 'Usuarios',
        hint: 'Cada persona puede tener su propio acceso. Solo ve sus turnos y envía sus solicitudes: ' +
          'no ve el horario completo ni puede cambiar nada. Los responsables lo ven y lo editan todo. ' +
          'Vincula un usuario a una ficha de empleado para que vea sus turnos.',
        add: 'Añadir usuario', createUser: 'Crear usuario',
        role: 'Rol', staffCard: 'Ficha de empleado', none: 'Ninguna', noLink: 'Sin vincular',
        initialPassword: 'Contraseña inicial', activeColumn: 'Activo',
        created: 'Usuario creado para {email}', updated: 'Guardado', updateFailed: 'No se pudo actualizar'
      },

      access: {
        trialWithCard: 'Prueba: quedan {days} días. Primer cobro el {date}, {price}.',
        trialNoCard: 'Prueba: quedan {days} días. Añade un método de pago para seguir después del {date}.',
        trialEndedNoCard: 'La prueba ha terminado. Añade un método de pago para continuar.',
        trialCanceled: 'Cancelado: no se te cobrará. El acceso se mantiene hasta el {date}.',
        canceledAtPeriodEnd: 'Cancelado. El acceso se mantiene hasta el {date} y no habrá más cobros.',
        charging: 'La prueba ha terminado y el primer cobro se está procesando.',
        noCompany: 'No se ha encontrado la empresa',
        expired: 'La suscripción ha caducado. Renuévala para continuar.',
        pastDueBlocked: 'No se ha recibido el pago y el acceso está bloqueado. Actualiza el método de pago.',
        pastDue: 'El último pago no se ha completado. El acceso se bloqueará en {days} días.',
        expiredKept: 'La suscripción caducó y no se renovó. Al elegir un plan se recupera el acceso al instante, y tus datos están a salvo.',
        canceled: 'La suscripción se canceló. Puedes renovarla cuando quieras: tus datos están a salvo.',
        inactive: 'La suscripción no está activa.',
        overLimit: 'El plan {plan} cubre hasta {max} empleados. Tienes {count}: hace falta el plan {suggested} ({range}, {price}).'
      },

      plans: {
        starter: 'Pequeño', growth: 'Mediano', business: 'Grande',
        upTo: 'Hasta {count} empleados',
        between: 'De {from} a {to} empleados',
        from: '{count} empleados o más'
      },

      roles: { owner: 'Propietario', manager: 'Responsable', employee: 'Empleado' },

      employee: {
        prevWeek: '◀ Semana anterior', nextWeek: 'Semana siguiente ▶',
        loadFailed: 'No se pudieron cargar los datos: {message}',
        saveFailed: 'No se pudo guardar', reasonSaveFailed: 'No se pudo guardar el motivo',
        myShifts: 'Mis turnos', myRequests: 'Mis solicitudes',
        notPublished: 'El horario de esta semana todavía no se ha publicado.',
        noShifts: 'No tienes turnos esta semana.',
        totalWeek: '{count} turnos esta semana.',
        publishedLocked: 'El horario está publicado: ya no se pueden cambiar las solicitudes de esta semana.',
        notLinked: 'Tu usuario aún no está vinculado a una ficha de empleado. Habla con tu responsable.',
        noShiftsToday: 'No hay turnos este día', holidayNoWork: 'Festivo: no se trabaja'
      },

      chat: {
        title: 'Preguntas sobre este horario',
        hint: 'Pregunta sobre la semana en pantalla, por ejemplo «¿quién trabaja el martes por la tarde?», ' +
          '«¿por qué Empleado 3 no está el jueves?» o «¿quién puede cubrir a Empleado 5 el miércoles?»',
        placeholder: 'Pregunta sobre el horario…', send: 'Enviar'
      },

      excel: {
        availabilityNone: 'No queda nada: esta semana no se pueden asignar más turnos',
        availabilityLeft: '{verb} {shifts} por asignar',
        spare: 'Cuota restante', required: 'Necesarios',
        valid: 'Válido', checksTitle: 'Comprobaciones del horario',
        personalText: 'Texto para WhatsApp',
        byBranch: 'Por sucursal', byEmployee: 'Por empleado', availability: 'Disponibilidad',
        checks: 'Comprobaciones', personal: 'Mi horario',
        title: 'Horario de trabajo – semana del {from} al {to}',
        viewBranch: 'Por sucursal', viewEmployee: 'Por empleado',
        sabbathEnds: 'Fin del Sabbat {time}',
        day: 'Día', date: 'Fecha', branch: 'Sucursal', shift: 'Turno', hours: 'Horas',
        staff: 'Empleado', assigned: 'Asignados', quota: 'Cuota', left: 'Cuota restante',
        canAssign: 'Se puede asignar', freeDays: 'Días libres', totalShifts: 'Turnos en total',
        severity: 'Gravedad', type: 'Tipo', detail: 'Detalle',
        missing: '— falta —', closed: 'Cerrado', notAssigned: 'Sin asignar',
        personalTitle: 'Horario personal – {name}', totalWeek: '{count} turnos esta semana',
        noIssues: 'Sin solapamientos, huecos ni solicitudes incumplidas'
      },

      errors: {
        invalidTime: 'Hora no válida: usa el formato de 24 horas, por ejemplo 09:30',
        emptyShiftName: 'El nombre del turno no puede estar vacío',
        lastShift: 'Debe quedar al menos un turno',
        notSaved: 'No se pudo guardar', copied: 'Copiado al portapapeles',
        viewOnlyBlocked: 'Solo lectura: la edición está desactivada. Puedes desactivarlo arriba en la pantalla.',
        duplicatePerson: 'La misma persona no puede aparecer dos veces en un turno',
        printBlocked: 'Aquí no se puede imprimir: usa «Copiar como texto» o la exportación a Excel',
        chooseEmployee: 'Elige una persona para la exportación personal'
      },

      common: {
        emailUs: 'Escríbenos',
        moveUp: 'Subir', moveDown: 'Bajar', timePlaceholder: 'hh:mm',
        save: 'Guardar', cancel: 'Cancelar', delete: 'Eliminar', close: 'Cerrar',
        yes: 'Sí', no: 'No', all: 'Todo', and: 'y', more: 'y {count} más'
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
