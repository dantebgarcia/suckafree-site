// Copies email sign-ups from suckafree.org into this spreadsheet.
//
// Setup (once):
//   1. In the spreadsheet: Extensions > Apps Script. Replace everything in Code.gs with this file.
//   2. Set SECRET below to the same value you saved as SHEET_SECRET in Cloudflare.
//   3. Deploy > New deployment > type "Web app".
//      Execute as: Me.  Who has access: Anyone.  Deploy, then allow access.
//   4. Copy the "Web app" URL and save it in Cloudflare as SHEET_WEBHOOK_URL.
//
// Each new email sign-up becomes a row on the "Website Sign-ups" tab, and each founding
// member a row on the "Founding Members" tab (both created if missing).
// Columns follow the People tab: Status is "Interested" when they ticked membership, otherwise "Lead",
// so a row can be copied into People when someone gets involved.
// If you change this code later, use Deploy > Manage deployments > Edit > New version,
// so the URL stays the same.

const SECRET = 'PASTE-THE-SAME-SECRET-AS-SHEET_SECRET';
const TAB = 'Website Sign-ups';
const MEMBER_TAB = 'Founding Members';
const MEMBER_HEADERS = ['Joined', 'First name', 'Last name', 'Email', 'Phone', 'Level', 'Monthly ($)', 'Status', 'Founders wall name', 'Organization', 'Skills', 'Notes'];
const HEADERS = ['Signed up', 'Name', 'Email', 'Status', 'Wants membership', 'Skills', 'Signed up from', 'Page'];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'bad json' });
  }
  if (!data || data.secret !== SECRET) return reply({ ok: false, error: 'wrong secret' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    if (data.kind === 'member') {
      const ms = tab(book, MEMBER_TAB, MEMBER_HEADERS);
      ms.appendRow([
        data.created_at ? new Date(data.created_at) : new Date(),
        safe(data.first), safe(data.last), safe(data.email), safe(data.phone),
        safe(data.tier_name), Number(data.amount) || '', safe(data.updated ? 'updated their sign-up' : data.status),
        safe(data.wall), safe(data.org), safe(data.skills), safe(data.notes),
      ]);
      return reply({ ok: true });
    }
    const sheet = tab(book, TAB, HEADERS);
    sheet.appendRow([
      data.created_at ? new Date(data.created_at) : new Date(),
      safe(data.name),
      safe(data.email),
      safe(data.status || 'Lead'),
      data.member ? 'Yes' : '',
      safe(data.skills),
      safe(data.source),
      safe(data.page),
    ]);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function tab(book, name, headers) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

// Keeps a typed "=..." from running as a formula.
function safe(value) {
  const s = String(value == null ? '' : value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
