/* סקריפט ל-Google Ads (Tools → Bulk actions → Scripts). ראו docs/marketing-strategy.md.
   מדביקים בחשבון Google Ads, מחליפים את SECRET בערך של GOOGLE_ADS_SYNC_SECRET
   (לא שומרים את הערך בקובץ הזה), ומתזמנים יומי. */
function main() {
  // SetShifts: שולח את הוצאת הפרסום היומית של 30 הימים האחרונים
  var URL = 'https://setshifts.com/api/marketing-sync/?action=google';
  var SECRET = 'PASTE_GOOGLE_ADS_SYNC_SECRET_HERE';

  var tz = AdsApp.currentAccount().getTimeZone();
  var since = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), tz, 'yyyy-MM-dd');
  var until = Utilities.formatDate(new Date(Date.now() - 864e5), tz, 'yyyy-MM-dd');

  var rows = [];
  var report = AdsApp.report(
    "SELECT segments.date, metrics.cost_micros FROM customer " +
    "WHERE segments.date BETWEEN '" + since + "' AND '" + until + "'");
  var it = report.rows();
  while (it.hasNext()) {
    var r = it.next();
    rows.push({ date: r['segments.date'], cost: Number(r['metrics.cost_micros']) / 1e6 });
  }

  var response = UrlFetchApp.fetch(URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + SECRET },
    payload: JSON.stringify({
      currency: AdsApp.currentAccount().getCurrencyCode(),
      since: since, rows: rows
    }),
    muteHttpExceptions: true
  });
  Logger.log(response.getResponseCode() + ' ' + response.getContentText());
}
