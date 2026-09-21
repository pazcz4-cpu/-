/* הגדרות החיבור לשרת.
   כל עוד השדות ריקים, המערכת רצה במצב הדגמה: הנתונים נשמרים בדפדפן
   בלבד ואינם עוברים בין מכשירים.

   להפעלת השרת האמיתי ממלאים כאן את שני הערכים מתוך Supabase:
     Project Settings → API → Project URL
     Project Settings → API → anon public key
   המפתח הזה מיועד לדפדפן ואינו סודי; הבידוד בין חברות נאכף
   בבסיס הנתונים (supabase/schema.sql), לא כאן. */
window.SHIFT_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  adminEndpoint: '/api/create-user'
};
