/* Português */
(function (root) {
  'use strict';

  root.I18n.register({
    code: 'pt',
    name: 'Português',
    dir: 'ltr',
    locale: 'pt-PT',
    weekStart: 1,
    currency: { code: 'ILS', symbol: '₪', position: 'after' },
    dict: {
      app: {
        title: 'Planeador de turnos',
        subtitle: 'Planeamento semanal por filial, com deteção de sobreposições e falhas',
        language: 'Idioma'
      },

      days: {
        0: 'Domingo', 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira',
        4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado'
      },
      daysShort: { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' },

      shifts: { morning: 'Manhã', middle: 'Tarde', evening: 'Fim do dia', night: 'Noite' },

      seed: {
        branchCenter: 'Filial centro', branchNorth: 'Filial norte', branchSouth: 'Filial sul',
        employee: 'Colaborador {n}',
        noteFloater: 'Cobre todas as filiais', noteStudent: 'Estudante – sem turnos de manhã'
      },

      colors: {
        0: 'Âmbar', 1: 'Verde', 2: 'Azul', 3: 'Roxo',
        4: 'Rosa', 5: 'Turquesa', 6: 'Cinzento', 7: 'Castanho'
      },

      tabs: {
        schedule: 'Horário', constraints: 'Pedidos', employees: 'Equipa',
        branches: 'Filiais', users: 'Utilizadores', billing: 'Subscrição', settings: 'Definições'
      },

      toolbar: {
        prevWeek: 'Semana anterior', nextWeek: 'Semana seguinte', thisWeek: 'Esta semana',
        week: 'Semana {from} – {to}', currentWeek: 'Semana atual',
        generate: 'Gerar horário', clear: 'Limpar horário',
        keepManual: 'Manter as atribuições manuais',
        copyText: 'Copiar como texto', excel: 'Excel', csv: 'CSV', print: 'Imprimir',
        moreTools: 'Mais ferramentas', closeTools: 'Fechar ferramentas',
        viewOnly: 'Apenas leitura', exitViewOnly: 'Sair de apenas leitura',
        shabbatEnd: 'Fim do Shabbat',
        byBranch: 'Por filial', byEmployee: 'Por colaborador',
        personalExport: 'Exportação pessoal (só os turnos dele):',
        choosePerson: 'Escolhe uma pessoa…',
        holidays: 'Feriados (todas as filiais fechadas):'
      },

      schedule: {
        branch: 'Filial', shift: 'Turno', employee: 'Colaborador', totalShifts: 'Total de turnos',
        empty: '— vazio —', add: '+ adicionar', addPerson: '+ adicionar pessoa', notAssigned: '— por atribuir —',
        closed: 'Fechado neste dia', noBranches: 'Não há filiais ativas. Abre o separador Filiais.',
        required: 'Necessários: {count}', people: '{count} pessoas',
        holidayClosed: 'Todas as filiais fechadas', dayOff: 'Folga', holiday: 'Feriado',
        missingSabbath: 'Falta a hora de fim do Shabbat'
      },

      status: {
        synced: 'Sincronizado entre dispositivos', syncedAt: 'Sincronizado entre dispositivos · atualizado às {time}',
        localOnly: 'Guardado apenas neste dispositivo', readOnly: 'Apenas leitura – sem permissão de edição',
        remoteUpdate: 'Atualização recebida de outro dispositivo ({time})',
        localCopy: 'Esta é uma cópia local – os dados ficam apenas neste navegador e não sincronizam. ' +
          'Para trabalhar em dois computadores usa a versão alojada. Para transferir os dados: exporta o JSON nas Definições e importa-o lá.',
        viewOnlyBanner: 'Apenas leitura – o horário é mostrado para revisão e a edição está desativada. ' +
          'A exportação, a impressão e a mudança de semana continuam a funcionar.'
      },

      levels: { error: 'Erro', warning: 'Aviso', info: 'Nota' },

      marks: {
        dayOff: 'folga', blocked: 'bloqueado', prefers: 'prefere',
        notInBranch: 'não é desta filial', notInShift: 'não faz este turno',
        alreadyAssigned: 'já atribuído', inactive: 'inativo'
      },

      issueTypes: {
        'duplicate-shift': 'Sobreposição',
        'duplicate-employee-slot': 'Sobreposição',
        'double-booked': 'Dois turnos no mesmo dia',
        understaffed: 'Falta pessoal',
        'constraint-off': 'Pedido não cumprido',
        'constraint-blocked': 'Pedido não cumprido',
        'branch-mismatch': 'Filial errada',
        'shift-mismatch': 'Tipo de turno errado',
        'over-max': 'Acima do limite',
        rest: 'Descanso curto',
        'no-shifts': 'Sem turnos',
        'missing-shabbat-end': 'Falta a hora de fim do Shabbat',
        'inactive-slot': 'Turno não aberto',
        'pending-constraints': 'Pedidos pendentes',
        'extra-days-off': 'Folgas a mais',
        'below-target': 'Abaixo do objetivo'
      },

      toast: {
        generated: 'Horário gerado – {shifts} por preencher',
        generatedFull: 'Horário gerado – todos os turnos estão preenchidos',
        clearWeekConfirm: 'Limpar todas as atribuições desta semana? Os pedidos são mantidos.',
        cleared: 'Horário limpo',
        copied: 'Horário copiado para a área de transferência',
        personalCopied: 'Horário pessoal copiado para a área de transferência',
        viewOnlyOn: 'Apenas leitura ativado – a edição está desativada',
        viewOnlyOff: 'Apenas leitura desativado – já podes editar',
        copyPrompt: 'Copia o texto:',
        holidayCleared: '{day} volta a ser dia de trabalho',
        holidayPrompt: 'Nome do feriado de {day} (as filiais fecham e o dia conta como folga para todos):',
        holidayDefault: 'Feriado',
        holidayHasAssignments: 'Nesse dia já há {count} pessoas atribuídas. Marcar como feriado e limpar as atribuições?',
        holidayMarked: '{day} marcado como feriado – as filiais estão fechadas',
        clearConstraintsConfirm: 'Apagar todos os pedidos desta semana?',
        constraintsCleared: 'Pedidos apagados',
        noPreviousConstraints: 'Não há pedidos na semana anterior',
        constraintsCopied: 'Pedidos copiados da semana anterior',
        requestApproved: 'Pedido aprovado', requestRejected: 'Pedido recusado',
        updateFailed: 'Não foi possível atualizar',
        deleteShiftConfirm: 'Eliminar o turno «{name}»?\n\n{usage}',
        deleteShiftUsed: 'Está configurado em {count} dias de filial e todas as suas atribuições serão eliminadas.',
        deleteShiftUnused: 'Não é usado por nenhuma filial.',
        shiftDeleted: 'Turno eliminado{removed}',
        shiftRemovedCount: ' ({count} atribuições removidas)',
        shiftAdded: 'Turno adicionado. Configura-o em Filiais para que apareça no horário.',
        newShift: 'Turno {n}',
        applyHoursConfirm: 'Aplicar os horários predefinidos às {count} filiais, de domingo a quinta-feira?\n\n' +
          'Os dias abertos e o número de pessoas mantêm-se. Sexta-feira e a noite de sábado não mudam.',
        hoursUpdated: 'Horas atualizadas em {count} turnos',
        hoursAlready: 'Todos os turnos já usam estas horas',
        imported: 'Dados importados',
        importedCloud: 'Dados importados e enviados para a nuvem ({count} semanas)',
        importFailed: 'Ficheiro inválido: {message}',
        resetConfirm: 'Repor todos os dados (equipa, filiais, horários e pedidos) nos valores predefinidos?',
        reset: 'Dados repostos'
      },

      ui: {
        until: 'até {time}', sheet: 'Folha {n}',
        fileSaved: 'Ficheiro guardado', fileFailed: 'Não foi possível guardar o ficheiro: {message}',
        unknownError: 'erro desconhecido', downloadUnavailable: 'Não é possível transferir ficheiros aqui',
        loadFailed: 'Falha ao carregar os dados; foram carregados os valores predefinidos',
        saveFailed: 'Falha ao guardar os dados',
        iconLetters: 'TU',
        dayHeading: '{day} ({date})',
        missingStaff: 'falta pessoal',
        holidayClosedLine: '{name} – todas as filiais fechadas',
        spareLine: '— {verb} {shifts} por atribuir —',
        unknownBranch: 'Filial desconhecida', unknownEmployee: 'Pessoa desconhecida',
        weekLabel: 'Semana {from} – {to}', constraintsWeek: 'Pedidos · {label}',
        holidayAllClosed: 'Todas as filiais fechadas – folga para todos',
        holidayNoRequests: 'Feriado – não são precisos pedidos',
        branchClosedToday: 'Fechado neste dia',
        noActiveBranches: 'Não há filiais ativas.',
        noActiveBranchesTab: 'Não há filiais ativas. Abre o separador Filiais.',
        allClosedOn: 'Todas as filiais estão fechadas em {day}.',
        branchesClosed: 'Filiais fechadas',
        noHours: 'Sem horário',
        outOf: '{done} de {total}',
        cloudSaved: 'Os dados são guardados na nuvem e atualizam-se em todos os computadores abertos nesta ligação',
        deviceSaved: 'Os dados são guardados apenas neste navegador',
        thinking: 'A pensar…',
        noAnswer: '(não foi recebida resposta)',
        chatBlocked: 'Não tens permissão para fazer perguntas nesta página.',
        chatRateLimited: 'Demasiadas perguntas seguidas – tenta de novo daqui a um instante.',
        chatFailed: 'Não consegui responder agora',
        chatSystem: 'Estás a ajudar um responsável a gerir um horário de turnos. Responde em {language}, de forma breve e objetiva, ' +
          'baseando-te apenas nos dados abaixo. Se faltar informação, di-lo em vez de adivinhar.',
        chatDataStart: '=== dados da semana ===',
        chatDataEnd: '=== fim dos dados ===',
        chatQuestion: 'Pergunta: ',
        summaryShabbat: 'Fim do Shabbat: {time}',
        summaryHolidays: 'Feriados fechados: {days}', summaryNoHolidays: 'Esta semana não há feriados.',
        summaryRules: 'Regras de planeamento:',
        ruleOnePerDayOn: 'Cada pessoa faz no máximo um turno por dia.',
        ruleOnePerDayOff: 'Uma pessoa pode fazer vários turnos por dia.',
        ruleRestOn: 'Sem turno de manhã depois de um turno de fim do dia na véspera.',
        ruleRestOff: 'Sem descanso obrigatório entre um turno de fim do dia e um de manhã.',
        summaryBranches: 'Filiais:', summaryEmployees: 'Equipa:',
        summaryCurrent: 'Horário atual:', summaryAvailability: 'Disponibilidade restante:',
        summaryIssues: 'Alertas do horário:', summaryNoIssues: 'Sem alertas – o horário está correto.',
        closedAllWeek: 'fechado toda a semana', allBranches: 'todas as filiais',
        peopleCount: '{count} pessoas',
        empBranches: 'filiais', empShifts: 'turnos', empMax: 'máximo {count} por semana',
        empAskedOff: 'pediu folga', empBlocked: 'bloqueou', empNote: 'nota',
        empAssignedOf: '{name}: atribuídos {total} de uma quota de {max}',
        empFreeDays: 'dias livres: {days}', none: 'nenhum',
        fileName: 'horario', personalFileName: 'horario-{name}',
        greeting: 'Olá {name}, este é o teu horário:',
        shortTitle: 'Turnos'
      },

      alerts: {
        slotLabel: '{day} · {branch} · turno de {shift}',
        deletedEmployee: '(pessoa eliminada: {id})',
        deletedBranch: '(filial eliminada)',
        errorsOne: 'Um erro', errorsOther: '{count} erros',
        warningsOne: 'Um aviso', warningsOther: '{count} avisos',
        infosOne: 'Uma nota', infosOther: '{count} notas',
        allGood: '✔ O horário está correto – sem sobreposições, falhas ou pedidos não cumpridos',
        showAll: 'Ver os {count} alertas', showLess: 'Ocultar os alertas',
        duplicate: 'Sobreposição: {label} – {count} pessoas atribuídas ({names}) em vez de {need}.',
        duplicateSelf: 'Sobreposição: {name} está atribuído duas vezes ao mesmo turno – {label}.',
        doubleBooked: 'Sobreposição: {name} tem {count} turnos em {day}{where} ({detail}).',
        sameBranch: ' na mesma filial', differentBranches: ' em filiais diferentes',
        understaffed: 'Falta pessoal: {label} – {assigned} de {need} atribuídos.',
        reasonBusy: '{names} já estão noutro turno nesse dia',
        reasonMaxed: '{names} atingiram o limite semanal de turnos',
        reasonResting: '{names} precisam de descanso entre um turno de fim do dia e um de manhã',
        reasonNone: 'Ninguém está configurado ao mesmo tempo para esta filial e este turno, ou todos o bloquearam.',
        reasonFree: 'Há pessoas livres ({names}) – tenta gerar o horário outra vez.',
        reasonPrefix: 'Motivo: ',
        suggestTwoPerDay: ' Podes permitir dois turnos por dia por pessoa nas Definições.',
        suggestRaiseMax: ' Podes aumentar o limite semanal na ficha do colaborador.',
        constraintOff: 'Pedido não cumprido: {name} pediu folga em {day} mas está atribuído ao turno {shift} em {branch}.',
        constraintBlocked: 'Pedido não cumprido: {name} bloqueou o turno {shift} em {day} mas está atribuído a ele em {branch}.',
        branchMismatch: '{name} está atribuído a {branch} em {day} apesar de essa filial não constar da sua ficha.',
        shiftMismatch: '{name} está atribuído ao turno {shift} em {day} apesar de esse tipo de turno não constar da sua ficha.',
        overMax: 'Acima do limite: {name} tem {total} turnos (máximo {max}).',
        noShifts: '{name} não tem turnos esta semana.',
        rest: 'Descanso curto: {name} acaba um turno de fim do dia em {previous} e começa um de manhã em {day}.',
        holidayAssignment: 'Atribuição em feriado: {day} ({name}) está marcado como fechado, mas há atribuições: {names}.',
        inactiveSlot: 'Atribuição a um turno que não está aberto: {day} · {branch} · {shift} ({names}).',
        missingSabbath: 'Não há hora de fim do Shabbat para esta semana – não é possível calcular o início dos turnos de sábado à noite.',
        pendingOne: 'Há um pedido à espera de aprovação: {name} ({day}). Enquanto não for aprovado, não afeta o horário.',
        pendingOther: 'Há {count} pedidos à espera de aprovação: {names}. Enquanto não forem aprovados, não afetam o horário.',
        extraDaysOff: '{name} pediu {count} folgas ({days}) – a regra permite uma folga por semana.',
        belowTarget: '{name} pediu folga em {day} e tem {total} de {expected} turnos possíveis – ainda lhe restam dias livres.'
      },

      availability: {
        title: 'O que ainda está disponível',
        none: 'Não há disponibilidade – {reason}',
        reasonMaxed: 'todos atingiram o limite semanal de turnos.',
        reasonNoDays: 'quem ainda tem quota não tem nenhum dia livre com as suas filiais abertas.',
        totalOne: '{verb} mais um turno por atribuir, entre {people}:',
        totalOther: '{verb} mais {count} turnos por atribuir, entre {people}:',
        peopleOne: 'uma pessoa', peopleOther: '{count} pessoas',
        left: '{verb} {shifts} de quota · livre em {days}',
        leftNoDays: '{verb} {shifts} de quota, mas não há nenhum dia livre esta semana',
        full: 'quota totalmente usada ({assigned} de {max})',
        noEmployees: 'Não há pessoal ativo.',
        shiftsOne: 'um turno', shiftsOther: '{count} turnos',
        remains: 'resta', remainPlural: 'restam'
      },

      constraints: {
        title: 'Pedidos de {week}',
        clear: 'Limpar esta semana', copyPrevious: 'Copiar da semana anterior',
        legend: 'Toca num turno para alternar: {free} → {preferred} → {blocked}. «Folga» bloqueia o dia inteiro.',
        free: 'Disponível', preferred: 'Prefere', blocked: 'Não pode', dayOff: 'Folga',
        pendingTitle: 'Pedidos à espera da tua aprovação ({count})',
        pendingHint: 'Um pedido não aprovado não afeta o horário.',
        approve: 'Aprovar', reject: 'Recusar',
        approved: 'Aprovado', rejected: 'Recusado', pending: 'À espera de aprovação',
        requestLabel: 'Pedido: {detail}', requestRejected: 'Pedido recusado',
        reason: 'Motivo (opcional)',
        reasonPlaceholder: 'p. ex. casamento, exame, consulta médica',
        reasonSaved: 'Motivo guardado', reasonGiven: 'Motivo indicado: {text}',
        managerNote: 'Nota do responsável: {text}',
        needsApproval: 'Cada pedido passa pelo teu responsável e só afeta o horário depois de aprovado.',
        noChange: 'Sem alterações'
      },

      employees: {
        title: 'Equipa', add: '+ Adicionar pessoa', active: 'Ativo',
        branchesLabel: 'Filiais (sem seleção = todas)',
        shiftTypes: 'Tipos de turno que pode fazer',
        maxShifts: 'Máximo de turnos por semana', note: 'Nota',
        deleteConfirm: 'Eliminar {name}? As suas atribuições serão retiradas de todas as semanas.',
        inactive: '(inativo)', newName: 'Pessoa nova'
      },

      branches: {
        title: 'Filiais', add: '+ Adicionar filial', active: 'Ativa', newName: 'Filial nova',
        hint: 'Cada filial tem os seus dias, horas e número de pessoas por turno. ' +
          'Pôr 0 pessoas fecha esse turno nesse dia. Atribuir mais do que o número definido é assinalado como sobreposição.',
        peopleLabel: 'Pessoas', closed: 'Fechado', day: 'Dia',
        copyFrom: 'Copiar dias e horas de outra filial', chooseBranch: 'Escolhe uma filial…',
        copyConfirm: 'Copiar os dias e as horas de {from} para {to}?',
        copied: 'Dias e horas copiados',
        deleteConfirm: 'Eliminar {name}? As suas atribuições serão retiradas de todas as semanas.',
        autoSabbath: 'Conforme o fim do Shabbat', autoSabbathLabel: 'Fim do Shabbat +30 min'
      },

      settings: {
        rules: 'Regras de planeamento',
        onePerDay: 'Cada pessoa faz no máximo um turno por dia',
        rest: 'Sem turno de manhã depois de um turno de fim do dia na véspera',
        oneDayOff: 'O dia marcado como folga nos Pedidos é a única folga da semana',
        shiftTypes: 'Tipos de turno',
        addShift: '+ Adicionar turno', applyHours: 'Aplicar as horas a todas as filiais (seg–sex)',
        shiftsHint: 'Define quantos turnos tem o teu negócio, como se chamam, as horas, a cor e a ordem. ' +
          'As horas aqui são as predefinidas; cada filial pode alterá-las. ' +
          'O botão atualiza as filiais existentes sem mexer nos dias abertos nem no número de pessoas.',
        shiftNamePlaceholder: 'Nome do turno',
        sabbathTitle: 'Sábado à noite',
        sabbathDefault: 'Hora predefinida de fim do Shabbat para uma semana nova:',
        sabbathHint: 'Em cada semana podes ajustar a hora real no topo do separador Horário. ' +
          'Os turnos de sábado à noite começam meia hora depois.',
        backup: 'Cópia de segurança',
        exportJson: 'Exportar todos os dados (JSON)', importJson: 'Importar dados',
        reset: 'Repor as predefinições',
        backupHint: 'Os dados são guardados automaticamente neste navegador. Para os mover entre computadores, exporta um ficheiro JSON.',
        languageTitle: 'Idioma', languageHint: 'Muda toda a interface. Fica guardado neste dispositivo.'
      },

      server: {
        credentialsRequired: 'São necessários o e-mail e a palavra-passe',
        passwordTooShort: 'A palavra-passe tem de ter pelo menos 6 caracteres',
        emailTaken: 'Este e-mail já está registado',
        companyRequired: 'É necessário um nome de empresa',
        badCredentials: 'E-mail ou palavra-passe incorretos',
        userInactive: 'Este utilizador não está ativo. Contacta o responsável da empresa.',
        signInRequired: 'Inicia sessão',
        noPermission: 'Não tens permissão para fazer isso',
        notLinked: 'Este utilizador não está ligado a nenhuma ficha de colaborador',
        weekPublished: 'O horário desta semana está publicado, por isso os pedidos já não podem ser alterados',
        weekPublishedShort: 'O horário desta semana já está publicado',
        noRequest: 'Não há nenhum pedido para esse dia',
        badDecision: 'Decisão inválida',
        requestNotFound: 'Pedido não encontrado',
        weekMissing: 'Essa semana não existe',
        userNotFound: 'Utilizador não encontrado',
        cannotChangeOwner: 'O proprietário da conta não pode ser alterado'
      },

      notify: {
        published: 'Horário publicado',
        publishedBody: 'O horário da nova semana está pronto. Já podes ver os teus turnos.',
        requestApproved: 'O teu pedido foi aprovado',
        requestApprovedBody: 'O teu pedido para {day} foi aprovado.',
        requestRejected: 'O teu pedido foi recusado',
        requestRejectedBody: 'O teu pedido para {day} foi recusado',
        newRequest: 'Novo pedido',
        newRequestBody: 'Alguém enviou um pedido à espera da tua aprovação.',
        newRequestsBody: 'Há {count} novos pedidos à espera da tua aprovação.'
      },

      payments: {
        mockProvider: 'Fornecedor de teste (desenvolvimento)',
        mockNote: 'O pagamento é aprovado de imediato sem cobrança real. Apenas para desenvolvimento e demonstrações.',
        unknownPlan: 'Plano desconhecido',
        serverProvider: 'Faturação pelo servidor ({name})',
        notConfigured: 'A faturação não está configurada neste ambiente',
        requestFailed: 'O pedido de faturação falhou ({status})'
      },

      billing: {
        priceMonthly: '{amount} ILS / mês', priceAmount: '{amount} ILS',
        updateFailed: 'Não foi possível atualizar', cancelFailed: 'Não foi possível cancelar',
        title: 'A tua subscrição', status: 'Estado', plan: 'Plano', validUntil: 'Válida até',
        activeStaff: 'Pessoal ativo', of: '{count} de {max}', unlimited: '{count} (sem limite)',
        plans: 'Planos', choose: 'Escolher', currentPlan: 'Plano atual',
        tooSmall: 'Pequeno demais para {count} colaboradores', cancel: 'Cancelar subscrição',
        cancelConfirm: 'Cancelar a subscrição? O acesso termina no fim do período pago.',
        planUpdated: 'Plano atualizado', canceled: 'Subscrição cancelada',
        ownerOnly: 'Só o proprietário da conta pode alterar a subscrição.',
        perMonth: 'por mês',
        statusTrial: 'Experiência', statusActive: 'Ativa', statusPastDue: 'Pagamento falhou',
        statusCanceled: 'Cancelada', statusExpired: 'Expirada'
      },

      auth: {
        wait: 'Um momento…',
        notifyEnabled: 'Notificações ativadas',
        notifyBody: 'Vamos avisar-te sobre as alterações ao horário.',
        signIn: 'Entrar', signUp: 'Criar conta de empresa',
        email: 'E-mail', password: 'Palavra-passe', name: 'O teu nome', companyName: 'Nome da empresa',
        passwordHint: 'Pelo menos 6 caracteres',
        enter: 'Entrar', create: 'Criar conta', signingIn: 'A entrar…', creating: 'A criar…',
        trialNote: '{days} dias grátis. Não é preciso método de pagamento.',
        signOut: 'Sair', blocked: 'Acesso bloqueado',
        blockedOwner: 'Contacta o suporte para ativar a subscrição.',
        blockedMember: 'Pede ao proprietário da conta para renovar a subscrição.',
        enableNotifications: 'Ativar notificações',
        failedSignIn: 'Não foi possível entrar', failedSignUp: 'Não foi possível criar a conta'
      },

      users: {
        nameColumn: 'Nome', emailColumn: 'E-mail', createFailed: 'Não foi possível criar o utilizador',
        title: 'Utilizadores',
        hint: 'Cada pessoa pode ter o seu próprio acesso. Vê apenas os seus turnos e envia os seus pedidos – ' +
          'não vê o horário completo nem pode alterar nada. Os responsáveis veem e editam tudo. ' +
          'Liga um utilizador a uma ficha de colaborador para que veja os seus turnos.',
        add: 'Adicionar utilizador', createUser: 'Criar utilizador',
        role: 'Função', staffCard: 'Ficha de colaborador', none: 'Nenhuma', noLink: 'Sem ligação',
        initialPassword: 'Palavra-passe inicial', activeColumn: 'Ativo',
        created: 'Utilizador criado para {email}', updated: 'Guardado', updateFailed: 'Não foi possível atualizar'
      },

      access: {
        noCompany: 'Empresa não encontrada',
        trialEnded: 'O período de experiência terminou. Ativa uma subscrição para continuar.',
        trial: 'Experiência – faltam {days} dias.',
        expired: 'A subscrição expirou. Renova-a para continuar.',
        pastDueBlocked: 'O pagamento não foi recebido e o acesso está bloqueado. Atualiza o método de pagamento.',
        pastDue: 'O último pagamento não passou. O acesso será bloqueado dentro de {days} dias.',
        expiredKept: 'A subscrição expirou e não foi renovada. Escolher um plano devolve o acesso de imediato, e os teus dados estão guardados.',
        canceled: 'A subscrição foi cancelada. Podes renovar quando quiseres – os teus dados estão guardados.',
        inactive: 'A subscrição não está ativa.',
        overLimit: 'O plano {plan} cobre até {max} colaboradores. Tens {count} – é preciso o plano {suggested} ({range}, {price}).'
      },

      plans: {
        starter: 'Pequeno', growth: 'Médio', business: 'Grande',
        upTo: 'Até {count} colaboradores',
        between: 'De {from} a {to} colaboradores',
        from: '{count} colaboradores ou mais'
      },

      roles: { owner: 'Proprietário', manager: 'Responsável', employee: 'Colaborador' },

      employee: {
        prevWeek: '◀ Semana anterior', nextWeek: 'Semana seguinte ▶',
        loadFailed: 'Não foi possível carregar os dados: {message}',
        saveFailed: 'Não foi possível guardar', reasonSaveFailed: 'Não foi possível guardar o motivo',
        myShifts: 'Os meus turnos', myRequests: 'Os meus pedidos',
        notPublished: 'O horário desta semana ainda não foi publicado.',
        noShifts: 'Não tens turnos esta semana.',
        totalWeek: '{count} turnos esta semana.',
        publishedLocked: 'O horário está publicado – os pedidos desta semana já não podem ser alterados.',
        notLinked: 'O teu utilizador ainda não está ligado a uma ficha de colaborador. Fala com o teu responsável.',
        noShiftsToday: 'Não há turnos neste dia', holidayNoWork: 'Feriado – não se trabalha'
      },

      chat: {
        title: 'Perguntas sobre este horário',
        hint: 'Pergunta sobre a semana no ecrã – por exemplo «quem trabalha na terça ao fim do dia?», ' +
          '«porque é que Colaborador 3 não está na quinta?» ou «quem pode substituir Colaborador 5 na quarta?»',
        placeholder: 'Pergunta sobre o horário…', send: 'Enviar'
      },

      excel: {
        availabilityNone: 'Não resta nada – esta semana não é possível atribuir mais turnos',
        availabilityLeft: '{verb} {shifts} por atribuir',
        spare: 'Quota restante', required: 'Necessários',
        valid: 'Correto', checksTitle: 'Verificações do horário',
        personalText: 'Texto para WhatsApp',
        byBranch: 'Por filial', byEmployee: 'Por colaborador', availability: 'Disponibilidade',
        checks: 'Verificações', personal: 'O meu horário',
        title: 'Horário de trabalho – semana de {from} a {to}',
        viewBranch: 'Por filial', viewEmployee: 'Por colaborador',
        sabbathEnds: 'Fim do Shabbat {time}',
        day: 'Dia', date: 'Data', branch: 'Filial', shift: 'Turno', hours: 'Horas',
        staff: 'Colaborador', assigned: 'Atribuídos', quota: 'Quota', left: 'Quota restante',
        canAssign: 'Pode ser atribuído', freeDays: 'Dias livres', totalShifts: 'Total de turnos',
        severity: 'Gravidade', type: 'Tipo', detail: 'Detalhe',
        missing: '— em falta —', closed: 'Fechado', notAssigned: 'Por atribuir',
        personalTitle: 'Horário pessoal – {name}', totalWeek: '{count} turnos esta semana',
        noIssues: 'Sem sobreposições, falhas ou pedidos não cumpridos'
      },

      errors: {
        invalidTime: 'Hora inválida – usa o formato de 24 horas, por exemplo 09:30',
        emptyShiftName: 'O nome do turno não pode estar vazio',
        lastShift: 'Tem de ficar pelo menos um turno',
        notSaved: 'Não foi possível guardar', copied: 'Copiado para a área de transferência',
        viewOnlyBlocked: 'Apenas leitura – a edição está desativada. Podes desligá-la no topo do ecrã.',
        duplicatePerson: 'A mesma pessoa não pode aparecer duas vezes no mesmo turno',
        printBlocked: 'A impressão está bloqueada aqui – usa «Copiar como texto» ou a exportação para Excel',
        chooseEmployee: 'Escolhe uma pessoa para a exportação pessoal'
      },

      common: {
        moveUp: 'Subir', moveDown: 'Descer', timePlaceholder: 'hh:mm',
        save: 'Guardar', cancel: 'Cancelar', delete: 'Eliminar', close: 'Fechar',
        yes: 'Sim', no: 'Não', all: 'Tudo', and: 'e', more: 'e mais {count}'
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
