/* Deutsch */
(function (root) {
  'use strict';

  root.I18n.register({
    code: 'de',
    name: 'Deutsch',
    dir: 'ltr',
    locale: 'de-DE',
    weekStart: 1,
    currency: { code: 'ILS', symbol: '₪', position: 'after' },
    dict: {
      app: {
        title: 'SetShifts',
        subtitle: 'KI-Planung für jeden Standort – nach Verfügbarkeit, Wünschen, Rollen und Ihren Regeln',
        language: 'Sprache'
      },

      days: {
        0: 'Sonntag', 1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch',
        4: 'Donnerstag', 5: 'Freitag', 6: 'Samstag'
      },
      daysShort: { 0: 'So', 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' },

      shifts: { morning: 'Früh', middle: 'Mittag', evening: 'Abend', night: 'Nacht' },

      seed: {
        branchCenter: 'Filiale Mitte', branchNorth: 'Filiale Nord', branchSouth: 'Filiale Süd',
        employee: 'Mitarbeiter {n}',
        noteFloater: 'Springt in allen Filialen ein', noteStudent: 'Studentisch – keine Frühschichten'
      },

      colors: {
        0: 'Bernstein', 1: 'Grün', 2: 'Blau', 3: 'Violett',
        4: 'Rosa', 5: 'Türkis', 6: 'Grau', 7: 'Braun'
      },

      landing: {
        planTrialLine: '{days} Tage gratis, danach',
        faq6Q: 'Wann genau werde ich abgebucht?',
        faq6A: 'Sie schließen das Abo mit Karte ab, aber in den ersten {days} Tagen wird nichts abgebucht. Die erste Abbuchung erfolgt automatisch am Ende der Testphase, danach monatlich – bis Sie kündigen. Eine Kündigung während der Testphase kostet nichts, und der Zugang bleibt bis zu deren Ende bestehen.',
        signIn: 'Anmelden',
        start: 'Gratis starten',
        startLong: 'Gratis starten – {days} Tage',
        heroBadge: 'KI-Dienstplanung für Unternehmen mit mehreren Standorten',
        heroTitle: 'Ihr ganzer Betrieb, in einem Klick geplant.',
        heroSubtitle: 'Die KI von SetShifts erstellt den Dienstplan für jeden Standort selbst – aus der Verfügbarkeit Ihrer Mitarbeitenden, ihren Wünschen, Stundengrenzen, Rollen und Ihren eigenen Regeln. Und zu jeder Zuteilung sagt sie Ihnen, warum diese Person. Sie geben frei, Sie bauen nicht.',
        heroNote: '{days} Tage gratis. Kündigen Sie vor Ende der Testphase, wird gar nichts abgebucht.',
        heroSecondary: 'So funktioniert es',
        whyTitle: 'Warum diese Person?',
        whySubtitle: 'Die erste Frage, die jede Führungskraft an einen automatisch erstellten Dienstplan stellt – und die darüber entscheidet, ob sie ihm vertraut oder alles von Hand neu baut.',
        whyBody: 'Klicken Sie auf das Fragezeichen neben einer Zuteilung, und SetShifts antwortet: wer diese Schicht gewünscht hat, wer dafür eingearbeitet ist, wer sein Pensum schon erfüllt hat und wer sie sonst noch hätte übernehmen können. Keine Blackbox, der man glauben muss.',
        whyPoint1: 'Die Erklärung wird aus dem Plan auf dem Bildschirm abgeleitet und bleibt deshalb auch nach einer Änderung von Hand richtig.',
        whyPoint2: 'Sie sehen nicht nur, wer gewählt wurde, sondern auch, wer ausgeschlossen wurde und warum – das macht aus einer Diskussion mit einem Mitarbeiter ein Gespräch von dreißig Sekunden.',
        whyDemoSlot: 'Dienstag · Zentrum · Abend',
        whyDemoTitle: 'Warum Daniel?',
        whyDemoFact1: 'Hat diese Schicht an diesem Tag gewünscht',
        whyDemoFact2: 'Für diese Schicht eingearbeitet · diesem Standort zugeordnet',
        whyDemoFact3: '3 von 5 Schichten diese Woche',
        whyDemoVerdict: 'Von den 2 möglichen Personen war das die fairste Wahl.',
        problemsTitle: 'Die drei Dinge, die jede Woche schiefgehen',
        problem1Title: 'Dieselbe Schicht, zwei Personen',
        problem1Body: 'Ein Standort ist doppelt besetzt, während an einem anderen jemand fehlt. Sie merken es, wenn jemand ankommt und nichts zu tun hat.',
        problem2Title: 'Wünsche gehen verloren',
        problem2Body: 'Ein Urlaubswunsch kommt per Nachricht, wird vergessen, und der Dienstplan bricht ein Versprechen, das Sie gegeben haben.',
        problem3Title: 'Lücken ohne Erklärung',
        problem3Body: 'Eine Schicht bleibt leer, und niemand weiß, ob es wirklich unmöglich ist oder einfach übersehen wurde.',
        featuresTitle: 'Was das System leistet',
        featuresSubtitle: 'Keine bunte Tabelle. Eine Planung, die Ihre Regeln kennt.',
        feature1Title: 'Automatische Planung',
        feature1Body: 'Ein Klick füllt die ganze Woche an allen Standorten, verteilt die Last fair und hält das Wochenlimit jeder Person ein.',
        feature2Title: 'Doppelbelegungen erkennen',
        feature2Body: 'Jede Doppelbelegung, jede Lücke und jeder gebrochene Wunsch wird sofort markiert – mit Grund und Lösungsvorschlag.',
        feature3Title: 'Wünsche mit Freigabe',
        feature3Body: 'Mitarbeitende reichen ihre Wünsche selbst ein, mit optionaler Begründung. Nichts wirkt auf den Plan, bevor Sie es freigeben.',
        feature4Title: 'Ihre Schichten, Ihre Zeiten',
        feature4Body: 'Früh, Mittag, Abend, Nacht – legen Sie so viele Schichten an, wie Ihr Betrieb braucht, mit eigenen Zeiten und Farben je Standort.',
        feature5Title: 'Excel und WhatsApp',
        feature5Body: 'Exportieren Sie die ganze Woche, oder schicken Sie jeder Person nur ihre eigenen Schichten – als persönliche Tabelle oder als fertigen Text.',
        feature6Title: 'Auf jedem Gerät live',
        feature6Body: 'Die Leitung bearbeitet am Rechner, die Mitarbeitenden sehen ihre Schichten am Handy. Alle sehen denselben Plan, sofort.',
        howTitle: 'In einem Nachmittag startklar',
        how1Title: 'Standorte und Team anlegen',
        how1Body: 'Öffnungstage, Zeiten und Personenzahl je Schicht – jeder Standort auf seine Weise.',
        how2Title: 'Wünsche einsammeln',
        how2Body: 'Die Mitarbeitenden melden sich an und reichen ihre Wünsche ein. Sie geben frei oder lehnen ab und sehen alles an einem Ort.',
        how3Title: 'Erstellen und veröffentlichen',
        how3Body: 'Ein Klick baut die Woche. Hinweise durchgehen, das Wichtige korrigieren, veröffentlichen – und jede Person sieht ihre Schichten.',
        pricingTitle: 'Einfacher Preis, nach Teamgröße',
        pricingSubtitle: 'Unbegrenzte Standorte in jedem Tarif. Jederzeit kündbar.',
        pricingCta: 'Gratis starten',
        pricingNote: 'Alle Preise in ILS, pro Monat, zzgl. MwSt. {days} Tage gratis in jedem Tarif – die erste Abbuchung kommt erst nach Ende der Testphase, und eine Kündigung davor kostet nichts.',
        planPopular: 'Am beliebtesten',
        faqTitle: 'Fragen',
        faq1Q: 'Muss ich etwas installieren?',
        faq1A: 'Nein. Das System läuft im Browser. Auf dem Handy können Sie es zum Startbildschirm hinzufügen – es öffnet sich wie eine App, im Vollbild.',
        faq2Q: 'Sehen meine Mitarbeitenden die Schichten der anderen?',
        faq2A: 'Nein. Jede Person sieht nur ihre eigenen Schichten und Wünsche. Nur die Leitung sieht den ganzen Plan.',
        faq3Q: 'Was, wenn eine Schicht nicht besetzt werden kann?',
        faq3A: 'Das System sagt Ihnen genau warum – wer sein Wochenlimit erreicht hat, wer an dem Tag schon arbeitet, wer Ruhe zwischen zwei Schichten braucht – und was zu ändern ist.',
        faq4Q: 'Sind meine Daten sicher, wenn ich nicht mehr zahle?',
        faq4A: 'Ja. Ihre Daten bleiben erhalten. Wählen Sie wieder einen Tarif, ist der Zugang sofort da – alles genau dort, wo Sie aufgehört haben.',
        faq5Q: 'Welche Sprachen werden unterstützt?',
        faq5A: 'Hebräisch, Englisch, Spanisch, Französisch, Deutsch, Portugiesisch, Russisch und Arabisch – auch Sprachen, die von rechts nach links gelesen werden. Jede Person wählt ihre eigene.',
        ctaTitle: 'Probieren Sie es am Plan für nächste Woche',
        ctaBody: 'Standorte einrichten, eine Woche bauen, den Unterschied sehen. Ein Nachmittag reicht.',
        footerRights: 'Alle Rechte vorbehalten.',
        footerTagline: 'Dienstplanung für Filialbetriebe.'
      },
      tabs: {
        support: 'Support',
        schedule: 'Dienstplan', constraints: 'Wünsche', employees: 'Team',
        branches: 'Filialen', users: 'Benutzer', billing: 'Abonnement', settings: 'Einstellungen'
      },

      toolbar: {
        prevWeek: 'Vorherige Woche', nextWeek: 'Nächste Woche', thisWeek: 'Diese Woche',
        week: 'Woche {from} – {to}', currentWeek: 'Aktuelle Woche',
        generate: 'Plan erstellen', clear: 'Plan leeren',
        keepManual: 'Manuelle Zuweisungen behalten',
        copyText: 'Als Text kopieren', excel: 'Excel', csv: 'CSV', print: 'Drucken',
        moreTools: 'Weitere Werkzeuge', closeTools: 'Werkzeuge schließen',
        viewOnly: 'Nur Ansicht', exitViewOnly: 'Ansichtsmodus beenden',
        shabbatEnd: 'Schabbat-Ende',
        byBranch: 'Nach Filiale', byEmployee: 'Nach Mitarbeiter',
        personalExport: 'Persönlicher Export (nur eigene Schichten):',
        choosePerson: 'Person auswählen…',
        holidays: 'Feiertage (alle Filialen geschlossen):'
      },

      schedule: {
        branch: 'Filiale', shift: 'Schicht', employee: 'Mitarbeiter', totalShifts: 'Schichten gesamt',
        empty: '— leer —', add: '+ hinzufügen', addPerson: '+ Person hinzufügen', notAssigned: '— nicht eingeteilt —',
        closed: 'An diesem Tag geschlossen', noBranches: 'Keine aktiven Filialen. Öffnen Sie den Reiter „Filialen“.',
        required: 'Benötigt: {count}', people: '{count} Personen',
        holidayClosed: 'Alle Filialen geschlossen', dayOff: 'Freier Tag', holiday: 'Feiertag',
        missingSabbath: 'Schabbat-Ende fehlt'
      },

      status: {
        demoTitle: 'Demomodus',
        demoBody: 'Die Daten liegen nur in diesem Browser und wandern nicht zwischen Geräten.',
        localOnly: 'Nur auf diesem Gerät gespeichert', readOnly: 'Nur Ansicht – keine Bearbeitungsrechte',
        saving: 'Speichern…',
        savedCloud: 'Alle Änderungen in der Cloud gespeichert',
        savedCloudAt: 'Alle Änderungen in der Cloud gespeichert · {time}',
        savedDeviceAt: 'Auf diesem Gerät gespeichert · {time}',
        saveFailed: 'Speichern derzeit nicht möglich',
        saveFailedHint: 'Die letzte Änderung wurde nicht gespeichert. Prüfen Sie die Verbindung – die nächste Änderung versucht es erneut.',
        remoteUpdate: 'Aktualisierung von einem anderen Gerät erhalten ({time})',
        localCopy: 'Dies ist eine lokale Kopie – die Daten liegen nur in diesem Browser und werden nicht synchronisiert. ' +
          'Für die Arbeit an zwei Rechnern nutzen Sie die gehostete Version. Zum Übertragen: JSON in den Einstellungen exportieren und dort importieren.',
        viewOnlyBanner: 'Nur Ansicht – der Plan wird zur Kontrolle angezeigt, Bearbeiten ist deaktiviert. ' +
          'Export, Druck und Wochenwechsel funktionieren weiterhin.'
      },

      levels: { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' },

      marks: {
        dayOff: 'freier Tag', blocked: 'gesperrt', prefers: 'bevorzugt',
        notInBranch: 'nicht in dieser Filiale', notInShift: 'nicht für diese Schicht',
        alreadyAssigned: 'bereits eingeteilt', inactive: 'inaktiv'
      },

      issueTypes: {
        'duplicate-shift': 'Doppelbelegung',
        'duplicate-employee-slot': 'Doppelbelegung',
        'double-booked': 'Zwei Schichten an einem Tag',
        understaffed: 'Unterbesetzt',
        'constraint-off': 'Wunsch verletzt',
        'constraint-blocked': 'Wunsch verletzt',
        'branch-mismatch': 'Falsche Filiale',
        'shift-mismatch': 'Falscher Schichttyp',
        'over-max': 'Über dem Limit',
        rest: 'Kurze Ruhezeit',
        'no-shifts': 'Keine Schichten',
        'missing-shabbat-end': 'Schabbat-Ende fehlt',
        'inactive-slot': 'Schicht nicht geöffnet',
        'pending-constraints': 'Offene Wünsche',
        'extra-days-off': 'Zu viele freie Tage',
        'below-target': 'Unter dem Soll'
      },

      toast: {
        generated: 'Plan erstellt – {shifts} noch unbesetzt',
        generatedFull: 'Plan erstellt – alle Schichten sind besetzt',
        clearWeekConfirm: 'Alle Zuweisungen dieser Woche löschen? Die Wünsche bleiben erhalten.',
        cleared: 'Plan geleert',
        copied: 'Plan in die Zwischenablage kopiert',
        personalCopied: 'Persönlicher Plan in die Zwischenablage kopiert',
        viewOnlyOn: 'Nur Ansicht ist aktiv – Bearbeiten ist deaktiviert',
        viewOnlyOff: 'Nur Ansicht ist aus – Sie können bearbeiten',
        copyPrompt: 'Text kopieren:',
        holidayCleared: '{day} ist wieder ein Arbeitstag',
        holidayPrompt: 'Name des Feiertags am {day} (die Filialen schließen und der Tag gilt für alle als frei):',
        holidayDefault: 'Feiertag',
        holidayHasAssignments: 'An diesem Tag sind bereits {count} Personen eingeteilt. Als Feiertag markieren und die Einteilungen löschen?',
        holidayMarked: '{day} ist als Feiertag markiert – die Filialen sind geschlossen',
        clearConstraintsConfirm: 'Alle Wünsche dieser Woche löschen?',
        constraintsCleared: 'Wünsche gelöscht',
        noPreviousConstraints: 'In der Vorwoche gibt es keine Wünsche',
        constraintsCopied: 'Wünsche aus der Vorwoche übernommen',
        requestApproved: 'Wunsch genehmigt', requestRejected: 'Wunsch abgelehnt',
        updateFailed: 'Aktualisierung fehlgeschlagen',
        deleteShiftConfirm: 'Die Schicht „{name}“ löschen?\n\n{usage}',
        deleteShiftUsed: 'Sie ist an {count} Filialtagen eingerichtet, und alle ihre Einteilungen werden gelöscht.',
        deleteShiftUnused: 'Sie wird in keiner Filiale verwendet.',
        shiftDeleted: 'Schicht gelöscht{removed}',
        shiftRemovedCount: ' ({count} Einteilungen entfernt)',
        shiftAdded: 'Schicht hinzugefügt. Richten Sie sie unter „Filialen“ ein, damit sie im Plan erscheint.',
        newShift: 'Schicht {n}',
        applyHoursConfirm: 'Die Standardzeiten auf alle {count} Filialen anwenden, Sonntag bis Donnerstag?\n\n' +
          'Öffnungstage und Personalstärke bleiben unverändert. Freitag und Samstagabend werden nicht geändert.',
        hoursUpdated: 'Zeiten in {count} Schichten aktualisiert',
        hoursAlready: 'Alle Schichten nutzen bereits diese Zeiten',
        imported: 'Daten importiert',
        importedCloud: 'Daten importiert und in die Cloud geladen ({count} Wochen)',
        importFailed: 'Ungültige Datei: {message}',
        resetConfirm: 'Alle Daten (Team, Filialen, Pläne und Wünsche) auf die Standardwerte zurücksetzen?',
        reset: 'Daten zurückgesetzt'
      },

      ui: {
        until: 'bis {time}', sheet: 'Blatt {n}',
        fileSaved: 'Datei gespeichert', fileFailed: 'Datei konnte nicht gespeichert werden: {message}',
        unknownError: 'unbekannter Fehler', downloadUnavailable: 'Dateien können hier nicht heruntergeladen werden',
        loadFailed: 'Laden der Daten fehlgeschlagen, Standardwerte geladen',
        saveFailed: 'Speichern der Daten fehlgeschlagen',
        iconLetters: 'SP',
        dayHeading: '{day} ({date})',
        missingStaff: 'unterbesetzt',
        holidayClosedLine: '{name} – alle Filialen geschlossen',
        spareLine: '— {verb} {shifts} noch zu vergeben —',
        unknownBranch: 'Unbekannte Filiale', unknownEmployee: 'Unbekannte Person',
        weekLabel: 'Woche {from} – {to}', constraintsWeek: 'Wünsche · {label}',
        holidayAllClosed: 'Alle Filialen geschlossen – freier Tag für alle',
        holidayNoRequests: 'Feiertag – keine Wünsche nötig',
        branchClosedToday: 'An diesem Tag geschlossen',
        noActiveBranches: 'Keine aktiven Filialen.',
        noActiveBranchesTab: 'Keine aktiven Filialen. Öffnen Sie den Reiter „Filialen“.',
        allClosedOn: 'Am {day} sind alle Filialen geschlossen.',
        branchesClosed: 'Filialen geschlossen',
        noHours: 'Keine Zeiten',
        outOf: '{done} von {total}',
        cloudSaved: 'Die Daten liegen in der Cloud und aktualisieren sich auf jedem Rechner, der diesen Link geöffnet hat',
        deviceSaved: 'Die Daten liegen nur in diesem Browser',
        thinking: 'Denke nach…',
        noAnswer: '(keine Antwort erhalten)',
        chatBlocked: 'Sie dürfen auf dieser Seite keine Fragen stellen.',
        chatRateLimited: 'Zu viele Fragen hintereinander – versuchen Sie es gleich noch einmal.',
        chatFailed: 'Ich konnte gerade nicht antworten',
        chatSystem: 'Sie helfen einer Führungskraft bei der Schichtplanung. Antworten Sie auf {language}, kurz und sachlich, ' +
          'und stützen Sie sich nur auf die folgenden Daten. Fehlt eine Information, sagen Sie das, statt zu raten.',
        chatDataStart: '=== Wochendaten ===',
        chatDataEnd: '=== Ende der Daten ===',
        chatQuestion: 'Frage: ',
        summaryShabbat: 'Schabbat-Ende: {time}',
        summaryHolidays: 'Feiertage geschlossen: {days}', summaryNoHolidays: 'Diese Woche gibt es keine Feiertage.',
        summaryRules: 'Planungsregeln:',
        ruleOnePerDayOn: 'Eine Person arbeitet höchstens eine Schicht pro Tag.',
        ruleOnePerDayOff: 'Eine Person darf mehrere Schichten am Tag arbeiten.',
        ruleRestOn: 'Keine Frühschicht nach einer Abendschicht am Vortag.',
        ruleRestOff: 'Keine Ruhezeit zwischen Abend- und Frühschicht erforderlich.',
        summaryBranches: 'Filialen:', summaryEmployees: 'Team:',
        summaryCurrent: 'Aktueller Plan:', summaryAvailability: 'Verbleibende Verfügbarkeit:',
        summaryIssues: 'Hinweise zum Plan:', summaryNoIssues: 'Keine Hinweise – der Plan ist in Ordnung.',
        closedAllWeek: 'die ganze Woche geschlossen', allBranches: 'alle Filialen',
        peopleCount: '{count} Personen',
        empBranches: 'Filialen', empShifts: 'Schichten', empMax: 'höchstens {count} pro Woche',
        empAskedOff: 'hat frei beantragt', empBlocked: 'hat gesperrt', empNote: 'Notiz',
        empAssignedOf: '{name}: {total} von {max} eingeteilt',
        empFreeDays: 'freie Tage: {days}', none: 'keine',
        fileName: 'dienstplan', personalFileName: 'dienstplan-{name}',
        greeting: 'Hallo {name}, hier ist Ihr Dienstplan:',
        shortTitle: 'Schichten'
      },

      alerts: {
        slotLabel: '{day} · {branch} · {shift}schicht',
        deletedEmployee: '(gelöschte Person: {id})',
        deletedBranch: '(gelöschte Filiale)',
        errorsOne: 'Ein Fehler', errorsOther: '{count} Fehler',
        warningsOne: 'Eine Warnung', warningsOther: '{count} Warnungen',
        infosOne: 'Ein Hinweis', infosOther: '{count} Hinweise',
        allGood: '✔ Der Plan ist in Ordnung – keine Doppelbelegungen, Lücken oder verletzten Wünsche',
        showAll: 'Alle {count} Hinweise anzeigen', showLess: 'Hinweise ausblenden',
        duplicate: 'Doppelbelegung: {label} – {count} Personen eingeteilt ({names}) statt {need}.',
        duplicateSelf: 'Doppelbelegung: {name} ist zweimal derselben Schicht zugeteilt – {label}.',
        doubleBooked: 'Doppelbelegung: {name} hat {count} Schichten am {day}{where} ({detail}).',
        sameBranch: ' in derselben Filiale', differentBranches: ' in verschiedenen Filialen',
        understaffed: 'Unterbesetzt: {label} – {assigned} von {need} eingeteilt.',
        reasonBusy: '{names} sind an diesem Tag bereits einer anderen Schicht zugeteilt',
        reasonMaxed: '{names} haben ihr Wochenlimit an Schichten erreicht',
        reasonResting: '{names} brauchen Ruhezeit zwischen Abend- und Frühschicht',
        reasonNone: 'Niemand ist sowohl für diese Filiale als auch für diese Schicht eingerichtet, oder alle haben sie gesperrt.',
        reasonFree: 'Es sind Personen frei ({names}) – versuchen Sie, den Plan neu zu erstellen.',
        reasonPrefix: 'Grund: ',
        suggestTwoPerDay: ' In den Einstellungen können Sie zwei Schichten pro Tag und Person erlauben.',
        suggestRaiseMax: ' Das Wochenlimit lässt sich in der Mitarbeiterkarte erhöhen.',
        constraintOff: 'Wunsch verletzt: {name} wollte am {day} frei, ist aber der Schicht {shift} in {branch} zugeteilt.',
        constraintBlocked: 'Wunsch verletzt: {name} hat die Schicht {shift} am {day} gesperrt, ist ihr aber in {branch} zugeteilt.',
        branchMismatch: '{name} ist am {day} in {branch} eingeteilt, obwohl diese Filiale nicht in der Mitarbeiterkarte steht.',
        shiftMismatch: '{name} ist am {day} der Schicht {shift} zugeteilt, obwohl dieser Schichttyp nicht in der Mitarbeiterkarte steht.',
        overMax: 'Über dem Limit: {name} hat {total} Schichten (Maximum {max}).',
        noShifts: '{name} hat diese Woche keine Schichten.',
        rest: 'Kurze Ruhezeit: {name} beendet am {previous} eine Abendschicht und beginnt am {day} eine Frühschicht.',
        holidayAssignment: 'Einteilung an einem Feiertag: {day} ({name}) ist als geschlossen markiert, eingeteilt sind aber {names}.',
        inactiveSlot: 'Einteilung in eine nicht geöffnete Schicht: {day} · {branch} · {shift} ({names}).',
        missingSabbath: 'Für diese Woche fehlt das Schabbat-Ende – der Beginn der Samstagabendschichten lässt sich nicht berechnen.',
        pendingOne: 'Ein Wunsch wartet auf Genehmigung: {name} ({day}). Bis zur Genehmigung wirkt er sich nicht auf den Plan aus.',
        pendingOther: '{count} Wünsche warten auf Genehmigung: {names}. Bis zur Genehmigung wirken sie sich nicht auf den Plan aus.',
        extraDaysOff: '{name} hat {count} freie Tage beantragt ({days}) – die Regel erlaubt einen freien Tag pro Woche.',
        belowTarget: '{name} wollte am {day} frei und hat {total} von {expected} möglichen Schichten – es bleiben noch freie Tage.'
      },

      availability: {
        title: 'Was noch verfügbar ist',
        none: 'Nichts mehr verfügbar – {reason}',
        reasonMaxed: 'alle haben ihr Wochenlimit an Schichten erreicht.',
        reasonNoDays: 'wer noch Kontingent hat, hat keinen freien Tag, an dem seine Filialen geöffnet sind.',
        totalOne: '{verb} noch eine Schicht zu vergeben, bei {people}:',
        totalOther: '{verb} noch {count} Schichten zu vergeben, bei {people}:',
        peopleOne: 'einer Person', peopleOther: '{count} Personen',
        left: '{verb} {shifts} im Kontingent · frei am {days}',
        leftNoDays: '{verb} {shifts} im Kontingent, aber kein freier Tag in dieser Woche',
        full: 'Kontingent voll ausgeschöpft ({assigned} von {max})',
        noEmployees: 'Kein aktives Team.',
        shiftsOne: 'eine Schicht', shiftsOther: '{count} Schichten',
        remains: 'bleibt', remainPlural: 'bleiben'
      },

      constraints: {
        title: 'Wünsche für {week}',
        clear: 'Diese Woche löschen', copyPrevious: 'Aus der Vorwoche übernehmen',
        legend: 'Auf eine Schicht tippen zum Wechseln: {free} → {preferred} → {blocked}. „Freier Tag“ sperrt den ganzen Tag.',
        free: 'Verfügbar', preferred: 'Bevorzugt', blocked: 'Kann nicht', dayOff: 'Freier Tag',
        pendingTitle: 'Wünsche, die auf Ihre Genehmigung warten ({count})',
        pendingHint: 'Ein nicht genehmigter Wunsch wirkt sich nicht auf den Plan aus.',
        approve: 'Genehmigen', reject: 'Ablehnen',
        approved: 'Genehmigt', rejected: 'Abgelehnt', pending: 'Wartet auf Genehmigung',
        requestLabel: 'Wunsch: {detail}', requestRejected: 'Wunsch abgelehnt',
        reason: 'Grund (optional)',
        reasonPlaceholder: 'z. B. Hochzeit, Prüfung, Arzttermin',
        reasonSaved: 'Grund gespeichert', reasonGiven: 'Angegebener Grund: {text}',
        managerNote: 'Notiz der Führungskraft: {text}',
        needsApproval: 'Jeder Wunsch geht an Ihre Führungskraft und wirkt sich erst nach der Genehmigung auf den Plan aus.',
        noChange: 'Keine Änderung'
      },

      employees: {
        title: 'Team', add: '+ Person hinzufügen', active: 'Aktiv',
        branchesLabel: 'Filialen (keine Auswahl = alle Filialen)',
        shiftTypes: 'Mögliche Schichttypen',
        maxShifts: 'Maximale Schichten pro Woche', note: 'Notiz',
        deleteConfirm: '{name} löschen? Die Einteilungen werden aus allen Wochen entfernt.',
        inactive: '(inaktiv)', newName: 'Neue Person'
      },

      branches: {
        title: 'Filialen', add: '+ Filiale hinzufügen', active: 'Aktiv', newName: 'Neue Filiale',
        hint: 'Jede Filiale hat eigene Tage, Zeiten und Personalstärke pro Schicht. ' +
          '0 Personen schließt diese Schicht an diesem Tag. Mehr Einteilungen als vorgesehen gelten als Doppelbelegung.',
        peopleLabel: 'Personen', closed: 'Geschlossen', day: 'Tag',
        copyFrom: 'Tage und Zeiten aus einer anderen Filiale kopieren', chooseBranch: 'Filiale auswählen…',
        copyConfirm: 'Tage und Zeiten von {from} nach {to} kopieren?',
        copied: 'Tage und Zeiten kopiert',
        deleteConfirm: '{name} löschen? Die Einteilungen werden aus allen Wochen entfernt.',
        autoSabbath: 'Nach Schabbat-Ende', autoSabbathLabel: 'Schabbat-Ende +30 Min.'
      },

      publish: {
        action: 'Plan veröffentlichen',
        update: 'Änderungen veröffentlichen',
        revert: 'Zurück zum Entwurf',
        draft: 'Entwurf – Ihr Team sieht diesen Plan noch nicht',
        published: 'Veröffentlicht am {date} um {time}',
        changed: 'Seit der Veröffentlichung am {date} um {time} geändert',
        publishedNow: 'Veröffentlicht. Ihr Team sieht den Plan',
        revertedNow: 'Zurück zum Entwurf. Ihr Team sieht den Plan nicht',
        confirmRevert: 'Diesen Plan zurück zum Entwurf setzen? Ihr Team sieht ihn erst bei der nächsten Veröffentlichung.'
      },

      why: {
        button: 'Warum diese Person?',
        title: 'Warum {name}?',
        onlyOption: 'Niemand sonst konnte diese Schicht übernehmen.',
        fairest: 'Von den {count} möglichen Personen war das nach den bisherigen Schichten die fairste Wahl.',
        alsoPossible: 'Hätten sie ebenfalls übernehmen können: {names}.',
        whoCould: 'Wer nicht konnte ({count})',
        fact: {
          requested: 'Hat diese Schicht an diesem Tag gewünscht',
          available: 'Kein Urlaubswunsch für diesen Tag',
          qualified: 'Für diese Schicht eingearbeitet',
          assignedBranch: 'Diesem Standort zugeordnet',
          anyBranch: 'Arbeitet an allen Standorten',
          quota: 'Vor dieser Schicht {before}, danach {after} von einem Kontingent von {max}',
          capacity: 'Diese Woche sind ihm nur {target} dieser Schichten tatsächlich zugänglich',
          rest: 'Ruhezeit zwischen Abend- und Frühschicht ist eingehalten',
          continuity: 'Diese Woche schon {count}-mal an diesem Standort'
        },
        blocked: {
          inactive: 'ist nicht aktiv',
          notQualified: 'ist für diese Schicht nicht eingearbeitet',
          otherBranch: 'arbeitet an einem anderen Standort',
          requestedOff: 'hat den Tag frei beantragt',
          blockedShift: 'möchte diese Schicht nicht',
          atLimit: 'hat das Wochenlimit von {max} erreicht',
          busySameDay: 'arbeitet an diesem Tag bereits',
          busySameShift: 'ist bereits in dieser Schicht',
          restRule: 'braucht Ruhe zwischen Abend- und Frühschicht'
        }
      },
      preview: {
        open: 'Mitarbeiteransicht',
        title: 'Wessen Bildschirm möchten Sie sehen?',
        hint: 'Nur ansehen. Nichts davon wird in seinem Namen gespeichert.',
        banner: 'Sie sehen den Bildschirm von {name}',
        exit: 'Zurück zur Verwaltung',
        noEmployees: 'Noch keine aktiven Mitarbeiter.'
      },
      support: {
        title: 'Support',
        promise: 'Sagen Sie uns, was nicht funktioniert oder was Ihnen fehlt. Ein Mensch antwortet innerhalb von {hours} Stunden.',
        whatsapp: 'WhatsApp',
        newTitle: 'Ticket eröffnen',
        kindLabel: 'Art', subjectLabel: 'Betreff', bodyLabel: 'Was ist passiert?',
        send: 'Senden',
        sent: 'Eingegangen. Ein Mensch antwortet innerhalb von {hours} Stunden.',
        sendFailed: 'Das Ticket konnte nicht gesendet werden. Bitte erneut versuchen.',
        loadFailed: 'Ihre Tickets konnten nicht geladen werden.',
        listTitle: 'Meine Tickets',
        empty: 'Noch keine Tickets.',
        replyLabel: 'Unsere Antwort:',
        errorSubject: 'Bitte einen Betreff angeben.',
        errorBody: 'Bitte beschreiben, was passiert ist.',
        errorSubjectLong: 'Der Betreff ist länger als {max} Zeichen.',
        errorBodyLong: 'Die Beschreibung ist länger als {max} Zeichen.',
        kind: { bug: 'Etwas funktioniert nicht', feature: 'Funktionswunsch', question: 'Frage' },
        status: { open: 'Offen', in_progress: 'In Bearbeitung', answered: 'Beantwortet', closed: 'Geschlossen' }
      },
      settings: {
        rules: 'Planungsregeln',
        onePerDay: 'Eine Person arbeitet höchstens eine Schicht pro Tag',
        rest: 'Keine Frühschicht nach einer Abendschicht am Vortag',
        oneDayOff: 'Der in den Wünschen markierte freie Tag ist der einzige freie Tag der Woche',
        shiftTypes: 'Schichttypen',
        addShift: '+ Schicht hinzufügen', applyHours: 'Zeiten auf alle Filialen anwenden (Mo–Fr)',
        shiftsHint: 'Legen Sie fest, wie viele Schichten Ihr Betrieb hat, wie sie heißen, ihre Zeiten, Farbe und Reihenfolge. ' +
          'Die Zeiten hier sind Standardwerte; jede Filiale kann eigene festlegen. ' +
          'Die Schaltfläche aktualisiert bestehende Filialen, ohne Öffnungstage oder Personalstärke zu ändern.',
        shiftNamePlaceholder: 'Name der Schicht',
        sabbathTitle: 'Samstagabend',
        sabbathDefault: 'Standard-Schabbat-Ende für eine neue Woche:',
        sabbathHint: 'Die tatsächliche Zeit lässt sich jede Woche oben im Reiter „Dienstplan“ anpassen. ' +
          'Die Samstagabendschichten beginnen eine halbe Stunde später.',
        backup: 'Sicherung und Wiederherstellung',
        exportJson: 'Alle Daten exportieren (JSON)', importJson: 'Daten importieren',
        reset: 'Auf Standardwerte zurücksetzen',
        deadlineTitle: 'Annahmeschluss',
        deadlineEnable: 'Wunschabgabe zu einem festen Zeitpunkt schließen',
        deadlineDay: 'Tag',
        deadlineTime: 'Uhrzeit',
        deadlineRemind: 'Erinnern vorher',
        deadlineHours: '{hours} Stunden',
        deadlinePreview: 'Die Wünsche für die Woche ab {week} schließen am {day}, {date} um {time}.',
        deadlineHint: 'Danach können Mitarbeitende für diese Woche nichts mehr einreichen oder ändern. Die Leitung kann es immer.',
        backupHint: 'Die Daten werden automatisch in diesem Browser gespeichert. Zum Übertragen zwischen Rechnern exportieren Sie eine JSON-Datei.',
        backupHintCloud: 'Die Daten werden in der Cloud gespeichert und auf allen Geräten synchronisiert. Der JSON-Export dient Ihrer eigenen Sicherung.',
        languageTitle: 'Sprache', languageHint: 'Ändert die gesamte Oberfläche. Wird auf diesem Gerät gespeichert.'
      },

      server: {
        confirmEmail: 'Prüfen Sie Ihre E-Mail, bestätigen Sie die Adresse und melden Sie sich dann an',
        credentialsRequired: 'E-Mail und Passwort sind erforderlich',
        passwordTooShort: 'Das Passwort muss mindestens 6 Zeichen haben',
        emailTaken: 'Diese E-Mail-Adresse ist bereits registriert',
        companyRequired: 'Ein Firmenname ist erforderlich',
        badCredentials: 'E-Mail oder Passwort ist falsch',
        userInactive: 'Dieser Benutzer ist nicht aktiv. Wenden Sie sich an die Firmenleitung.',
        signInRequired: 'Bitte melden Sie sich an',
        noPermission: 'Dazu haben Sie keine Berechtigung',
        notLinked: 'Dieser Benutzer ist mit keiner Mitarbeiterkarte verknüpft',
        weekPublished: 'Der Plan dieser Woche ist veröffentlicht, Wünsche können nicht mehr geändert werden',
        weekPublishedShort: 'Der Plan dieser Woche ist bereits veröffentlicht',
        noRequest: 'Für diesen Tag gibt es keinen Wunsch',
        badDecision: 'Ungültige Entscheidung',
        requestNotFound: 'Wunsch nicht gefunden',
        weekMissing: 'Diese Woche existiert nicht',
        userNotFound: 'Benutzer nicht gefunden',
        cannotChangeOwner: 'Der Kontoinhaber kann nicht geändert werden'
      },

      notify: {
        published: 'Plan veröffentlicht',
        publishedBody: 'Der Plan für die neue Woche steht bereit. Sie können Ihre Schichten sehen.',
        requestApproved: 'Ihr Wunsch wurde genehmigt',
        requestApprovedBody: 'Ihr Wunsch für {day} wurde genehmigt.',
        requestRejected: 'Ihr Wunsch wurde abgelehnt',
        requestRejectedBody: 'Ihr Wunsch für {day} wurde abgelehnt',
        newRequest: 'Neuer Wunsch',
        newRequestBody: 'Jemand hat einen Wunsch eingereicht, der auf Ihre Genehmigung wartet.',
        newRequestsBody: '{count} neue Wünsche warten auf Ihre Genehmigung.'
      },

      payments: {
        notConnected: 'Die Abrechnung ist noch nicht angebunden. Wenden Sie sich an den Support.',
        mockProvider: 'Testanbieter (Entwicklung)',
        mockNote: 'Die Zahlung wird sofort ohne echte Belastung bestätigt. Nur für Entwicklung und Demos.',
        unknownPlan: 'Unbekannter Tarif',
        serverProvider: 'Abrechnung über Server ({name})',
        notConfigured: 'Die Abrechnung ist in dieser Umgebung nicht eingerichtet',
        requestFailed: 'Die Abrechnungsanfrage ist fehlgeschlagen ({status})'
      },

      billing: {
        firstCharge: 'Erste Abbuchung',
        nextCharge: 'Nächste Abbuchung',
        paymentMethod: 'Zahlungsmethode',
        cardOnFile: 'Hinterlegt',
        noCard: 'Nicht hinterlegt',
        addCard: 'Zahlungsmethode hinzufügen',
        noCardWarning: 'Noch keine Zahlungsmethode. Ohne sie endet der Zugang am {date}.',
        trialNotice: 'In den ersten {days} Tagen wird nichts abgebucht. Die erste Abbuchung erfolgt am {date} über {price}, danach monatlich – bis Sie kündigen.',
        cancelBeforeCharge: 'Vor der Abbuchung kündigen',
        cancelTrialConfirm: 'Abo kündigen? Es wird nichts abgebucht, und der Zugang bleibt bis zum Ende der Testphase.',
        resume: 'Abo fortsetzen',
        resumed: 'Abo fortgesetzt',
        priceMonthly: '{amount} ILS / Monat', priceAmount: '{amount} ILS',
        updateFailed: 'Aktualisierung fehlgeschlagen', cancelFailed: 'Kündigung fehlgeschlagen',
        title: 'Ihr Abonnement', status: 'Status', plan: 'Tarif', validUntil: 'Gültig bis',
        activeStaff: 'Aktives Team', of: '{count} von {max}', unlimited: '{count} (unbegrenzt)',
        plans: 'Tarife', choose: 'Auswählen', currentPlan: 'Aktueller Tarif',
        tooSmall: 'Zu klein für {count} Mitarbeiter', cancel: 'Abonnement kündigen',
        cancelConfirm: 'Abonnement kündigen? Der Zugang endet mit dem bezahlten Zeitraum.',
        planUpdated: 'Tarif aktualisiert', canceled: 'Abonnement gekündigt',
        ownerOnly: 'Nur der Kontoinhaber kann das Abonnement ändern.',
        perMonth: 'pro Monat',
        statusTrial: 'Testphase', statusActive: 'Aktiv', statusPastDue: 'Zahlung fehlgeschlagen',
        statusCanceled: 'Gekündigt', statusExpired: 'Abgelaufen'
      },

      auth: {
        wait: 'Einen Moment…',
        notifyEnabled: 'Benachrichtigungen sind aktiv',
        notifyBody: 'Wir informieren Sie über Änderungen am Dienstplan.',
        signIn: 'Anmelden', signUp: 'Firmenkonto erstellen',
        email: 'E-Mail', password: 'Passwort', name: 'Ihr Name', companyName: 'Firmenname',
        passwordHint: 'Mindestens 6 Zeichen',
        enter: 'Anmelden', create: 'Konto erstellen', signingIn: 'Anmelden…', creating: 'Wird erstellt…',
        trialNote: '{days} Tage kostenlos. Die erste Abbuchung erfolgt am {date}; kündigen Sie vorher, zahlen Sie nichts.',
        signOut: 'Abmelden', blocked: 'Zugang gesperrt',
        blockedOwner: 'Wenden Sie sich an den Support, um das Abonnement zu aktivieren.',
        blockedMember: 'Bitten Sie den Kontoinhaber, das Abonnement zu verlängern.',
        enableNotifications: 'Benachrichtigungen aktivieren',
        failedSignIn: 'Anmeldung fehlgeschlagen', failedSignUp: 'Registrierung fehlgeschlagen'
      },

      users: {
        nameColumn: 'Name', emailColumn: 'E-Mail', createFailed: 'Benutzer konnte nicht erstellt werden',
        title: 'Benutzer',
        hint: 'Jede Person kann einen eigenen Zugang bekommen. Sie sieht nur ihre eigenen Schichten und reicht eigene Wünsche ein – ' +
          'den vollständigen Plan sieht sie nicht und ändern kann sie nichts. Führungskräfte sehen und bearbeiten alles. ' +
          'Verknüpfen Sie einen Benutzer mit einer Mitarbeiterkarte, damit er seine Schichten sieht.',
        add: 'Benutzer hinzufügen', createUser: 'Benutzer anlegen',
        role: 'Rolle', staffCard: 'Mitarbeiterkarte', none: 'Keine', noLink: 'Keine Verknüpfung',
        initialPassword: 'Erstes Passwort', activeColumn: 'Aktiv',
        created: 'Benutzer für {email} angelegt', updated: 'Gespeichert', updateFailed: 'Aktualisierung fehlgeschlagen'
      },

      access: {
        trialWithCard: 'Testphase – noch {days} Tage. Erste Abbuchung am {date}, {price}.',
        trialNoCard: 'Testphase – noch {days} Tage. Fügen Sie eine Zahlungsmethode hinzu, um nach dem {date} weiterzuarbeiten.',
        trialEndedNoCard: 'Die Testphase ist beendet. Fügen Sie eine Zahlungsmethode hinzu, um fortzufahren.',
        trialCanceled: 'Gekündigt – es wird nichts abgebucht. Der Zugang bleibt bis zum {date}.',
        canceledAtPeriodEnd: 'Gekündigt. Der Zugang bleibt bis zum {date}, weitere Abbuchungen erfolgen nicht.',
        charging: 'Die Testphase ist beendet und die erste Abbuchung wird verarbeitet.',
        noCompany: 'Keine Firma gefunden',
        expired: 'Das Abonnement ist abgelaufen. Verlängern Sie es, um fortzufahren.',
        pastDueBlocked: 'Die Zahlung ist nicht eingegangen und der Zugang ist gesperrt. Bitte aktualisieren Sie die Zahlungsdaten.',
        pastDue: 'Die letzte Zahlung ist fehlgeschlagen. Der Zugang wird in {days} Tagen gesperrt.',
        expiredKept: 'Das Abonnement ist abgelaufen und wurde nicht verlängert. Mit der Wahl eines Tarifs ist der Zugang sofort wieder da, Ihre Daten bleiben erhalten.',
        canceled: 'Das Abonnement wurde gekündigt. Sie können jederzeit verlängern – Ihre Daten bleiben erhalten.',
        inactive: 'Das Abonnement ist nicht aktiv.',
        overLimit: 'Der Tarif {plan} deckt bis zu {max} Mitarbeiter ab. Sie haben {count} – nötig ist der Tarif {suggested} ({range}, {price}).'
      },

      plans: {
        starter: 'Klein', growth: 'Mittel', business: 'Groß',
        upTo: 'Bis zu {count} Mitarbeiter',
        between: '{from} bis {to} Mitarbeiter',
        from: 'Ab {count} Mitarbeitern'
      },

      roles: { owner: 'Inhaber', manager: 'Führungskraft', employee: 'Mitarbeiter' },

      employee: {
        prevWeek: '◀ Vorherige Woche', nextWeek: 'Nächste Woche ▶',
        loadFailed: 'Die Daten konnten nicht geladen werden: {message}',
        saveFailed: 'Speichern fehlgeschlagen', reasonSaveFailed: 'Der Grund konnte nicht gespeichert werden',
        myShifts: 'Meine Schichten', myRequests: 'Meine Wünsche',
        notPublished: 'Der Plan für diese Woche ist noch nicht veröffentlicht.',
        noShifts: 'Sie haben diese Woche keine Schichten.',
        totalWeek: '{count} Schichten diese Woche.',
        deadlineOpen: 'Die Wünsche für diese Woche schließen am {day}, {date} um {time}.',
        deadlineHours: 'Die Wünsche schließen in {hours} Stunden. Danach ist keine Änderung mehr möglich.',
        deadlineClosed: 'Die Wünsche für diese Woche sind geschlossen. Hat sich etwas geändert, sprechen Sie mit der Leitung.',
        deadlineLocked: 'Die Wünsche für diese Woche sind geschlossen.',
        publishedLocked: 'Der Plan ist veröffentlicht – Wünsche für diese Woche können nicht mehr geändert werden.',
        notLinked: 'Ihr Benutzer ist noch nicht mit einer Mitarbeiterkarte verknüpft. Bitte wenden Sie sich an Ihre Führungskraft.',
        noShiftsToday: 'An diesem Tag keine Schichten', holidayNoWork: 'Feiertag – keine Arbeit'
      },

      chat: {
        title: 'Fragen zu diesem Plan',
        hint: 'Fragen Sie zur angezeigten Woche – zum Beispiel „Wer arbeitet Dienstagabend?“, ' +
          '„Warum ist Mitarbeiter 3 am Donnerstag nicht eingeteilt?“ oder „Wer kann Mitarbeiter 5 am Mittwoch vertreten?“',
        placeholder: 'Frage zum Dienstplan…', send: 'Senden'
      },

      excel: {
        availabilityNone: 'Nichts mehr übrig – diese Woche lassen sich keine weiteren Schichten vergeben',
        availabilityLeft: '{verb} {shifts} noch zu vergeben',
        spare: 'Restkontingent', required: 'Benötigt',
        valid: 'In Ordnung', checksTitle: 'Prüfungen des Plans',
        personalText: 'Text für WhatsApp',
        byBranch: 'Nach Filiale', byEmployee: 'Nach Mitarbeiter', availability: 'Verfügbarkeit',
        checks: 'Prüfungen', personal: 'Mein Plan',
        title: 'Dienstplan – Woche {from} bis {to}',
        viewBranch: 'Nach Filiale', viewEmployee: 'Nach Mitarbeiter',
        sabbathEnds: 'Schabbat-Ende {time}',
        day: 'Tag', date: 'Datum', branch: 'Filiale', shift: 'Schicht', hours: 'Zeiten',
        staff: 'Mitarbeiter', assigned: 'Eingeteilt', quota: 'Kontingent', left: 'Restkontingent',
        canAssign: 'Einteilbar', freeDays: 'Freie Tage', totalShifts: 'Schichten gesamt',
        severity: 'Schweregrad', type: 'Typ', detail: 'Details',
        missing: '— fehlt —', closed: 'Geschlossen', notAssigned: 'Nicht eingeteilt',
        personalTitle: 'Persönlicher Plan – {name}', totalWeek: '{count} Schichten diese Woche',
        noIssues: 'Keine Doppelbelegungen, Lücken oder verletzten Wünsche'
      },

      errors: {
        invalidTime: 'Ungültige Zeit – verwenden Sie das 24-Stunden-Format, zum Beispiel 09:30',
        emptyShiftName: 'Der Name der Schicht darf nicht leer sein',
        lastShift: 'Mindestens eine Schicht muss bleiben',
        notSaved: 'Speichern fehlgeschlagen', copied: 'In die Zwischenablage kopiert',
        viewOnlyBlocked: 'Nur Ansicht – Bearbeiten ist deaktiviert. Sie können es oben auf dem Bildschirm ausschalten.',
        duplicatePerson: 'Dieselbe Person kann nicht zweimal in einer Schicht stehen',
        printBlocked: 'Drucken ist hier gesperrt – nutzen Sie „Als Text kopieren“ oder den Excel-Export',
        chooseEmployee: 'Wählen Sie eine Person für den persönlichen Export'
      },

      common: {
        emailUs: 'Schreiben Sie uns',
        moveUp: 'Nach oben', moveDown: 'Nach unten', timePlaceholder: 'hh:mm',
        save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', close: 'Schließen',
        yes: 'Ja', no: 'Nein', all: 'Alle', and: 'und', more: 'und {count} weitere'
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
