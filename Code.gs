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
  KATEGORI: "MasterKategori",
  ZONA: "MasterZona",
  ADMIN: "Administrator",
  CHECKLIST: "Checklist",
  TEMUAN: "Temuan",
};

const PHOTO_FOLDER_NAME = "Checklist DPD - Foto Temuan";

/* ================== ROUTER ================== */

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case "masterKategori":
        result = getMasterKategori();
        break;
      case "masterZona":
        result = getMasterZona();
        break;
      case "dashboard":
        result = getDashboard();
        break;
      case "temuan":
        result = getTemuanList(
          e.parameter.from,
          e.parameter.to,
          e.parameter.zona,
        );
        break;
      case "temuanLatest":
        result = getTemuanLatest(
          e.parameter.from,
          e.parameter.to,
          e.parameter.zona,
        );
        break;
      case "adminLogin":
        result = adminLogin(e.parameter.username, e.parameter.password);
        break;
      case "trend":
        result = getTrend(e.parameter.weeks);
        break;
      default:
        result = { error: "Unknown action: " + action };
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
      case "submitInspection":
        result = submitInspection(body);
        break;
      case "verifyGoogleToken":
        result = verifyGoogleToken(body.idToken);
        break;
      default:
        result = { error: "Unknown action: " + body.action };
    }
    return jsonOut(result);
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function sheetToObjects(name) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values
    .filter((r) => r.join("") !== "")
    .map((row) => {
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
    (a) =>
      String(a.Username).toLowerCase() ===
        String(username || "").toLowerCase() &&
      String(a.Password) === String(password || ""),
  );
  if (found) return { ok: true, nama: found.Nama || found.Username };
  return { ok: false, message: "Username atau password salah" };
}

function verifyGoogleToken(idToken) {
  if (!idToken) return { ok: false };
  const res = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" +
      encodeURIComponent(idToken),
    { muteHttpExceptions: true },
  );
  if (res.getResponseCode() !== 200) return { ok: false };
  const data = JSON.parse(res.getContentText());
  return {
    ok: true,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}

/* ================== SUBMIT PEMERIKSAAN (checklist rak + temuan sekaligus) ================== */

function submitInspection(body) {
  const chSheet = sheet(SHEET_NAMES.CHECKLIST);
  const tSheet = sheet(SHEET_NAMES.TEMUAN);
  const zSheet = sheet(SHEET_NAMES.ZONA);

  const now = new Date();

  // Generate Base Docno — format: DPDddmmYYYY + running number per day
  // Date is in WIB (UTC+7): adjust from server UTC
  const nowWIB = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const d = String(nowWIB.getUTCDate()).padStart(2, "0");
  const m = String(nowWIB.getUTCMonth() + 1).padStart(2, "0");
  const y = nowWIB.getUTCFullYear();
  const dateStr = "DPD" + d + m + y;

  // Scan ALL rows in Checklist to find the highest increment for today.
  // More reliable than just checking the last row.
  let lastInc = 0;
  const allChecklistData = chSheet.getDataRange().getValues();
  for (let i = 1; i < allChecklistData.length; i++) {
    const existingDocno = String(allChecklistData[i][0]);
    if (existingDocno.startsWith(dateStr)) {
      const inc = parseInt(existingDocno.replace(dateStr, ""), 10) || 0;
      if (inc > lastInc) lastInc = inc;
    }
  }

  // Pre-load MasterZona for fast update
  const zData = zSheet.getDataRange().getValues();
  const zMap = {};
  for (let i = 1; i < zData.length; i++) {
    const key = `${zData[i][0]}|${zData[i][1]}|${zData[i][2]}|${zData[i][3]}`;
    zMap[key] = i;
  }

  const zUpdates = [];

  let currentInc = lastInc;
  const items = body.temuanItems || [];

  (body.racks || []).forEach((r) => {
    currentInc++;
    const docno = dateStr + currentInc;

    let kondisi = "BAIK";
    if (r.status === "NOK") {
      const foundItem = items.find(
        (i) =>
          String(i.rak) === String(r.rak) &&
          String(i.shelf) === String(r.shelf),
      );
      if (foundItem) {
        kondisi = foundItem.subKategori || "Terdapat Temuan";
        foundItem._docno = docno; // Match temuan Docno
      } else {
        kondisi = "Terdapat Temuan";
      }
    }

    chSheet.appendRow([
      docno,
      now,
      body.zona,
      body.line,
      r.rak,
      r.shelf,
      r.status,
      kondisi,
      body.petugas || "",
    ]);

    // update KondisiShelf in MasterZona
    const zKey = `${body.zona}|${body.line}|${r.rak}|${r.shelf}`;
    if (zMap[zKey] !== undefined) {
      zUpdates.push({ row: zMap[zKey] + 1, status: r.status }); // +1 for 1-based indexing in sheet
    }
  });

  items.forEach((item) => {
    let fotoUrl = "";
    if (item.fotoBase64) {
      fotoUrl = savePhoto(item.fotoBase64, item.fotoName || "foto.jpg");
    }
    tSheet.appendRow([
      item._docno || dateStr + currentInc,
      now,
      item.zona,
      item.line,
      item.rak,
      item.shelf,
      item.kategori,
      item.subKategori,
      item.catatan || "",
      body.petugas || "",
      "open",
      fotoUrl,
    ]);
  });

  // Apply MasterZona updates (doing it cell by cell might be slow, but is simplest)
  zUpdates.forEach((u) => {
    zSheet.getRange(u.row, 5).setValue(u.status);
  });

  return {
    ok: true,
    checklistCount: (body.racks || []).length,
    temuanCount: items.length,
  };
}

function savePhoto(base64, filename) {
  const folder = getOrCreateFolder(PHOTO_FOLDER_NAME);
  const parts = base64.split(",");
  const match = parts[0].match(/data:(.*);base64/);
  const contentType = match ? match[1] : "image/jpeg";
  const bytes = Utilities.base64Decode(parts[1]);
  const blob = Utilities.newBlob(bytes, contentType, filename);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Format thumbnail lebih konsisten tampil sebagai <img> dibanding /uc?id=
  // (uc?id= sering diblok kalau diakses lintas origin / dianggap "download").
  return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w600";
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

/* ================== DETAIL TEMUAN (dengan filter tanggal & zona) ================== */

function getTemuanList(from, to, zonaFilter) {
  let rows = sheetToObjects(SHEET_NAMES.TEMUAN);

  // Helper: parse a date string sent from frontend (local time WIB, UTC+7) into a Date.
  // When the frontend sends "2026-09-22T00:00:00" without timezone info,
  // Apps Script parses it as UTC, which is 7 hours ahead of WIB.
  // We compensate by subtracting 7 hours from the parsed UTC date
  // so the filter window matches the user's local (WIB) day.
  function parseLocal(str) {
    if (!str) return null;
    const d = new Date(str);
    // If string has no timezone offset info (no Z, no +/-), treat as WIB (UTC+7)
    if (!/[Zz]|[+-]\d{2}:\d{2}/.test(str)) {
      return new Date(d.getTime() - 7 * 60 * 60 * 1000);
    }
    return d;
  }

  if (from) {
    const f = parseLocal(from);
    if (f) rows = rows.filter((r) => new Date(r.Timestamp) >= f);
  }
  if (to) {
    const t = parseLocal(to);
    if (t) rows = rows.filter((r) => new Date(r.Timestamp) <= t);
  }
  if (zonaFilter)
    rows = rows.filter((r) => String(r.Zona) === String(zonaFilter));
  rows.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
  return rows;
}

/* ================== TEMUAN LATEST (dedup by Line+Rak+Shelf, latest wins) ================== */

function getTemuanLatest(from, to, zonaFilter) {
  const all = getTemuanList(from, to, zonaFilter);
  const latest = {};
  all.forEach((r) => {
    const key = (r.Line || "") + "|" + (r.Rak || "") + "|" + (r.Shelf || "");
    if (
      !latest[key] ||
      new Date(r.Timestamp) > new Date(latest[key].Timestamp)
    ) {
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
  const totalShelfMaster = zonaMaster.length;

  let okCount = 0;
  let nokCount = 0;

  const zonaStats = {};

  zonaMaster.forEach((z) => {
    if (!zonaStats[z.Zona])
      zonaStats[z.Zona] = { zona: z.Zona, ok: 0, nok: 0, total: 0 };
    zonaStats[z.Zona].total++;

    if (
      z.KondisiShelf === "OK" ||
      String(z.KondisiShelf).toUpperCase() === "OK"
    ) {
      okCount++;
      zonaStats[z.Zona].ok++;
    } else if (
      z.KondisiShelf === "NOK" ||
      String(z.KondisiShelf).toUpperCase() === "NOK"
    ) {
      nokCount++;
      zonaStats[z.Zona].nok++;
    }
  });

  const checkedCount = okCount + nokCount;
  const compliance = checkedCount
    ? Math.round((okCount / checkedCount) * 100)
    : 0;

  // ── Pending Review: hitung sisa shelf yang BELUM diperiksa hari ini (WIB) ──
  // "Hari ini" mengacu ke tanggal lokal WIB (UTC+7), bukan UTC server.
  const nowWIB = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);
  const startOfDayWIB = new Date(
    Date.UTC(nowWIB.getUTCFullYear(), nowWIB.getUTCMonth(), nowWIB.getUTCDate(), 0, 0, 0) - 7 * 60 * 60 * 1000
  );

  const checklist = sheetToObjects(SHEET_NAMES.CHECKLIST);
  const checkedTodayKeys = new Set();
  const activeZonesTodaySet = new Set();

  checklist.forEach((c) => {
    if (new Date(c.Timestamp) >= startOfDayWIB) {
      // Key unik per shelf yang sudah diperiksa hari ini
      const key = `${c.Zona}|${c.Line}|${c.Rak}|${c.Shelf}`;
      checkedTodayKeys.add(key);
      activeZonesTodaySet.add(c.Zona);
    }
  });

  // Hitung shelf di MasterZona yang belum ada di checkedTodayKeys
  let pendingCount = 0;
  zonaMaster.forEach((z) => {
    const key = `${z.Zona}|${z.Line}|${z.Rak}|${z.Shelf}`;
    if (!checkedTodayKeys.has(key)) pendingCount++;
  });

  const activeZonesToday = [...activeZonesTodaySet].sort((a, b) => a - b);

  const zoneTable = Object.values(zonaStats).map((z) => ({
    zona: z.zona,
    ok: z.ok,
    nok: z.nok,
    total: z.ok + z.nok,
    compliance: z.ok + z.nok ? Math.round((z.ok / (z.ok + z.nok)) * 100) : 0,
  }));
  zoneTable.sort((a, b) => b.compliance - a.compliance);

  const bestZone = zoneTable.length ? zoneTable[0] : null;
  const worstZone = zoneTable.length ? zoneTable[zoneTable.length - 1] : null;

  return {
    compliance,
    okCount,
    nokCount,
    checkedCount,
    pendingCount,
    totalShelfMaster,
    bestZone,
    worstZone,
    zoneTable,
    activeZonesToday,
  };
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

    const rowsInWeek = checklist.filter((c) => {
      const t = new Date(c.Timestamp);
      return t >= weekStart && t <= weekEnd;
    });

    // status TERBARU per SHELF (zona+line+rak+shelf) dalam window minggu itu
    const latestByKey = {};
    rowsInWeek.forEach((c) => {
      const key = c.Zona + "|" + c.Line + "|" + c.Rak + "|" + c.Shelf;
      if (
        !latestByKey[key] ||
        new Date(c.Timestamp) > new Date(latestByKey[key].Timestamp)
      ) {
        latestByKey[key] = c;
      }
    });
    const checkedList = Object.values(latestByKey);
    const okCount = checkedList.filter((c) => c.Status === "OK").length;
    const checkedCount = checkedList.length;
    const compliance = checkedCount
      ? Math.round((okCount / checkedCount) * 100)
      : 0;

    result.push({
      weekLabel: i === 0 ? "Minggu Ini" : `-${i}mgg`,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      compliance: compliance,
      checkedCount: checkedCount,
    });
  }
  return result;
}

/* ================== SETUP AWAL (jalankan sekali dari editor Apps Script) ================== */

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- MasterKategori ---
  let sh =
    ss.getSheetByName(SHEET_NAMES.KATEGORI) ||
    ss.insertSheet(SHEET_NAMES.KATEGORI);
  sh.clear();
  sh.appendRow(["Kategori", "SubKategori"]);
  [
    ["Kerapihan", "Beam Bangkok"],
    ["Kerapihan", "Beam Tanpa Lubang Kabel"],
    ["Kerapihan", "Rail Cover Hilang"],
    ["Kebersihan", "Noda / Kotor"],
    ["Kebersihan", "Tempel Stiker"],
    ["Kebersihan", "Lain - lain"],
  ].forEach((r) => sh.appendRow(r));

  // --- MasterZona ---
  sh = ss.getSheetByName(SHEET_NAMES.ZONA) || ss.insertSheet(SHEET_NAMES.ZONA);
  sh.clear();
  sh.appendRow(["Zona", "Line", "Rak", "Shelf", "KondisiShelf"]);
  const layout = {
    9: { AB: { r: 7, s: 5 }, AC: { r: 7, s: 5 } },
    10: { AD: { r: 7, s: 5 }, AE: { r: 7, s: 5 } },
    11: {
      AF: { r: 7, s: 5 },
      AG: { r: 7, s: 5 },
      AH: { r: 7, s: 5 },
      AI: { r: 7, s: 5 },
    },
    12: {
      AJ: { r: 7, s: 5 },
      AK: { r: 6, s: 5 },
      AL: { r: 6, s: 5 },
      AM: { r: 7, s: 5 },
    },
    13: {
      AN: { r: 7, s: 5 },
      AO: { r: 6, s: 5 },
      AP: { r: 7, s: 5 },
      AQ: { r: 7, s: 5 },
    },
    14: {
      AZ: { r: 7, s: 5 },
      BA: { r: 7, s: 5 },
      BB: { r: 7, s: 5 },
      BC: { r: 7, s: 5 },
      BD: { r: 7, s: 5 },
      BE: { r: 7, s: 5 },
    },
    15: {
      BF: { r: 7, s: 5 },
      BG: { r: 7, s: 5 },
      BH: { r: 7, s: 5 },
      BI: { r: 7, s: 5 },
      BJ: { r: 7, s: 5 },
      BK: { r: 7, s: 5 },
    },
  };
  const rows = [];
  Object.keys(layout).forEach((zona) => {
    Object.keys(layout[zona]).forEach((line) => {
      const cfg = layout[zona][line];
      const rackCount = typeof cfg === "object" ? cfg.r : cfg;
      const shelfCount = typeof cfg === "object" ? cfg.s || 5 : 5;
      for (let rak = 1; rak <= rackCount; rak++) {
        for (let shelf = 1; shelf <= shelfCount; shelf++) {
          rows.push([Number(zona), line, rak, shelf, "OK"]);
        }
      }
    });
  });
  if (rows.length) sh.getRange(2, 1, rows.length, 5).setValues(rows);

  // --- Administrator ---
  sh =
    ss.getSheetByName(SHEET_NAMES.ADMIN) || ss.insertSheet(SHEET_NAMES.ADMIN);
  sh.clear();
  sh.appendRow(["Username", "Password", "Nama"]);
  sh.appendRow(["admin", "admin123", "Administrator"]);

  // --- Checklist (log status rak per pemeriksaan) ---
  sh =
    ss.getSheetByName(SHEET_NAMES.CHECKLIST) ||
    ss.insertSheet(SHEET_NAMES.CHECKLIST);
  sh.clear();
  sh.appendRow([
    "Docno",
    "Timestamp",
    "Zona",
    "Line",
    "Rak",
    "Shelf",
    "Status",
    "Kondisi",
    "Petugas",
  ]);

  // --- Temuan ---
  sh =
    ss.getSheetByName(SHEET_NAMES.TEMUAN) || ss.insertSheet(SHEET_NAMES.TEMUAN);
  sh.clear();
  sh.appendRow([
    "Docno",
    "Timestamp",
    "Zona",
    "Line",
    "Rak",
    "Shelf",
    "Kategori",
    "SubKategori",
    "Catatan",
    "Petugas",
    "Status",
    "FotoURL",
  ]);

  SpreadsheetApp.getUi().alert(
    "Setup selesai! Semua sheet & data master sudah dibuat.\nAkun admin default: admin / admin123 (segera ganti).",
  );
}

/* ================== UPDATE SCHEMA (jalankan sekali) ================== */
function updateSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sh = ss.getSheetByName(SHEET_NAMES.CHECKLIST);
  if (sh)
    sh.getRange(1, 1, 1, 9).setValues([
      [
        "Docno",
        "Timestamp",
        "Zona",
        "Line",
        "Rak",
        "Shelf",
        "Status",
        "Kondisi",
        "Petugas",
      ],
    ]);

  sh = ss.getSheetByName(SHEET_NAMES.TEMUAN);
  if (sh)
    sh.getRange(1, 1, 1, 12).setValues([
      [
        "Docno",
        "Timestamp",
        "Zona",
        "Line",
        "Rak",
        "Shelf",
        "Kategori",
        "SubKategori",
        "Catatan",
        "Petugas",
        "Status",
        "FotoURL",
      ],
    ]);

  sh = ss.getSheetByName(SHEET_NAMES.ZONA);
  if (sh) {
    const data = sh.getDataRange().getValues();
    if (data[0].indexOf("KondisiShelf") === -1) {
      sh.getRange(1, 5).setValue("KondisiShelf");
      if (data.length > 1) {
        const okValues = Array(data.length - 1).fill(["OK"]);
        sh.getRange(2, 5, data.length - 1, 1).setValues(okValues);
      }
    }
  }
  SpreadsheetApp.getUi().alert("Schema updated! Refresh your spreadsheet.");
}

/* ================== MIGRATE DOCNO (jalankan SEKALI untuk data lama) ================== */
/**
 * Otomatis mengisi kolom Docno yang masih kosong pada sheet Checklist dan Temuan,
 * berdasarkan Timestamp masing-masing baris.
 * Format: DPDddmmYYYY + running number per tanggal
 *
 * AMAN dijalankan berkali-kali — baris yang sudah ada Docno-nya tidak akan diubah.
 * Jalankan dari editor Apps Script: pilih "migrateDocno" di dropdown lalu klik Run.
 */
function migrateDocno() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Helper: format tanggal jadi prefix Docno dalam WIB (UTC+7)
  function toDateStr(timestamp) {
    const dateUTC = new Date(timestamp);
    const wib = new Date(dateUTC.getTime() + 7 * 60 * 60 * 1000);
    const dd = String(wib.getUTCDate()).padStart(2, "0");
    const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = wib.getUTCFullYear();
    return "DPD" + dd + mm + yyyy;
  }

  // --- Proses sheet Checklist ---
  // Header: Docno(1) | Timestamp(2) | Zona(3) | Line(4) | Rak(5) | Shelf(6) | Status(7) | Kondisi(8) | Petugas(9)
  const chSh = ss.getSheetByName(SHEET_NAMES.CHECKLIST);
  if (chSh) {
    const chData = chSh.getDataRange().getValues();
    // Kelompokkan baris kosong berdasarkan tanggal, isi increment per tanggal
    // Kita juga perlu tahu increment tertinggi yg sudah ada di sheet untuk tiap tanggal
    const existingMaxByDate = {};
    for (let i = 1; i < chData.length; i++) {
      const docno = String(chData[i][0]).trim();
      if (docno !== "" && docno !== "undefined") {
        // Cari prefix tanggal (14 karakter: DPD + 2+2+4 = 11 char)
        const match = docno.match(/^(DPD\d{8})(\d+)$/);
        if (match) {
          const prefix = match[1];
          const inc = parseInt(match[2], 10) || 0;
          if (!existingMaxByDate[prefix] || inc > existingMaxByDate[prefix]) {
            existingMaxByDate[prefix] = inc;
          }
        }
      }
    }

    // Isi baris yang Docno-nya kosong, urut dari atas ke bawah
    const chUpdates = [];
    for (let i = 1; i < chData.length; i++) {
      const docno = String(chData[i][0]).trim();
      if (docno === "" || docno === "undefined") {
        const timestamp = chData[i][1]; // kolom Timestamp
        if (!timestamp) continue;
        const prefix = toDateStr(timestamp);
        if (!existingMaxByDate[prefix]) existingMaxByDate[prefix] = 0;
        existingMaxByDate[prefix]++;
        chUpdates.push({
          row: i + 1,
          docno: prefix + existingMaxByDate[prefix],
        });
      }
    }
    chUpdates.forEach((u) => chSh.getRange(u.row, 1).setValue(u.docno));
    Logger.log("Checklist: " + chUpdates.length + " baris Docno diisi.");
  }

  // --- Proses sheet Temuan ---
  // Header: Docno(1) | Timestamp(2) | Zona(3) | Line(4) | Rak(5) | Shelf(6) | ...
  // Kita JODOHKAN data Temuan dengan data Checklist berdasarkan Timestamp & Lokasi.
  // Dengan begitu Temuan dan Checklist yang disubmit bersamaan akan punya Docno yang SAMA.
  const tSh = ss.getSheetByName(SHEET_NAMES.TEMUAN);
  if (tSh && chSh) {
    const tData = tSh.getDataRange().getValues();
    const chData = chSh.getDataRange().getValues();

    // Buat kamus (dictionary) dari Checklist untuk pencarian cepat
    // Key: "Timestamp_getTime()|Zona|Line|Rak|Shelf" => Docno
    const chMap = {};
    for (let i = 1; i < chData.length; i++) {
      const doc = String(chData[i][0]).trim();
      const ts = new Date(chData[i][1]).getTime();
      const z = String(chData[i][2]).trim();
      const l = String(chData[i][3]).trim();
      const r = String(chData[i][4]).trim();
      const s = String(chData[i][5]).trim();
      chMap[`${ts}|${z}|${l}|${r}|${s}`] = doc;
    }

    const tUpdates = [];
    for (let i = 1; i < tData.length; i++) {
      const currentDocno = String(tData[i][0]).trim();
      const ts = new Date(tData[i][1]).getTime();
      const z = String(tData[i][2]).trim();
      const l = String(tData[i][3]).trim();
      const r = String(tData[i][4]).trim();
      const s = String(tData[i][5]).trim();

      const key = `${ts}|${z}|${l}|${r}|${s}`;
      const matchingChecklistDocno = chMap[key];

      // Jika docno Temuan saat ini BERBEDA dengan docno Checklist-nya, perbaiki!
      // Ini juga memperbaiki docno yang sebelumnya sempat di-generate salah.
      if (matchingChecklistDocno && currentDocno !== matchingChecklistDocno) {
        tUpdates.push({ row: i + 1, docno: matchingChecklistDocno });
      }
    }

    // Update batch (opsional, tapi pakai forEach cukup)
    tUpdates.forEach((u) => tSh.getRange(u.row, 1).setValue(u.docno));
    Logger.log(
      "Temuan: " +
        tUpdates.length +
        " baris Docno diperbaiki disamakan dengan Checklist.",
    );
  }

  Logger.log(
    "Migrasi & Sinkronisasi Docno selesai!\n\n" +
      "Semua Docno Temuan kini sudah dicocokkan (dijodohkan) dengan Docno Checklist yang sesuai.",
  );
}

/* ================== MIGRATE KONDISI (Jalankan SEKALI) ================== */
/**
 * Otomatis mengisi kolom 'Kondisi' di sheet Checklist yang masih kosong.
 * Jika Status = 'OK', maka diisi 'BAIK'.
 * Jika Status = 'NOK', maka akan mengambil 'SubKategori' dari sheet Temuan berdasarkan Docno.
 */
function migrateKondisi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const chSh = ss.getSheetByName(SHEET_NAMES.CHECKLIST);
  const tSh = ss.getSheetByName(SHEET_NAMES.TEMUAN);
  
  if (!chSh) return;
  
  const chData = chSh.getDataRange().getValues();
  const tData = tSh ? tSh.getDataRange().getValues() : [];
  
  // Buat mapping Docno => SubKategori dari sheet Temuan
  const tMap = {};
  for (let i = 1; i < tData.length; i++) {
    const docno = String(tData[i][0]).trim();
    // Kolom SubKategori ada di index 7 (kolom H)
    const subKat = String(tData[i][7] || '').trim();
    if (docno) {
      tMap[docno] = subKat || 'Terdapat Temuan';
    }
  }

  const updates = [];
  for (let i = 1; i < chData.length; i++) {
    const docno = String(chData[i][0]).trim();
    const status = String(chData[i][6]).trim().toUpperCase(); // Kolom Status (index 6 / G)
    const kondisi = String(chData[i][7] || '').trim(); // Kolom Kondisi (index 7 / H)
    
    if (kondisi === '') {
      let kondisiBaru = '';
      if (status === 'OK') {
        kondisiBaru = 'BAIK';
      } else if (status === 'NOK') {
        kondisiBaru = tMap[docno] || 'Terdapat Temuan';
      }
      
      if (kondisiBaru) {
        updates.push({ row: i + 1, val: kondisiBaru });
      }
    }
  }
  
  // Update cell satu per satu untuk baris yang kosong
  updates.forEach(u => chSh.getRange(u.row, 8).setValue(u.val));
  
  Logger.log('Migrasi Kondisi selesai! Berhasil mengisi ' + updates.length + ' baris.');
}
