/**
 * ============================================================
 * CHECKLIST DPD MONITORING - BACKEND (Google Apps Script)
 * ============================================================
 * Cara pakai singkat (detail ada di SETUP.md):
 * 1. Buat Google Sheet baru.
 * 2. Extensions > Apps Script, hapus isi default, tempel file ini.
 * 3. Pilih fungsi "setupSheets" di dropdown atas, klik Run (sekali saja).
 * 4. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 * 5. Salin Web App URL ke index.html (APPS_SCRIPT_URL).
 * ============================================================
 */

const SHEET_NAMES = {
  KATEGORI: 'MasterKategori',
  ZONA: 'MasterZona',
  ADMIN: 'Administrator',
  CHECKLIST: 'Checklist',
  TEMUAN: 'Temuan'
};

const PHOTO_FOLDER_NAME = 'Checklist DPD - Foto Temuan';

/* ================== ROUTER ================== */

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case 'masterKategori': result = getMasterKategori(); break;
      case 'masterZona': result = getMasterZona(); break;
      case 'dashboard': result = getDashboard(); break;
      case 'temuan': result = getTemuanList(e.parameter.from, e.parameter.to, e.parameter.zona); break;
      case 'temuanLatest': result = getTemuanLatest(e.parameter.from, e.parameter.to, e.parameter.zona); break;
      case 'adminLogin': result = adminLogin(e.parameter.username, e.parameter.password); break;
      case 'trend': result = getTrend(e.parameter.weeks); break;
      default: result = { error: 'Unknown action: ' + action };
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    let result;
    switch (body.action) {
      case 'submitInspection': result = submitInspection(body); break;
      case 'verifyGoogleToken': result = verifyGoogleToken(body.idToken); break;
      default: result = { error: 'Unknown action: ' + body.action };
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function sheetToObjects(name) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter(r => r.join('') !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

/* ================== MASTER DATA ================== */

function getMasterKategori() {
  return sheetToObjects(SHEET_NAMES.KATEGORI);
}

function getMasterZona() {
  return sheetToObjects(SHEET_NAMES.ZONA);
}

/* ================== LOGIN ================== */

function adminLogin(username, password) {
  const admins = sheetToObjects(SHEET_NAMES.ADMIN);
  const found = admins.find(
    a => String(a.Username).toLowerCase() === String(username || '').toLowerCase() &&
         String(a.Password) === String(password || '')
  );
  if (found) return { ok: true, nama: found.Nama || found.Username };
  return { ok: false, message: 'Username atau password salah' };
}

function verifyGoogleToken(idToken) {
  if (!idToken) return { ok: false };
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) return { ok: false };
  const data = JSON.parse(res.getContentText());
  return { ok: true, email: data.email, name: data.name, picture: data.picture };
}

/* ================== SUBMIT PEMERIKSAAN (checklist rak + temuan sekaligus) ================== */

function submitInspection(body) {
  const chSheet = sheet(SHEET_NAMES.CHECKLIST);
  const now = new Date();
  (body.racks || []).forEach(r => {
    chSheet.appendRow([now, body.zona, body.line, r.rak, r.status, body.petugas || '']);
  });

  const tSheet = sheet(SHEET_NAMES.TEMUAN);
  const items = body.temuanItems || [];
  items.forEach(item => {
    let fotoUrl = '';
    if (item.fotoBase64) {
      fotoUrl = savePhoto(item.fotoBase64, item.fotoName || 'foto.jpg');
    }
    tSheet.appendRow([
      now, item.zona, item.line, item.rak, item.shelf,
      item.kategori, item.subKategori, item.catatan || '', fotoUrl,
      body.petugas || '', 'open'
    ]);
  });

  return { ok: true, checklistCount: (body.racks || []).length, temuanCount: items.length };
}

function savePhoto(base64, filename) {
  const folder = getOrCreateFolder(PHOTO_FOLDER_NAME);
  const parts = base64.split(',');
  const match = parts[0].match(/data:(.*);base64/);
  const contentType = match ? match[1] : 'image/jpeg';
  const bytes = Utilities.base64Decode(parts[1]);
  const blob = Utilities.newBlob(bytes, contentType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Format thumbnail lebih konsisten tampil sebagai <img> dibanding /uc?id=
  // (uc?id= sering diblok kalau diakses lintas origin / dianggap "download").
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w600';
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

/* ================== DETAIL TEMUAN (dengan filter tanggal & zona) ================== */

function getTemuanList(from, to, zonaFilter) {
  let rows = sheetToObjects(SHEET_NAMES.TEMUAN);
  if (from) {
    const f = new Date(from);
    rows = rows.filter(r => new Date(r.Timestamp) >= f);
  }
  if (to) {
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    rows = rows.filter(r => new Date(r.Timestamp) <= t);
  }
  if (zonaFilter) rows = rows.filter(r => String(r.Zona) === String(zonaFilter));
  rows.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  return rows;
}

/* ================== TEMUAN LATEST (dedup by Line+Rak+Shelf, latest wins) ================== */

function getTemuanLatest(from, to, zonaFilter) {
  const all = getTemuanList(from, to, zonaFilter);
  const latest = {};
  all.forEach(r => {
    const key = (r.Line || '') + '|' + (r.Rak || '') + '|' + (r.Shelf || '');
    if (!latest[key] || new Date(r.Timestamp) > new Date(latest[key].Timestamp)) {
      latest[key] = r;
    }
  });
  const result = Object.values(latest);
  result.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  return result;
}

/* ================== DASHBOARD ================== */

function getDashboard() {
  const zonaMaster = sheetToObjects(SHEET_NAMES.ZONA);
  const totalRakMaster = zonaMaster.length;
  const checklist = sheetToObjects(SHEET_NAMES.CHECKLIST);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recent = checklist.filter(c => new Date(c.Timestamp) >= weekAgo);

  // ambil status TERBARU per rak (zona+line+rak) dalam 7 hari terakhir
  const latestByKey = {};
  recent.forEach(c => {
    const key = c.Zona + '|' + c.Line + '|' + c.Rak;
    if (!latestByKey[key] || new Date(c.Timestamp) > new Date(latestByKey[key].Timestamp)) {
      latestByKey[key] = c;
    }
  });
  const checkedList = Object.values(latestByKey);
  const okCount = checkedList.filter(c => c.Status === 'OK').length;
  const nokCount = checkedList.filter(c => c.Status === 'NOK').length;
  const checkedCount = checkedList.length;
  const compliance = checkedCount ? Math.round((okCount / checkedCount) * 100) : 0;
  const pendingCount = Math.max(totalRakMaster - checkedCount, 0);

  const zonaStats = {};
  checkedList.forEach(c => {
    if (!zonaStats[c.Zona]) zonaStats[c.Zona] = { zona: c.Zona, ok: 0, nok: 0 };
    if (c.Status === 'OK') zonaStats[c.Zona].ok++;
    else zonaStats[c.Zona].nok++;
  });
  const zoneTable = Object.values(zonaStats).map(z => ({
    zona: z.zona,
    ok: z.ok,
    nok: z.nok,
    total: z.ok + z.nok,
    compliance: z.ok + z.nok ? Math.round((z.ok / (z.ok + z.nok)) * 100) : 0
  }));
  zoneTable.sort((a, b) => b.compliance - a.compliance);

  const bestZone = zoneTable.length ? zoneTable[0] : null;
  const worstZone = zoneTable.length ? zoneTable[zoneTable.length - 1] : null;

  return { compliance, okCount, nokCount, checkedCount, pendingCount, totalRakMaster, bestZone, worstZone, zoneTable };
}

/* ================== TREND (kepatuhan N minggu terakhir) ================== */

function getTrend(weeksParam) {
  const weeks = Math.max(2, Math.min(12, parseInt(weeksParam, 10) || 4));
  const checklist = sheetToObjects(SHEET_NAMES.CHECKLIST);
  const now = new Date();
  const result = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rowsInWeek = checklist.filter(c => {
      const t = new Date(c.Timestamp);
      return t >= weekStart && t <= weekEnd;
    });

    // status TERBARU per rak (zona+line+rak) dalam window minggu itu
    const latestByKey = {};
    rowsInWeek.forEach(c => {
      const key = c.Zona + '|' + c.Line + '|' + c.Rak;
      if (!latestByKey[key] || new Date(c.Timestamp) > new Date(latestByKey[key].Timestamp)) {
        latestByKey[key] = c;
      }
    });
    const checkedList = Object.values(latestByKey);
    const okCount = checkedList.filter(c => c.Status === 'OK').length;
    const checkedCount = checkedList.length;
    const compliance = checkedCount ? Math.round((okCount / checkedCount) * 100) : 0;

    result.push({
      weekLabel: i === 0 ? 'Minggu Ini' : `-${i}mgg`,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      compliance: compliance,
      checkedCount: checkedCount
    });
  }
  return result;
}

/* ================== SETUP AWAL (jalankan sekali dari editor Apps Script) ================== */

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- MasterKategori ---
  let sh = ss.getSheetByName(SHEET_NAMES.KATEGORI) || ss.insertSheet(SHEET_NAMES.KATEGORI);
  sh.clear();
  sh.appendRow(['Kategori', 'SubKategori']);
  [
    ['Kerapihan', 'Beam Bangkok'],
    ['Kerapihan', 'Beam Tanpa Lubang Kabel'],
    ['Kerapihan', 'Rail Cover Hilang'],
    ['Kebersihan', 'Noda / Kotor'],
    ['Kebersihan', 'Tempel Stiker'],
    ['Kebersihan', 'Lain - lain']
  ].forEach(r => sh.appendRow(r));

  // --- MasterZona ---
  sh = ss.getSheetByName(SHEET_NAMES.ZONA) || ss.insertSheet(SHEET_NAMES.ZONA);
  sh.clear();
  sh.appendRow(['Zona', 'Line', 'Rak', 'Shelf']);
  const layout = {
    9: { AB: {r:7, s:5}, AC: {r:7, s:5} },
    10: { AD: {r:7, s:5}, AE: {r:7, s:5} },
    11: { AF: {r:7, s:5}, AG: {r:7, s:5}, AH: {r:7, s:5}, AI: {r:7, s:5} },
    12: { AJ: {r:7, s:5}, AK: {r:6, s:5}, AL: {r:6, s:5}, AM: {r:7, s:5} },
    13: { AN: {r:7, s:5}, AO: {r:6, s:5}, AP: {r:7, s:5}, AQ: {r:7, s:5} },
    14: { AZ: {r:7, s:5}, BA: {r:7, s:5}, BB: {r:7, s:5}, BC: {r:7, s:5}, BD: {r:7, s:5}, BE: {r:7, s:5} },
    15: { BF: {r:7, s:5}, BG: {r:7, s:5}, BH: {r:7, s:5}, BI: {r:7, s:5}, BJ: {r:7, s:5}, BK: {r:7, s:5} }
  };
  const rows = [];
  Object.keys(layout).forEach(zona => {
    Object.keys(layout[zona]).forEach(line => {
      const cfg = layout[zona][line];
      const rackCount = typeof cfg === 'object' ? cfg.r : cfg;
      const shelfCount = typeof cfg === 'object' ? (cfg.s || 5) : 5;
      for (let rak = 1; rak <= rackCount; rak++) {
        for (let shelf = 1; shelf <= shelfCount; shelf++) {
          rows.push([Number(zona), line, rak, shelf]);
        }
      }
    });
  });
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);

  // --- Administrator ---
  sh = ss.getSheetByName(SHEET_NAMES.ADMIN) || ss.insertSheet(SHEET_NAMES.ADMIN);
  sh.clear();
  sh.appendRow(['Username', 'Password', 'Nama']);
  sh.appendRow(['admin', 'admin123', 'Administrator']);

  // --- Checklist (log status rak per pemeriksaan) ---
  sh = ss.getSheetByName(SHEET_NAMES.CHECKLIST) || ss.insertSheet(SHEET_NAMES.CHECKLIST);
  sh.clear();
  sh.appendRow(['Timestamp', 'Zona', 'Line', 'Rak', 'Status', 'Petugas']);

  // --- Temuan ---
  sh = ss.getSheetByName(SHEET_NAMES.TEMUAN) || ss.insertSheet(SHEET_NAMES.TEMUAN);
  sh.clear();
  sh.appendRow(['Timestamp', 'Zona', 'Line', 'Rak', 'Shelf', 'Kategori', 'SubKategori', 'Catatan', 'FotoURL', 'Petugas', 'Status']);

  SpreadsheetApp.getUi().alert('Setup selesai! Semua sheet & data master sudah dibuat.\nAkun admin default: admin / admin123 (segera ganti).');
}
