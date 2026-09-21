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

      landing: {
        signIn: 'Sign in', start: 'Start free', startLong: 'Start free – {days} days',
        heroBadge: 'Built for chains with more than one branch',
        heroTitle: 'Every shift covered. No double bookings.',
        heroSubtitle: 'Build a week of shifts across all your branches in one click. ' +
          'The system honours every time-off request, spots double bookings and gaps before your staff do, ' +
          'and tells you exactly why a shift could not be filled.',
        heroNote: 'No credit card. Works on a computer, and installs on a phone like an app.',
        heroSecondary: 'See how it works',

        problemsTitle: 'The three things that go wrong every week',
        problem1Title: 'The same shift, two people',
        problem1Body: 'A branch ends up double-staffed while another runs short. ' +
          'You only find out when someone shows up and has nothing to do.',
        problem2Title: 'Requests get lost',
        problem2Body: 'A day-off request arrives by message, gets forgotten, and the schedule breaks a promise you made.',
        problem3Title: 'Gaps you cannot explain',
        problem3Body: 'A shift stays empty and nobody knows whether it is really impossible or just an oversight.',

        featuresTitle: 'What the system does',
        featuresSubtitle: 'Not a spreadsheet with colours. A scheduler that knows your rules.',
        feature1Title: 'Automatic scheduling',
        feature1Body: 'One click fills the whole week across every branch, balancing the load fairly and respecting each person’s weekly limit.',
        feature2Title: 'Double-booking detection',
        feature2Body: 'Every double booking, gap and broken request is flagged the moment it appears – with the reason and a suggested fix.',
        feature3Title: 'Requests with approval',
        feature3Body: 'Staff send their own requests with an optional reason. Nothing affects the schedule until you approve it.',
        feature4Title: 'Your shifts, your hours',
        feature4Body: 'Morning, midday, evening, night – define as many shifts as your business runs, with your own hours and colours per branch.',
        feature5Title: 'Excel and WhatsApp',
        feature5Body: 'Export the whole week, or send each person only their own shifts – as a personal sheet or ready-to-paste text.',
        feature6Title: 'Live on every device',
        feature6Body: 'Manager edits on a computer, staff see their shifts on their phone. Everyone sees the same schedule, instantly.',

        howTitle: 'Up and running in an afternoon',
        how1Title: 'Add branches and staff',
        how1Body: 'Opening days, hours and headcount per shift – each branch set up its own way.',
        how2Title: 'Collect the requests',
        how2Body: 'Staff log in and send time-off requests. You approve or decline, and see everything in one place.',
        how3Title: 'Build and publish',
        how3Body: 'One click builds the week. Review the alerts, fix what matters, publish – and everyone sees their shifts.',

        pricingTitle: 'Simple pricing, by team size',
        pricingSubtitle: 'Unlimited branches on every plan. Cancel any time.',
        pricingCta: 'Start free',
        pricingNote: 'All prices in ILS, per month, VAT not included. {days} days free on every plan – no payment details needed.',
        planPopular: 'Most popular',

        faqTitle: 'Questions',
        faq1Q: 'Do I need to install anything?',
        faq1A: 'No. The system runs in the browser. On a phone you can add it to the home screen and it opens like an app, full screen.',
        faq2Q: 'Can my staff see each other’s shifts?',
        faq2A: 'No. Each person sees only their own shifts and their own requests. Only managers see the full schedule.',
        faq3Q: 'What if a shift cannot be filled?',
        faq3A: 'The system tells you exactly why – who is at their weekly limit, who already works that day, who needs rest between shifts – and what to change.',
        faq4Q: 'Is my data safe if I stop paying?',
        faq4A: 'Yes. Your data is kept. Choosing a plan again restores access immediately, with everything where you left it.',
        faq5Q: 'Which languages are supported?',
        faq5A: 'Hebrew, English, Spanish, French, German, Portuguese, Russian and Arabic – including right-to-left layouts. Each person picks their own.',

        ctaTitle: 'Try it on next week’s schedule',
        ctaBody: 'Set up your branches, build one week, and see the difference. It takes an afternoon.',
        footerRights: 'All rights reserved.',
        footerTagline: 'Shift scheduling for chains.'
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
        demoTitle: 'Demo mode',
        demoBody: 'Data is saved in this browser only and does not move between devices.',
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
        until: 'until {time}', sheet: 'Sheet {n}',
        fileSaved: 'File saved', fileFailed: 'Could not save the file: {message}',
        unknownError: 'unknown error', downloadUnavailable: 'Downloading files is not available here',
        loadFailed: 'Loading data failed, defaults loaded', saveFailed: 'Saving data failed',
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

      server: {
        confirmEmail: 'Check your email and confirm the address, then sign in',
        credentialsRequired: 'Email and password are required',
        passwordTooShort: 'The password must be at least 6 characters',
        emailTaken: 'That email address is already registered',
        companyRequired: 'A company name is required',
        badCredentials: 'Wrong email or password',
        userInactive: 'This user is not active. Contact your company manager.',
        signInRequired: 'Please sign in',
        noPermission: 'You are not allowed to do that',
        notLinked: 'This user is not linked to a staff card',
        weekPublished: 'The schedule for this week is published, so requests can no longer be changed',
        weekPublishedShort: 'The schedule for this week is already published',
        noRequest: 'There is no request for that day',
        badDecision: 'Invalid decision',
        requestNotFound: 'Request not found',
        weekMissing: 'That week does not exist',
        userNotFound: 'User not found',
        cannotChangeOwner: 'The account owner cannot be changed'
      },

      notify: {
        published: 'Schedule published',
        publishedBody: 'The schedule for the new week is ready. You can see your shifts.',
        requestApproved: 'Your request was approved',
        requestApprovedBody: 'Your request for {day} was approved.',
        requestRejected: 'Your request was declined',
        requestRejectedBody: 'Your request for {day} was declined',
        newRequest: 'New request',
        newRequestBody: 'Someone sent a request that is waiting for your approval.',
        newRequestsBody: '{count} new requests are waiting for your approval.'
      },

      payments: {
        mockProvider: 'Test provider (development)',
        mockNote: 'Payment is approved immediately with no real charge. For development and demos only.',
        unknownPlan: 'Unknown plan',
        serverProvider: 'Server billing ({name})',
        notConfigured: 'Billing is not configured in this environment',
        requestFailed: 'The billing request failed ({status})'
      },

      billing: {
        priceMonthly: '{amount} ILS / month', priceAmount: '{amount} ILS',
        updateFailed: 'Update failed', cancelFailed: 'Cancelling failed',
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
        wait: 'One moment…',
        notifyEnabled: 'Notifications are on',
        notifyBody: 'We will let you know about schedule updates.',
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
        nameColumn: 'Name', emailColumn: 'Email', createFailed: 'Could not create the user',
        title: 'Users',
        hint: 'Every person can have their own login. They see only their own shifts and submit their own requests – ' +
          'they cannot see the full schedule or change anything. Managers see and edit everything. ' +
          'Link a user to a staff card so they can see their shifts.',
        add: 'Add a user', createUser: 'Create user',
        role: 'Role', staffCard: 'Staff card', none: 'None', noLink: 'No link',
        initialPassword: 'Initial password', activeColumn: 'Active',
        created: 'User created for {email}', updated: 'Saved', updateFailed: 'Update failed'
      },

      access: {
        noCompany: 'No company found',
        trialEnded: 'The trial has ended. Activate a subscription to continue.',
        trial: 'Trial – {days} days left.',
        expired: 'The subscription has expired. Renew to continue.',
        pastDueBlocked: 'Payment was not received and access is blocked. Please update the payment method.',
        pastDue: 'The last payment did not go through. Access will be blocked in {days} days.',
        expiredKept: 'The subscription expired and was not renewed. Choosing a plan restores access immediately, and your data is safe.',
        canceled: 'The subscription was cancelled. You can renew at any time – your data is safe.',
        inactive: 'The subscription is not active.',
        overLimit: 'The {plan} plan covers up to {max} staff. You have {count} – the {suggested} plan is needed ({range}, {price}).'
      },

      plans: {
        starter: 'Small', growth: 'Medium', business: 'Large',
        upTo: 'Up to {count} staff',
        between: '{from} to {to} staff',
        from: '{count} staff and up'
      },

      roles: { owner: 'Owner', manager: 'Manager', employee: 'Staff' },

      employee: {
        prevWeek: '▶ Previous week', nextWeek: 'Next week ◀',
        loadFailed: 'Could not load the data: {message}',
        saveFailed: 'Saving failed', reasonSaveFailed: 'Could not save the reason',
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
