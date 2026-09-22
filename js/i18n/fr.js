/* Français */
(function (root) {
  'use strict';

  root.I18n.register({
    code: 'fr',
    name: 'Français',
    dir: 'ltr',
    locale: 'fr-FR',
    weekStart: 1,
    currency: { code: 'ILS', symbol: '₪', position: 'after' },
    dict: {
      app: {
        title: 'SetShifts',
        subtitle: 'Planification par IA pour chaque site : disponibilités, demandes, postes et vos règles',
        language: 'Langue'
      },

      days: {
        0: 'Dimanche', 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi',
        4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi'
      },
      daysShort: { 0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam' },

      shifts: { morning: 'Matin', middle: 'Midi', evening: 'Soir', night: 'Nuit' },

      seed: {
        branchCenter: 'Succursale centre', branchNorth: 'Succursale nord', branchSouth: 'Succursale sud',
        employee: 'Employé {n}',
        noteFloater: 'Remplace dans toutes les succursales', noteStudent: 'Étudiant – pas de matins'
      },

      colors: {
        0: 'Ambre', 1: 'Vert', 2: 'Bleu', 3: 'Violet',
        4: 'Rose', 5: 'Turquoise', 6: 'Gris', 7: 'Marron'
      },

      tabs: {
        support: 'Assistance',
        schedule: 'Planning', constraints: 'Demandes', employees: 'Personnel',
        branches: 'Succursales', users: 'Utilisateurs', billing: 'Abonnement', settings: 'Réglages'
      },

      toolbar: {
        prevWeek: 'Semaine précédente', nextWeek: 'Semaine suivante', thisWeek: 'Cette semaine',
        week: 'Semaine {from} – {to}', currentWeek: 'Semaine en cours',
        generate: 'Générer le planning', clear: 'Vider le planning',
        keepManual: 'Conserver les affectations manuelles',
        copyText: 'Copier en texte', excel: 'Excel', csv: 'CSV', print: 'Imprimer',
        moreTools: 'Plus d’outils', closeTools: 'Fermer les outils',
        viewOnly: 'Lecture seule', exitViewOnly: 'Quitter la lecture seule',
        shabbatEnd: 'Fin du chabbat',
        byBranch: 'Par succursale', byEmployee: 'Par employé',
        personalExport: 'Export personnel (uniquement ses services) :',
        choosePerson: 'Choisir une personne…',
        holidays: 'Jours fériés (toutes les succursales fermées) :'
      },

      schedule: {
        branch: 'Succursale', shift: 'Service', employee: 'Employé', totalShifts: 'Total des services',
        empty: '— vide —', add: '+ ajouter', addPerson: '+ ajouter une personne', notAssigned: '— non affecté —',
        closed: 'Fermé ce jour-là', noBranches: 'Aucune succursale active. Ouvrez l’onglet Succursales.',
        required: 'Requis : {count}', people: '{count} personnes',
        holidayClosed: 'Toutes les succursales fermées', dayOff: 'Jour de repos', holiday: 'Jour férié',
        missingSabbath: 'Heure de fin du chabbat manquante'
      },

      status: {
        demoTitle: 'Mode démonstration',
        demoBody: 'Les données sont enregistrées uniquement dans ce navigateur et ne passent pas d’un appareil à l’autre.',
        synced: 'Synchronisé entre les appareils', syncedAt: 'Synchronisé entre les appareils · mis à jour à {time}',
        localOnly: 'Enregistré sur cet appareil uniquement', readOnly: 'Lecture seule – aucun droit de modification',
        remoteUpdate: 'Mise à jour reçue d’un autre appareil ({time})',
        localCopy: 'Ceci est une copie locale : les données sont stockées uniquement dans ce navigateur et ne se synchronisent pas. ' +
          'Pour travailler depuis deux ordinateurs, utilisez la version hébergée. Pour transférer les données : exportez le JSON dans les Réglages, puis importez-le là-bas.',
        viewOnlyBanner: 'Lecture seule : le planning est affiché pour vérification et la modification est désactivée. ' +
          'L’export, l’impression et le changement de semaine fonctionnent normalement.'
      },

      levels: { error: 'Erreur', warning: 'Avertissement', info: 'Remarque' },

      marks: {
        dayOff: 'jour de repos', blocked: 'bloqué', prefers: 'préfère',
        notInBranch: 'pas dans cette succursale', notInShift: 'pas sur ce service',
        alreadyAssigned: 'déjà affecté', inactive: 'inactif'
      },

      issueTypes: {
        'duplicate-shift': 'Doublon',
        'duplicate-employee-slot': 'Doublon',
        'double-booked': 'Deux services dans la journée',
        understaffed: 'Effectif insuffisant',
        'constraint-off': 'Demande non respectée',
        'constraint-blocked': 'Demande non respectée',
        'branch-mismatch': 'Mauvaise succursale',
        'shift-mismatch': 'Mauvais type de service',
        'over-max': 'Au-dessus du quota',
        rest: 'Repos trop court',
        'no-shifts': 'Aucun service',
        'missing-shabbat-end': 'Heure de fin du chabbat manquante',
        'inactive-slot': 'Service non ouvert',
        'pending-constraints': 'Demandes en attente',
        'extra-days-off': 'Trop de jours de repos',
        'below-target': 'En dessous de l’objectif'
      },

      toast: {
        generated: 'Planning généré – {shifts} encore non pourvus',
        generatedFull: 'Planning généré – tous les services sont pourvus',
        clearWeekConfirm: 'Vider toutes les affectations de cette semaine ? Les demandes sont conservées.',
        cleared: 'Planning vidé',
        copied: 'Planning copié dans le presse-papiers',
        personalCopied: 'Planning personnel copié dans le presse-papiers',
        viewOnlyOn: 'Lecture seule activée – la modification est désactivée',
        viewOnlyOff: 'Lecture seule désactivée – vous pouvez modifier',
        copyPrompt: 'Copiez le texte :',
        holidayCleared: '{day} redevient un jour travaillé',
        holidayPrompt: 'Nom du jour férié du {day} (les succursales ferment et la journée compte comme repos pour tous) :',
        holidayDefault: 'Jour férié',
        holidayHasAssignments: '{count} personnes sont déjà affectées ce jour-là. Le marquer comme férié et les retirer ?',
        holidayMarked: '{day} est marqué comme férié – les succursales sont fermées',
        clearConstraintsConfirm: 'Effacer toutes les demandes de cette semaine ?',
        constraintsCleared: 'Demandes effacées',
        noPreviousConstraints: 'Aucune demande la semaine précédente',
        constraintsCopied: 'Demandes copiées depuis la semaine précédente',
        requestApproved: 'Demande approuvée', requestRejected: 'Demande refusée',
        updateFailed: 'Échec de la mise à jour',
        deleteShiftConfirm: 'Supprimer le service « {name} » ?\n\n{usage}',
        deleteShiftUsed: 'Il est configuré sur {count} jours de succursale, et toutes ses affectations seront supprimées.',
        deleteShiftUnused: 'Il n’est utilisé par aucune succursale.',
        shiftDeleted: 'Service supprimé{removed}',
        shiftRemovedCount: ' ({count} affectations supprimées)',
        shiftAdded: 'Service ajouté. Configurez-le dans Succursales pour qu’il apparaisse au planning.',
        newShift: 'Service {n}',
        applyHoursConfirm: 'Appliquer les horaires par défaut aux {count} succursales, du dimanche au jeudi ?\n\n' +
          'Les jours ouverts et les effectifs restent inchangés. Le vendredi et le samedi soir ne changent pas.',
        hoursUpdated: 'Horaires mis à jour sur {count} services',
        hoursAlready: 'Tous les services utilisent déjà ces horaires',
        imported: 'Données importées',
        importedCloud: 'Données importées et envoyées vers le cloud ({count} semaines)',
        importFailed: 'Fichier invalide : {message}',
        resetConfirm: 'Réinitialiser toutes les données (personnel, succursales, plannings et demandes) aux valeurs par défaut ?',
        reset: 'Données réinitialisées'
      },

      ui: {
        until: 'jusqu’à {time}', sheet: 'Feuille {n}',
        fileSaved: 'Fichier enregistré', fileFailed: 'Impossible d’enregistrer le fichier : {message}',
        unknownError: 'erreur inconnue', downloadUnavailable: 'Le téléchargement de fichiers n’est pas possible ici',
        loadFailed: 'Échec du chargement des données, valeurs par défaut chargées',
        saveFailed: 'Échec de l’enregistrement des données',
        iconLetters: 'PL',
        dayHeading: '{day} ({date})',
        missingStaff: 'effectif insuffisant',
        holidayClosedLine: '{name} – toutes les succursales fermées',
        spareLine: '— {verb} {shifts} encore à affecter —',
        unknownBranch: 'Succursale inconnue', unknownEmployee: 'Personne inconnue',
        weekLabel: 'Semaine {from} – {to}', constraintsWeek: 'Demandes · {label}',
        holidayAllClosed: 'Toutes les succursales fermées – jour de repos pour tous',
        holidayNoRequests: 'Jour férié – aucune demande nécessaire',
        branchClosedToday: 'Fermé ce jour-là',
        noActiveBranches: 'Aucune succursale active.',
        noActiveBranchesTab: 'Aucune succursale active. Ouvrez l’onglet Succursales.',
        allClosedOn: 'Toutes les succursales sont fermées le {day}.',
        branchesClosed: 'Succursales fermées',
        noHours: 'Pas d’horaire',
        outOf: '{done} sur {total}',
        cloudSaved: 'Les données sont enregistrées dans le cloud et mises à jour sur tous les ordinateurs ouverts sur ce lien',
        deviceSaved: 'Les données sont enregistrées uniquement dans ce navigateur',
        thinking: 'Réflexion…',
        noAnswer: '(aucune réponse reçue)',
        chatBlocked: 'Vous n’êtes pas autorisé à poser des questions sur cette page.',
        chatRateLimited: 'Trop de questions d’affilée – réessayez dans un instant.',
        chatFailed: 'Je n’ai pas pu répondre pour le moment',
        chatSystem: 'Vous aidez un responsable à gérer un planning de services. Répondez en {language}, de façon brève et précise, ' +
          'en vous appuyant uniquement sur les données ci-dessous. S’il manque une information, dites-le au lieu de deviner.',
        chatDataStart: '=== données de la semaine ===',
        chatDataEnd: '=== fin des données ===',
        chatQuestion: 'Question : ',
        summaryShabbat: 'Fin du chabbat : {time}',
        summaryHolidays: 'Jours fériés fermés : {days}', summaryNoHolidays: 'Aucun jour férié cette semaine.',
        summaryRules: 'Règles de planification :',
        ruleOnePerDayOn: 'Une personne travaille au plus un service par jour.',
        ruleOnePerDayOff: 'Une personne peut faire plusieurs services par jour.',
        ruleRestOn: 'Pas de service du matin après un service du soir la veille.',
        ruleRestOff: 'Aucun repos obligatoire entre un service du soir et un service du matin.',
        summaryBranches: 'Succursales :', summaryEmployees: 'Personnel :',
        summaryCurrent: 'Planning actuel :', summaryAvailability: 'Disponibilité restante :',
        summaryIssues: 'Alertes du planning :', summaryNoIssues: 'Aucune alerte – le planning est valide.',
        closedAllWeek: 'fermé toute la semaine', allBranches: 'toutes les succursales',
        peopleCount: '{count} personnes',
        empBranches: 'succursales', empShifts: 'services', empMax: 'maximum {count} par semaine',
        empAskedOff: 'a demandé un repos', empBlocked: 'a bloqué', empNote: 'note',
        empAssignedOf: '{name} : affecté {total} sur un quota de {max}',
        empFreeDays: 'jours libres : {days}', none: 'aucun',
        fileName: 'planning', personalFileName: 'planning-{name}',
        greeting: 'Bonjour {name}, voici votre planning :',
        shortTitle: 'Services'
      },

      alerts: {
        slotLabel: '{day} · {branch} · service {shift}',
        deletedEmployee: '(personne supprimée : {id})',
        deletedBranch: '(succursale supprimée)',
        errorsOne: 'Une erreur', errorsOther: '{count} erreurs',
        warningsOne: 'Un avertissement', warningsOther: '{count} avertissements',
        infosOne: 'Une remarque', infosOther: '{count} remarques',
        allGood: '✔ Le planning est valide – aucun doublon, manque ou demande non respectée',
        showAll: 'Afficher les {count} alertes', showLess: 'Masquer les alertes',
        duplicate: 'Doublon : {label} – {count} personnes affectées ({names}) au lieu de {need}.',
        duplicateSelf: 'Doublon : {name} est affecté deux fois au même service – {label}.',
        doubleBooked: 'Doublon : {name} a {count} services le {day}{where} ({detail}).',
        sameBranch: ' dans la même succursale', differentBranches: ' dans des succursales différentes',
        understaffed: 'Effectif insuffisant : {label} – {assigned} sur {need} affectés.',
        reasonBusy: '{names} sont déjà affectés à un autre service ce jour-là',
        reasonMaxed: '{names} ont atteint leur quota hebdomadaire de services',
        reasonResting: '{names} ont besoin de repos entre un service du soir et un service du matin',
        reasonNone: 'Personne n’est configuré à la fois pour cette succursale et ce service, ou tout le monde l’a bloqué.',
        reasonFree: 'Des personnes sont disponibles ({names}) – essayez de regénérer le planning.',
        reasonPrefix: 'Motif : ',
        suggestTwoPerDay: ' Vous pouvez autoriser deux services par jour et par personne dans les Réglages.',
        suggestRaiseMax: ' Vous pouvez augmenter le quota hebdomadaire sur la fiche de l’employé.',
        constraintOff: 'Demande non respectée : {name} a demandé le {day} en repos mais est affecté au service {shift} à {branch}.',
        constraintBlocked: 'Demande non respectée : {name} a bloqué le service {shift} le {day} mais y est affecté à {branch}.',
        branchMismatch: '{name} est affecté à {branch} le {day} alors que cette succursale n’est pas sur sa fiche.',
        shiftMismatch: '{name} est affecté au service {shift} le {day} alors que ce type de service n’est pas sur sa fiche.',
        overMax: 'Au-dessus du quota : {name} a {total} services (maximum {max}).',
        noShifts: '{name} n’a aucun service cette semaine.',
        rest: 'Repos trop court : {name} termine un soir le {previous} et commence un matin le {day}.',
        holidayAssignment: 'Affectation un jour férié : {day} ({name}) est marqué fermé, mais {names} y sont affectés.',
        inactiveSlot: 'Affectation à un service non ouvert : {day} · {branch} · {shift} ({names}).',
        missingSabbath: 'Aucune heure de fin du chabbat pour cette semaine – impossible de calculer le début des services du samedi soir.',
        pendingOne: 'Une demande attend votre approbation : {name} ({day}). Tant qu’elle n’est pas approuvée, elle n’affecte pas le planning.',
        pendingOther: '{count} demandes attendent votre approbation : {names}. Tant qu’elles ne sont pas approuvées, elles n’affectent pas le planning.',
        extraDaysOff: '{name} a demandé {count} jours de repos ({days}) – la règle autorise un jour de repos par semaine.',
        belowTarget: '{name} a demandé le {day} en repos et a {total} services sur {expected} possibles – il lui reste des jours libres.'
      },

      availability: {
        title: 'Ce qui reste disponible',
        none: 'Plus rien de disponible – {reason}',
        reasonMaxed: 'tout le monde a atteint son quota hebdomadaire de services.',
        reasonNoDays: 'ceux qui ont encore du quota n’ont aucun jour libre où leurs succursales sont ouvertes.',
        totalOne: '{verb} un service de plus à affecter, chez {people} :',
        totalOther: '{verb} {count} services de plus à affecter, chez {people} :',
        peopleOne: 'une personne', peopleOther: '{count} personnes',
        left: '{verb} {shifts} de quota · disponible le {days}',
        leftNoDays: '{verb} {shifts} de quota, mais aucun jour libre cette semaine',
        full: 'quota entièrement utilisé ({assigned} sur {max})',
        noEmployees: 'Aucun membre du personnel actif.',
        shiftsOne: 'un service', shiftsOther: '{count} services',
        remains: 'il reste', remainPlural: 'il reste'
      },

      constraints: {
        title: 'Demandes pour {week}',
        clear: 'Effacer cette semaine', copyPrevious: 'Copier depuis la semaine précédente',
        legend: 'Appuyez sur un service pour alterner : {free} → {preferred} → {blocked}. « Jour de repos » bloque toute la journée.',
        free: 'Disponible', preferred: 'Préfère', blocked: 'Ne peut pas', dayOff: 'Jour de repos',
        pendingTitle: 'Demandes en attente de votre approbation ({count})',
        pendingHint: 'Une demande non approuvée n’affecte pas le planning.',
        approve: 'Approuver', reject: 'Refuser',
        approved: 'Approuvée', rejected: 'Refusée', pending: 'En attente d’approbation',
        requestLabel: 'Demande : {detail}', requestRejected: 'Demande refusée',
        reason: 'Motif (facultatif)',
        reasonPlaceholder: 'ex. mariage, examen, rendez-vous médical',
        reasonSaved: 'Motif enregistré', reasonGiven: 'Motif indiqué : {text}',
        managerNote: 'Note du responsable : {text}',
        needsApproval: 'Chaque demande passe par votre responsable et n’affecte le planning qu’une fois approuvée.',
        noChange: 'Aucun changement'
      },

      employees: {
        title: 'Personnel', add: '+ Ajouter une personne', active: 'Actif',
        branchesLabel: 'Succursales (aucune sélection = toutes)',
        shiftTypes: 'Types de service possibles',
        maxShifts: 'Maximum de services par semaine', note: 'Note',
        deleteConfirm: 'Supprimer {name} ? Ses affectations seront retirées de toutes les semaines.',
        inactive: '(inactif)', newName: 'Nouvelle personne'
      },

      branches: {
        title: 'Succursales', add: '+ Ajouter une succursale', active: 'Active', newName: 'Nouvelle succursale',
        hint: 'Chaque succursale a ses propres jours, horaires et effectifs par service. ' +
          'Mettre 0 personne ferme ce service ce jour-là. Affecter plus que le nombre prévu est signalé comme un doublon.',
        peopleLabel: 'Personnes', closed: 'Fermé', day: 'Jour',
        copyFrom: 'Copier les jours et horaires d’une autre succursale', chooseBranch: 'Choisir une succursale…',
        copyConfirm: 'Copier les jours et horaires de {from} vers {to} ?',
        copied: 'Jours et horaires copiés',
        deleteConfirm: 'Supprimer {name} ? Ses affectations seront retirées de toutes les semaines.',
        autoSabbath: 'Selon la fin du chabbat', autoSabbathLabel: 'Fin du chabbat +30 min'
      },

      why: {
        button: 'Pourquoi cette personne ?',
        title: 'Pourquoi {name} ?',
        onlyOption: 'Personne d’autre ne pouvait prendre ce créneau.',
        fairest: 'Sur les {count} personnes possibles, c’était le choix le plus équitable selon les heures déjà faites.',
        alsoPossible: 'Auraient aussi pu le prendre : {names}.',
        whoCould: 'Qui ne pouvait pas ({count})',
        fact: {
          requested: 'A demandé ce créneau ce jour-là',
          available: 'Aucune demande de congé ce jour-là',
          qualified: 'Formé pour ce créneau',
          assignedBranch: 'Affecté à ce site',
          anyBranch: 'Travaille sur tous les sites',
          quota: '{used} créneaux sur {target} cette semaine',
          rest: 'Le repos entre soirée et matin est respecté',
          continuity: 'Déjà {count} fois sur ce site cette semaine'
        },
        blocked: {
          inactive: 'n’est pas actif',
          notQualified: 'n’est pas formé pour ce créneau',
          otherBranch: 'travaille sur un autre site',
          requestedOff: 'a demandé ce jour de congé',
          blockedShift: 'a demandé à ne pas faire ce créneau',
          atLimit: 'a atteint la limite hebdomadaire de {max}',
          busySameDay: 'travaille déjà ce jour-là',
          busySameShift: 'est déjà sur ce créneau',
          restRule: 'a besoin de repos entre soirée et matin'
        }
      },
      preview: {
        open: 'Vue employé',
        title: 'Quel écran voulez-vous voir ?',
        hint: 'Lecture seule. Rien de ce que vous faites ici n’est enregistré en son nom.',
        banner: 'Vous consultez l’écran de {name}',
        exit: 'Retour à la gestion',
        noEmployees: 'Aucun employé actif pour l’instant.'
      },
      support: {
        title: 'Assistance',
        promise: 'Dites-nous ce qui ne va pas ou ce qu’il vous manque. Une personne répond sous {hours} heures.',
        whatsapp: 'WhatsApp',
        newTitle: 'Ouvrir un ticket',
        kindLabel: 'Type', subjectLabel: 'Objet', bodyLabel: 'Que s’est-il passé ?',
        send: 'Envoyer',
        sent: 'Bien reçu. Une personne vous répondra sous {hours} heures.',
        sendFailed: 'Le ticket n’a pas pu être envoyé. Réessayez.',
        loadFailed: 'Vos tickets n’ont pas pu être chargés.',
        listTitle: 'Vos tickets',
        empty: 'Aucun ticket pour le moment.',
        replyLabel: 'Notre réponse :',
        errorSubject: 'Indiquez un objet.',
        errorBody: 'Décrivez ce qui s’est passé.',
        errorSubjectLong: 'L’objet dépasse {max} caractères.',
        errorBodyLong: 'La description dépasse {max} caractères.',
        kind: { bug: 'Quelque chose ne marche pas', feature: 'Demande de fonctionnalité', question: 'Question' },
        status: { open: 'Ouvert', in_progress: 'En cours', answered: 'Répondu', closed: 'Fermé' }
      },
      settings: {
        rules: 'Règles de planification',
        onePerDay: 'Une personne travaille au plus un service par jour',
        rest: 'Pas de service du matin après un service du soir la veille',
        oneDayOff: 'Le jour marqué en repos dans les Demandes est le seul jour de repos de la semaine',
        shiftTypes: 'Types de service',
        addShift: '+ Ajouter un service', applyHours: 'Appliquer les horaires à toutes les succursales (lun–ven)',
        shiftsHint: 'Définissez combien de services compte votre entreprise, leurs noms, horaires, couleur et ordre. ' +
          'Les horaires ici sont les valeurs par défaut ; chaque succursale peut les modifier. ' +
          'Le bouton met à jour les succursales existantes sans toucher aux jours ouverts ni aux effectifs.',
        shiftNamePlaceholder: 'Nom du service',
        sabbathTitle: 'Samedi soir',
        sabbathDefault: 'Heure de fin du chabbat par défaut pour une nouvelle semaine :',
        sabbathHint: 'Chaque semaine, vous pouvez ajuster l’heure réelle en haut de l’onglet Planning. ' +
          'Les services du samedi soir commencent une demi-heure plus tard.',
        backup: 'Sauvegarde et restauration',
        exportJson: 'Exporter toutes les données (JSON)', importJson: 'Importer des données',
        reset: 'Réinitialiser aux valeurs par défaut',
        deadlineTitle: 'Clôture des demandes',
        deadlineEnable: 'Clôturer les demandes à une heure fixe',
        deadlineDay: 'Jour',
        deadlineTime: 'Heure',
        deadlineRemind: 'Rappel avant',
        deadlineHours: '{hours} heures',
        deadlinePreview: 'Les demandes pour la semaine du {week} closent le {day} {date} à {time}.',
        deadlineHint: 'Après cette heure, les employés ne peuvent plus déposer ni modifier de demande pour cette semaine. Un responsable le peut toujours.',
        backupHint: 'Les données sont enregistrées automatiquement dans ce navigateur. Pour les transférer entre ordinateurs, exportez un fichier JSON.',
        backupHintCloud: 'Les données sont enregistrées dans le cloud et synchronisées sur tous les appareils. L’export JSON sert à votre propre sauvegarde.',
        languageTitle: 'Langue', languageHint: 'Change toute l’interface. Enregistré sur cet appareil.'
      },

      server: {
        confirmEmail: 'Vérifiez votre e-mail et confirmez l’adresse, puis connectez-vous',
        credentialsRequired: 'L’e-mail et le mot de passe sont obligatoires',
        passwordTooShort: 'Le mot de passe doit contenir au moins 6 caractères',
        emailTaken: 'Cette adresse e-mail est déjà enregistrée',
        companyRequired: 'Un nom d’entreprise est obligatoire',
        badCredentials: 'E-mail ou mot de passe incorrect',
        userInactive: 'Cet utilisateur n’est pas actif. Contactez le responsable de l’entreprise.',
        signInRequired: 'Veuillez vous connecter',
        noPermission: 'Vous n’êtes pas autorisé à faire cela',
        notLinked: 'Cet utilisateur n’est lié à aucune fiche d’employé',
        weekPublished: 'Le planning de cette semaine est publié, les demandes ne peuvent plus être modifiées',
        weekPublishedShort: 'Le planning de cette semaine est déjà publié',
        noRequest: 'Il n’y a aucune demande pour ce jour',
        badDecision: 'Décision invalide',
        requestNotFound: 'Demande introuvable',
        weekMissing: 'Cette semaine n’existe pas',
        userNotFound: 'Utilisateur introuvable',
        cannotChangeOwner: 'Le propriétaire du compte ne peut pas être modifié'
      },

      notify: {
        published: 'Planning publié',
        publishedBody: 'Le planning de la nouvelle semaine est prêt. Vous pouvez voir vos services.',
        requestApproved: 'Votre demande a été approuvée',
        requestApprovedBody: 'Votre demande pour le {day} a été approuvée.',
        requestRejected: 'Votre demande a été refusée',
        requestRejectedBody: 'Votre demande pour le {day} a été refusée',
        newRequest: 'Nouvelle demande',
        newRequestBody: 'Quelqu’un a envoyé une demande en attente de votre approbation.',
        newRequestsBody: '{count} nouvelles demandes attendent votre approbation.'
      },

      payments: {
        notConnected: 'La facturation n’est pas encore connectée. Contactez le support.',
        mockProvider: 'Prestataire de test (développement)',
        mockNote: 'Le paiement est approuvé immédiatement sans débit réel. Pour le développement et les démonstrations uniquement.',
        unknownPlan: 'Formule inconnue',
        serverProvider: 'Facturation serveur ({name})',
        notConfigured: 'La facturation n’est pas configurée dans cet environnement',
        requestFailed: 'La demande de facturation a échoué ({status})'
      },

      billing: {
        firstCharge: 'Premier prélèvement',
        nextCharge: 'Prochain prélèvement',
        paymentMethod: 'Moyen de paiement',
        cardOnFile: 'Enregistré',
        noCard: 'Non ajouté',
        addCard: 'Ajouter un moyen de paiement',
        noCardWarning: 'Aucun moyen de paiement. Sans cela, l’accès prend fin le {date}.',
        trialNotice: 'Aucun prélèvement pendant les {days} premiers jours. Le premier prélèvement a lieu le {date} pour {price}, puis chaque mois — jusqu’à résiliation.',
        cancelBeforeCharge: 'Résilier avant le prélèvement',
        cancelTrialConfirm: 'Résilier l’abonnement ? Aucun prélèvement ne sera effectué, et l’accès reste jusqu’à la fin de l’essai.',
        resume: 'Reprendre l’abonnement',
        resumed: 'Abonnement repris',
        priceMonthly: '{amount} ILS / mois', priceAmount: '{amount} ILS',
        updateFailed: 'Échec de la mise à jour', cancelFailed: 'Échec de l’annulation',
        title: 'Votre abonnement', status: 'Statut', plan: 'Formule', validUntil: 'Valable jusqu’au',
        activeStaff: 'Personnel actif', of: '{count} sur {max}', unlimited: '{count} (illimité)',
        plans: 'Formules', choose: 'Choisir', currentPlan: 'Formule actuelle',
        tooSmall: 'Trop petite pour {count} employés', cancel: 'Résilier l’abonnement',
        cancelConfirm: 'Résilier l’abonnement ? L’accès prend fin à la fin de la période payée.',
        planUpdated: 'Formule mise à jour', canceled: 'Abonnement résilié',
        ownerOnly: 'Seul le propriétaire du compte peut modifier l’abonnement.',
        perMonth: 'par mois',
        statusTrial: 'Essai', statusActive: 'Actif', statusPastDue: 'Paiement échoué',
        statusCanceled: 'Résilié', statusExpired: 'Expiré'
      },

      auth: {
        wait: 'Un instant…',
        notifyEnabled: 'Notifications activées',
        notifyBody: 'Nous vous préviendrons des mises à jour du planning.',
        signIn: 'Connexion', signUp: 'Créer un compte entreprise',
        email: 'E-mail', password: 'Mot de passe', name: 'Votre nom', companyName: 'Nom de l’entreprise',
        passwordHint: 'Au moins 6 caractères',
        enter: 'Se connecter', create: 'Créer le compte', signingIn: 'Connexion…', creating: 'Création…',
        trialNote: '{days} jours gratuits. Le premier prélèvement a lieu le {date} ; résiliez avant et vous ne payez rien.',
        signOut: 'Déconnexion', blocked: 'Accès bloqué',
        blockedOwner: 'Contactez le support pour activer l’abonnement.',
        blockedMember: 'Demandez au propriétaire du compte de renouveler l’abonnement.',
        enableNotifications: 'Activer les notifications',
        failedSignIn: 'Échec de la connexion', failedSignUp: 'Échec de la création du compte'
      },

      users: {
        nameColumn: 'Nom', emailColumn: 'E-mail', createFailed: 'Impossible de créer l’utilisateur',
        title: 'Utilisateurs',
        hint: 'Chaque personne peut avoir son propre accès. Elle ne voit que ses services et envoie ses propres demandes – ' +
          'elle ne voit pas le planning complet et ne peut rien modifier. Les responsables voient et modifient tout. ' +
          'Liez un utilisateur à une fiche d’employé pour qu’il voie ses services.',
        add: 'Ajouter un utilisateur', createUser: 'Créer l’utilisateur',
        role: 'Rôle', staffCard: 'Fiche d’employé', none: 'Aucune', noLink: 'Aucun lien',
        initialPassword: 'Mot de passe initial', activeColumn: 'Actif',
        created: 'Utilisateur créé pour {email}', updated: 'Enregistré', updateFailed: 'Échec de la mise à jour'
      },

      access: {
        trialWithCard: 'Essai – {days} jours restants. Premier prélèvement le {date}, {price}.',
        trialNoCard: 'Essai – {days} jours restants. Ajoutez un moyen de paiement pour continuer après le {date}.',
        trialEndedNoCard: 'L’essai est terminé. Ajoutez un moyen de paiement pour continuer.',
        trialCanceled: 'Résilié – aucun prélèvement ne sera effectué. L’accès reste jusqu’au {date}.',
        canceledAtPeriodEnd: 'Résilié. L’accès reste jusqu’au {date}, et il n’y aura plus de prélèvement.',
        charging: 'L’essai est terminé et le premier prélèvement est en cours.',
        noCompany: 'Aucune entreprise trouvée',
        expired: 'L’abonnement a expiré. Renouvelez-le pour continuer.',
        pastDueBlocked: 'Le paiement n’a pas été reçu et l’accès est bloqué. Veuillez mettre à jour le moyen de paiement.',
        pastDue: 'Le dernier paiement n’est pas passé. L’accès sera bloqué dans {days} jours.',
        expiredKept: 'L’abonnement a expiré et n’a pas été renouvelé. Choisir une formule rétablit l’accès immédiatement, et vos données sont conservées.',
        canceled: 'L’abonnement a été résilié. Vous pouvez le renouveler à tout moment – vos données sont conservées.',
        inactive: 'L’abonnement n’est pas actif.',
        overLimit: 'La formule {plan} couvre jusqu’à {max} employés. Vous en avez {count} – la formule {suggested} est nécessaire ({range}, {price}).'
      },

      plans: {
        starter: 'Petite', growth: 'Moyenne', business: 'Grande',
        upTo: 'Jusqu’à {count} employés',
        between: 'De {from} à {to} employés',
        from: '{count} employés et plus'
      },

      roles: { owner: 'Propriétaire', manager: 'Responsable', employee: 'Employé' },

      employee: {
        prevWeek: '◀ Semaine précédente', nextWeek: 'Semaine suivante ▶',
        loadFailed: 'Impossible de charger les données : {message}',
        saveFailed: 'Échec de l’enregistrement', reasonSaveFailed: 'Impossible d’enregistrer le motif',
        myShifts: 'Mes services', myRequests: 'Mes demandes',
        notPublished: 'Le planning de cette semaine n’est pas encore publié.',
        noShifts: 'Vous n’avez aucun service cette semaine.',
        totalWeek: '{count} services cette semaine.',
        deadlineOpen: 'Les demandes de cette semaine closent le {day} {date} à {time}.',
        deadlineHours: 'Les demandes closent dans {hours} heures. Ensuite, plus de modification possible.',
        deadlineClosed: 'Les demandes de cette semaine sont closes. Si quelque chose a changé, parlez-en à votre responsable.',
        deadlineLocked: 'Les demandes de cette semaine sont closes.',
        publishedLocked: 'Le planning est publié – les demandes pour cette semaine ne peuvent plus être modifiées.',
        notLinked: 'Votre utilisateur n’est pas encore lié à une fiche d’employé. Contactez votre responsable.',
        noShiftsToday: 'Aucun service ce jour-là', holidayNoWork: 'Jour férié – pas de travail'
      },

      chat: {
        title: 'Questions sur ce planning',
        hint: 'Posez une question sur la semaine affichée – par exemple « qui travaille mardi soir ? », ' +
          '« pourquoi Employé 3 n’est-il pas prévu jeudi ? » ou « qui peut remplacer Employé 5 mercredi ? »',
        placeholder: 'Posez une question sur le planning…', send: 'Envoyer'
      },

      excel: {
        availabilityNone: 'Plus rien de disponible – aucun service supplémentaire ne peut être affecté cette semaine',
        availabilityLeft: '{verb} {shifts} encore à affecter',
        spare: 'Quota restant', required: 'Requis',
        valid: 'Valide', checksTitle: 'Contrôles du planning',
        personalText: 'Texte pour WhatsApp',
        byBranch: 'Par succursale', byEmployee: 'Par employé', availability: 'Disponibilité',
        checks: 'Contrôles', personal: 'Mon planning',
        title: 'Planning de travail – semaine du {from} au {to}',
        viewBranch: 'Par succursale', viewEmployee: 'Par employé',
        sabbathEnds: 'Fin du chabbat {time}',
        day: 'Jour', date: 'Date', branch: 'Succursale', shift: 'Service', hours: 'Horaires',
        staff: 'Employé', assigned: 'Affectés', quota: 'Quota', left: 'Quota restant',
        canAssign: 'Peut être affecté', freeDays: 'Jours libres', totalShifts: 'Total des services',
        severity: 'Gravité', type: 'Type', detail: 'Détail',
        missing: '— manquant —', closed: 'Fermé', notAssigned: 'Non affecté',
        personalTitle: 'Planning personnel – {name}', totalWeek: '{count} services cette semaine',
        noIssues: 'Aucun doublon, manque ni demande non respectée'
      },

      errors: {
        invalidTime: 'Heure invalide – utilisez le format 24 heures, par exemple 09:30',
        emptyShiftName: 'Le nom du service ne peut pas être vide',
        lastShift: 'Il doit rester au moins un service',
        notSaved: 'Échec de l’enregistrement', copied: 'Copié dans le presse-papiers',
        viewOnlyBlocked: 'Lecture seule – la modification est désactivée. Vous pouvez la désactiver en haut de l’écran.',
        duplicatePerson: 'La même personne ne peut pas apparaître deux fois sur un service',
        printBlocked: 'L’impression est bloquée ici – utilisez « Copier en texte » ou l’export Excel',
        chooseEmployee: 'Choisissez une personne pour l’export personnel'
      },

      common: {
        emailUs: 'Écrivez-nous',
        moveUp: 'Monter', moveDown: 'Descendre', timePlaceholder: 'hh:mm',
        save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', close: 'Fermer',
        yes: 'Oui', no: 'Non', all: 'Tout', and: 'et', more: 'et {count} de plus'
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
