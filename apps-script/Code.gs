/**
 * Receives demo requests from demo.html and appends them to a Google Sheet,
 * then (optionally) emails a notification.
 *
 * Setup:
 * 1. Create a Google Sheet for demo requests.
 * 2. In the Sheet: Extensions > Apps Script, replace the contents with this file, save.
 * 3. Deploy > New deployment > Select type: Web app.
 *    Execute as: Me. Who has access: Anyone. Authorize when prompted.
 * 4. Copy the web app URL (ends in /exec) into DEMO_ENDPOINT in js/site.js.
 *
 * After editing this script, use Deploy > Manage deployments > Edit > New version
 * so the same /exec URL picks up the change.
 */

// Comma-separated addresses to notify on each request. Leave empty to skip email.
const NOTIFY_EMAIL = '';

const FIELDS = ['name', 'company', 'email', 'phone', 'trucks', 'today', 'notes', 'source', 'page_url'];
const HEADERS = ['Submitted', 'Name', 'Company', 'Email', 'Phone', 'Trucks', 'Runs fleet on', 'Notes', 'Source', 'Page'];

function doPost(e) {
  const p = (e && e.parameter) || {};

  // Bots fill the hidden "website" field; real visitors never see it.
  if (p.website) return json({ ok: true });

  const values = FIELDS.map(f => clean(p[f]));
  const get = f => values[FIELDS.indexOf(f)];
  if (!get('name') || !get('email') || !get('company')) return json({ ok: false, error: 'missing required fields' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date()].concat(values));
  } finally {
    lock.releaseLock();
  }

  if (NOTIFY_EMAIL) {
    const body = HEADERS.slice(1).map((h, i) => h + ': ' + (values[i] || '-')).join('\n');
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: get('email'),
      subject: 'Demo request: ' + get('company') + ' (' + (get('trucks') || '?') + ' trucks)',
      body: body
    });
  }
  return json({ ok: true });
}

// Trim, cap length, and stop values like "=HYPERLINK(...)" from running as formulas.
function clean(v) {
  const s = String(v || '').trim().slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
