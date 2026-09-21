/* עברית */
(function (root) {
  'use strict';

  root.I18n.register({
    code: 'he',
    name: 'עברית',
    dir: 'rtl',
    locale: 'he-IL',
    weekStart: 0,
    currency: { code: 'ILS', symbol: '₪', position: 'after' },
    dict: {
      app: {
        title: 'סידור משמרות',
        subtitle: 'שיבוץ שבועי לכל סניף, בדיקת כפל משמרות ואילוצי עובדים',
        language: 'שפה'
      },

      days: {
        0: 'ראשון', 1: 'שני', 2: 'שלישי', 3: 'רביעי',
        4: 'חמישי', 5: 'שישי', 6: 'מוצ״ש'
      },
      daysShort: { 0: "א'", 1: "ב'", 2: "ג'", 3: "ד'", 4: "ה'", 5: "ו'", 6: "ש'" },

      shifts: { morning: 'בוקר', middle: 'אמצע', evening: 'ערב', night: 'לילה' },

      seed: {
        branchCenter: 'סניף מרכז', branchNorth: 'סניף צפון', branchSouth: 'סניף דרום',
        employee: 'עובד/ת {n}',
        noteFloater: 'מחליף/ה בכל הסניפים', noteStudent: 'סטודנט/ית – ללא בקרים'
      },

      colors: {
        0: 'חמרה', 1: 'ירוק', 2: 'כחול', 3: 'סגול',
        4: 'ורוד', 5: 'טורקיז', 6: 'אפור', 7: 'חום'
      },

      landing: {
        signIn: 'התחברות', start: 'התחלה חינם', startLong: 'התחלה חינם – {days} ימים',
        heroBadge: 'נבנה לרשתות עם יותר מסניף אחד',
        heroTitle: 'כל משמרת מאוישת. בלי כפל משמרות.',
        heroSubtitle: 'בונים שבוע שלם של משמרות בכל הסניפים בלחיצה אחת. ' +
          'המערכת מכבדת כל אילוץ, מזהה כפל משמרות וחוסרים לפני העובדים, ' +
          'ואומרת בדיוק למה משמרת לא הצליחה להתאייש.',
        heroNote: 'בלי כרטיס אשראי. עובד מהמחשב, ומתקינים בטלפון כמו אפליקציה.',
        heroSecondary: 'איך זה עובד',

        problemsTitle: 'שלושת הדברים שמשתבשים כל שבוע',
        problem1Title: 'אותה משמרת, שני אנשים',
        problem1Body: 'בסניף אחד יש עודף עובדים ובאחר חסר. ' +
          'מגלים את זה רק כשמישהו מגיע ואין לו מה לעשות.',
        problem2Title: 'אילוצים שהולכים לאיבוד',
        problem2Body: 'בקשה ליום חופש מגיעה בהודעה, נשכחת, והסידור שובר הבטחה שנתת.',
        problem3Title: 'חוסרים בלי הסבר',
        problem3Body: 'משמרת נשארת ריקה ואף אחד לא יודע אם באמת אי אפשר למלא אותה או שפשוט פספסו.',

        featuresTitle: 'מה המערכת עושה',
        featuresSubtitle: 'לא אקסל צבעוני. מנוע שיבוץ שמכיר את הכללים שלך.',
        feature1Title: 'שיבוץ אוטומטי',
        feature1Body: 'לחיצה אחת ממלאת שבוע שלם בכל הסניפים, מחלקת את העומס בהוגנות ומכבדת את המכסה של כל עובד.',
        feature2Title: 'זיהוי כפל משמרות',
        feature2Body: 'כל כפל משמרת, חוסר והפרת אילוץ מסומנים ברגע שהם נוצרים – עם הסיבה ועם פתרון מוצע.',
        feature3Title: 'אילוצים באישור מנהל',
        feature3Body: 'העובדים מגישים בקשות בעצמם, עם סיבה אופציונלית. שום בקשה לא משפיעה על הסידור עד שאישרת אותה.',
        feature4Title: 'המשמרות שלך, השעות שלך',
        feature4Body: 'בוקר, אמצע, ערב, לילה – מגדירים כמה משמרות שהעסק צריך, עם שעות וצבעים משלך לכל סניף.',
        feature5Title: 'אקסל ווואטסאפ',
        feature5Body: 'מייצאים את כל השבוע, או שולחים לכל עובד רק את המשמרות שלו – בגיליון אישי או כטקסט מוכן להדבקה.',
        feature6Title: 'חי בכל מכשיר',
        feature6Body: 'המנהל עורך במחשב, העובדים רואים את המשמרות בטלפון. כולם רואים את אותו סידור, מיד.',

        howTitle: 'עולים לאוויר בתוך אחר צהריים',
        how1Title: 'מוסיפים סניפים ועובדים',
        how1Body: 'ימי פתיחה, שעות וכמות עובדים בכל משמרת – כל סניף מוגדר בדרך שלו.',
        how2Title: 'אוספים את האילוצים',
        how2Body: 'העובדים מתחברים ומגישים בקשות. אתה מאשר או דוחה, ורואה הכל במקום אחד.',
        how3Title: 'בונים ומפרסמים',
        how3Body: 'לחיצה אחת בונה את השבוע. עוברים על ההתראות, מתקנים מה שחשוב, מפרסמים – וכולם רואים את המשמרות שלהם.',

        pricingTitle: 'מחיר פשוט, לפי גודל הצוות',
        pricingSubtitle: 'סניפים ללא הגבלה בכל התוכניות. אפשר לבטל בכל רגע.',
        pricingCta: 'התחלה חינם',
        pricingNote: 'כל המחירים בשקלים, לחודש, לא כולל מע״מ. {days} ימי ניסיון בכל תוכנית – בלי אמצעי תשלום.',
        planPopular: 'הכי נבחרת',

        faqTitle: 'שאלות',
        faq1Q: 'צריך להתקין משהו?',
        faq1A: 'לא. המערכת רצה בדפדפן. בטלפון אפשר להוסיף אותה למסך הבית והיא נפתחת כמו אפליקציה, במסך מלא.',
        faq2Q: 'העובדים רואים את המשמרות אחד של השני?',
        faq2A: 'לא. כל עובד רואה רק את המשמרות שלו ואת האילוצים שלו. רק מנהלים רואים את הסידור המלא.',
        faq3Q: 'ומה אם משמרת לא מצליחה להתאייש?',
        faq3A: 'המערכת אומרת בדיוק למה – מי הגיע למכסה השבועית, מי כבר עובד באותו יום, מי חייב מנוחה בין משמרות – ומה כדאי לשנות.',
        faq4Q: 'הנתונים שלי בטוחים אם אפסיק לשלם?',
        faq4A: 'כן. הנתונים נשמרים. בחירת תוכנית מחדש מחזירה את הגישה מיד, עם הכל במקום שבו הפסקת.',
        faq5Q: 'אילו שפות נתמכות?',
        faq5A: 'עברית, אנגלית, ספרדית, צרפתית, גרמנית, פורטוגזית, רוסית וערבית – כולל כתיבה מימין לשמאל. כל אחד בוחר לעצמו.',

        ctaTitle: 'נסה את זה על הסידור של השבוע הבא',
        ctaBody: 'מגדירים את הסניפים, בונים שבוע אחד, ורואים את ההבדל. זה לוקח אחר צהריים.',
        footerRights: 'כל הזכויות שמורות.',
        footerTagline: 'סידור משמרות לרשתות.'
      },

      tabs: {
        schedule: 'סידור שבועי', constraints: 'אילוצים', employees: 'עובדים',
        branches: 'סניפים', users: 'משתמשים', billing: 'מנוי', settings: 'הגדרות'
      },

      toolbar: {
        prevWeek: 'שבוע קודם', nextWeek: 'שבוע הבא', thisWeek: 'השבוע הנוכחי',
        week: 'שבוע {from} – {to}', currentWeek: 'השבוע הנוכחי',
        generate: '✨ בנה סידור אוטומטי', clear: 'נקה סידור',
        keepManual: 'שמירת שיבוצים ידניים',
        copyText: '📋 העתק כטקסט', excel: '⬇ אקסל', csv: '⬇ CSV', print: '🖨 הדפסה',
        moreTools: '⋯ כלים נוספים', closeTools: '✕ סגירת הכלים',
        viewOnly: '🔒 מצב צפייה', exitViewOnly: '🔓 יציאה ממצב צפייה',
        shabbatEnd: 'צאת שבת',
        byBranch: 'תצוגה לפי סניף', byEmployee: 'תצוגה לפי עובד',
        personalExport: 'ייצוא אישי לעובד (רק המשמרות שלו):',
        choosePerson: 'בחרו עובד…',
        holidays: 'ימי חג (הסניפים סגורים):'
      },

      schedule: {
        branch: 'סניף', shift: 'משמרת', employee: 'עובד', totalShifts: 'סה״כ משמרות',
        empty: '— ריק —', add: '+ הוסף', addPerson: '+ הוסף עובד', notAssigned: '— לא משובץ —',
        closed: 'הסניף סגור ביום זה', noBranches: 'לא הוגדרו סניפים פעילים. עברו ללשונית "סניפים".',
        required: 'נדרשים: {count}', people: '{count} עובדים',
        holidayClosed: 'הסניפים סגורים', dayOff: 'חופש', holiday: 'חג',
        missingSabbath: 'חסרה שעת צאת שבת'
      },

      status: {
        demoTitle: 'מצב הדגמה',
        demoBody: 'הנתונים נשמרים בדפדפן הזה בלבד ואינם עוברים בין מכשירים.',
        synced: 'מסונכרן בין המכשירים', syncedAt: 'מסונכרן בין המכשירים · עודכן {time}',
        localOnly: 'נשמר במכשיר הזה בלבד', readOnly: 'צפייה בלבד – אין הרשאת עריכה',
        remoteUpdate: 'התקבל עדכון ממחשב אחר ({time})',
        localCopy: 'זהו עותק מקומי של הקובץ – הנתונים נשמרים בדפדפן של המחשב הזה בלבד ואינם מסתנכרנים. ' +
          'לעבודה משני מחשבים יש להשתמש בגרסה המתארחת. להעברת הנתונים: ייצוא JSON בלשונית ההגדרות, וייבוא בגרסה המתארחת.',
        viewOnlyBanner: 'מצב צפייה – הסידור מוצג לבדיקה בלבד והעריכה חסומה. ' +
          'הייצוא, ההדפסה והמעבר בין שבועות פועלים כרגיל.'
      },

      levels: { error: 'שגיאה', warning: 'אזהרה', info: 'הערה' },

      marks: {
        dayOff: 'חופש', blocked: 'חסום', prefers: 'מעדיף',
        notInBranch: 'לא בסניף', notInShift: 'לא במשמרת',
        alreadyAssigned: 'כבר משובץ', inactive: 'לא פעיל'
      },

      issueTypes: {
        'duplicate-shift': 'כפל משמרת',
        'duplicate-employee-slot': 'כפל משמרת',
        'double-booked': 'כפל משמרת לעובד',
        understaffed: 'חוסר באיוש',
        'constraint-off': 'הפרת אילוץ',
        'constraint-blocked': 'הפרת אילוץ',
        'branch-mismatch': 'סניף לא מתאים',
        'shift-mismatch': 'משמרת לא מתאימה',
        'over-max': 'חריגה ממכסה',
        rest: 'מנוחה קצרה',
        'no-shifts': 'ללא משמרות',
        'missing-shabbat-end': 'חסרה שעת צאת שבת',
        'inactive-slot': 'משמרת סגורה',
        'pending-constraints': 'בקשות ממתינות',
        'extra-days-off': 'יותר מדי ימי חופש',
        'below-target': 'מתחת ליעד'
      },

      toast: {
        generated: 'הסידור נבנה – {shifts} ללא איוש',
        generatedFull: 'הסידור נבנה בהצלחה – כל המשמרות מאוישות',
        clearWeekConfirm: 'לנקות את כל השיבוצים של השבוע הזה? האילוצים יישמרו.',
        cleared: 'הסידור נוקה',
        copied: 'הסידור הועתק ללוח',
        personalCopied: 'הסידור האישי הועתק ללוח',
        viewOnlyOn: 'מצב צפייה הופעל – העריכה חסומה',
        viewOnlyOff: 'מצב צפייה כובה – אפשר לערוך',
        copyPrompt: 'העתיקו את הטקסט:',
        holidayCleared: '{day} חזר להיות יום עבודה',
        holidayPrompt: 'שם החג ביום {day} (הסניפים ייסגרו והיום ייחשב חופש לכל העובדים):',
        holidayDefault: 'חג',
        holidayHasAssignments: 'ביום הזה כבר משובצים {count} עובדים. לסמן כחג ולנקות את השיבוצים?',
        holidayMarked: 'יום {day} סומן כחג – הסניפים סגורים',
        clearConstraintsConfirm: 'לנקות את כל האילוצים של השבוע הזה?',
        constraintsCleared: 'האילוצים נוקו',
        noPreviousConstraints: 'אין אילוצים בשבוע הקודם',
        constraintsCopied: 'האילוצים הועתקו מהשבוע הקודם',
        requestApproved: 'הבקשה אושרה', requestRejected: 'הבקשה נדחתה',
        updateFailed: 'העדכון נכשל',
        deleteShiftConfirm: 'למחוק את משמרת "{name}"?\n\n{usage}',
        deleteShiftUsed: 'היא מוגדרת ב-{count} ימים בסניפים, וכל השיבוצים שלה יימחקו.',
        deleteShiftUnused: 'היא אינה בשימוש בשום סניף.',
        shiftDeleted: 'המשמרת נמחקה{removed}',
        shiftRemovedCount: ' ({count} שיבוצים הוסרו)',
        shiftAdded: 'נוספה משמרת. יש להגדיר אותה בסניפים כדי שתופיע בסידור.',
        newShift: 'משמרת {n}',
        applyHoursConfirm: 'להחיל את שעות ברירת המחדל על {count} הסניפים, בימים ראשון עד חמישי?\n\n' +
          'הימים הפתוחים וכמות העובדים בכל משמרת יישארו כפי שהם. שישי ומוצ״ש לא ישתנו.',
        hoursUpdated: 'השעות עודכנו ב-{count} משמרות',
        hoursAlready: 'כל המשמרות כבר בשעות האלה',
        imported: 'הנתונים יובאו בהצלחה',
        importedCloud: 'הנתונים יובאו והועלו לענן ({count} שבועות)',
        importFailed: 'קובץ לא תקין: {message}',
        resetConfirm: 'לאפס את כל הנתונים (עובדים, סניפים, סידורים ואילוצים) לברירת המחדל?',
        reset: 'הנתונים אופסו'
      },

      ui: {
        until: 'עד {time}', sheet: 'גיליון {n}',
        fileSaved: 'הקובץ נשמר', fileFailed: 'שמירת הקובץ נכשלה: {message}',
        unknownError: 'שגיאה לא ידועה', downloadUnavailable: 'לא ניתן להוריד קובץ בסביבה הזו',
        loadFailed: 'טעינת הנתונים נכשלה, נטענת ברירת מחדל', saveFailed: 'שמירת הנתונים נכשלה',
        iconLetters: 'סד',
        dayHeading: 'יום {day} ({date})',
        missingStaff: 'חסר איוש',
        holidayClosedLine: '{name} – כל הסניפים סגורים',
        spareLine: '— {verb} {shifts} שאפשר עוד לשבץ —',
        unknownBranch: 'סניף לא ידוע', unknownEmployee: 'עובד לא ידוע',
        weekLabel: 'שבוע {from} – {to}', constraintsWeek: 'אילוצי {label}',
        holidayAllClosed: 'כל הסניפים סגורים – יום חופש לכל העובדים',
        holidayNoRequests: 'יום חג – אין צורך באילוצים',
        branchClosedToday: 'הסניף סגור ביום זה',
        noActiveBranches: 'לא הוגדרו סניפים פעילים.',
        noActiveBranchesTab: 'לא הוגדרו סניפים פעילים. עברו ללשונית "סניפים".',
        allClosedOn: 'כל הסניפים סגורים ב{day}.',
        branchesClosed: 'הסניפים סגורים',
        noHours: 'ללא שעות',
        outOf: '{done} מתוך {total}',
        cloudSaved: 'הנתונים נשמרים בענן ומתעדכנים בכל מחשב שפתוח בו אותו קישור',
        deviceSaved: 'הנתונים נשמרים רק בדפדפן של המחשב הזה',
        thinking: 'חושב…',
        noAnswer: '(לא התקבלה תשובה)',
        chatBlocked: 'אין הרשאה לשאול שאלות בעמוד הזה.',
        chatRateLimited: 'יותר מדי שאלות ברצף – נסו שוב בעוד רגע.',
        chatFailed: 'לא הצלחתי לענות כרגע',
        chatSystem: 'אתה עוזר למנהל/ת לנהל סידור משמרות. ענה ב{language}, קצר ולעניין, ' +
          'והסתמך רק על הנתונים שלהלן. אם המידע חסר – אמור זאת במפורש במקום לנחש.',
        chatDataStart: '=== נתוני השבוע ===',
        chatDataEnd: '=== סוף הנתונים ===',
        chatQuestion: 'שאלה: ',
        summaryShabbat: 'צאת שבת: {time}',
        summaryHolidays: 'ימי חג סגורים: {days}', summaryNoHolidays: 'אין ימי חג השבוע.',
        summaryRules: 'כללי שיבוץ:',
        ruleOnePerDayOn: 'עובד משובץ למשמרת אחת ביום לכל היותר.',
        ruleOnePerDayOff: 'עובד יכול לעשות כמה משמרות ביום.',
        ruleRestOn: 'אין משמרת בוקר אחרי משמרת ערב של היום הקודם.',
        ruleRestOff: 'אין מגבלת מנוחה בין ערב לבוקר.',
        summaryBranches: 'סניפים:', summaryEmployees: 'עובדים:',
        summaryCurrent: 'הסידור הנוכחי:', summaryAvailability: 'יתרת זמינות:',
        summaryIssues: 'התראות על הסידור:', summaryNoIssues: 'אין התראות – הסידור תקין.',
        closedAllWeek: 'סגור כל השבוע', allBranches: 'כל הסניפים',
        peopleCount: '{count} עובדים',
        empBranches: 'סניפים', empShifts: 'משמרות', empMax: 'מקסימום {count} בשבוע',
        empAskedOff: 'ביקש/ה חופש', empBlocked: 'חסם/ה', empNote: 'הערה',
        empAssignedOf: '{name}: משובץ {total} מתוך מכסה {max}',
        empFreeDays: 'ימים פנויים: {days}', none: 'אין',
        fileName: 'סידור', personalFileName: 'סידור-{name}',
        greeting: 'שלום {name}, זה הסידור שלך:',
        shortTitle: 'משמרות'
      },

      alerts: {
        slotLabel: '{day} · {branch} · משמרת {shift}',
        deletedEmployee: '(עובד שנמחק: {id})',
        deletedBranch: '(סניף שנמחק)',
        errorsOne: 'שגיאה אחת', errorsOther: '{count} שגיאות',
        warningsOne: 'אזהרה אחת', warningsOther: '{count} אזהרות',
        infosOne: 'הערה אחת', infosOther: '{count} הערות',
        allGood: '✔ הסידור תקין – אין כפל משמרות, חוסרים או הפרות אילוצים',
        showAll: 'הצג את כל {count} ההתראות', showLess: 'הסתרת ההתראות',
        duplicate: 'כפל משמרת: {label} – משובצים {count} עובדים ({names}) במקום {need}.',
        duplicateSelf: 'כפל משמרת: {name} משובץ/ת פעמיים באותה משמרת – {label}.',
        doubleBooked: 'כפל משמרת לעובד: {name} משובץ/ת ל-{count} משמרות ביום {day}{where} ({detail}).',
        sameBranch: ' באותו סניף', differentBranches: ' בסניפים שונים',
        understaffed: 'חוסר באיוש: {label} – משובצים {assigned} מתוך {need}.',
        reasonBusy: '{names} כבר משובצים במשמרת אחרת באותו יום',
        reasonMaxed: '{names} הגיעו למכסת המשמרות השבועית',
        reasonResting: '{names} חייבים מנוחה בין ערב לבוקר',
        reasonNone: 'אין עובד שמוגדר גם לסניף הזה וגם למשמרת הזו, או שכולם חסמו את המשמרת.',
        reasonFree: 'יש עובדים פנויים ({names}) – נסו לבנות את הסידור מחדש.',
        reasonPrefix: 'הסיבה: ',
        suggestTwoPerDay: ' אפשר לאפשר שתי משמרות ביום באותו עובד בלשונית ההגדרות.',
        suggestRaiseMax: ' אפשר להעלות את מכסת המשמרות בכרטיס העובד.',
        constraintOff: 'הפרת אילוץ: {name} ביקש/ה יום חופש ב{day} אך משובץ/ת ל{shift} ב{branch}.',
        constraintBlocked: 'הפרת אילוץ: {name} חסם/ה משמרת {shift} ב{day} אך משובץ/ת אליה ב{branch}.',
        branchMismatch: '{name} משובץ/ת ב{branch} ({day}) למרות שהסניף אינו מוגדר בכרטיס העובד.',
        shiftMismatch: '{name} משובץ/ת למשמרת {shift} ב{day} למרות שסוג משמרת זה אינו מוגדר בכרטיס העובד.',
        overMax: 'חריגה ממכסה: {name} משובץ/ת ל-{total} משמרות (מקסימום {max}).',
        noShifts: '{name} לא משובץ/ת השבוע כלל.',
        rest: 'מנוחה קצרה: {name} סיים/ה ערב ב{previous} ומשובץ/ת לבוקר ב{day}.',
        holidayAssignment: 'שיבוץ ביום חג: {day} ({name}) מוגדר כיום סגור, אך משובצים בו {names}.',
        inactiveSlot: 'שיבוץ במשמרת שאינה פעילה: {day} · {branch} · {shift} ({names}).',
        missingSabbath: 'לא הוזנה שעת צאת שבת לשבוע זה – שעת ההתחלה של משמרות מוצ״ש אינה מחושבת.',
        pendingOne: 'בקשת אילוץ ממתינה לאישור: {name} ({day}). עד לאישור היא אינה משפיעה על השיבוץ.',
        pendingOther: '{count} בקשות אילוץ ממתינות לאישור: {names}. עד לאישור הן אינן משפיעות על השיבוץ.',
        extraDaysOff: '{name} סימן/ה {count} ימי חופש ({days}) – לפי ההגדרות מגיע יום חופש אחד בשבוע.',
        belowTarget: '{name} ביקש/ה יום חופש ב{day} ומשובץ/ת {total} משמרות מתוך {expected} אפשריות – יש לו/ה עוד ימים פנויים.'
      },

      availability: {
        title: 'מה נותר פנוי השבוע',
        none: 'אין יתרת זמינות – {reason}',
        reasonMaxed: 'כל העובדים הגיעו למכסת המשמרות השבועית שלהם.',
        reasonNoDays: 'לעובדים שנותרה להם מכסה אין יום פנוי שבו הסניפים שלהם פתוחים.',
        totalOne: '{verb} משמרת אחת שאפשר עוד לשבץ, אצל {people}:',
        totalOther: '{verb} {count} משמרות שאפשר עוד לשבץ, אצל {people}:',
        peopleOne: 'עובד/ת אחד/ת', peopleOther: '{count} עובדים',
        left: '{verb} {shifts} במכסה · פנוי/ה ב{days}',
        leftNoDays: '{verb} {shifts} במכסה, אך אין יום פנוי השבוע',
        full: 'מנוצל/ת במלואו/ה ({assigned} מתוך {max})',
        noEmployees: 'לא הוגדרו עובדים פעילים.',
        shiftsOne: 'משמרת אחת', shiftsOther: '{count} משמרות',
        remains: 'נותרה', remainPlural: 'נותרו'
      },

      constraints: {
        title: 'אילוצי {week}',
        clear: 'נקה אילוצי השבוע', copyPrevious: 'העתק אילוצים משבוע קודם',
        legend: 'לחיצה על כפתור משמרת מחליפה מצב: {free} → {preferred} → {blocked}. סימון "חופש" חוסם את כל היום.',
        free: 'זמין', preferred: 'מעדיף/ה', blocked: 'לא יכול/ה', dayOff: 'חופש',
        pendingTitle: 'בקשות שממתינות לאישורך ({count})',
        pendingHint: 'בקשה שלא אושרה אינה משפיעה על השיבוץ.',
        approve: 'אישור', reject: 'דחייה',
        approved: 'אושר', rejected: 'נדחה', pending: 'ממתין לאישור',
        requestLabel: 'בקשה: {detail}', requestRejected: 'בקשה נדחתה',
        reason: 'סיבה (לא חובה)',
        reasonPlaceholder: 'למשל: חתונה, בחינה, תור לרופא',
        reasonSaved: 'הסיבה נשמרה', reasonGiven: 'הסיבה שציינת: {text}',
        managerNote: 'הערת מנהל/ת: {text}',
        needsApproval: 'כל בקשה עוברת לאישור המנהל/ת ומשפיעה על הסידור רק אחרי שאושרה.',
        noChange: 'ללא שינוי'
      },

      employees: {
        title: 'עובדים מוגדרים', add: '+ הוסף עובד', active: 'עובד/ת פעיל/ה',
        branchesLabel: 'סניפים (ללא בחירה = זמין בכל הסניפים)',
        shiftTypes: 'סוגי משמרות אפשריים',
        maxShifts: 'מקסימום משמרות בשבוע', note: 'הערה',
        deleteConfirm: 'למחוק את {name}? השיבוצים הקיימים של העובד/ת יוסרו מכל השבועות.',
        inactive: '(לא פעיל)', newName: 'עובד/ת חדש/ה'
      },

      branches: {
        title: 'סניפים מוגדרים', add: '+ הוסף סניף', active: 'פעיל', newName: 'סניף חדש',
        hint: 'לכל סניף נקבעים בנפרד הימים, השעות וכמות העובדים בכל משמרת. ' +
          'עובדים = 0 סוגר את המשמרת באותו יום. שיבוץ של יותר מהמספר שנקבע יסומן ככפל משמרת.',
        peopleLabel: 'עובדים', closed: 'סגור', day: 'יום',
        copyFrom: 'העתקת ימים ושעות מסניף אחר', chooseBranch: 'בחרו סניף…',
        copyConfirm: 'להעתיק את הימים והשעות מ{from} אל {to}?',
        copied: 'הימים והשעות הועתקו',
        deleteConfirm: 'למחוק את {name}? השיבוצים של הסניף יוסרו מכל השבועות.',
        autoSabbath: 'לפי צאת שבת', autoSabbathLabel: 'מצאת שבת +30 דק׳'
      },

      settings: {
        rules: 'כללי שיבוץ',
        onePerDay: 'עובד משובץ למשמרת אחת ביום לכל היותר',
        rest: 'אין משמרת בוקר אחרי משמרת ערב של היום הקודם',
        oneDayOff: 'יום החופש שסומן באילוצים הוא יום החופש היחיד בשבוע',
        shiftTypes: 'סוגי המשמרות בעסק',
        addShift: '+ הוספת משמרת', applyHours: 'החל שעות על כל הסניפים (ראשון–חמישי)',
        shiftsHint: 'כאן מגדירים כמה משמרות יש בעסק, איך הן נקראות, מה השעות שלהן ובאיזה צבע הן מוצגות. ' +
          'השעות כאן הן ברירת המחדל; לכל סניף אפשר לקבוע שעות משלו. ' +
          'הכפתור מחיל את השעות על כל הסניפים הקיימים, בלי לשנות ימים פתוחים או כמות עובדים.',
        shiftNamePlaceholder: 'שם המשמרת',
        sabbathTitle: 'מוצאי שבת',
        sabbathDefault: 'שעת צאת שבת שתוצע כברירת מחדל לשבוע חדש:',
        sabbathHint: 'בכל שבוע אפשר לעדכן את השעה בפועל בראש לשונית הסידור. ' +
          'משמרת מוצ״ש מתחילה חצי שעה אחריה.',
        backup: 'גיבוי ושחזור',
        exportJson: '⬇ ייצוא כל הנתונים (JSON)', importJson: '⬆ ייבוא נתונים',
        reset: 'איפוס להגדרות ברירת מחדל',
        backupHint: 'הנתונים נשמרים אוטומטית בדפדפן של המחשב הזה. לשיתוף בין מחשבים – ייצאו קובץ JSON.',
        languageTitle: 'שפה', languageHint: 'משנה את כל הממשק. נשמר למכשיר הזה.'
      },

      server: {
        confirmEmail: 'בדקו את תיבת המייל ואשרו את הכתובת, ואז התחברו',
        credentialsRequired: 'נדרשים אימייל וסיסמה',
        passwordTooShort: 'הסיסמה חייבת להכיל לפחות 6 תווים',
        emailTaken: 'כתובת האימייל כבר רשומה',
        companyRequired: 'נדרש שם חברה',
        badCredentials: 'אימייל או סיסמה שגויים',
        userInactive: 'המשתמש אינו פעיל. פנו למנהל החברה.',
        signInRequired: 'יש להתחבר',
        noPermission: 'אין לך הרשאה לפעולה הזו',
        notLinked: 'המשתמש אינו מקושר לכרטיס עובד',
        weekPublished: 'הסידור לשבוע הזה כבר פורסם ולא ניתן לשנות אילוצים',
        weekPublishedShort: 'הסידור לשבוע הזה כבר פורסם',
        noRequest: 'אין בקשה ליום הזה',
        badDecision: 'החלטה לא חוקית',
        requestNotFound: 'הבקשה לא נמצאה',
        weekMissing: 'השבוע אינו קיים',
        userNotFound: 'המשתמש לא נמצא',
        cannotChangeOwner: 'לא ניתן לשנות את בעל החשבון'
      },

      notify: {
        published: 'הסידור פורסם',
        publishedBody: 'הסידור לשבוע החדש זמין. אפשר לראות את המשמרות שלך.',
        requestApproved: 'הבקשה שלך אושרה',
        requestApprovedBody: 'הבקשה ליום {day} אושרה.',
        requestRejected: 'הבקשה שלך נדחתה',
        requestRejectedBody: 'הבקשה ליום {day} נדחתה',
        newRequest: 'בקשת אילוץ חדשה',
        newRequestBody: 'עובד/ת הגיש/ה בקשה שממתינה לאישורך.',
        newRequestsBody: '{count} בקשות חדשות ממתינות לאישורך.'
      },

      payments: {
        mockProvider: 'ספק מדומה (פיתוח)',
        mockNote: 'התשלום מאושר מיד ללא חיוב אמיתי. משמש לפיתוח ולהדגמה בלבד.',
        unknownPlan: 'תוכנית לא מוכרת',
        serverProvider: 'חיוב דרך השרת ({name})',
        notConfigured: 'שכבת החיוב אינה מוגדרת בסביבה הזו',
        requestFailed: 'בקשת החיוב נכשלה ({status})'
      },

      billing: {
        priceMonthly: '{amount}₪ לחודש', priceAmount: '{amount}₪',
        updateFailed: 'העדכון נכשל', cancelFailed: 'הביטול נכשל',
        title: 'המנוי שלך', status: 'סטטוס', plan: 'תוכנית', validUntil: 'בתוקף עד',
        activeStaff: 'עובדים פעילים', of: '{count} מתוך {max}', unlimited: '{count} (ללא הגבלה)',
        plans: 'תוכניות', choose: 'בחירה', currentPlan: 'התוכנית הנוכחית',
        tooSmall: 'קטנה מדי עבור {count} עובדים', cancel: 'ביטול המנוי',
        cancelConfirm: 'לבטל את המנוי? הגישה תיחסם בתום התקופה ששולמה.',
        planUpdated: 'התוכנית עודכנה', canceled: 'המנוי בוטל',
        ownerOnly: 'רק בעל החשבון יכול לשנות את המנוי.',
        perMonth: 'לחודש',
        statusTrial: 'תקופת ניסיון', statusActive: 'מנוי פעיל', statusPastDue: 'תשלום לא התקבל',
        statusCanceled: 'המנוי בוטל', statusExpired: 'המנוי פג'
      },

      auth: {
        wait: 'רגע…',
        notifyEnabled: 'ההתראות הופעלו',
        notifyBody: 'נודיע לך על עדכונים בסידור.',
        signIn: 'התחברות', signUp: 'פתיחת חשבון לעסק',
        email: 'אימייל', password: 'סיסמה', name: 'השם שלך', companyName: 'שם העסק',
        passwordHint: 'לפחות 6 תווים',
        enter: 'כניסה', create: 'פתיחת חשבון', signingIn: 'מתחבר…', creating: 'פותח חשבון…',
        trialNote: '{days} ימי ניסיון ללא תשלום. לא נדרש אמצעי תשלום.',
        signOut: 'יציאה', blocked: 'הגישה חסומה',
        blockedOwner: 'להפעלת המנוי יש לפנות לתמיכה.',
        blockedMember: 'יש לפנות לבעל החשבון בחברה כדי לחדש את המנוי.',
        enableNotifications: '🔔 הפעלת התראות',
        failedSignIn: 'ההתחברות נכשלה', failedSignUp: 'ההרשמה נכשלה'
      },

      users: {
        nameColumn: 'שם', emailColumn: 'אימייל', createFailed: 'יצירת המשתמש נכשלה',
        title: 'משתמשי החברה',
        hint: 'כל עובד יכול לקבל כניסה משלו. עובד רואה רק את המשמרות שלו ומזין את האילוצים שלו – ' +
          'הוא אינו רואה את הסידור המלא ואינו יכול לערוך דבר. מנהל רואה ועורך הכל. ' +
          'כדי שעובד יראה את המשמרות שלו יש לקשר את המשתמש לכרטיס העובד.',
        add: 'הוספת משתמש', createUser: 'יצירת משתמש',
        role: 'תפקיד', staffCard: 'כרטיס עובד', none: 'ללא', noLink: 'ללא קישור',
        initialPassword: 'סיסמה ראשונית', activeColumn: 'פעיל',
        created: 'נוצר משתמש עבור {email}', updated: 'העדכון נשמר', updateFailed: 'העדכון נכשל'
      },

      access: {
        noCompany: 'לא נמצאה חברה',
        trialEnded: 'תקופת הניסיון הסתיימה. יש להפעיל מנוי כדי להמשיך.',
        trial: 'תקופת ניסיון – נותרו {days} ימים.',
        expired: 'המנוי פג. יש לחדש כדי להמשיך.',
        pastDueBlocked: 'התשלום לא התקבל והגישה נחסמה. יש לעדכן אמצעי תשלום.',
        pastDue: 'התשלום האחרון לא עבר. הגישה תיחסם בעוד {days} ימים.',
        expiredKept: 'המנוי פג ולא חודש. בחירת תוכנית תחזיר את הגישה מיד, והנתונים שמורים.',
        canceled: 'המנוי בוטל. אפשר לחדש בכל רגע – הנתונים שמורים.',
        inactive: 'המנוי אינו פעיל.',
        overLimit: 'תוכנית {plan} כוללת עד {max} עובדים. יש {count} עובדים – נדרשת תוכנית {suggested} ({range}, {price}).'
      },

      plans: {
        starter: 'קטן', growth: 'בינוני', business: 'גדול',
        upTo: 'עד {count} עובדים',
        between: '{from} עד {to} עובדים',
        from: '{count} עובדים ומעלה'
      },

      roles: { owner: 'בעלים', manager: 'מנהל/ת', employee: 'עובד/ת' },

      employee: {
        prevWeek: '▶ שבוע קודם', nextWeek: 'שבוע הבא ◀',
        loadFailed: 'לא ניתן לטעון את הנתונים: {message}',
        saveFailed: 'השמירה נכשלה', reasonSaveFailed: 'שמירת הסיבה נכשלה',
        myShifts: 'המשמרות שלי', myRequests: 'האילוצים שלי',
        notPublished: 'הסידור לשבוע הזה עדיין לא פורסם.',
        noShifts: 'אין לך משמרות בשבוע הזה.',
        totalWeek: 'סה״כ {count} משמרות השבוע.',
        publishedLocked: 'הסידור פורסם – לא ניתן עוד לשנות אילוצים לשבוע הזה.',
        notLinked: 'המשתמש שלך עדיין לא קושר לכרטיס עובד. פנה/י למנהל/ת.',
        noShiftsToday: 'אין משמרות ביום הזה', holidayNoWork: 'יום חג – אין עבודה'
      },

      chat: {
        title: 'שאלות על הסידור',
        hint: 'אפשר לשאול על השבוע שמוצג – למשל "מי עובד בשלישי בערב?", ' +
          '"למה עובד/ת 3 לא משובץ/ת בחמישי?" או "מי יכול להחליף את עובד/ת 5 ביום רביעי?"',
        placeholder: 'כתבו שאלה על הסידור…', send: 'שליחה'
      },

      excel: {
        availabilityNone: 'אין יתרת זמינות – אי אפשר לשבץ משמרות נוספות השבוע',
        availabilityLeft: '{verb} {shifts} שאפשר עוד לשבץ',
        spare: 'נותרו במכסה', required: 'נדרשים',
        valid: 'תקין', checksTitle: 'בדיקות הסידור',
        personalText: 'טקסט לוואטסאפ',
        byBranch: 'לפי סניף', byEmployee: 'לפי עובד', availability: 'מה נותר פנוי',
        checks: 'בדיקות', personal: 'סידור אישי',
        title: 'סידור עבודה – שבוע {from} עד {to}',
        viewBranch: 'תצוגה לפי סניף', viewEmployee: 'תצוגה לפי עובד',
        sabbathEnds: 'צאת שבת {time}',
        day: 'יום', date: 'תאריך', branch: 'סניף', shift: 'משמרת', hours: 'שעות',
        staff: 'עובד', assigned: 'משובץ', quota: 'מכסה', left: 'נותרו במכסה',
        canAssign: 'ניתן לשבץ', freeDays: 'ימים פנויים', totalShifts: 'סה״כ משמרות',
        severity: 'חומרה', type: 'סוג', detail: 'פירוט',
        missing: '— חסר —', closed: 'סגור', notAssigned: 'לא משובץ',
        personalTitle: 'סידור אישי – {name}', totalWeek: 'סה״כ {count} משמרות השבוע',
        noIssues: 'אין כפל משמרות, חוסרים או הפרות אילוצים'
      },

      errors: {
        invalidTime: 'שעה לא תקינה – הזינו בפורמט 24 שעות, למשל 09:30',
        emptyShiftName: 'שם המשמרת אינו יכול להיות ריק',
        lastShift: 'חייבת להישאר לפחות משמרת אחת',
        notSaved: 'השמירה נכשלה', copied: 'הועתק ללוח',
        viewOnlyBlocked: 'מצב צפייה – העריכה חסומה. אפשר לכבות אותו בכפתור שבראש המסך.',
        duplicatePerson: 'אותו עובד לא יכול להופיע פעמיים באותה משמרת',
        printBlocked: 'ההדפסה חסומה כאן – השתמשו ב"העתק כטקסט" או בייצוא אקסל',
        chooseEmployee: 'בחרו עובד לייצוא אישי'
      },

      common: {
        moveUp: 'העלאה', moveDown: 'הורדה', timePlaceholder: 'שש:דד',
        save: 'שמירה', cancel: 'ביטול', delete: 'מחיקה', close: 'סגירה',
        yes: 'כן', no: 'לא', all: 'הכל', and: 'וגם', more: 'ועוד {count}'
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
