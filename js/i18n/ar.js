/* العربية */
(function (root) {
  'use strict';

  root.I18n.register({
    code: 'ar',
    name: 'العربية',
    dir: 'rtl',
    locale: 'ar',
    weekStart: 6,
    currency: { code: 'ILS', symbol: '₪', position: 'after' },
    dict: {
      app: {
        title: 'جدول المناوبات',
        subtitle: 'جدولة أسبوعية لكل فرع، مع كشف الازدواج والنقص في التغطية',
        language: 'اللغة'
      },

      days: {
        0: 'الأحد', 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء',
        4: 'الخميس', 5: 'الجمعة', 6: 'السبت'
      },
      daysShort: { 0: 'أحد', 1: 'إثن', 2: 'ثلا', 3: 'أرب', 4: 'خمي', 5: 'جمع', 6: 'سبت' },

      shifts: { morning: 'صباحية', middle: 'وسطى', evening: 'مسائية', night: 'ليلية' },

      seed: {
        branchCenter: 'الفرع المركزي', branchNorth: 'الفرع الشمالي', branchSouth: 'الفرع الجنوبي',
        employee: 'موظف {n}',
        noteFloater: 'يغطي جميع الفروع', noteStudent: 'طالب – بدون مناوبات صباحية'
      },

      colors: {
        0: 'كهرماني', 1: 'أخضر', 2: 'أزرق', 3: 'بنفسجي',
        4: 'وردي', 5: 'فيروزي', 6: 'رمادي', 7: 'بني'
      },

      tabs: {
        schedule: 'الجدول', constraints: 'الطلبات', employees: 'الموظفون',
        branches: 'الفروع', users: 'المستخدمون', billing: 'الاشتراك', settings: 'الإعدادات'
      },

      toolbar: {
        prevWeek: 'الأسبوع السابق', nextWeek: 'الأسبوع التالي', thisWeek: 'هذا الأسبوع',
        week: 'أسبوع {from} – {to}', currentWeek: 'الأسبوع الحالي',
        generate: 'إنشاء الجدول', clear: 'تفريغ الجدول',
        keepManual: 'الإبقاء على التعيينات اليدوية',
        copyText: 'نسخ كنص', excel: 'إكسل', csv: 'CSV', print: 'طباعة',
        moreTools: 'أدوات إضافية', closeTools: 'إغلاق الأدوات',
        viewOnly: 'وضع العرض فقط', exitViewOnly: 'الخروج من وضع العرض',
        shabbatEnd: 'خروج السبت',
        byBranch: 'حسب الفرع', byEmployee: 'حسب الموظف',
        personalExport: 'تصدير شخصي (مناوباته فقط):',
        choosePerson: 'اختر موظفًا…',
        holidays: 'أيام العطل (جميع الفروع مغلقة):'
      },

      schedule: {
        branch: 'الفرع', shift: 'المناوبة', employee: 'الموظف', totalShifts: 'إجمالي المناوبات',
        empty: '— فارغ —', add: '+ إضافة', addPerson: '+ إضافة موظف', notAssigned: '— غير معيَّن —',
        closed: 'مغلق في هذا اليوم', noBranches: 'لا توجد فروع نشطة. افتح تبويب الفروع.',
        required: 'المطلوب: {count}', people: '{count} موظفين',
        holidayClosed: 'جميع الفروع مغلقة', dayOff: 'يوم إجازة', holiday: 'عطلة',
        missingSabbath: 'وقت خروج السبت غير محدد'
      },

      status: {
        demoTitle: 'وضع العرض التجريبي',
        demoBody: 'البيانات محفوظة في هذا المتصفح فقط ولا تنتقل بين الأجهزة.',
        synced: 'متزامن بين الأجهزة', syncedAt: 'متزامن بين الأجهزة · آخر تحديث {time}',
        localOnly: 'محفوظ على هذا الجهاز فقط', readOnly: 'عرض فقط – لا صلاحية للتعديل',
        remoteUpdate: 'وصل تحديث من جهاز آخر ({time})',
        localCopy: 'هذه نسخة محلية – البيانات محفوظة في هذا المتصفح فقط ولا تتزامن. ' +
          'للعمل من جهازين استخدم النسخة المستضافة. لنقل البيانات: صدّر ملف JSON من الإعدادات ثم استورده هناك.',
        viewOnlyBanner: 'وضع العرض فقط – الجدول معروض للمراجعة والتعديل معطّل. ' +
          'التصدير والطباعة والتنقل بين الأسابيع تعمل كالمعتاد.'
      },

      levels: { error: 'خطأ', warning: 'تنبيه', info: 'ملاحظة' },

      marks: {
        dayOff: 'إجازة', blocked: 'محجوب', prefers: 'يفضّل',
        notInBranch: 'ليس في هذا الفرع', notInShift: 'ليس في هذه المناوبة',
        alreadyAssigned: 'معيَّن مسبقًا', inactive: 'غير نشط'
      },

      issueTypes: {
        'duplicate-shift': 'ازدواج مناوبة',
        'duplicate-employee-slot': 'ازدواج مناوبة',
        'double-booked': 'مناوبتان في يوم واحد',
        understaffed: 'نقص في التغطية',
        'constraint-off': 'مخالفة طلب',
        'constraint-blocked': 'مخالفة طلب',
        'branch-mismatch': 'فرع غير مناسب',
        'shift-mismatch': 'نوع مناوبة غير مناسب',
        'over-max': 'تجاوز الحد',
        rest: 'راحة قصيرة',
        'no-shifts': 'بدون مناوبات',
        'missing-shabbat-end': 'وقت خروج السبت غير محدد',
        'inactive-slot': 'مناوبة غير مفتوحة',
        'pending-constraints': 'طلبات بانتظار الموافقة',
        'extra-days-off': 'أيام إجازة أكثر من اللازم',
        'below-target': 'أقل من الهدف'
      },

      toast: {
        generated: 'تم إنشاء الجدول – {shifts} بلا تغطية',
        generatedFull: 'تم إنشاء الجدول – جميع المناوبات مغطاة',
        clearWeekConfirm: 'هل تريد تفريغ كل تعيينات هذا الأسبوع؟ الطلبات ستبقى محفوظة.',
        cleared: 'تم تفريغ الجدول',
        copied: 'تم نسخ الجدول إلى الحافظة',
        personalCopied: 'تم نسخ الجدول الشخصي إلى الحافظة',
        viewOnlyOn: 'تم تفعيل وضع العرض – التعديل معطّل',
        viewOnlyOff: 'تم إيقاف وضع العرض – يمكنك التعديل',
        copyPrompt: 'انسخ النص:',
        holidayCleared: 'عاد {day} يوم عمل',
        holidayPrompt: 'اسم العطلة في {day} (ستُغلق الفروع ويُحتسب اليوم إجازة للجميع):',
        holidayDefault: 'عطلة',
        holidayHasAssignments: 'يوجد {count} موظفين معيَّنين في هذا اليوم. هل نعلّمه كعطلة ونلغي التعيينات؟',
        holidayMarked: 'تم تعليم {day} كعطلة – الفروع مغلقة',
        clearConstraintsConfirm: 'هل تريد مسح كل طلبات هذا الأسبوع؟',
        constraintsCleared: 'تم مسح الطلبات',
        noPreviousConstraints: 'لا توجد طلبات في الأسبوع السابق',
        constraintsCopied: 'تم نسخ الطلبات من الأسبوع السابق',
        requestApproved: 'تمت الموافقة على الطلب', requestRejected: 'تم رفض الطلب',
        updateFailed: 'فشل التحديث',
        deleteShiftConfirm: 'هل تريد حذف المناوبة "{name}"؟\n\n{usage}',
        deleteShiftUsed: 'هي مُعرَّفة في {count} أيام في الفروع، وستُحذف جميع تعييناتها.',
        deleteShiftUnused: 'غير مستخدمة في أي فرع.',
        shiftDeleted: 'تم حذف المناوبة{removed}',
        shiftRemovedCount: ' (تم حذف {count} تعيينات)',
        shiftAdded: 'تمت إضافة المناوبة. عرّفها في الفروع لتظهر في الجدول.',
        newShift: 'مناوبة {n}',
        applyHoursConfirm: 'هل تريد تطبيق الأوقات الافتراضية على {count} فروع، من الأحد إلى الخميس؟\n\n' +
          'أيام العمل وعدد الموظفين تبقى كما هي. الجمعة وليلة السبت لن تتغيّرا.',
        hoursUpdated: 'تم تحديث الأوقات في {count} مناوبات',
        hoursAlready: 'جميع المناوبات تستخدم هذه الأوقات بالفعل',
        imported: 'تم استيراد البيانات',
        importedCloud: 'تم استيراد البيانات ورفعها إلى السحابة ({count} أسابيع)',
        importFailed: 'ملف غير صالح: {message}',
        resetConfirm: 'هل تريد إعادة كل البيانات (الموظفون، الفروع، الجداول والطلبات) إلى الوضع الافتراضي؟',
        reset: 'تمت إعادة البيانات'
      },

      ui: {
        until: 'حتى {time}', sheet: 'ورقة {n}',
        fileSaved: 'تم حفظ الملف', fileFailed: 'تعذّر حفظ الملف: {message}',
        unknownError: 'خطأ غير معروف', downloadUnavailable: 'لا يمكن تنزيل الملفات هنا',
        loadFailed: 'فشل تحميل البيانات، تم تحميل الإعدادات الافتراضية',
        saveFailed: 'فشل حفظ البيانات',
        iconLetters: 'جم',
        dayHeading: '{day} ({date})',
        missingStaff: 'نقص في التغطية',
        holidayClosedLine: '{name} – جميع الفروع مغلقة',
        spareLine: '— {verb} {shifts} يمكن تعيينها —',
        unknownBranch: 'فرع غير معروف', unknownEmployee: 'موظف غير معروف',
        weekLabel: 'أسبوع {from} – {to}', constraintsWeek: 'طلبات · {label}',
        holidayAllClosed: 'جميع الفروع مغلقة – إجازة للجميع',
        holidayNoRequests: 'عطلة – لا حاجة للطلبات',
        branchClosedToday: 'الفرع مغلق في هذا اليوم',
        noActiveBranches: 'لا توجد فروع نشطة.',
        noActiveBranchesTab: 'لا توجد فروع نشطة. افتح تبويب الفروع.',
        allClosedOn: 'جميع الفروع مغلقة يوم {day}.',
        branchesClosed: 'الفروع مغلقة',
        noHours: 'بدون أوقات',
        outOf: '{done} من {total}',
        cloudSaved: 'البيانات محفوظة في السحابة وتتحدّث على كل جهاز مفتوح على هذا الرابط',
        deviceSaved: 'البيانات محفوظة في هذا المتصفح فقط',
        thinking: 'جارٍ التفكير…',
        noAnswer: '(لم يصل أي جواب)',
        chatBlocked: 'لا تملك صلاحية طرح الأسئلة في هذه الصفحة.',
        chatRateLimited: 'أسئلة كثيرة متتالية – حاول مرة أخرى بعد لحظة.',
        chatFailed: 'لم أتمكن من الإجابة الآن',
        chatSystem: 'أنت تساعد مديرًا في إدارة جدول مناوبات. أجب بـ{language}، باختصار ووضوح، ' +
          'واعتمد فقط على البيانات التالية. إن كانت معلومة ناقصة فقل ذلك صراحةً بدل التخمين.',
        chatDataStart: '=== بيانات الأسبوع ===',
        chatDataEnd: '=== نهاية البيانات ===',
        chatQuestion: 'السؤال: ',
        summaryShabbat: 'خروج السبت: {time}',
        summaryHolidays: 'أيام العطل المغلقة: {days}', summaryNoHolidays: 'لا توجد عطل هذا الأسبوع.',
        summaryRules: 'قواعد الجدولة:',
        ruleOnePerDayOn: 'يعمل الموظف مناوبة واحدة في اليوم كحد أقصى.',
        ruleOnePerDayOff: 'يمكن للموظف العمل في عدة مناوبات في اليوم.',
        ruleRestOn: 'لا مناوبة صباحية بعد مناوبة مسائية في اليوم السابق.',
        ruleRestOff: 'لا يوجد شرط راحة بين المناوبة المسائية والصباحية.',
        summaryBranches: 'الفروع:', summaryEmployees: 'الموظفون:',
        summaryCurrent: 'الجدول الحالي:', summaryAvailability: 'ما تبقّى من إتاحة:',
        summaryIssues: 'تنبيهات الجدول:', summaryNoIssues: 'لا توجد تنبيهات – الجدول سليم.',
        closedAllWeek: 'مغلق طوال الأسبوع', allBranches: 'جميع الفروع',
        peopleCount: '{count} موظفين',
        empBranches: 'الفروع', empShifts: 'المناوبات', empMax: 'بحد أقصى {count} أسبوعيًا',
        empAskedOff: 'طلب إجازة', empBlocked: 'حجب', empNote: 'ملاحظة',
        empAssignedOf: '{name}: معيَّن {total} من حصة {max}',
        empFreeDays: 'أيام متاحة: {days}', none: 'لا يوجد',
        fileName: 'الجدول', personalFileName: 'جدول-{name}',
        greeting: 'مرحبًا {name}، هذا جدولك:',
        shortTitle: 'مناوبات'
      },

      alerts: {
        slotLabel: '{day} · {branch} · مناوبة {shift}',
        deletedEmployee: '(موظف محذوف: {id})',
        deletedBranch: '(فرع محذوف)',
        errorsOne: 'خطأ واحد', errorsOther: '{count} أخطاء',
        warningsOne: 'تنبيه واحد', warningsOther: '{count} تنبيهات',
        infosOne: 'ملاحظة واحدة', infosOther: '{count} ملاحظات',
        allGood: '✔ الجدول سليم – لا ازدواج ولا نقص ولا مخالفة طلبات',
        showAll: 'عرض كل التنبيهات ({count})', showLess: 'إخفاء التنبيهات',
        duplicate: 'ازدواج مناوبة: {label} – معيَّن {count} موظفين ({names}) بدل {need}.',
        duplicateSelf: 'ازدواج مناوبة: {name} معيَّن مرتين في المناوبة نفسها – {label}.',
        doubleBooked: 'ازدواج مناوبة: {name} معيَّن في {count} مناوبات يوم {day}{where} ({detail}).',
        sameBranch: ' في الفرع نفسه', differentBranches: ' في فروع مختلفة',
        understaffed: 'نقص في التغطية: {label} – معيَّن {assigned} من {need}.',
        reasonBusy: '{names} معيَّنون في مناوبة أخرى في اليوم نفسه',
        reasonMaxed: '{names} بلغوا حدهم الأسبوعي من المناوبات',
        reasonResting: '{names} يحتاجون راحة بين المناوبة المسائية والصباحية',
        reasonNone: 'لا يوجد موظف معرَّف لهذا الفرع ولهذه المناوبة معًا، أو أن الجميع حجبوها.',
        reasonFree: 'هناك موظفون متاحون ({names}) – جرّب إنشاء الجدول من جديد.',
        reasonPrefix: 'السبب: ',
        suggestTwoPerDay: ' يمكنك السماح بمناوبتين في اليوم للموظف الواحد من الإعدادات.',
        suggestRaiseMax: ' يمكنك رفع الحد الأسبوعي في بطاقة الموظف.',
        constraintOff: 'مخالفة طلب: {name} طلب إجازة يوم {day} لكنه معيَّن في مناوبة {shift} في {branch}.',
        constraintBlocked: 'مخالفة طلب: {name} حجب مناوبة {shift} يوم {day} لكنه معيَّن فيها في {branch}.',
        branchMismatch: '{name} معيَّن في {branch} يوم {day} رغم أن هذا الفرع غير مُدرج في بطاقته.',
        shiftMismatch: '{name} معيَّن في مناوبة {shift} يوم {day} رغم أن هذا النوع غير مُدرج في بطاقته.',
        overMax: 'تجاوز الحد: {name} معيَّن في {total} مناوبات (الحد الأقصى {max}).',
        noShifts: '{name} بلا مناوبات هذا الأسبوع.',
        rest: 'راحة قصيرة: {name} ينهي مناوبة مسائية يوم {previous} ويبدأ مناوبة صباحية يوم {day}.',
        holidayAssignment: 'تعيين في يوم عطلة: {day} ({name}) معلَّم كيوم مغلق، لكن يوجد تعيينات لـ{names}.',
        inactiveSlot: 'تعيين في مناوبة غير مفتوحة: {day} · {branch} · {shift} ({names}).',
        missingSabbath: 'لم يُدخَل وقت خروج السبت لهذا الأسبوع – لا يمكن حساب بداية مناوبات ليلة السبت.',
        pendingOne: 'طلب بانتظار الموافقة: {name} ({day}). لا يؤثر على الجدول حتى الموافقة عليه.',
        pendingOther: '{count} طلبات بانتظار الموافقة: {names}. لا تؤثر على الجدول حتى الموافقة عليها.',
        extraDaysOff: '{name} طلب {count} أيام إجازة ({days}) – السياسة تسمح بيوم إجازة واحد أسبوعيًا.',
        belowTarget: '{name} طلب إجازة يوم {day} ومعيَّن في {total} من {expected} مناوبات ممكنة – ما زالت لديه أيام متاحة.'
      },

      availability: {
        title: 'ما تبقّى متاحًا',
        none: 'لا إتاحة متبقية – {reason}',
        reasonMaxed: 'جميع الموظفين بلغوا حدهم الأسبوعي من المناوبات.',
        reasonNoDays: 'من تبقّت لديهم حصة ليس لديهم يوم متاح تكون فروعهم فيه مفتوحة.',
        totalOne: '{verb} مناوبة إضافية يمكن تعيينها، لدى {people}:',
        totalOther: '{verb} {count} مناوبات إضافية يمكن تعيينها، لدى {people}:',
        peopleOne: 'موظف واحد', peopleOther: '{count} موظفين',
        left: '{verb} {shifts} من الحصة · متاح يوم {days}',
        leftNoDays: '{verb} {shifts} من الحصة، لكن لا يوجد يوم متاح هذا الأسبوع',
        full: 'استُهلكت الحصة بالكامل ({assigned} من {max})',
        noEmployees: 'لا يوجد موظفون نشطون.',
        shiftsOne: 'مناوبة واحدة', shiftsOther: '{count} مناوبات',
        remains: 'تبقّت', remainPlural: 'تبقّت'
      },

      constraints: {
        title: 'طلبات {week}',
        clear: 'مسح هذا الأسبوع', copyPrevious: 'نسخ من الأسبوع السابق',
        legend: 'اضغط على مناوبة للتبديل: {free} ← {preferred} ← {blocked}. «إجازة» تحجب اليوم كاملًا.',
        free: 'متاح', preferred: 'يفضّل', blocked: 'لا يستطيع', dayOff: 'إجازة',
        pendingTitle: 'طلبات بانتظار موافقتك ({count})',
        pendingHint: 'الطلب غير المعتمد لا يؤثر على الجدول.',
        approve: 'موافقة', reject: 'رفض',
        approved: 'مقبول', rejected: 'مرفوض', pending: 'بانتظار الموافقة',
        requestLabel: 'طلب: {detail}', requestRejected: 'تم رفض الطلب',
        reason: 'السبب (اختياري)',
        reasonPlaceholder: 'مثلًا: عرس، امتحان، موعد طبيب',
        reasonSaved: 'تم حفظ السبب', reasonGiven: 'السبب الذي ذكرته: {text}',
        managerNote: 'ملاحظة المدير: {text}',
        needsApproval: 'كل طلب يمر على المدير ولا يؤثر على الجدول إلا بعد الموافقة عليه.',
        noChange: 'بلا تغيير'
      },

      employees: {
        title: 'الموظفون', add: '+ إضافة موظف', active: 'نشط',
        branchesLabel: 'الفروع (بدون اختيار = كل الفروع)',
        shiftTypes: 'أنواع المناوبات الممكنة',
        maxShifts: 'الحد الأقصى للمناوبات أسبوعيًا', note: 'ملاحظة',
        deleteConfirm: 'هل تريد حذف {name}؟ ستُزال تعييناته من جميع الأسابيع.',
        inactive: '(غير نشط)', newName: 'موظف جديد'
      },

      branches: {
        title: 'الفروع', add: '+ إضافة فرع', active: 'نشط', newName: 'فرع جديد',
        hint: 'لكل فرع أيامه وأوقاته وعدد موظفيه في كل مناوبة. ' +
          'وضع 0 موظفين يغلق تلك المناوبة في ذلك اليوم. تعيين أكثر من العدد المحدد يُعلَّم كازدواج مناوبة.',
        peopleLabel: 'موظفون', closed: 'مغلق', day: 'اليوم',
        copyFrom: 'نسخ الأيام والأوقات من فرع آخر', chooseBranch: 'اختر فرعًا…',
        copyConfirm: 'هل تريد نسخ الأيام والأوقات من {from} إلى {to}؟',
        copied: 'تم نسخ الأيام والأوقات',
        deleteConfirm: 'هل تريد حذف {name}؟ ستُزال تعييناته من جميع الأسابيع.',
        autoSabbath: 'حسب خروج السبت', autoSabbathLabel: 'خروج السبت +30 دقيقة'
      },

      settings: {
        rules: 'قواعد الجدولة',
        onePerDay: 'يعمل الموظف مناوبة واحدة في اليوم كحد أقصى',
        rest: 'لا مناوبة صباحية بعد مناوبة مسائية في اليوم السابق',
        oneDayOff: 'اليوم المعلَّم كإجازة في الطلبات هو يوم الإجازة الوحيد في الأسبوع',
        shiftTypes: 'أنواع المناوبات',
        addShift: '+ إضافة مناوبة', applyHours: 'تطبيق الأوقات على كل الفروع (الاثنين–الجمعة)',
        shiftsHint: 'هنا تحدد عدد المناوبات في عملك وأسماءها وأوقاتها ولونها وترتيبها. ' +
          'الأوقات هنا افتراضية؛ ويمكن لكل فرع تحديد أوقاته الخاصة. ' +
          'الزر يحدّث الفروع القائمة دون تغيير أيام العمل أو عدد الموظفين.',
        shiftNamePlaceholder: 'اسم المناوبة',
        sabbathTitle: 'ليلة السبت',
        sabbathDefault: 'وقت خروج السبت الافتراضي لأسبوع جديد:',
        sabbathHint: 'يمكنك تعديل الوقت الفعلي كل أسبوع في أعلى تبويب الجدول. ' +
          'مناوبات ليلة السبت تبدأ بعده بنصف ساعة.',
        backup: 'نسخ احتياطي واستعادة',
        exportJson: 'تصدير كل البيانات (JSON)', importJson: 'استيراد البيانات',
        reset: 'إعادة للإعدادات الافتراضية',
        backupHint: 'تُحفظ البيانات تلقائيًا في هذا المتصفح. لنقلها بين الأجهزة، صدّر ملف JSON.',
        languageTitle: 'اللغة', languageHint: 'يغيّر الواجهة بالكامل. يُحفظ على هذا الجهاز.'
      },

      server: {
        confirmEmail: 'تحقق من بريدك وأكّد العنوان، ثم سجّل الدخول',
        credentialsRequired: 'البريد الإلكتروني وكلمة المرور مطلوبان',
        passwordTooShort: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل',
        emailTaken: 'هذا البريد الإلكتروني مسجَّل بالفعل',
        companyRequired: 'اسم الشركة مطلوب',
        badCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        userInactive: 'هذا المستخدم غير نشط. تواصل مع مدير الشركة.',
        signInRequired: 'يجب تسجيل الدخول',
        noPermission: 'لا تملك صلاحية لهذا الإجراء',
        notLinked: 'هذا المستخدم غير مرتبط ببطاقة موظف',
        weekPublished: 'تم نشر جدول هذا الأسبوع، ولم يعد بالإمكان تغيير الطلبات',
        weekPublishedShort: 'تم نشر جدول هذا الأسبوع بالفعل',
        noRequest: 'لا يوجد طلب لهذا اليوم',
        badDecision: 'قرار غير صالح',
        requestNotFound: 'الطلب غير موجود',
        weekMissing: 'هذا الأسبوع غير موجود',
        userNotFound: 'المستخدم غير موجود',
        cannotChangeOwner: 'لا يمكن تغيير مالك الحساب'
      },

      notify: {
        published: 'تم نشر الجدول',
        publishedBody: 'جدول الأسبوع الجديد جاهز. يمكنك رؤية مناوباتك.',
        requestApproved: 'تمت الموافقة على طلبك',
        requestApprovedBody: 'تمت الموافقة على طلبك ليوم {day}.',
        requestRejected: 'تم رفض طلبك',
        requestRejectedBody: 'تم رفض طلبك ليوم {day}',
        newRequest: 'طلب جديد',
        newRequestBody: 'أرسل أحد الموظفين طلبًا بانتظار موافقتك.',
        newRequestsBody: '{count} طلبات جديدة بانتظار موافقتك.'
      },

      payments: {
        notConnected: 'الفوترة غير موصولة بعد. تواصل مع الدعم.',
        mockProvider: 'مزوّد تجريبي (تطوير)',
        mockNote: 'تتم الموافقة على الدفع فورًا بدون خصم حقيقي. للتطوير والعروض التوضيحية فقط.',
        unknownPlan: 'خطة غير معروفة',
        serverProvider: 'فوترة عبر الخادم ({name})',
        notConfigured: 'الفوترة غير مهيأة في هذه البيئة',
        requestFailed: 'فشل طلب الفوترة ({status})'
      },

      billing: {
        firstCharge: 'أول خصم',
        nextCharge: 'الخصم التالي',
        paymentMethod: 'وسيلة الدفع',
        cardOnFile: 'محفوظة',
        noCard: 'غير مضافة',
        addCard: 'إضافة وسيلة دفع',
        noCardWarning: 'لم تُضف وسيلة دفع بعد. بدونها ينتهي الوصول في {date}.',
        trialNotice: 'لا يتم خصم أي مبلغ خلال أول {days} يومًا. أول خصم في {date} بمبلغ {price}، ثم شهريًا – حتى تلغي.',
        cancelBeforeCharge: 'إلغاء قبل الخصم',
        cancelTrialConfirm: 'إلغاء الاشتراك؟ لن يتم خصم أي مبلغ، ويبقى الوصول حتى نهاية الفترة التجريبية.',
        resume: 'استئناف الاشتراك',
        resumed: 'تم استئناف الاشتراك',
        priceMonthly: '{amount} شيكل / شهر', priceAmount: '{amount} شيكل',
        updateFailed: 'فشل التحديث', cancelFailed: 'فشل الإلغاء',
        title: 'اشتراكك', status: 'الحالة', plan: 'الخطة', validUntil: 'سارٍ حتى',
        activeStaff: 'الموظفون النشطون', of: '{count} من {max}', unlimited: '{count} (بلا حد)',
        plans: 'الخطط', choose: 'اختيار', currentPlan: 'الخطة الحالية',
        tooSmall: 'صغيرة جدًا لـ{count} موظفين', cancel: 'إلغاء الاشتراك',
        cancelConfirm: 'هل تريد إلغاء الاشتراك؟ ينتهي الوصول بانتهاء الفترة المدفوعة.',
        planUpdated: 'تم تحديث الخطة', canceled: 'تم إلغاء الاشتراك',
        ownerOnly: 'مالك الحساب وحده يمكنه تغيير الاشتراك.',
        perMonth: 'شهريًا',
        statusTrial: 'فترة تجريبية', statusActive: 'اشتراك نشط', statusPastDue: 'فشل الدفع',
        statusCanceled: 'ملغى', statusExpired: 'منتهٍ'
      },

      auth: {
        wait: 'لحظة…',
        notifyEnabled: 'تم تفعيل الإشعارات',
        notifyBody: 'سنبلغك بتحديثات الجدول.',
        signIn: 'تسجيل الدخول', signUp: 'فتح حساب للشركة',
        email: 'البريد الإلكتروني', password: 'كلمة المرور', name: 'اسمك', companyName: 'اسم الشركة',
        passwordHint: '6 أحرف على الأقل',
        enter: 'دخول', create: 'فتح حساب', signingIn: 'جارٍ الدخول…', creating: 'جارٍ الإنشاء…',
        trialNote: '{days} يومًا مجانًا. أول خصم في {date}؛ ألغِ قبل ذلك ولن تدفع شيئًا.',
        signOut: 'خروج', blocked: 'الوصول محجوب',
        blockedOwner: 'تواصل مع الدعم لتفعيل الاشتراك.',
        blockedMember: 'اطلب من مالك الحساب تجديد الاشتراك.',
        enableNotifications: 'تفعيل الإشعارات',
        failedSignIn: 'فشل تسجيل الدخول', failedSignUp: 'فشل إنشاء الحساب'
      },

      users: {
        nameColumn: 'الاسم', emailColumn: 'البريد الإلكتروني', createFailed: 'تعذّر إنشاء المستخدم',
        title: 'المستخدمون',
        hint: 'يمكن لكل موظف الحصول على دخول خاص به. يرى مناوباته فقط ويقدّم طلباته – ' +
          'لا يرى الجدول الكامل ولا يستطيع تعديل شيء. المدير يرى ويعدّل كل شيء. ' +
          'اربط المستخدم ببطاقة موظف لكي يرى مناوباته.',
        add: 'إضافة مستخدم', createUser: 'إنشاء مستخدم',
        role: 'الدور', staffCard: 'بطاقة موظف', none: 'بدون', noLink: 'بدون ربط',
        initialPassword: 'كلمة مرور أولية', activeColumn: 'نشط',
        created: 'تم إنشاء مستخدم لـ{email}', updated: 'تم الحفظ', updateFailed: 'فشل التحديث'
      },

      access: {
        trialWithCard: 'فترة تجريبية – بقي {days} يومًا. أول خصم في {date}، {price}.',
        trialNoCard: 'فترة تجريبية – بقي {days} يومًا. أضف وسيلة دفع للاستمرار بعد {date}.',
        trialEndedNoCard: 'انتهت الفترة التجريبية. أضف وسيلة دفع للمتابعة.',
        trialCanceled: 'تم الإلغاء – لن يتم خصم أي مبلغ. الوصول يبقى حتى {date}.',
        canceledAtPeriodEnd: 'تم الإلغاء. الوصول يبقى حتى {date}، ولن تكون هناك خصومات أخرى.',
        charging: 'انتهت الفترة التجريبية وجارٍ تنفيذ أول خصم.',
        noCompany: 'لم يتم العثور على الشركة',
        expired: 'انتهى الاشتراك. جدّده للمتابعة.',
        pastDueBlocked: 'لم يصل الدفع وتم حجب الوصول. يرجى تحديث وسيلة الدفع.',
        pastDue: 'لم تتم آخر عملية دفع. سيُحجب الوصول بعد {days} يومًا.',
        expiredKept: 'انتهى الاشتراك ولم يُجدَّد. اختيار خطة يعيد الوصول فورًا، وبياناتك محفوظة.',
        canceled: 'تم إلغاء الاشتراك. يمكنك التجديد في أي وقت – بياناتك محفوظة.',
        inactive: 'الاشتراك غير نشط.',
        overLimit: 'خطة {plan} تغطي حتى {max} موظفين. لديك {count} – تحتاج إلى خطة {suggested} ({range}، {price}).'
      },

      plans: {
        starter: 'صغيرة', growth: 'متوسطة', business: 'كبيرة',
        upTo: 'حتى {count} موظفين',
        between: 'من {from} إلى {to} موظفين',
        from: '{count} موظفين فأكثر'
      },

      roles: { owner: 'المالك', manager: 'مدير', employee: 'موظف' },

      employee: {
        prevWeek: '▶ الأسبوع السابق', nextWeek: 'الأسبوع التالي ◀',
        loadFailed: 'تعذّر تحميل البيانات: {message}',
        saveFailed: 'فشل الحفظ', reasonSaveFailed: 'تعذّر حفظ السبب',
        myShifts: 'مناوباتي', myRequests: 'طلباتي',
        notPublished: 'لم يُنشر جدول هذا الأسبوع بعد.',
        noShifts: 'لا توجد لك مناوبات هذا الأسبوع.',
        totalWeek: '{count} مناوبات هذا الأسبوع.',
        publishedLocked: 'تم نشر الجدول – لم يعد بالإمكان تغيير طلبات هذا الأسبوع.',
        notLinked: 'مستخدمك غير مرتبط ببطاقة موظف بعد. تواصل مع المدير.',
        noShiftsToday: 'لا مناوبات في هذا اليوم', holidayNoWork: 'عطلة – لا عمل'
      },

      chat: {
        title: 'أسئلة حول الجدول',
        hint: 'اسأل عن الأسبوع المعروض – مثلًا «من يعمل مساء الثلاثاء؟»، ' +
          '«لماذا لم يُعيَّن موظف 3 يوم الخميس؟» أو «من يمكنه أن يحل محل موظف 5 يوم الأربعاء؟»',
        placeholder: 'اكتب سؤالًا عن الجدول…', send: 'إرسال'
      },

      excel: {
        availabilityNone: 'لا يوجد ما يُعيَّن – لا يمكن إضافة مناوبات أخرى هذا الأسبوع',
        availabilityLeft: '{verb} {shifts} يمكن تعيينها',
        spare: 'المتبقي من الحصة', required: 'المطلوب',
        valid: 'سليم', checksTitle: 'فحوصات الجدول',
        personalText: 'نص لواتساب',
        byBranch: 'حسب الفرع', byEmployee: 'حسب الموظف', availability: 'الإتاحة',
        checks: 'الفحوصات', personal: 'جدولي',
        title: 'جدول العمل – أسبوع {from} حتى {to}',
        viewBranch: 'حسب الفرع', viewEmployee: 'حسب الموظف',
        sabbathEnds: 'خروج السبت {time}',
        day: 'اليوم', date: 'التاريخ', branch: 'الفرع', shift: 'المناوبة', hours: 'الأوقات',
        staff: 'الموظف', assigned: 'المعيَّنون', quota: 'الحصة', left: 'المتبقي من الحصة',
        canAssign: 'يمكن تعيينه', freeDays: 'أيام متاحة', totalShifts: 'إجمالي المناوبات',
        severity: 'الخطورة', type: 'النوع', detail: 'التفاصيل',
        missing: '— ناقص —', closed: 'مغلق', notAssigned: 'غير معيَّن',
        personalTitle: 'جدول شخصي – {name}', totalWeek: '{count} مناوبات هذا الأسبوع',
        noIssues: 'لا ازدواج ولا نقص ولا مخالفة طلبات'
      },

      errors: {
        invalidTime: 'وقت غير صالح – استخدم صيغة 24 ساعة، مثلًا 09:30',
        emptyShiftName: 'اسم المناوبة لا يمكن أن يكون فارغًا',
        lastShift: 'يجب أن تبقى مناوبة واحدة على الأقل',
        notSaved: 'فشل الحفظ', copied: 'تم النسخ إلى الحافظة',
        viewOnlyBlocked: 'وضع العرض فقط – التعديل معطّل. يمكنك إيقافه من أعلى الشاشة.',
        duplicatePerson: 'لا يمكن أن يظهر الموظف نفسه مرتين في مناوبة واحدة',
        printBlocked: 'الطباعة محجوبة هنا – استخدم «نسخ كنص» أو التصدير إلى إكسل',
        chooseEmployee: 'اختر موظفًا للتصدير الشخصي'
      },

      common: {
        moveUp: 'رفع', moveDown: 'خفض', timePlaceholder: 'سس:دد',
        save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', close: 'إغلاق',
        yes: 'نعم', no: 'لا', all: 'الكل', and: 'و', more: 'و{count} آخرين'
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
