/* מזהי המעקב. ריקים = המעקב כבוי לגמרי. build-site.js כותב את הקובץ
   הזה מחדש לכל פריסה מתוך META_PIXEL_ID ו-GA4_ID. אל תמלא כאן ידנית:
   ראו docs/marketing-strategy.md לפני הפעלה. */
window.SHIFT_CONFIG = Object.assign(window.SHIFT_CONFIG || {}, { metaPixelId: '', ga4Id: '' });
