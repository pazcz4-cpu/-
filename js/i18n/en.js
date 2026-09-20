/* English — the base language. Every key lives here first;
   other languages fall back to it when a key is missing. */
(function (root) {
  'use strict';

  root.I18n.register({
    code: 'en',
    name: 'English',
    dir: 'ltr',
    locale: 'en-GB',
    weekStart: 1,
    currency: { code: 'ILS', symbol: '₪', position: 'after' },
    dict: {
      app: {
        title: 'Shift Scheduler',
        subtitle: 'Weekly staffing for every branch, with double-booking and gap detection',
        language: 'Language'
      },

      days: {
        0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
        4: 'Thursday', 5: 'Friday', 6: 'Saturday'
      },
      daysShort: { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' },

      shifts: { morning: 'Morning', middle: 'Midday', evening: 'Evening', night: 'Night' },

      seed: {
        branchCenter: 'Central branch', branchNorth: 'North branch', branchSouth: 'South branch',
        employee: 'Team member {n}',
        noteFloater: 'Covers every branch', noteStudent: 'Student – no mornings'
      },

      colors: {
        0: 'Amber', 1: 'Green', 2: 'Blue', 3: 'Purple',
        4: 'Pink', 5: 'Teal', 6: 'Grey', 7: 'Brown'
      },

      tabs: {
        schedule: 'Schedule', constraints: 'Requests', employees: 'Staff',
        branches: 'Branches', users: 'Users', billing: 'Subscription', settings: 'Settings'
      },

      toolbar: {
        prevWeek: 'Previous week', nextWeek: 'Next week', thisWeek: 'This week',
        week: 'Week {from} – {to}', currentWeek: 'Current week',
        generate: 'Build schedule', clear: 'Clear schedule',
        keepManual: 'Keep manual assignments',
        copyText: 'Copy as text', excel: 'Excel', csv: 'CSV', print: 'Print',
        moreTools: 'More tools', closeTools: 'Close tools',
        viewOnly: 'View only', exitViewOnly: 'Exit view only',
        shabbatEnd: 'Sabbath ends',
        byBranch: 'By branch', byEmployee: 'By employee',
        personalExport: 'Personal export (their shifts only):',
        choosePerson: 'Choose a person…',
        holidays: 'Holidays (all branches closed):'
      },

      schedule: {
        branch: 'Branch', shift: 'Shift', employee: 'Employee', totalShifts: 'Total shifts',
        empty: '— empty —', add: '+ add', addPerson: '+ add person', notAssigned: '— not assigned —',
        closed: 'Closed on this day', noBranches: 'No active branches. Open the Branches tab.',
        required: 'Required: {count}', people: '{count} people',
        holidayClosed: 'All branches closed', dayOff: 'Day off', holiday: 'Holiday',
        missingSabbath: 'Sabbath end time missing'
      },

      status: {
        synced: 'Synced across devices', syncedAt: 'Synced across devices · updated {time}',
        localOnly: 'Saved on this device only', readOnly: 'View only – no edit permission',
        remoteUpdate: 'Update received from another device ({time})',
        localCopy: 'This is a local copy – data is stored in this browser only and does not sync. ' +
          'To work from two computers use the hosted version. To move data: export JSON in Settings, then import it there.',
        viewOnlyBanner: 'View only – the schedule is shown for review and editing is disabled. ' +
          'Export, printing and week navigation still work.'
      },

      levels: { error: 'Error', warning: 'Warning', info: 'Note' },

      marks: {
        dayOff: 'day off', blocked: 'blocked', prefers: 'prefers',
        notInBranch: 'not in this branch', notInShift: 'not in this shift',
        alreadyAssigned: 'already assigned', inactive: 'inactive'
      },

      issueTypes: {
        'duplicate-shift': 'Double booking',
        'duplicate-employee-slot': 'Double booking',
        'double-booked': 'Two shifts in one day',
        understaffed: 'Understaffed',
        'constraint-off': 'Request broken',
        'constraint-blocked': 'Request broken',
        'branch-mismatch': 'Wrong branch',
        'shift-mismatch': 'Wrong shift type',
        'over-max': 'Over limit',
        rest: 'Short rest',
        'no-shifts': 'No shifts',
        'missing-shabbat-end': 'Sabbath end time missing',
        'inactive-slot': 'Shift not open',
        'pending-constraints': 'Requests waiting',
        'extra-days-off': 'Too many days off',
        'below-target': 'Below target'
      },

      toast: {
        generated: 'Schedule built – {shifts} still unassigned',
        generatedFull: 'Schedule built – every shift is covered',
        clearWeekConfirm: 'Clear every assignment for this week? Requests are kept.',
        cleared: 'Schedule cleared',
        copied: 'Schedule copied to clipboard',
        personalCopied: 'Personal schedule copied to clipboard',
        viewOnlyOn: 'View only is on – editing is disabled',
        viewOnlyOff: 'View only is off – you can edit',
        copyPrompt: 'Copy the text:',
        holidayCleared: '{day} is a working day again',
        holidayPrompt: 'Name of the holiday on {day} (branches close and the day counts as time off for everyone):',
        holidayDefault: 'Holiday',
        holidayHasAssignments: '{count} people are already assigned that day. Mark it as a holiday and clear them?',
        holidayMarked: '{day} is marked as a holiday – branches are closed',
        clearConstraintsConfirm: 'Clear every request for this week?',
        constraintsCleared: 'Requests cleared',
        noPreviousConstraints: 'No requests in the previous week',
        constraintsCopied: 'Requests copied from the previous week',
        requestApproved: 'Request approved', requestRejected: 'Request rejected',
        updateFailed: 'Update failed',
        deleteShiftConfirm: 'Delete the shift "{name}"?\n\n{usage}',
        deleteShiftUsed: 'It is set on {count} branch-days, and all of its assignments will be deleted.',
        deleteShiftUnused: 'It is not used by any branch.',
        shiftDeleted: 'Shift deleted{removed}',
        shiftRemovedCount: ' ({count} assignments removed)',
        shiftAdded: 'Shift added. Set it up in Branches so it shows in the schedule.',
        newShift: 'Shift {n}',
        applyHoursConfirm: 'Apply the default hours to all {count} branches, Sunday to Thursday?\n\n' +
          'Open days and headcount stay as they are. Friday and Saturday night are not changed.',
        hoursUpdated: 'Hours updated on {count} shifts',
        hoursAlready: 'Every shift already uses these hours',
        imported: 'Data imported',
        importedCloud: 'Data imported and uploaded to the cloud ({count} weeks)',
        importFailed: 'Invalid file: {message}',
        resetConfirm: 'Reset all data (staff, branches, schedules and requests) to the defaults?',
        reset: 'Data reset'
      },

      ui: {
        iconLetters: 'SH',
        dayHeading: '{day} ({date})',
        missingStaff: 'understaffed',
        holidayClosedLine: '{name} – all branches closed',
        spareLine: '— {verb} {shifts} still to assign —',
        unknownBranch: 'Unknown branch', unknownEmployee: 'Unknown person',
        weekLabel: 'Week {from} – {to}', constraintsWeek: 'Requests · {label}',
        holidayAllClosed: 'All branches closed – a day off for everyone',
        holidayNoRequests: 'Holiday – no requests needed',
        branchClosedToday: 'Closed on this day',
        noActiveBranches: 'No active branches.',
        noActiveBranchesTab: 'No active branches. Open the Branches tab.',
        allClosedOn: 'All branches are closed on {day}.',
        branchesClosed: 'Branches closed',
        noHours: 'No hours',
        outOf: '{done} of {total}',
        cloudSaved: 'Data is saved in the cloud and updates on every computer open on this link',
        deviceSaved: 'Data is saved only in this browser',
        thinking: 'Thinking…',
        noAnswer: '(no answer received)',
        chatBlocked: 'You are not allowed to ask questions on this page.',
        chatRateLimited: 'Too many questions at once – try again in a moment.',
        chatFailed: 'I could not answer right now',
        chatSystem: 'You help a manager run a shift schedule. Answer in {language}, short and to the point, ' +
          'and rely only on the data below. If something is missing, say so instead of guessing.',
        chatDataStart: '=== week data ===',
        chatDataEnd: '=== end of data ===',
        chatQuestion: 'Question: ',
        summaryShabbat: 'Sabbath ends: {time}',
        summaryHolidays: 'Holidays closed: {days}', summaryNoHolidays: 'No holidays this week.',
        summaryRules: 'Scheduling rules:',
        ruleOnePerDayOn: 'A person works at most one shift per day.',
        ruleOnePerDayOff: 'A person may work several shifts a day.',
        ruleRestOn: 'No morning shift after an evening shift the day before.',
        ruleRestOff: 'No rest requirement between an evening and a morning shift.',
        summaryBranches: 'Branches:', summaryEmployees: 'Staff:',
        summaryCurrent: 'Current schedule:', summaryAvailability: 'Availability left:',
        summaryIssues: 'Schedule alerts:', summaryNoIssues: 'No alerts – the schedule is valid.',
        closedAllWeek: 'closed all week', allBranches: 'all branches',
        peopleCount: '{count} people',
        empBranches: 'branches', empShifts: 'shifts', empMax: 'maximum {count} per week',
        empAskedOff: 'asked off', empBlocked: 'blocked', empNote: 'note',
        empAssignedOf: '{name}: assigned {total} of a quota of {max}',
        empFreeDays: 'free days: {days}', none: 'none',
        fileName: 'schedule', personalFileName: 'schedule-{name}',
        greeting: 'Hi {name}, here is your schedule:',
        shortTitle: 'Shifts'
      },

      alerts: {
        slotLabel: '{day} · {branch} · {shift} shift',
        deletedEmployee: '(deleted person: {id})',
        deletedBranch: '(deleted branch)',
        errorsOne: 'One error', errorsOther: '{count} errors',
        warningsOne: 'One warning', warningsOther: '{count} warnings',
        infosOne: 'One note', infosOther: '{count} notes',
        allGood: '✔ Schedule is valid – no double bookings, gaps or broken requests',
        showAll: 'Show all {count} alerts', showLess: 'Hide alerts',
        duplicate: 'Double booking: {label} – {count} people assigned ({names}) instead of {need}.',
        duplicateSelf: 'Double booking: {name} is assigned twice to the same shift – {label}.',
        doubleBooked: 'Double booking: {name} is assigned to {count} shifts on {day}{where} ({detail}).',
        sameBranch: ' at the same branch', differentBranches: ' at different branches',
        understaffed: 'Understaffed: {label} – {assigned} of {need} assigned.',
        reasonBusy: '{names} are already assigned to another shift that day',
        reasonMaxed: '{names} reached their weekly shift limit',
        reasonResting: '{names} need rest between an evening and a morning shift',
        reasonNone: 'No one is set up for both this branch and this shift, or everyone blocked it.',
        reasonFree: 'These people are free ({names}) – try building the schedule again.',
        reasonPrefix: 'Reason: ',
        suggestTwoPerDay: ' You can allow two shifts per day per person in Settings.',
        suggestRaiseMax: ' You can raise the weekly limit on the staff card.',
        constraintOff: 'Request broken: {name} asked for {day} off but is assigned to {shift} at {branch}.',
        constraintBlocked: 'Request broken: {name} blocked {shift} on {day} but is assigned to it at {branch}.',
        branchMismatch: '{name} is assigned to {branch} on {day} although that branch is not on their card.',
        shiftMismatch: '{name} is assigned to {shift} on {day} although that shift type is not on their card.',
        overMax: 'Over limit: {name} is assigned {total} shifts (maximum {max}).',
        noShifts: '{name} has no shifts this week.',
        rest: 'Short rest: {name} finishes an evening on {previous} and starts a morning on {day}.',
        holidayAssignment: 'Assigned on a holiday: {day} ({name}) is marked closed, but {names} are assigned.',
        inactiveSlot: 'Assigned to a shift that is not open: {day} · {branch} · {shift} ({names}).',
        missingSabbath: 'No Sabbath end time for this week – the start time of Saturday-night shifts cannot be calculated.',
        pendingOne: 'A request is waiting for approval: {name} ({day}). It does not affect the schedule until approved.',
        pendingOther: '{count} requests are waiting for approval: {names}. They do not affect the schedule until approved.',
        extraDaysOff: '{name} asked for {count} days off ({days}) – the policy allows one day off per week.',
        belowTarget: '{name} asked for {day} off and is assigned {total} of {expected} possible shifts – they still have free days.'
      },

      availability: {
        title: 'What is still available',
        none: 'Nothing available – {reason}',
        reasonMaxed: 'everyone has reached their weekly shift limit.',
        reasonNoDays: 'the people with quota left have no free day when their branches are open.',
        totalOne: '{verb} one more shift to assign, across {people}:',
        totalOther: '{verb} {count} more shifts to assign, across {people}:',
        peopleOne: 'one person', peopleOther: '{count} people',
        left: '{verb} {shifts} left · free on {days}',
        leftNoDays: '{verb} {shifts} left, but no free day this week',
        full: 'fully used ({assigned} of {max})',
        noEmployees: 'No active staff.',
        shiftsOne: 'one shift', shiftsOther: '{count} shifts',
        remains: 'remains', remainPlural: 'remain'
      },

      constraints: {
        title: 'Requests for {week}',
        clear: 'Clear this week', copyPrevious: 'Copy from previous week',
        legend: 'Tap a shift to cycle: {free} → {preferred} → {blocked}. "Day off" blocks the whole day.',
        free: 'Available', preferred: 'Prefers', blocked: 'Cannot', dayOff: 'Day off',
        pendingTitle: 'Requests waiting for your approval ({count})',
        pendingHint: 'A request that is not approved does not affect the schedule.',
        approve: 'Approve', reject: 'Reject',
        approved: 'Approved', rejected: 'Rejected', pending: 'Waiting for approval',
        requestLabel: 'Request: {detail}', requestRejected: 'Request rejected',
        reason: 'Reason (optional)',
        reasonPlaceholder: 'e.g. wedding, exam, doctor appointment',
        reasonSaved: 'Reason saved', reasonGiven: 'Reason you gave: {text}',
        managerNote: 'Manager note: {text}',
        needsApproval: 'Every request goes to your manager and only affects the schedule once approved.',
        noChange: 'No change'
      },

      employees: {
        title: 'Staff', add: '+ Add person', active: 'Active',
        branchesLabel: 'Branches (none selected = all branches)',
        shiftTypes: 'Shift types they can work',
        maxShifts: 'Maximum shifts per week', note: 'Note',
        deleteConfirm: 'Delete {name}? Their assignments will be removed from every week.',
        inactive: '(inactive)', newName: 'New person'
      },

      branches: {
        title: 'Branches', add: '+ Add branch', active: 'Active', newName: 'New branch',
        hint: 'Each branch has its own days, hours and headcount per shift. ' +
          'Setting people to 0 closes that shift on that day. Assigning more than the number set is flagged as a double booking.',
        peopleLabel: 'People', closed: 'Closed', day: 'Day',
        copyFrom: 'Copy days and hours from another branch', chooseBranch: 'Choose a branch…',
        copyConfirm: 'Copy the days and hours from {from} to {to}?',
        copied: 'Days and hours copied',
        deleteConfirm: 'Delete {name}? Its assignments will be removed from every week.',
        autoSabbath: 'Follows Sabbath end', autoSabbathLabel: 'Sabbath end +30 min'
      },

      settings: {
        rules: 'Scheduling rules',
        onePerDay: 'A person works at most one shift per day',
        rest: 'No morning shift after an evening shift the day before',
        oneDayOff: 'A day marked off in Requests is the only day off that week',
        shiftTypes: 'Shift types',
        addShift: '+ Add shift', applyHours: 'Apply hours to all branches (Mon–Fri)',
        shiftsHint: 'Define how many shifts your business runs, their names, hours, colour and order. ' +
          'Hours here are the defaults; each branch can override them. ' +
          'The button updates existing branches without changing open days or headcount.',
        shiftNamePlaceholder: 'Shift name',
        sabbathTitle: 'Saturday night',
        sabbathDefault: 'Default Sabbath end time for a new week:',
        sabbathHint: 'You can set the real time each week at the top of the Schedule tab. ' +
          'Saturday-night shifts start half an hour later.',
        backup: 'Backup and restore',
        exportJson: 'Export all data (JSON)', importJson: 'Import data',
        reset: 'Reset to defaults',
        backupHint: 'Data is saved automatically in this browser. To move between computers, export a JSON file.',
        languageTitle: 'Language', languageHint: 'Changes the whole interface. Saved for this device.'
      },

      billing: {
        title: 'Your subscription', status: 'Status', plan: 'Plan', validUntil: 'Valid until',
        activeStaff: 'Active staff', of: '{count} of {max}', unlimited: '{count} (unlimited)',
        plans: 'Plans', choose: 'Choose', currentPlan: 'Current plan',
        tooSmall: 'Too small for {count} staff', cancel: 'Cancel subscription',
        cancelConfirm: 'Cancel the subscription? Access ends when the paid period does.',
        planUpdated: 'Plan updated', canceled: 'Subscription canceled',
        ownerOnly: 'Only the account owner can change the subscription.',
        perMonth: 'per month',
        statusTrial: 'Trial', statusActive: 'Active', statusPastDue: 'Payment failed',
        statusCanceled: 'Canceled', statusExpired: 'Expired'
      },

      auth: {
        signIn: 'Sign in', signUp: 'Create a business account',
        email: 'Email', password: 'Password', name: 'Your name', companyName: 'Business name',
        passwordHint: 'At least 6 characters',
        enter: 'Sign in', create: 'Create account', signingIn: 'Signing in…', creating: 'Creating…',
        trialNote: '{days} days free. No payment details needed.',
        signOut: 'Sign out', blocked: 'Access blocked',
        blockedOwner: 'Contact support to activate the subscription.',
        blockedMember: 'Ask the account owner to renew the subscription.',
        enableNotifications: 'Enable notifications',
        failedSignIn: 'Sign-in failed', failedSignUp: 'Sign-up failed'
      },

      users: {
        title: 'Users',
        hint: 'Every person can have their own login. They see only their own shifts and submit their own requests – ' +
          'they cannot see the full schedule or change anything. Managers see and edit everything. ' +
          'Link a user to a staff card so they can see their shifts.',
        add: 'Add a user', createUser: 'Create user',
        role: 'Role', staffCard: 'Staff card', none: 'None', noLink: 'No link',
        initialPassword: 'Initial password', activeColumn: 'Active',
        created: 'User created for {email}', updated: 'Saved', updateFailed: 'Update failed'
      },

      plans: {
        upTo: 'Up to {count} staff',
        between: '{from} to {to} staff',
        from: '{count} staff and up'
      },

      roles: { owner: 'Owner', manager: 'Manager', employee: 'Staff' },

      employee: {
        myShifts: 'My shifts', myRequests: 'My requests',
        notPublished: 'The schedule for this week has not been published yet.',
        noShifts: 'You have no shifts this week.',
        totalWeek: '{count} shifts this week.',
        publishedLocked: 'The schedule is published – requests for this week can no longer be changed.',
        notLinked: 'Your user is not linked to a staff card yet. Please contact your manager.',
        noShiftsToday: 'No shifts on this day', holidayNoWork: 'Holiday – no work'
      },

      chat: {
        title: 'Questions about this schedule',
        hint: 'Ask about the week on screen – for example "who works Tuesday evening?", ' +
          '"why is Team member 3 not scheduled on Thursday?" or "who can cover for Team member 5 on Wednesday?"',
        placeholder: 'Ask about the schedule…', send: 'Send'
      },

      excel: {
        availabilityNone: 'Nothing left – no more shifts can be assigned this week',
        availabilityLeft: '{verb} {shifts} still to assign',
        spare: 'Left in quota', required: 'Required',
        valid: 'Valid', checksTitle: 'Schedule checks',
        personalText: 'Text for WhatsApp',
        byBranch: 'By branch', byEmployee: 'By employee', availability: 'Availability',
        checks: 'Checks', personal: 'My schedule',
        title: 'Work schedule – week {from} to {to}',
        viewBranch: 'By branch', viewEmployee: 'By employee',
        sabbathEnds: 'Sabbath ends {time}',
        day: 'Day', date: 'Date', branch: 'Branch', shift: 'Shift', hours: 'Hours',
        staff: 'Staff', assigned: 'Assigned', quota: 'Quota', left: 'Left in quota',
        canAssign: 'Can assign', freeDays: 'Free days', totalShifts: 'Total shifts',
        severity: 'Severity', type: 'Type', detail: 'Detail',
        missing: '— missing —', closed: 'Closed', notAssigned: 'Not assigned',
        personalTitle: 'Personal schedule – {name}', totalWeek: '{count} shifts this week',
        noIssues: 'No double bookings, gaps or broken requests'
      },

      errors: {
        invalidTime: 'Invalid time – use 24-hour format, for example 09:30',
        emptyShiftName: 'A shift name cannot be empty',
        lastShift: 'At least one shift must remain',
        notSaved: 'Save failed', copied: 'Copied to clipboard',
        viewOnlyBlocked: 'View only – editing is disabled. You can turn it off at the top of the screen.',
        duplicatePerson: 'The same person cannot appear twice in one shift',
        printBlocked: 'Printing is blocked here – use "Copy as text" or the Excel export',
        chooseEmployee: 'Choose a person for the personal export'
      },

      common: {
        moveUp: 'Move up', moveDown: 'Move down', timePlaceholder: 'hh:mm',
        save: 'Save', cancel: 'Cancel', delete: 'Delete', close: 'Close',
        yes: 'Yes', no: 'No', all: 'All', and: 'and', more: 'and {count} more'
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
